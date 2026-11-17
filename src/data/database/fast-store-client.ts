/**
 * Windowed month loading over the SQLite month index (`app_meta_head`,
 * `app_month_index`, `tx_month_rows`).
 *
 * Every read here goes through the expo-sqlite connection owned by
 * SQLiteProvider. Never add a native (Kotlin/Swift/C++) module or a second
 * SQLite library that opens `budget-manager.db`: two SQLite copies in one
 * process cannot see each other's locks, which caused the production
 * "database is locked" errors and crashes. Read docs/database-safety.md.
 */
import type { SQLiteDatabase } from "expo-sqlite";

import type { BackupDocument } from "../model/backup-document";
import { financialMonth } from "../model/financial-month";
import type { JsonObject } from "../model/json";
import {
  activeUtcMonthKeysForWindow,
  getDocumentWindowState,
  parseRecordTimestampMs,
  setDocumentWindowState,
  summarizeMonthBucket,
  type DocumentWindowState,
  type MonthCatalogEntry,
  type MonthPartitionPayload,
  type SyncIndexResult,
  UNDATED_MONTH_KEY,
} from "./month-index";

const MAX_LOADED_WINDOW_MONTHS = 6;

function databasePathOf(database: SQLiteDatabase): string | null {
  return typeof (database as { databasePath?: string }).databasePath === "string"
    ? (database as { databasePath: string }).databasePath
    : null;
}

function hydrateRowsFromPayload(
  payload: MonthPartitionPayload,
  targetMap: Map<string, JsonObject[]>,
  loadedKeys: Set<string>,
) {
  const rows = Array.isArray(payload.rows) ? payload.rows : [];
  for (const row of rows) {
    parseRecordTimestampMs(row);
  }
  targetMap.set(payload.monthKey, rows);
  loadedKeys.add(payload.monthKey);
}

function flattenLoadedMonths(
  monthRows: Map<string, JsonObject[]>,
  catalog: MonthCatalogEntry[],
): JsonObject[] {
  const ordered: JsonObject[] = [];
  for (const entry of catalog) {
    const rows = monthRows.get(entry.monthKey);
    if (rows?.length) {
      for (let i = 0; i < rows.length; i++) ordered.push(rows[i]);
    }
  }
  return ordered;
}

function evictOldestLoadedMonthsIfNeeded(
  state: DocumentWindowState,
  pinnedKeys: Set<string>,
) {
  if (state.monthRows.size <= MAX_LOADED_WINDOW_MONTHS) return;
  for (const key of state.monthRows.keys()) {
    if (state.monthRows.size <= MAX_LOADED_WINDOW_MONTHS) break;
    if (pinnedKeys.has(key)) continue;
    state.monthRows.delete(key);
    state.loadedMonthKeys.delete(key);
  }
}

function buildWindowedDocument(
  head: BackupDocument,
  state: DocumentWindowState,
): BackupDocument {
  const transactions = flattenLoadedMonths(state.monthRows, state.catalog);
  const loadedCount = transactions.length;
  const totalCount = state.totalTransactionCount;
  state.isPartial = loadedCount < totalCount;
  const doc: BackupDocument = {
    ...head,
    transactions,
  };
  setDocumentWindowState(doc, state);
  return doc;
}

function selectActiveCatalogKeys(
  catalog: MonthCatalogEntry[],
  monthStartDay: number,
  now: Date,
): string[] {
  if (catalog.length === 0) return [];
  let totalCount = 0;
  for (const entry of catalog) totalCount += entry.txCount;
  // For small DBs (<= 600 tx total), keeping all months avoids extra queries with minimal RAM.
  if (totalCount <= 600) {
    return catalog.map((entry) => entry.monthKey);
  }

  const prevStart = financialMonth(now, monthStartDay, -1).start;
  const curEnd = financialMonth(now, monthStartDay, 0).end;
  const startMs = prevStart.getTime() - 86_400_000;
  const endMs = curEnd.getTime() + 86_400_000;

  const selected = new Set<string>(activeUtcMonthKeysForWindow(prevStart, curEnd));
  for (const entry of catalog) {
    if (entry.monthKey === UNDATED_MONTH_KEY) {
      selected.add(entry.monthKey);
      continue;
    }
    if (entry.maxTs >= startMs && entry.minTs < endMs) {
      selected.add(entry.monthKey);
    }
  }
  // Also always include the newest month if catalog isn't empty.
  if (catalog[0]) selected.add(catalog[0].monthKey);
  return [...selected];
}

