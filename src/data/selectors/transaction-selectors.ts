import { i18n } from "@/localization/i18n";
import type { Transaction } from "@/features/home/types";
import type { FilledIconName } from "@/shared/ui/filled-icon";
import type { BackupDocument } from "../model/backup-document";
import type { JsonObject, JsonValue } from "../model/json";
import {
  categoryProfileId,
  identity,
  references,
} from "../model/category-record";
import { formatAppDate } from "../model/onboarding";

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
  const date = new Date(text(record.date, text(record.createdAt)));
  return Number.isNaN(date.getTime())
    ? unknownDate
    : formatAppDate(date, document._local.dateFormat);
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

/** Only dates/identities are indexed. Formatting and relation projection stay lazy. */
export function createTransactionIndex(
  document: BackupDocument,
): TransactionIndexEntry[] {
  const profileId = categoryProfileId(document);
  const owner = document.users.find((user) => references(user, profileId));
  const entries: TransactionIndexEntry[] = [];
  for (const record of document.transactions) {
    if (
      profileId &&
      record.user != null &&
      !(owner
        ? references(owner, record.user)
        : String(record.user) === profileId)
    )
      continue;
    const index = entries.length;
    const timestamp = new Date(
      text(record.date, text(record.createdAt)),
    ).getTime();
    entries.push({
      id: recordId(record, index),
      record,
      index,
      timestamp: Number.isFinite(timestamp) ? timestamp : -Infinity,
    });
  }
  return entries.sort((a, b) => b.timestamp - a.timestamp);
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
  return createTransactionIndex(document).map(
    createTransactionProjector(document),
  );
}
