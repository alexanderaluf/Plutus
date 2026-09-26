import { BUDGET_PERIODS, type BudgetPeriod } from "@/data/model/budget-record";
import { RECURRING_PERIODS, type RecurringPeriod } from "@/data/model/recurring-record";
import type { AccountType } from "@/data/model/account-record";

import type { ChangeFieldValue, ChangeFields } from "./change-types";

/** Reads the first present key; the model uses several spellings. */
export function field(fields: ChangeFields, ...keys: string[]): ChangeFieldValue | undefined {
  for (const key of keys) if (fields[key] !== undefined) return fields[key];
  return undefined;
}

export function fieldText(fields: ChangeFields, ...keys: string[]) {
  const value = field(fields, ...keys);
  if (typeof value === "string") return value.trim();
  if (typeof value === "number") return String(value);
  return undefined;
}

/** "1,234.50", "340 ILS", 304 → number; ambiguous text → undefined. */
export function parseAmount(value: ChangeFieldValue | undefined) {
  if (typeof value === "number") return Number.isFinite(value) ? Math.abs(value) : undefined;
  if (typeof value !== "string") return undefined;
  const cleaned = value.replace(/[^\d.,-]/g, "");
  if (!cleaned) return undefined;
  // "1,234.50" uses a thousands comma; "12,5" uses a decimal comma.
  const normalized = /,\d{3}(\D|$)/.test(cleaned) && cleaned.includes(".")
    ? cleaned.replace(/,/g, "")
    : /^\d+,\d{1,2}$/.test(cleaned)
      ? cleaned.replace(",", ".")
      : cleaned.replace(/,/g, "");
  const amount = Number(normalized);
  return Number.isFinite(amount) ? Math.abs(amount) : undefined;
}

export function parseBoolean(value: ChangeFieldValue | undefined) {
  if (typeof value === "boolean") return value;
  if (typeof value === "string") {
    if (/^(true|yes|on|1)$/i.test(value)) return true;
    if (/^(false|no|off|0)$/i.test(value)) return false;
  }
  if (typeof value === "number") return value !== 0;
  return undefined;
}

export function parseTransactionType(value: ChangeFieldValue | undefined): 0 | 1 | 2 | undefined {
  if (value === 0 || value === 1 || value === 2) return value;
  if (typeof value !== "string") return undefined;
  const text = value.toLowerCase();
  if (/^(0|expense|spend|spending|payment|debit|הוצאה|расход)/.test(text)) return 0;
  if (/^(1|income|earning|salary|credit|הכנסה|доход)/.test(text)) return 1;
  if (/^(2|transfer|move|העברה|перевод)/.test(text)) return 2;
  return undefined;
}

const PERIOD_ALIASES: Record<string, string> = {
  day: "Daily",
  daily: "Daily",
  week: "Weekly",
  weekly: "Weekly",
  fortnight: "Fortnightly",
  fortnightly: "Fortnightly",
  biweekly: "Fortnightly",
  month: "Monthly",
  monthly: "Monthly",
  quarter: "Quarterly",
  quarterly: "Quarterly",
  biannual: "Biannually",
  biannually: "Biannually",
  semiannual: "Biannually",
  year: "Yearly",
  yearly: "Yearly",
  annual: "Yearly",
  annually: "Yearly",
  custom: "Custom",
};

function period(value: ChangeFieldValue | undefined) {
  if (typeof value !== "string") return undefined;
  return PERIOD_ALIASES[value.toLowerCase().replace(/[^a-z]/g, "")];
}

export function parseBudgetPeriod(value: ChangeFieldValue | undefined): BudgetPeriod | undefined {
  const found = period(value);
  return BUDGET_PERIODS.find((item) => item === found);
}

export function parseRecurringPeriod(value: ChangeFieldValue | undefined): RecurringPeriod | undefined {
  const found = period(value);
  return RECURRING_PERIODS.find((item) => item === found);
}

export function parseAccountType(value: ChangeFieldValue | undefined): AccountType | undefined {
  if (typeof value !== "string") return undefined;
  const text = value.toLowerCase();
  if (/card|credit|visa|mastercard|amex/.test(text)) return "card";
  if (/saving|deposit|pension|invest|fund/.test(text)) return "savings";
  if (/cash|wallet/.test(text)) return "cash";
  if (/bank|checking|current|account/.test(text)) return "bank";
  return undefined;
}

export function parseCurrency(value: ChangeFieldValue | undefined) {
  if (typeof value !== "string") return undefined;
  const aliases: Record<string, string> = {
    "₪": "ILS",
    nis: "ILS",
    shekel: "ILS",
    shekels: "ILS",
    "$": "USD",
    dollar: "USD",
    dollars: "USD",
    "€": "EUR",
    euro: "EUR",
    euros: "EUR",
    "£": "GBP",
    "₽": "RUB",
  };
  const code = aliases[value.trim().toLowerCase()] ?? value.trim().toUpperCase();
  return /^[A-Z]{3}$/.test(code) ? code : undefined;
}

function pad(value: number) {
  return String(value).padStart(2, "0");
}

export function localDay(date: Date) {
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

/**
 * "today", "yesterday", "2026-09-25", "2026-09-25T14:30" or an ISO string.
 * A plain past day is stored at noon so time zones never shift the date.
 */
export function parseWhen(value: ChangeFieldValue | undefined, now: Date): Date | undefined {
  if (typeof value !== "string" || !value.trim()) return undefined;
  const text = value.trim().toLowerCase();
  if (/^(now|today|היום|сегодня)$/.test(text)) return new Date(now);
  if (/^(yesterday|אתמול|вчера)$/.test(text))
    return new Date(now.getFullYear(), now.getMonth(), now.getDate() - 1, 12);
  if (/^(tomorrow|מחר|завтра)$/.test(text))
    return new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1, 12);
  const day = text.match(/^(\d{4})-(\d{1,2})-(\d{1,2})$/);
  if (day) {
    const date = new Date(Number(day[1]), Number(day[2]) - 1, Number(day[3]), 12);
    if (localDay(date) === localDay(now)) return new Date(now);
    return Number.isFinite(date.getTime()) ? date : undefined;
  }
  const local = text.match(/^(\d{4})-(\d{1,2})-(\d{1,2})[t ](\d{1,2}):(\d{2})$/);
  if (local)
    return new Date(
      Number(local[1]),
      Number(local[2]) - 1,
      Number(local[3]),
      Number(local[4]),
      Number(local[5]),
    );
  const parsed = new Date(value);
  return Number.isFinite(parsed.getTime()) ? parsed : undefined;
}

/** A list of names/ids from a string ("Food, Coffee") or an array. */
export function parseList(value: ChangeFieldValue | undefined) {
  if (Array.isArray(value)) return value.map((item) => item.trim()).filter(Boolean);
  if (typeof value === "string")
    return value
      .split(/[,;]/)
      .map((item) => item.trim())
      .filter(Boolean);
  return [];
}
