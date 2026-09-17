import { useTranslation } from "react-i18next";
import { View } from "react-native";

import type {
  ProfileReport,
  ReportInsight,
  ReportSeverity,
} from "@/data/selectors/report-selectors";
import { useCurrencyFormat } from "@/shared/lib/use-currency-format";
import { colorWithAlpha, useAppThemeColors } from "@/shared/theme/app-theme";
import { Text } from "@/shared/ui/app-text";
import { FilledIcon, type FilledIconName } from "@/shared/ui/filled-icon";

const SEVERITY_ICON: Record<ReportSeverity, FilledIconName> = {
  critical: "trending-down",
  warning: "bell",
  good: "check",
};

/** Money values arrive raw so they can be masked and formatted per locale. */
const MONEY_KEYS = new Set(["gap", "projected", "amount"]);

export function InsightsCard({ report }: { report: ProfileReport }) {
  const { t } = useTranslation();
  const theme = useAppThemeColors();
  const { formatCurrency } = useCurrencyFormat();
  // Each insight carries its own interpolation values, so the key and the
  // placeholders are only known at runtime; i18next's static key typing cannot
  // pair them up. The keys themselves are still constrained by ReportInsightId.
  const translate = t as unknown as (
    key: string,
    values?: Record<string, string | number>,
  ) => string;

  const severityColor = (severity: ReportSeverity) =>
    severity === "critical"
      ? theme.danger
      : severity === "warning"
        ? theme.accent
        : theme.success;

  const valuesFor = (insight: ReportInsight) =>
    Object.fromEntries(
      Object.entries(insight.values ?? {}).map(([key, value]) => [
        key,
        MONEY_KEYS.has(key) && typeof value === "number"
          ? formatCurrency(value, report.currencyCode)
          : value,
      ]),
    );

  return (
    <View className="gap-4 rounded-3xl border border-border bg-surface p-5">
      <View>
        <Text className="font-manrope-bold text-lg text-foreground">
          {t("reports.insights.title")}
        </Text>
      </View>

      <View className="gap-3">
        {report.insights.map((insight) => {
          const tone = severityColor(insight.severity);
          const values = valuesFor(insight);
          return (
            <View
              key={insight.id}
              className="gap-2 rounded-2xl p-4"
              style={{
                backgroundColor: colorWithAlpha(tone, 0.08),
                borderColor: colorWithAlpha(tone, 0.28),
                borderWidth: 1,
              }}
            >
              <View className="flex-row items-start gap-2.5">
                <View
                  className="size-6 items-center justify-center rounded-full"
                  style={{ backgroundColor: colorWithAlpha(tone, 0.18) }}
                >
                  <FilledIcon
                    name={SEVERITY_ICON[insight.severity]}
                    size={14}
                    color={tone}
                  />
                </View>
                <Text className="flex-1 font-manrope-bold text-sm text-foreground">
                  {translate(`reports.insights.${insight.id}.title`, values)}
                </Text>
              </View>
              <Text className="font-sans text-xs leading-5 text-muted">
                {translate(
                  `reports.insights.${insight.id}.recommendation`,
                  values,
                )}
              </Text>
            </View>
          );
        })}
      </View>
    </View>
  );
}
