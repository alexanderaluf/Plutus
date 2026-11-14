import { memo } from "react";
import { useTranslation } from "react-i18next";
import { View } from "react-native";

import { useAppDate } from "@/shared/lib/use-app-date";
import { Text } from "@/shared/ui/app-text";

function startOfDay(date: Date) {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate());
}

/** Labels one day's group: Today, Yesterday, or the weekday and date. */
export const TransactionDateHeader = memo(function TransactionDateHeader({
  timestamp,
  now,
  isFirst,
}: {
  timestamp: number | null;
  now: Date;
  isFirst: boolean;
}) {
  const { t, i18n } = useTranslation();
  const { formatDayMonth } = useAppDate();
  let label: string = t("common.unknownDate");
  if (timestamp !== null) {
    const date = new Date(timestamp);
    // Calendar-day difference in local time, safe across daylight saving.
    const days = Math.round(
      (startOfDay(now).getTime() - startOfDay(date).getTime()) / 86_400_000,
    );
    label =
      days === 0
        ? t("home.dateGroups.today")
        : days === 1
          ? t("home.dateGroups.yesterday")
          : `${date.toLocaleDateString(i18n.resolvedLanguage, {
              weekday: "long",
            })}, ${formatDayMonth(date)}`;
  }

  return (
    <View className={`px-1 pb-2 ${isFirst ? "" : "pt-5"}`}>
      <Text
        accessibilityRole="header"
        numberOfLines={1}
        className="font-manrope-semibold text-[13px] leading-[18px] text-muted"
      >
        {label}
      </Text>
    </View>
  );
});
