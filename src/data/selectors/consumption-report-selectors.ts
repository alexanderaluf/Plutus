import { i18n } from "@/localization/i18n";
import type { BackupDocument } from "../model/backup-document";
import {
  categoryParent,
  createProfileMatcher,
  identity,
} from "../model/category-record";
import { financialMonth } from "../model/financial-month";
import type { JsonObject } from "../model/json";
import { localDateKey } from "../model/recurring-record";
import { transactionMoney } from "../model/transaction-conversion";
import { createRecordLookup } from "./transaction-selectors";

const UNASSIGNED_COLOR = "#A1A6B8";
const string = (value: unknown, fallback = "") =>
  typeof value === "string" && value ? value : fallback;
const finite = (value: unknown) =>
  typeof value === "number" && Number.isFinite(value) ? value : 0;
const currency = (value: unknown, fallback: string) =>
  /^[A-Z]{3}$/.test(string(value).toUpperCase())
    ? string(value).toUpperCase()
    : fallback;

export type ConsumptionEntry = {
  id: string;
  name: string;
  amount: number;
  currencyCode: string;
  isIncome: boolean;
  date: Date;
  day: string;
  categoryId: string;
  category: string;
  rootId: string;
  root: string;
  account: string;
};
export type ConsumptionCategory = {
  id: string;
  label: string;
  amount: number;
  share: number;
  color: string;
  memberIds: string[];
};

