import { useMemo } from "react";

import { useLocalData } from "@/data/local-data-provider";

import {
  formatCurrency as formatCurrencyValue,
  formatSignedCurrency as formatSignedCurrencyValue,
} from "./currency";

export const AMOUNT_MASK = "••••••";

/** Reads the persisted privacy flag, so it survives restarts and profile switches. */
export function useAmountsHidden() {
  const { document } = useLocalData();
  return document._local.amountsHidden;
}

export function useAmountVisibility() {
  const { document, updateDocument } = useLocalData();
  const hidden = document._local.amountsHidden;

  return useMemo(
    () => ({
      hidden,
      async toggle() {
        await updateDocument((current) => ({
          ...current,
          _local: { ...current._local, amountsHidden: !current._local.amountsHidden },
        }));
      },
    }),
    [hidden, updateDocument],
  );
}

/**
 * Currency formatters that honour the global "hide amounts" toggle. Components
 * destructure these so every existing `formatCurrency(...)` call site keeps
 * working while gaining masking — there is no unmasked path left in the UI.
 */
export function useCurrencyFormat() {
  const hidden = useAmountsHidden();

  return useMemo(
    () => ({
      amountsHidden: hidden,
      formatCurrency: (value: number, currency = "USD") =>
        hidden ? AMOUNT_MASK : formatCurrencyValue(value, currency),
      formatSignedCurrency: (value: number, currency = "USD") =>
        hidden ? AMOUNT_MASK : formatSignedCurrencyValue(value, currency),
    }),
    [hidden],
  );
}
