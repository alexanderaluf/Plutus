import { identity } from "@/data/model/category-record";
import { isJsonObject } from "@/data/model/json";
import { transactionSnapshot } from "@/data/model/transaction-conversion";
import { normalizeSearchText } from "@/data/selectors/search-selectors";

import {
  isoDay,
  type ChatToolArgs,
  type DateRange,
  type SummaryGroup,
  type TransactionKind,
} from "../chat-tool-protocol";
import {
  DAY_MS,
  finite,
  MAX_CARDS,
  mean,
  median,
  money,
  percent,
  round2,
  standardDeviation,
  text,
  ToolOutput,
  WEEKDAYS,
  type Fact,
  type ToolContext,
} from "./tool-context";

export function totalsByCurrency(context: ToolContext, facts: Fact[]) {
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

export function transactionList(
  context: ToolContext,
  title: string,
  args: ChatToolArgs,
  defaults: { type?: TransactionKind; sort: string; limit: number; period: string | null },
): ToolOutput {
  const output = new ToolOutput(title, context);
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
  const offset = args.offset ?? 0;
  const shown = matches.slice(offset, offset + limit);
  const { limit: _limit, offset: _offset, sort: _sort, ...visibleFilters } = filters;
  output.fact("matchCount", matches.length, { range });
  output.line(
    `[${title}] ${range ? range.label : "all time"}; filters ${JSON.stringify(visibleFilters)}; sort ${sort}; ${matches.length} matches`,
  );
  for (const [currency, bucket] of totalsByCurrency(context, matches)) {
    output.fact(`expense.${currency}`, round2(bucket.expense), { currency, range });
    output.fact(`income.${currency}`, round2(bucket.income), { currency, range });
    output.line(
      `matched totals ${currency}: expenses ${money(bucket.expense, currency)}, income ${money(bucket.income, currency)}`,
    );
  }
  output.line("date | type | amount | name | category | account | note");
  output.line(...shown.map((fact) => context.line(fact)));
  const remaining = matches.length - offset - shown.length;
  if (remaining > 0)
    output.line(
      `(${remaining} more not listed; hasMore true, nextOffset ${offset + shown.length})`,
    );
  for (const fact of shown.slice(0, MAX_CARDS))
    output.card({ kind: "transaction", id: fact.entry.id });
  return output;
}

function groupKey(context: ToolContext, fact: Fact, group: SummaryGroup) {
  const date = new Date(fact.entry.timestamp);
  switch (group) {
    case "category":
      return context.categoryName(fact);
    case "parent_category": {
      const root = fact.categoryPath[fact.categoryPath.length - 1] ?? "";
      return context.name("categories", root, context.categoryName(fact));
    }
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
    case "currency":
      return fact.currencyCode;
    case "budget":
      return context.name("budgets", fact.budget, "No budget");
  }
}

export function spendingSummary(context: ToolContext, args: ChatToolArgs): ToolOutput {
  const output = new ToolOutput("spending_summary", context);
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
  output.fact("total", round2(total), { currency: context.reporting, range });
  output.line(
    `[spending_summary] ${type} by ${group}, ${range?.label ?? "all time"}; total ${money(total, context.reporting)}`,
    `${group} | amount | share | transactions`,
    ...sorted
      .slice(0, limit)
      .map(
        ([key, bucket]) =>
          `${key.split("\u0000")[0]} | ${money(bucket.amount, bucket.currency)} | ${bucket.currency === context.reporting ? percent(bucket.amount, total) : "-"} | ${bucket.count}`,
      ),
  );
  if (sorted.length > limit)
    output.line(`(${sorted.length - limit} smaller groups not listed)`);
  if (!sorted.length) output.line(`no ${type} in this period`);
  return output;
}

function bucketStart(date: Date, interval: "day" | "week" | "month") {
  if (interval === "day") return isoDay(date);
  if (interval === "week")
    return isoDay(
      new Date(date.getFullYear(), date.getMonth(), date.getDate() - date.getDay()),
    );
  return isoDay(date).slice(0, 7);
}

export function spendingTrend(context: ToolContext, args: ChatToolArgs): ToolOutput {
  const output = new ToolOutput("spending_trend", context);
  const interval = args.interval ?? "month";
  const range =
    context.range(args, null) ??
    context.range(
      {
        period:
          interval === "day"
            ? `last_${Math.min((args.months ?? 1) * 31, 92)}_days`
            : interval === "week"
              ? `last_${(args.months ?? 3) * 30}_days`
              : `last_${args.months ?? 6}_months`,
      },
      null,
    )!;
  const type = args.type === "income" ? "income" : "expense";
  const buckets = new Map<string, { amount: number; count: number }>();
  for (const fact of context.facts(range)) {
    if (!context.counted(fact) || fact.type !== type) continue;
    if (fact.reportingCurrency !== context.reporting) continue;
    if (!context.matches(fact, { ...args, type })) continue;
    const key = bucketStart(new Date(fact.entry.timestamp), interval);
    const bucket = buckets.get(key) ?? { amount: 0, count: 0 };
    bucket.amount += fact.reportingAmount;
    bucket.count++;
    buckets.set(key, bucket);
  }
  // Fill empty buckets so a gap reads as zero rather than missing.
  const keys: string[] = [];
  for (
    let cursor = new Date(range.start);
    cursor < range.end && keys.length < 400;
    cursor =
      interval === "day"
        ? new Date(cursor.getFullYear(), cursor.getMonth(), cursor.getDate() + 1)
        : interval === "week"
          ? new Date(cursor.getFullYear(), cursor.getMonth(), cursor.getDate() + 7)
          : new Date(cursor.getFullYear(), cursor.getMonth() + 1, 1)
  ) {
    const key = bucketStart(cursor, interval);
    if (!keys.includes(key)) keys.push(key);
  }
  const series = keys.map((key) => ({ key, ...(buckets.get(key) ?? { amount: 0, count: 0 }) }));
  const amounts = series.map((item) => item.amount);
  const half = Math.floor(series.length / 2);
  const firstHalf = mean(amounts.slice(0, half));
  const secondHalf = mean(amounts.slice(half));
  const { interval: _i, months: _m, ...filters } = args;
  output.line(
    `[spending_trend] ${type} per ${interval} in ${context.reporting}, ${range.label}; filters ${JSON.stringify(filters)}`,
    `${interval} | amount | transactions`,
    ...series.map((item) => `${item.key} | ${item.amount.toFixed(2)} | ${item.count}`),
    `average per ${interval} ${money(output.fact("average", round2(mean(amounts)), { currency: context.reporting, range }), context.reporting)}; first half average ${firstHalf.toFixed(2)}, second half average ${secondHalf.toFixed(2)}${firstHalf > 0 ? ` (${secondHalf >= firstHalf ? "+" : ""}${Math.round(((secondHalf - firstHalf) / firstHalf) * 100)}%)` : ""}`,
  );
  if (series.length < 3) output.warn("fewer than 3 intervals; a trend is not reliable");
  return output;
}

export function cashFlow(context: ToolContext, args: ChatToolArgs): ToolOutput {
  const output = new ToolOutput("cash_flow", context);
  const range = context.range(args, "this_month");
  const facts = context
    .facts(range)
    .filter((fact) => context.matches(fact, { ...args, type: "all" }));
  output.line(`[cash_flow] ${range?.label ?? "all time"}${range?.basis ? ` (${range.basis})` : ""}`);
  const totals = totalsByCurrency(context, facts);
  if (!totals.size) output.line("no income or expenses in this period");
  for (const [currency, bucket] of totals) {
    const net = bucket.income - bucket.expense;
    output.fact(`income.${currency}`, round2(bucket.income), { currency, range });
    output.fact(`expense.${currency}`, round2(bucket.expense), { currency, range });
    output.fact(`net.${currency}`, round2(net), { currency, range });
    output.line(
      `${currency}: income ${money(bucket.income, currency)}, expenses ${money(bucket.expense, currency)}, net ${money(net, currency)}, savings rate ${bucket.income > 0 ? percent(Math.max(net, 0), bucket.income) : "n/a"}, ${bucket.count} transactions`,
    );
  }
  if (range) {
    const days = Math.max(
      1,
      Math.round(
        (Math.min(range.end.getTime(), context.now.getTime()) - range.start.getTime()) /
          DAY_MS,
      ),
    );
    const main = totals.get(context.reporting);
    if (main)
      output.line(
        `average daily spending ${money(main.expense / days, context.reporting)} over ${days} days`,
      );
    if (range.end.getTime() - range.start.getTime() > 40 * DAY_MS) {
      const months = new Map<string, { income: number; expense: number }>();
      for (const fact of facts) {
        if (!context.counted(fact) || fact.reportingCurrency !== context.reporting) continue;
        const key = isoDay(new Date(fact.entry.timestamp)).slice(0, 7);
        const bucket = months.get(key) ?? { income: 0, expense: 0 };
        if (fact.type === "income") bucket.income += fact.reportingAmount;
        else bucket.expense += fact.reportingAmount;
        months.set(key, bucket);
      }
      output.line(`month | income | expenses | net (${context.reporting})`);
      for (const [key, bucket] of [...months].sort(([a], [b]) => a.localeCompare(b)))
        output.line(
          `${key} | ${bucket.income.toFixed(2)} | ${bucket.expense.toFixed(2)} | ${(bucket.income - bucket.expense).toFixed(2)}`,
        );
    }
  }
  return output;
}

export function comparePeriods(context: ToolContext, args: ChatToolArgs): ToolOutput {
  const output = new ToolOutput("compare_periods", context);
  const first = context.range({ period: args.period }, "this_month")!;
  const second = context.range({ period: args.periodB }, "last_month")!;
  const type = args.type === "income" ? "income" : "expense";
  const group: SummaryGroup = args.groupBy ?? "category";
  const sum = (range: DateRange) => {
    const byGroup = new Map<string, number>();
    let total = 0;
    for (const fact of context.facts(range)) {
      if (!context.counted(fact) || fact.type !== type) continue;
      if (fact.reportingCurrency !== context.reporting) continue;
      if (!context.matches(fact, { ...args, type })) continue;
      const key = groupKey(context, fact, group);
      byGroup.set(key, (byGroup.get(key) ?? 0) + fact.reportingAmount);
      total += fact.reportingAmount;
    }
    return { byGroup, total };
  };
  const a = sum(first);
  const b = sum(second);
  const change = a.total - b.total;
  output.fact("totalA", round2(a.total), { currency: context.reporting, range: first });
  output.fact("totalB", round2(b.total), { currency: context.reporting, range: second });
  output.line(
    `[compare_periods] ${type} in ${context.reporting}: A ${first.label} = ${a.total.toFixed(2)}, B ${second.label} = ${b.total.toFixed(2)}, change A-B ${change.toFixed(2)} (${b.total > 0 ? `${Math.round((change / b.total) * 100)}%` : "n/a"})`,
  );
  const elapsed = Math.min(context.now.getTime(), first.end.getTime()) - first.start.getTime();
  if (first.end.getTime() > context.now.getTime() && elapsed > 0)
    output.warn(
      `period A is still running (${Math.round((elapsed / (first.end.getTime() - first.start.getTime())) * 100)}% elapsed); compare pace, not totals`,
    );
  output.line(`${group} | A | B | change`);
  const keys = new Set([...a.byGroup.keys(), ...b.byGroup.keys()]);
  const rows = [...keys]
    .map((key) => ({
      key,
      a: a.byGroup.get(key) ?? 0,
      b: b.byGroup.get(key) ?? 0,
    }))
    .sort((left, right) => Math.abs(right.a - right.b) - Math.abs(left.a - left.b))
    .slice(0, 12);
  for (const row of rows)
    output.line(`${row.key} | ${row.a.toFixed(2)} | ${row.b.toFixed(2)} | ${(row.a - row.b).toFixed(2)}`);
  if (!b.total && !a.total) output.missingData("no transactions in either period");
  return output;
}

function findTransaction(context: ToolContext, args: ChatToolArgs) {
  if (args.id) {
    const byId = context.search.facts.find((fact) => fact.entry.id === args.id);
    if (byId) return { fact: byId, candidates: [] as Fact[] };
  }
  const query = args.query ?? args.id;
  if (!query) return { fact: null, candidates: [] as Fact[] };
  const tokens = normalizeSearchText(query).split(/\s+/).filter(Boolean);
  const matches = context.search.facts.filter((fact) =>
    tokens.every((token) => fact.haystack.includes(token)),
  );
  return matches.length === 1
    ? { fact: matches[0], candidates: [] }
    : { fact: null, candidates: matches };
}

export function transactionDetails(context: ToolContext, args: ChatToolArgs): ToolOutput {
  const output = new ToolOutput("transaction_details", context);
  const { fact, candidates } = findTransaction(context, args);
  if (!fact) {
    if (candidates.length) {
      output.line(
        `[transaction_details] ${candidates.length} transactions match; ask which one:`,
        ...candidates.slice(0, 8).map((item) => context.line(item)),
      );
      for (const item of candidates.slice(0, MAX_CARDS))
        output.card({ kind: "transaction", id: item.entry.id });
    } else output.line("[transaction_details] no matching transaction");
    return output;
  }
  const record = fact.entry.record;
  const path = [...fact.categoryPath]
    .reverse()
    .map((id) => context.name("categories", id, ""))
    .filter(Boolean)
    .join(" > ");
  const snapshot = transactionSnapshot(record);
  const allocations = Array.isArray(record.cardPaymentAllocations)
    ? record.cardPaymentAllocations.filter(isJsonObject)
    : [];
  output.line(
    `[transaction_details] ${fact.entry.id}`,
    `name ${context.merchant(fact)}; type ${fact.type}; date ${new Date(fact.entry.timestamp).toISOString()}`,
    `amount ${money(fact.amount, fact.currencyCode)}${fact.reportingCurrency !== fact.currencyCode ? `; in ${fact.reportingCurrency} ${money(fact.reportingAmount, fact.reportingCurrency)}` : ""}`,
  );
  const accountAmount = finite(record.accountAmount);
  if (accountAmount !== null && text(record.accountCurrencyCode) && record.accountCurrencyCode !== fact.currencyCode)
    output.line(`account amount ${money(accountAmount, text(record.accountCurrencyCode))}`);
  if (snapshot || finite(record.exchangeRate) !== null)
    output.line(
      `exchange rate saved with the transaction: ${finite(record.exchangeRate) ?? "snapshot"}${snapshot ? `, rate table ${snapshot.base} dated ${snapshot.date}` : ""}`,
    );
  output.line(
    `category ${path || "Uncategorized"}; account ${fact.accounts.map((id) => context.name("accounts", id, "?")).join(" -> ") || "none"}`,
  );
  const extras = [
    fact.person ? `person ${context.name("people", fact.person, "?")}` : "",
    fact.place ? `place ${context.name("places", fact.place, "?")}` : "",
    fact.labels.length ? `labels ${fact.labels.map((id) => context.name("labels", id, "?")).join(", ")}` : "",
    text(record.loan) ? `loan ${context.name("loans", text(record.loan), "?")}` : "",
    fact.budget ? `budget ${context.name("budgets", fact.budget, "?")}` : "",
    text(record.description) ? `note ${text(record.description).slice(0, 120)}` : "",
    `receipt ${fact.hasReceipt ? "attached" : "none"}`,
  ].filter(Boolean);
  output.line(extras.join("; "));
  if (context.isCardPayment(fact))
    output.line(
      `card settlement for period ${text(record.cardPaymentPeriod, "?")}, created by the app; ${allocations.length} card purchases settled`,
    );
  output.card({ kind: "transaction", id: fact.entry.id });
  return output;
}

export function merchantAnalysis(context: ToolContext, args: ChatToolArgs): ToolOutput {
  const output = new ToolOutput("merchant_analysis", context);
  const wanted = args.merchant ?? args.query;
  if (!wanted) {
    output.line("[merchant_analysis] no merchant given").missingData("merchant name");
    return output;
  }
  const needle = normalizeSearchText(wanted);
  const all = context.search.facts.filter(
    (fact) =>
      fact.type !== "transfer" &&
      (normalizeSearchText(context.merchant(fact)).includes(needle) ||
        normalizeSearchText(context.name("people", fact.person, "")).includes(needle) ||
        normalizeSearchText(context.name("places", fact.place, "")).includes(needle)),
  );
  if (!all.length) {
    output.line(`[merchant_analysis] no transactions for "${wanted}"`);
    return output;
  }
  const range = context.range(args, null);
  const inRange = range
    ? all.filter(
        (fact) =>
          fact.entry.timestamp >= range.start.getTime() &&
          fact.entry.timestamp < range.end.getTime(),
      )
    : all;
  const describe = (facts: Fact[], label: string) => {
    const amounts = facts
      .filter((fact) => fact.reportingCurrency === context.reporting)
      .map((fact) => fact.reportingAmount);
    const total = amounts.reduce((sum, value) => sum + value, 0);
    output.fact(`${label}.total`, round2(total), { currency: context.reporting });
    output.line(
      `${label}: ${facts.length} transactions, total ${money(total, context.reporting)}, average ${money(mean(amounts), context.reporting)}, median ${money(median(amounts), context.reporting)}, largest ${money(Math.max(0, ...amounts), context.reporting)}, smallest ${money(amounts.length ? Math.min(...amounts) : 0, context.reporting)}`,
    );
  };
  output.line(`[merchant_analysis] "${wanted}"`);
  describe(all, "lifetime");
  if (range) describe(inRange, range.label);
  const oldest = all[all.length - 1];
  output.line(
    `first ${isoDay(new Date(oldest.entry.timestamp))}, last ${isoDay(new Date(all[0].entry.timestamp))}`,
  );
  const months = new Map<string, number>();
  for (const fact of all) {
    if (fact.reportingCurrency !== context.reporting) continue;
    const key = isoDay(new Date(fact.entry.timestamp)).slice(0, 7);
    months.set(key, (months.get(key) ?? 0) + fact.reportingAmount);
  }
  const monthly = [...months].sort(([a], [b]) => a.localeCompare(b)).slice(-12);
  output.line(
    `monthly (${context.reporting}): ${monthly.map(([key, value]) => `${key} ${value.toFixed(2)}`).join(", ")}`,
    `average per active month ${money(mean(monthly.map(([, value]) => value)), context.reporting)}`,
  );
  const tally = (values: string[]) =>
    [...values.reduce((map, value) => map.set(value, (map.get(value) ?? 0) + 1), new Map<string, number>())]
      .sort((a, b) => b[1] - a[1])
      .slice(0, 4)
      .map(([value, count]) => `${value} (${count})`)
      .join(", ");
  output.line(
    `categories: ${tally(all.map((fact) => context.categoryName(fact)))}`,
    `accounts: ${tally(all.map((fact) => context.name("accounts", fact.accounts[0] ?? "", "none")))}`,
  );
  output.line("recent:", ...all.slice(0, 5).map((fact) => context.line(fact)));
  for (const fact of all.slice(0, 4)) output.card({ kind: "transaction", id: fact.entry.id });
  return output;
}

export function unusualTransactions(context: ToolContext, args: ChatToolArgs): ToolOutput {
  const output = new ToolOutput("unusual_transactions", context);
  const range = context.range(args, "last_90_days")!;
  const expenses = context.search.facts.filter(
    (fact) =>
      fact.type === "expense" &&
      context.counted(fact) &&
      fact.reportingCurrency === context.reporting,
  );
  const byMerchant = new Map<string, Fact[]>();
  const byCategory = new Map<string, Fact[]>();
  for (const fact of expenses) {
    const merchant = normalizeSearchText(context.merchant(fact));
    byMerchant.set(merchant, [...(byMerchant.get(merchant) ?? []), fact]);
    byCategory.set(fact.category, [...(byCategory.get(fact.category) ?? []), fact]);
  }
  const all = expenses.map((fact) => fact.reportingAmount);
  const p90 = [...all].sort((a, b) => a - b)[Math.floor(all.length * 0.9)] ?? 0;
  const flagged: { fact: Fact; reasons: string[]; score: number }[] = [];
  for (const fact of expenses) {
    if (fact.entry.timestamp < range.start.getTime() || fact.entry.timestamp >= range.end.getTime())
      continue;
    const reasons: string[] = [];
    let score = 0;
    const merchant = normalizeSearchText(context.merchant(fact));
    const history = (byMerchant.get(merchant) ?? []).filter((other) => other !== fact);
    if (history.length >= 3) {
      const baseline = median(history.map((other) => other.reportingAmount));
      if (baseline > 0 && fact.reportingAmount >= baseline * 3) {
        reasons.push(`ABOVE_MERCHANT_MEDIAN ${(fact.reportingAmount / baseline).toFixed(1)}x (median ${baseline.toFixed(2)} over ${history.length})`);
        score += fact.reportingAmount / baseline;
      }
    } else if (history.length === 0 && all.length >= 20 && fact.reportingAmount > p90) {
      reasons.push(`FIRST_TIME_MERCHANT_HIGH_AMOUNT (above 90th percentile ${p90.toFixed(2)})`);
      score += 2;
    }
    const category = (byCategory.get(fact.category) ?? []).filter((other) => other !== fact);
    if (category.length >= 5) {
      const baseline = median(category.map((other) => other.reportingAmount));
      if (baseline > 0 && fact.reportingAmount >= baseline * 4) {
        reasons.push(`ABOVE_CATEGORY_MEDIAN ${(fact.reportingAmount / baseline).toFixed(1)}x (median ${baseline.toFixed(2)})`);
        score += fact.reportingAmount / baseline / 2;
      }
    }
    const repeat = history.find(
      (other) =>
        Math.abs(other.entry.timestamp - fact.entry.timestamp) <= 2 * DAY_MS &&
        other.amount === fact.amount &&
        other.currencyCode === fact.currencyCode,
    );
    if (repeat) {
      reasons.push(`REPEATED_SAME_AMOUNT within 2 days (${repeat.entry.id})`);
      score += 2;
    }
    if (fact.currencyCode !== context.currency && fact.reportingAmount > p90 && all.length >= 10) {
      reasons.push(`LARGE_FOREIGN_CURRENCY ${fact.currencyCode}`);
      score += 1;
    }
    const account = context.accountsView().find((item) => item.id === fact.accounts[0]);
    if (account?.kind === "cash" && fact.reportingAmount > p90 && all.length >= 10) {
      reasons.push("LARGE_CASH_PAYMENT");
      score += 1;
    }
    if (reasons.length) flagged.push({ fact, reasons, score });
  }
  flagged.sort((a, b) => b.score - a.score);
  const limit = args.limit ?? 8;
  output.fact("count", flagged.length, { range });
  output.line(
    `[unusual_transactions] ${range.label}: ${flagged.length} worth reviewing (unusual, not necessarily wrong or fraudulent)`,
    ...flagged.slice(0, limit).map(({ fact, reasons }) => `${context.line(fact)} | ${reasons.join("; ")}`),
  );
  if (expenses.length < 20)
    output.warn("little spending history; unusual-amount detection is weak");
  for (const { fact } of flagged.slice(0, MAX_CARDS))
    output.card({ kind: "transaction", id: fact.entry.id });
  return output;
}

/** Deterministic duplicate score: share of matching criteria. */
export function duplicateCandidates(context: ToolContext, args: ChatToolArgs) {
  const range = context.range(args, "last_90_days")!;
  const windowMs = (args.days ?? 3) * DAY_MS;
  const buckets = new Map<string, Fact[]>();
  for (const fact of context.facts(range)) {
    if (fact.type === "transfer" || context.isCardPayment(fact)) continue;
    const key = `${fact.amount}|${fact.currencyCode}|${fact.type}`;
    buckets.set(key, [...(buckets.get(key) ?? []), fact]);
  }
  const pairs: { a: Fact; b: Fact; score: number; criteria: string[] }[] = [];
  for (const group of buckets.values()) {
    for (let i = 0; i < group.length; i++)
      for (let j = i + 1; j < group.length; j++) {
        const a = group[i];
        const b = group[j];
        const gap = Math.abs(a.entry.timestamp - b.entry.timestamp);
        if (gap > windowMs) continue;
        const criteria = ["same amount and currency"];
        const nameA = normalizeSearchText(context.merchant(a));
        const nameB = normalizeSearchText(context.merchant(b));
        if (a.accounts[0] && a.accounts[0] === b.accounts[0]) criteria.push("same account");
        if (nameA && (nameA === nameB || nameA.includes(nameB) || nameB.includes(nameA)))
          criteria.push("same name");
        if (a.category && a.category === b.category) criteria.push("same category");
        if (gap <= DAY_MS) criteria.push("within 1 day");
        const score = criteria.length / 5;
        if (score >= 0.6) pairs.push({ a, b, score, criteria });
      }
  }
  return { range, pairs: pairs.sort((x, y) => y.score - x.score) };
}

export function duplicateTransactions(context: ToolContext, args: ChatToolArgs): ToolOutput {
  const output = new ToolOutput("duplicate_transaction_candidates", context);
  const { range, pairs } = duplicateCandidates(context, args);
  output.fact("count", pairs.length, { range });
  output.line(
    `[duplicate_transaction_candidates] ${range.label}, window ${args.days ?? 3} days: ${pairs.length} candidate pairs (score = matching criteria / 5; transfers and card settlements excluded)`,
  );
  for (const pair of pairs.slice(0, args.limit ?? 8)) {
    output.line(
      `score ${pair.score.toFixed(1)} (${pair.criteria.join(", ")})`,
      `  A ${pair.a.entry.id}: ${context.line(pair.a)}`,
      `  B ${pair.b.entry.id}: ${context.line(pair.b)}`,
    );
    output.card({ kind: "transaction", id: pair.a.entry.id });
    output.card({ kind: "transaction", id: pair.b.entry.id });
  }
  return output;
}

export function uncategorizedTransactions(context: ToolContext, args: ChatToolArgs): ToolOutput {
  const output = new ToolOutput("uncategorized_transactions", context);
  const range = context.range(args, null);
  const categories = context.lookup("categories");
  const matches = context
    .facts(range)
    .filter(
      (fact) =>
        fact.type !== "transfer" &&
        (!fact.category || !categories.get(fact.category)),
    );
  const total = matches
    .filter((fact) => fact.reportingCurrency === context.reporting)
    .reduce((sum, fact) => sum + fact.reportingAmount, 0);
  output.fact("count", matches.length, { range });
  output.line(
    `[uncategorized_transactions] ${range?.label ?? "all time"}: ${matches.length} without a valid category, total ${money(total, context.reporting)}`,
    ...matches.slice(0, args.limit ?? 10).map((fact) => context.line(fact)),
  );
  for (const fact of matches.slice(0, MAX_CARDS))
    output.card({ kind: "transaction", id: fact.entry.id });
  return output;
}

export function incomeAnalysis(context: ToolContext, args: ChatToolArgs): ToolOutput {
  const output = new ToolOutput("income_analysis", context);
  const months = args.months ?? 12;
  const range = context.range(args, `last_${months}_months`)!;
  const incomes = context
    .facts(range)
    .filter(
      (fact) =>
        fact.type === "income" &&
        context.counted(fact) &&
        fact.reportingCurrency === context.reporting,
    );
  const recurringNames = new Set(
    context
      .activeRecurrings()
      .filter((item) => item.type === 1)
      .map((item) => normalizeSearchText(item.name)),
  );
  const sources = new Map<string, { total: number; count: number; months: Set<string> }>();
  for (const fact of incomes) {
    const key = context.merchant(fact);
    const source = sources.get(key) ?? { total: 0, count: 0, months: new Set<string>() };
    source.total += fact.reportingAmount;
    source.count++;
    source.months.add(isoDay(new Date(fact.entry.timestamp)).slice(0, 7));
    sources.set(key, source);
  }
  const monthly = context.monthlyTotals(months).map((month) => month.income);
  const completed = context.completedMonths(months).map((month) => month.income);
  const average = mean(completed);
  const deviation = standardDeviation(completed);
  const total = incomes.reduce((sum, fact) => sum + fact.reportingAmount, 0);
  output.fact("total", round2(total), { currency: context.reporting, range });
  output.fact("monthlyAverage", round2(average), { currency: context.reporting });
  output.line(
    `[income_analysis] ${range.label} in ${context.reporting}: total ${money(total, context.reporting)}; completed-month average ${money(average, context.reporting)}, median ${money(median(completed), context.reporting)}, variation ${average > 0 ? Math.round((deviation / average) * 100) : 0}% (${completed.length} months)`,
    `per financial month: ${context
      .monthlyTotals(months)
      .map((month, index) => `${month.key}${month.partial ? " (running)" : ""} ${monthly[index].toFixed(2)}`)
      .join(", ")}`,
    "source | total | transactions | months seen | kind",
  );
  for (const [name, source] of [...sources].sort((a, b) => b[1].total - a[1].total).slice(0, 10)) {
    const regular =
      recurringNames.has(normalizeSearchText(name)) || source.months.size >= 3;
    output.line(
      `${name} | ${source.total.toFixed(2)} | ${source.count} | ${source.months.size} | ${regular ? "recurring" : "irregular"}`,
    );
  }
  if (completed.length >= 6) {
    const recent = mean(completed.slice(-3));
    const earlier = mean(completed.slice(-6, -3));
    output.line(
      `trend: last 3 months average ${recent.toFixed(2)} vs previous 3 ${earlier.toFixed(2)}${earlier > 0 ? ` (${recent >= earlier ? "+" : ""}${Math.round(((recent - earlier) / earlier) * 100)}%)` : ""}`,
    );
  } else output.warn("fewer than 6 completed months; income trend is not reliable");
  const next = context.upcomingEvents(62).find((event) => event.type === 1);
  output.line(
    next
      ? `next expected recurring income: ${next.recurring.name} ${money(next.amount, next.currencyCode)} on ${isoDay(next.date)}`
      : "no recurring income scheduled",
  );
  return output;
}

/** Used by data quality and snapshot tools. */
export function orphanReferences(context: ToolContext) {
  const accounts = context.lookup("accounts");
  const categories = context.lookup("categories");
  let missingAccount = 0;
  let missingCategory = 0;
  const ids: string[] = [];
  for (const record of context.records("transactions")) {
    const account = record.account ?? record.fromAccount;
    if (account != null && !accounts.get(String(account))) {
      missingAccount++;
      ids.push(identity(record));
    }
    if (record.category != null && record.category !== "" && !categories.get(String(record.category))) {
      missingCategory++;
      ids.push(identity(record));
    }
  }
  return { missingAccount, missingCategory, ids };
}
