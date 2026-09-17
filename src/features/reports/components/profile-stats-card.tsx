import { useTranslation } from "react-i18next";
import { View } from "react-native";

import type { ProfileReport } from "@/data/selectors/report-selectors";
import { useCurrencyFormat } from "@/shared/lib/use-currency-format";
import { useAppThemeColors } from "@/shared/theme/app-theme";
import { Text } from "@/shared/ui/app-text";

function Stat({
  label,
  tone,
  value,
}: {
  label: string;
  tone?: string;
  value: string;
}) {
  // Two per row rather than three: a third of the width is not enough for a
  // formatted amount plus a translated label, and both used to clip.
  return (
    <View className="min-w-0 w-[47%] gap-1">
      <Text
        numberOfLines={2}
        className="font-sans text-[11px] leading-4 text-muted"
      >
        {label}
      </Text>
      <Text
        adjustsFontSizeToFit
        numberOfLines={1}
        className="font-manrope-bold text-base text-foreground"
        style={tone ? { color: tone } : undefined}
      >
        {value}
      </Text>
    </View>
  );
}

/** Dense facts about the period: counts and extremes, no prose. */
export function ProfileStatsCard({ report }: { report: ProfileReport }) {
  const { t } = useTranslation();
  const theme = useAppThemeColors();
  const { formatCurrency, amountsHidden } = useCurrencyFormat();
  const { activity, budgets, credit, netWorth, recurring } = report;
  const number = (value: number) => (amountsHidden ? "••" : String(value));
  const percent = (value: number) =>
    amountsHidden ? "••" : `${Math.round(value)}%`;

  return (
    <View className="gap-4 rounded-3xl border border-border bg-surface p-5">
      <Text className="font-manrope-bold text-lg text-foreground">
        {t("reports.stats.title")}
      </Text>

      <View className="flex-row flex-wrap justify-between gap-y-5">
        <Stat
          label={t("reports.stats.records")}
          value={number(activity.transactions)}
        />
        <Stat
          label={t("reports.stats.activeDays")}
          value={number(activity.activeDays)}
        />
        <Stat
          label={t("reports.stats.accounts")}
          value={number(report.accountCount)}
        />
        <Stat
          label={t("reports.stats.averageExpense")}
          value={formatCurrency(activity.averageExpense, report.currencyCode)}
        />
        <Stat
          label={
            activity.largestExpense
              ? activity.largestExpense.label
              : t("reports.stats.largest")
          }
          value={formatCurrency(
            activity.largestExpense?.amount ?? 0,
            report.currencyCode,
          )}
        />
        <Stat
          label={t("reports.stats.recurring")}
          tone={
            recurring.share != null && recurring.share >= 40
              ? theme.danger
              : undefined
          }
          value={formatCurrency(recurring.monthly, report.currencyCode)}
        />
        <Stat
          label={t("reports.stats.netWorth")}
          tone={netWorth.netWorth < 0 ? theme.danger : theme.success}
          value={formatCurrency(netWorth.netWorth, report.currencyCode)}
        />
        <Stat
          label={t("reports.stats.budgets")}
          tone={budgets.over ? theme.danger : undefined}
          value={
            budgets.total
              ? `${budgets.total - budgets.over}/${budgets.total}`
              : "—"
          }
        />
        <Stat
          label={t("reports.stats.credit")}
          tone={
            credit.utilization != null && credit.utilization > 30
              ? theme.danger
              : undefined
          }
          value={
            credit.utilization == null ? "—" : percent(credit.utilization)
          }
        />
      </View>
    </View>
  );
}
