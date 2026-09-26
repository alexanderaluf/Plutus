import type { BackupDocument } from "@/data/model/backup-document";
import { i18n } from "@/localization/i18n";
import { createProfileMatcher, identity } from "@/data/model/category-record";
import { financialMonth } from "@/data/model/financial-month";
import type { JsonObject, JsonValue } from "@/data/model/json";
import { profileCurrency } from "@/data/model/transaction-conversion";
import { selectBudgets } from "@/data/selectors/budget-selectors";
import { selectCategories } from "@/data/selectors/category-selectors";
import { selectProfileReport } from "@/data/selectors/report-selectors";
import {
  selectAccountBalances,
  selectAccounts,
} from "@/data/selectors/document-selectors";
import {
  selectExchangeQuote,
  selectExchangeRates,
} from "@/data/selectors/exchange-rate-selectors";
import {
  selectRecurringEvents,
  selectRecurrings,
} from "@/data/selectors/recurring-selectors";
import {
  createSearchContext,
  normalizeSearchText,
  type SearchContext,
} from "@/data/selectors/search-selectors";
import { createRecordLookup } from "@/data/selectors/transaction-selectors";
import {
  isoDay,
  resolvePeriod,
  type ChatToolArgs,
  type ChatToolCall,
  type DateRange,
  type SummaryGroup,
  type TransactionKind,
} from "./chat-tool-protocol";

export type ChatCard =
  | { kind: "transaction"; id: string }
  | { kind: "account"; id: string }
  | { kind: "budget"; id: string };

type Fact = SearchContext["facts"][number];

const WEEKDAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const MAX_CARDS = 6;

function text(value: JsonValue | undefined, fallback = "") {
  return typeof value === "string" && value ? value : fallback;
}