/** A read-only projection. No converted amount is guessed or fetched remotely. */
export function selectConsumptionReport(
  document: BackupDocument,
  profileCurrency: string,
  now = new Date(),
  offset = 0,
) {
  const period = financialMonth(
    now,
    document._local.monthStartDay,
    Math.min(0, offset),
  );
  const belongs = createProfileMatcher(document);
  const accountLookup = createRecordLookup(document.accounts);
  const categoryLookup = createRecordLookup(document.categories);
  const roots = new Map<string, JsonObject>();
  const rootOf = (category: JsonObject) => {
    const cached = roots.get(identity(category));
    if (cached) return cached;
    const visited: JsonObject[] = [];
    const seen = new Set<string>();
    let current = category;
    while (!seen.has(identity(current))) {
      visited.push(current);
      seen.add(identity(current));
      const parent = categoryLookup.get(categoryParent(current));
      if (!parent) break;
      if (seen.has(identity(parent))) {
        // Deterministic representative even when an imported hierarchy cycles.
        current = [...visited].sort((a, b) =>
          identity(a).localeCompare(identity(b)),
        )[0];
        break;
      }
      current = parent;
    }
    visited.forEach((item) => roots.set(identity(item), current));
    return current;
  };
  const entries: ConsumptionEntry[] = [];
  for (const record of document.transactions) {
    if (!belongs(record) || record.type === 2) continue;
    const account = accountLookup.get(record.account);
    if (account?.isExcluded === true || (account && !belongs(account)))
      continue;
    const date = new Date(string(record.date, string(record.createdAt)));
    if (
      !Number.isFinite(date.getTime()) ||
      date < period.start ||
      date >= period.end ||
      date > now
    )
      continue;
    if (typeof record.amount !== "number" || !Number.isFinite(record.amount))
      continue;
    const sourceCurrency = currency(
      record.currencyCode,
      currency(
        record.accountCurrencyCode,
        currency(account?.currencyCode, profileCurrency),
      ),
    );
    const money = transactionMoney(
      { ...record, currencyCode: sourceCurrency },
      profileCurrency,
    );
    const category = categoryLookup.get(record.category);
    const root = category ? rootOf(category) : null;
    const label = string(
      category?.name,
      string(record.categoryName, i18n.t("common.uncategorized")),
    );
    const categoryId = category
      ? identity(category)
      : `unfiled:${String(record.category ?? label)}`;
    entries.push({
      id: identity(record),
      name: string(record.name, label),
      amount: money?.amount ?? Math.abs(record.amount),
      currencyCode: money?.currencyCode ?? sourceCurrency,
      isIncome: record.type === 1,
      date,
      day: localDateKey(date),
      categoryId,
      category: label,
      rootId: root ? identity(root) : categoryId,
      root: root ? string(root.name, label) : label,
      account: string(
        account?.name,
        string(record.accountName, i18n.t("common.uncategorized")),
      ),
    });
  }
  entries.sort(
    (a, b) => b.date.getTime() - a.date.getTime() || a.id.localeCompare(b.id),
  );
  const currencies = [
    ...new Set([
      profileCurrency,
      ...entries.map((entry) => entry.currencyCode),
    ]),
  ];
  const flows = currencies.map((currencyCode) => {
    const records = entries.filter(
      (entry) => entry.currencyCode === currencyCode,
    );
    const expenses = records.filter((entry) => !entry.isIncome);
    const income = records
      .filter((entry) => entry.isIncome)
      .reduce((sum, entry) => sum + entry.amount, 0);
    const expense = expenses.reduce((sum, entry) => sum + entry.amount, 0);
    const buckets = new Map<string, { label: string; amount: number }>();
    const dailyTotals = new Map<string, number>();
    for (const entry of expenses) {
      const bucket = buckets.get(entry.rootId) ?? {
        label: entry.root,
        amount: 0,
      };
      bucket.amount += entry.amount;
      buckets.set(entry.rootId, bucket);
      dailyTotals.set(
        entry.day,
        (dailyTotals.get(entry.day) ?? 0) + entry.amount,
      );
    }
    const categories: ConsumptionCategory[] = [...buckets.entries()]
      .filter(([, bucket]) => bucket.amount > 0)
      .sort((a, b) => b[1].amount - a[1].amount || a[0].localeCompare(b[0]))
      .map(([id, bucket]) => ({
        id,
        ...bucket,
        share: expense ? (bucket.amount / expense) * 100 : 0,
        color: /^#[a-f\d]{6}$/i.test(string(categoryLookup.get(id)?.color))
          ? string(categoryLookup.get(id)?.color)
          : categoryLookup.get(id)
            ? "#70d2eb"
            : UNASSIGNED_COLOR,
        memberIds: [id],
      }));
    const slices =
      categories.length <= 6
        ? categories
        : [
            ...categories.slice(0, 5),
            {
              id: "__other__",
              label: i18n.t("reports.donut.other"),
              amount: categories
                .slice(5)
                .reduce((sum, item) => sum + item.amount, 0),
              share: categories
                .slice(5)
                .reduce((sum, item) => sum + item.share, 0),
              color: UNASSIGNED_COLOR,
              memberIds: categories.slice(5).map((item) => item.id),
            },
          ];
    const days: {
      key: string;
      date: Date;
      amount: number;
      elapsed: boolean;
    }[] = [];
    for (
      let date = new Date(period.start);
      date < period.end;
      date.setDate(date.getDate() + 1)
    ) {
      const key = localDateKey(date);
      days.push({
        key,
        date: new Date(date),
        amount: dailyTotals.get(key) ?? 0,
        elapsed: date <= now,
      });
    }
    const elapsedDays = days.filter((day) => day.elapsed).length;
    return {
      currencyCode,
      income,
      expense,
      net: income - expense,
      entries: records,
      expenses,
      slices,
      categories,
      days,
      transactionCount: records.length,
      expenseCount: expenses.length,
      dailyAverage: elapsedDays ? expense / elapsedDays : 0,
      averageExpense: expenses.length ? expense / expenses.length : 0,
      largestExpense: expenses.reduce<ConsumptionEntry | null>(
        (largest, item) =>
          !largest || item.amount > largest.amount ? item : largest,
        null,
      ),
      spentIncomePercent: income > 0 ? (expense / income) * 100 : null,
    };
  });
  // Persisted balances are current snapshots, not balances at the period end.
  const accounts = document.accounts
    .filter((record) => belongs(record) && record.isExcluded !== true)
    .map((record) => ({
      id: identity(record),
      name: string(record.name, i18n.t("common.localAccount")),
      balance: finite(record.amount),
      currencyCode: currency(record.currencyCode, profileCurrency),
      kind: string(record.accountType, string(record.type)),
    }));
  const holdings = [
    ...new Set(accounts.map((account) => account.currencyCode)),
  ].map((currencyCode) => {
    const items = accounts.filter(
      (account) => account.currencyCode === currencyCode,
    );
    const positive = items.reduce(
      (sum, account) => sum + Math.max(0, account.balance),
      0,
    );
    const debt = items.reduce(
      (sum, account) => sum + Math.abs(Math.min(0, account.balance)),
      0,
    );
    return {
      currencyCode,
      accounts: items,
      positive,
      debt,
      net: positive - debt,
    };
  });
  return { period, flows, holdings };
}

export type ConsumptionReport = ReturnType<typeof selectConsumptionReport>;
export type ConsumptionFlow = ConsumptionReport["flows"][number];

/** Aggregate and missing-category slices must never navigate to a synthetic ID. */
export function selectConsumptionCategoryLinks(
  document: BackupDocument,
  slice: ConsumptionCategory,
) {
  const lookup = createRecordLookup(document.categories);
  const belongs = createProfileMatcher(document);
  return slice.memberIds.flatMap((id) => {
    const record = lookup.get(id);
    return record && belongs(record)
      ? [
          {
            id: identity(record),
            label: string(record.name, i18n.t("common.uncategorized")),
          },
        ]
      : [];
  });
}

