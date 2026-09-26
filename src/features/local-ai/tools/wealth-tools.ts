import { identity, references } from "@/data/model/category-record";
import { financialMonth } from "@/data/model/financial-month";
import type { JsonObject } from "@/data/model/json";

import { isoDay, type ChatToolArgs } from "../chat-tool-protocol";
import { balancesAt } from "./account-tools";
import {
  DAY_MS,
  mean,
  money,
  numeric,
  parseDate,
  resolveOne,
  round2,
  text,
  ToolOutput,
  type ToolContext,
} from "./tool-context";

/** Converted account totals at a moment, split into assets and debts. */
function accountNetWorth(context: ToolContext, at: number) {
  const { accounts, balances } = balancesAt(context, at);
  let assets = 0;
  let debts = 0;
  const unconverted = new Map<string, number>();
  const rows: { id: string; name: string; balance: number; currency: string }[] = [];
  for (const account of accounts) {
    const balance = balances.get(account.id) ?? 0;
    rows.push({ id: account.id, name: account.name, balance, currency: account.currencyCode });
    const rate = context.rate(account.currencyCode);
    if (rate === null) {
      unconverted.set(account.currencyCode, (unconverted.get(account.currencyCode) ?? 0) + balance);
      continue;
    }
    if (balance >= 0) assets += balance * rate;
    else debts += -balance * rate;
  }
  return { assets, debts, unconverted, rows };
}

export function goalValues(context: ToolContext, goal: JsonObject) {
  const target = numeric(goal.targetAmount ?? goal.target ?? goal.amount) ?? 0;
  const current = numeric(goal.currentAmount ?? goal.savedAmount ?? goal.current) ?? 0;
  const currency = text(goal.currencyCode, context.currency);
  const date = parseDate(goal.targetDate ?? goal.dueDate ?? goal.deadline);
  return { target, current, currency, date, name: text(goal.name, "Goal") };
}

export function assetValue(asset: JsonObject) {
  return numeric(asset.value ?? asset.amount ?? asset.currentValue) ?? 0;
}

export function netWorth(context: ToolContext, args: ChatToolArgs): ToolOutput {
  const output = new ToolOutput("net_worth", context);
  const range = context.range(args, null);
  const at = range ? Math.min(range.end.getTime(), context.now.getTime()) : context.now.getTime();
  const { assets, debts, unconverted, rows } = accountNetWorth(context, at);
  output.line(
    `[net_worth] as of ${isoDay(new Date(at - (range ? 1 : 0)))}${range ? " (end of requested period; balances rebuilt from transactions)" : " (now)"}, converted to ${context.currency} at latest saved rates`,
    "account | balance",
    ...rows.map((row) => `${row.name} | ${money(row.balance, row.currency)}`),
  );
  if (assets || debts || !unconverted.size) {
    output.fact("netWorth", round2(assets - debts), { currency: context.currency, range });
    output.line(
      `assets ${money(assets, context.currency)}, debts ${money(debts, context.currency)}, net worth ${money(assets - debts, context.currency)}`,
    );
  }
  // Without a saved rate a currency is reported separately, never guessed.
  for (const [currency, total] of unconverted)
    output.line(`net worth in ${currency} (no saved rate to ${context.currency}): ${money(total, currency)}`);
  const otherAssets = context.records("assets").reduce((sum, asset) => sum + assetValue(asset), 0);
  if (otherAssets)
    output.line(
      `separately recorded assets (not in account net worth): ${money(otherAssets, context.currency)} at current stored values`,
    );
  return output;
}

export function netWorthHistory(context: ToolContext, args: ChatToolArgs): ToolOutput {
  const output = new ToolOutput("net_worth_history", context);
  const months = args.months ?? 12;
  const points: string[] = [];
  for (let offset = months - 1; offset >= 0; offset--) {
    const { end } = financialMonth(context.now, context.monthStartDay, -offset);
    const at = Math.min(end.getTime(), context.now.getTime());
    const { assets, debts } = accountNetWorth(context, at);
    points.push(`${isoDay(new Date(at - 1))} ${(assets - debts).toFixed(2)}`);
  }
  output.line(
    `[net_worth_history] account net worth in ${context.currency} at each financial month end (today for the running month):`,
    points.join(", "),
  );
  output.assume("history is rebuilt from current balances and transactions, converted at today's saved rates");
  if (context.records("assets").length || context.records("loans").length)
    output.warn("assets and loans have no value history; they are not part of this series");
  return output;
}

