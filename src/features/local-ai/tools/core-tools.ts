import { identity } from "@/data/model/category-record";
import { selectProfileReport } from "@/data/selectors/report-selectors";
import { i18n } from "@/localization/i18n";

import { isoDay } from "../chat-tool-protocol";
import {
  accountsTool,
  cashRunway,
  creditPosition,
  liquidityAnalysis,
  obligationsWithin,
} from "./account-tools";
import { budgetForecast, budgetPace, budgetsTool } from "./budget-tools";
import { exchangeRatesTool } from "./currency-tools";
import {
  analysisCoverage,
  coverage,
  dataQualityAudit,
  qualityIssues,
} from "./data-quality-tools";
import { fixedCostAnalysis, recurringTool, upcomingObligations } from "./recurring-tools";
import { savingsFeeAnalysis } from "./savings-tools";
import {
  cashFlow,
  comparePeriods,
  spendingSummary,
} from "./transaction-tools";
import {
  goalValues,
  holdingsTool,
  netWorth,
} from "./wealth-tools";
import {
  mean,
  money,
  numeric,
  parseDate,
  PERIODS_PER_YEAR,
  round2,
  startOfDay,
  ToolOutput,
  type ToolContext,
} from "./tool-context";

function report(context: ToolContext) {
  return context.memo("report", () =>
    selectProfileReport(context.document, context.currency, context.now),
  );
}

/**
 * The global context tool: a dense, prioritized digest of the whole document
 * that fits the remaining prompt budget. Aggregates come first so even a tight
 * budget can answer totals; individual transactions fill what is left.
 */
export function snapshotTool(context: ToolContext, budget: number): ToolOutput {
  const output = new ToolOutput("financial_snapshot", context);
  const cur = context.currency;
  output.line(
    `[financial_snapshot] today ${isoDay(context.now)}, profile currency ${cur}, financial month starts on day ${context.monthStartDay}`,
  );
  const worth = netWorth(context, {});
  output.include(worth, 0);
  output.line(...worth.lines.filter((line) => /^(assets|net worth in|separately) /.test(line)));
  const liquidity = context.liquidity();
  const completed = context.completedMonths(12);
  output.line(
    `liquid cash ${money(liquidity.liquid, cur)}, accessible savings ${money(liquidity.accessibleSavings, cur)}, locked savings ${money(liquidity.restrictedSavings, cur)}, card debt ${money(liquidity.cardDebt, cur)}`,
    `averages (${cur}): 6 months income ${mean(completed.slice(-6).map((m) => m.income)).toFixed(2)} / expenses ${mean(completed.slice(-6).map((m) => m.expense)).toFixed(2)}; 12 months income ${mean(completed.map((m) => m.income)).toFixed(2)} / expenses ${mean(completed.map((m) => m.expense)).toFixed(2)}`,
  );
  const next30 = obligationsWithin(context, 30);
  output.line(
    `next 30 days: bills ${money(next30.expense, cur)}, card payments ${money(next30.cardTotal, cur)}, income ${money(next30.income, cur)}`,
  );
  output.include(accountsTool(context));
  output.include(cashFlow(context, { period: "last_12_months" }));
  output.include(spendingSummary(context, { period: "this_month", limit: 8 }));
  output.include(spendingSummary(context, { period: "last_month", limit: 8 }));
  output.include(budgetsTool(context));
  output.include(recurringTool(context, { days: 30 }), 20);
  output.include(exchangeRatesTool(context));
  output.include(holdingsTool(context));
  const exported = context.document._local.exportedAt;
  output.line(`last backup export: ${typeof exported === "string" ? exported.slice(0, 10) : "never"}`);
  const issues = qualityIssues(context).filter((issue) => issue.severity !== "info");
  if (issues.length) output.line(`data warnings: ${issues.map((issue) => issue.detail).join("; ")}`);
  let used = output.lines.reduce((sum, line) => sum + line.length + 1, 0);
  output.line("[transactions] newest first: date | type | amount | name | category | account | note");
  for (const fact of context.search.facts) {
    const line = context.line(fact);
    if (used + line.length + 1 > budget) {
      output.line("(older transactions omitted; use search_transactions for them)");
      break;
    }
    used += line.length + 1;
    output.line(line);
  }
  return output;
}

