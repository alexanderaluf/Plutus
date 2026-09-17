import { financialMonth } from "../model/financial-month";
import type { BackupDocument } from "../model/backup-document";
import {
  selectAccounts,
  selectAccountTotals,
  selectCategorySpendingBetween,
  selectMonthlyLedger,
  selectParentCategorySpendingBetween,
  selectPeriodTransactions,
} from "./document-selectors";
import { selectBudgets } from "./budget-selectors";
import { selectRecurrings, selectRecurringSummary } from "./recurring-selectors";

export type ReportSeverity = "critical" | "warning" | "good";

export const REPORT_INSIGHT_IDS = [
  "needsData",
  "overspending",
  "budgetsOver",
  "creditHigh",
  "lowSavings",
  "concentration",
  "categorySpike",
  "recurringHeavy",
  "creditModerate",
  "pace",
  "negativeNetWorth",
  "budgetsAtRisk",
  "strongSavings",
  "budgetsOnTrack",
  "expensesDown",
  "maintain",
] as const;
export type ReportInsightId = (typeof REPORT_INSIGHT_IDS)[number];

/**
 * An insight is data, not copy: the screen renders `reports.insights.<id>` with
 * these values so every finding stays translatable.
 */
export type ReportInsight = {
  id: ReportInsightId;
  severity: ReportSeverity;
  values?: Record<string, string | number>;
};

export type ReportMonth = {
  key: string;
  start: Date;
  income: number;
  expense: number;
  net: number;
};

export type ReportCategory = {
  id: string;
  label: string;
  amount: number;
  share: number;
  color: string;
  changePercent: number | null;
  /** Child categories folded into this row; only set for the donut rollup. */
  childCount?: number;
};

const MONTHS_OF_HISTORY = 6;
const DONUT_SLICES = 6;
const OTHER_SLICE_COLOR = "#9aa4b2";
const HEALTH_BANDS = { strong: 75, steady: 50 };

function changePercent(current: number, previous: number) {
  if (previous <= 0) return null;
  return ((current - previous) / previous) * 100;
}

function savingsRateOf(income: number, expense: number) {
  if (income <= 0) return 0;
  return ((income - expense) / income) * 100;
}

/**
 * A single pass over the profile's records that produces every number the
 * reports screen shows, plus a rules-based reading of the profile's health.
 */
