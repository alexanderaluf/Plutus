import type { BackupDocument } from "../model/backup-document";
import { createProfileMatcher, identity } from "../model/category-record";
import { localDateKey, recurringCurrency } from "../model/recurring-record";
import { transactionMoney } from "../model/transaction-conversion";
import { selectRecurringEvents, selectRecurrings } from "./recurring-selectors";
import { createRecordLookup } from "./transaction-selectors";

export type DaySpending = { amount: number; count: number };

export type DailySpendingSummary = {
  currencyCode: string;
  today: DaySpending;
  yesterday: DaySpending;
  /** Same calendar day last month, clamped to that month's last day. */
  lastMonth: DaySpending;
};

export type RecurringDigestItem = {
  id: string;
  name: string;
  amount: number;
  currencyCode: string;
  type: number;
};

function startOfDay(date: Date) {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate());
}

export function sameDayLastMonth(date: Date) {
  const lastDay = new Date(date.getFullYear(), date.getMonth(), 0).getDate();
  return new Date(
    date.getFullYear(),
    date.getMonth() - 1,
    Math.min(date.getDate(), lastDay),
  );
}

export function profileCurrency(document: BackupDocument) {
  return recurringCurrency(document, document._local.selectedProfileId ?? "");
}

/**
 * Expense totals in the profile currency for the requested local days, in one
 * pass. Follows the reports: transfers and excluded accounts are skipped, and
 * foreign amounts use the transaction's frozen conversion.
 */
export function selectDailySpending(
  document: BackupDocument,
  days: Date[],
  currencyCode = profileCurrency(document),
) {
  const totals = new Map<string, DaySpending>(
    days.map((day) => [localDateKey(day), { amount: 0, count: 0 }]),
  );
  const belongs = createProfileMatcher(document);
  const accounts = createRecordLookup(document.accounts);
  for (const record of document.transactions) {
    if (record.type !== 0 && record.type !== undefined) continue;
    if (!belongs(record)) continue;
    const account = accounts.get(record.account);
    if (account?.isExcluded === true || (account && !belongs(account)))
      continue;
    const date = new Date(String(record.date ?? record.createdAt ?? ""));
    if (!Number.isFinite(date.getTime())) continue;
    const total = totals.get(localDateKey(date));
    if (!total) continue;
    const money = transactionMoney(record, currencyCode);
    if (!money || money.currencyCode !== currencyCode) continue;
    total.amount += Math.abs(money.amount);
    total.count++;
  }
  return totals;
}

export function selectDailySpendingSummary(
  document: BackupDocument,
  day: Date,
): DailySpendingSummary {
  const currencyCode = profileCurrency(document);
  const today = startOfDay(day);
  const yesterday = new Date(
    today.getFullYear(),
    today.getMonth(),
    today.getDate() - 1,
  );
  const lastMonth = sameDayLastMonth(today);
  const totals = selectDailySpending(
    document,
    [today, yesterday, lastMonth],
    currencyCode,
  );
  const read = (date: Date) =>
    totals.get(localDateKey(date)) ?? { amount: 0, count: 0 };
  return {
    currencyCode,
    today: read(today),
    yesterday: read(yesterday),
    lastMonth: read(lastMonth),
  };
}

/** Recurring payments scheduled on a local day, skipped ones excluded. */
export function selectRecurringDigest(
  document: BackupDocument,
  day: Date,
): RecurringDigestItem[] {
  const start = startOfDay(day);
  const end = new Date(
    start.getFullYear(),
    start.getMonth(),
    start.getDate() + 1,
  );
  return selectRecurringEvents(selectRecurrings(document, start), start, end)
    .filter((event) => event.status !== "skipped")
    .map((event) => ({
      id: identity(event.recurring.record),
      name: event.recurring.name,
      amount: event.amount,
      currencyCode: event.currencyCode,
      type: event.type,
    }));
}
