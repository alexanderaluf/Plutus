import { identity } from "@/data/model/category-record";
import { selectBudgets, type Budget } from "@/data/selectors/budget-selectors";

import { isoDay, type ChatToolArgs } from "../chat-tool-protocol";
import {
  DAY_MS,
  MAX_CARDS,
  mean,
  median,
  money,
  resolveOne,
  round2,
  ToolOutput,
  type ToolContext,
} from "./tool-context";

export function budgetsTool(context: ToolContext): ToolOutput {
  const output = new ToolOutput("budgets", context);
  const budgets = context.budgetsView();
  output.line(
    "[budgets] name | status | spent / limit | remaining | period | daily allowance",
    ...budgets.map((budget) => {
      output.fact(`remaining.${budget.id}`, round2(budget.remaining), {
        currency: budget.currencyCode,
        entityType: "budget",
        entityId: budget.id,
      });
      return `${budget.name} | ${budget.periodStatus}${budget.remaining < 0 ? ", OVER BUDGET" : ""} | ${money(budget.tracked, budget.currencyCode)} / ${money(budget.limit, budget.currencyCode)} (${Math.round(budget.percent)}%) | ${money(budget.remaining, budget.currencyCode)} | ${isoDay(budget.range.start)}..${isoDay(new Date(budget.range.end.getTime() - 1))}, ${budget.daysLeft} days left | ${money(budget.dailyAllowance, budget.currencyCode)}`;
    }),
  );
  if (!budgets.length) output.line("no budgets");
  for (const { id } of budgets.slice(0, MAX_CARDS)) output.card({ kind: "budget", id });
  return output;
}

export type BudgetPace = {
  budget: Budget;
  elapsed: number;
  projected: number;
  status: "on_track" | "at_risk" | "over_budget" | "not_active";
  exhaustion: Date | null;
};

/** Straight-line pacing: spend so far divided by the share of time elapsed. */
export function budgetPace(budget: Budget, now: Date): BudgetPace {
  const start = budget.range.start.getTime();
  const end = budget.range.end.getTime();
  const elapsed = Math.min(1, Math.max(0, (now.getTime() - start) / Math.max(1, end - start)));
  if (!budget.active)
    return {
      budget,
      elapsed,
      projected: budget.tracked,
      status: budget.tracked > budget.limit ? "over_budget" : "not_active",
      exhaustion: null,
    };
  const projected = elapsed > 0.02 ? budget.tracked / elapsed : budget.tracked;
  const elapsedDays = Math.max((now.getTime() - start) / DAY_MS, 1);
  const pace = budget.tracked / elapsedDays;
  let exhaustion: Date | null = null;
  if (budget.remaining > 0 && pace > 0) {
    const date = new Date(start + (budget.limit / pace) * DAY_MS);
    if (date.getTime() < end) exhaustion = date;
  }
  return {
    budget,
    elapsed,
    projected,
    status:
      budget.tracked > budget.limit
        ? "over_budget"
        : projected > budget.limit
          ? "at_risk"
          : "on_track",
    exhaustion,
  };
}

function findBudget(context: ToolContext, output: ToolOutput, args: ChatToolArgs) {
  const record = resolveOne(context, output, "budgets", args.id ?? args.budget, "budget");
  return record
    ? context.budgetsView().find((budget) => budget.id === identity(record)) ?? null
    : null;
}

export function budgetDetails(context: ToolContext, args: ChatToolArgs): ToolOutput {
  const output = new ToolOutput("budget_details", context);
  const budget = findBudget(context, output, args);
  if (!budget) return output;
  const cur = budget.currencyCode;
  const scope =
    budget.budgetType === "Overall"
      ? "all categories"
      : budget.categories
          .map((id) => context.name("categories", id, "?"))
          .join(", ") + (budget.includeSubcategories ? " (with subcategories)" : "");
  const accounts = budget.accounts.length
    ? budget.accounts.map((id) => context.name("accounts", id, "?")).join(", ")
    : "all accounts";
  const pace = budgetPace(budget, context.now);
  output.fact("tracked", round2(budget.tracked), { currency: cur, entityType: "budget", entityId: budget.id });
  output.fact("limit", round2(budget.limit), { currency: cur, entityType: "budget", entityId: budget.id, kind: "stored" });
  output.line(
    `[budget_details] ${budget.name}: ${budget.period} ${budget.budgetMode.toLowerCase()} budget on ${scope}; accounts ${accounts}`,
    `period ${isoDay(budget.range.start)}..${isoDay(new Date(budget.range.end.getTime() - 1))} (${budget.periodStatus}), ${budget.daysLeft} days left of ${budget.periodDays}`,
    `spent ${money(budget.tracked, cur)} of ${money(budget.limit, cur)} (${Math.round(budget.percent)}%), remaining ${money(budget.remaining, cur)}, daily allowance ${money(budget.dailyAllowance, cur)}, planned per day ${money(budget.dailyPlan, cur)}`,
    `pace: ${pace.status}, projected end spend ${money(pace.projected, cur)}${pace.exhaustion ? `, runs out around ${isoDay(pace.exhaustion)} at this pace` : ""}`,
  );
  if (budget.rolling) output.line(`rollover: ${money(budget.rollover, cur)} carried from earlier periods`);
  if (budget.excludedCurrencyCount)
    output.warn(`${budget.excludedCurrencyCount} transactions in other currencies without a saved rate are not counted`);
  const top = [...budget.breakdown].sort((a, b) => b.amount - a.amount).filter((item) => item.amount > 0);
  if (top.length)
    output.line(
      `top contributors: ${top
        .slice(0, 5)
        .map((item) => `${item.name} ${item.amount.toFixed(2)}`)
        .join(", ")}`,
    );
  // The previous equivalent period is computed by the same selector.
  const previous = selectBudgets(context.document, new Date(budget.range.start.getTime() - 1)).find(
    (item) => item.id === budget.id,
  );
  if (previous)
    output.line(
      `previous period ${isoDay(previous.range.start)}..${isoDay(new Date(previous.range.end.getTime() - 1))}: spent ${money(previous.tracked, cur)} of ${money(previous.limit, cur)}`,
    );
  output.line(
    "largest matching transactions:",
    ...[...budget.transactions]
      .sort((a, b) => b.amount - a.amount)
      .slice(0, 5)
      .map((item) => `${isoDay(new Date(item.timestamp))} | ${item.name} | ${money(item.amount, item.currencyCode)} | ${item.categoryName}`),
  );
  output.card({ kind: "budget", id: budget.id });
  return output;
}

