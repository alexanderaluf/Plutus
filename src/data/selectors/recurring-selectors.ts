import type { BackupDocument } from "../model/backup-document";
import {
  belongsToProfile,
  categoryProfileId,
  identity,
  references,
  createProfileMatcher,
} from "../model/category-record";
import { isJsonObject, type JsonObject } from "../model/json";
import {
  isRecurringPeriod,
  localDateKey,
  nextOccurrence,
  occurrenceDate,
  recurringDefaults,
  type RecurringDraft,
} from "../model/recurring-record";
import { createRecordLookup } from "./transaction-selectors";
import {
  filterProjection,
  finishProjection,
  sortProjection,
} from "./cooperative";

export function selectRecurrings(document: BackupDocument, now = new Date()) {
  return finishProjection(iterateRecurrings(document, now));
}

export function* iterateRecurrings(document: BackupDocument, now: Date) {
  const belongs = createProfileMatcher(document);
  const accounts = createRecordLookup(document.accounts);
  const categories = createRecordLookup(document.categories);
  const users = createRecordLookup(document.users);
  const records = yield* filterProjection(
    document.recurrings,
    (r) =>
      belongs(r) &&
      (r.user != null ||
        !r.account ||
        document.accounts.some((a) => references(a, r.account) && belongs(a))),
  );
  function* projectRecurring(r: JsonObject) {
    yield;
    const next = nextOccurrence(r);
    const defaults = recurringDefaults(now);
    const draft = Object.fromEntries(
      Object.keys(defaults).map((key) => {
        const fallback = defaults[key as keyof RecurringDraft],
          value = r[key];
        return [
          key,
          fallback === null
            ? typeof value === "string"
              ? value
              : null
            : typeof value === typeof fallback
              ? value
              : fallback,
        ];
      }),
    ) as RecurringDraft;
    draft.amount = String(r.amount ?? "");
    const owner = users.get(r.user ?? categoryProfileId(document));
    const code = String(
      r.currencyCode ?? owner?.currency ?? "USD",
    ).toUpperCase();
    draft.currencyCode = /^[A-Z]{3}$/.test(code) ? code : "USD";
    draft.type = r.type === 1 ? 1 : 0;
    draft.period = isRecurringPeriod(r.period) ? r.period : "Monthly";
    draft.startAt = Number.isFinite(Date.parse(String(r.startAt)))
      ? String(r.startAt)
      : defaults.startAt;
    draft.endAt =
      draft.endAt && Number.isFinite(Date.parse(draft.endAt))
        ? draft.endAt
        : null;
    draft.color = /^#[0-9a-f]{6}$/i.test(draft.color)
      ? draft.color
      : defaults.color;
    draft.automatic = r.automatic === true;
    draft.reminderDays =
      typeof r.reminderDays === "number" &&
      [0, 1, 2, 7].includes(r.reminderDays)
        ? r.reminderDays
        : null;
    const occurrences = Array.isArray(r.occurrences) ? r.occurrences : [];
    const history: JsonObject[] = [];
    for (let index = 0; index < occurrences.length; index++) {
      if (index % 64 === 0) yield;
      if (isJsonObject(occurrences[index]))
        history.push(occurrences[index] as JsonObject);
    }
    return {
      ...draft,
      id: identity(r),
      amount: Number.isFinite(Number(r.amount)) ? Number(r.amount) : 0,
      draft,
      next,
      archived: r.archived === true || (!!isRecurringPeriod(r.period) && !next),
      due: r.archived !== true && !!next && next <= now,
      valid: !!next && isRecurringPeriod(r.period),
      record: r,
      history,
      accountName: String(accounts.get(r.account)?.name ?? "No account"),
      categoryName: String(categories.get(r.category)?.name ?? "Uncategorized"),
    };
  }
  const result = [];
  for (const record of records) result.push(yield* projectRecurring(record));
  return yield* sortProjection(
    result,
    (a, b) => (a.next?.getTime() ?? Infinity) - (b.next?.getTime() ?? Infinity),
  );
}
export type Recurring = ReturnType<typeof selectRecurrings>[number];
export type RecurringEvent = {
  recurring: Recurring;
  date: Date;
  status: "pending" | "processed" | "skipped";
  amount: number;
  currencyCode: string;
  type: number;
  transactionId: string | null;
};

/** Jump near the requested month before iterating, even for old daily schedules. */
function firstIndexInRange(record: JsonObject, start: Date) {
  let low = 0,
    high = 1;
  while (high < 4_000_000) {
    const date = occurrenceDate({ ...record, endAt: null }, high);
    if (!date || date >= start) break;
    high *= 2;
  }
  while (low < high) {
    const middle = Math.floor((low + high) / 2);
    const date = occurrenceDate({ ...record, endAt: null }, middle);
    if (date && date < start) low = middle + 1;
    else high = middle;
  }
  return low;
}
export function selectRecurringEvents(
  items: Recurring[],
  start: Date,
  end: Date,
): RecurringEvent[] {
  return finishProjection(iterateRecurringEvents(items, start, end));
}

