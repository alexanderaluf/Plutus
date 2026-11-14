import type { SQLiteDatabase } from "expo-sqlite";

import type { BackupDocument } from "../model/backup-document";
import type { JsonObject } from "../model/json";

export const LOCAL_DATABASE_NAME = "budget-manager.db";
export const UNDATED_MONTH_KEY = "undated";

/** Non-enumerable WeakMap caching parsed timestamps for fast zero-Date.parse indexing. */
const recordTimestampCache = new WeakMap<JsonObject, number>();

export type AccountMonthTotal = {
  income: number;
  expense: number;
  count: number;
};

export type MonthSummary = {
  txCount: number;
  earliestMs: number;
  latestMs: number;
  categoryCounts: Record<string, number>;
  accountTotals?: Record<string, AccountMonthTotal>;
  accountIds: string[];
  currencyCodes: string[];
  profileIds: string[];
};

export type MonthCatalogEntry = {
  monthKey: string;
  minTs: number;
  maxTs: number;
  txCount: number;
  summary: MonthSummary;
};

export type MonthPartitionPayload = {
  monthKey: string;
  minTs: number;
  maxTs: number;
  txCount: number;
  summary: MonthSummary;
  rows: JsonObject[];
};

export type DocumentWindowState = {
  dbPath: string | null;
  revision: number;
  isPartial: boolean;
  totalTransactionCount: number;
  catalog: MonthCatalogEntry[];
  loadedMonthKeys: Set<string>;
  monthRows: Map<string, JsonObject[]>;
  database: SQLiteDatabase;
};

const documentWindowMap = new WeakMap<BackupDocument, DocumentWindowState>();

export function getDocumentWindowState(document: BackupDocument): DocumentWindowState | undefined {
  return documentWindowMap.get(document);
}

export function setDocumentWindowState(
  document: BackupDocument,
  state: DocumentWindowState,
): void {
  documentWindowMap.set(document, state);
}

export function parseRecordTimestampMs(record: JsonObject): number {
  const cached = recordTimestampCache.get(record);
  if (cached !== undefined) return cached;

  const preindexed = record._txMs;
  if (typeof preindexed === "number" && Number.isFinite(preindexed)) {
    recordTimestampCache.set(record, preindexed);
    return preindexed;
  }

  const raw =
    typeof record.date === "string" && record.date
      ? record.date
      : typeof record.createdAt === "string"
        ? record.createdAt
        : "";
  const parsed = raw ? Date.parse(raw) : NaN;
  const ts = Number.isFinite(parsed) ? parsed : NaN;
  recordTimestampCache.set(record, ts);
  return ts;
}

export function cacheRecordTimestampMs(record: JsonObject, ts: number): void {
  if (Number.isFinite(ts)) recordTimestampCache.set(record, ts);
}

export function utcMonthKeyFromMs(ts: number): string {
  if (!Number.isFinite(ts) || ts <= 0) return UNDATED_MONTH_KEY;
  const date = new Date(ts);
  const y = date.getUTCFullYear();
  const m = date.getUTCMonth() + 1;
  return `${y}-${m < 10 ? "0" : ""}${m}`;
}

export function calendarMonthKeyFromDate(date: Date): string {
  const y = date.getUTCFullYear();
  const m = date.getUTCMonth() + 1;
  return `${y}-${m < 10 ? "0" : ""}${m}`;
}

/**
 * Computes UTC month keys that could possibly overlap [start, end) including
 * a 1-day margin on either side for local timezone shifts vs UTC month splits.
 */
export function activeUtcMonthKeysForWindow(start: Date, end: Date): string[] {
  const paddedStart = new Date(start.getTime() - 86_400_000);
  const paddedEnd = new Date(Math.max(paddedStart.getTime(), end.getTime() + 86_400_000));
  const keys: string[] = [];
  let y = paddedStart.getUTCFullYear();
  let m = paddedStart.getUTCMonth();
  const endY = paddedEnd.getUTCFullYear();
  const endM = paddedEnd.getUTCMonth();
  while (y < endY || (y === endY && m <= endM)) {
    const mm = m + 1;
    keys.push(`${y}-${mm < 10 ? "0" : ""}${mm}`);
    m += 1;
    if (m >= 12) {
      m = 0;
      y += 1;
    }
  }
  return keys;
}

