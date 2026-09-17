import { i18n } from "@/localization/i18n";

// Bounded cache of formatters, not user data. Constructing Intl formatters for
// every amount in every virtualized row is expensive on Hermes/iOS.
const formatters = new Map<string, Intl.NumberFormat>();
function currencyFormatter(currency: string, signed: boolean) {
  const language = i18n.resolvedLanguage ?? "en";
  const key = `${language}:${currency}:${signed}`;
  const cached = formatters.get(key);
  if (cached) return cached;
  const formatter = new Intl.NumberFormat(language, {
    style: "currency",
    currency,
    minimumFractionDigits: currency === "USD" ? 2 : undefined,
    ...(signed ? { signDisplay: "always" as const } : {}),
  });
  if (formatters.size >= 48) formatters.delete(formatters.keys().next().value!);
  formatters.set(key, formatter);
  return formatter;
}

export function formatCurrency(value: number, currency = "USD") {
  return currencyFormatter(currency, false).format(Math.abs(value));
}

export function formatSignedCurrency(value: number, currency = "USD") {
  return currencyFormatter(currency, true).format(value);
}
