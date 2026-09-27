import { identity } from "@/data/model/category-record";

import { isoDay, type ChatToolArgs } from "../chat-tool-protocol";
import {
  finite,
  MAX_CARDS,
  mean,
  money,
  resolveOne,
  round2,
  startOfDay,
  ToolOutput,
  type ToolContext,
} from "./tool-context";

/**
 * Account balances at a moment: today's stored balance minus the effect of
 * every later transaction. Only owned, non-excluded accounts are returned.
 */
export function balancesAt(context: ToolContext, at: number) {
  const accounts = context.accountsView().filter((account) => !account.isExcluded);
  const balances = new Map(accounts.map((account) => [account.id, account.balance]));
  for (const fact of context.search.facts) {
    if (fact.entry.timestamp < at) break;
    if (fact.entry.timestamp > context.now.getTime()) continue;
    const record = fact.entry.record;
    const amount = Math.abs(finite(record.accountAmount) ?? finite(record.amount) ?? 0);
    const [source, destination] = fact.accounts;
    if (source && balances.has(source))
      balances.set(source, balances.get(source)! - (fact.type === "income" ? amount : -amount));
    if (fact.type === "transfer" && destination && balances.has(destination))
      balances.set(destination, balances.get(destination)! - amount);
  }
  return { accounts, balances };
}

