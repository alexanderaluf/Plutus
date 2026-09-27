import { i18n } from "@/localization/i18n";

import type { BackupDocument } from "./backup-document";
import type { JsonObject } from "./json";
import { convertCurrency } from "./exchange-rate";
import { selectExchangeQuote } from "../selectors/exchange-rate-selectors";
import { references } from "./category-record";
import { transactionMoney } from "./transaction-conversion";
import { isJsonObject } from "./json";

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
  const lastDay = new Date(
    date.getFullYear(),
    date.getMonth() + 1,
    0,
  ).getDate();
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

/** Price outstanding purchases individually. Only unrecorded/legacy debt needs a live quote. */
export function cardPaymentConversion(
  document: BackupDocument,
  card: JsonObject,
  bank: JsonObject,
  date = new Date(),
) {
  const amount = Math.max(0, -Number(card.amount));
  const target = currencyCode(bank);
  if (amount === 0)
    return {
      bankAmount: amount,
      missingAmount: 0,
      rate: 1,
      date: null,
      allocations: [] as JsonObject[],
    };
  const payments = document.transactions.filter(
    (record) => record.cardPaymentPeriod && references(card, record.account),
  );
  const paid = new Map<
    string,
    { native: number; bank: number; date: string | null }
  >();
  for (const payment of payments) {
    if (!Array.isArray(payment.cardPaymentAllocations)) continue;
    for (const allocation of payment.cardPaymentAllocations.filter(
      isJsonObject,
    )) {
      const id = String(allocation.transactionId);
      const previous = paid.get(id) ?? { native: 0, bank: 0, date: null };
      const native = Number(allocation.cardAmount);
      const repriced =
        payment.targetCurrencyCode !== target
          ? transactionMoney(
              {
                amount: Math.abs(native),
                currencyCode: currencyCode(card),
                conversionSnapshot: allocation.conversionSnapshot ?? null,
              },
              target,
            )
          : null;
      const bankAmount = repriced
        ? repriced.amount * Math.sign(native)
        : Number(allocation.bankAmount);
      if (!Number.isFinite(native) || !Number.isFinite(bankAmount)) continue;
      paid.set(id, {
        native: previous.native + native,
        bank: previous.bank + bankAmount,
        date:
          String(allocation.rateDate ?? payment.exchangeRateDate ?? "") || null,
      });
    }
  }
  const legacyPaidAt = Math.max(
    0,
    ...payments
      .filter((record) => !Array.isArray(record.cardPaymentAllocations))
      .map((record) => Date.parse(String(record.createdAt ?? record.date)))
      .filter(Number.isFinite),
  );
  let outstanding = 0;
  let converted = 0;
  let missingAmount = 0;
  const allocations: JsonObject[] = [];
  const recordedIds = new Set(document.transactions.map(recordId));
  const records = [
    ...document.transactions,
    ...[...paid.keys()]
      .filter((id) => !recordedIds.has(id))
      .map((id) => ({ uuid: id }) as JsonObject),
  ];
  for (const record of records) {
    if (record.cardPaymentPeriod) continue;
    if (
      legacyPaidAt &&
      Date.parse(String(record.createdAt ?? record.date)) <= legacyPaidAt
    )
      continue;
    const source = record.account ?? record.fromAccount ?? record.sourceAccount;
    const destination = record.toAccount ?? record.destinationAccount;
    const debit = references(card, source);
    const credit = record.type === 2 && references(card, destination);
    const previous = paid.get(recordId(record));
    if (!debit && !credit && !previous) continue;
    const native = transactionMoney(record, currencyCode(card));
    if (!native && !previous) continue;
    const sign = credit || record.type === 1 ? -1 : 1;
    const nativeAmount =
      ((debit || credit) && native ? native.amount * sign : 0) -
      (previous?.native ?? 0);
    if (Math.abs(nativeAmount) < 1e-8) continue;
    outstanding += nativeAmount;
    const priced =
      debit || credit
        ? transactionMoney(record, target)
        : previous
          ? { amount: 0, date: previous.date }
          : null;
    const pricedAmount = priced
      ? priced.amount * sign - (previous?.bank ?? 0)
      : null;
    if (pricedAmount !== null) converted += pricedAmount;
    else missingAmount += nativeAmount;
    allocations.push({
      transactionId: recordId(record),
      cardAmount: nativeAmount,
      bankAmount: pricedAmount,
      rateDate: priced?.date ?? null,
      conversionSnapshot: record.conversionSnapshot ?? null,
    });
  }
  // An opening balance or old import can contain debt with no transaction history.
  missingAmount += amount - outstanding;
  if (Math.abs(missingAmount) < 1e-8) missingAmount = 0;
  const quote = missingAmount
    ? currencyCode(card) === target
      ? { rate: 1, date: null }
      : selectExchangeQuote(document, currencyCode(card), target, date, true)
    : null;
  if (missingAmount && !quote)
    return {
      bankAmount: null,
      missingAmount,
      rate: null,
      date: null,
      allocations,
    };
  const bankAmount = convertCurrency(
    converted + (quote ? missingAmount * quote.rate : 0),
    1,
    target,
  );
  if (bankAmount < 0)
    return {
      bankAmount: null,
      missingAmount,
      rate: null,
      date: null,
      allocations,
    };
  return {
    bankAmount,
    missingAmount,
    rate: bankAmount / amount,
    date:
      quote?.date ??
      allocations
        .map((record) => String(record.rateDate ?? ""))
        .filter(Boolean)
        .sort()[0] ??
      null,
    allocations: allocations.map((record) =>
      record.bankAmount === null && quote
        ? {
            ...record,
            bankAmount: convertCurrency(
              Number(record.cardAmount),
              quote.rate,
              target,
            ),
            rateDate: quote.date,
          }
        : record,
    ),
  };
}

