import type { SQLiteDatabase } from "expo-sqlite";

import PlutusFastStoreModule from "../../../modules/plutus-fast-store/src/PlutusFastStoreModule";
import type { NativeSearchQueryOptions } from "../../../modules/plutus-fast-store/src/PlutusFastStore.types";
import type { BackupDocument } from "../model/backup-document";
import { financialMonth } from "../model/financial-month";
import type { JsonObject } from "../model/json";
import {
  activeUtcMonthKeysForWindow,
  getDocumentWindowState,
  LOCAL_DATABASE_NAME,
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
  PlutusFastStoreModule?.evictColdMonthsSync([...state.loadedMonthKeys]);
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

/**
 * Attempts synchronous zero-waterfall bootstrap on native Swift/Kotlin via JSI.
 * Returns null if native FastStore isn't available or indexes aren't built yet.
 */
export function readNativeWindowBootstrapSync(
  database: SQLiteDatabase,
  now = new Date(),
): BackupDocument | null {
  if (!PlutusFastStoreModule) return null;
  const dbPath = databasePathOf(database);
  const current = financialMonth(now, 1, 0);
  const prev = financialMonth(now, 1, -1);
  // Request current + previous + padded calendar month keys cleanly on first frame.
  const initialKeys = activeUtcMonthKeysForWindow(prev.start, current.end);
  const bootstrap = PlutusFastStoreModule.readBootstrapSync(
    dbPath,
    LOCAL_DATABASE_NAME,
    initialKeys,
  );
  if (!bootstrap) return null;

  try {
    const head = JSON.parse(bootstrap.coreJson) as BackupDocument;
    const catalog = JSON.parse(bootstrap.catalogJson) as MonthCatalogEntry[];
    const monthStartDay = head._local?.monthStartDay ?? 1;
    const neededKeys = selectActiveCatalogKeys(catalog, monthStartDay, now);

    const monthRows = new Map<string, JsonObject[]>();
    const loadedMonthKeys = new Set<string>();
    let totalTransactionCount = 0;
    for (const entry of catalog) totalTransactionCount += entry.txCount;

    for (const key of neededKeys) {
      const rawMonth =
        bootstrap.months[key] ??
        PlutusFastStoreModule.readMonthSliceSync(dbPath, LOCAL_DATABASE_NAME, key)
          ?.payloadJson ??
        null;
      if (!rawMonth) {
        monthRows.set(key, []);
        loadedMonthKeys.add(key);
        continue;
      }
      const parsed = JSON.parse(rawMonth) as MonthPartitionPayload;
      hydrateRowsFromPayload(parsed, monthRows, loadedMonthKeys);
    }

    const state: DocumentWindowState = {
      dbPath,
      revision: bootstrap.revision,
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
 * Asynchronous SQLite windowed bootstrap (works on Node/Android/iOS/Web even if native cache wasn't warm yet).
 */
export async function readIndexedWindowBootstrap(
  database: SQLiteDatabase,
  now = new Date(),
): Promise<BackupDocument | null> {
  const nativeSync = readNativeWindowBootstrapSync(database, now);
  if (nativeSync) return nativeSync;

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
 * Ensures any months overlapping [start, end) are hydrated in memory.
 * On native Swift/Kotlin, loads synchronously via JSI in ~1ms with no loading spinner.
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

  const missing: string[] = [];
  for (const key of needed) {
    if (!state.loadedMonthKeys.has(key)) {
      const existsInCatalog = state.catalog.some((entry) => entry.monthKey === key);
      if (existsInCatalog) missing.push(key);
      else {
        state.monthRows.set(key, []);
        state.loadedMonthKeys.add(key);
      }
    }
  }
  if (missing.length === 0) return document;
  if (!PlutusFastStoreModule) return document;

  let changed = false;
  for (const key of missing) {
    const slice = PlutusFastStoreModule.readMonthSliceSync(
      state.dbPath,
      LOCAL_DATABASE_NAME,
      key,
    );
    if (slice?.payloadJson) {
      try {
        const parsed = JSON.parse(slice.payloadJson) as MonthPartitionPayload;
        hydrateRowsFromPayload(parsed, state.monthRows, state.loadedMonthKeys);
        changed = true;
      } catch {
        // Ignore corrupt single slice payload and fallback to SQLite path
      }
    } else {
      state.monthRows.set(key, []);
      state.loadedMonthKeys.add(key);
      changed = true;
    }
  }

  if (!changed) return document;
  evictOldestLoadedMonthsIfNeeded(state, needed);
  return buildWindowedDocument(document, state);
}

/**
 * Async fallback when native JSI isn't present and a user navigates to an older cold month.
 */
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

export function searchIndexedDatabaseSync(
  document: BackupDocument,
  options: NativeSearchQueryOptions,
): { totalCount: number; rows: JsonObject[] } | null {
  const state = getDocumentWindowState(document);
  if (!state || !PlutusFastStoreModule) return null;
  try {
    const result = PlutusFastStoreModule.searchTransactionsSync(
      state.dbPath,
      LOCAL_DATABASE_NAME,
      options,
    );
    const rows = JSON.parse(result.rowsJson) as JsonObject[];
    for (const row of rows) parseRecordTimestampMs(row);
    return { totalCount: result.totalCount, rows };
  } catch {
    return null;
  }
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

  if (PlutusFastStoreModule) {
    const res = PlutusFastStoreModule.searchTransactionsSync(
      state.dbPath,
      LOCAL_DATABASE_NAME,
      scope.kind === "account"
        ? { accountIds: scope.ids, limit: 50000, sort: "newest" }
        : { categoryIds: scope.ids, limit: 50000, sort: "newest" },
    );
    const parsed = JSON.parse(res.rowsJson) as JsonObject[];
    for (const row of parsed) parseRecordTimestampMs(row);
    return parsed;
  }

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

  const prevCatalogMap = new Map<string, MonthCatalogEntry>();
  if (prevState) {
    for (const item of prevState.catalog) prevCatalogMap.set(item.monthKey, item);
  }

  const catalog: MonthCatalogEntry[] = [...buckets.entries()]
    .sort((a, b) => (a[0] < b[0] ? 1 : a[0] > b[0] ? -1 : 0))
    .map(([monthKey, b]) => {
      const prevEntry = prevCatalogMap.get(monthKey);
      const isDirty =
        syncResult.rebuiltAll ||
        (syncResult.dirtyMonthKeys?.includes(monthKey) ?? false);
      if (prevEntry && !isDirty) {
        return prevEntry;
      }
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

export function triggerNativePartitionSync(
  database: SQLiteDatabase,
  syncResult: SyncIndexResult | null | undefined,
): void {
  if (!PlutusFastStoreModule || !syncResult) return;
  const dbPath = databasePathOf(database);
  void PlutusFastStoreModule.syncPartitionFilesAsync(
    dbPath,
    LOCAL_DATABASE_NAME,
    syncResult.dirtyMonthKeys,
    syncResult.rebuiltAll,
  ).catch(() => undefined);
}

export function clearNativePartitionCache(): void {
  try {
    PlutusFastStoreModule?.clearCacheSync();
  } catch {
    // Ignore native cleanup errors
  }
}
