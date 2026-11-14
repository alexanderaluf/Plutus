import type { SQLiteDatabase } from "expo-sqlite";

import { LOCAL_SCHEMA_VERSION, type BackupDocument } from "../model/backup-document";
import { createDefaultBackup } from "../model/default-backup";
import {
  normalizeBackupDocument,
  parseStoredDocument,
} from "../model/normalize-backup";
import { getSetupStatus } from "../model/onboarding";
import { triggerNativePartitionSync } from "./fast-store-client";
import { syncSqliteMonthIndexes, type SyncIndexResult } from "./month-index";

export const DATABASE_VERSION = 25;
export const STORAGE_RECOVERY_MESSAGE =
  "Your saved data could not be opened safely. Nothing has been reset. Keep this installation and export a recovery copy before seeking help.";

async function applyRuntimePragmas(database: SQLiteDatabase) {
  await database.execAsync(
    "PRAGMA journal_mode = WAL; PRAGMA foreign_keys = ON; PRAGMA synchronous = NORMAL; PRAGMA temp_store = MEMORY; PRAGMA cache_size = -4000;",
  );
  try {
    await database.execAsync("PRAGMA mmap_size = 16777216;");
  } catch {
    // Some SQLite builds reject or ignore mmap_size; safe to continue without mmap.
  }
}

async function verifyFastCurrentDatabase(
  database: SQLiteDatabase,
): Promise<boolean> {
  try {
    const docMeta = await database.getFirstAsync<{
      schema_version: number;
      updated_at: string;
      doc_bytes: number;
      valid_json: number;
      user_count: number | null;
    }>(
      `SELECT schema_version,
              updated_at,
              length(document_json) AS doc_bytes,
              json_valid(document_json) AS valid_json,
              json_array_length(document_json, '$.users') AS user_count
       FROM app_document WHERE id = 1`,
    );
    const identity = await database.getFirstAsync<{ had_profile: number }>(
      "SELECT had_profile FROM app_storage_identity WHERE id = 1",
    );
    const head = await database.getFirstAsync<{
      doc_bytes: number;
      updated_at: string;
      had_profile: number;
      schema_version: number;
    }>(
      "SELECT doc_bytes, updated_at, had_profile, schema_version FROM app_meta_head WHERE id = 1",
    );

    if (!docMeta || !identity || !head) return false;
    if (docMeta.schema_version > LOCAL_SCHEMA_VERSION) {
      throw new Error(STORAGE_RECOVERY_MESSAGE);
    }
    if (docMeta.valid_json !== 1) {
      throw new Error(STORAGE_RECOVERY_MESSAGE);
    }
    if (identity.had_profile && (docMeta.user_count ?? 0) === 0) {
      throw new Error(STORAGE_RECOVERY_MESSAGE);
    }
    if (
      docMeta.schema_version !== LOCAL_SCHEMA_VERSION ||
      head.schema_version !== LOCAL_SCHEMA_VERSION ||
      docMeta.doc_bytes !== head.doc_bytes ||
      docMeta.updated_at !== head.updated_at ||
      identity.had_profile !== head.had_profile
    ) {
      return false;
    }
    return true;
  } catch (error) {
    if (error instanceof Error && error.message === STORAGE_RECOVERY_MESSAGE) {
      throw error;
    }
    // JSON1 unavailable or head table schema mismatch -> run standard full verification.
    return false;
  }
}

/** Versions 1–16 share the same document envelope. The normalizers provide
 * additive forward migrations. Historical development reseeding is retired:
 * recognizing a sample UUID is never permission to replace user records. */
