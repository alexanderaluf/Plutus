import { useTranslation } from "react-i18next";
import { View } from "react-native";

import type { ProfileReport } from "@/data/selectors/report-selectors";
import { useCurrencyFormat } from "@/shared/lib/use-currency-format";
import { useAppThemeColors } from "@/shared/theme/app-theme";
import { Text } from "@/shared/ui/app-text";

function Figure({
  label,
  tone,
  value,
}: {
  label: string;
  tone?: string;
  value: string;
}) {
  // A label/value row rather than a column: the three pace labels are full
  // phrases in every language and wrapped badly at a third of the card.
  return (
    <View className="flex-row items-center justify-between gap-4">
      <Text className="min-w-0 flex-1 font-sans text-[13px] text-muted">
        {label}
      </Text>
      <Text
        numberOfLines={1}
        className="shrink-0 font-manrope-bold text-base text-foreground"
        style={tone ? { color: tone } : undefined}
      >
        {value}
      </Text>
    </View>
  );
}

export function SpendingPaceCard({ report }: { report: ProfileReport }) {
  const { t } = useTranslation();
  const theme = useAppThemeColors();
  const { formatCurrency } = useCurrencyFormat();
  const previousExpense = report.previous?.expense ?? 0;
  // Only call the pace "hot" once there is a prior month to compare against.
  const overPace =
    previousExpense > 0 && report.projectedExpense > previousExpense * 1.15;
  const elapsed = Math.round(report.progress * 100);

  return (
    <View className="gap-4 rounded-3xl border border-border bg-surface p-5">
      <View>
        <Text className="font-manrope-bold text-lg text-foreground">
          {t("reports.pace.title")}
        </Text>
      </View>

      <View className="gap-2">
        <View className="h-2.5 overflow-hidden rounded-full bg-surface-tertiary">
          <View
            className="h-full rounded-full"
            style={{
              width: `${Math.min(elapsed, 100)}%`,
              backgroundColor: overPace ? theme.danger : theme.accent,
            }}
          />
        </View>
        <Text className="font-sans text-[11px] text-muted">
          {t("reports.pace.elapsed", { percent: elapsed })}
        </Text>
      </View>

      <View className="gap-3 border-t border-border pt-4">
        <Figure
          label={t("reports.pace.spent")}
          value={formatCurrency(report.current.expense, report.currencyCode)}
        />
        <Figure
          label={t("reports.pace.projected")}
          tone={overPace ? theme.danger : undefined}
          value={formatCurrency(report.projectedExpense, report.currencyCode)}
        />
        <Figure
          label={t("reports.pace.previous")}
          value={formatCurrency(previousExpense, report.currencyCode)}
        />
      </View>

    </View>
  );
}
