import { useState } from "react";
import { useTranslation } from "react-i18next";
import { Pressable, View } from "react-native";
import type { ConsumptionFlow } from "@/data/selectors/consumption-report-selectors";
import { useAppDate } from "@/shared/lib/use-app-date";
import { useCurrencyFormat } from "@/shared/lib/use-currency-format";
import { useAppThemeColors } from "@/shared/theme/app-theme";
import { Text } from "@/shared/ui/app-text";
import { ReportHeading, ReportMetric, ReportPanel } from "./report-primitives";

export function DailyActivityCard({ flow }: { flow: ConsumptionFlow }) {
  const { t } = useTranslation();
  const { formatDayMonth } = useAppDate();
  const { formatCurrency } = useCurrencyFormat();
  const theme = useAppThemeColors();
  const [selectedDay, setSelectedDay] = useState<string | null>(null);
  const day = flow.days.find((item) => item.key === selectedDay);
  const max = Math.max(1, ...flow.days.map((item) => item.amount));
  return (
    <ReportPanel>
      <ReportHeading icon="clock" title={t("reports.overview.dailySpending")} />
      <View
        className="flex-row items-center justify-between gap-3"
        accessibilityLiveRegion="polite"
      >
        <Text className="font-sans text-xs text-muted">
          {day ? formatDayMonth(day.date) : t("reports.chart.dailyAverage")}
        </Text>
        <Text selectable className="font-manrope-bold text-lg text-foreground">
          {formatCurrency(day?.amount ?? flow.dailyAverage, flow.currencyCode)}
        </Text>
      </View>
      <View style={{ flexDirection: "row", gap: 3, direction: "ltr" }}>
        {flow.days.map((item, index) => (
          <Pressable
            key={item.key}
            disabled={!item.elapsed}
            onPress={() =>
              setSelectedDay(selectedDay === item.key ? null : item.key)
            }
            accessibilityRole="button"
            accessibilityState={{
              selected: item.key === selectedDay,
              disabled: !item.elapsed,
            }}
            accessibilityLabel={`${formatDayMonth(item.date)}, ${item.elapsed ? formatCurrency(item.amount, flow.currencyCode) : t("reports.overview.future")}`}
            style={{
              flex: 1,
              minHeight: 125,
              justifyContent: "flex-end",
              alignItems: "center",
              gap: 8,
            }}
          >
            <View
              style={{
                width: "100%",
                height: Math.max(3, (item.amount / max) * 96),
                borderRadius: 4,
                backgroundColor: item.amount
                  ? item.key === selectedDay
                    ? theme.foreground
                    : theme.accent
                  : theme.surfaceTertiary,
                opacity: item.elapsed ? 1 : 0.35,
              }}
            />
            <Text
              numberOfLines={1}
              className="font-sans text-[10px] text-muted"
              style={{ width: 24, textAlign: "center" }}
            >
              {index % 7 === 0 || index === flow.days.length - 1
                ? item.date.getDate()
                : " "}
            </Text>
          </Pressable>
        ))}
      </View>
      <View className="flex-row flex-wrap gap-3">
        <ReportMetric
          icon="cash"
          label={t("reports.stats.averageExpense")}
          value={formatCurrency(flow.averageExpense, flow.currencyCode)}
        />
        <ReportMetric
          icon="clock"
          label={t("reports.stats.activeDays")}
          value={String(flow.days.filter((item) => item.amount > 0).length)}
        />
      </View>
    </ReportPanel>
  );
}