export async function migrateLocalDatabase(
  database: SQLiteDatabase,
  installationExists = false,
) {
  const version =
    (
      await database.getFirstAsync<{ user_version: number }>(
        "PRAGMA user_version",
      )
    )?.user_version ?? 0;
  if (version > DATABASE_VERSION) throw new Error(STORAGE_RECOVERY_MESSAGE);

  const tables = await database.getAllAsync<{ name: string }>(
    "SELECT name FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%'",
  );
  const hasDocument = tables.some((table) => table.name === "app_document");
  if (
    !hasDocument &&
    (version !== 0 || tables.length > 0 || installationExists)
  ) {
    throw new Error(STORAGE_RECOVERY_MESSAGE);
  }
  if (
    version >= 17 &&
    !tables.some((table) => table.name === "app_storage_identity")
  ) {
    throw new Error(STORAGE_RECOVERY_MESSAGE);
  }

  // Fast path: already at current DB version with intact index head + identity.
  const hasMonthHead =
    version === DATABASE_VERSION &&
    hasDocument &&
    tables.some((table) => table.name === "app_meta_head") &&
    tables.some((table) => table.name === "app_month_index") &&
    tables.some((table) => table.name === "tx_month_rows");

  if (hasMonthHead && (await verifyFastCurrentDatabase(database))) {
    await applyRuntimePragmas(database);
    return;
  }

  const check = await database.getFirstAsync<{ quick_check: string }>(
    "PRAGMA quick_check",
  );
  if (check?.quick_check !== "ok") throw new Error(STORAGE_RECOVERY_MESSAGE);

  await applyRuntimePragmas(database);

  let syncResult: SyncIndexResult | null = null;
  await database.withExclusiveTransactionAsync(async (transaction) => {
    let document: BackupDocument;
    let docBytes: number;
    let updatedAt = new Date().toISOString();

    if (!hasDocument) {
      await transaction.execAsync(
        "CREATE TABLE app_document (id INTEGER PRIMARY KEY NOT NULL CHECK (id = 1), schema_version INTEGER NOT NULL, document_json TEXT NOT NULL, updated_at TEXT NOT NULL);",
      );
      document = createDefaultBackup();
      const json = JSON.stringify(document);
      docBytes = json.length;
      await transaction.runAsync(
        "INSERT INTO app_document (id, schema_version, document_json, updated_at) VALUES (1, ?, ?, ?)",
        LOCAL_SCHEMA_VERSION,
        json,
        updatedAt,
      );
    } else {
      const stored = await transaction.getFirstAsync<{
        schema_version: number;
        document_json: string;
        updated_at: string;
      }>(
        "SELECT schema_version, document_json, updated_at FROM app_document WHERE id = 1",
      );
      if (!stored || stored.schema_version > LOCAL_SCHEMA_VERSION)
        throw new Error(STORAGE_RECOVERY_MESSAGE);
      // No writes before successful parse and validation.
      document = parseStoredDocument(stored.document_json);
      docBytes = stored.document_json.length;
      updatedAt = stored.updated_at;
      // Before v17 every installation was initialized with a profile. An
      // established older database cannot legitimately be a new empty install.
      if (version < 17 && document.users.length === 0)
        throw new Error(STORAGE_RECOVERY_MESSAGE);
      // Preserve the historical v5 additive account conversion without
      // replacing collections, balances, custom fields or existing metadata.
      if (
        version < 5 &&
        document.users.some((user) => user.uuid === "alex-personal")
      ) {
        document.accounts = document.accounts.map((account) => {
          if (
            account.uuid === "account-checking" &&
            account.name === "Everyday checking" &&
            account.bankName === "Northstar Bank" &&
            account.cardCompany == null &&
            account.cardLastFour == null
          )
            return {
              ...account,
              accountType: account.accountType ?? "bank",
              type: 3,
            };
          if (
            account.uuid === "account-credit" &&
            account.name === "Everyday rewards" &&
            account.cardCompany === "Mastercard"
          )
            return {
              ...account,
              linkedBankAccountId:
                account.linkedBankAccountId ?? "account-checking",
              paymentDay: account.paymentDay ?? 10,
            };
          return account;
        });
      }
      if (getSetupStatus(document) === "recovery")
        throw new Error(STORAGE_RECOVERY_MESSAGE);
      if (tables.some((table) => table.name === "app_storage_identity")) {
        const identity = await transaction.getFirstAsync<{
          had_profile: number;
        }>("SELECT had_profile FROM app_storage_identity WHERE id = 1");
        if (!identity || (identity.had_profile && document.users.length === 0))
          throw new Error(STORAGE_RECOVERY_MESSAGE);
      }
      if (
        version < DATABASE_VERSION ||
        stored.schema_version < LOCAL_SCHEMA_VERSION
      ) {
        if (document.users.length && !document._local.onboardingCompletedAt)
          document._local.onboardingCompletedAt = new Date().toISOString();
        await transaction.execAsync(
          "CREATE TABLE IF NOT EXISTS app_migration_snapshots (id INTEGER PRIMARY KEY, from_version INTEGER NOT NULL, document_json TEXT NOT NULL, created_at TEXT NOT NULL);",
        );
        await transaction.runAsync(
          "INSERT INTO app_migration_snapshots (from_version, document_json, created_at) VALUES (?, ?, ?)",
          version,
          stored.document_json,
          new Date().toISOString(),
        );
        const migratedJson = JSON.stringify(document);
        docBytes = migratedJson.length;
        updatedAt = new Date().toISOString();
        await transaction.runAsync(
          "UPDATE app_document SET schema_version = ?, document_json = ?, updated_at = ? WHERE id = 1",
          LOCAL_SCHEMA_VERSION,
          migratedJson,
          updatedAt,
        );
      } else {
        document = normalizeBackupDocument(document);
      }
    }

    await transaction.execAsync(
      "CREATE TABLE IF NOT EXISTS app_storage_identity (id INTEGER PRIMARY KEY CHECK (id = 1), had_profile INTEGER NOT NULL);",
    );
    const hasProfile = document.users.length > 0 ? 1 : 0;
    await transaction.runAsync(
      "INSERT OR IGNORE INTO app_storage_identity (id, had_profile) VALUES (1, ?)",
      hasProfile,
    );

    const identityAfter = await transaction.getFirstAsync<{
      had_profile: number;
    }>("SELECT had_profile FROM app_storage_identity WHERE id = 1");
    const effectiveHadProfile = identityAfter?.had_profile ?? hasProfile;

    syncResult = await syncSqliteMonthIndexes(transaction, document, {
      previousDocument: null,
      docBytes,
      hadProfile: effectiveHadProfile,
      updatedAt,
      forceRebuild: true,
    });

    // Advance only after every migration and validation succeeds; rollback includes DDL.
    await transaction.execAsync(`PRAGMA user_version = ${DATABASE_VERSION};`);
  });

  triggerNativePartitionSync(database, syncResult);
}
