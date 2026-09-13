import type { BackupDocument } from "../model/backup-document";
import {
  budgetDraft,
  parseBudgetDate,
  type BudgetDraft,
} from "../model/budget-record";
import {
  belongsToProfile,
  categoryFamily,
  categoryProfileId,
  identity,
  references,
} from "../model/category-record";
import type { JsonObject } from "../model/json";
import { selectCategories } from "./category-selectors";

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
  const record = document.budgets.find(b => identity(b) === id && belongsToProfile(document, b));
  if (!record) return null;
  const draft = budgetDraft(record, selectBudgetCurrency(document));
  const canonical = (records: JsonObject[], values: string[]) => [...new Set(values.map(value => {
    const match = records.find(r => references(r, value));
    return match ? identity(match) : value;
  }))];
  return {...draft, categories: canonical(document.categories,draft.categories), accounts: canonical(document.accounts,draft.accounts)};
}
export function selectBudgets(document: BackupDocument, now = new Date()) {
  const categories = selectCategories(document);
  const resolve = (records: JsonObject[], value: unknown) =>
    records.find((r) => value != null && references(r, String(value)));
  const fallback = selectBudgetCurrency(document);
  // Project transactions once; each budget then applies its own independent scope.
  const transactions = document.transactions.flatMap((t, index) => {
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
    if (
      !belongsToProfile(document, t) ||
      (account && !belongsToProfile(document, account))
    )
      return [];
    const accountAmount = t.accountAmount ?? t.amount;
    if (
      typeof accountAmount !== "number" ||
      !Number.isFinite(accountAmount) ||
      ![0, 1, 2].includes(Number(t.type))
    )
      return [];
    const category = resolve(document.categories, t.category);
    if (category && !belongsToProfile(document, category)) return [];
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
  });
  return document.budgets
    .filter(
      (b) =>
        identity(b) && belongsToProfile(document, b) && b.isArchived !== true,
    )
    .map((record) => {
      const draft = selectBudgetDraft(document, identity(record))!;
      const selected = draft.categories.flatMap((id) => {
        const c = resolve(document.categories, id);
        return c && belongsToProfile(document, c) ? [identity(c)] : [];
      });
      const scope = new Set(selected);
      if (draft.budgetMode === "Automatic" || draft.includeSubcategories)
        selected.forEach((id) =>
          categoryFamily(document.categories, id).forEach((child) =>
            scope.add(child),
          ),
        );
      const accountScope = new Set(
        draft.accounts
          .map((id) => resolve(document.accounts, id))
          .filter(Boolean)
          .map((a) => identity(a!)),
      );
      const candidates = transactions.filter(
        (t) =>
          t.type === draft.transactionType &&
          (draft.budgetType === "Overall" || scope.has(t.categoryId)) &&
          (!draft.accounts.length || accountScope.has(t.accountId)),
      );
      const matches = candidates.filter(
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
        for (const t of matches) {
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
      const current = matches
        .filter(
          (t) =>
            t.timestamp >= range.start.getTime() &&
            t.timestamp < range.end.getTime(),
        )
        .sort((a, b) => b.timestamp - a.timestamp);
      const tracked = current.reduce((total, t) => total + t.amount, 0);
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
      const breakdown = categories
        .filter((c) =>
          draft.budgetType === "Overall"
            ? current.some((t) => t.categoryId === c.id)
            : scope.has(c.id),
        )
        .map((c) => ({
          ...c,
          amount: current
            .filter((t) => t.categoryId === c.id)
            .reduce((s, t) => s + t.amount, 0),
        }));
      const uncategorized = current
        .filter((t) => !t.categoryId)
        .reduce((s, t) => s + t.amount, 0);
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
      const points = [{ timestamp: range.start.getTime(), amount: 0 }];
      let cumulative = 0;
      for (const t of [...current].reverse()) {
        cumulative += t.amount;
        points.push({ timestamp: t.timestamp, amount: cumulative });
      }
      if (chartEnd >= range.start.getTime())
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
        transactions: current,
        breakdown,
        points,
        excludedCurrencyCount: candidates.filter(
          (t) =>
            t.currencyCode !== draft.currencyCode &&
            t.timestamp >= range.start.getTime() &&
            t.timestamp < range.end.getTime(),
        ).length,
      };
    });
}
export type Budget = ReturnType<typeof selectBudgets>[number];
