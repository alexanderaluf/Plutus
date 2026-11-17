# Database safety: locks, crashes and app-store upgrades

**Mandatory reading** before you change anything that touches SQLite, the
`BackupDocument` write path, startup, background tasks, native modules
(`modules/`, `plugins/`), performance of reads/writes, or the versions of
`expo-sqlite` / `expo` / `expo-file-system`.

If a task seems to require breaking a rule below, **stop and ask the human
maintainer**. Do not work around a rule, and do not treat a passing local
build or a working debug build as proof that the rule does not apply. Every
failure described here was invisible in development and only appeared on
users' phones after a store update.

---

## 1. What went wrong (November 2026)

Commit `a9e48a5` ("update to speed of read write and edit from the local
database", 2026-11-14) shipped to production. Users then saw:

- **"database is locked"** on save, which only went away after force-closing
  and reopening the app.
- **App crashes** when creating a transaction, creating an account, or making
  any other change that writes to the local database.

Several separate defects in that commit combined to cause this:

| # | Defect | Effect on devices |
|---|--------|-------------------|
| 1 | A native module, `modules/plutus-fast-store`, opened `budget-manager.db` itself: Kotlin through `android.database.sqlite`, Swift through the system `libsqlite3`. It ran synchronously on the JS thread and again on a background thread after **every** save (`syncPartitionFilesAsync`). | expo-sqlite bundles its **own** compiled copy of SQLite. Two SQLite libraries in one process do not see each other's POSIX locks or WAL index. Each one assumes it is alone, so closing one connection can checkpoint, truncate or delete the WAL/SHM files the other is still using. Result: `database is locked`, stale WAL index (fixed only by restarting the process), and corruption risk. SQLite documents this as a cause of corruption: <https://www.sqlite.org/howtocorrupt.html> §2.2.1. |
| 2 | `PRAGMA mmap_size = 16777216` on the main connection. | With memory-mapped I/O, an I/O error or a file truncated under the mapping (see #1) raises **SIGBUS**, a native crash, instead of a catchable SQLite error: <https://www.sqlite.org/mmap.html>. |
| 3 | The month index (`app_meta_head`, `app_month_index`, `tx_month_rows`) is rewritten inside each write transaction. Its change detection compared arrays and records **by reference**. The previous and next documents are always separate parses, so every save looked like a total change. | Every single save deleted and re-inserted **every** transaction row. The write lock was held for seconds and memory spiked (JSON for every row, twice), which widened the window for #1 and #4 and caused out-of-memory crashes on large histories. |
| 4 | No coordination between writers. `withExclusiveTransactionAsync` opens a **new connection** per transaction with a deferred `BEGIN` and no busy timeout. The foreground provider, startup migration and headless recurring task each wrote independently. | Any overlap fails immediately with `database is locked`. |
| 5 | The `expo-sqlite` version used by those builds (< 58.0.17) left a connection permanently broken after one `database is locked` (`cannot commit transaction - SQL statements in progress`). | One lock error made every later save fail until the app restarted. |
| 6 | `head.doc_bytes` stored JavaScript `string.length` (UTF-16 units), and startup compared it with SQLite `length()` (characters). | Any emoji in a name failed the startup fast-path check, so the app ran `quick_check` and a full index rebuild in an exclusive transaction **on every launch**. |
| 7 | Screens hold a *windowed* document (recent months only, once there are more than 600 transactions). `deleteProfile` and the onboarding restore rollback built full replacement documents from it. | Silent loss of older transactions on replace. |

### How it was fixed (2026-11-17)

- `modules/plutus-fast-store` was deleted. All reads go through the
  expo-sqlite connection owned by `SQLiteProvider`. Stale cache files that the
  module left in `plutus-fast-index/` are removed by
  `src/data/database/legacy-native-index.ts`.
- `src/data/database/write-transaction.ts` adds one process-wide write gate.
  `mutateDocument`, `writeDocument` and `migrateLocalDatabase` all go through
  it, so the foreground provider, startup and the headless task can never
  write at the same time.
- `mmap_size` is forced to `0`.
- Month-index change detection compares content (`jsonValuesEqual`, lookup
  name maps). A one-record save now rewrites only that record's month.
- `doc_bytes` is computed by SQLite inside the same transaction.
- `deleteProfile` and the onboarding rollback start from `loadFullDocument()`.
  Search loads the canonical document in the background when the UI
  document is windowed.
- Regression tests: `tests/fast-store-index.test.cjs`. One test reproduces
  the real `database is locked` error with two connections and proves that
  the gate prevents it.

---

## 2. Hard rules: never do these

1. **Never open `budget-manager.db` with anything except expo-sqlite's
   JavaScript API.** No Kotlin/Java (`android.database.sqlite`, Room, SQLDelight),
   no Swift/Objective-C (`libsqlite3`, GRDB, FMDB, Core Data), no C++/JSI, no
   other npm SQLite package (op-sqlite, WatermelonDB, quick-sqlite, …), and no
   widget or app extension. "Read-only" and `PRAGMA query_only` do **not** make
   this safe: opening and closing the file is enough to break the other
   library's locks. If native code needs data, JavaScript passes it a
   projection (as `src/data/widgets/widget-sync.ts` does).
2. **Never write outside the write gate.** Use `runWriteTransaction(database, task)`
   (or `withWriteLock` for multi-step startup work). Never call
   `withExclusiveTransactionAsync`, `withTransactionAsync`, or a writing
   `runAsync`/`execAsync` on the provider connection from anywhere else. Feature
   code never touches SQL. It calls `useLocalData()` (`updateDocument`,
   `upsertRecord`, `removeRecord`, `replaceDocument`).
3. **Never nest the gate.** Calling `runWriteTransaction`/`withWriteLock` from
   inside a task that already holds it waits forever. Inside a gated task, use
   the `transaction` argument directly.
4. **Never "fix" lock errors with `PRAGMA busy_timeout`, retries or sleeps.** On
   Android every expo-sqlite async call, for every connection, runs on the
   single `expo.modules.AsyncFunctionQueue` thread. A connection waiting in a
   busy handler blocks the thread the lock holder needs, which freezes the app
   and then fails anyway. Find the unserialized writer and route it through the
   gate.
5. **Never enable memory-mapped I/O** (`PRAGMA mmap_size` must stay `0`), never
   change `journal_mode` away from `WAL`, and never set
   `locking_mode = EXCLUSIVE`.
6. **Never open extra connections.** The only connections are the
   `SQLiteProvider` connection, the per-transaction connection that
   expo-sqlite opens inside `runWriteTransaction`, and the headless recurring
   task (`recurring-background.ts`), whose writes also pass through the gate.
7. **Never make one save cost O(all records) in SQL.** Derived index tables must
   update incrementally, inside the same transaction as `app_document`.
   Compare documents **by content**: records parsed from SQLite and records
   returned by `normalizeBackupDocument` never share identity.
8. **Never build a full replacement from the UI `document`.** It may be a
   windowed projection that lacks older months. For `replaceDocument`,
   backups, exports, profile deletion or rollback copies, start from
   `await loadFullDocument()`, or use `updateDocument(current => next)`, which
   always receives the full canonical document.
9. **Never keep derived copies of records outside SQLite** (cache files, partition
   files, AsyncStorage, MMKV). They go stale, leak personal data, and are a
   second source of truth. Derived data lives in SQLite tables written in the
   same transaction, or in memory keyed by the committed document
   (`memoizeForDocument`).
10. **Never call synchronous database or file I/O from render or the JS thread
    on the save path.** Use the async expo-sqlite API.
11. **Never downgrade `expo-sqlite` below 58.0.17**, and read its changelog for
    every upgrade. Treat changes to lock, transaction or connection behavior as
    storage changes that need the full validation in section 5.
12. **Never swallow a failed write or report success early.** Await every
    mutation and show an error when it rejects (see AGENTS.md).

---

## 3. Required patterns

Feature code (all writes):

```tsx
const { updateDocument, upsertRecord, loadFullDocument } = useLocalData();

await upsertRecord("transactions", record);              // one record
await updateDocument((current) => ({ ...current, ... })); // several collections
const full = await loadFullDocument();                    // before any full replace
```

Repository or startup code (the only place SQL writes exist):

```ts
import { runWriteTransaction } from "./write-transaction";

await runWriteTransaction(database, async (transaction) => {
  // Use `transaction` for every statement. Never `database`.
  // Never call runWriteTransaction/withWriteLock in here.
});
```

Performance work that **is** allowed:

- Memoized selectors per committed document (`docs/performance-architecture.md`).
- Windowed month loading through `fast-store-client.ts`, which reads the
  SQLite month index over the provider connection.
- Smaller transactions: write only dirty months, batch statements, and avoid
  re-serializing unchanged data.
- Measuring before optimizing: a faster save never justifies a second
  database engine.

---

## 4. Checklist for every change that touches storage

- [ ] No new code opens `budget-manager.db` or any SQLite file outside expo-sqlite JS.
- [ ] Every new write goes through `useLocalData()`, or through
      `runWriteTransaction` in `src/data/database/`.
- [ ] No `mmap_size`, `busy_timeout`, `locking_mode` or journal-mode changes.
- [ ] A single-record save touches O(1 month) of index rows (the test
      "a single-record save rewrites only the month it touched" passes).
- [ ] Full replacements start from `loadFullDocument()` or `updateDocument`.
- [ ] Schema changes follow `docs/storage-upgrades.md` (both version numbers,
      forward-only migration, checkpoints, identity guard).
- [ ] No new files outside SQLite hold copies of records.
- [ ] `tests/fast-store-index.test.cjs` passes, including "storage safety guards".

---

## 5. Validation before every store release

Automated (all must pass):

```sh
node --test tests/*.test.cjs
npx tsc --noEmit
npx expo-doctor
npx expo export --platform android --output-dir <dir>
npx expo export --platform ios --output-dir <dir>
```

On real devices, **installed over the previous store build without
uninstalling** (also follow the device steps in `docs/storage-upgrades.md`):

1. With more than 600 transactions across several months and at least one
   emoji in a category or account name, cold-start twice. The second start
   must be fast, which means no index rebuild.
2. Create 20 transactions as fast as possible, edit an account, delete a
   transaction, rename a category. No error, no crash, and every change is
   still there after a cold restart.
3. Save while the recurring background task runs (trigger it from the OS
   developer tools), and save right after returning the app to the
   foreground. No `database is locked`.
4. Search for a transaction older than two months. It must be found.
5. Test on a low-end Android device (2–3 GB RAM) and an iPhone. Watch the
   logcat / Xcode console for `SQLITE_BUSY`, `database is locked`, `SIGBUS`
   and out-of-memory kills.
6. Upgrading from the 2026-11-14 builds: confirm that `plutus-fast-index/`
   disappears from the app's files directory a few seconds after launch.

If `database is locked` ever appears again, search for a writer that bypasses
the gate (`withExclusiveTransactionAsync`, `withTransactionAsync`,
`openDatabase*`, native code touching SQLite) before changing anything else.