/** The report's score, exposed pillar by pillar with the same formula. */
export function healthPillars(context: ToolContext) {
  const value = report(context);
  const budgets = value.budgets;
  const utilization = value.credit.utilization;
  return [
    {
      name: "savings",
      points: (Math.max(0, Math.min(value.savingsRate, 30)) / 30) * 40,
      max: 40,
      raw: `savings rate ${Math.round(value.savingsRate)}% this month`,
      band: value.savingsRate >= 20 ? "strong" : value.savingsRate >= 10 ? "fair" : "weak",
    },
    {
      name: "budgets",
      points: budgets.total ? Math.max(0, 20 - budgets.over * 10 - budgets.atRisk * 3) : 14,
      max: 20,
      raw: budgets.total ? `${budgets.over} over, ${budgets.atRisk} at risk of ${budgets.total}` : "no budgets (neutral 14)",
      band: budgets.over ? "weak" : budgets.atRisk ? "fair" : "strong",
    },
    {
      name: "fixed_costs",
      points:
        value.recurring.share == null ? 14 : Math.max(0, 20 - Math.max(0, value.recurring.share - 30) / 2),
      max: 20,
      raw: value.recurring.share == null ? "no income this month (neutral 14)" : `recurring costs ${Math.round(value.recurring.share)}% of income`,
      band: (value.recurring.share ?? 0) >= 50 ? "weak" : (value.recurring.share ?? 0) >= 30 ? "fair" : "strong",
    },
    {
      name: "balance_sheet",
      points:
        (value.netWorth.netWorth >= 0 ? 12 : 0) +
        (utilization == null ? 8 : utilization <= 30 ? 8 : utilization <= 70 ? 4 : 0),
      max: 20,
      raw: `net worth ${value.netWorth.netWorth >= 0 ? "positive" : "negative"}, credit utilization ${utilization == null ? "n/a" : `${Math.round(utilization)}%`}`,
      band: value.netWorth.netWorth < 0 || (utilization ?? 0) > 70 ? "weak" : (utilization ?? 0) > 30 ? "fair" : "strong",
    },
  ];
}

/**
 * The Reports screen's health model, plus the facts advice needs most:
 * trends, the month-end forecast, emergency-fund cover and fixed costs.
 */
export function healthTool(context: ToolContext): ToolOutput {
  const output = new ToolOutput("financial_health", context);
  const cur = context.currency;
  const value = report(context);
  // Findings reuse the Reports copy in English; the model answers in the
  // user's language.
  const t = i18n.getFixedT("en", "translation") as unknown as (
    key: string,
    values?: Record<string, string>,
  ) => string;
  output.line(
    `[financial_health] ${cur}; this financial month ${isoDay(value.period.start)}..${isoDay(new Date(value.period.end.getTime() - 1))}, ${Math.round(value.progress * 100)}% elapsed`,
  );
  if (!value.hasData) {
    output.line("not enough records for a health reading yet").missingData("transaction history");
    return output;
  }
  output.fact("score", value.health.score);
  output.line(`health score ${value.health.score}/100 (${value.health.band})`);
  for (const pillar of healthPillars(context))
    output.line(
      `- pillar ${pillar.name}: ${round2(pillar.points)}/${pillar.max} points, ${pillar.raw}, ${pillar.band}`,
    );
  if (value.current.expense > value.current.income)
    output.line("- spending exceeds income this month, so the score is capped at 35");
  output.line(
    `this month: income ${money(value.current.income, cur)}, expenses ${money(value.current.expense, cur)}, savings rate ${Math.round(value.savingsRate)}%${value.savingsRateChange == null ? "" : ` (${value.savingsRateChange >= 0 ? "+" : ""}${Math.round(value.savingsRateChange)} points vs last month)`}`,
    `forecast month-end expenses ${money(value.projectedExpense, cur)}${value.expenseChange == null ? "" : `; expenses vs last month ${value.expenseChange >= 0 ? "+" : ""}${Math.round(value.expenseChange)}%`}`,
  );
  const history = value.months.filter((month) => month.income || month.expense);
  if (history.length) {
    const averageExpense = history.reduce((sum, month) => sum + month.expense, 0) / history.length;
    const averageIncome = history.reduce((sum, month) => sum + month.income, 0) / history.length;
    output.line(
      `${history.length}-month averages: income ${money(averageIncome, cur)}, expenses ${money(averageExpense, cur)}, net ${money(averageIncome - averageExpense, cur)}`,
      `months with a deficit: ${history.filter((month) => month.net < 0).length} of ${history.length}`,
    );
    const liquidity = context.liquidity();
    if (averageExpense > 0 && !liquidity.unconverted.length)
      output.line(
        `emergency fund: ${money(liquidity.liquid + liquidity.accessibleSavings, cur)} in cash-like accounts covers ${((liquidity.liquid + liquidity.accessibleSavings) / averageExpense).toFixed(1)} months of average expenses`,
      );
    else if (liquidity.unconverted.length)
      output.line(`emergency fund: unknown, no saved ${liquidity.unconverted.join("/")} to ${cur} rate`);
  }
  output.line(
    `net worth ${money(value.netWorth.netWorth, cur)} (assets ${money(value.netWorth.assets, cur)}, debts ${money(value.netWorth.liabilities, cur)})`,
  );
  if (value.credit.utilization != null)
    output.line(
      `credit cards: ${money(value.credit.used, cur)} used of ${money(value.credit.limit, cur)} limit (${Math.round(value.credit.utilization)}% utilization)`,
    );
  output.line(
    `recurring expenses ${money(value.recurring.monthly, cur)}/month${value.recurring.share == null ? "" : ` = ${Math.round(value.recurring.share)}% of income`}`,
    `budgets: ${value.budgets.total} total, ${value.budgets.over} over, ${value.budgets.atRisk} at risk, ${value.budgets.onTrack} on track`,
    "top categories this month (share, change vs last month):",
    ...value.categories.map(
      (category) =>
        `- ${category.label}: ${money(category.amount, cur)} (${category.share}%${category.changePercent == null ? "" : `, ${category.changePercent >= 0 ? "+" : ""}${Math.round(category.changePercent)}%`})`,
    ),
    "findings (severity: finding - suggested action):",
    ...value.insights.map((insight) => {
      const values = Object.fromEntries(
        Object.entries(insight.values ?? {}).map(([key, item]) => [
          key,
          typeof item === "number" && /^(gap|amount|projected)$/.test(key) ? money(item, cur) : String(item),
        ]),
      );
      return `- ${insight.severity}: ${t(`reports.insights.${insight.id}.title`, values)} - ${t(`reports.insights.${insight.id}.recommendation`, values)}`;
    }),
  );
  return output;
}