export function goalsTool(context: ToolContext): ToolOutput {
  const output = new ToolOutput("goals", context);
  const goals = context.records("goals");
  output.line("[goals] name | saved / target | progress | target date | remaining");
  for (const goal of goals) {
    const value = goalValues(context, goal);
    output.fact(`remaining.${identity(goal)}`, round2(value.target - value.current), { currency: value.currency, entityType: "goal", entityId: identity(goal) });
    output.line(
      `${value.name} | ${money(value.current, value.currency)} / ${money(value.target, value.currency)} | ${value.target > 0 ? Math.round((value.current / value.target) * 100) : 0}% | ${value.date ? isoDay(value.date) : "-"} | ${money(Math.max(0, value.target - value.current), value.currency)}`,
    );
    output.card({ kind: "goal", id: identity(goal) });
  }
  if (!goals.length) output.line("no goals");
  return output;
}

function monthsUntil(context: ToolContext, date: Date | null) {
  return date ? Math.max(0, (date.getTime() - context.now.getTime()) / (DAY_MS * 30.44)) : null;
}

export function goalDetails(context: ToolContext, args: ChatToolArgs): ToolOutput {
  const output = new ToolOutput("goal_details", context);
  const goal = resolveOne(context, output, "goals", args.id ?? args.query, "goal");
  if (!goal) return output;
  const value = goalValues(context, goal);
  const months = monthsUntil(context, value.date);
  output.line(
    `[goal_details] ${value.name}: saved ${money(value.current, value.currency)} of ${money(value.target, value.currency)} (${value.target > 0 ? Math.round((value.current / value.target) * 100) : 0}%), gap ${money(Math.max(0, value.target - value.current), value.currency)}`,
    value.date
      ? `target date ${isoDay(value.date)}, ${months!.toFixed(1)} months left (${Math.round((value.date.getTime() - context.now.getTime()) / DAY_MS)} days)`
      : "no target date stored",
  );
  output.card({ kind: "goal", id: identity(goal) });
  return output;
}

export function goalFeasibility(context: ToolContext, args: ChatToolArgs): ToolOutput {
  const output = new ToolOutput("goal_feasibility", context);
  const goal = resolveOne(context, output, "goals", args.id ?? args.query, "goal");
  if (!goal) return output;
  const value = goalValues(context, goal);
  const date = parseDate(args.date) ?? value.date;
  const remaining = Math.max(0, value.target - value.current);
  const months = monthsUntil(context, date);
  const history = context.completedMonths(6);
  const freeCash = mean(history.map((month) => month.net));
  const cur = value.currency;
  output.line(`[goal_feasibility] ${value.name}: remaining ${money(remaining, cur)}`);
  if (!months) {
    output.line(date ? "the target date has passed" : "no target date; required monthly amount cannot be computed").missingData("goal target date");
  } else {
    const required = remaining / Math.max(months, 1 / 30);
    output.fact("requiredMonthly", round2(required), { currency: cur, entityType: "goal", entityId: identity(goal) });
    output.line(
      `target ${isoDay(date!)} in ${months.toFixed(1)} months: required ${money(required, cur)}/month`,
      `historical free cash flow (average net of ${history.length} completed months): ${money(freeCash, context.currency)}/month -> required amount is ${freeCash > 0 ? `${Math.round((required / freeCash) * 100)}% of it` : "more than the current free cash flow (which is not positive)"}`,
      `if the date moves: +3 months ${money(remaining / (months + 3), cur)}/month, +6 months ${money(remaining / (months + 6), cur)}/month, +12 months ${money(remaining / (months + 12), cur)}/month`,
    );
  }
  if (cur !== context.currency) output.warn(`goal is in ${cur}; free cash flow is in ${context.currency}`);
  output.card({ kind: "goal", id: identity(goal) });
  return output;
}

function loanValues(context: ToolContext, loan: JsonObject) {
  const amount = numeric(loan.amount ?? loan.principal ?? loan.balance) ?? 0;
  const rate = numeric(loan.interestRate ?? loan.rate);
  const payment = numeric(loan.monthlyPayment ?? loan.installment ?? loan.payment);
  const payments = context.search.facts.filter((fact) => references(loan, fact.entry.record.loan));
  return {
    name: text(loan.name, "Loan"),
    amount,
    rate,
    payment,
    due: parseDate(loan.dueDate),
    currency: text(loan.currencyCode, context.currency),
    person: context.name("people", text(loan.person), ""),
    payments,
  };
}

