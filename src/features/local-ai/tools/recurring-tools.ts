import { identity } from "@/data/model/category-record";
import { normalizeSearchText } from "@/data/selectors/search-selectors";

import { isoDay, type ChatToolArgs } from "../chat-tool-protocol";
import { obligationsWithin } from "./account-tools";
import {
  DAY_MS,
  MAX_CARDS,
  mean,
  median,
  money,
  numeric,
  parseDate,
  PERIODS_PER_YEAR,
  resolveOne,
  round2,
  standardDeviation,
  startOfDay,
  text,
  ToolOutput,
  type Fact,
  type ToolContext,
} from "./tool-context";

export function recurringTool(context: ToolContext, args: ChatToolArgs): ToolOutput {
  const output = new ToolOutput("recurring", context);
  const active = context.activeRecurrings();
  const monthly = new Map<string, { income: number; expense: number }>();
  for (const item of active) {
    const bucket = monthly.get(item.currencyCode) ?? { income: 0, expense: 0 };
    const amount = (item.amount * (PERIODS_PER_YEAR[item.period] ?? 0)) / 12;
    if (item.type === 1) bucket.income += amount;
    else bucket.expense += amount;
    monthly.set(item.currencyCode, bucket);
  }
  output.line(
    "[recurring] name | type | amount | period | next date | account | category",
    ...active.map(
      (item) =>
        `${item.name} | ${item.type === 1 ? "income" : "expense"} | ${money(item.amount, item.currencyCode)} | ${item.period} | ${item.next ? isoDay(item.next) : "-"}${item.due ? " (due)" : ""} | ${item.accountName} | ${item.categoryName}`,
    ),
  );
  for (const [currency, bucket] of monthly) {
    output.fact(`monthlyExpense.${currency}`, round2(bucket.expense), { currency });
    output.line(
      `monthly average ${currency}: expenses ${money(bucket.expense, currency)}, income ${money(bucket.income, currency)}`,
    );
  }
  const days = args.days ?? 30;
  const events = context.upcomingEvents(days);
  output.line(`upcoming in next ${days} days: ${events.length}`);
  for (const event of events.slice(0, 15))
    output.line(
      `${isoDay(event.date)} | ${event.recurring.name} | ${event.type === 1 ? "income" : "expense"} ${money(event.amount, event.currencyCode)}`,
    );
  if (!active.length) output.line("no active recurring payments");
  for (const item of active.slice(0, MAX_CARDS)) output.card({ kind: "recurring", id: item.id });
  return output;
}

export function upcomingObligations(context: ToolContext, args: ChatToolArgs): ToolOutput {
  const output = new ToolOutput("upcoming_obligations", context);
  const days = args.days ?? 30;
  const horizon = startOfDay(context.now, days + 1).getTime();
  const today = startOfDay(context.now).getTime();
  const obligations = obligationsWithin(context, days);
  const rows: { date: Date; line: string }[] = [];
  for (const event of obligations.events)
    rows.push({
      date: event.date,
      line: `${event.type === 1 ? "income" : "bill"} | ${event.recurring.name} | ${event.type === 1 ? "+" : "-"}${money(event.amount, event.currencyCode)}`,
    });
  for (const payment of obligations.cardPayments)
    rows.push({
      date: payment.date,
      line: `card payment | ${payment.account.name} | -${money(payment.amount, payment.account.currencyCode)} (recorded debt so far)`,
    });
  for (const loan of context.records("loans")) {
    const due = parseDate(loan.dueDate);
    if (!due || due.getTime() < today || due.getTime() >= horizon) continue;
    const amount = numeric(loan.amount);
    rows.push({
      date: due,
      line: `loan due | ${text(loan.name, "Loan")} | ${amount === null ? "amount not recorded" : money(Math.abs(amount), text(loan.currencyCode, context.currency))}`,
    });
  }
  for (const goal of context.records("goals")) {
    const due = parseDate(goal.targetDate);
    if (!due || due.getTime() < today || due.getTime() >= horizon) continue;
    rows.push({ date: due, line: `goal target date | ${text(goal.name, "Goal")} | (context only)` });
  }
  rows.sort((a, b) => a.date.getTime() - b.date.getTime());
  const cur = context.currency;
  output.fact("expense", round2(obligations.expense + obligations.cardTotal), { currency: cur, kind: "projection" });
  output.fact("income", round2(obligations.income), { currency: cur, kind: "projection" });
  output.line(
    `[upcoming_obligations] next ${days} days, chronological:`,
    ...rows.map((row) => `${isoDay(row.date)} | ${row.line}`),
    `totals in ${cur}: bills ${money(obligations.expense, cur)}, card payments ${money(obligations.cardTotal, cur)}, income ${money(obligations.income, cur)}, net ${money(obligations.income - obligations.expense - obligations.cardTotal, cur)}`,
  );
  const contributions = context
    .accountsView()
    .filter((account) => (account.savingsSummary?.monthlyContribution ?? 0) > 0);
  for (const account of contributions)
    output.line(
      `planned savings contribution (not scheduled as a payment): ${account.name} ${money(account.savingsSummary!.monthlyContribution, account.currencyCode)}/month`,
    );
  if (!rows.length) output.line("nothing scheduled in this window");
  if (obligations.unconverted.length)
    output.warn(`no saved rate for ${obligations.unconverted.join(", ")}; those items are not in the totals`);
  for (const event of obligations.events.slice(0, MAX_CARDS))
    output.card({ kind: "recurring", id: event.recurring.id });
  return output;
}