export const MONTH_INDEX_SCHEMA_SQL = `
CREATE TABLE IF NOT EXISTS app_meta_head (
  id INTEGER PRIMARY KEY CHECK (id = 1),
  schema_version INTEGER NOT NULL,
  revision INTEGER NOT NULL,
  tx_count INTEGER NOT NULL,
  min_tx_ts INTEGER NOT NULL,
  max_tx_ts INTEGER NOT NULL,
  doc_bytes INTEGER NOT NULL,
  had_profile INTEGER NOT NULL,
  updated_at TEXT NOT NULL,
  core_json TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS app_month_index (
  month_key TEXT PRIMARY KEY,
  revision INTEGER NOT NULL,
  min_ts INTEGER NOT NULL,
  max_ts INTEGER NOT NULL,
  tx_count INTEGER NOT NULL,
  summary_json TEXT NOT NULL,
  rows_json TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_app_month_range ON app_month_index(min_ts, max_ts);
CREATE TABLE IF NOT EXISTS tx_month_rows (
  uuid TEXT PRIMARY KEY,
  month_key TEXT NOT NULL,
  timestamp_ms INTEGER NOT NULL,
  user_id TEXT NOT NULL,
  account_id TEXT NOT NULL,
  category_id TEXT NOT NULL,
  recurring_id TEXT NOT NULL,
  budget_id TEXT NOT NULL,
  type INTEGER NOT NULL,
  amount REAL NOT NULL,
  currency_code TEXT NOT NULL,
  has_note INTEGER NOT NULL DEFAULT 0,
  has_receipt INTEGER NOT NULL DEFAULT 0,
  search_text TEXT NOT NULL,
  record_json TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_tx_rows_ts ON tx_month_rows(timestamp_ms DESC, uuid);
CREATE INDEX IF NOT EXISTS idx_tx_rows_month_ts ON tx_month_rows(month_key, timestamp_ms DESC);
CREATE INDEX IF NOT EXISTS idx_tx_rows_user_ts ON tx_month_rows(user_id, timestamp_ms DESC);
CREATE INDEX IF NOT EXISTS idx_tx_rows_acc_ts ON tx_month_rows(account_id, timestamp_ms DESC);
CREATE INDEX IF NOT EXISTS idx_tx_rows_cat_ts ON tx_month_rows(category_id, timestamp_ms DESC);
`;

export function normalizeTextForIndex(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[\u0300-\u036f\u0591-\u05c7]/g, "")
    .replace(/\s+/g, " ");
}

function stableRecordKey(record: JsonObject, fallbackIndex: number): string {
  if (typeof record.uuid === "string" && record.uuid) return record.uuid;
  if (typeof record.id === "number" && Number.isFinite(record.id)) {
    return String(record.id);
  }
  if (typeof record.id === "string" && record.id) return record.id;
  return `__row_${fallbackIndex}`;
}

function buildLookupNameMap(records: JsonObject[]): Map<string, string> {
  const map = new Map<string, string>();
  for (const item of records) {
    const label = typeof item.name === "string" ? item.name : "";
    if (!label) continue;
    if (typeof item.uuid === "string" && item.uuid) map.set(item.uuid, label);
    if (typeof item.id === "string" && item.id) map.set(item.id, label);
    else if (typeof item.id === "number" && Number.isFinite(item.id)) {
      map.set(String(item.id), label);
    }
  }
  return map;
}

function idText(value: unknown): string {
  if (typeof value === "string") return value;
  if (typeof value === "number" && Number.isFinite(value)) return String(value);
  return "";
}

function buildRowSearchText(
  tx: JsonObject,
  categories: Map<string, string>,
  accounts: Map<string, string>,
  places: Map<string, string>,
  people: Map<string, string>,
  labels: Map<string, string>,
): string {
  const parts: string[] = [];
  if (typeof tx.name === "string" && tx.name) parts.push(tx.name);
  if (typeof tx.description === "string" && tx.description) {
    parts.push(tx.description);
  }
  const catName = categories.get(idText(tx.category ?? tx.categoryId));
  if (catName) parts.push(catName);
  const accName = accounts.get(idText(tx.account ?? tx.accountId));
  if (accName) parts.push(accName);
  const placeName = places.get(idText(tx.place ?? tx.placeId));
  if (placeName) parts.push(placeName);
  const personName = people.get(idText(tx.person ?? tx.personId));
  if (personName) parts.push(personName);
  if (Array.isArray(tx.tags)) {
    for (const tag of tx.tags) {
      const labelName = labels.get(idText(tag));
      if (labelName) parts.push(labelName);
    }
  }
  if (typeof tx.currencyCode === "string" && tx.currencyCode) {
    parts.push(tx.currencyCode);
  }
  return normalizeTextForIndex(parts.join(" "));
}