export function budgetForecast(context: ToolContext, args: ChatToolArgs): ToolOutput {
  const output = new ToolOutput("budget_forecast", context);
  const selected = args.id || args.budget ? findBudget(context, output, args) : null;
  if ((args.id || args.budget) && !selected) return output;
  const budgets = selected ? [selected] : context.budgetsView();
  output.line(
    "[budget_forecast] budget | status | spent | limit | time elapsed | projected end spend | runs out on",
  );
  for (const budget of budgets) {
    const pace = budgetPace(budget, context.now);
    output.fact(`projected.${budget.id}`, round2(pace.projected), {
      currency: budget.currencyCode,
      kind: "projection",
      entityType: "budget",
      entityId: budget.id,
    });
    output.line(
      `${budget.name} | ${pace.status} | ${budget.tracked.toFixed(2)} | ${budget.limit.toFixed(2)} ${budget.currencyCode} | ${Math.round(pace.elapsed * 100)}% | ${pace.projected.toFixed(2)} | ${pace.exhaustion ? isoDay(pace.exhaustion) : "-"}`,
    );
    if (pace.status !== "on_track") output.card({ kind: "budget", id: budget.id });
  }
  if (!budgets.length) output.line("no budgets");
  output.assume("projection = spent / share of the period elapsed (straight-line pace)");
  return output;
}

export function budgetRecommendations(context: ToolContext, args: ChatToolArgs): ToolOutput {
  const output = new ToolOutput("budget_recommendations", context);
  const months = context.completedMonths(6);
  if (!months.length) {
    output.line("[budget_recommendations] no completed month of history yet").missingData("spending history");
    return output;
  }
  const reduction = args.percent ?? 10;
  const perCategory = new Map<string, number[]>();
  const names = new Map<string, string>();
  months.forEach((month, index) => {
    for (const fact of context.facts(month)) {
      if (!context.counted(fact) || fact.type !== "expense") continue;
      if (fact.reportingCurrency !== context.reporting) continue;
      if (args.category && !context.matches(fact, { category: args.category })) continue;
      const key = fact.category || "uncategorized";
      names.set(key, context.categoryName(fact));
      const values = perCategory.get(key) ?? months.map(() => 0);
      values[index] += fact.reportingAmount;
      perCategory.set(key, values);
    }
  });
  const averageIncome = mean(months.map((month) => month.income));
  const rows = [...perCategory]
    .map(([id, values]) => ({
      id,
      name: names.get(id) ?? id,
      avg3: mean(values.slice(-3)),
      median6: median(values),
    }))
    .sort((a, b) => b.avg3 - a.avg3)
    .slice(0, 8);
  const cur = context.reporting;
  output.line(
    `[budget_recommendations] per month in ${cur}, from ${months.length} completed months; formulas: A = last-3-month average, B = 6-month median, C = A reduced by ${reduction}%, share = A / average income ${averageIncome.toFixed(2)}`,
    "category | A 3-month avg | B 6-month median | C reduced target | share of income",
  );
  for (const row of rows) {
    output.fact(`avg3.${row.id}`, round2(row.avg3), { currency: cur });
    output.line(
      `${row.name} | ${row.avg3.toFixed(2)} | ${row.median6.toFixed(2)} | ${(row.avg3 * (1 - reduction / 100)).toFixed(2)} | ${averageIncome > 0 ? `${Math.round((row.avg3 / averageIncome) * 100)}%` : "n/a"}`,
    );
  }
  if (months.length < 3) output.warn("fewer than 3 completed months; averages are rough");
  output.line("These are options computed from history; the user chooses the amount.");
  return output;
}

