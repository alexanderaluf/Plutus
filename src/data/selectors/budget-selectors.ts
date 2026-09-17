import type { BackupDocument } from "../model/backup-document";
import {
  budgetDraft,
  parseBudgetDate,
  type BudgetDraft,
} from "../model/budget-record";
import {
  belongsToProfile,
  categoryParent,
  categoryProfileId,
  identity,
  references,
  createProfileMatcher,
} from "../model/category-record";
import type { JsonObject } from "../model/json";
import { selectCategories } from "./category-selectors";
import { createRecordLookup } from "./transaction-selectors";
import { filterProjection, finishProjection } from "./cooperative";

const day = (date: Date) =>
  new Date(date.getFullYear(), date.getMonth(), date.getDate());
const monthDay = (year: number, month: number, date: number) =>
  new Date(year, month, Math.min(date, new Date(year, month + 1, 0).getDate()));
const ordinal = (date: Date) =>
  Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()) / 86400000;
function cycleIndex(draft: BudgetDraft, date: Date) {
  if (draft.period === "Yearly") return date.getFullYear();
  if (draft.period === "Monthly")
    return date.getFullYear() * 12 + date.getMonth();
  return draft.period === "Weekly"
    ? Math.floor(ordinal(date) / 7)
    : ordinal(date);
}
export function budgetPeriodRange(budget: BudgetDraft, anchor: Date) {
  let start = day(anchor),
    end: Date;
  if (budget.period === "Custom") {
    start = parseBudgetDate(budget.startDate) ?? day(anchor);
    end = parseBudgetDate(budget.endDate) ?? day(anchor);
    end.setDate(end.getDate() + 1);
  } else if (budget.period === "Monthly") {
    const cycle = Math.max(1, Math.min(31, Number(budget.cycleDay) || 1));
    start = monthDay(anchor.getFullYear(), anchor.getMonth(), cycle);
    if (start > anchor)
      start = monthDay(anchor.getFullYear(), anchor.getMonth() - 1, cycle);
    end = monthDay(start.getFullYear(), start.getMonth() + 1, cycle);
  } else {
    if (budget.period === "Weekly")
      start.setDate(start.getDate() - ((start.getDay() + 6) % 7));
    if (budget.period === "Yearly") start.setMonth(0, 1);
    end = new Date(start);
    if (budget.period === "Yearly") end.setFullYear(end.getFullYear() + 1);
    else end.setDate(end.getDate() + (budget.period === "Weekly" ? 7 : 1));
  }
  return { start, end };
}
export function selectBudgetCurrency(document: BackupDocument) {
  const owner = document.users.find((u) =>
    references(u, categoryProfileId(document)),
  );
  const code = String(owner?.currency ?? "USD").toUpperCase();
  return /^[A-Z]{3}$/.test(code) ? code : "USD";
}
export function selectBudgetDraft(document: BackupDocument, id: string) {
  const record = document.budgets.find(
    (b) => identity(b) === id && belongsToProfile(document, b),
  );
  if (!record) return null;
  const draft = budgetDraft(record, selectBudgetCurrency(document));
  const canonical = (records: JsonObject[], values: string[]) => [
    ...new Set(
      values.map((value) => {
        const match = records.find((r) => references(r, value));
        return match ? identity(match) : value;
      }),
    ),
  ];
  return {
    ...draft,
    categories: canonical(document.categories, draft.categories),
    accounts: canonical(document.accounts, draft.accounts),
  };
}
export function selectBudgets(
  document: BackupDocument,
  now = new Date(),
  options: { homeOnly?: boolean; transactions?: readonly JsonObject[] } = {},
) {
  return finishProjection(iterateBudgets(document, now, options));
}