export function summarizeMonthBucket(rows: JsonObject[]): MonthSummary {
  const categoryCounts: Record<string, number> = Object.create(null);
  const accountTotals: Record<string, AccountMonthTotal> = Object.create(null);
  const accountSet = new Set<string>();
  const currencySet = new Set<string>();
  const profileSet = new Set<string>();
  let earliestMs = Infinity;
  let latestMs = -Infinity;

  for (const tx of rows) {
    const ts = parseRecordTimestampMs(tx);
    if (ts > 0) {
      if (ts < earliestMs) earliestMs = ts;
      if (ts > latestMs) latestMs = ts;
    }
    const categoryId = idText(tx.category ?? tx.categoryId);
    if (categoryId) {
      categoryCounts[categoryId] = (categoryCounts[categoryId] ?? 0) + 1;
    }
    const accountId = idText(tx.account ?? tx.accountId);
    if (accountId) {
      accountSet.add(accountId);
      let entry = accountTotals[accountId];
      if (!entry) {
        entry = { income: 0, expense: 0, count: 0 };
        accountTotals[accountId] = entry;
      }
      entry.count += 1;
      if (tx.type === 1 || tx.type === 0) {
        const rawAmount =
          typeof tx.accountAmount === "number" &&
          Number.isFinite(tx.accountAmount)
            ? tx.accountAmount
            : typeof tx.amount === "number" && Number.isFinite(tx.amount)
              ? tx.amount
              : 0;
        const amount = Math.abs(rawAmount);
        if (tx.type === 1) entry.income += amount;
        else entry.expense += amount;
      }
    }
    if (typeof tx.currencyCode === "string" && tx.currencyCode) {
      currencySet.add(tx.currencyCode);
    }
    const userId = idText(tx.user ?? tx.userId);
    if (userId) profileSet.add(userId);
  }

  return {
    txCount: rows.length,
    earliestMs: Number.isFinite(earliestMs) ? earliestMs : 0,
    latestMs: Number.isFinite(latestMs) ? latestMs : 0,
    categoryCounts,
    accountTotals,
    accountIds: [...accountSet],
    currencyCodes: [...currencySet],
    profileIds: [...profileSet],
  };
}

export function stripTransactionsForHead(document: BackupDocument): BackupDocument {
  return {
    ...document,
    transactions: [],
  };
}

