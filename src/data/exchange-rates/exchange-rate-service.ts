import { i18n } from "@/localization/i18n";

import { currencyCode, parseExchangeRates, type ExchangeRateSnapshot } from "../model/exchange-rate";

/** Only a public currency code is sent; no balances or user records leave the device. */
export async function getExchangeRates(base: string, fetcher: typeof fetch = fetch, now = new Date()): Promise<ExchangeRateSnapshot> {
  const currency = currencyCode(base).toLowerCase();
  const sources = [
    `https://cdn.jsdelivr.net/npm/@fawazahmed0/currency-api@latest/v1/currencies/${currency}.min.json`,
    `https://latest.currency-api.pages.dev/v1/currencies/${currency}.min.json`,
  ];
  for (const url of sources) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 8000);
    try {
      const response = await fetcher(url, { signal: controller.signal });
      if (!response.ok) continue;
      return parseExchangeRates(await response.json(), base, now);
    } catch {
      // Network, timeout, and invalid payload failures all try the next source.
    } finally { clearTimeout(timeout); }
  }
  throw new Error(i18n.t("errors.exchangeRates.unavailable"));
}