export function subscriptionAnalysis(context: ToolContext): ToolOutput {
  const output = new ToolOutput("subscription_analysis", context);
  const income = mean(context.completedMonths(6).map((month) => month.income));
  const items = context
    .activeRecurrings()
    .filter((item) => item.type === 0)
    .map((item) => {
      const monthly = (item.amount * (PERIODS_PER_YEAR[item.period] ?? 0)) / 12;
      const paid = item.history
        .filter((entry) => entry.status === "processed")
        .reduce((sum, entry) => sum + (numeric(entry.amount) ?? 0), 0);
      const started = parseDate(item.startAt);
      return { item, monthly, converted: context.convert(monthly, item.currencyCode), paid, started };
    })
    .sort((a, b) => (b.converted ?? 0) - (a.converted ?? 0));
  const total = items.reduce((sum, row) => sum + (row.converted ?? 0), 0);
  output.fact("monthlyTotal", round2(total), { currency: context.currency });
  output.line(
    `[subscription_analysis] ${items.length} active recurring expenses, ${money(total, context.currency)}/month, ${money(total * 12, context.currency)}/year${income > 0 ? `, ${Math.round((total / income) * 100)}% of average income` : ""}`,
    "name | monthly | yearly | share of income | category | account | next | since | recorded paid",
  );
  for (const row of items) {
    const { item } = row;
    output.line(
      `${item.name} | ${money(row.monthly, item.currencyCode)} | ${money(row.monthly * 12, item.currencyCode)} | ${income > 0 && row.converted !== null ? `${((row.converted / income) * 100).toFixed(1)}%` : "n/a"} | ${item.categoryName} | ${item.accountName} | ${item.next ? isoDay(item.next) : "-"} | ${row.started ? isoDay(row.started) : "?"} | ${money(row.paid, item.currencyCode)}`,
    );
  }
  output.line("Plutus has no usage data, so it cannot tell whether a service is used.");
  for (const row of items.slice(0, MAX_CARDS)) output.card({ kind: "recurring", id: row.item.id });
  return output;
}

export function fixedCostAnalysis(context: ToolContext): ToolOutput {
  const output = new ToolOutput("fixed_cost_analysis", context);
  const cur = context.currency;
  const recurring = context.recurringMonthly();
  const months = context.completedMonths(6);
  const averageIncome = mean(months.map((month) => month.income));
  const current = context.monthlyTotals(1)[0];
  const byCategory = new Map<string, number>();
  for (const item of context.activeRecurrings()) {
    if (item.type !== 0) continue;
    const converted = context.convert(
      (item.amount * (PERIODS_PER_YEAR[item.period] ?? 0)) / 12,
      item.currencyCode,
    );
    if (converted === null) continue;
    byCategory.set(item.categoryName, (byCategory.get(item.categoryName) ?? 0) + converted);
  }
  output.fact("monthly", round2(recurring.expense), { currency: cur });
  output.line(
    `[fixed_cost_analysis] fixed recurring expenses ${money(recurring.expense, cur)}/month`,
    `share of average income (${months.length} completed months, ${money(averageIncome, cur)}): ${averageIncome > 0 ? `${Math.round((recurring.expense / averageIncome) * 100)}%` : "n/a"}`,
    `share of this month's income so far (${money(current.income, cur)}): ${current.income > 0 ? `${Math.round((recurring.expense / current.income) * 100)}%` : "n/a"}`,
    "by category:",
    ...[...byCategory]
      .sort((a, b) => b[1] - a[1])
      .map(([name, amount]) => `- ${name}: ${money(amount, cur)}`),
  );
  if (recurring.unconverted.length)
    output.warn(`no saved rate for ${recurring.unconverted.join(", ")}; excluded`);
  return output;
}