export function accountsTool(context: ToolContext): ToolOutput {
  const output = new ToolOutput("accounts", context);
  const accounts = context.accountsView();
  output.line(
    "[accounts] name | type | balance | details",
    ...accounts.map((account) => {
      output.fact(`balance.${account.id}`, round2(account.balance), {
        currency: account.currencyCode,
        entityType: "account",
        entityId: account.id,
        kind: "stored",
      });
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
  );
  if (!accounts.length) output.line("no accounts");
  for (const { id } of accounts.slice(0, MAX_CARDS)) output.card({ kind: "account", id });
  return output;
}

function findAccount(context: ToolContext, output: ToolOutput, args: ChatToolArgs) {
  const record = resolveOne(context, output, "accounts", args.id ?? args.account, "account");
  return record ? context.accountsView().find((item) => item.id === identity(record)) ?? null : null;
}

export function accountDetails(context: ToolContext, args: ChatToolArgs): ToolOutput {
  const output = new ToolOutput("account_details", context);
  const account = findAccount(context, output, args);
  if (!account) return output;
  const range = context.range(args, "this_month")!;
  const facts = context.facts(range).filter((fact) => fact.accounts.includes(account.id));
  let income = 0;
  let expense = 0;
  let transfersIn = 0;
  let transfersOut = 0;
  for (const fact of facts) {
    const amount = Math.abs(
      finite(fact.entry.record.accountAmount) ?? finite(fact.entry.record.amount) ?? 0,
    );
    if (fact.type === "income") income += amount;
    else if (fact.type === "expense") expense += amount;
    else if (fact.accounts[0] === account.id) transfersOut += amount;
    else transfersIn += amount;
  }
  const cur = account.currencyCode;
  output.fact("balance", round2(account.balance), { currency: cur, entityType: "account", entityId: account.id, kind: "stored" });
  output.line(
    `[account_details] ${account.name} (${account.kind}${account.institution ? `, ${account.institution}` : ""}) balance ${money(account.balance, cur)}${account.isExcluded ? "; excluded from totals" : ""}${account.isDefault ? "; default account" : ""}`,
    `${range.label}: income ${money(income, cur)}, expenses ${money(expense, cur)}, transfers in ${money(transfersIn, cur)}, transfers out ${money(transfersOut, cur)}, ${facts.length} transactions`,
  );
  if (account.kind === "credit")
    output.line(
      `card: payment day ${account.paymentDay ?? "?"}, limit ${account.creditLimit == null ? "none" : money(account.creditLimit, cur)}, spent this cycle ${money(account.currentSpent, cur)}, linked bank ${account.linkedBankAccountName || "none"}${account.billingCycle ? `, next payment ${isoDay(account.billingCycle.nextPaymentDate)}` : ""}`,
    );
  if (account.savingsSummary)
    output.line(
      `savings: ${account.savingsSummary.productLabel}${account.savingsSummary.providerName ? ` at ${account.savingsSummary.providerName}` : ""}, principal ${money(account.savingsSummary.principal, cur)}, earnings ${money(account.savingsSummary.earnings, cur)}`,
    );
  const recent = context.search.facts.filter((fact) => fact.accounts.includes(account.id)).slice(0, 8);
  output.line("recent:", ...recent.map((fact) => context.line(fact)));
  output.card({ kind: "account", id: account.id });
  for (const fact of recent.slice(0, 4)) output.card({ kind: "transaction", id: fact.entry.id });
  return output;
}

export function accountBalanceHistory(context: ToolContext, args: ChatToolArgs): ToolOutput {
  const output = new ToolOutput("account_balance_history", context);
  const account = findAccount(context, output, args);
  if (!account) return output;
  const interval = args.interval === "week" ? "week" : "month";
  const count = interval === "week" ? Math.min((args.months ?? 3) * 4, 52) : args.months ?? 6;
  const points: string[] = [];
  for (let index = count; index >= 1; index--) {
    const end =
      interval === "week"
        ? startOfDay(context.now, -7 * (index - 1) + 1)
        : new Date(context.now.getFullYear(), context.now.getMonth() - index + 2, 1);
    const at = Math.min(end.getTime(), context.now.getTime());
    const { balances } = balancesAt(context, at);
    points.push(`${isoDay(new Date(at - 1))} ${(balances.get(account.id) ?? 0).toFixed(2)}`);
  }
  output.assume("balances are rebuilt from the current balance and recorded transactions");
  output.line(
    `[account_balance_history] ${account.name} in ${account.currencyCode}, end of each ${interval}:`,
    points.join(", "),
  );
  output.card({ kind: "account", id: account.id });
  return output;
}

/** Recurring bills, income and card payments due in the next `days` days. */
export function obligationsWithin(context: ToolContext, days: number) {
  const events = context.upcomingEvents(days);
  let expense = 0;
  let income = 0;
  const unconverted = new Set<string>();
  for (const event of events) {
    const converted = context.convert(event.amount, event.currencyCode);
    if (converted === null) {
      unconverted.add(event.currencyCode);
      continue;
    }
    if (event.type === 1) income += converted;
    else expense += converted;
  }
  // Inclusive of the last day of the window.
  const horizon = startOfDay(context.now, days + 1).getTime();
  const cardPayments = context
    .accountsView()
    .filter(
      (account) =>
        account.kind === "credit" &&
        !account.isExcluded &&
        account.balance < 0 &&
        account.billingCycle &&
        account.billingCycle.nextPaymentDate.getTime() <= horizon,
    )
    .map((account) => ({
      account,
      date: account.billingCycle!.nextPaymentDate,
      amount: -account.balance,
      converted: context.convert(-account.balance, account.currencyCode),
    }));
  const cardTotal = cardPayments.reduce((sum, item) => sum + (item.converted ?? 0), 0);
  return { events, expense, income, cardPayments, cardTotal, unconverted: [...unconverted] };
}

export function liquidityAnalysis(context: ToolContext, args: ChatToolArgs): ToolOutput {
  const output = new ToolOutput("liquidity_analysis", context);
  const days = args.days ?? 30;
  const cur = context.currency;
  const liquidity = context.liquidity();
  const obligations = obligationsWithin(context, days);
  const free = liquidity.liquid - obligations.expense - obligations.cardTotal + obligations.income;
  output.fact("liquid", round2(liquidity.liquid), { currency: cur });
  output.fact("cardDebt", round2(liquidity.cardDebt), { currency: cur });
  output.fact("freeCash", round2(free), { currency: cur, kind: "projection" });
  output.line(
    `[liquidity_analysis] in ${cur}: liquid bank/cash ${money(liquidity.liquid, cur)}, accessible savings ${money(liquidity.accessibleSavings, cur)}, restricted/locked savings ${money(liquidity.restrictedSavings, cur)}, card debt ${money(liquidity.cardDebt, cur)}`,
    `next ${days} days: recurring expenses ${money(obligations.expense, cur)}, card payments ${money(obligations.cardTotal, cur)}, recurring income ${money(obligations.income, cur)}`,
    `estimated free cash after these commitments (projection, excludes day-to-day spending): ${money(free, cur)}`,
  );
  for (const row of liquidity.rows)
    output.line(`- ${row.name} (${row.bucket}) ${money(row.balance, row.currency)}`);
  if (liquidity.unconverted.length || obligations.unconverted.length)
    output.warn(
      `no saved rate for ${[...new Set([...liquidity.unconverted, ...obligations.unconverted])].join(", ")} to ${cur}; those amounts are excluded`,
    );
  return output;
}

export function creditPosition(context: ToolContext): ToolOutput {
  const output = new ToolOutput("credit_position", context);
  const cards = context.accountsView().filter((account) => account.kind === "credit");
  if (!cards.length) {
    output.line("[credit_position] no card accounts");
    return output;
  }
  let totalDebt = 0;
  let totalLimit = 0;
  output.line("[credit_position] card | debt | limit | utilization | cycle spent | payment day | linked bank | bank covers payment");
  for (const card of cards) {
    const debt = Math.max(0, -card.balance);
    const bank = context.accountsView().find((account) => account.id === card.linkedBankAccountId);
    const needed = bank ? context.convert(debt, card.currencyCode, bank.currencyCode) : null;
    const covers = bank && needed !== null ? (bank.balance >= needed ? "yes" : `no, short ${money(needed - bank.balance, bank.currencyCode)}`) : "unknown";
    const convertedDebt = context.convert(debt, card.currencyCode);
    const convertedLimit = card.creditLimit != null ? context.convert(card.creditLimit, card.currencyCode) : null;
    if (!card.isExcluded && convertedDebt !== null) totalDebt += convertedDebt;
    if (!card.isExcluded && convertedLimit !== null) totalLimit += convertedLimit;
    output.fact(`debt.${card.id}`, round2(debt), { currency: card.currencyCode, entityType: "account", entityId: card.id, kind: "stored" });
    output.line(
      `${card.name} | ${money(debt, card.currencyCode)} | ${card.creditLimit == null ? "none" : money(card.creditLimit, card.currencyCode)} | ${card.creditLimit ? `${Math.round((debt / card.creditLimit) * 100)}%` : "n/a"} | ${money(card.currentSpent, card.currencyCode)} | ${card.paymentDay ?? "?"}${card.billingCycle ? ` (next ${isoDay(card.billingCycle.nextPaymentDate)})` : ""} | ${bank ? `${bank.name} ${money(bank.balance, bank.currencyCode)}` : "none"} | ${covers}`,
    );
    output.card({ kind: "account", id: card.id });
  }
  output.fact("totalDebt", round2(totalDebt), { currency: context.currency });
  output.line(
    `total card debt ${money(totalDebt, context.currency)}${totalLimit > 0 ? ` of ${money(totalLimit, context.currency)} limits (${Math.round((totalDebt / totalLimit) * 100)}% utilization)` : ""}`,
  );
  return output;
}

export function cardPaymentForecast(context: ToolContext, args: ChatToolArgs): ToolOutput {
  const output = new ToolOutput("card_payment_forecast", context);
  const days = args.days ?? 45;
  const horizon = startOfDay(context.now, days).getTime();
  const cards = context
    .accountsView()
    .filter((account) => account.kind === "credit" && account.billingCycle);
  output.line(
    `[card_payment_forecast] next ${days} days; projection from currently recorded card debt (new purchases before the payment day would add to it)`,
  );
  let found = 0;
  for (const card of cards) {
    const date = card.billingCycle!.nextPaymentDate;
    if (date.getTime() > horizon) continue;
    found++;
    const debt = Math.max(0, -card.balance);
    const bank = context.accountsView().find((account) => account.id === card.linkedBankAccountId);
    const inBank = bank ? context.convert(debt, card.currencyCode, bank.currencyCode) : null;
    output.fact(`payment.${card.id}`, round2(debt), { currency: card.currencyCode, kind: "projection", entityType: "account", entityId: card.id });
    output.line(
      `${isoDay(date)} ${card.name}: ${money(debt, card.currencyCode)}${bank && inBank !== null && bank.currencyCode !== card.currencyCode ? ` (≈ ${money(inBank, bank.currencyCode)} at saved rate)` : ""} from ${bank ? `${bank.name} (balance ${money(bank.balance, bank.currencyCode)}, after payment ${money(bank.balance - (inBank ?? debt), bank.currencyCode)})` : "no linked bank"}`,
    );
    output.card({ kind: "account", id: card.id });
  }
  if (!found) output.line("no card payments due in this window");
  return output;
}

export function cashRunway(context: ToolContext): ToolOutput {
  const output = new ToolOutput("cash_runway", context);
  const cur = context.currency;
  const { liquid, accessibleSavings } = context.liquidity();
  const completed = context.completedMonths(12);
  const avg3 = mean(completed.slice(-3).map((month) => month.expense));
  const avg6 = mean(completed.slice(-6).map((month) => month.expense));
  const fixed = context.recurringMonthly().expense;
  const conservative = Math.max(avg3, avg6) * 1.1;
  const months = (base: number, amount: number) => (amount > 0 ? (base / amount).toFixed(1) : "n/a");
  output.fact("liquid", round2(liquid), { currency: cur });
  output.line(
    `[cash_runway] liquid cash ${money(liquid, cur)} (plus accessible savings ${money(accessibleSavings, cur)}); assumes no new income`,
    "baseline | monthly outflow | months covered by liquid | with accessible savings",
    `average of last 3 months | ${avg3.toFixed(2)} | ${months(liquid, avg3)} | ${months(liquid + accessibleSavings, avg3)}`,
    `average of last 6 months | ${avg6.toFixed(2)} | ${months(liquid, avg6)} | ${months(liquid + accessibleSavings, avg6)}`,
    `fixed recurring costs only | ${fixed.toFixed(2)} | ${months(liquid, fixed)} | ${months(liquid + accessibleSavings, fixed)}`,
    `conservative (higher average + 10%) | ${conservative.toFixed(2)} | ${months(liquid, conservative)} | ${months(liquid + accessibleSavings, conservative)}`,
  );
  if (completed.length < 3)
    output.warn(`only ${completed.length} completed months of history; averages are rough`);
  output.assume("runway = balance / monthly spending, no income, no card payments beyond recorded debt");
  return output;
}