export const PRIORITY_CODES = [
  "short_term_shortfall",
  "card_payment_shortfall",
  "persistent_deficit",
  "month_deficit",
  "over_budget",
  "budget_pace",
  "high_credit_use",
  "low_emergency_fund",
  "low_savings_rate",
  "fixed_cost_burden",
  "subscriptions",
  "category_increase",
  "spending_concentration",
  "loan_due",
  "goal_shortfall",
  "savings_fees",
  "data_quality",
] as const;
export type PriorityCode = (typeof PRIORITY_CODES)[number];

export interface FinancialPriority {
  id: string;
  titleCode: PriorityCode;
  severity: "info" | "opportunity" | "warning" | "critical";
  impactAmount?: number;
  impactCurrency?: string;
  impactPeriod?: "month" | "year" | "one_time";
  confidence: "high" | "medium" | "low";
  evidenceRefs: string[];
  reasonCode: string;
  suggestedActionCode: string;
  /** Deterministic explanation with the measured numbers. */
  detail: string;
  /** 0 (now) … 1 (months away). */
  immediacy: number;
  entity?: { kind: "budget" | "account" | "recurring" | "goal" | "loan" | "category"; id: string };
  score: number;
}

const SEVERITY_WEIGHT = { critical: 4000, warning: 3000, opportunity: 2000, info: 1000 };
const CONFIDENCE_WEIGHT = { high: 100, medium: 50, low: 0 };

/**
 * Computes every candidate problem/opportunity from measured data and ranks
 * them by severity, quantified impact, immediacy and confidence. The model
 * explains the ranking; it never produces it.
 */
