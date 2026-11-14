export const CURRENCY_SYMBOLS: Record<string, string> = {
  USD: "$",
  EUR: "€",
  GBP: "£",
  ILS: "₪",
  JPY: "¥",
};

/** Fast O(1) lookup for display currency symbols without loading the full catalog. */
export function getCurrencySymbol(code: string): string {
  const normalized = code.trim().toUpperCase();
  return CURRENCY_SYMBOLS[normalized] ?? (normalized || code);
}
