import type { BackupDocument } from "./backup-document";
import { references } from "./category-record";
import {
  convertCurrency,
  readRateSnapshot,
  type ExchangeRateSnapshot,
} from "./exchange-rate";
import { isJsonObject, type JsonObject } from "./json";

export function profileCurrency(document: BackupDocument, profileId: string) {
  const profile = document.users.find((record) =>
    references(record, profileId),
  );
  const code = String(
    profile?.currency ?? document._local.mainCurrency,
  ).toUpperCase();
  return /^[A-Z]{3}$/.test(code) ? code : "USD";
}

export function transactionSnapshot(
  record: JsonObject,
): ExchangeRateSnapshot | null {
  if (!isJsonObject(record.conversionSnapshot)) return null;
  const snapshot = readRateSnapshot(record.conversionSnapshot);
  return snapshot ? { ...record.conversionSnapshot, ...snapshot } : null;
}

/** Uses only the transaction's immutable rates, never today's shared cache. */
export function transactionMoney(record: JsonObject, target: string) {
  const currency = target.toUpperCase();
  const base = String(
    record.currencyCode ?? record.accountCurrencyCode ?? "USD",
  ).toUpperCase();
  const amount = Math.abs(Number(record.amount));
  if (!Number.isFinite(amount)) return null;
  if (base === currency) return { amount, currencyCode: currency, date: null };
  if (
    record.accountCurrencyCode === currency &&
    typeof record.accountAmount === "number" &&
    Number.isFinite(record.accountAmount)
  )
    return {
      amount: Math.abs(record.accountAmount),
      currencyCode: currency,
      date:
        typeof record.exchangeRateDate === "string"
          ? record.exchangeRateDate
          : null,
    };
  const snapshot = transactionSnapshot(record);
  const sourceRate = snapshot?.rates[base];
  const targetRate = snapshot?.rates[currency];
  if (snapshot && sourceRate && targetRate)
    return {
      amount: convertCurrency(amount, targetRate / sourceRate, currency),
      currencyCode: currency,
      date: snapshot.date,
    };
  // Older records may contain the account conversion without a full snapshot.
  if (
    record.accountCurrencyCode === currency &&
    typeof record.exchangeRate === "number" &&
    Number.isFinite(record.exchangeRate) &&
    record.exchangeRate > 0
  )
    return {
      amount: convertCurrency(amount, record.exchangeRate, currency),
      currencyCode: currency,
      date:
        typeof record.exchangeRateDate === "string"
          ? record.exchangeRateDate
          : null,
    };
  return null;
}