export function selectFinancialPriorities(context: ToolContext): FinancialPriority[] {
  return context.memo("priorities", () => {
    const cur = context.currency;
    const list: Omit<FinancialPriority, "score">[] = [];
    const push = (priority: Omit<FinancialPriority, "score" | "id" | "impactCurrency"> & { key?: string }) => {
      const { key, ...rest } = priority;
      list.push({ ...rest, id: `${priority.titleCode}${key ? `:${key}` : ""}`, impactCurrency: cur });
    };
    const completed = context.completedMonths(6);
    const coverageInfo = coverage(context);
    const averageIncome = mean(completed.map((month) => month.income));
    const averageExpense = mean(completed.map((month) => month.expense));
    const confidence = coverageInfo.completedMonths >= 3 ? "high" : coverageInfo.completedMonths >= 1 ? "medium" : "low";
    const liquidity = context.liquidity();
    const value = report(context);

    const next30 = obligationsWithin(context, 30);
    const free = liquidity.liquid - next30.expense - next30.cardTotal + next30.income;
    if (free < 0)
      push({
        titleCode: "short_term_shortfall",
        severity: "critical",
        impactAmount: round2(-free),
        impactPeriod: "one_time",
        confidence: "medium",
        evidenceRefs: ["liquidity_analysis.freeCash"],
        reasonCode: "OBLIGATIONS_EXCEED_LIQUID_CASH_30D",
        suggestedActionCode: "MOVE_FUNDS_OR_DEFER_PAYMENTS",
        detail: `liquid cash ${money(liquidity.liquid, cur)} does not cover the next 30 days of bills and card payments (${money(next30.expense + next30.cardTotal, cur)}) plus income ${money(next30.income, cur)}; short ${money(-free, cur)}`,
        immediacy: 0,
      });

    for (const card of context.accountsView()) {
      if (card.kind !== "credit" || !card.billingCycle || card.balance >= 0) continue;
      const bank = context.accountsView().find((account) => account.id === card.linkedBankAccountId);
      if (!bank) continue;
      const needed = context.convert(-card.balance, card.currencyCode, bank.currencyCode);
      const days = (card.billingCycle.nextPaymentDate.getTime() - context.now.getTime()) / 86_400_000;
      if (needed === null || bank.balance >= needed || days > 35) continue;
      push({
        key: card.id,
        titleCode: "card_payment_shortfall",
        severity: "critical",
        impactAmount: round2(context.convert(needed - bank.balance, bank.currencyCode) ?? needed - bank.balance),
        impactPeriod: "one_time",
        confidence: "high",
        evidenceRefs: [`credit_position.debt.${card.id}`],
        reasonCode: "LINKED_BANK_BELOW_CARD_DEBT",
        suggestedActionCode: "TOP_UP_LINKED_BANK",
        detail: `${card.name} payment of ${money(-card.balance, card.currencyCode)} on ${isoDay(card.billingCycle.nextPaymentDate)} exceeds ${bank.name} balance ${money(bank.balance, bank.currencyCode)}`,
        immediacy: Math.max(0, days) / 35,
        entity: { kind: "account", id: card.id },
      });
    }

    const recent = completed.slice(-3);
    const deficits = recent.filter((month) => month.net < 0);
    if (recent.length >= 2 && deficits.length >= 2)
      push({
        titleCode: "persistent_deficit",
        severity: "critical",
        impactAmount: round2(-mean(deficits.map((month) => month.net))),
        impactPeriod: "month",
        confidence,
        evidenceRefs: ["cash_flow.net"],
        reasonCode: "NEGATIVE_NET_MULTIPLE_MONTHS",
        suggestedActionCode: "CUT_LARGEST_DISCRETIONARY_CATEGORIES",
        detail: `spending exceeded income in ${deficits.length} of the last ${recent.length} completed months, by ${money(-mean(deficits.map((month) => month.net)), cur)} on average`,
        immediacy: 0.2,
      });
    else if (value.hasData && value.projectedExpense > value.current.income && value.current.income > 0)
      push({
        titleCode: "month_deficit",
        severity: "warning",
        impactAmount: round2(value.projectedExpense - value.current.income),
        impactPeriod: "month",
        confidence: "medium",
        evidenceRefs: ["financial_health.score"],
        reasonCode: "PROJECTED_EXPENSE_ABOVE_INCOME",
        suggestedActionCode: "SLOW_SPENDING_THIS_MONTH",
        detail: `at the current pace this month's expenses reach ${money(value.projectedExpense, cur)} vs income ${money(value.current.income, cur)}`,
        immediacy: 0.1,
      });

    for (const budget of context.budgetsView()) {
      const pace = budgetPace(budget, context.now);
      if (pace.status === "over_budget")
        push({
          key: budget.id,
          titleCode: "over_budget",
          severity: "critical",
          impactAmount: round2(context.convert(budget.tracked - budget.limit, budget.currencyCode) ?? budget.tracked - budget.limit),
          impactPeriod: "month",
          confidence: "high",
          evidenceRefs: [`budgets.remaining.${budget.id}`],
          reasonCode: "BUDGET_EXCEEDED",
          suggestedActionCode: "PAUSE_CATEGORY_OR_RAISE_LIMIT",
          detail: `${budget.name}: spent ${money(budget.tracked, budget.currencyCode)} of ${money(budget.limit, budget.currencyCode)}`,
          immediacy: 0.1,
          entity: { kind: "budget", id: budget.id },
        });
      else if (pace.status === "at_risk")
        push({
          key: budget.id,
          titleCode: "budget_pace",
          severity: "warning",
          impactAmount: round2(context.convert(pace.projected - budget.limit, budget.currencyCode) ?? pace.projected - budget.limit),
          impactPeriod: "month",
          confidence: pace.elapsed > 0.25 ? "high" : "low",
          evidenceRefs: [`budget_forecast.projected.${budget.id}`],
          reasonCode: "BUDGET_PACE_ABOVE_LIMIT",
          suggestedActionCode: "REDUCE_DAILY_SPEND_IN_BUDGET",
          detail: `${budget.name}: projected ${money(pace.projected, budget.currencyCode)} vs limit ${money(budget.limit, budget.currencyCode)}${pace.exhaustion ? `, runs out around ${isoDay(pace.exhaustion)}` : ""}`,
          immediacy: 0.3,
          entity: { kind: "budget", id: budget.id },
        });
    }

    const utilization = value.credit.utilization;
    if (utilization != null && utilization > 30)
      push({
        titleCode: "high_credit_use",
        severity: utilization > 70 ? "critical" : "warning",
        impactAmount: round2(value.credit.used - value.credit.limit * 0.3),
        impactPeriod: "one_time",
        confidence: "high",
        evidenceRefs: ["credit_position.totalDebt"],
        reasonCode: "CREDIT_UTILIZATION_ABOVE_30",
        suggestedActionCode: "PAY_DOWN_CARD_DEBT",
        detail: `card debt ${money(value.credit.used, cur)} is ${Math.round(utilization)}% of limits ${money(value.credit.limit, cur)}`,
        immediacy: 0.4,
      });

    if (averageExpense > 0) {
      const cash = liquidity.liquid + liquidity.accessibleSavings;
      const months = cash / averageExpense;
      if (months < 3)
        push({
          titleCode: "low_emergency_fund",
          severity: months < 1 ? "critical" : "warning",
          impactAmount: round2(averageExpense * 3 - cash),
          impactPeriod: "one_time",
          confidence,
          evidenceRefs: ["liquidity_analysis.liquid"],
          reasonCode: "LIQUID_BELOW_3_MONTHS_EXPENSES",
          suggestedActionCode: "BUILD_EMERGENCY_FUND",
          detail: `cash-like balances ${money(cash, cur)} cover ${months.toFixed(1)} months of average expenses ${money(averageExpense, cur)}`,
          immediacy: 0.5,
        });
    }

    if (averageIncome > 0) {
      const rate = ((averageIncome - averageExpense) / averageIncome) * 100;
      if (rate >= 0 && rate < 10)
        push({
          titleCode: "low_savings_rate",
          severity: "warning",
          impactAmount: round2(averageIncome * 0.1 - (averageIncome - averageExpense)),
          impactPeriod: "month",
          confidence,
          evidenceRefs: ["income_analysis.monthlyAverage"],
          reasonCode: "SAVINGS_RATE_BELOW_10",
          suggestedActionCode: "AUTOMATE_MONTHLY_SAVING",
          detail: `average savings rate ${rate.toFixed(1)}% over ${completed.length} completed months`,
          immediacy: 0.6,
        });
      const fixed = context.recurringMonthly().expense;
      const share = (fixed / averageIncome) * 100;
      if (share >= 40)
        push({
          titleCode: "fixed_cost_burden",
          severity: share >= 50 ? "warning" : "opportunity",
          impactAmount: round2(fixed - averageIncome * 0.4),
          impactPeriod: "month",
          confidence,
          evidenceRefs: ["fixed_cost_analysis.monthly"],
          reasonCode: "FIXED_COSTS_ABOVE_40_PERCENT",
          suggestedActionCode: "RENEGOTIATE_FIXED_COSTS",
          detail: `recurring costs ${money(fixed, cur)}/month are ${Math.round(share)}% of average income`,
          immediacy: 0.6,
        });
      const subscriptions = context
        .activeRecurrings()
        .filter((item) => item.type === 0)
        .map((item) => ({
          item,
          monthly: context.convert((item.amount * (PERIODS_PER_YEAR[item.period] ?? 0)) / 12, item.currencyCode) ?? 0,
        }))
        .sort((a, b) => b.monthly - a.monthly);
      const subscriptionTotal = subscriptions.reduce((sum, row) => sum + row.monthly, 0);
      if (subscriptions.length >= 3 && subscriptionTotal / averageIncome >= 0.1)
        push({
          titleCode: "subscriptions",
          severity: "opportunity",
          impactAmount: round2(subscriptions[0].monthly),
          impactPeriod: "month",
          confidence: "high",
          evidenceRefs: ["subscription_analysis.monthlyTotal"],
          reasonCode: "SUBSCRIPTIONS_ABOVE_10_PERCENT",
          suggestedActionCode: "REVIEW_LARGEST_SUBSCRIPTION",
          detail: `${subscriptions.length} recurring expenses total ${money(subscriptionTotal, cur)}/month; largest ${subscriptions[0].item.name} ${money(subscriptions[0].monthly, cur)}`,
          immediacy: 0.7,
          entity: { kind: "recurring", id: subscriptions[0].item.id },
        });
    }

    // Category growth: last completed month vs the average of the 3 before it.
    if (completed.length >= 3) {
      const last = completed[completed.length - 1];
      const before = completed.slice(-4, -1);
      const byCategory = (month: { start: Date; end: Date }) => {
        const map = new Map<string, number>();
        for (const fact of context.facts(month))
          if (context.counted(fact) && fact.type === "expense" && fact.reportingCurrency === context.reporting)
            map.set(fact.category, (map.get(fact.category) ?? 0) + fact.reportingAmount);
        return map;
      };
      const latest = byCategory(last);
      const baseline = new Map<string, number>();
      for (const month of before)
        for (const [id, amount] of byCategory(month))
          baseline.set(id, (baseline.get(id) ?? 0) + amount / before.length);
      const growth = [...latest]
        .map(([id, amount]) => ({ id, amount, base: baseline.get(id) ?? 0 }))
        .filter((row) => row.base > 0 && row.amount >= row.base * 1.3 && row.amount - row.base >= averageIncome * 0.02)
        .sort((a, b) => b.amount - b.base - (a.amount - a.base));
      for (const row of growth.slice(0, 2))
        push({
          key: row.id,
          titleCode: "category_increase",
          severity: "opportunity",
          impactAmount: round2(row.amount - row.base),
          impactPeriod: "month",
          confidence,
          evidenceRefs: ["compare_periods.totalA"],
          reasonCode: "CATEGORY_ABOVE_3_MONTH_BASELINE",
          suggestedActionCode: "RETURN_CATEGORY_TO_BASELINE",
          detail: `${context.name("categories", row.id, "Uncategorized")}: ${money(row.amount, cur)} in ${last.key} vs ${money(row.base, cur)} 3-month average (+${Math.round(((row.amount - row.base) / row.base) * 100)}%)`,
          immediacy: 0.5,
          entity: row.id ? { kind: "category", id: row.id } : undefined,
        });
    }

    const top = value.categories[0];
    if (value.categories.length >= 3 && top && top.share >= 35)
      push({
        titleCode: "spending_concentration",
        severity: "info",
        impactAmount: round2(top.amount),
        impactPeriod: "month",
        confidence: "medium",
        evidenceRefs: ["spending_summary.total"],
        reasonCode: "TOP_CATEGORY_ABOVE_35_PERCENT",
        suggestedActionCode: "CHECK_TOP_CATEGORY",
        detail: `${top.label} is ${top.share}% of this month's spending (${money(top.amount, cur)})`,
        immediacy: 0.8,
      });

    const today = startOfDay(context.now).getTime();
    for (const loan of context.records("loans")) {
      const due = parseDate(loan.dueDate);
      if (!due || due.getTime() < today - 60 * 86_400_000 || due.getTime() > today + 30 * 86_400_000) continue;
      push({
        key: identity(loan),
        titleCode: "loan_due",
        severity: due.getTime() < today ? "critical" : "warning",
        impactAmount: round2(Math.abs(numeric(loan.amount) ?? 0)),
        impactPeriod: "one_time",
        confidence: "high",
        evidenceRefs: [`loans.amount.${identity(loan)}`],
        reasonCode: due.getTime() < today ? "LOAN_OVERDUE" : "LOAN_DUE_SOON",
        suggestedActionCode: "PLAN_LOAN_PAYMENT",
        detail: `${String(loan.name ?? "Loan")} ${due.getTime() < today ? "was due" : "is due"} on ${isoDay(due)}`,
        immediacy: due.getTime() < today ? 0 : 0.2,
        entity: { kind: "loan", id: identity(loan) },
      });
    }

    const net = averageIncome - averageExpense;
    for (const goal of context.records("goals")) {
      const goalValue = goalValues(context, goal);
      if (!goalValue.date || goalValue.target <= goalValue.current || goalValue.date.getTime() <= context.now.getTime()) continue;
      const months = (goalValue.date.getTime() - context.now.getTime()) / (30.44 * 86_400_000);
      const required = context.convert((goalValue.target - goalValue.current) / Math.max(months, 1), goalValue.currency) ?? 0;
      if (required <= Math.max(net, 0)) continue;
      push({
        key: identity(goal),
        titleCode: "goal_shortfall",
        severity: "warning",
        impactAmount: round2(required - Math.max(net, 0)),
        impactPeriod: "month",
        confidence,
        evidenceRefs: [`goals.remaining.${identity(goal)}`],
        reasonCode: "GOAL_NEEDS_MORE_THAN_FREE_CASH",
        suggestedActionCode: "MOVE_GOAL_DATE_OR_RAISE_SAVING",
        detail: `${goalValue.name} needs ${money(required, cur)}/month until ${isoDay(goalValue.date)}, average free cash flow is ${money(net, cur)}`,
        immediacy: 0.7,
        entity: { kind: "goal", id: identity(goal) },
      });
    }

    const fees = savingsFeeAnalysis(context, {});
    const feeTotal = Number(fees.facts.find((fact) => fact.ref.factId.endsWith("yearlyTotal"))?.value ?? 0);
    const savingsBalance = liquidity.accessibleSavings + liquidity.restrictedSavings;
    if (feeTotal > 0 && savingsBalance > 0 && feeTotal / savingsBalance >= 0.01)
      push({
        titleCode: "savings_fees",
        severity: "opportunity",
        impactAmount: round2(feeTotal),
        impactPeriod: "year",
        confidence: "medium",
        evidenceRefs: ["savings_fee_analysis.yearlyTotal"],
        reasonCode: "SAVINGS_FEES_ABOVE_1_PERCENT",
        suggestedActionCode: "COMPARE_PRODUCT_FEES",
        detail: `stored fee rates cost about ${money(feeTotal, cur)}/year (${((feeTotal / savingsBalance) * 100).toFixed(1)}% of savings)`,
        immediacy: 0.9,
      });

    const quality = qualityIssues(context).filter((issue) => issue.severity !== "info" || issue.code === "UNCATEGORIZED");
    if (quality.length)
      push({
        titleCode: "data_quality",
        severity: "info",
        confidence: "high",
        evidenceRefs: ["data_quality_audit.issueCount"],
        reasonCode: quality[0].code,
        suggestedActionCode: "FIX_DATA_ISSUES",
        detail: quality.map((issue) => issue.detail).join("; "),
        immediacy: 1,
      });

    const scale = Math.max(averageIncome, averageExpense, 1);
    return list
      .map((priority) => {
        const monthlyImpact =
          priority.impactAmount == null
            ? 0
            : priority.impactPeriod === "year"
              ? priority.impactAmount / 12
              : priority.impactAmount;
        const score =
          SEVERITY_WEIGHT[priority.severity] +
          Math.min(500, (Math.max(0, monthlyImpact) / scale) * 500) +
          (1 - priority.immediacy) * 300 +
          CONFIDENCE_WEIGHT[priority.confidence];
        return { ...priority, score: Math.round(score) };
      })
      .sort((a, b) => b.score - a.score || a.id.localeCompare(b.id));
  });
}

