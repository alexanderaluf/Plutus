# Read performance

The canonical document is parsed once at startup and held in memory. SQLite is
not on the read path of any screen, so screen speed depends entirely on how
much JavaScript runs per render. On low-end Android devices Hermes runs this
work roughly 10–30× slower than desktop Node, so every full-history scan counts.

## Rules

1. **Derive once per commit.** Each commit creates a new immutable
   `BackupDocument`; its identity is the version. Wrap any non-trivial projection
   in `memoizeForDocument(document, key, build)`
   (`src/data/selectors/document-memo.ts`). Keys must include every input
   besides the document (currency, language, clock, period). Results are
   dropped together with the document. They are never a record store.
2. **Never scan all history for one period.** Use the shared index in
   `transaction-selectors.ts`:
   - `createTransactionIndex`: profile-owned entries, newest first.
   - `selectTransactionMonths`: `YYYY-MM` → slice of the index (per-month index).
   - `selectTransactionPeriod` / `transactionRecordsInPeriod`: binary-searched bounds.
   - `selectPeriodTransactionCandidates`: period records in document order,
     plus undated records, so it can replace a filtered `document.transactions`
     loop without changing the result.
   - `transactionTimestamps`: parsed dates by document position. Never call
     `new Date(record.date)` in a loop over all transactions.
   - `selectTransaction(document, id)`: one record. Do not project every
     transaction to find one.
3. **No loading states for local data.** Projections run synchronously during
   render. Do not reintroduce time-sliced/idle schedulers for screen data: they
   turned ~100 ms of work into a second of spinners on slow devices.
4. **Tabs stay mounted.** `TabShell` keeps visited tabs alive and freezes hidden
   ones (`freezeOnBlur`). A frozen tab re-renders once, from shared caches, when
   shown. Switch tabs with `switchTab`, not `router.replace`.
5. **Stable clock.** `useLocalDayClock` returns the same `Date` until a commit,
   local midnight, or a focus more than 5 minutes later. Key memos on it. Do not
   create `new Date()` in render for projection inputs.
6. **Idle pre-warm.** `ProjectionPrewarm` rebuilds the index, month partitions,
   projector and (once Search was opened) the search context, one idle task at a
   time after each commit. When adding a heavy projection to a tab, add its
   memoized selector there with the same key.
7. **Saves.** `mutateDocument` hands updaters a private copy parsed inside the
   write lock. Do not clone it again. The repository shares the committed
   object with the foreground reader, so an unchanged reload keeps document
   identity, and every cache along with it.

## Measured (Node, 20,000 transactions, 9 MB document)

| Operation | Before | After |
| --- | --- | --- |
| Save pipeline | 46–49 ms | 27 ms |
| Return to Home tab | 4.2 ms + remount, spinner | 0 (kept mounted, cached) |
| Open Reports (index warm) | 5.1 ms | 0.7 ms |
| Open Accounts (index warm) | 4.0 ms | 1.7 ms |
| Open Search (pre-warmed/revisit) | 19–26 ms | 0 |

Before this change, Home also sliced its work into 3 ms idle chunks, so the
spinner lasted many frames longer than the computation.
