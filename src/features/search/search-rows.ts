import { localDateKey } from "@/data/model/recurring-record";
import type { TransactionIndexEntry } from "@/data/selectors/transaction-selectors";

export const SEARCH_PAGE_SIZE = 40;

export type SearchRow =
  | { kind: "day"; key: string; dayKey: string; date: Date | null }
  | {
      kind: "transaction";
      key: string;
      entry: TransactionIndexEntry;
      /** Position inside its visual card, for rounded corners and dividers. */
      first: boolean;
      last: boolean;
    };

// Previously built rows per result list. Reusing unchanged row objects keeps
// memoized cells from re-rendering each time the window grows. Entries are
// weak keys, so a replaced result list releases its rows with it.
const built = new WeakMap<
  readonly TransactionIndexEntry[],
  Map<string, SearchRow>
>();

function dayOf(entry: TransactionIndexEntry) {
  return Number.isFinite(entry.timestamp)
    ? localDateKey(new Date(entry.timestamp))
    : "unknown";
}

/**
 * Flat rows for the loaded window only. Each row references an existing index
 * entry; view models are projected by mounted cells and dropped when the
 * virtualized list unmounts them, so scrolling back rebuilds identical rows.
 */
export function buildSearchRows(
  entries: readonly TransactionIndexEntry[],
  loaded: number,
  groupByDay: boolean,
): SearchRow[] {
  const count = Math.min(loaded, entries.length);
  const rows: SearchRow[] = [];
  const cache = built.get(entries) ?? new Map<string, SearchRow>();
  built.set(entries, cache);
  const keep = (row: SearchRow) => {
    const id = `${groupByDay}:${row.key}`;
    const previous = cache.get(id);
    if (
      previous &&
      (previous.kind === "day" ||
        (row.kind === "transaction" &&
          previous.first === row.first &&
          previous.last === row.last))
    )
      return previous;
    cache.set(id, row);
    return row;
  };
  for (let index = 0; index < count; index++) {
    const entry = entries[index];
    const day = groupByDay ? dayOf(entry) : "";
    const previous = index > 0 ? entries[index - 1] : null;
    const next = index + 1 < count ? entries[index + 1] : null;
    const first = !previous || (groupByDay && dayOf(previous) !== day);
    const last = !next || (groupByDay && dayOf(next) !== day);
    if (groupByDay && first)
      rows.push(
        keep({
          kind: "day",
          // Unique even if an oldest-first list revisits a day across pages.
          key: `day:${day}:${entry.id}`,
          dayKey: day,
          date: day === "unknown" ? null : new Date(entry.timestamp),
        }),
      );
    rows.push(keep({ kind: "transaction", key: entry.id, entry, first, last }));
  }
  return rows;
}

/** The next window size, never past the total. */
export function nextSearchWindow(loaded: number, total: number) {
  return Math.min(total, loaded + SEARCH_PAGE_SIZE);
}