export function selectDueCardPayments(
  document: BackupDocument,
  date = new Date(),
) {
  if (!Number.isFinite(date.getTime())) return [];
  return document.accounts.flatMap((card) => {
    const day = card.paymentDay;
    if (
      card.accountType !== "card" ||
      typeof day !== "number" ||
      !Number.isInteger(day) ||
      day < 1 ||
      day > 31 ||
      typeof card.amount !== "number" ||
      !Number.isFinite(card.amount)
    )
      return [];
    const dueMonth = new Date(date.getFullYear(), date.getMonth(), 1);
    if (date.getDate() < dueDateInMonth(date, day))
      dueMonth.setMonth(dueMonth.getMonth() - 1);
    const period = localMonth(dueMonth);
    if (
      typeof card.lastPaymentPeriod === "string" &&
      card.lastPaymentPeriod >= period
    )
      return [];
    const due = paymentTimestamp(dueMonth, day);
    const endOfDueDay = new Date(due);
    endOfDueDay.setHours(23, 59, 59, 999);
    if (
      typeof card.createdAt === "string" &&
      Date.parse(card.createdAt) > endOfDueDay.getTime()
    )
      return [];
    const bank = document.accounts.find(
      (candidate) =>
        recordId(candidate) === card.linkedBankAccountId &&
        candidate.accountType === "bank" &&
        typeof candidate.amount === "number" &&
        Number.isFinite(candidate.amount),
    );
    if (!bank || !recordId(card)) return [];
    const owner = document.users.find(
      (user) => user.uuid === card.user || user.id === card.user,
    );
    if (
      bank.user !== card.user &&
      !(owner && (bank.user === owner.uuid || bank.user === owner.id))
    )
      return [];
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
    const bankIndex = accounts.findIndex(
      (item) => recordId(item) === recordId(payment.bank),
    );
    const bank = accounts[bankIndex];
    // Restored history may contain a payment even if an older backup omitted
    // the marker. The stable transfer ID is a second guard against double debit.
    if (
      transactions.some(
        (item) => item.uuid === `card-payment:${recordId(card)}:${period}:bank`,
      )
    ) {
      accounts[cardIndex] = {
        ...card,
        lastPaymentPeriod: period,
        updatedAt: date.toISOString(),
      };
      changed = true;
      continue;
    }
    const bankBalance = typeof bank.amount === "number" ? bank.amount : 0;
    const processedAt = date.toISOString();
    const paidAt = processedAt;
    const amount = Math.max(0, -Number(card.amount));
    const conversion = cardPaymentConversion(document, card, bank, date);
    if (conversion.bankAmount === null) continue;
    const bankAmount = conversion.bankAmount;
    const remaining = bankBalance - bankAmount;
    if (
      !Number.isFinite(remaining) ||
      Math.abs(remaining) > Number.MAX_SAFE_INTEGER / 1000
    )
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
      exchangeRate: conversion.rate,
      exchangeRateDate: conversion.date,
      cardPaymentAllocations: conversion.allocations,
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
      const references = Array.isArray(accounts[index].transactions)
        ? accounts[index].transactions
        : [];
      accounts[index] = {
        ...accounts[index],
        transactions: [...new Set([...references, payment.uuid])],
      };
    }
  }

  return changed ? { ...document, accounts, transactions } : document;
}
