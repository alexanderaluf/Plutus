import type { SQLiteDatabase } from "expo-sqlite";

import type { BackupDocument } from "../model/backup-document";
import {
  normalizeBackupDocument,
  parseStoredDocument,
} from "../model/normalize-backup";
import { STORAGE_RECOVERY_MESSAGE } from "./migrations";
import { getSetupStatus } from "../model/onboarding";

type DocumentRow = {
  document_json: string;
};

/** Read-through projection cache for the foreground provider. SQLite is checked
 * on every read; unchanged JSON can reuse its already validated document.
 * Locked mutations deliberately continue using the uncached readDocument.
 */
export function createDocumentReader(database: SQLiteDatabase) {
  let cached: { json: string; document: BackupDocument } | undefined;
  return async () => {
    const row = await database.getFirstAsync<DocumentRow>(
      "SELECT document_json FROM app_document WHERE id = 1",
    );
    const identity = await database.getFirstAsync<{ had_profile: number }>(
      "SELECT had_profile FROM app_storage_identity WHERE id = 1",
    );
    if (!row || !identity) throw new Error(STORAGE_RECOVERY_MESSAGE);
    const document =
      cached?.json === row.document_json
        ? cached.document
        : parseStoredDocument(row.document_json);
    if (identity.had_profile && document.users.length === 0)
      throw new Error(STORAGE_RECOVERY_MESSAGE);
    cached = { json: row.document_json, document };
    return document;
  };
}

/** Read and mutate under the same SQL lock, including headless task writes. */
export async function mutateDocument(
  database: SQLiteDatabase,
  updater: (current: BackupDocument) => BackupDocument,
) {
  let committed: BackupDocument | undefined;
  await database.withExclusiveTransactionAsync(async (transaction) => {
    const current = await readDocument(transaction);
    const next = normalizeBackupDocument(updater(current));
    await transaction.runAsync(
      `INSERT INTO app_document (id, schema_version, document_json, updated_at) VALUES (1, ?, ?, ?)
       ON CONFLICT(id) DO UPDATE SET schema_version = excluded.schema_version,
       document_json = excluded.document_json, updated_at = excluded.updated_at`,
      next._local.schemaVersion,
      JSON.stringify(next),
      new Date().toISOString(),
    );
    await transaction.runAsync(
      "UPDATE app_storage_identity SET had_profile = ? WHERE id = 1",
      next.users.length > 0
        ? 1
        : current._local.dataMode === "demo" && getSetupStatus(next) === "setup"
          ? 0
          : current.users.length > 0
            ? 1
            : 0,
    );
    committed = next;
  });
  return committed!;
}

export async function readDocument(database: SQLiteDatabase) {
  const row = await database.getFirstAsync<DocumentRow>(
    "SELECT document_json FROM app_document WHERE id = 1",
  );

  if (!row) throw new Error(STORAGE_RECOVERY_MESSAGE);
  const document = parseStoredDocument(row.document_json);
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

  await database.withExclusiveTransactionAsync(async (transaction) => {
    await readDocument(transaction);
    await transaction.runAsync(
      `INSERT INTO app_document (id, schema_version, document_json, updated_at)
       VALUES (1, ?, ?, ?)
       ON CONFLICT(id) DO UPDATE SET
         schema_version = excluded.schema_version,
         document_json = excluded.document_json,
         updated_at = excluded.updated_at`,
      normalized._local.schemaVersion,
      JSON.stringify(normalized),
      new Date().toISOString(),
    );
    await transaction.runAsync(
      "UPDATE app_storage_identity SET had_profile = ? WHERE id = 1",
      normalized.users.length > 0 ? 1 : 0,
    );
  });
}