/** Plain wording for the model; codes stay internal so they never reach answers. */
const PRIORITY_TITLES: Record<PriorityCode, string> = {
  short_term_shortfall: "cash shortfall in the next 30 days",
  card_payment_shortfall: "card payment larger than the linked bank balance",
  persistent_deficit: "spending more than income",
  month_deficit: "this month heading for a deficit",
  over_budget: "budget exceeded",
  budget_pace: "budget on pace to overspend",
  high_credit_use: "high credit card use",
  low_emergency_fund: "small emergency cushion",
  low_savings_rate: "low savings rate",
  fixed_cost_burden: "high fixed costs",
  subscriptions: "subscriptions adding up",
  category_increase: "category spending jumped",
  spending_concentration: "spending concentrated in one category",
  loan_due: "loan payment due",
  goal_shortfall: "goal needs more saving",
  savings_fees: "savings product fees",
  data_quality: "records that need attention",
};

const ACTION_TEXT: Record<string, string> = {
  MOVE_FUNDS_OR_DEFER_PAYMENTS: "move money into the paying account or postpone non-essential payments",
  TOP_UP_LINKED_BANK: "move money into the linked bank account before the payment day",
  CUT_LARGEST_DISCRETIONARY_CATEGORIES: "cut the largest non-essential categories",
  SLOW_SPENDING_THIS_MONTH: "slow down spending for the rest of the month",
  PAUSE_CATEGORY_OR_RAISE_LIMIT: "pause spending in this budget or set a realistic limit",
  REDUCE_DAILY_SPEND_IN_BUDGET: "reduce daily spending in this budget",
  PAY_DOWN_CARD_DEBT: "pay down card debt",
  BUILD_EMERGENCY_FUND: "build an emergency fund of about 3 months of expenses",
  AUTOMATE_MONTHLY_SAVING: "set aside a fixed amount each month",
  RENEGOTIATE_FIXED_COSTS: "review and renegotiate fixed bills",
  REVIEW_LARGEST_SUBSCRIPTION: "review the most expensive subscription",
  RETURN_CATEGORY_TO_BASELINE: "bring this category back to its usual level",
  CHECK_TOP_CATEGORY: "check whether the top category is expected",
  PLAN_LOAN_PAYMENT: "plan the loan payment",
  MOVE_GOAL_DATE_OR_RAISE_SAVING: "save more each month or move the goal date",
  COMPARE_PRODUCT_FEES: "compare the product's fees with alternatives",
  FIX_DATA_ISSUES: "fix the flagged records so answers are accurate",
};