export function selectConsumptionDetails(
  flow: ConsumptionFlow,
  slice: ConsumptionCategory,
) {
  const members = new Set(slice.memberIds);
  const entries = flow.expenses.filter((entry) => members.has(entry.rootId));
  const buckets = new Map<
    string,
    { id: string; label: string; amount: number; count: number }
  >();
  for (const entry of entries) {
    const bucket = buckets.get(entry.categoryId) ?? {
      id: entry.categoryId,
      label: entry.category,
      amount: 0,
      count: 0,
    };
    bucket.amount += entry.amount;
    bucket.count++;
    buckets.set(entry.categoryId, bucket);
  }
  return {
    entries,
    categories: [...buckets.values()].sort((a, b) => b.amount - a.amount),
  };
}

export type PeriodComparison = { current: number; previous: number };
export type PeriodCategoryChange = {
  id: string;
  label: string;
  /** Top-level category name when this change belongs to a subcategory. */
  parentLabel: string | null;
  color: string;
  icon: string;
  iconPath: string | null;
  current: number;
  previous: number;
  delta: number;
};

/**
 * Compares a reporting period with the one before it. While the period is
 * still running, the previous period is cut to the same number of days so a
 * half-finished month is never measured against a complete one.
 */
export function selectPeriodReview(
  document: BackupDocument,
  profileCurrency: string,
  now = new Date(),
  offset = 0,
  currencyCode = profileCurrency,
) {
  const current = selectConsumptionReport(
    document,
    profileCurrency,
    now,
    offset,
  );
  const previous = selectConsumptionReport(
    document,
    profileCurrency,
    now,
    Math.min(0, offset) - 1,
  );
  const flow =
    current.flows.find((item) => item.currencyCode === currencyCode) ??
    current.flows[0];
  const previousFlow = previous.flows.find(
    (item) => item.currencyCode === flow.currencyCode,
  );
  const totalDays = flow.days.length;
  const elapsedDays = flow.days.filter((day) => day.elapsed).length;
  const isPartial = elapsedDays < totalDays;
  const cutoff = new Date(previous.period.start);
  cutoff.setDate(cutoff.getDate() + elapsedDays);
  const previousEnd = isPartial ? cutoff : previous.period.end;
  const previousEntries = (previousFlow?.entries ?? []).filter(
    (entry) => entry.date < previousEnd,
  );
  const previousIncome = previousEntries
    .filter((entry) => entry.isIncome)
    .reduce((sum, entry) => sum + entry.amount, 0);
  const previousSpent = previousEntries
    .filter((entry) => !entry.isIncome)
    .reduce((sum, entry) => sum + entry.amount, 0);

  // Changes are tracked per selected category, so a subcategory shows with its
  // own icon instead of being folded into its parent.
  const categoryLookup = createRecordLookup(document.categories);
  const changes = new Map<string, PeriodCategoryChange>();
  const changeFor = (entry: ConsumptionEntry) => {
    const existing = changes.get(entry.categoryId);
    if (existing) return existing;
    const record = categoryLookup.get(entry.categoryId);
    const iconPath = string(record?.iconPath);
    const change: PeriodCategoryChange = {
      id: entry.categoryId,
      label: entry.category,
      parentLabel: entry.rootId !== entry.categoryId ? entry.root : null,
      color: /^#[a-f\d]{6}$/i.test(string(record?.color))
        ? string(record?.color)
        : record
          ? "#70d2eb"
          : UNASSIGNED_COLOR,
      icon: record ? string(record.icon, "shopping") : "help",
      iconPath:
        /^[Mm]/.test(iconPath) && iconPath.length <= 20_000 ? iconPath : null,
      current: 0,
      previous: 0,
      delta: 0,
    };
    changes.set(entry.categoryId, change);
    return change;
  };
  for (const entry of flow.expenses) changeFor(entry).current += entry.amount;
  for (const entry of previousEntries) {
    if (!entry.isIncome) changeFor(entry).previous += entry.amount;
  }
  const categoryChanges = [...changes.values()]
    .map((change) => ({ ...change, delta: change.current - change.previous }))
    .filter((change) => Math.abs(change.delta) >= 0.005)
    .sort(
      (a, b) =>
        Math.abs(b.delta) - Math.abs(a.delta) || a.id.localeCompare(b.id),
    )
    .slice(0, 4);

  return {
    currencyCode: flow.currencyCode,
    period: current.period,
    previousPeriod: { start: previous.period.start, end: previousEnd },
    isPartial,
    elapsedDays,
    totalDays,
    spent: { current: flow.expense, previous: previousSpent },
    income: { current: flow.income, previous: previousIncome },
    net: {
      current: flow.net,
      previous: previousIncome - previousSpent,
    },
    projectedSpend:
      isPartial && elapsedDays > 0
        ? (flow.expense / elapsedDays) * totalDays
        : null,
    previousTotalSpend: previousFlow?.expense ?? 0,
    categoryChanges,
    hasActivity: flow.entries.length > 0 || previousEntries.length > 0,
    hasPrevious: previousEntries.length > 0,
  };
}

export type PeriodReview = ReturnType<typeof selectPeriodReview>;
