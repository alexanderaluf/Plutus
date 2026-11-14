import type { ConsumptionFlow } from "@/data/selectors/consumption-report-selectors";
import { useAppDate } from "@/shared/lib/use-app-date";
import { useCurrencyFormat } from "@/shared/lib/use-currency-format";
import { useAppThemeColors } from "@/shared/theme/app-theme";
import { Text } from "@/shared/ui/app-text";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { Pressable, View } from "react-native";
import {
  FigureTile,
  ReportCard,
  ReportCardHeader,
  ReportPill,
  TABULAR,
} from "./report-primitives";

const BAR_AREA = 96;
const AXIS_STEP = 7;

export function DailyActivityCard({ flow }: { flow: ConsumptionFlow }) {
  const { t, i18n } = useTranslation();
  const { formatDayMonth } = useAppDate();
  const { formatCurrency } = useCurrencyFormat();
  const theme = useAppThemeColors();
  const [selectedDay, setSelectedDay] = useState<string | null>(null);
  const money = (value: number) => formatCurrency(value, flow.currencyCode);
  const day = flow.days.find((item) => item.key === selectedDay);
  const max = Math.max(1, ...flow.days.map((item) => item.amount));
  const lastIndex = flow.days.length - 1;
  const largest = flow.largestExpense;
  // Weekday stays localized text; the date itself follows the user's format.
  const dayLabel = (date: Date) =>
    `${date.toLocaleDateString(i18n.resolvedLanguage, { weekday: "long" })}, ${formatDayMonth(date)}`;

  return (
    <ReportCard>
      <ReportCardHeader
        icon="clock"
        title={t("reports.overview.dailySpending")}
        trailing={<ReportPill label={flow.currencyCode} />}
      />
      {flow.expenseCount === 0 ? (
        <Text className="font-sans text-[13px] leading-[19px] text-muted">
          {t("reports.overview.noSpending")}
        </Text>
      ) : (
        <>
          <View className="gap-0.5" accessibilityLiveRegion="polite">
            <Text className="font-sans text-[12px] leading-[16px] text-muted">
              {day ? dayLabel(day.date) : t("reports.chart.dailyAverage")}
            </Text>
            <Text
              adjustsFontSizeToFit
              minimumFontScale={0.7}
              numberOfLines={1}
              selectable
              className="font-manrope-bold text-[26px] leading-[32px] tracking-[-0.4px] text-foreground"
              style={TABULAR}
            >
              {money(day?.amount ?? flow.dailyAverage)}
            </Text>
          </View>

          <View className="gap-2">
            {/* Columns touch each other so every tap inside the chart lands on a day. */}
            <View style={{ flexDirection: "row", direction: "ltr" }}>
              {flow.days.map((item, index) => {
                const isSelected = item.key === selectedDay;
                const showAxisLabel =
                  index === lastIndex ||
                  (index % AXIS_STEP === 0 && lastIndex - index >= 3);
                return (
                  <Pressable
                    key={item.key}
                    disabled={!item.elapsed}
                    onPress={() => setSelectedDay(isSelected ? null : item.key)}
                    accessibilityRole="button"
                    accessibilityState={{
                      selected: isSelected,
                      disabled: !item.elapsed,
                    }}
                    accessibilityLabel={`${dayLabel(item.date)}, ${item.elapsed ? money(item.amount) : t("reports.overview.future")}`}
                    style={{
                      flex: 1,
                      minHeight: BAR_AREA + 28,
                      justifyContent: "flex-end",
                      alignItems: "center",
                      gap: 8,
                    }}
                  >
                    <View
                      style={{
                        alignSelf: "stretch",
                        marginHorizontal: 1.5,
                        height: Math.max(3, (item.amount / max) * BAR_AREA),
                        borderRadius: 4,
                        backgroundColor: item.amount
                          ? isSelected
                            ? theme.foreground
                            : theme.accent
                          : theme.surfaceTertiary,
                        opacity: !item.elapsed
                          ? 0.35
                          : day && !isSelected
                            ? 0.4
                            : 1,
                      }}
                    />
                    <Text
                      numberOfLines={1}
                      className="font-sans text-[10px] text-muted"
                      style={[{ width: 24, textAlign: "center" }, TABULAR]}
                    >
                      {showAxisLabel ? item.date.getDate() : " "}
                    </Text>
                  </Pressable>
                );
              })}
            </View>
            <Text className="text-center font-sans text-[12px] leading-[16px] text-muted">
              {t(
                day
                  ? "reports.overview.dayHintSelected"
                  : "reports.overview.dayHint",
              )}
            </Text>
          </View>

          <View className="flex-row gap-2.5">
            <FigureTile
              label={t("reports.stats.averageExpense")}
              value={money(flow.averageExpense)}
            />
            <FigureTile
              label={t("reports.stats.activeDays")}
              value={String(flow.days.filter((item) => item.amount > 0).length)}
            />
          </View>

          {largest ? (
            <View className="flex-row items-center gap-3 border-t border-border/70 pt-3">
              <View className="min-w-0 flex-1 gap-0.5">
                <Text className="font-sans text-[12px] leading-[16px] text-muted">
                  {t("reports.stats.largest")}
                </Text>
                <Text
                  numberOfLines={1}
                  className="font-manrope-semibold text-[14px] leading-[19px] text-foreground"
                >
                  {largest.name}
                </Text>
                <Text
                  numberOfLines={1}
                  className="font-sans text-[12px] leading-[16px] text-muted"
                >
                  {formatDayMonth(largest.date)} · {largest.account}
                </Text>
              </View>
              <Text
                adjustsFontSizeToFit
                minimumFontScale={0.78}
                numberOfLines={1}
                selectable
                className="max-w-[42%] shrink-0 text-right font-manrope-bold text-[15px] leading-[20px] text-foreground"
                style={TABULAR}
              >
                {money(largest.amount)}
              </Text>
            </View>
          ) : null}
        </>
      )}
    </ReportCard>
  );
}