export function prioritiesTool(context: ToolContext): ToolOutput {
  const output = new ToolOutput("financial_priorities", context);
  const priorities = selectFinancialPriorities(context);
  output.line(
    `[financial_priorities] ${priorities.length} items ranked by severity, measured impact, urgency and confidence (${context.currency}):`,
  );
  priorities.slice(0, 8).forEach((priority, index) => {
    output.fact(`impact.${priority.id}`, priority.impactAmount ?? null, {
      currency: priority.impactCurrency,
      kind: priority.impactPeriod === "one_time" ? "calculated" : "calculated",
    });
    output.line(
      `${index + 1}. ${PRIORITY_TITLES[priority.titleCode]} (${priority.severity === "critical" ? "urgent" : priority.severity}): ${priority.detail}${priority.impactAmount != null ? `; impact ${money(priority.impactAmount, context.currency)}${priority.impactPeriod === "month" ? "/month" : priority.impactPeriod === "year" ? "/year" : ""}` : ""}; suggested action: ${ACTION_TEXT[priority.suggestedActionCode] ?? priority.suggestedActionCode.toLowerCase().replace(/_/g, " ")}`,
    );
    output.card({ kind: "financial_priority", id: priority.id });
  });
  if (!priorities.length) output.line("no problems found in the recorded data");
  return output;
}

