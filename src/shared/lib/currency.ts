import { i18n } from "@/localization/i18n";

export function formatCurrency(value: number, currency = "USD") {
  return new Intl.NumberFormat(i18n.resolvedLanguage ?? "en", {
    style: "currency",
    currency,
    minimumFractionDigits: currency === "USD" ? 2 : undefined,
  }).format(Math.abs(value));
}

export function formatSignedCurrency(value: number, currency = "USD") {
  return new Intl.NumberFormat(i18n.resolvedLanguage ?? "en", {
    style: "currency",
    currency,
    minimumFractionDigits: currency === "USD" ? 2 : undefined,
    signDisplay: "always",
  }).format(value);
}
