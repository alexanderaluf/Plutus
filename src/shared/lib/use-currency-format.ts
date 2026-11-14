import { useMemo } from "react";

import { useLocalData } from "@/data/local-data-provider";
import { i18n } from "@/localization/i18n";
import { AppAlert } from "@/shared/ui/app-alert";
import {
  useAmountPrivacy,
  useAmountPrivacyPage,
} from "@/shared/ui/amount-privacy";

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
  const privacy = useAmountPrivacy();
  const page = useAmountPrivacyPage();

  return useMemo(
    () => ({
      hidden,
      async toggle() {
        const commit = () =>
          updateDocument((current) => ({
            ...current,
            _local: {
              ...current._local,
              amountsHidden: !current._local.amountsHidden,
            },
          }));
        try {
          if (privacy) await privacy.animate(page, !hidden, commit);
          else await commit();
        } catch {
          AppAlert.alert(i18n.t("common.saveError"));
        }
      },
    }),
    [hidden, updateDocument, privacy, page],
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
