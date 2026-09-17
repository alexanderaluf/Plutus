import { i18n } from "@/localization/i18n";

type CurrencyDisplay = { format: Intl.NumberFormat; suffix: string };

// Bounded cache of formatters, not user data. Constructing Intl formatters for
// every amount in every virtualized row is expensive on Hermes/iOS.
const displays = new Map<string, CurrencyDisplay>();

/**
 * The app always trails the currency symbol (`24,312.33$`, `-24,312.33$`) in
 * every language, so the number is formatted on its own and the locale's symbol
 * is appended rather than letting Intl place it.
 */
function currencyDisplay(currency: string, signed: boolean) {
  const language = i18n.resolvedLanguage ?? "en";
  const key = `${language}:${currency}:${signed}`;
  const cached = displays.get(key);
  if (cached) return cached;

  const reference = new Intl.NumberFormat(language, {
    style: "currency",
    currency,
  });
  const symbol =
    reference.formatToParts(0).find((part) => part.type === "currency")
      ?.value ?? currency;
  const { minimumFractionDigits, maximumFractionDigits } =
    reference.resolvedOptions();
  const format = new Intl.NumberFormat(language, {
    minimumFractionDigits,
    maximumFractionDigits,
    ...(signed ? { signDisplay: "always" as const } : {}),
  });
  // Letter codes ("AED", "CHF") need separation to stay readable; glyphs such as
  // "$" or "₪" read better tight against the amount.
  const display: CurrencyDisplay = {
    format,
    suffix: /\p{L}/u.test(symbol) ? ` ${symbol}` : symbol,
  };

  if (displays.size >= 48) displays.delete(displays.keys().next().value!);
  displays.set(key, display);
  return display;
}

export function formatCurrency(value: number, currency = "USD") {
  const { format, suffix } = currencyDisplay(currency, false);
  return `${format.format(Math.abs(value))}${suffix}`;
}

export function formatSignedCurrency(value: number, currency = "USD") {
  const { format, suffix } = currencyDisplay(currency, true);
  return `${format.format(value)}${suffix}`;
}
