import { AppAlert } from "@/shared/ui/app-alert";
import { useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { useLocalData } from "@/data/local-data-provider";
import { occurrenceKey, skipRecurring } from "@/data/model/recurring-record";
import type { Recurring } from "@/data/selectors/recurring-selectors";
import { useProfiles } from "@/features/profile/profile-provider";

export function useRecurringActions() {
  const { updateDocument, processRecurringPayment } = useLocalData(),
    { activeProfileId } = useProfiles(),
    { t, i18n } = useTranslation();
  const [busy, setBusy] = useState(""),
    [error, setError] = useState(""),
    working = useRef(false);
  async function perform(item: Recurring, skip: boolean) {
    if (working.current) return;
    working.current = true;
    setBusy(item.id);
    setError("");
    try {
      if (skip)
        await updateDocument((current) =>
          skipRecurring(
            current,
            item.id,
            occurrenceKey(item.record),
            activeProfileId,
            new Date().toISOString(),
          ),
        );
      else
        await processRecurringPayment(
          item.id,
          occurrenceKey(item.record),
          activeProfileId,
        );
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : t("recurring.error"));
    } finally {
      working.current = false;
      setBusy("");
    }
  }
  function skip(item: Recurring) {
    AppAlert.alert(
      t("recurring.skipTitle"),
      t("recurring.skipBody", {
        date: item.next?.toLocaleString(i18n.resolvedLanguage),
      }),
      [
        { text: t("recurring.cancel"), style: "cancel" },
        {
          text: t("recurring.skipConfirm"),
          onPress: () => {
            void perform(item, true);
          },
        },
      ],
    );
  }
  return {
    busy,
    error,
    skip,
    process: (item: Recurring) => {
      void perform(item, false);
    },
  };
}
