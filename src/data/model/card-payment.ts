import { i18n } from "@/localization/i18n";

import type { BackupDocument } from "./backup-document";
import type { JsonObject } from "./json";
import { convertCurrency } from "./exchange-rate";
import { selectExchangeQuote } from "../selectors/exchange-rate-selectors";

function recordId(record: JsonObject) {
  return String(record.uuid ?? record.id ?? "");
}

function currencyCode(record: JsonObject) {
  return typeof record.currencyCode === "string"
    ? record.currencyCode.toUpperCase()
    : "";
}

function localMonth(date: Date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`;
}

export function dueDateInMonth(date: Date, paymentDay: number) {
  const lastDay = new Date(date.getFullYear(), date.getMonth() + 1, 0).getDate();
  return Math.min(paymentDay, lastDay);
}

function paymentTimestamp(date: Date, paymentDay: number) {
  return new Date(
    date.getFullYear(),
    date.getMonth(),
    dueDateInMonth(date, paymentDay),
    12,
  ).toISOString();
}

export function selectDueCardPayments(document: BackupDocument, date = new Date()) {
  if (!Number.isFinite(date.getTime())) return [];
  return document.accounts.flatMap((card) => {
    const day = card.paymentDay;
    if (card.accountType !== "card" || typeof day !== "number" || !Number.isInteger(day) ||
        day < 1 || day > 31 || typeof card.amount !== "number" || !Number.isFinite(card.amount)) return [];
    const dueMonth = new Date(date.getFullYear(), date.getMonth(), 1);
    if (date.getDate() < dueDateInMonth(date, day)) dueMonth.setMonth(dueMonth.getMonth() - 1);
    const period = localMonth(dueMonth);
    if (typeof card.lastPaymentPeriod === "string" && card.lastPaymentPeriod >= period) return [];
    const due = paymentTimestamp(dueMonth, day);
    const endOfDueDay = new Date(due);
    endOfDueDay.setHours(23, 59, 59, 999);
    if (typeof card.createdAt === "string" && Date.parse(card.createdAt) > endOfDueDay.getTime()) return [];
    const bank = document.accounts.find((candidate) => recordId(candidate) === card.linkedBankAccountId &&
      candidate.accountType === "bank" && typeof candidate.amount === "number" && Number.isFinite(candidate.amount));
    if (!bank || !recordId(card)) return [];
    const owner = document.users.find((user) => user.uuid === card.user || user.id === card.user);
    if (bank.user !== card.user && !(owner && (bank.user === owner.uuid || bank.user === owner.id))) return [];
    return [{ card, bank, period, due }];
  });
}

/**
 * Settle each due card once per local calendar month. The operation is pure and
 * deterministic for a given document/month, so it is safe to run on hydration,
 * app foregrounding, and every document mutation.
 */
export function settleDueCardPayments(
  document: BackupDocument,
  date = new Date(),
): BackupDocument {
  if (Number.isNaN(date.getTime())) return document;

  const accounts = [...document.accounts];
  const transactions = [...document.transactions];
  let changed = false;

  for (const payment of selectDueCardPayments(document, date)) {
    const { card, period } = payment;
    const cardIndex = accounts.findIndex((item) => item === card);
    const bankIndex = accounts.findIndex((item) => recordId(item) === recordId(payment.bank));
    const bank = accounts[bankIndex];
    // Restored history may contain a payment even if an older backup omitted
    // the marker. The stable transfer ID is a second guard against double debit.
    if (transactions.some((item) => item.uuid === `card-payment:${recordId(card)}:${period}:bank`)) {
      accounts[cardIndex] = { ...card, lastPaymentPeriod: period, updatedAt: date.toISOString() };
      changed = true;
      continue;
    }
    const bankBalance = typeof bank.amount === "number" ? bank.amount : 0;
    const processedAt = date.toISOString();
    const paidAt = processedAt;
    const amount = Math.max(0, -Number(card.amount));
    const differentCurrency = currencyCode(card) !== currencyCode(bank);
    const quote = differentCurrency ? selectExchangeQuote(document, currencyCode(card), currencyCode(bank), date, true) : null;
    // Never mark a foreign-currency payment settled without today's rate.
    if (amount > 0 && differentCurrency && !quote) continue;
    const bankAmount = differentCurrency && amount > 0
      ? convertCurrency(amount, quote!.rate, currencyCode(bank)) : amount;
    const remaining = bankBalance - bankAmount;
    if (!Number.isFinite(remaining) || Math.abs(remaining) > Number.MAX_SAFE_INTEGER / 1000)
      throw new Error(i18n.t("errors.cardPayments.balanceTooLarge"));
    const nextCard = {
      ...card,
      amount: amount > 0 ? 0 : card.amount,
      lastPaymentPeriod: period,
      updatedAt: processedAt,
    };
    accounts[cardIndex] = nextCard;
    changed = true;

    if (amount === 0) continue;

    accounts[bankIndex] = {
      ...bank,
      amount: Math.round(remaining * 1000) / 1000,
      updatedAt: processedAt,
    };

    const cardId = recordId(card);
    const bankId = recordId(bank);
    const base = {
      amount,
      type: 2,
      currencyCode: currencyCode(card),
      user: card.user ?? bank.user ?? null,
      fromAccount: bankId,
      toAccount: cardId,
      cardPaymentPeriod: period,
      paymentDueAt: payment.due,
      sourceAmount: amount,
      sourceCurrencyCode: currencyCode(card),
      targetAmount: bankAmount,
      targetCurrencyCode: currencyCode(bank),
      exchangeRate: quote?.rate ?? 1,
      exchangeRateDate: quote?.date ?? null,
      date: paidAt,
      createdAt: paidAt,
      updatedAt: processedAt,
      tags: [],
    };
    const paymentRecords: JsonObject[] = [
      {
        ...base,
        amount: bankAmount,
        currencyCode: currencyCode(bank),
        uuid: `card-payment:${cardId}:${period}:bank`,
        name: `Payment to ${String(card.name ?? "card")}`,
        account: bankId,
        accountName: bank.name ?? "Bank account",
      },
      {
        ...base,
        uuid: `card-payment:${cardId}:${period}:card`,
        name: `Payment from ${String(bank.name ?? "bank account")}`,
        account: cardId,
        accountName: card.name ?? "Card",
      },
    ];
    for (const payment of paymentRecords) {
      if (!transactions.some((item) => item.uuid === payment.uuid)) {
        transactions.push(payment);
      }
      const index = payment.account === bankId ? bankIndex : cardIndex;
      const references = Array.isArray(accounts[index].transactions) ? accounts[index].transactions : [];
      accounts[index] = { ...accounts[index], transactions: [...new Set([...references, payment.uuid])] };
    }
  }

  return changed ? { ...document, accounts, transactions } : document;
}