export function loansTool(context: ToolContext): ToolOutput {
  const output = new ToolOutput("loans", context);
  const loans = context.records("loans");
  output.line("[loans] name | amount | interest | due | person | linked transactions");
  for (const loan of loans) {
    const value = loanValues(context, loan);
    output.fact(`amount.${identity(loan)}`, round2(value.amount), { currency: value.currency, entityType: "loan", entityId: identity(loan), kind: "stored" });
    output.line(
      `${value.name} | ${money(value.amount, value.currency)} | ${value.rate == null ? "-" : `${value.rate}%`} | ${value.due ? isoDay(value.due) : "-"} | ${value.person || "-"} | ${value.payments.length}`,
    );
    output.card({ kind: "loan", id: identity(loan) });
  }
  if (!loans.length) output.line("no loans");
  return output;
}

export function loanDetails(context: ToolContext, args: ChatToolArgs): ToolOutput {
  const output = new ToolOutput("loan_details", context);
  const loan = resolveOne(context, output, "loans", args.id ?? args.query, "loan");
  if (!loan) return output;
  const value = loanValues(context, loan);
  const paid = value.payments.reduce((sum, fact) => sum + (fact.type === "expense" ? fact.reportingAmount : 0), 0);
  const received = value.payments.reduce((sum, fact) => sum + (fact.type === "income" ? fact.reportingAmount : 0), 0);
  output.line(
    `[loan_details] ${value.name}: stored amount ${money(value.amount, value.currency)}, interest ${value.rate == null ? "not recorded" : `${value.rate}%`}, due ${value.due ? isoDay(value.due) : "not recorded"}${value.person ? `, with ${value.person}` : ""}`,
    `linked transactions: ${value.payments.length}; paid out ${money(paid, context.reporting)}, received ${money(received, context.reporting)}`,
    ...value.payments.slice(0, 6).map((fact) => context.line(fact)),
  );
  if (text(loan.notes)) output.line(`notes: ${text(loan.notes).slice(0, 160)}`);
  output.card({ kind: "loan", id: identity(loan) });
  return output;
}

/** Standard amortization; null when the payment never covers interest. */
export function amortize(principal: number, annualRate: number, payment: number) {
  const monthly = annualRate / 100 / 12;
  let balance = principal;
  let interest = 0;
  let months = 0;
  while (balance > 0.005 && months < 1200) {
    const charge = balance * monthly;
    if (payment <= charge) return null;
    interest += charge;
    balance = balance + charge - payment;
    months++;
  }
  return { months, interest };
}

export function debtPayoffScenario(context: ToolContext, args: ChatToolArgs): ToolOutput {
  const output = new ToolOutput("debt_payoff_scenario", context);
  const loan = resolveOne(context, output, "loans", args.id ?? args.query, "loan");
  if (!loan) return output;
  const value = loanValues(context, loan);
  const recent = value.payments.filter(
    (fact) => fact.type === "expense" && fact.entry.timestamp >= context.now.getTime() - 92 * DAY_MS,
  );
  const payment = value.payment ?? (recent.length ? recent.reduce((sum, fact) => sum + fact.reportingAmount, 0) / 3 : null);
  const missing = [
    value.amount > 0 ? "" : "outstanding amount",
    value.rate == null ? "interest rate" : "",
    payment ? "" : "monthly payment (no stored installment or recent linked payments)",
  ].filter(Boolean);
  output.line(`[debt_payoff_scenario] ${value.name} (SCENARIO, nothing is changed)`);
  if (missing.length) {
    output.line(`cannot model repayment; missing: ${missing.join(", ")}`);
    for (const item of missing) output.missingData(item);
    output.card({ kind: "loan", id: identity(loan) });
    return output;
  }
  const extra = Math.max(0, args.extraPayment ?? 0);
  const base = amortize(value.amount, value.rate!, payment!);
  const faster = extra ? amortize(value.amount, value.rate!, payment! + extra) : null;
  output.line(
    `principal ${money(value.amount, value.currency)}, rate ${value.rate}%, payment ${money(payment!, value.currency)}/month${value.payment == null ? " (estimated from the last 3 months of linked payments)" : ""}`,
    base
      ? `current plan: ${base.months} months, total interest ${money(base.interest, value.currency)}`
      : "the current payment does not cover the monthly interest",
  );
  if (extra && faster && base)
    output.line(
      `with +${money(extra, value.currency)}/month: ${faster.months} months (${base.months - faster.months} fewer), total interest ${money(faster.interest, value.currency)} (saves ${money(base.interest - faster.interest, value.currency)})`,
    );
  output.card({ kind: "loan", id: identity(loan) });
  return output;
}

export function assetsTool(context: ToolContext): ToolOutput {
  const output = new ToolOutput("assets", context);
  const assets = context.records("assets");
  output.line("[assets] name | value | category | acquired");
  for (const asset of assets) {
    const value = assetValue(asset);
    output.fact(`value.${identity(asset)}`, round2(value), { entityType: "asset", entityId: identity(asset), kind: "stored" });
    output.line(
      `${text(asset.name, "Asset")} | ${money(value, text(asset.currencyCode, context.currency))} | ${text(asset.category, "-")} | ${text(asset.acquisitionDate, "-").slice(0, 10)}`,
    );
    output.card({ kind: "asset", id: identity(asset) });
  }
  if (!assets.length) output.line("no assets");
  return output;
}