export function selectProfileReport(
  document: BackupDocument,
  currencyCode: string,
  now = new Date(),
) {
  const monthStartDay = document._local.monthStartDay;
  const months: ReportMonth[] = [];
  for (let offset = MONTHS_OF_HISTORY - 1; offset >= 0; offset--) {
    const { start, end } = financialMonth(now, monthStartDay, -offset);
    const ledger = selectMonthlyLedger(document, start, end, now);
    months.push({
      key: start.toISOString().slice(0, 10),
      start,
      income: ledger.income,
      expense: ledger.expense,
      net: ledger.income - ledger.expense,
    });
  }

  const current = months[months.length - 1];
  const previous = months[months.length - 2];
  const period = financialMonth(now, monthStartDay);
  const savingsRate = savingsRateOf(current.income, current.expense);
  const previousSavingsRate = previous
    ? savingsRateOf(previous.income, previous.expense)
    : 0;

  // Month-end projection from the pace set so far in the period.
  const elapsedMs = Math.max(now.getTime() - period.start.getTime(), 1);
  const totalMs = Math.max(period.end.getTime() - period.start.getTime(), 1);
  const progress = Math.min(elapsedMs / totalMs, 1);
  const projectedExpense = current.expense / progress;

  const categoryTotals = selectCategorySpendingBetween(
    document,
    period.start,
    period.end,
    now,
  );
  const previousPeriod = financialMonth(now, monthStartDay, -1);
  const previousCategoryTotals = previous
    ? selectCategorySpendingBetween(
        document,
        previousPeriod.start,
        previousPeriod.end,
        previousPeriod.end,
      )
    : [];
  const categories: ReportCategory[] = categoryTotals.slice(0, 6).map((category) => {
    const before = previousCategoryTotals.find(
      (item) => item.id === category.id,
    );
    return {
      id: category.id,
      label: category.label,
      amount: category.amount,
      share: category.percentage,
      color: category.color,
      changePercent: before ? changePercent(category.amount, before.amount) : null,
    };
  });

  // The donut groups every expense under its top-most category. A long tail
  // would turn into unreadable slivers, so anything past the top slices is
  // merged into one remainder that keeps the ring equal to total spending.
  const parentTotals = selectParentCategorySpendingBetween(
    document,
    period.start,
    period.end,
    now,
  );
  const leading = parentTotals.slice(0, DONUT_SLICES);
  const rest = parentTotals.slice(DONUT_SLICES);
  const parentCategories: ReportCategory[] = leading.map((category) => ({
    id: category.id,
    label: category.label,
    amount: category.amount,
    share: category.percentage,
    color: category.color,
    changePercent: null,
    childCount: category.childCount,
  }));
  if (rest.length) {
    parentCategories.push({
      id: "__other__",
      label: "",
      amount: rest.reduce((sum, category) => sum + category.amount, 0),
      share: rest.reduce((sum, category) => sum + category.percentage, 0),
      color: OTHER_SLICE_COLOR,
      changePercent: null,
      childCount: rest.length,
    });
  }

  // Raw activity facts for the stats grid: counts and extremes rather than prose.
  const periodTransactions = selectPeriodTransactions(
    document,
    period.start,
    period.end,
    now,
  );
  const expenseEntries = periodTransactions.filter((entry) => !entry.isIncome);
  const largestExpense = expenseEntries.reduce<(typeof expenseEntries)[number] | null>(
    (largest, entry) => (!largest || entry.amount > largest.amount ? entry : largest),
    null,
  );
  const activity = {
    transactions: periodTransactions.length,
    expenseCount: expenseEntries.length,
    averageExpense: expenseEntries.length
      ? current.expense / expenseEntries.length
      : 0,
    largestExpense,
    activeDays: new Set(expenseEntries.map((entry) => entry.day)).size,
  };

  const accounts = selectAccounts(document, now);
  const totals = selectAccountTotals(accounts);
  const creditAccounts = accounts.filter(
    (account) => account.kind === "credit" && !account.isExcluded,
  );
  const creditLimit = creditAccounts.reduce(
    (sum, account) => sum + (account.creditLimit ?? 0),
    0,
  );
  const creditUsed = creditAccounts.reduce(
    (sum, account) => sum + Math.abs(Math.min(account.balance, 0)),
    0,
  );
  const utilization = creditLimit > 0 ? (creditUsed / creditLimit) * 100 : null;

  const budgets = selectBudgets(document, now).filter(
    (budget) => budget.limit > 0,
  );
  const overBudgets = budgets.filter((budget) => budget.percent > 100);
  const atRiskBudgets = budgets.filter(
    (budget) => budget.percent > 80 && budget.percent <= 100,
  );

  const recurringSummary = selectRecurringSummary(
    selectRecurrings(document, now),
    now,
  );
  const recurringMonthly =
    recurringSummary.expense.find((item) => item.currencyCode === currencyCode)
      ?.amount ??
    recurringSummary.expense[0]?.amount ??
    0;
  const recurringShare =
    current.income > 0 ? (recurringMonthly / current.income) * 100 : null;

  const hasData = months.some((month) => month.income > 0 || month.expense > 0);

  // Health score: savings behaviour weighs most, then budget discipline,
  // fixed-cost load, and balance-sheet health.
  const savingsPoints = Math.max(0, Math.min(savingsRate, 30)) / 30 * 40;
  const budgetPoints = budgets.length
    ? Math.max(0, 20 - overBudgets.length * 10 - atRiskBudgets.length * 3)
    : 14;
  const recurringPoints =
    recurringShare == null
      ? 14
      : Math.max(0, 20 - Math.max(0, recurringShare - 30) / 2);
  const balancePoints =
    (totals.netWorth >= 0 ? 12 : 0) +
    (utilization == null ? 8 : utilization <= 30 ? 8 : utilization <= 70 ? 4 : 0);
  const rawScore = savingsPoints + budgetPoints + recurringPoints + balancePoints;
  // Spending more than you earn is the defining fragile state, so a deficit
  // caps the score no matter how healthy the other components look.
  const cappedScore =
    current.expense > current.income ? Math.min(rawScore, 35) : rawScore;
  const score = hasData
    ? Math.round(Math.max(0, Math.min(100, cappedScore)))
    : 0;
  const band =
    score >= HEALTH_BANDS.strong
      ? ("strong" as const)
      : score >= HEALTH_BANDS.steady
        ? ("steady" as const)
        : ("fragile" as const);

  const insights: ReportInsight[] = [];
  const topCategory = categories[0];
  const expenseChange = previous
    ? changePercent(current.expense, previous.expense)
    : null;

  if (!hasData) {
    insights.push({ id: "needsData", severity: "warning" });
  } else {
    if (current.expense > current.income) {
      insights.push({
        id: "overspending",
        severity: "critical",
        values: { gap: current.expense - current.income },
      });
    }
    if (overBudgets.length) {
      insights.push({
        id: "budgetsOver",
        severity: "critical",
        values: { count: overBudgets.length, name: overBudgets[0].name },
      });
    }
    if (utilization != null && utilization > 70) {
      insights.push({
        id: "creditHigh",
        severity: "critical",
        values: { utilization: Math.round(utilization) },
      });
    }
    if (current.income > 0 && savingsRate > 0 && savingsRate < 10) {
      insights.push({
        id: "lowSavings",
        severity: "warning",
        values: { rate: Math.round(savingsRate) },
      });
    }
    // Below three categories everything looks "concentrated", so the warning
    // would be noise rather than a finding.
    if (categories.length >= 3 && topCategory && topCategory.share >= 35) {
      insights.push({
        id: "concentration",
        severity: "warning",
        values: { name: topCategory.label, share: topCategory.share },
      });
    }
    const spiking = categories.find(
      (category) => (category.changePercent ?? 0) >= 40,
    );
    if (spiking) {
      insights.push({
        id: "categorySpike",
        severity: "warning",
        values: {
          name: spiking.label,
          percent: Math.round(spiking.changePercent ?? 0),
        },
      });
    }
    if (recurringShare != null && recurringShare >= 40) {
      insights.push({
        id: "recurringHeavy",
        severity: "warning",
        values: { share: Math.round(recurringShare) },
      });
    }
    if (utilization != null && utilization > 30 && utilization <= 70) {
      insights.push({
        id: "creditModerate",
        severity: "warning",
        values: { utilization: Math.round(utilization) },
      });
    }
    if (
      previous &&
      previous.expense > 0 &&
      projectedExpense > previous.expense * 1.15
    ) {
      insights.push({
        id: "pace",
        severity: "warning",
        values: { projected: projectedExpense },
      });
    }
    if (totals.netWorth < 0) {
      insights.push({
        id: "negativeNetWorth",
        severity: "warning",
        values: { amount: Math.abs(totals.netWorth) },
      });
    }
    if (atRiskBudgets.length && !overBudgets.length) {
      insights.push({
        id: "budgetsAtRisk",
        severity: "warning",
        values: { count: atRiskBudgets.length, name: atRiskBudgets[0].name },
      });
    }

    if (savingsRate >= 20) {
      insights.push({
        id: "strongSavings",
        severity: "good",
        values: { rate: Math.round(savingsRate) },
      });
    }
    if (budgets.length && !overBudgets.length) {
      insights.push({
        id: "budgetsOnTrack",
        severity: "good",
        values: { count: budgets.length },
      });
    }
    if (expenseChange != null && expenseChange <= -5) {
      insights.push({
        id: "expensesDown",
        severity: "good",
        values: { percent: Math.abs(Math.round(expenseChange)) },
      });
    }
    if (!insights.some((insight) => insight.severity !== "good")) {
      insights.push({ id: "maintain", severity: "good" });
    }
  }

  return {
    currencyCode,
    hasData,
    period,
    activity,
    accountCount: accounts.filter((account) => !account.isExcluded).length,
    months,
    current,
    previous: previous ?? null,
    savingsRate,
    savingsRateChange: previous ? savingsRate - previousSavingsRate : null,
    incomeChange: previous ? changePercent(current.income, previous.income) : null,
    expenseChange,
    projectedExpense,
    progress,
    categories,
    parentCategories,
    netWorth: totals,
    credit: { limit: creditLimit, used: creditUsed, utilization },
    recurring: { monthly: recurringMonthly, share: recurringShare },
    budgets: {
      total: budgets.length,
      over: overBudgets.length,
      atRisk: atRiskBudgets.length,
      onTrack: budgets.length - overBudgets.length - atRiskBudgets.length,
    },
    health: { score, band },
    insights,
  };
}

export type ProfileReport = ReturnType<typeof selectProfileReport>;