export function* iterateBudgets(
  document: BackupDocument,
  now: Date,
  options: { homeOnly?: boolean; transactions?: readonly JsonObject[] } = {},
) {
  const belongs = createProfileMatcher(document);
  const records = yield* filterProjection(
    document.budgets,
    (b) =>
      !!identity(b) &&
      belongs(b) &&
      b.isArchived !== true &&
      (!options.homeOnly || b.showOnHome === true),
  );
  if (!records.length) return [];
  const categories = options.homeOnly ? [] : selectCategories(document);
  const lookups = new Map([
    [document.accounts, createRecordLookup(document.accounts)],
    [document.categories, createRecordLookup(document.categories)],
  ]);
  const resolve = (records: JsonObject[], value: unknown) =>
    value == null ? undefined : lookups.get(records)?.get(String(value));
  const children = new Map<string, string[]>();
  for (const category of document.categories) {
    const parent = resolve(document.categories, categoryParent(category));
    if (!parent) continue;
    const siblings = children.get(identity(parent)) ?? [];
    siblings.push(identity(category));
    children.set(identity(parent), siblings);
  }
  const families = new Map<string, Set<string>>();
  const family = (id: string) => {
    const cached = families.get(id);
    if (cached) return cached;
    const result = new Set<string>();
    const pending = [id];
    while (pending.length) {
      const current = pending.pop()!;
      if (result.has(current)) continue;
      result.add(current);
      for (const child of children.get(current) ?? []) pending.push(child);
    }
    families.set(id, result);
    return result;
  };
  const fallback = selectBudgetCurrency(document);
  // Project transactions once; each budget then applies its own independent scope.
  const projectTransaction = (t: JsonObject, index: number) => {
    const account = resolve(
      document.accounts,
      t.account ?? t.fromAccount ?? t.sourceAccount,
    );
    // Paired transfer formats expose a source and destination leg. Count the source once.
    const source = t.fromAccount ?? t.sourceAccount;
    if (
      Number(t.type) === 2 &&
      source != null &&
      account &&
      !references(account, source)
    )
      return [];
    if (!belongs(t) || (account && !belongs(account))) return [];
    const accountAmount = t.accountAmount ?? t.amount;
    if (
      typeof accountAmount !== "number" ||
      !Number.isFinite(accountAmount) ||
      ![0, 1, 2].includes(Number(t.type))
    )
      return [];
    const category = resolve(document.categories, t.category);
    if (category && !belongs(category)) return [];
    const timestamp = new Date(String(t.date ?? t.createdAt ?? "")).getTime();
    if (!Number.isFinite(timestamp) || timestamp > now.getTime()) return [];
    return [
      {
        id: identity(t) || `display-${index}`,
        name: String(t.name ?? "Untitled transaction"),
        amount: Math.abs(accountAmount),
        type: Number(t.type),
        timestamp,
        categoryId: category ? identity(category) : "",
        categoryName: String(category?.name ?? "Uncategorized"),
        accountId: account ? identity(account) : "",
        accountName: String(account?.name ?? "No account"),
        currencyCode: String(
          t.accountCurrencyCode ??
            t.currencyCode ??
            account?.currencyCode ??
            fallback,
        ).toUpperCase(),
      },
    ];
  };
  const transactions: ReturnType<typeof projectTransaction> = [];
  const sourceTransactions = options.transactions ?? document.transactions;
  const byType = new Map<number, typeof transactions>();
  for (let index = 0; index < sourceTransactions.length; index++) {
    if (index % 64 === 0) yield;
    transactions.push(...projectTransaction(sourceTransactions[index], index));
  }
  for (let index = 0; index < transactions.length; index++) {
    if (index % 64 === 0) yield;
    const transaction = transactions[index];
    const group = byType.get(transaction.type) ?? [];
    group.push(transaction);
    byType.set(transaction.type, group);
  }
  function* projectBudget(record: JsonObject) {
    yield;
    const draft = budgetDraft(record, fallback);
    const canonical = (records: JsonObject[], ids: string[]) => [
      ...new Set(
        ids.map((id) => {
          const match = resolve(records, id);
          return match ? identity(match) : id;
        }),
      ),
    ];
    draft.categories = canonical(document.categories, draft.categories);
    draft.accounts = canonical(document.accounts, draft.accounts);
    const selected = draft.categories.flatMap((id) => {
      const c = resolve(document.categories, id);
      return c && belongs(c) ? [identity(c)] : [];
    });
    const scope = new Set(selected);
    if (draft.budgetMode === "Automatic" || draft.includeSubcategories)
      selected.forEach((id) => family(id).forEach((child) => scope.add(child)));
    const accountScope = new Set(
      draft.accounts
        .map((id) => resolve(document.accounts, id))
        .filter(Boolean)
        .map((a) => identity(a!)),
    );
    const candidates = yield* filterProjection(
      byType.get(draft.transactionType) ?? [],
      (t) =>
        t.type === draft.transactionType &&
        (draft.budgetType === "Overall" || scope.has(t.categoryId)) &&
        (!draft.accounts.length || accountScope.has(t.accountId)),
    );
    const matches = yield* filterProjection(
      candidates,
      (t) => t.currencyCode === draft.currencyCode,
    );
    const range = budgetPeriodRange(draft, now);
    const base = Math.max(0, Number(draft.amount) || 0);
    let rollover = 0;
    // Calculate carry from the creation cycle, never before the budget existed.
    const created = new Date(String(record.createdAt ?? ""));
    if (
      draft.rolling &&
      draft.period !== "Custom" &&
      Number.isFinite(created.getTime()) &&
      created < range.start
    ) {
      const first = budgetPeriodRange(draft, created).start;
      const firstIndex = cycleIndex(draft, first),
        currentIndex = cycleIndex(draft, range.start);
      const totals = new Map<number, number>();
      let rolloverPosition = 0;
      for (const t of matches) {
        if (rolloverPosition++ % 64 === 0) yield;
        if (
          t.timestamp < first.getTime() ||
          t.timestamp >= range.start.getTime()
        )
          continue;
        const index = cycleIndex(
          draft,
          budgetPeriodRange(draft, new Date(t.timestamp)).start,
        );
        totals.set(index, (totals.get(index) ?? 0) + t.amount);
      }
      let next = firstIndex;
      for (const [index, amount] of [...totals].sort(([a], [b]) => a - b)) {
        rollover = Math.max(0, rollover + base * (index - next + 1) - amount);
        next = index + 1;
      }
      rollover += base * (currentIndex - next);
    }
    const limit = base + rollover;
    const current = yield* filterProjection(
      matches,
      (t) =>
        t.timestamp >= range.start.getTime() &&
        t.timestamp < range.end.getTime(),
    );
    if (!options.homeOnly) current.sort((a, b) => b.timestamp - a.timestamp);
    let tracked = 0;
    for (let index = 0; index < current.length; index++) {
      if (index % 64 === 0) yield;
      tracked += current[index].amount;
    }
    const remaining = limit - tracked;
    const active = now >= range.start && now < range.end;
    const periodDays = Math.max(1, ordinal(range.end) - ordinal(range.start));
    const daysLeft = active
      ? Math.max(
          1,
          Math.round(
            (Date.UTC(
              range.end.getFullYear(),
              range.end.getMonth(),
              range.end.getDate(),
            ) -
              Date.UTC(now.getFullYear(), now.getMonth(), now.getDate())) /
              86400000,
          ),
        )
      : 0;
    const categoryAmounts = new Map<string, number>();
    if (!options.homeOnly)
      for (const transaction of current)
        categoryAmounts.set(
          transaction.categoryId,
          (categoryAmounts.get(transaction.categoryId) ?? 0) +
            transaction.amount,
        );
    // Home cards need aggregates and the count, not detail charts/breakdowns.
    const breakdown = options.homeOnly
      ? []
      : categories
          .filter((c) =>
            draft.budgetType === "Overall"
              ? categoryAmounts.has(c.id)
              : scope.has(c.id),
          )
          .map((c) => ({
            ...c,
            amount: categoryAmounts.get(c.id) ?? 0,
          }));
    const uncategorized = categoryAmounts.get("") ?? 0;
    if (uncategorized)
      breakdown.push({
        id: "uncategorized",
        name: "Uncategorized",
        amount: uncategorized,
        color: "#78909c",
        icon: "wallet",
        iconPath: null,
        description: "",
        type: draft.transactionType,
        parentId: null,
        isDefault: false,
      });
    const chartEnd = Math.min(now.getTime(), range.end.getTime());
    const points = options.homeOnly
      ? []
      : [{ timestamp: range.start.getTime(), amount: 0 }];
    let cumulative = 0;
    if (!options.homeOnly)
      for (const t of [...current].reverse()) {
        cumulative += t.amount;
        points.push({ timestamp: t.timestamp, amount: cumulative });
      }
    if (!options.homeOnly && chartEnd >= range.start.getTime())
      points.push({ timestamp: chartEnd, amount: cumulative });
    return {
      ...draft,
      id: identity(record),
      record,
      range,
      base,
      limit,
      rollover,
      tracked,
      remaining,
      percent: limit > 0 ? (tracked / limit) * 100 : 0,
      daysLeft,
      active,
      periodDays,
      dailyPlan: limit / periodDays,
      periodStatus: active
        ? ("active" as const)
        : now < range.start
          ? ("upcoming" as const)
          : ("ended" as const),
      dailyAllowance: daysLeft ? Math.max(0, remaining) / daysLeft : 0,
      transactionCount: current.length,
      transactions: options.homeOnly ? [] : current,
      breakdown,
      points,
      excludedCurrencyCount: (yield* filterProjection(
        candidates,
        (t) =>
          t.currencyCode !== draft.currencyCode &&
          t.timestamp >= range.start.getTime() &&
          t.timestamp < range.end.getTime(),
      )).length,
    };
  }
  const result = [];
  for (const record of records) result.push(yield* projectBudget(record));
  return result;
}
export type Budget = ReturnType<typeof selectBudgets>[number];