export function recurringHistory(context: ToolContext, args: ChatToolArgs): ToolOutput {
  const output = new ToolOutput("recurring_history", context);
  const record = resolveOne(context, output, "recurrings", args.id ?? args.query, "recurring payment");
  if (!record) return output;
  const item = context.recurringsView().find((entry) => entry.id === identity(record));
  if (!item) return output;
  const processed = item.history.filter((entry) => entry.status === "processed");
  const skipped = item.history.filter((entry) => entry.status === "skipped");
  const paid = processed.reduce((sum, entry) => sum + (numeric(entry.amount) ?? 0), 0);
  output.line(
    `[recurring_history] ${item.name}: ${item.period} ${item.type === 1 ? "income" : "expense"} ${money(item.amount, item.currencyCode)}; ${item.archived ? "archived" : `next ${item.next ? isoDay(item.next) : "-"}${item.due ? " (due now)" : ""}`}; ${item.automatic ? "automatic" : "needs confirmation"}`,
    `${processed.length} processed (total ${money(paid, item.currencyCode)}), ${skipped.length} skipped`,
    "scheduled | status | amount | transaction",
    ...item.history
      .slice(-12)
      .map(
        (entry) =>
          `${text(entry.scheduledAt).slice(0, 10)} | ${text(entry.status)} | ${numeric(entry.amount) ?? "-"} ${text(entry.currencyCode)} | ${text(entry.transactionId, "-")}`,
      ),
  );
  output.card({ kind: "recurring", id: item.id });
  return output;
}

export function recurringCandidates(context: ToolContext) {
  const since = startOfDay(context.now, -365).getTime();
  const tracked = new Set(context.recurringsView().map((item) => normalizeSearchText(item.name)));
  const groups = new Map<string, Fact[]>();
  for (const fact of context.search.facts) {
    if (fact.entry.timestamp < since || fact.type !== "expense" || !context.counted(fact)) continue;
    const key = normalizeSearchText(context.merchant(fact));
    if (!key || tracked.has(key)) continue;
    groups.set(key, [...(groups.get(key) ?? []), fact]);
  }
  const cadences = [
    { name: "weekly", days: 7, tolerance: 2 },
    { name: "fortnightly", days: 14, tolerance: 3 },
    { name: "monthly", days: 30.4, tolerance: 5 },
    { name: "quarterly", days: 91, tolerance: 10 },
    { name: "yearly", days: 365, tolerance: 20 },
  ];
  const candidates: {
    name: string;
    cadence: string;
    amount: number;
    currency: string;
    count: number;
    last: Date;
    ids: string[];
  }[] = [];
  for (const facts of groups.values()) {
    if (facts.length < 3) continue;
    const sorted = [...facts].sort((a, b) => a.entry.timestamp - b.entry.timestamp);
    const amounts = sorted.map((fact) => fact.amount);
    const average = mean(amounts);
    if (average <= 0 || standardDeviation(amounts) / average > 0.15) continue;
    const gaps = sorted.slice(1).map((fact, index) => (fact.entry.timestamp - sorted[index].entry.timestamp) / DAY_MS);
    const gap = median(gaps);
    const cadence = cadences.find((option) => Math.abs(gap - option.days) <= option.tolerance);
    if (!cadence) continue;
    candidates.push({
      name: context.merchant(sorted[sorted.length - 1]),
      cadence: cadence.name,
      amount: median(amounts),
      currency: sorted[0].currencyCode,
      count: sorted.length,
      last: new Date(sorted[sorted.length - 1].entry.timestamp),
      ids: sorted.slice(-2).map((fact) => fact.entry.id),
    });
  }
  return candidates.sort((a, b) => b.count - a.count);
}

export function recurringCandidateDetector(context: ToolContext): ToolOutput {
  const output = new ToolOutput("recurring_candidate_detector", context);
  const candidates = recurringCandidates(context);
  output.fact("count", candidates.length);
  output.line(
    `[recurring_candidate_detector] ${candidates.length} repeating payments in the last 12 months that are not tracked as recurring (candidates only; nothing is created):`,
    ...candidates
      .slice(0, 10)
      .map(
        (candidate) =>
          `${candidate.name} | ${candidate.cadence} | typical ${money(candidate.amount, candidate.currency)} | ${candidate.count} times | last ${isoDay(candidate.last)}`,
      ),
  );
  for (const candidate of candidates.slice(0, 3))
    output.card({ kind: "transaction", id: candidate.ids[candidate.ids.length - 1] });
  return output;
}