export function* iterateRecurringEvents(
  items: Recurring[],
  start: Date,
  end: Date,
): Generator<void, RecurringEvent[], unknown> {
  const result: RecurringEvent[] = [];
  let operations = 0;
  for (const recurring of items) {
    yield;
    for (const h of recurring.history) {
      if (operations++ % 64 === 0) yield;
      const date = new Date(String(h.scheduledAt));
      if (date >= start && date < end)
        result.push({
          recurring,
          date,
          status: h.status === "skipped" ? "skipped" : "processed",
          amount: Number(h.amount),
          currencyCode: String(h.currencyCode),
          type: Number(h.type),
          transactionId:
            typeof h.transactionId === "string" ? h.transactionId : null,
        });
    }
    if (recurring.archived || !recurring.valid) continue;
    let index = Math.max(
      Number(recurring.record.nextIndex ?? 0),
      firstIndexInRange(recurring.record, start),
    );
    for (;;) {
      if (operations++ % 64 === 0) yield;
      const date = occurrenceDate(recurring.record, index++);
      if (!date || date >= end) break;
      if (date >= start)
        result.push({
          recurring,
          date,
          status: "pending",
          amount: recurring.amount,
          currencyCode: recurring.currencyCode,
          type: recurring.type,
          transactionId: null,
        });
    }
  }
  return yield* sortProjection(
    result,
    (a, b) => a.date.getTime() - b.date.getTime(),
  );
}
export function recurringTotals(
  values: { amount: number; currencyCode: string }[],
) {
  return finishProjection(iterateRecurringTotals(values));
}

function* iterateRecurringTotals(
  values: { amount: number; currencyCode: string }[],
) {
  const totals: Record<string, number> = {};
  let operations = 0;
  for (const value of values) {
    if (operations++ % 64 === 0) yield;
    if (Number.isFinite(value.amount))
      totals[value.currencyCode] =
        (totals[value.currencyCode] ?? 0) + value.amount;
  }
  return Object.entries(totals)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([currencyCode, amount]) => ({ currencyCode, amount }));
}
export function selectRecurringSummary(items: Recurring[], now = new Date()) {
  const active = items.filter((r) => !r.archived && r.valid);
  const annual = active.map((r) => ({
    ...r,
    amount:
      r.amount *
      ({
        Daily: 365,
        Weekly: 52,
        Fortnightly: 26,
        Monthly: 12,
        Quarterly: 4,
        Biannually: 2,
        Yearly: 1,
      }[r.period] ?? 0),
  }));
  const month = selectRecurringEvents(
    items,
    new Date(now.getFullYear(), now.getMonth(), 1),
    new Date(now.getFullYear(), now.getMonth() + 1, 1),
  );
  return {
    yearly: recurringTotals(annual),
    yearlyIncome: recurringTotals(annual.filter((r) => r.type === 1)),
    yearlyExpense: recurringTotals(annual.filter((r) => r.type === 0)),
    monthly: recurringTotals(
      annual.map((r) => ({ ...r, amount: r.amount / 12 })),
    ),
    income: recurringTotals(
      annual
        .filter((r) => r.type === 1)
        .map((r) => ({ ...r, amount: r.amount / 12 })),
    ),
    expense: recurringTotals(
      annual
        .filter((r) => r.type === 0)
        .map((r) => ({ ...r, amount: r.amount / 12 })),
    ),
    due: recurringTotals(
      month.filter((e) => e.status === "pending" && e.type === 0),
    ),
  };
}

/** Current-month recurring expense activity used by the home screen. */
export function selectHomeRecurringPayments(
  document: BackupDocument,
  now = new Date(),
) {
  return finishProjection(iterateHomeRecurringPayments(document, now));
}

export function* iterateHomeRecurringPayments(
  document: BackupDocument,
  now: Date,
) {
  const start = new Date(now.getFullYear(), now.getMonth(), 1);
  const end = new Date(now.getFullYear(), now.getMonth() + 1, 1);
  const expenses = yield* filterProjection(
    yield* iterateRecurringEvents(
      yield* iterateRecurrings(document, now),
      start,
      end,
    ),
    (event) => event.type === 0,
  );
  const pending = yield* filterProjection(
    expenses,
    (event) => event.status === "pending",
  );
  const paid = yield* filterProjection(
    expenses,
    (event) => event.status === "processed" && event.date <= now,
  );

  return {
    paid: yield* iterateRecurringTotals(paid),
    pending,
    remaining: yield* iterateRecurringTotals(pending),
  };
}
export function selectRecurringRelations(
  document: BackupDocument,
  collection: "budgets" | "labels" | "places" | "peoples",
) {
  return document[collection]
    .filter((r) => belongsToProfile(document, r))
    .map((r) => ({
      id: identity(r),
      name: String(r.name ?? ""),
      icon: String(r.icon ?? "tag"),
      color: String(r.color ?? "#70d2eb"),
      iconPath: typeof r.iconPath === "string" ? r.iconPath : null,
    }));
}
export { localDateKey };

export function selectRecurringTransactionSnapshot(
  document: BackupDocument,
  transactionId: string,
) {
  const record = document.transactions.find(
    (t) => identity(t) === transactionId && belongsToProfile(document, t),
  );
  if (!record?.recurring || typeof record.originalAmount !== "number")
    return null;
  return {
    originalAmount: record.originalAmount,
    originalCurrency: String(record.originalCurrencyCode ?? "USD"),
    amount: Number(record.amount),
    currency: String(record.currencyCode ?? "USD"),
    rate:
      typeof record.originalExchangeRate === "number"
        ? record.originalExchangeRate
        : null,
    rateDate:
      typeof record.originalExchangeRateDate === "string"
        ? record.originalExchangeRateDate
        : null,
    fetchedAt:
      typeof record.originalExchangeRateFetchedAt === "string"
        ? record.originalExchangeRateFetchedAt
        : null,
    source:
      typeof record.originalExchangeRateSource === "string"
        ? record.originalExchangeRateSource
        : null,
    scheduledAt: String(record.scheduledAt ?? record.date),
    recordedAt: String(record.processedAt ?? record.createdAt),
  };
}
