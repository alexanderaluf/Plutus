import { i18n } from "@/localization/i18n";

import type { BackupDocument } from "./backup-document";
import { isJsonObject, type JsonObject } from "./json";

export const RATE_SOURCE = "fawazahmed0/currency-api";
export interface ExchangeRateSnapshot extends JsonObject {
  uuid: string;
  source: string;
  base: string;
  date: string;
  fetchedAt: string;
  createdAt: string;
  updatedAt: string;
  rates: Record<string, number>;
}

export function currencyCode(value: string) {
  const code = value.toUpperCase();
  if (!/^[A-Z]{3}$/.test(code))
    throw new Error(i18n.t("errors.exchangeRates.invalidCurrency"));
  return code;
}

export function parseExchangeRates(value: unknown, base: string, now: Date): ExchangeRateSnapshot {
  const code = currencyCode(base);
  if (!isJsonObject(value) || typeof value.date !== "string" ||
      !/^\d{4}-\d{2}-\d{2}$/.test(value.date) ||
      !Number.isFinite(Date.parse(value.date)) ||
      new Date(value.date).toISOString().slice(0, 10) !== value.date ||
      value.date > now.toISOString().slice(0, 10))
    throw new Error(i18n.t("errors.exchangeRates.invalidDate"));
  const table = value[code.toLowerCase()];
  if (!isJsonObject(table))
    throw new Error(i18n.t("errors.exchangeRates.missingBase"));
  const rates: Record<string, number> = {};
  for (const [key, rate] of Object.entries(table)) {
    if (!/^[a-z]{3}$/i.test(key)) continue;
    if (typeof rate !== "number" || !Number.isFinite(rate) || rate <= 0)
      throw new Error(i18n.t("errors.exchangeRates.invalidRate"));
    rates[key.toUpperCase()] = rate;
  }
  if (rates[code] !== 1 || Object.keys(rates).length < 2)
    throw new Error(i18n.t("errors.exchangeRates.incomplete"));
  const timestamp = now.toISOString();
  return { uuid: `daily-rates:${code}:${value.date}`, source: RATE_SOURCE, base: code,
    date: value.date, rates, fetchedAt: timestamp, createdAt: timestamp, updatedAt: timestamp };
}

export function readRateSnapshot(record: JsonObject): ExchangeRateSnapshot | null {
  if (record.source !== RATE_SOURCE || typeof record.base !== "string" ||
      typeof record.fetchedAt !== "string" || !Number.isFinite(Date.parse(record.fetchedAt))) return null;
  try {
    return parseExchangeRates({ date: record.date, [record.base.toLowerCase()]: record.rates }, record.base, new Date(record.fetchedAt));
  } catch { return null; }
}

/** Currency-aware rounding retains negative balances and zero-decimal currencies. */
export function convertCurrency(amount: number, rate: number, target: string): number {
  if (!Number.isFinite(amount) || !Number.isFinite(rate) || rate <= 0)
    throw new Error(i18n.t("errors.exchangeRates.invalidConversion"));
  const digits = new Intl.NumberFormat("en", { style: "currency", currency: currencyCode(target) })
    .resolvedOptions().maximumFractionDigits ?? 2;
  const factor = 10 ** digits;
  const scaled = Math.abs(amount * rate) * factor;
  if (!Number.isFinite(scaled) || scaled > Number.MAX_SAFE_INTEGER || Math.abs(amount * rate) > Number.MAX_SAFE_INTEGER / 1000)
    throw new Error(i18n.t("errors.exchangeRates.convertedTooLarge"));
  return Math.sign(amount) * Math.round(scaled + Number.EPSILON * scaled) / factor;
}

export function storeExchangeRates(document: BackupDocument, snapshot: ExchangeRateSnapshot): BackupDocument {
  const previous = document.exchangeRates.find((record) => record.uuid === snapshot.uuid);
  const next = { ...previous, ...snapshot, createdAt: previous?.createdAt ?? snapshot.createdAt };
  return { ...document, exchangeRates: previous
    ? document.exchangeRates.map((record) => record === previous ? next : record)
    : [...document.exchangeRates, next] };
}
