import { Directory, File, Paths } from "expo-file-system";
import type { SQLiteDatabase } from "expo-sqlite";
import { LOCAL_SCHEMA_VERSION } from "../model/backup-document";
import { DATABASE_VERSION, migrateLocalDatabase } from "./migrations";

// Stable paths are a release contract. These are recovery artifacts, never a
// second authoritative record store. Keep them outside SQLite and the cache.
export function getRecoveryDirectory() {
  return new Directory(Paths.document, "storage-recovery");
}

export async function initializeLocalDatabase(database: SQLiteDatabase) {
  try {
    await initialize(database);
  } catch (error) {
    // Also capture unsupported layouts/current-version damage when possible.
    // Failure to make a copy must never turn into a reset or mask the error.
    try {
      const directory = getRecoveryDirectory();
      directory.create({ idempotent: true, intermediates: true });
      const file = new File(directory, `failed-open-${Date.now()}.sqlite`);
      const bytes = await database.serializeAsync();
      file.create();
      file.write(bytes);
    } catch {
      /* Leave all existing checkpoints and the database intact. */
    }
    await database.closeAsync().catch(() => undefined);
    throw error;
  }
}

async function initialize(database: SQLiteDatabase) {
  const directory = getRecoveryDirectory();
  directory.create({ idempotent: true, intermediates: true });
  const marker = new File(directory, "installation-established");
  const version =
    (
      await database.getFirstAsync<{ user_version: number }>(
        "PRAGMA user_version",
      )
    )?.user_version ?? 0;
  const tables = await database.getAllAsync<{ name: string }>(
    "SELECT name FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%'",
  );
  const storedVersion = tables.some((table) => table.name === "app_document")
    ? await database.getFirstAsync<{ schema_version: number }>(
        "SELECT schema_version FROM app_document WHERE id = 1",
      )
    : null;
  // serializeAsync includes committed WAL data; copying the .db alone does not.
  // Never overwrite a previous checkpoint, including on a failed-upgrade retry.
  if (
    tables.length > 0 &&
    (version < DATABASE_VERSION ||
      (storedVersion && storedVersion.schema_version < LOCAL_SCHEMA_VERSION))
  ) {
    const checkpoint = new File(
      directory,
      `before-v${DATABASE_VERSION}.sqlite`,
    );
    if (!checkpoint.exists) {
      const bytes = await database.serializeAsync();
      const staged = new File(directory, `before-v${DATABASE_VERSION}.pending`);
      staged.create({ overwrite: true });
      staged.write(bytes);
      if (staged.size !== bytes.length)
        throw new Error(
          "The recovery copy could not be saved. Upgrade stopped.",
        );
      staged.move(checkpoint);
    }
  }
  await migrateLocalDatabase(database, marker.exists);
  if (!marker.exists) {
    marker.create();
    marker.write("1");
  }
}