function finite(value: JsonValue | undefined) {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

/** Plain numbers keep tokens low; the model formats them for the reader. */
function money(amount: number, currency: string) {
  return `${(Math.round(amount * 100) / 100).toFixed(2)} ${currency}`;
}

function percent(part: number, whole: number) {
  return whole > 0 ? `${Math.round((part / whole) * 100)}%` : "0%";
}

/**
 * Everything a tool needs is resolved once per question so several tools can
 * share one pass over the document.
 */
class ToolContext {
  readonly currency: string;
  readonly monthStartDay: number;
  readonly search: SearchContext;
  readonly excludedAccounts: Set<string>;
  private readonly categories: ReturnType<typeof createRecordLookup>;
  private readonly accounts: ReturnType<typeof createRecordLookup>;
  private readonly labels: ReturnType<typeof createRecordLookup>;
  private readonly places: ReturnType<typeof createRecordLookup>;
  private readonly people: ReturnType<typeof createRecordLookup>;
  private readonly rates = new Map<string, number | null>();

  constructor(
    readonly document: BackupDocument,
    readonly now: Date,
  ) {
    this.currency = profileCurrency(
      document,
      document._local.selectedProfileId ?? "",
    );
    this.monthStartDay = document._local.monthStartDay;
    this.search = createSearchContext(document, this.currency);
    this.categories = createRecordLookup(document.categories);
    this.accounts = createRecordLookup(document.accounts);
    this.labels = createRecordLookup(document.labels);
    this.places = createRecordLookup(document.places);
    this.people = createRecordLookup(document.peoples);
    this.excludedAccounts = new Set(
      document.accounts
        .filter((account) => account.isExcluded === true)
        .map(identity),
    );
    // Single-currency aggregates use the profile currency unless no record
    // converts into it; then the most common record currency is clearer.
    const counts = new Map<string, number>();
    for (const fact of this.search.facts)
      counts.set(fact.reportingCurrency, (counts.get(fact.reportingCurrency) ?? 0) + 1);
    this.reporting = counts.has(this.currency)
      ? this.currency
      : ([...counts].sort((a, b) => b[1] - a[1])[0]?.[0] ?? this.currency);
  }

  readonly reporting: string;

  name(
    kind: "categories" | "accounts" | "labels" | "places" | "people",
    id: string,
    fallback: string,
  ) {
    return id ? text(this[kind].get(id)?.name, fallback) : fallback;
  }

  categoryName(fact: Fact) {
    return text(
      fact.entry.record.categoryName,
      this.name("categories", fact.category, "Uncategorized"),
    );
  }

  merchant(fact: Fact) {
    return text(fact.entry.record.name, "Untitled").slice(0, 60);
  }

  /** Latest saved quote into the profile currency, direct or inverse. */
  rate(code: string) {
    if (code === this.currency) return 1;
    if (!this.rates.has(code)) {
      const direct = selectExchangeQuote(
        this.document,
        code,
        this.currency,
        this.now,
      );
      const inverse = direct
        ? null
        : selectExchangeQuote(this.document, this.currency, code, this.now);
      this.rates.set(
        code,
        direct?.rate ?? (inverse?.rate ? 1 / inverse.rate : null),
      );
    }
    return this.rates.get(code) ?? null;
  }

  range(args: ChatToolArgs, fallback: string | null): DateRange | null {
    return (
      resolvePeriod(args, this.now, this.monthStartDay) ??
      (fallback
        ? resolvePeriod({ period: fallback }, this.now, this.monthStartDay)
        : null)
    );
  }

  /** Facts in the half-open range; the search index is newest first. */
  facts(range: DateRange | null) {
    if (!range) return this.search.facts;
    const start = range.start.getTime();
    const end = range.end.getTime();
    return this.search.facts.filter(
      (fact) => fact.entry.timestamp >= start && fact.entry.timestamp < end,
    );
  }

  /** Reports ignore transfers and excluded accounts, like the app's screens. */
  counted(fact: Fact) {
    return (
      fact.type !== "transfer" &&
      !fact.accounts.some((id) => this.excludedAccounts.has(id))
    );
  }

  matches(fact: Fact, args: ChatToolArgs) {
    const type = args.type ?? "all";
    if (type !== "all" && fact.type !== type) return false;
    if (args.category) {
      const wanted = normalizeSearchText(args.category);
      const names = [
        text(fact.entry.record.categoryName),
        ...fact.categoryPath.map((id) => this.name("categories", id, "")),
      ].map(normalizeSearchText);
      if (!names.some((name) => name && name.includes(wanted))) return false;
    }
    if (args.account) {
      const wanted = normalizeSearchText(args.account);
      if (
        !fact.accounts.some((id) =>
          normalizeSearchText(this.name("accounts", id, "")).includes(wanted),
        )
      )
        return false;
    }
    if (args.minAmount !== undefined && fact.reportingAmount < args.minAmount)
      return false;
    if (args.maxAmount !== undefined && fact.reportingAmount > args.maxAmount)
      return false;
    if (args.query) {
      const tokens = normalizeSearchText(args.query).split(/\s+/).filter(Boolean);
      if (!tokens.every((token) => fact.haystack.includes(token))) return false;
    }
    return true;
  }

  line(fact: Fact) {
    const record = fact.entry.record;
    const date = Number.isFinite(fact.entry.timestamp)
      ? isoDay(new Date(fact.entry.timestamp))
      : "unknown date";
    const converted =
      fact.currencyCode !== fact.reportingCurrency
        ? ` (= ${money(fact.reportingAmount, fact.reportingCurrency)})`
        : "";
    const account = this.name("accounts", fact.accounts[0] ?? "", "");
    const note = text(record.description).slice(0, 40);
    return [
      date,
      fact.type,
      `${money(fact.amount, fact.currencyCode)}${converted}`,
      this.merchant(fact),
      this.categoryName(fact),
      account,
      note,
    ]
      .filter(Boolean)
      .join(" | ");
  }
}

type ToolOutput = { lines: string[]; cards: ChatCard[] };

function totalsByCurrency(context: ToolContext, facts: Fact[]) {
  const totals = new Map<string, { income: number; expense: number; count: number }>();
  for (const fact of facts) {
    if (!context.counted(fact)) continue;
    const bucket = totals.get(fact.reportingCurrency) ?? {
      income: 0,
      expense: 0,
      count: 0,
    };
    if (fact.type === "income") bucket.income += fact.reportingAmount;
    else bucket.expense += fact.reportingAmount;
    bucket.count++;
    totals.set(fact.reportingCurrency, bucket);
  }
  return totals;
}

function transactionList(
  context: ToolContext,
  title: string,
  args: ChatToolArgs,
  defaults: { type?: TransactionKind; sort: string; limit: number; period: string | null },
): ToolOutput {
  const range = context.range(args, defaults.period);
  const filters = { ...args, type: args.type ?? defaults.type };
  let matches = context
    .facts(range)
    .filter((fact) => context.matches(fact, filters));
  const sort = args.sort ?? defaults.sort;
  if (sort === "oldest") matches = [...matches].reverse();
  else if (sort === "largest" || sort === "smallest") {
    const direction = sort === "largest" ? -1 : 1;
    matches = [...matches].sort(
      (a, b) => direction * (a.reportingAmount - b.reportingAmount),
    );
  }
  const limit = args.limit ?? defaults.limit;
  const shown = matches.slice(0, limit);
  const lines = [
    `[${title}] ${range ? range.label : "all time"}; filters ${JSON.stringify(filters)}; sort ${sort}; ${matches.length} matches`,
  ];
  for (const [currency, bucket] of totalsByCurrency(context, matches))
    lines.push(
      `matched totals ${currency}: expenses ${money(bucket.expense, currency)}, income ${money(bucket.income, currency)}`,
    );
  lines.push("date | type | amount | name | category | account | note");
  lines.push(...shown.map((fact) => context.line(fact)));
  if (matches.length > shown.length)
    lines.push(`(${matches.length - shown.length} more not listed)`);
  return {
    lines,
    cards: shown
      .slice(0, MAX_CARDS)
      .map((fact): ChatCard => ({ kind: "transaction", id: fact.entry.id })),
  };
}

function groupKey(context: ToolContext, fact: Fact, group: SummaryGroup) {
  const date = new Date(fact.entry.timestamp);
  switch (group) {
    case "category":
      return context.categoryName(fact);
    case "account":
      return context.name("accounts", fact.accounts[0] ?? "", "No account");
    case "merchant":
      return context.merchant(fact);
    case "month":
      return isoDay(date).slice(0, 7);
    case "week": {
      const start = new Date(
        date.getFullYear(),
        date.getMonth(),
        date.getDate() - date.getDay(),
      );
      return `week of ${isoDay(start)}`;
    }
    case "day":
      return isoDay(date);
    case "weekday":
      return WEEKDAYS[date.getDay()];
    case "label":
      return context.name("labels", fact.labels[0] ?? "", "No label");
    case "place":
      return context.name("places", fact.place, "No place");
    case "person":
      return context.name("people", fact.person, "No person");
  }
}

function spendingSummary(context: ToolContext, args: ChatToolArgs): ToolOutput {
  const group = args.groupBy ?? "category";
  const type = args.type === "income" ? "income" : "expense";
  const range = context.range(args, "this_month");
  const groups = new Map<string, { amount: number; count: number; currency: string }>();
  let total = 0;
  for (const fact of context.facts(range)) {
    if (!context.counted(fact) || fact.type !== type) continue;
    if (!context.matches(fact, { ...args, type })) continue;
    const key = `${groupKey(context, fact, group)}\u0000${fact.reportingCurrency}`;
    const bucket = groups.get(key) ?? {
      amount: 0,
      count: 0,
      currency: fact.reportingCurrency,
    };
    bucket.amount += fact.reportingAmount;
    bucket.count++;
    groups.set(key, bucket);
    if (fact.reportingCurrency === context.reporting) total += fact.reportingAmount;
  }
  const sorted = [...groups.entries()].sort(([a, left], [b, right]) =>
    group === "month" || group === "day" || group === "week"
      ? a.localeCompare(b)
      : right.amount - left.amount,
  );
  const limit = args.limit ?? 15;
  const lines = [
    `[spending_summary] ${type} by ${group}, ${range?.label ?? "all time"}; total ${money(total, context.reporting)}`,
    `${group} | amount | share | transactions`,
    ...sorted
      .slice(0, limit)
      .map(
        ([key, bucket]) =>
          `${key.split("\u0000")[0]} | ${money(bucket.amount, bucket.currency)} | ${bucket.currency === context.reporting ? percent(bucket.amount, total) : "-"} | ${bucket.count}`,
      ),
  ];
  if (sorted.length > limit) lines.push(`(${sorted.length - limit} smaller groups not listed)`);
  return { lines, cards: [] };
}

function cashFlow(context: ToolContext, args: ChatToolArgs): ToolOutput {
  const range = context.range(args, "this_month");
  const facts = context.facts(range).filter((fact) => context.matches(fact, { ...args, type: "all" }));
  const lines = [`[cash_flow] ${range?.label ?? "all time"}`];
  const totals = totalsByCurrency(context, facts);
  if (!totals.size) lines.push("no income or expenses in this period");
  for (const [currency, bucket] of totals) {
    const net = bucket.income - bucket.expense;
    lines.push(
      `${currency}: income ${money(bucket.income, currency)}, expenses ${money(bucket.expense, currency)}, net ${money(net, currency)}, savings rate ${bucket.income > 0 ? percent(Math.max(net, 0), bucket.income) : "n/a"}, ${bucket.count} transactions`,
    );
  }
  if (range) {
    const days = Math.max(
      1,
      Math.round(
        (Math.min(range.end.getTime(), context.now.getTime()) - range.start.getTime()) /
          86_400_000,
      ),
    );
    const main = totals.get(context.reporting);
    if (main)
      lines.push(`average daily spending ${money(main.expense / days, context.reporting)} over ${days} days`);
    if (range.end.getTime() - range.start.getTime() > 40 * 86_400_000) {
      const months = new Map<string, { income: number; expense: number }>();
      for (const fact of facts) {
        if (!context.counted(fact) || fact.reportingCurrency !== context.reporting) continue;
        const key = isoDay(new Date(fact.entry.timestamp)).slice(0, 7);
        const bucket = months.get(key) ?? { income: 0, expense: 0 };
        if (fact.type === "income") bucket.income += fact.reportingAmount;
        else bucket.expense += fact.reportingAmount;
        months.set(key, bucket);
      }
      lines.push(`month | income | expenses | net (${context.reporting})`);
      for (const [key, bucket] of [...months].sort(([a], [b]) => a.localeCompare(b)))
        lines.push(
          `${key} | ${bucket.income.toFixed(2)} | ${bucket.expense.toFixed(2)} | ${(bucket.income - bucket.expense).toFixed(2)}`,
        );
    }
  }
  return { lines, cards: [] };
}

function comparePeriods(context: ToolContext, args: ChatToolArgs): ToolOutput {
  const first = context.range({ period: args.period }, "this_month")!;
  const second = context.range({ period: args.periodB }, "last_month")!;
  const type = args.type === "income" ? "income" : "expense";
  const sum = (range: DateRange) => {
    const byCategory = new Map<string, number>();
    let total = 0;
    for (const fact of context.facts(range)) {
      if (!context.counted(fact) || fact.type !== type) continue;
      if (fact.reportingCurrency !== context.reporting) continue;
      if (!context.matches(fact, { ...args, type })) continue;
      const key = context.categoryName(fact);
      byCategory.set(key, (byCategory.get(key) ?? 0) + fact.reportingAmount);
      total += fact.reportingAmount;
    }
    return { byCategory, total };
  };
  const a = sum(first);
  const b = sum(second);
  const change = a.total - b.total;
  const lines = [
    `[compare_periods] ${type} in ${context.reporting}: A ${first.label} = ${a.total.toFixed(2)}, B ${second.label} = ${b.total.toFixed(2)}, change A-B ${change.toFixed(2)} (${b.total > 0 ? `${Math.round((change / b.total) * 100)}%` : "n/a"})`,
    "category | A | B | change",
  ];
  const keys = new Set([...a.byCategory.keys(), ...b.byCategory.keys()]);
  const rows = [...keys]
    .map((key) => ({
      key,
      a: a.byCategory.get(key) ?? 0,
      b: b.byCategory.get(key) ?? 0,
    }))
    .sort((left, right) => Math.abs(right.a - right.b) - Math.abs(left.a - left.b))
    .slice(0, 12);
  for (const row of rows)
    lines.push(`${row.key} | ${row.a.toFixed(2)} | ${row.b.toFixed(2)} | ${(row.a - row.b).toFixed(2)}`);
  return { lines, cards: [] };
}

function accountsTool(context: ToolContext): ToolOutput {
  const accounts = selectAccounts(context.document, context.now);
  const lines = [
    "[accounts] name | type | balance | details",
    ...accounts.map((account) => {
      const details = [
        account.isExcluded ? "excluded from totals" : "",
        account.isDefault ? "default" : "",
        account.creditLimit != null
          ? `limit ${money(account.creditLimit, account.currencyCode)}, spent this cycle ${money(account.currentSpent, account.currencyCode)}, available ${money(account.availableCredit ?? 0, account.currencyCode)}`
          : "",
        account.billingCycle
          ? `cycle ${isoDay(account.billingCycle.cycleStart)}..${isoDay(account.billingCycle.cycleEnd)}`
          : "",
        `this month income ${money(account.monthlyIncome, account.currencyCode)}, expenses ${money(account.monthlyExpense, account.currencyCode)}`,
      ]
        .filter(Boolean)
        .join("; ");
      return `${account.name} | ${account.kind} | ${money(account.balance, account.currencyCode)} | ${details}`;
    }),
  ];
  return {
    lines,
    cards: accounts
      .slice(0, MAX_CARDS)
      .map(({ id }): ChatCard => ({ kind: "account", id })),
  };
}

/** Balances at a moment: today's balance minus every later transaction's effect. */
function netWorth(context: ToolContext, args: ChatToolArgs): ToolOutput {
  const range = context.range(args, null);
  const at = range ? Math.min(range.end.getTime(), context.now.getTime()) : context.now.getTime();
  const accounts = selectAccountBalances(context.document).filter(
    (account) => !account.isExcluded,
  );
  const balances = new Map(accounts.map((account) => [account.id, account.balance]));
  if (range)
    for (const fact of context.search.facts) {
      if (fact.entry.timestamp < at) break;
      const record = fact.entry.record;
      const amount = Math.abs(
        finite(record.accountAmount) ?? finite(record.amount) ?? 0,
      );
      const [source, destination] = fact.accounts;
      if (source && balances.has(source))
        balances.set(
          source,
          balances.get(source)! - (fact.type === "income" ? amount : -amount),
        );
      if (fact.type === "transfer" && destination && balances.has(destination))
        balances.set(destination, balances.get(destination)! - amount);
    }
  let assets = 0;
  let debts = 0;
  const unconverted = new Map<string, number>();
  const lines = [
    `[net_worth] as of ${isoDay(new Date(at - (range ? 1 : 0)))}${range ? " (end of requested period; balances rebuilt from transactions)" : " (now)"}, converted to ${context.currency} at latest saved rates`,
    "account | balance",
  ];
  for (const account of accounts) {
    const balance = balances.get(account.id) ?? 0;
    const name = context.name("accounts", account.id, account.id);
    lines.push(`${name} | ${money(balance, account.currencyCode)}`);
    const rate = context.rate(account.currencyCode);
    if (rate === null) {
      unconverted.set(
        account.currencyCode,
        (unconverted.get(account.currencyCode) ?? 0) + balance,
      );
      continue;
    }
    if (balance >= 0) assets += balance * rate;
    else debts += -balance * rate;
  }
  if (assets || debts || !unconverted.size)
    lines.push(
      `assets ${money(assets, context.currency)}, debts ${money(debts, context.currency)}, net worth ${money(assets - debts, context.currency)}`,
    );
  // Without a saved rate a currency is reported separately, never guessed.
  for (const [currency, total] of unconverted)
    lines.push(`net worth in ${currency} (no saved rate to ${context.currency}): ${money(total, currency)}`);
  return { lines, cards: [] };
}

function budgetsTool(context: ToolContext): ToolOutput {
  const budgets = selectBudgets(context.document, context.now);
  const lines = [
    "[budgets] name | status | spent / limit | remaining | period | daily allowance",
    ...budgets.map(
      (budget) =>
        `${budget.name} | ${budget.periodStatus}${budget.remaining < 0 ? ", OVER BUDGET" : ""} | ${money(budget.tracked, budget.currencyCode)} / ${money(budget.limit, budget.currencyCode)} (${Math.round(budget.percent)}%) | ${money(budget.remaining, budget.currencyCode)} | ${isoDay(budget.range.start)}..${isoDay(new Date(budget.range.end.getTime() - 1))}, ${budget.daysLeft} days left | ${money(budget.dailyAllowance, budget.currencyCode)}`,
    ),
  ];
  if (!budgets.length) lines.push("no budgets");
  return {
    lines,
    cards: budgets
      .slice(0, MAX_CARDS)
      .map(({ id }): ChatCard => ({ kind: "budget", id })),
  };
}

function recurringTool(context: ToolContext, args: ChatToolArgs): ToolOutput {
  const items = selectRecurrings(context.document, context.now);
  const active = items.filter((item) => !item.archived && item.valid);
  const yearly: Record<string, number> = {
    Daily: 365,
    Weekly: 52,
    Fortnightly: 26,
    Monthly: 12,
    Quarterly: 4,
    Biannually: 2,
    Yearly: 1,
  };
  const monthly = new Map<string, { income: number; expense: number }>();
  for (const item of active) {
    const bucket = monthly.get(item.currencyCode) ?? { income: 0, expense: 0 };
    const amount = (item.amount * (yearly[item.period] ?? 0)) / 12;
    if (item.type === 1) bucket.income += amount;
    else bucket.expense += amount;
    monthly.set(item.currencyCode, bucket);
  }
  const lines = [
    "[recurring] name | type | amount | period | next date | account | category",
    ...active.map(
      (item) =>
        `${item.name} | ${item.type === 1 ? "income" : "expense"} | ${money(item.amount, item.currencyCode)} | ${item.period} | ${item.next ? isoDay(item.next) : "-"}${item.due ? " (due)" : ""} | ${item.accountName} | ${item.categoryName}`,
    ),
  ];
  for (const [currency, bucket] of monthly)
    lines.push(
      `monthly average ${currency}: expenses ${money(bucket.expense, currency)}, income ${money(bucket.income, currency)}`,
    );
  const days = args.days ?? 30;
  const today = new Date(context.now.getFullYear(), context.now.getMonth(), context.now.getDate());
  const events = selectRecurringEvents(
    active,
    today,
    new Date(today.getFullYear(), today.getMonth(), today.getDate() + days),
  ).filter((event) => event.status === "pending");
  lines.push(`upcoming in next ${days} days: ${events.length}`);
  for (const event of events.slice(0, 15))
    lines.push(
      `${isoDay(event.date)} | ${event.recurring.name} | ${event.type === 1 ? "income" : "expense"} ${money(event.amount, event.currencyCode)}`,
    );
  if (!active.length) lines.push("no active recurring payments");
  return { lines, cards: [] };
}

function categoriesTool(context: ToolContext): ToolOutput {
  const current = financialMonth(context.now, context.monthStartDay, 0);
  const previous = financialMonth(context.now, context.monthStartDay, -1);
  const totals = (range: { start: Date; end: Date }) => {
    const map = new Map<string, number>();
    for (const fact of context.facts({ ...range, label: "" })) {
      if (!context.counted(fact) || fact.reportingCurrency !== context.reporting) continue;
      for (const id of fact.categoryPath.length ? fact.categoryPath : [fact.category])
        map.set(id, (map.get(id) ?? 0) + fact.reportingAmount);
    }
    return map;
  };
  const now = totals(current);
  const before = totals(previous);
  const categories = selectCategories(context.document);
  const lines = [
    `[categories] name | type | parent | this month | last month (${context.reporting})`,
    ...categories.map((category) => {
      const parent = category.parentId
        ? context.name("categories", category.parentId, "")
        : "";
      return `${category.name} | ${category.type === 1 ? "income" : category.type === 2 ? "transfer" : "expense"} | ${parent || "-"} | ${(now.get(category.id) ?? 0).toFixed(2)} | ${(before.get(category.id) ?? 0).toFixed(2)}`;
    }),
  ];
  return { lines, cards: [] };
}

function exchangeRatesTool(context: ToolContext): ToolOutput {
  const used = new Set<string>();
  for (const account of context.document.accounts)
    if (typeof account.currencyCode === "string") used.add(account.currencyCode.toUpperCase());
  for (const fact of context.search.facts.slice(0, 500)) used.add(fact.currencyCode);
  used.delete(context.currency);
  const snapshot = selectExchangeRates(context.document, context.currency);
  const lines = [
    `[exchange_rates] base ${context.currency}${snapshot ? `, saved ${snapshot.date}` : ", no saved snapshot for this base"}`,
  ];
  for (const code of used) {
    const rate = context.rate(code);
    lines.push(
      rate
        ? `1 ${code} = ${rate.toFixed(4)} ${context.currency}; 1 ${context.currency} = ${(1 / rate).toFixed(4)} ${code}`
        : `${code}: no saved rate`,
    );
  }
  lines.push("Each transaction also keeps the rate saved when it was recorded.");
  return { lines, cards: [] };
}

/** Goals, loans and assets have open-ended imported shapes; keep scalar fields. */
function holdingLine(record: JsonObject) {
  const parts: string[] = [];
  for (const [key, value] of Object.entries(record)) {
    if (/^(uuid|id|user|icon|iconPath|color|image|images|_.*)$/i.test(key)) continue;
    if (typeof value === "number" && Number.isFinite(value)) parts.push(`${key} ${value}`);
    else if (typeof value === "string" && value && value.length <= 60)
      parts.push(`${key} ${value}`);
    else if (typeof value === "boolean") parts.push(`${key} ${value}`);
    if (parts.length >= 10) break;
  }
  return parts.join(", ");
}

function holdingsTool(context: ToolContext): ToolOutput {
  const owned = createProfileMatcher(context.document);
  const lines: string[] = [];
  for (const key of ["goals", "loans", "assets"] as const) {
    const records = context.document[key].filter(owned);
    lines.push(`[${key}] ${records.length ? "" : "none"}`);
    lines.push(...records.slice(0, 15).map(holdingLine));
  }
  return { lines, cards: [] };
}

/**
 * The Reports screen's health model, plus the facts advice needs most:
 * trends, the month-end forecast, emergency-fund cover and fixed costs.
 */
function healthTool(context: ToolContext): ToolOutput {
  const cur = context.currency;
  const report = selectProfileReport(context.document, cur, context.now);
  // Findings reuse the Reports copy in English; the model answers in the
  // user's language.
  const t = i18n.getFixedT("en", "translation") as unknown as (
    key: string,
    values?: Record<string, string>,
  ) => string;
  const lines = [
    `[financial_health] ${cur}; this financial month ${isoDay(report.period.start)}..${isoDay(new Date(report.period.end.getTime() - 1))}, ${Math.round(report.progress * 100)}% elapsed`,
  ];
  if (!report.hasData) {
    lines.push("not enough records for a health reading yet");
    return { lines, cards: [] };
  }
  lines.push(
    `health score ${report.health.score}/100 (${report.health.band})`,
    `this month: income ${money(report.current.income, cur)}, expenses ${money(report.current.expense, cur)}, savings rate ${Math.round(report.savingsRate)}%${report.savingsRateChange == null ? "" : ` (${report.savingsRateChange >= 0 ? "+" : ""}${Math.round(report.savingsRateChange)} points vs last month)`}`,
    `forecast month-end expenses ${money(report.projectedExpense, cur)}${report.expenseChange == null ? "" : `; expenses vs last month ${report.expenseChange >= 0 ? "+" : ""}${Math.round(report.expenseChange)}%`}`,
  );
  const history = report.months.filter((month) => month.income || month.expense);
  if (history.length) {
    const averageExpense =
      history.reduce((sum, month) => sum + month.expense, 0) / history.length;
    const averageIncome =
      history.reduce((sum, month) => sum + month.income, 0) / history.length;
    lines.push(
      `${history.length}-month averages: income ${money(averageIncome, cur)}, expenses ${money(averageExpense, cur)}, net ${money(averageIncome - averageExpense, cur)}`,
      `months with a deficit: ${history.filter((month) => month.net < 0).length} of ${history.length}`,
    );
    // Emergency fund: cash-like balances divided by typical monthly spending.
    let liquid = 0;
    const unconverted: string[] = [];
    for (const account of selectAccounts(context.document, context.now)) {
      if (account.isExcluded || account.kind === "credit") continue;
      const rate = context.rate(account.currencyCode);
      if (rate === null) unconverted.push(account.currencyCode);
      else liquid += Math.max(account.balance, 0) * rate;
    }
    if (averageExpense > 0 && !unconverted.length)
      lines.push(
        `emergency fund: ${money(liquid, cur)} in cash-like accounts covers ${(liquid / averageExpense).toFixed(1)} months of average expenses`,
      );
    else if (unconverted.length)
      lines.push(
        `emergency fund: unknown, no saved ${[...new Set(unconverted)].join("/")} to ${cur} rate`,
      );
  }
  lines.push(
    `net worth ${money(report.netWorth.netWorth, cur)} (assets ${money(report.netWorth.assets, cur)}, debts ${money(report.netWorth.liabilities, cur)})`,
  );
  if (report.credit.utilization != null)
    lines.push(
      `credit cards: ${money(report.credit.used, cur)} used of ${money(report.credit.limit, cur)} limit (${Math.round(report.credit.utilization)}% utilization)`,
    );
  lines.push(
    `recurring expenses ${money(report.recurring.monthly, cur)}/month${report.recurring.share == null ? "" : ` = ${Math.round(report.recurring.share)}% of income`}`,
    `budgets: ${report.budgets.total} total, ${report.budgets.over} over, ${report.budgets.atRisk} at risk, ${report.budgets.onTrack} on track`,
    "top categories this month (share, change vs last month):",
    ...report.categories.map(
      (category) =>
        `- ${category.label}: ${money(category.amount, cur)} (${category.share}%${category.changePercent == null ? "" : `, ${category.changePercent >= 0 ? "+" : ""}${Math.round(category.changePercent)}%`})`,
    ),
    "findings (severity: finding - suggested action):",
    ...report.insights.map((insight) => {
      const values = Object.fromEntries(
        Object.entries(insight.values ?? {}).map(([key, value]) => [
          key,
          typeof value === "number" && /^(gap|amount|projected)$/.test(key)
            ? money(value, cur)
            : String(value),
        ]),
      );
      return `- ${insight.severity}: ${t(`reports.insights.${insight.id}.title`, values)} - ${t(`reports.insights.${insight.id}.recommendation`, values)}`;
    }),
  );
  return { lines, cards: [] };
}

/**
 * The global context tool: a dense, prioritized digest of the whole document
 * that fits the remaining prompt budget. Aggregates come first so even a tight
 * budget can answer totals; individual transactions fill what is left.
 */
function snapshotTool(context: ToolContext, budget: number): ToolOutput {
  const sections: string[][] = [];
  sections.push([
    `[financial_snapshot] today ${isoDay(context.now)}, profile currency ${context.currency}, financial month starts on day ${context.monthStartDay}`,
  ]);
  sections.push(
    netWorth(context, {}).lines.filter((line) =>
      /^(assets|net worth in) /.test(line),
    ),
  );
  sections.push(accountsTool(context).lines);
  sections.push(cashFlow(context, { period: "last_12_months" }).lines);
  sections.push(spendingSummary(context, { period: "this_month", limit: 8 }).lines);
  sections.push(spendingSummary(context, { period: "last_month", limit: 8 }).lines);
  sections.push(budgetsTool(context).lines);
  sections.push(recurringTool(context, { days: 30 }).lines.slice(0, 20));
  sections.push(exchangeRatesTool(context).lines);
  sections.push(holdingsTool(context).lines);
  const lines = sections.flat();
  let used = lines.reduce((sum, line) => sum + line.length + 1, 0);
  lines.push("[transactions] newest first: date | type | amount | name | category | account | note");
  for (const fact of context.search.facts) {
    const line = context.line(fact);
    if (used + line.length + 1 > budget) {
      lines.push("(older transactions omitted; use search_transactions for them)");
      break;
    }
    used += line.length + 1;
    lines.push(line);
  }
  return { lines, cards: [] };
}

function runTool(context: ToolContext, call: ChatToolCall, budget: number): ToolOutput {
  const { args } = call;
  switch (call.name) {
    case "financial_snapshot":
      return snapshotTool(context, budget);
    case "financial_health":
      return healthTool(context);
    case "search_transactions":
      return transactionList(context, "search_transactions", args, {
        sort: "newest",
        limit: 15,
        period: null,
      });
    case "largest_expenses":
      return transactionList(context, "largest_expenses", args, {
        type: "expense",
        sort: "largest",
        limit: 5,
        period: null,
      });
    case "recent_transactions":
      return transactionList(context, "recent_transactions", args, {
        sort: "newest",
        limit: 8,
        period: null,
      });
    case "spending_summary":
      return spendingSummary(context, args);
    case "cash_flow":
      return cashFlow(context, args);
    case "compare_periods":
      return comparePeriods(context, args);
    case "accounts":
      return accountsTool(context);
    case "net_worth":
      return netWorth(context, args);
    case "budgets":
      return budgetsTool(context);
    case "recurring":
      return recurringTool(context, args);
    case "categories":
      return categoriesTool(context);
    case "exchange_rates":
      return exchangeRatesTool(context);
    case "goals_loans_assets":
      return holdingsTool(context);
  }
}

/**
 * Runs the requested read-only tools and returns plain-text facts capped at
 * `charBudget`, plus the records the chat shows as tappable cards.
 */
export function runChatTools(
  document: BackupDocument,
  calls: readonly ChatToolCall[],
  options: { charBudget: number; now?: Date },
) {
  const context = new ToolContext(document, options.now ?? new Date());
  const unique = calls.filter(
    (call, index) =>
      calls.findIndex(
        (other) =>
          other.name === call.name &&
          JSON.stringify(other.args) === JSON.stringify(call.args),
      ) === index,
  );
  // Specific tools run first; the snapshot fills whatever budget remains.
  const ordered = [
    ...unique.filter((call) => call.name !== "financial_snapshot"),
    ...unique.filter((call) => call.name === "financial_snapshot"),
  ];
  const lines: string[] = [];
  const cards: ChatCard[] = [];
  let used = 0;
  let truncated = false;
  for (const call of ordered) {
    if (truncated) break;
    const output = runTool(context, call, options.charBudget - used);
    for (const line of output.lines) {
      if (used + line.length + 1 > options.charBudget) {
        lines.push("(truncated to fit the on-device context)");
        truncated = true;
        break;
      }
      used += line.length + 1;
      lines.push(line);
    }
    cards.push(...output.cards);
  }
  return {
    facts: lines.join("\n"),
    cards: cards
      .filter(
        (card, index) =>
          cards.findIndex(
            (other) => other.kind === card.kind && other.id === card.id,
          ) === index,
      )
      .slice(0, MAX_CARDS * 2),
  };
}