/**
 * Broad questions never rely on one randomly chosen tool: this bundle always
 * collects a bounded, multi-area evidence set, most decisive facts first.
 */
export function adviceContextTool(context: ToolContext): ToolOutput {
  const output = new ToolOutput("financial_advice_context", context);
  output.line(
    "[financial_advice_context] answer in this order: 1 short-term cash/debt risks, 2 budgets/pace, 3 savings rate and emergency cash, 4 fixed costs, 5 biggest avoidable increases, 6 goals/debts, 7 long-term wealth, 8 data limits.",
  );
  output.include(prioritiesTool(context));
  output.include(analysisCoverage(context));
  output.include(healthTool(context), 14);
  output.include(cashFlow(context, { period: "last_6_months" }));
  output.include(comparePeriods(context, { period: "this_month", periodB: "last_month" }), 8);
  output.include(budgetForecast(context, {}), 8);
  output.include(liquidityAnalysis(context, { days: 30 }), 3);
  const sixty = obligationsWithin(context, 60);
  output.line(
    `next 60 days totals: bills ${money(sixty.expense, context.currency)}, card payments ${money(sixty.cardTotal, context.currency)}, income ${money(sixty.income, context.currency)}`,
  );
  output.include(cashRunway(context), 6);
  output.include(creditPosition(context), 6);
  output.include(fixedCostAnalysis(context), 6);
  output.include(upcomingObligations(context, { days: 30 }), 10);
  output.include(netWorth(context, {}), 0);
  output.line(...netWorth(context, {}).lines.filter((line) => /^assets /.test(line)));
  output.include(holdingsTool(context), 12);
  output.include(dataQualityAudit(context), 6);
  return output;
}
