import { identity } from "@/data/model/category-record";
import { financialMonth } from "@/data/model/financial-month";

import { isoDay, type ChatToolArgs } from "../chat-tool-protocol";
import { obligationsWithin } from "./account-tools";
import { amortize, goalValues } from "./wealth-tools";
import {
  DAY_MS,
  mean,
  money,
  numeric,
  parseDate,
  PERIODS_PER_YEAR,
  resolveOne,
  round2,
  startOfDay,
  ToolOutput,
  type ToolContext,
} from "./tool-context";

/**
 * Scenario tools are pure: they read the document, compute, and return
 * numbers. None of them changes a stored balance or record.
 */

function variableSpending(context: ToolContext) {
  const months = context.completedMonths(6);
  const fixed = context.recurringMonthly().expense;
  const average = mean(months.map((month) => month.expense));
  return {
    months,
    average,
    fixed,
    variable: Math.max(0, average - fixed),
    averageIncome: mean(months.map((month) => month.income)),
  };
}

export function affordabilityCheck(context: ToolContext, args: ChatToolArgs): ToolOutput {
  const output = new ToolOutput("affordability_check", context);
  const cur = context.currency;
  if (args.amount === undefined || args.amount <= 0) {
    output.line("[affordability_check] need the purchase amount").missingData("purchase amount");
    return output;
  }
  const currency = args.currency ?? cur;
  const price = context.convert(args.amount, currency);
  if (price === null) {
    output.line(`[affordability_check] no saved ${currency}->${cur} rate`).missingData(`${currency} exchange rate`);
    return output;
  }
  const date = parseDate(args.date) ?? context.now;
  const days = Math.max(0, Math.ceil((startOfDay(date).getTime() - startOfDay(context.now).getTime()) / DAY_MS));
  const horizon = days + 14; // Two-week buffer after the purchase.
  const liquidity = context.liquidity();
  const obligations = obligationsWithin(context, horizon);
  const spending = variableSpending(context);
  const dailyVariable = spending.variable / 30.44;
  const variableUntil = dailyVariable * horizon;
  const cashBefore = liquidity.liquid;
  const available =
    cashBefore + obligations.income - obligations.expense - obligations.cardTotal - variableUntil;
  const after = available - price;
  const goals = context
    .records("goals")
    .map((goal) => goalValues(context, goal))
    .filter((goal) => goal.date && goal.date > context.now && goal.target > goal.current);
  const goalNeeds = goals.reduce((sum, goal) => {
    const months = Math.max((goal.date!.getTime() - context.now.getTime()) / (30.44 * DAY_MS), 1);
    const monthly = (goal.target - goal.current) / months;
    return sum + (context.convert(monthly, goal.currency) ?? 0);
  }, 0);
  const reserve = spending.average * 3;
  output.fact("availableBefore", round2(available), { currency: cur, kind: "projection" });
  output.fact("afterPurchase", round2(after), { currency: cur, kind: "projection" });
  output.line(
    `[affordability_check] SCENARIO: ${args.recurring ? "recurring monthly" : "one-time"} purchase of ${money(args.amount, currency)}${currency !== cur ? ` (${money(price, cur)})` : ""} on ${isoDay(date)}; window until ${horizon} days from today (purchase date + 14-day buffer)`,
    `liquid cash now ${money(cashBefore, cur)}`,
    `expected until then: recurring income +${money(obligations.income, cur)}, recurring bills -${money(obligations.expense, cur)}, card payments -${money(obligations.cardTotal, cur)}, typical variable spending -${money(variableUntil, cur)} (${money(spending.variable, cur)}/month = 6-month average ${money(spending.average, cur)} minus fixed ${money(spending.fixed, cur)})`,
    `estimated available before the purchase: ${money(available, cur)}; after the purchase: ${money(after, cur)}`,
    `accessible savings not counted above: ${money(liquidity.accessibleSavings, cur)}`,
    `3-month emergency reserve (3 x average spending): ${money(reserve, cur)}; after the purchase liquid + accessible savings would be ${money(after + liquidity.accessibleSavings, cur)}`,
  );
  if (goalNeeds > 0)
    output.line(`active goals need about ${money(goalNeeds, cur)}/month to stay on schedule`);
  if (args.recurring)
    output.line(
      `as a monthly cost it would take ${spending.averageIncome > 0 ? `${Math.round((price / spending.averageIncome) * 100)}% of average income` : "an unknown share of income"}; average monthly net is ${money(spending.averageIncome - spending.average, cur)}`,
    );
  if (after < 0) output.warn("the estimate goes negative before the next income covers it");
  if (after + liquidity.accessibleSavings < reserve) output.warn("the purchase would leave less than a 3-month reserve");
  if (spending.months.length < 3) output.warn("fewer than 3 completed months; spending estimates are rough");
  output.assume("variable spending continues at the 6-month average; recurring items follow their schedules");
  return output;
}

