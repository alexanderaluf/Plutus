import { AppAlert } from "@/shared/ui/app-alert";
import { useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { useLocalData } from "@/data/local-data-provider";
import {
  dueOccurrenceCount,
  occurrenceKey,
  skipRecurring,
} from "@/data/model/recurring-record";
import type { Recurring } from "@/data/selectors/recurring-selectors";
import { useProfiles } from "@/features/profile/profile-provider";

export type RecurringAction = "skip" | "process";

// `busy` value while every due payment is being processed together.
const ALL_DUE = "*";

/** Every unrecorded occurrence that "process all" would record right now. */
export function dueOccurrenceTotal(items: Recurring[], now = new Date()) {
  return items.reduce(
    (total, item) =>
      total + (item.due ? dueOccurrenceCount(item.record, now) : 0),
    0,
  );
}

export function useRecurringActions() {
  const {
      updateDocument,
      processRecurringPayment,
      processDueRecurringPayments,
    } = useLocalData(),
    { activeProfileId } = useProfiles(),
    { t, i18n } = useTranslation();
  // Only one occurrence is written at a time; remember which card and which
  // button started it so just that button shows progress.
  const [busy, setBusy] = useState(""),
    [busyAction, setBusyAction] = useState<RecurringAction | null>(null),
    [error, setError] = useState(""),
    working = useRef(false);
  async function perform(item: Recurring, skip: boolean) {
    if (working.current) return;
    working.current = true;
    setBusy(item.id);
    setBusyAction(skip ? "skip" : "process");
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
      setBusyAction(null);
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
  async function performAll() {
    if (working.current) return;
    working.current = true;
    setBusy(ALL_DUE);
    setError("");
    try {
      const result = await processDueRecurringPayments(activeProfileId);
      if (result.error)
        setError(
          t("recurring.processAllPartial", {
            processed: result.processed,
            failed: result.failed,
            error: result.error,
          }),
        );
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : t("recurring.error"));
    } finally {
      working.current = false;
      setBusy("");
    }
  }
  /** Asks for permission, then records every due occurrence of `items`. */
  function processAll(items: Recurring[]) {
    const count = dueOccurrenceTotal(items);
    if (!count || working.current) return;
    AppAlert.alert(
      t("recurring.processAllTitle"),
      t("recurring.processAllBody", { count }),
      [
        { text: t("recurring.cancel"), style: "cancel" },
        {
          text: t("recurring.processAllConfirm"),
          onPress: () => {
            void performAll();
          },
        },
      ],
    );
  }
  return {
    busy,
    processingAll: busy === ALL_DUE,
    processAll,
    /** The action running for `item`, or null when that card is idle. */
    actionFor: (item: Recurring) => (busy === item.id ? busyAction : null),
    error,
    skip,
    process: (item: Recurring) => {
      void perform(item, false);
    },
  };
}