/** Windowed bootstrap: core metadata, month catalog, and the active months. */
export async function readIndexedWindowBootstrap(
  database: SQLiteDatabase,
  now = new Date(),
): Promise<BackupDocument | null> {
  const headRow = await database.getFirstAsync<{
    revision: number;
    core_json: string;
  }>("SELECT revision, core_json FROM app_meta_head WHERE id = 1");
  if (!headRow?.core_json) return null;

  try {
    const head = JSON.parse(headRow.core_json) as BackupDocument;
    const catalogRows = await database.getAllAsync<{
      month_key: string;
      min_ts: number;
      max_ts: number;
      tx_count: number;
      summary_json: string;
    }>(
      "SELECT month_key, min_ts, max_ts, tx_count, summary_json FROM app_month_index ORDER BY month_key DESC",
    );

    const catalog: MonthCatalogEntry[] = catalogRows.map((row) => ({
      monthKey: row.month_key,
      minTs: row.min_ts,
      maxTs: row.max_ts,
      txCount: row.tx_count,
      summary: JSON.parse(row.summary_json),
    }));

    let totalTransactionCount = 0;
    for (const entry of catalog) totalTransactionCount += entry.txCount;

    const monthStartDay = head._local?.monthStartDay ?? 1;
    const neededKeys = selectActiveCatalogKeys(catalog, monthStartDay, now);

    const monthRows = new Map<string, JsonObject[]>();
    const loadedMonthKeys = new Set<string>();

    if (neededKeys.length > 0) {
      const placeholders = neededKeys.map(() => "?").join(", ");
      const sliceRows = await database.getAllAsync<{
        month_key: string;
        min_ts: number;
        max_ts: number;
        tx_count: number;
        summary_json: string;
        rows_json: string;
      }>(
        `SELECT month_key, min_ts, max_ts, tx_count, summary_json, rows_json
         FROM app_month_index
         WHERE month_key IN (${placeholders})`,
        ...neededKeys,
      );
      for (const row of sliceRows) {
        const parsedRows = JSON.parse(row.rows_json) as JsonObject[];
        hydrateRowsFromPayload(
          {
            monthKey: row.month_key,
            minTs: row.min_ts,
            maxTs: row.max_ts,
            txCount: row.tx_count,
            summary: JSON.parse(row.summary_json),
            rows: parsedRows,
          },
          monthRows,
          loadedMonthKeys,
        );
      }
      for (const key of neededKeys) {
        if (!loadedMonthKeys.has(key)) {
          monthRows.set(key, []);
          loadedMonthKeys.add(key);
        }
      }
    }

    const state: DocumentWindowState = {
      dbPath: databasePathOf(database),
      revision: headRow.revision,
      isPartial: false,
      totalTransactionCount,
      catalog,
      loadedMonthKeys,
      monthRows,
      database,
    };
    return buildWindowedDocument(head, state);
  } catch {
    return null;
  }
}

/**
 * Marks months overlapping [start, end) that have no transactions as loaded.
 * Returns the same document when months still need ensurePeriodMonthsLoadedAsync.
 */
export function ensurePeriodMonthsLoadedSync(
  document: BackupDocument,
  start: Date,
  end: Date,
): BackupDocument {
  const state = getDocumentWindowState(document);
  if (!state || !state.isPartial) return document;

  const startMs = start.getTime() - 86_400_000;
  const endMs = end.getTime() + 86_400_000;
  const needed = new Set<string>(activeUtcMonthKeysForWindow(start, end));
  for (const entry of state.catalog) {
    if (entry.maxTs >= startMs && entry.minTs < endMs) {
      needed.add(entry.monthKey);
    }
  }

  for (const key of needed) {
    if (!state.loadedMonthKeys.has(key)) {
      const existsInCatalog = state.catalog.some((entry) => entry.monthKey === key);
      if (!existsInCatalog) {
        state.monthRows.set(key, []);
        state.loadedMonthKeys.add(key);
      }
    }
  }
  // Months that exist in the catalog are read from SQLite by
  // ensurePeriodMonthsLoadedAsync; there is no synchronous disk path.
  return document;
}

