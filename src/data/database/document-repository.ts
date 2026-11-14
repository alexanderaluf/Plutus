import type { SQLiteDatabase } from "expo-sqlite";

import type { BackupDocument } from "../model/backup-document";
import {
  normalizeBackupDocument,
  parseStoredDocument,
} from "../model/normalize-backup";
import { getSetupStatus } from "../model/onboarding";
import {
  projectWindowedFromFullDocument,
  readIndexedWindowBootstrap,
  triggerNativePartitionSync,
} from "./fast-store-client";
import { STORAGE_RECOVERY_MESSAGE } from "./migrations";
import { syncSqliteMonthIndexes, type SyncIndexResult } from "./month-index";

type DocumentRow = {
  document_json: string;
};

/**
 * The last JSON committed or validated through each connection, with the
 * document object React already holds for it. Never authoritative: SQLite is
 * still read and compared on every access. Sharing the object means a
 * foreground refresh after a save returns the very same document, so no
 * screen or per-document projection is invalidated by an unchanged reload.
 */
const committed = new WeakMap<
  SQLiteDatabase,
  { json: string; document: BackupDocument }
>();
const lastSyncResult = new WeakMap<BackupDocument, SyncIndexResult>();

/** Read-through projection cache for callers needing the full canonical document. */
export function createDocumentReader(database: SQLiteDatabase) {
  return async () => {
    const row = await database.getFirstAsync<DocumentRow>(
      "SELECT document_json FROM app_document WHERE id = 1",
    );
    const identity = await database.getFirstAsync<{ had_profile: number }>(
      "SELECT had_profile FROM app_storage_identity WHERE id = 1",
    );
    if (!row || !identity) throw new Error(STORAGE_RECOVERY_MESSAGE);
    const known = committed.get(database);
    const document =
      known?.json === row.document_json
        ? known.document
        : parseStoredDocument(row.document_json);
    if (identity.had_profile && document.users.length === 0)
      throw new Error(STORAGE_RECOVERY_MESSAGE);
    committed.set(database, { json: row.document_json, document });
    return document;
  };
}

/**
 * Fast current-month-first bootstrap reader for foreground UI startup.
 * Reads core metadata + active financial months + precomputed month catalog
 * so startup skips parsing old historical months into JS memory.
 */
export function createWindowedDocumentReader(database: SQLiteDatabase) {
  return async (now = new Date()) => {
    const indexed = await readIndexedWindowBootstrap(database, now);
    if (indexed) return indexed;
    return createDocumentReader(database)();
  };
}

/** Read and mutate under the same SQL lock, including headless task writes. */
export async function mutateDocument(
  database: SQLiteDatabase,
  updater: (current: BackupDocument) => BackupDocument,
) {
  let result: { json: string; document: BackupDocument } | undefined;
  let syncResult: SyncIndexResult | null = null;
  await database.withExclusiveTransactionAsync(async (transaction) => {
    const known = committed.get(database);
    // Always a private deep copy parsed from SQLite: updaters may mutate it
    // freely, so callers need no additional clone. Unchanged JSON that this
    // connection already validated skips re-validation, never the parse.
    const current = await readDocument(transaction, known?.json);
    const next = normalizeBackupDocument(updater(current));
    const json = JSON.stringify(next);
    const updatedAt = new Date().toISOString();
    const hadProfile =
      next.users.length > 0
        ? 1
        : current._local.dataMode === "demo" && getSetupStatus(next) === "setup"
          ? 0
          : current.users.length > 0
            ? 1
            : 0;

    await transaction.runAsync(
      `INSERT INTO app_document (id, schema_version, document_json, updated_at) VALUES (1, ?, ?, ?)
       ON CONFLICT(id) DO UPDATE SET schema_version = excluded.schema_version,
       document_json = excluded.document_json, updated_at = excluded.updated_at`,
      next._local.schemaVersion,
      json,
      updatedAt,
    );
    await transaction.runAsync(
      "UPDATE app_storage_identity SET had_profile = ? WHERE id = 1",
      hadProfile,
    );

    if (
      typeof transaction.execAsync === "function" &&
      typeof transaction.runAsync === "function"
    ) {
      syncResult = await syncSqliteMonthIndexes(transaction, next, {
        previousDocument: current,
        docBytes: json.length,
        hadProfile,
        updatedAt,
      });
    }

    result = { json, document: next };
  });

  committed.set(database, result!);
  if (syncResult) lastSyncResult.set(result!.document, syncResult);
  triggerNativePartitionSync(database, syncResult);
  return result!.document;
}

export function projectUiDocumentAfterCommit(
  database: SQLiteDatabase,
  fullDocument: BackupDocument,
  previousWindowDoc: BackupDocument | null,
): BackupDocument {
  // Recompute windowed view incrementally using the committed sync metadata.
  return projectWindowedFromFullDocument(
    fullDocument,
    database,
    previousWindowDoc,
    lastSyncResult.get(fullDocument) ?? {
      revision: 1,
      dirtyMonthKeys: null,
      rebuiltAll: true,
    },
  );
}

export async function readDocument(
  database: SQLiteDatabase,
  validatedJson?: string,
) {
  const row = await database.getFirstAsync<DocumentRow>(
    "SELECT document_json FROM app_document WHERE id = 1",
  );

  if (!row) throw new Error(STORAGE_RECOVERY_MESSAGE);
  // Stored JSON is serialized from a normalized document; identical text that
  // already passed validation on this connection needs only a fresh parse.
  const document =
    validatedJson !== undefined && row.document_json === validatedJson
      ? (JSON.parse(row.document_json) as BackupDocument)
      : parseStoredDocument(row.document_json);
  const identity = await database.getFirstAsync<{ had_profile: number }>(
    "SELECT had_profile FROM app_storage_identity WHERE id = 1",
  );
  if (!identity || (identity.had_profile && document.users.length === 0))
    throw new Error(STORAGE_RECOVERY_MESSAGE);
  return document;
}

export async function writeDocument(
  database: SQLiteDatabase,
  document: BackupDocument,
) {
  const normalized = normalizeBackupDocument(document);
  const json = JSON.stringify(normalized);
  let syncResult: SyncIndexResult | null = null;

  await database.withExclusiveTransactionAsync(async (transaction) => {
    const previous = await readDocument(transaction);
    const updatedAt = new Date().toISOString();
    const hadProfile = normalized.users.length > 0 ? 1 : 0;

    await transaction.runAsync(
      `INSERT INTO app_document (id, schema_version, document_json, updated_at)
       VALUES (1, ?, ?, ?)
       ON CONFLICT(id) DO UPDATE SET
         schema_version = excluded.schema_version,
         document_json = excluded.document_json,
         updated_at = excluded.updated_at`,
      normalized._local.schemaVersion,
      json,
      updatedAt,
    );
    await transaction.runAsync(
      "UPDATE app_storage_identity SET had_profile = ? WHERE id = 1",
      hadProfile,
    );

    if (
      typeof transaction.execAsync === "function" &&
      typeof transaction.runAsync === "function"
    ) {
      syncResult = await syncSqliteMonthIndexes(transaction, normalized, {
        previousDocument: previous,
        docBytes: json.length,
        hadProfile,
        updatedAt,
      });
    }
  });

  committed.set(database, { json, document: normalized });
  if (syncResult) lastSyncResult.set(normalized, syncResult);
  triggerNativePartitionSync(database, syncResult);
  return normalized;
}