export function wealthAllocation(context: ToolContext): ToolOutput {
  const output = new ToolOutput("wealth_allocation", context);
  const cur = context.currency;
  const liquidity = context.liquidity();
  let assets = 0;
  for (const asset of context.records("assets")) {
    const converted = context.convert(assetValue(asset), text(asset.currencyCode, cur));
    if (converted !== null) assets += converted;
  }
  const loans = context.records("loans").reduce((sum, loan) => sum + Math.abs(numeric(loan.amount) ?? 0), 0);
  const total = Math.max(liquidity.liquid, 0) + liquidity.accessibleSavings + liquidity.restrictedSavings + assets;
  const share = (value: number) => (total > 0 ? `${Math.round((value / total) * 100)}%` : "0%");
  output.fact("grossWealth", round2(total), { currency: cur });
  output.line(
    `[wealth_allocation] in ${cur}, from stored data (description, not investment advice):`,
    `cash and bank ${money(liquidity.liquid, cur)} (${share(Math.max(liquidity.liquid, 0))})`,
    `accessible savings ${money(liquidity.accessibleSavings, cur)} (${share(liquidity.accessibleSavings)})`,
    `locked/retirement savings ${money(liquidity.restrictedSavings, cur)} (${share(liquidity.restrictedSavings)})`,
    `other assets ${money(assets, cur)} (${share(assets)})`,
    `liabilities: card debt ${money(liquidity.cardDebt, cur)}; recorded loans ${money(loans, cur)} (direction not recorded)`,
  );
  return output;
}

export function billSplitStatus(context: ToolContext, args: ChatToolArgs): ToolOutput {
  const output = new ToolOutput("bill_split_status", context);
  const splitters = context
    .records("billSplitters")
    .filter((splitter) => !args.query || text(splitter.name).toLowerCase().includes(args.query.toLowerCase()));
  output.line("[bill_split_status]");
  for (const splitter of splitters.slice(0, 10)) {
    const participants = context.document.billParticipants.filter((participant) =>
      references(splitter, participant.splitterId ?? participant.billSplitter ?? participant.splitter),
    );
    const total = numeric(splitter.totalAmount ?? splitter.amount) ?? 0;
    let paid = 0;
    const rows = participants.map((participant) => {
      const share = numeric(participant.shareAmount ?? participant.share ?? participant.amount) ?? 0;
      const participantPaid = numeric(participant.paidAmount ?? participant.paid) ?? 0;
      paid += participantPaid;
      return `  ${context.name("people", text(participant.personId ?? participant.person), text(participant.name, "participant"))}: share ${share.toFixed(2)}, paid ${participantPaid.toFixed(2)}, remaining ${(share - participantPaid).toFixed(2)}`;
    });
    output.line(
      `${text(splitter.name, "Bill")} ${text(splitter.date).slice(0, 10)}: total ${total.toFixed(2)}, paid ${paid.toFixed(2)}, remaining ${(total - paid).toFixed(2)}`,
      ...rows,
    );
  }
  if (!splitters.length) output.line("no shared bills");
  return output;
}

/** Goals, loans and assets have open-ended imported shapes; keep scalar fields. */
function holdingLine(record: JsonObject) {
  const parts: string[] = [];
  for (const [key, value] of Object.entries(record)) {
    if (/^(uuid|id|user|icon|iconPath|color|image|images|phone|email|_.*)$/i.test(key)) continue;
    if (typeof value === "number" && Number.isFinite(value)) parts.push(`${key} ${value}`);
    else if (typeof value === "string" && value && value.length <= 60) parts.push(`${key} ${value}`);
    else if (typeof value === "boolean") parts.push(`${key} ${value}`);
    if (parts.length >= 10) break;
  }
  return parts.join(", ");
}

export function holdingsTool(context: ToolContext): ToolOutput {
  const output = new ToolOutput("goals_loans_assets", context);
  for (const key of ["goals", "loans", "assets"] as const) {
    const records = context.records(key);
    output.line(`[${key}] ${records.length ? "" : "none"}`);
    output.line(...records.slice(0, 15).map(holdingLine));
    const kind = key === "goals" ? "goal" : key === "loans" ? "loan" : "asset";
    for (const record of records.slice(0, 2)) output.card({ kind, id: identity(record) });
  }
  return output;
}

