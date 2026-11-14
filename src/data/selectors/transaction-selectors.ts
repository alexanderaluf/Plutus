import { i18n } from "@/localization/i18n";
import type { Transaction } from "@/features/home/types";
import type { FilledIconName } from "@/shared/ui/filled-icon";
import type { BackupDocument } from "../model/backup-document";
import { parseRecordTimestampMs } from "../database/month-index";
import type { JsonObject, JsonValue } from "../model/json";
import { identity, createProfileMatcher } from "../model/category-record";
import { formatAppDate } from "../model/onboarding";
import { sortProjection } from "./cooperative";
import { memoizeForDocument } from "./document-memo";

const colors = ["#70d2eb", "#b89cf5", "#f2c66d", "#ef8175"];
function text(value: JsonValue | undefined, fallback = "") {
  return typeof value === "string" ? value : fallback;
}
function number(value: JsonValue | undefined, fallback = 0) {
  return typeof value === "number" && Number.isFinite(value) ? value : fallback;
}
function recordId(record: JsonObject, index: number) {
  return text(record.uuid, String(record.id ?? index));
}
function categoryIcon(category: string): FilledIconName {
  const value = category.toLowerCase();
  if (value.includes("food") || value.includes("dining")) return "food";
  if (value.includes("grocer") || value.includes("shopping")) return "shopping";
  if (value.includes("coffee")) return "coffee";
  if (value.includes("transport") || value.includes("car")) return "car";
  if (value.includes("salary") || value.includes("income")) return "wallet";
  if (value.includes("housing") || value.includes("rent")) return "home";
  return "cash";
}
function transactionDate(
  record: JsonObject,
  document: BackupDocument,
  unknownDate: string,
) {
  const timestamp = parseRecordTimestampMs(record);
  return !Number.isFinite(timestamp)
    ? unknownDate
    : formatAppDate(new Date(timestamp), document._local.dateFormat);
}

/** Alias lookup retains the first match, just like references + Array.find. */
export function createRecordLookup(records: JsonObject[]) {
  const byId = new Map<string, JsonObject>();
  for (const record of records) {
    for (const value of [record.uuid, record.id]) {
      if (value != null && !byId.has(String(value)))
        byId.set(String(value), record);
    }
  }
  return {
    get: (value: JsonValue | undefined) =>
      value == null ? undefined : byId.get(String(value)),
  };
}
function relatedName(
  records: ReturnType<typeof createRecordLookup>,
  value: JsonValue | undefined,
) {
  return text(records.get(value)?.name);
}

export type TransactionIndexEntry = {
  id: string;
  record: JsonObject;
  index: number;
  timestamp: number;
};

/**
 * Only dates/identities are indexed. Formatting and relation projection stay
 * lazy. Built once per committed document and shared by every screen; callers
 * must treat the returned array as read-only.
 */
export function createTransactionIndex(
  document: BackupDocument,
): TransactionIndexEntry[] {
  return memoizeForDocument(document, "transaction-index", () =>
    buildTransactionIndex(document),
  );
}

/**
 * `new Date(date ?? createdAt).getTime()` for every transaction by document
 * position (NaN when unparseable). Date-string parsing dominates history
 * scans, so it happens exactly once per committed document and is shared by
 * the index, account totals and any other date-bounded projection.
 */
export function transactionTimestamps(document: BackupDocument) {
  return memoizeForDocument(document, "transaction-timestamps", () =>
    Float64Array.from(document.transactions, (record) =>
      parseRecordTimestampMs(record),
    ),
  );
}

/** Same ordering as `iterateTransactionIndex`, using the engine's native sort. */
function buildTransactionIndex(document: BackupDocument) {
  const belongs = createProfileMatcher(document);
  const timestamps = transactionTimestamps(document);
  const entries: TransactionIndexEntry[] = [];
  for (let position = 0; position < document.transactions.length; position++) {
    const record = document.transactions[position];
    if (!belongs(record)) continue;
    const index = entries.length;
    const timestamp = timestamps[position];
    entries.push({
      id: recordId(record, index),
      record,
      index,
      timestamp: Number.isFinite(timestamp) ? timestamp : -Infinity,
    });
  }
  // Newest first; equal timestamps keep document order (explicitly, so the
  // result never depends on the engine's sort stability).
  return entries.sort((a, b) =>
    a.timestamp === b.timestamp
      ? a.index - b.index
      : a.timestamp > b.timestamp
        ? -1
        : 1,
  );
}

export type MonthSlice = { key: string; first: number; last: number };

