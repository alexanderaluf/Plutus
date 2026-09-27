import { transactionMoney } from "@/data/model/transaction-conversion";
import { selectExchangeRates } from "@/data/selectors/exchange-rate-selectors";

import { type ChatToolArgs } from "../chat-tool-protocol";
import {
  MAX_CARDS,
  money,
  round2,
  startOfDay,
  ToolOutput,
  type ToolContext,
} from "./tool-context";

export function exchangeRatesTool(context: ToolContext): ToolOutput {
  const output = new ToolOutput("exchange_rates", context);
  const used = new Set<string>();
  for (const account of context.records("accounts"))
    if (typeof account.currencyCode === "string") used.add(account.currencyCode.toUpperCase());
  for (const fact of context.search.facts.slice(0, 500)) used.add(fact.currencyCode);
  used.delete(context.currency);
  const snapshot = selectExchangeRates(context.document, context.currency);
  output.line(
    `[exchange_rates] base ${context.currency}${snapshot ? `, saved ${snapshot.date}` : ", no saved snapshot for this base"}`,
  );
  for (const code of used) {
    const rate = context.rate(code);
    output.line(
      rate
        ? `1 ${code} = ${rate.toFixed(4)} ${context.currency}; 1 ${context.currency} = ${(1 / rate).toFixed(4)} ${code}`
        : `${code}: no saved rate`,
    );
  }
  if (snapshot && Date.parse(snapshot.date) < startOfDay(context.now, -7).getTime())
    output.warn(`saved rates are from ${snapshot.date}; they may be out of date`);
  output.line("Each transaction also keeps the rate saved when it was recorded.");
  return output;
}

export function currencyConvert(context: ToolContext, args: ChatToolArgs): ToolOutput {
  const output = new ToolOutput("currency_convert", context);
  const amount = args.amount;
  const from = args.fromCurrency ?? args.currency;
  const to = args.toCurrency ?? context.currency;
  if (amount === undefined || !from) {
    output.line("[currency_convert] need an amount and a source currency").missingData("amount and currency");
    return output;
  }
  const rate = context.rateBetween(from, to);
  const snapshot = selectExchangeRates(context.document, from) ?? selectExchangeRates(context.document, to);
  if (rate === null) {
    output.line(`[currency_convert] no saved ${from}->${to} rate; conversion is unavailable offline`);
    output.missingData(`${from}/${to} exchange rate`);
    return output;
  }
  output.fact("converted", round2(amount * rate), { currency: to });
  output.line(
    `[currency_convert] ${money(amount, from)} = ${money(amount * rate, to)} at ${rate.toFixed(6)} (saved rates${snapshot ? ` dated ${snapshot.date}, source ${snapshot.source}` : ""})`,
  );
  return output;
}

export function fxExposure(context: ToolContext): ToolOutput {
  const output = new ToolOutput("fx_exposure", context);
  const balances = new Map<string, number>();
  for (const account of context.accountsView()) {
    if (account.isExcluded) continue;
    balances.set(account.currencyCode, (balances.get(account.currencyCode) ?? 0) + account.balance);
  }
  const spending = new Map<string, number>();
  const since = startOfDay(context.now, -90).getTime();
  for (const fact of context.search.facts) {
    if (fact.entry.timestamp < since) break;
    if (fact.type !== "expense" || !context.counted(fact)) continue;
    spending.set(fact.currencyCode, (spending.get(fact.currencyCode) ?? 0) + fact.amount);
  }
  output.line(`[fx_exposure] currency | account balances | converted to ${context.currency} | spending last 90 days`);
  for (const code of new Set([...balances.keys(), ...spending.keys()])) {
    const balance = balances.get(code) ?? 0;
    const converted = context.convert(balance, code);
    output.line(
      `${code} | ${balance.toFixed(2)} | ${converted === null ? "no saved rate" : converted.toFixed(2)} | ${(spending.get(code) ?? 0).toFixed(2)}`,
    );
  }
  return output;
}

export function fxTransactionAnalysis(context: ToolContext, args: ChatToolArgs): ToolOutput {
  const output = new ToolOutput("fx_transaction_analysis", context);
  const range = context.range(args, "last_12_months")!;
  const foreign = context
    .facts(range)
    .filter(
      (fact) =>
        fact.currencyCode !== context.currency &&
        fact.type !== "transfer" &&
        (!args.currency || fact.currencyCode === args.currency),
    );
  const byCurrency = new Map<string, { native: number; converted: number; unpriced: number; count: number }>();
  for (const fact of foreign) {
    // Priced with the rate saved on the transaction, never today's rate.
    const priced = transactionMoney(fact.entry.record, context.currency);
    const bucket = byCurrency.get(fact.currencyCode) ?? { native: 0, converted: 0, unpriced: 0, count: 0 };
    bucket.native += fact.amount;
    bucket.count++;
    if (priced) bucket.converted += priced.amount;
    else bucket.unpriced++;
    byCurrency.set(fact.currencyCode, bucket);
  }
  output.line(
    `[fx_transaction_analysis] ${range.label}: ${foreign.length} foreign-currency transactions, priced at each transaction's saved rate`,
    `currency | transactions | total in currency | cost in ${context.currency} | without saved rate`,
  );
  for (const [code, bucket] of byCurrency) {
    output.fact(`cost.${code}`, round2(bucket.converted), { currency: context.currency, range, kind: "stored" });
    output.line(`${code} | ${bucket.count} | ${bucket.native.toFixed(2)} | ${bucket.converted.toFixed(2)} | ${bucket.unpriced}`);
  }
  if (!foreign.length) output.line("no foreign-currency transactions");
  for (const fact of foreign.slice(0, MAX_CARDS)) output.card({ kind: "transaction", id: fact.entry.id });
  return output;
}