/** Loads older (cold) months a screen navigates to from the SQLite month index. */
export async function ensurePeriodMonthsLoadedAsync(
  document: BackupDocument,
  start: Date,
  end: Date,
): Promise<BackupDocument> {
  const state = getDocumentWindowState(document);
  if (!state || !state.isPartial) return document;

  const syncResult = ensurePeriodMonthsLoadedSync(document, start, end);
  const nextState = getDocumentWindowState(syncResult);
  if (!nextState || !nextState.isPartial) return syncResult;

  const startMs = start.getTime() - 86_400_000;
  const endMs = end.getTime() + 86_400_000;
  const needed = new Set<string>(activeUtcMonthKeysForWindow(start, end));
  for (const entry of nextState.catalog) {
    if (entry.maxTs >= startMs && entry.minTs < endMs) {
      needed.add(entry.monthKey);
    }
  }

  const missing = [...needed].filter(
    (key) =>
      !nextState.loadedMonthKeys.has(key) &&
      nextState.catalog.some((entry) => entry.monthKey === key),
  );
  if (missing.length === 0) return syncResult;

  const placeholders = missing.map(() => "?").join(", ");
  const rows = await nextState.database.getAllAsync<{
    month_key: string;
    min_ts: number;
    max_ts: number;
    tx_count: number;
    summary_json: string;
    rows_json: string;
  }>(
    `SELECT month_key, min_ts, max_ts, tx_count, summary_json, rows_json
     FROM app_month_index
     WHERE month_key IN (${placeholders})`,
    ...missing,
  );
  for (const row of rows) {
    hydrateRowsFromPayload(
      {
        monthKey: row.month_key,
        minTs: row.min_ts,
        maxTs: row.max_ts,
        txCount: row.tx_count,
        summary: JSON.parse(row.summary_json),
        rows: JSON.parse(row.rows_json) as JsonObject[],
      },
      nextState.monthRows,
      nextState.loadedMonthKeys,
    );
  }
  for (const key of missing) {
    if (!nextState.loadedMonthKeys.has(key)) {
      nextState.monthRows.set(key, []);
      nextState.loadedMonthKeys.add(key);
    }
  }
  evictOldestLoadedMonthsIfNeeded(nextState, needed);
  return buildWindowedDocument(syncResult, nextState);
}

/**
 * Returns pre-aggregated category frequency counts across ALL months (instant O(months), no transaction scan).
 */
export function selectCatalogCategoryCounts(document: BackupDocument): Map<string, number> | null {
  const state = getDocumentWindowState(document);
  if (!state || !state.catalog.length) return null;
  const totals = new Map<string, number>();
  for (const entry of state.catalog) {
    const counts = entry.summary?.categoryCounts;
    if (!counts) continue;
    for (const [categoryId, count] of Object.entries(counts)) {
      totals.set(categoryId, (totals.get(categoryId) ?? 0) + count);
    }
  }
  return totals;
}

/**
 * Returns pre-aggregated account income/expense/count totals across ALL indexed
 * months in O(months), or null if full partition summaries are unavailable.
 */
export function selectCatalogAccountTotals(
  document: BackupDocument,
): Map<string, { income: number; expense: number; count: number }> | null {
  const state = getDocumentWindowState(document);
  if (!state) return null;
  const totals = new Map<string, { income: number; expense: number; count: number }>();
  for (const entry of state.catalog) {
    const accountTotals = entry.summary?.accountTotals;
    if (!accountTotals) {
      if (entry.txCount > 0) return null;
      continue;
    }
    for (const [accountId, stats] of Object.entries(accountTotals)) {
      const existing = totals.get(accountId);
      if (existing) {
        existing.income += stats.income;
        existing.expense += stats.expense;
        existing.count += stats.count;
      } else {
        totals.set(accountId, {
          income: stats.income,
          expense: stats.expense,
          count: stats.count,
        });
      }
    }
  }
  return totals;
}