/**
 * Per-calendar-month partitions of the shared index (`YYYY-MM` → slice
 * bounds). Built in one linear pass after the sort; a month lookup is O(1).
 */
export function selectTransactionMonths(
  document: BackupDocument,
): Map<string, MonthSlice> {
  return memoizeForDocument(document, "transaction-months", () => {
    const index = createTransactionIndex(document);
    const months = new Map<string, MonthSlice>();
    let current: MonthSlice | undefined;
    for (let position = 0; position < index.length; position++) {
      const { timestamp } = index[position];
      if (!Number.isFinite(timestamp)) break;
      const date = new Date(timestamp);
      const key = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`;
      if (current?.key !== key) {
        current = { key, first: position, last: position + 1 };
        months.set(key, current);
      } else current.last = position + 1;
    }
    return months;
  });
}

/**
 * Candidate profile-owned records for [start, end), in original document order.
 *
 * Returns the indexed period plus every record the index could not date (they
 * sort to the tail and are normally absent). Callers keep their own date
 * checks, so the result is exactly what filtering all of `document.transactions`
 * with the profile matcher would accept, while touching only one period.
 */
export function selectPeriodTransactionCandidates(
  document: BackupDocument,
  start: Date,
  end: Date,
): JsonObject[] {
  return memoizeForDocument(
    document,
    `period:${start.getTime()}:${end.getTime()}`,
    () => {
      const index = createTransactionIndex(document);
      const candidates = selectTransactionPeriod(index, start, end);
      for (
        let position = index.length - 1;
        position >= 0 && index[position].timestamp === -Infinity;
        position--
      )
        candidates.push(index[position]);
      return candidates
        .sort((a, b) => a.index - b.index)
        .map((entry) => entry.record);
    },
  );
}

/** O(1) lookup of an indexed entry by its row id, built once per document. */
export function selectTransactionEntry(
  document: BackupDocument,
  id: string,
): TransactionIndexEntry | undefined {
  return memoizeForDocument(document, "transaction-ids", () => {
    const byId = new Map<string, TransactionIndexEntry>();
    for (const entry of createTransactionIndex(document))
      if (!byId.has(entry.id)) byId.set(entry.id, entry);
    return byId;
  }).get(id);
}

/** Projects a single transaction instead of every record in the document. */
export function selectTransaction(
  document: BackupDocument,
  id: string,
): Transaction | undefined {
  const entry = selectTransactionEntry(document, id);
  return entry
    ? selectTransactionProjector(document, i18n.resolvedLanguage)(entry)
    : undefined;
}

/** Shared relation maps per document and language. */
export function selectTransactionProjector(
  document: BackupDocument,
  language = i18n.resolvedLanguage,
) {
  return memoizeForDocument(document, `projector:${language ?? ""}`, () =>
    createTransactionProjector(document, language),
  );
}

export function* iterateTransactionIndex(document: BackupDocument) {
  const belongs = createProfileMatcher(document);
  const entries: TransactionIndexEntry[] = [];
  for (let position = 0; position < document.transactions.length; position++) {
    if (position % 64 === 0) yield;
    const record = document.transactions[position];
    if (!belongs(record)) continue;
    const index = entries.length;
    const timestamp = parseRecordTimestampMs(record);
    entries.push({
      id: recordId(record, index),
      record,
      index,
      timestamp: Number.isFinite(timestamp) ? timestamp : -Infinity,
    });
  }
  return yield* sortProjection(entries, (a, b) =>
    a.timestamp === b.timestamp ? 0 : a.timestamp > b.timestamp ? -1 : 1,
  );
}

/** Binary boundaries avoid rescanning older history when the month changes. */
export function transactionPeriodBounds(
  index: TransactionIndexEntry[],
  start: Date,
  end: Date,
) {
  const firstBefore = (timestamp: number) => {
    let low = 0,
      high = index.length;
    while (low < high) {
      const middle = (low + high) >>> 1;
      if (index[middle].timestamp >= timestamp) low = middle + 1;
      else high = middle;
    }
    return low;
  };
  const first = firstBefore(end.getTime());
  const last = firstBefore(start.getTime());
  return { first, last, count: last - first };
}

export function selectTransactionPeriod(
  index: TransactionIndexEntry[],
  start: Date,
  end: Date,
  limit = Infinity,
) {
  const { first, last } = transactionPeriodBounds(index, start, end);
  return index.slice(first, Math.min(last, first + limit));
}

/** Stream raw records from binary date bounds without a full-month copy. */
export function* transactionRecordsInPeriod(
  index: TransactionIndexEntry[],
  start: Date,
  end: Date,
) {
  const bounds = transactionPeriodBounds(index, start, end);
  for (let position = bounds.first; position < bounds.last; position++)
    yield index[position].record;
}

/** Build relation maps once; each mounted row projects only its own record. */
export function createTransactionProjector(
  document: BackupDocument,
  language = i18n.resolvedLanguage,
) {
  const t = i18n.getFixedT(language ?? "en", "translation");
  const categories = createRecordLookup(document.categories);
  const accounts = createRecordLookup(document.accounts);
  const budgets = createRecordLookup(document.budgets);
  const labels = createRecordLookup(document.labels);
  const loans = createRecordLookup(document.loans);
  const places = createRecordLookup(document.places);
  const peoples = createRecordLookup(document.peoples);
  return ({ record, index }: TransactionIndexEntry): Transaction => {
    const categoryRecord = categories.get(record.category);
    const accountRecord = accounts.get(
      record.account ?? record.fromAccount ?? record.sourceAccount,
    );
    const destinationRecord = accounts.get(
      record.toAccount ?? record.destinationAccount,
    );
    const category = text(
      record.categoryName,
      categoryRecord
        ? text(categoryRecord.name, t("common.uncategorized"))
        : record.category == null
          ? t("common.uncategorized")
          : String(record.category),
    );
    const occurredAtIso = text(record.date, text(record.createdAt));
    const type = record.type === 1 ? 1 : record.type === 2 ? 2 : 0;
    const absoluteAmount = Math.abs(number(record.amount));
    const currencyCode = text(
      record.currencyCode,
      text(accountRecord?.currencyCode, "USD"),
    ).toUpperCase();
    const accountCurrencyCode = text(
      record.accountCurrencyCode,
      text(accountRecord?.currencyCode, currencyCode),
    ).toUpperCase();
    return {
      id: recordId(record, index),
      merchant: text(record.name, t("common.untitledTransaction")),
      description: text(record.description),
      category,
      categoryId: categoryRecord ? identity(categoryRecord) : "",
      occurredAt: transactionDate(record, document, t("common.unknownDate")),
      occurredAtIso,
      amount: type === 1 ? absoluteAmount : -absoluteAmount,
      absoluteAmount,
      currencyCode: /^[A-Z]{3}$/.test(currencyCode) ? currencyCode : "USD",
      accountAmount: Math.abs(number(record.accountAmount, absoluteAmount)),
      accountCurrencyCode: /^[A-Z]{3}$/.test(accountCurrencyCode)
        ? accountCurrencyCode
        : "USD",
      exchangeRate:
        number(record.exchangeRate) > 0 ? number(record.exchangeRate) : null,
      exchangeRateDate: text(record.exchangeRateDate) || null,
      exchangeRateFetchedAt: text(record.exchangeRateFetchedAt) || null,
      exchangeRateSource: text(record.exchangeRateSource) || null,
      type,
      icon: text(categoryRecord?.icon, categoryIcon(category)),
      iconPath:
        /^[Mm]/.test(text(categoryRecord?.iconPath)) &&
        text(categoryRecord?.iconPath).length <= 20_000
          ? text(categoryRecord?.iconPath)
          : null,
      color: /^#[a-f\d]{6}$/i.test(text(categoryRecord?.color))
        ? text(categoryRecord?.color)
        : colors[index % colors.length],
      tone: type === 1 ? "blue" : type === 2 ? "amber" : "emerald",
      accountId: accountRecord ? identity(accountRecord) : "",
      accountName: text(
        record.accountName,
        text(accountRecord?.name, t("common.noAccount")),
      ),
      destinationAccountId: destinationRecord
        ? identity(destinationRecord)
        : "",
      destinationAccountName: text(destinationRecord?.name),
      budgetName: relatedName(budgets, record.budget),
      labelName: relatedName(
        labels,
        record.label ?? (Array.isArray(record.tags) ? record.tags[0] : null),
      ),
      loanName: relatedName(loans, record.loan),
      placeName: relatedName(places, record.place),
      personName: relatedName(peoples, record.person ?? record.payee),
      receiptPath:
        typeof record.receipt === "string"
          ? record.receipt
          : typeof record.image === "string"
            ? record.image
            : null,
    } satisfies Transaction;
  };
}

/** Compatibility projection for screens that explicitly request all transactions. */
export function selectTransactions(document: BackupDocument): Transaction[] {
  return memoizeForDocument(
    document,
    `all-transactions:${i18n.resolvedLanguage ?? ""}`,
    () =>
      createTransactionIndex(document).map(selectTransactionProjector(document)),
  );
}