function partitionTransactionsByMonth(transactions: JsonObject[]) {
  const buckets = new Map<string, { rows: JsonObject[]; minTs: number; maxTs: number }>();
  for (const tx of transactions) {
    const ts = parseRecordTimestampMs(tx);
    const key = utcMonthKeyFromMs(ts);
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
  for (const bucket of buckets.values()) {
    bucket.rows.sort((a, b) => {
      const tb = parseRecordTimestampMs(b);
      const ta = parseRecordTimestampMs(a);
      return (Number.isFinite(tb) ? tb : -Infinity) - (Number.isFinite(ta) ? ta : -Infinity);
    });
  }
  return buckets;
}

function collectDirtyMonths(
  previous: BackupDocument | null,
  next: BackupDocument,
): string[] | null {
  if (!previous) return null;
  // Lookup table changes (categories, accounts, labels, places, people) can affect search_text.
  if (
    previous.categories !== next.categories ||
    previous.accounts !== next.accounts ||
    previous.places !== next.places ||
    previous.peoples !== next.peoples ||
    previous.labels !== next.labels
  ) {
    // Only mark full rebuild if lookup names/entries actually changed.
    if (
      previous.categories.length !== next.categories.length ||
      previous.places !== next.places ||
      previous.peoples !== next.peoples ||
      previous.labels !== next.labels
    ) {
      return null;
    }
    const accChanged =
      previous.accounts.length !== next.accounts.length ||
      next.accounts.some((acc, i) => acc.name !== previous.accounts[i]?.name);
    const catChanged = next.categories.some(
      (cat, i) => cat.name !== previous.categories[i]?.name,
    );
    if (accChanged || catChanged) return null;
  }

  if (previous.transactions === next.transactions) return [];

  const prevByKey = new Map<string, JsonObject>();
  previous.transactions.forEach((tx, index) => {
    prevByKey.set(stableRecordKey(tx, index), tx);
  });

  const dirty = new Set<string>();
  next.transactions.forEach((tx, index) => {
    const key = stableRecordKey(tx, index);
    const old = prevByKey.get(key);
    if (!old) {
      dirty.add(utcMonthKeyFromMs(parseRecordTimestampMs(tx)));
      return;
    }
    prevByKey.delete(key);
    if (old !== tx) {
      dirty.add(utcMonthKeyFromMs(parseRecordTimestampMs(old)));
      dirty.add(utcMonthKeyFromMs(parseRecordTimestampMs(tx)));
    }
  });

  for (const removed of prevByKey.values()) {
    dirty.add(utcMonthKeyFromMs(parseRecordTimestampMs(removed)));
  }

  return [...dirty];
}

export type SyncIndexResult = {
  revision: number;
  dirtyMonthKeys: string[] | null;
  rebuiltAll: boolean;
};

/**
 * Ensures index schema exists and incrementally updates `app_meta_head`,
 * `app_month_index`, and `tx_month_rows` inside the caller's active transaction.
 */
export async function syncSqliteMonthIndexes(
  database: SQLiteDatabase,
  document: BackupDocument,
  options: {
    previousDocument?: BackupDocument | null;
    docBytes: number;
    hadProfile: number;
    updatedAt: string;
    forceRebuild?: boolean;
  },
): Promise<SyncIndexResult> {
  await database.execAsync(MONTH_INDEX_SCHEMA_SQL);

  const headRow = await database.getFirstAsync<{ revision: number }>(
    "SELECT revision FROM app_meta_head WHERE id = 1",
  );
  const existingRev = typeof headRow?.revision === "number" ? headRow.revision : 0;
  const revision = existingRev + 1;

  let dirtyMonths = options.forceRebuild || existingRev === 0
    ? null
    : collectDirtyMonths(options.previousDocument ?? null, document);

  const transactions = document.transactions;
  let minTxTs = 0;
  let maxTxTs = 0;
  for (const tx of transactions) {
    const ts = parseRecordTimestampMs(tx);
    if (ts > 0) {
      if (minTxTs === 0 || ts < minTxTs) minTxTs = ts;
      if (ts > maxTxTs) maxTxTs = ts;
    }
  }

  const headDoc = stripTransactionsForHead(document);
  await database.runAsync(
    `INSERT INTO app_meta_head (id, schema_version, revision, tx_count, min_tx_ts, max_tx_ts, doc_bytes, had_profile, updated_at, core_json)
     VALUES (1, ?, ?, ?, ?, ?, ?, ?, ?, ?)
     ON CONFLICT(id) DO UPDATE SET
       schema_version = excluded.schema_version,
       revision = excluded.revision,
       tx_count = excluded.tx_count,
       min_tx_ts = excluded.min_tx_ts,
       max_tx_ts = excluded.max_tx_ts,
       doc_bytes = excluded.doc_bytes,
       had_profile = excluded.had_profile,
       updated_at = excluded.updated_at,
       core_json = excluded.core_json`,
    document._local.schemaVersion,
    revision,
    transactions.length,
    minTxTs,
    maxTxTs,
    options.docBytes,
    options.hadProfile,
    options.updatedAt,
    JSON.stringify(headDoc),
  );

  // If previousDocument was null only because it wasn't cached, check if row count changed vs existing
  if (dirtyMonths !== null && dirtyMonths.length === 0 && existingRev > 0) {
    return { revision, dirtyMonthKeys: [], rebuiltAll: false };
  }

  const buckets = partitionTransactionsByMonth(transactions);
  const categories = buildLookupNameMap(document.categories);
  const accounts = buildLookupNameMap(document.accounts);
  const places = buildLookupNameMap(document.places);
  const people = buildLookupNameMap(document.peoples);
  const labels = buildLookupNameMap(document.labels);

  const rebuiltAll = dirtyMonths === null;
  if (rebuiltAll) {
    await database.runAsync("DELETE FROM app_month_index");
    await database.runAsync("DELETE FROM tx_month_rows");
    dirtyMonths = [...buckets.keys()];
  }

  const seenUuids = new Set<string>();
  let fallbackCounter = 0;

  for (const monthKey of dirtyMonths!) {
    const bucket = buckets.get(monthKey);
    if (!rebuiltAll) {
      await database.runAsync("DELETE FROM tx_month_rows WHERE month_key = ?", monthKey);
    }
    if (!bucket || !bucket.rows.length) {
      await database.runAsync("DELETE FROM app_month_index WHERE month_key = ?", monthKey);
      continue;
    }

    const summary = summarizeMonthBucket(bucket.rows);
    await database.runAsync(
      `INSERT INTO app_month_index (month_key, revision, min_ts, max_ts, tx_count, summary_json, rows_json, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)
       ON CONFLICT(month_key) DO UPDATE SET
         revision = excluded.revision,
         min_ts = excluded.min_ts,
         max_ts = excluded.max_ts,
         tx_count = excluded.tx_count,
         summary_json = excluded.summary_json,
         rows_json = excluded.rows_json,
         updated_at = excluded.updated_at`,
      monthKey,
      revision,
      bucket.minTs,
      bucket.maxTs,
      bucket.rows.length,
      JSON.stringify(summary),
      JSON.stringify(bucket.rows),
      options.updatedAt,
    );

    const seenUuidsForMonth: Array<
      [
        string,
        string,
        number,
        string,
        string,
        string,
        string,
        string,
        number,
        number,
        string,
        number,
        number,
        string,
        string,
      ]
    > = [];

    for (const tx of bucket.rows) {
      let rowKey = stableRecordKey(tx, fallbackCounter++);
      if (seenUuids.has(rowKey)) {
        rowKey = `${rowKey}__dup_${fallbackCounter}`;
      }
      seenUuids.add(rowKey);

      const ts = parseRecordTimestampMs(tx);
      const userId = idText(tx.user ?? tx.userId);
      const accountId = idText(tx.account ?? tx.accountId);
      const categoryId = idText(tx.category ?? tx.categoryId);
      const recurringId = idText(tx.recurring ?? tx.recurringId);
      const budgetId = idText(tx.budget ?? tx.budgetId);
      const type =
        typeof tx.type === "number" && Number.isFinite(tx.type)
          ? Math.trunc(tx.type)
          : 0;
      const amount =
        typeof tx.amount === "number" && Number.isFinite(tx.amount)
          ? tx.amount
          : 0;
      const currencyCode = typeof tx.currencyCode === "string" ? tx.currencyCode : "";
      const hasNote =
        typeof tx.description === "string" && tx.description.trim().length > 0 ? 1 : 0;
      const hasReceipt =
        (typeof tx.receipt === "string" && tx.receipt.trim().length > 0) ||
        (typeof tx.image === "string" && tx.image.trim().length > 0) ||
        (typeof tx.attachmentId === "string" && tx.attachmentId.trim().length > 0)
          ? 1
          : 0;
      const searchText = buildRowSearchText(
        tx,
        categories,
        accounts,
        places,
        people,
        labels,
      );

      seenUuidsForMonth.push([
        rowKey,
        monthKey,
        Number.isFinite(ts) ? Math.trunc(ts) : 0,
        userId,
        accountId,
        categoryId,
        recurringId,
        budgetId,
        type,
        amount,
        currencyCode,
        hasNote,
        hasReceipt,
        searchText,
        JSON.stringify(tx),
      ]);
    }

    const BATCH_SIZE = 40;
    const ROW_PLACEHOLDERS = "(?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)";
    for (let i = 0; i < seenUuidsForMonth.length; i += BATCH_SIZE) {
      const batch = seenUuidsForMonth.slice(i, i + BATCH_SIZE);
      const placeholders = batch.map(() => ROW_PLACEHOLDERS).join(", ");
      const params: (string | number)[] = [];
      for (const row of batch) params.push(...row);
      await database.runAsync(
        `INSERT OR REPLACE INTO tx_month_rows (
          uuid, month_key, timestamp_ms, user_id, account_id, category_id,
          recurring_id, budget_id, type, amount, currency_code,
          has_note, has_receipt, search_text, record_json
        ) VALUES ${placeholders}`,
        ...params,
      );
    }
  }

  return { revision, dirtyMonthKeys: dirtyMonths, rebuiltAll };
}