export async function queryScopedTransactionsAsync(
  document: BackupDocument,
  scope:
    | { kind: "account"; ids: string[] }
    | { kind: "category"; ids: string[] },
): Promise<JsonObject[] | null> {
  const state = getDocumentWindowState(document);
  if (!state) return null;
  if (!scope.ids.length) return [];

  const col = scope.kind === "account" ? "account_id" : "category_id";
  const placeholders = scope.ids.map(() => "?").join(", ");
  const dbRows = await state.database.getAllAsync<{ record_json: string }>(
    `SELECT record_json FROM tx_month_rows WHERE ${col} IN (${placeholders}) ORDER BY timestamp_ms DESC`,
    ...scope.ids,
  );
  const parsed: JsonObject[] = [];
  for (const row of dbRows) {
    const item = JSON.parse(row.record_json) as JsonObject;
    parseRecordTimestampMs(item);
    parsed.push(item);
  }
  return parsed;
}

export function projectWindowedFromFullDocument(
  fullDocument: BackupDocument,
  database: SQLiteDatabase,
  previousWindowDoc: BackupDocument | null,
  syncResult: SyncIndexResult,
  now = new Date(),
): BackupDocument {
  // For small documents, avoid overhead and keep full array.
  if (fullDocument.transactions.length <= 600) {
    return fullDocument;
  }

  // Build windowed projection keeping active window + any months user currently expanded
  const prevState = previousWindowDoc
    ? getDocumentWindowState(previousWindowDoc)
    : undefined;
  const monthStartDay = fullDocument._local?.monthStartDay ?? 1;
  const activeStart = financialMonth(now, monthStartDay, -1).start;
  const activeEnd = financialMonth(now, monthStartDay, 0).end;
  const activeKeys = new Set(activeUtcMonthKeysForWindow(activeStart, activeEnd));
  if (prevState) {
    for (const k of prevState.loadedMonthKeys) activeKeys.add(k);
  }

  // Group fullDocument.transactions into lightweight buckets cleanly in 1 O(N) pass
  const buckets = new Map<string, { rows: JsonObject[]; minTs: number; maxTs: number }>();
  for (const tx of fullDocument.transactions) {
    const ts = parseRecordTimestampMs(tx);
    const key = ts > 0
      ? (() => {
          const d = new Date(ts);
          const m = d.getUTCMonth() + 1;
          return `${d.getUTCFullYear()}-${m < 10 ? "0" : ""}${m}`;
        })()
      : UNDATED_MONTH_KEY;
    let bucket = buckets.get(key);
    if (!bucket) {
      bucket = { rows: [], minTs: ts > 0 ? ts : 0, maxTs: ts > 0 ? ts : 0 };
      buckets.set(key, bucket);
    }
    bucket.rows.push(tx);
    if (ts > 0) {
      if (bucket.minTs === 0 || ts < bucket.minTs) bucket.minTs = ts;
      if (ts > bucket.maxTs) bucket.maxTs = ts;
    }
  }

  // Summaries are always recomputed from the committed document. Reusing the
  // previous UI catalog could keep stale totals when another writer (the
  // headless recurring task) changed a month this save did not touch.
  const catalog: MonthCatalogEntry[] = [...buckets.entries()]
    .sort((a, b) => (a[0] < b[0] ? 1 : a[0] > b[0] ? -1 : 0))
    .map(([monthKey, b]) => {
      return {
        monthKey,
        minTs: b.minTs,
        maxTs: b.maxTs,
        txCount: b.rows.length,
        summary: summarizeMonthBucket(b.rows),
      };
    });

  if (catalog[0]) activeKeys.add(catalog[0].monthKey);

  const monthRows = new Map<string, JsonObject[]>();
  const loadedMonthKeys = new Set<string>();
  for (const key of activeKeys) {
    const bucket = buckets.get(key);
    monthRows.set(
      key,
      bucket
        ? [...bucket.rows].sort(
            (a, b) => parseRecordTimestampMs(b) - parseRecordTimestampMs(a),
          )
        : [],
    );
    loadedMonthKeys.add(key);
  }

  const state: DocumentWindowState = {
    dbPath: databasePathOf(database),
    revision: syncResult.revision,
    isPartial: false,
    totalTransactionCount: fullDocument.transactions.length,
    catalog,
    loadedMonthKeys,
    monthRows,
    database,
  };
  return buildWindowedDocument(fullDocument, state);
}
