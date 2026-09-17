import { useMemo } from "react";

import { useLocalData } from "@/data/local-data-provider";
import { formatAppDate } from "@/data/model/onboarding";
import { i18n } from "@/localization/i18n";

/**
 * Every specific calendar date in the UI renders through this so it follows the
 * format chosen during onboarding (and editable per profile). Month-only and
 * weekday-only labels stay localized text — a `DD/MM/YYYY` pattern cannot
 * express them.
 */
/**
 * Drops the year from the chosen pattern for space-constrained labels (chart
 * axes, range chips) while keeping the user's day/month ordering and separator.
 */
function dayMonthPattern(format: string) {
  return format.replace(/[^A-Za-z]?Y+/g, "").replace(/^[^A-Za-z]+/, "");
}

export function useAppDate() {
  const { document } = useLocalData();
  const dateFormat = document._local.dateFormat;

  return useMemo(
    () => ({
      dateFormat,
      formatDate: (date: Date) => formatAppDate(date, dateFormat),
      formatDayMonth: (date: Date) =>
        formatAppDate(date, dayMonthPattern(dateFormat) as typeof dateFormat),
      formatDateRange: (start: Date, end: Date) =>
        `${formatAppDate(start, dateFormat)} – ${formatAppDate(end, dateFormat)}`,
      formatDateTime: (date: Date) =>
        `${formatAppDate(date, dateFormat)} ${date.toLocaleTimeString(
          i18n.resolvedLanguage,
          { timeStyle: "short" },
        )}`,
    }),
    [dateFormat],
  );
}
