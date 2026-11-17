import { Directory, Paths } from "expo-file-system";

/**
 * Builds released between 2026-11-14 and the database-lock fix shipped a
 * native module (`plutus-fast-store`) that copied month slices of the
 * transaction index into `plutus-fast-index/` (Android: app files directory;
 * iOS: Library/Application Support). Those files were never authoritative —
 * SQLite is — so deleting them cannot lose data, but they are stale personal
 * data and must not stay on the device. Best effort and idempotent.
 */
export function removeLegacyNativeIndexCache() {
  const candidates = [
    () => new Directory(Paths.document, "plutus-fast-index"),
    () =>
      new Directory(
        Paths.document.parentDirectory,
        "Library",
        "Application Support",
        "plutus-fast-index",
      ),
  ];
  for (const candidate of candidates) {
    try {
      const directory = candidate();
      if (directory.exists) directory.delete();
    } catch {
      // A stale cache that cannot be removed must never block startup.
    }
  }
}