export function scenarioSimulation(context: ToolContext, args: ChatToolArgs): ToolOutput {
  const output = new ToolOutput("scenario_simulation", context);
  const cur = context.currency;
  const spending = variableSpending(context);
  const baseNet = spending.averageIncome - spending.average;
  let monthlyDelta = 0;
  let description = "";
  const operation = args.operation;
  if (!operation) {
    output.line("[scenario_simulation] no operation given").missingData("what to change");
    return output;
  }
  switch (operation) {
    case "reduce_category": {
      const months = spending.months;
      let total = 0;
      for (const month of months)
        for (const fact of context.facts(month))
          if (
            context.counted(fact) &&
            fact.type === "expense" &&
            fact.reportingCurrency === context.reporting &&
            context.matches(fact, { category: args.category })
          )
            total += fact.reportingAmount;
      const average = months.length ? total / months.length : 0;
      const cut = args.amount ?? (average * (args.percent ?? 10)) / 100;
      monthlyDelta = Math.min(cut, average);
      description = `reduce ${args.category ?? "spending"} (average ${money(average, cur)}/month) by ${money(monthlyDelta, cur)}/month`;
      break;
    }
    case "remove_recurring": {
      const record = resolveOne(context, output, "recurrings", args.id ?? args.query, "recurring payment");
      if (!record) return output;
      const item = context.recurringsView().find((entry) => entry.id === identity(record))!;
      const monthly = context.convert((item.amount * (PERIODS_PER_YEAR[item.period] ?? 0)) / 12, item.currencyCode) ?? 0;
      monthlyDelta = item.type === 1 ? -monthly : monthly;
      description = `remove ${item.name} (${money(monthly, cur)}/month ${item.type === 1 ? "income" : "expense"})`;
      break;
    }
    case "add_recurring":
      monthlyDelta = -(args.amount ?? 0);
      description = `add a recurring expense of ${money(args.amount ?? 0, cur)}/month`;
      break;
    case "one_time_purchase":
      description = `one-time purchase of ${money(args.amount ?? 0, cur)}`;
      break;
    case "income_change": {
      const change = args.amount ?? (spending.averageIncome * (args.percent ?? 0)) / 100;
      monthlyDelta = change;
      description = `income ${change >= 0 ? "increase" : "decrease"} of ${money(Math.abs(change), cur)}/month`;
      break;
    }
    case "savings_change":
      monthlyDelta = -(args.amount ?? 0);
      description = `change savings contributions by ${money(args.amount ?? 0, cur)}/month`;
      break;
    case "extra_loan_payment": {
      const loan = resolveOne(context, output, "loans", args.id ?? args.query, "loan");
      if (!loan) return output;
      const principal = numeric(loan.amount) ?? 0;
      const rate = numeric(loan.interestRate);
      const payment = numeric(loan.monthlyPayment ?? loan.installment);
      monthlyDelta = -(args.amount ?? 0);
      description = `pay ${money(args.amount ?? 0, cur)}/month extra on ${String(loan.name ?? "the loan")}`;
      if (rate !== null && payment) {
        const base = amortize(principal, rate, payment);
        const faster = amortize(principal, rate, payment + (args.amount ?? 0));
        if (base && faster)
          output.line(`loan: ${base.months} -> ${faster.months} months, interest saved ${money(base.interest - faster.interest, cur)}`);
      } else output.missingData("loan interest rate or installment");
      break;
    }
  }
  const oneTime = operation === "one_time_purchase" ? args.amount ?? 0 : 0;
  output.fact("monthlyNetChange", round2(monthlyDelta), { currency: cur, kind: "projection" });
  output.line(
    `[scenario_simulation] SCENARIO (nothing is changed): ${description}`,
    `baseline average monthly net ${money(baseNet, cur)} (income ${money(spending.averageIncome, cur)} - spending ${money(spending.average, cur)}, ${spending.months.length} completed months)`,
    `new monthly net ${money(baseNet + monthlyDelta, cur)} (change ${monthlyDelta >= 0 ? "+" : ""}${money(monthlyDelta, cur)}/month, ${money(monthlyDelta * 12, cur)}/year)${oneTime ? `; one-time cash impact -${money(oneTime, cur)}, liquid after ${money(context.liquidity().liquid - oneTime, cur)}` : ""}`,
  );
  const goals = context.records("goals").map((goal) => goalValues(context, goal)).filter((goal) => goal.target > goal.current);
  for (const goal of goals.slice(0, 3)) {
    const remaining = goal.target - goal.current;
    const before = baseNet > 0 ? remaining / baseNet : null;
    const after = baseNet + monthlyDelta > 0 ? remaining / (baseNet + monthlyDelta) : null;
    output.line(
      `goal ${goal.name}: ${before ? `${before.toFixed(1)} months` : "not reachable"} at the current net vs ${after ? `${after.toFixed(1)} months` : "not reachable"} in this scenario (if all net cash went to it)`,
    );
  }
  return output;
}

