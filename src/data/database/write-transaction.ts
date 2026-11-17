import type { SQLiteDatabase } from "expo-sqlite";

/**
 * Process-wide SQLite write gate. Read docs/database-safety.md before changing.
 *
 * Every write to `budget-manager.db` from this JavaScript runtime — the
 * foreground provider, startup migrations, and the headless recurring task —
 * must run through this gate so that at most one write transaction exists at
 * a time.
 *
 * Why a JS gate and not `PRAGMA busy_timeout`: on Android every expo-sqlite
 * async call, for every connection, runs on the single
 * `expo.modules.AsyncFunctionQueue` thread. A connection that sleeps in a busy
 * handler blocks the very thread the lock holder needs to finish, so a busy
 * timeout only turns an immediate `database is locked` into a frozen app
 * followed by the same error. Serializing writers before they reach SQLite
 * removes the contention instead.
 *
 * Never call `withWriteLock` or `runWriteTransaction` from inside a task that
 * already holds the gate: the inner call waits for the outer one forever.
 */
let tail: Promise<unknown> = Promise.resolve();

export function withWriteLock<T>(work: () => Promise<T>): Promise<T> {
  const run = tail.catch(() => undefined).then(work);
  tail = run;
  return run;
}

/**
 * Runs `task` in one SQLite write transaction behind the process-wide gate.
 * expo-sqlite opens a dedicated connection, commits when `task` resolves, and
 * rolls back when it throws. All statements inside `task` must use the
 * `transaction` argument, never the outer `database`.
 */
export function runWriteTransaction(
  database: SQLiteDatabase,
  task: (transaction: SQLiteDatabase) => Promise<void>,
): Promise<void> {
  return withWriteLock(() => database.withExclusiveTransactionAsync(task));
}
