import { useTranslation } from "react-i18next";
import { View } from "react-native";

import type { ProfileReport } from "@/data/selectors/report-selectors";
import { useCurrencyFormat } from "@/shared/lib/use-currency-format";
import { useAppThemeColors } from "@/shared/theme/app-theme";
import { Text } from "@/shared/ui/app-text";

const CHART_HEIGHT = 132;
const MINIMUM_BAR = 3;

function Legend({ color, label }: { color: string; label: string }) {
  return (
    <View className="flex-row items-center gap-1.5">
      <View
        className="size-2.5 rounded-full"
        style={{ backgroundColor: color }}
      />
      <Text className="font-sans text-[11px] text-muted">{label}</Text>
    </View>
  );
}

export function TrendChartCard({ report }: { report: ProfileReport }) {
  const { t, i18n } = useTranslation();
  const theme = useAppThemeColors();
  const { formatCurrency } = useCurrencyFormat();
  const peak = Math.max(
    ...report.months.flatMap((month) => [month.income, month.expense]),
    1,
  );
  const hasActivity = report.months.some(
    (month) => month.income > 0 || month.expense > 0,
  );

  return (
    <View className="gap-4 rounded-3xl border border-border bg-surface p-5">
      <View className="flex-row items-start justify-between gap-3">
        <View className="flex-1">
          <Text className="font-manrope-bold text-lg text-foreground">
            {t("reports.trend.title")}
          </Text>
        </View>
      </View>

      <View className="flex-row gap-4">
        <Legend color={theme.success} label={t("reports.trend.income")} />
        <Legend color={theme.danger} label={t("reports.trend.expenses")} />
      </View>

      {hasActivity ? (
        <View className="flex-row items-end justify-between gap-2">
          {report.months.map((month) => {
            const label = month.start.toLocaleDateString(i18n.resolvedLanguage, {
              month: "short",
            });
            return (
              <View
                key={month.key}
                accessible
                accessibilityLabel={`${label}: ${t(
                  "reports.trend.income",
                )} ${formatCurrency(
                  month.income,
                  report.currencyCode,
                )}, ${t("reports.trend.expenses")} ${formatCurrency(
                  month.expense,
                  report.currencyCode,
                )}`}
                className="flex-1 items-center gap-2"
              >
                <View
                  className="w-full flex-row items-end justify-center gap-1"
                  style={{ height: CHART_HEIGHT }}
                >
                  <View
                    className="flex-1 rounded-t-md"
                    style={{
                      backgroundColor: theme.success,
                      height: Math.max(
                        (month.income / peak) * CHART_HEIGHT,
                        month.income > 0 ? MINIMUM_BAR : 1,
                      ),
                    }}
                  />
                  <View
                    className="flex-1 rounded-t-md"
                    style={{
                      backgroundColor: theme.danger,
                      height: Math.max(
                        (month.expense / peak) * CHART_HEIGHT,
                        month.expense > 0 ? MINIMUM_BAR : 1,
                      ),
                    }}
                  />
                </View>
                <Text
                  numberOfLines={1}
                  className="font-manrope-semibold text-[10px] text-muted"
                >
                  {label}
                </Text>
              </View>
            );
          })}
        </View>
      ) : (
        <Text className="py-6 text-center font-sans text-sm text-muted">
          {t("reports.trend.empty")}
        </Text>
      )}
    </View>
  );
}
