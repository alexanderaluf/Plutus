import type { SQLiteDatabase } from "expo-sqlite";
import { LOCAL_SCHEMA_VERSION } from "../model/backup-document";
import { createDefaultBackup } from "../model/default-backup";
import {
  normalizeBackupDocument,
  parseStoredDocument,
} from "../model/normalize-backup";
import { getSetupStatus } from "../model/onboarding";

export const DATABASE_VERSION = 19;
export const STORAGE_RECOVERY_MESSAGE =
  "Your saved data could not be opened safely. Nothing has been reset. Keep this installation and export a recovery copy before seeking help.";

/** Versions 1?16 share the same document envelope. The normalizers provide
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
  const check = await database.getFirstAsync<{ quick_check: string }>(
    "PRAGMA quick_check",
  );
  if (check?.quick_check !== "ok") throw new Error(STORAGE_RECOVERY_MESSAGE);
  const tables = await database.getAllAsync<{ name: string }>(
    "SELECT name FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%'",
  );
  const hasDocument = tables.some((table) => table.name === "app_document");
  if (
    !hasDocument &&
    (version !== 0 || tables.length > 0 || installationExists)
  )
    throw new Error(STORAGE_RECOVERY_MESSAGE);
  if (
    version >= 17 &&
    !tables.some((table) => table.name === "app_storage_identity")
  )
    throw new Error(STORAGE_RECOVERY_MESSAGE);
  await database.execAsync(
    "PRAGMA journal_mode = WAL; PRAGMA foreign_keys = ON;",
  );
  await database.withExclusiveTransactionAsync(async (transaction) => {
    if (!hasDocument) {
      await transaction.execAsync(
        "CREATE TABLE app_document (id INTEGER PRIMARY KEY NOT NULL CHECK (id = 1), schema_version INTEGER NOT NULL, document_json TEXT NOT NULL, updated_at TEXT NOT NULL);",
      );
      const document = createDefaultBackup();
      await transaction.runAsync(
        "INSERT INTO app_document (id, schema_version, document_json, updated_at) VALUES (1, ?, ?, ?)",
        LOCAL_SCHEMA_VERSION,
        JSON.stringify(document),
        new Date().toISOString(),
      );
    } else {
      const stored = await transaction.getFirstAsync<{
        schema_version: number;
        document_json: string;
      }>("SELECT schema_version, document_json FROM app_document WHERE id = 1");
      if (!stored || stored.schema_version > LOCAL_SCHEMA_VERSION)
        throw new Error(STORAGE_RECOVERY_MESSAGE);
      // No writes before successful parse and validation.
      const document = parseStoredDocument(stored.document_json);
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
        await transaction.runAsync(
          "UPDATE app_document SET schema_version = ?, document_json = ?, updated_at = ? WHERE id = 1",
          LOCAL_SCHEMA_VERSION,
          JSON.stringify(document),
          new Date().toISOString(),
        );
      }
    }
    await transaction.execAsync(
      "CREATE TABLE IF NOT EXISTS app_storage_identity (id INTEGER PRIMARY KEY CHECK (id = 1), had_profile INTEGER NOT NULL);",
    );
    const saved = await transaction.getFirstAsync<{ document_json: string }>(
      "SELECT document_json FROM app_document WHERE id = 1",
    );
    const hasProfile =
      normalizeBackupDocument(JSON.parse(saved!.document_json)).users.length >
      0;
    await transaction.runAsync(
      "INSERT OR IGNORE INTO app_storage_identity (id, had_profile) VALUES (1, ?)",
      hasProfile ? 1 : 0,
    );
    // Advance only after every migration and validation succeeds; rollback includes DDL.
    await transaction.execAsync(`PRAGMA user_version = ${DATABASE_VERSION};`);
  });
}