export function cashFlowForecast(context: ToolContext, args: ChatToolArgs): ToolOutput {
  const output = new ToolOutput("cash_flow_forecast", context);
  const cur = context.currency;
  const months = args.months ?? 6;
  const spending = variableSpending(context);
  const completed = spending.months.map((month) => month.expense - spending.fixed);
  const low = Math.max(0, Math.min(...(completed.length ? completed : [0])));
  const high = Math.max(0, ...completed);
  let balance = context.liquidity().liquid;
  output.line(
    `[cash_flow_forecast] PROJECTION for ${months} months in ${cur}: known recurring items by schedule + variable spending (6-month average ${money(spending.variable, cur)}; optimistic uses the lowest month ${money(low, cur)}, conservative the highest ${money(high, cur)})`,
    "month | recurring income | recurring expenses | variable (base) | net base | net optimistic | net conservative | liquid cash base",
  );
  for (let offset = 0; offset < months; offset++) {
    const { start, end } = financialMonth(context.now, context.monthStartDay, offset);
    const from = Math.max(start.getTime(), context.now.getTime());
    let income = 0;
    let expense = 0;
    for (const event of context.upcomingEvents(Math.ceil((end.getTime() - context.now.getTime()) / DAY_MS) + 1)) {
      const time = event.date.getTime();
      if (time < from || time >= end.getTime()) continue;
      const converted = context.convert(event.amount, event.currencyCode) ?? 0;
      if (event.type === 1) income += converted;
      else expense += converted;
    }
    const share = (end.getTime() - from) / Math.max(1, end.getTime() - start.getTime());
    const variable = spending.variable * share;
    const net = income - expense - variable;
    balance += net;
    output.line(
      `${isoDay(start).slice(0, 7)}${offset === 0 ? " (rest of month)" : ""} | ${income.toFixed(2)} | ${expense.toFixed(2)} | ${variable.toFixed(2)} | ${net.toFixed(2)} | ${(income - expense - low * share).toFixed(2)} | ${(income - expense - high * share).toFixed(2)} | ${balance.toFixed(2)}`,
    );
  }
  output.fact("endBalance", round2(balance), { currency: cur, kind: "projection" });
  if (!context.activeRecurrings().some((item) => item.type === 1))
    output.warn("no recurring income is scheduled, so the forecast has no income; record salary as a recurring income for a better forecast");
  output.assume("card payments are part of spending; balances converted at saved rates");
  return output;
}

