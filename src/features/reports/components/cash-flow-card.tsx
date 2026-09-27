import { useTranslation } from "react-i18next";
import { View } from "react-native";
import type { ConsumptionFlow } from "@/data/selectors/consumption-report-selectors";
import { useCurrencyFormat } from "@/shared/lib/use-currency-format";
import { Text } from "@/shared/ui/app-text";
import { ReportHeading, ReportMetric, ReportPanel } from "./report-primitives";

export function CashFlowCard({ flow }: { flow: ConsumptionFlow }) {
  const { t, i18n } = useTranslation();
  const { formatCurrency, amountsHidden } = useCurrencyFormat();
  const money = (value: number) => formatCurrency(value, flow.currencyCode);
  const spent =
    flow.spentIncomePercent === null
      ? "—"
      : amountsHidden
        ? "••"
        : new Intl.NumberFormat(i18n.resolvedLanguage, {
            style: "percent",
            maximumFractionDigits: 1,
          }).format(flow.spentIncomePercent / 100);
  return (
    <ReportPanel>
      <ReportHeading
        icon="swap-horizontal"
        title={t("reports.overview.cashFlow")}
      />
      <View className="flex-row flex-wrap gap-3">
        <ReportMetric
          icon="arrow-bottom-left"
          label={t("reports.kpi.income")}
          value={money(flow.income)}
          tone="success"
        />
        <ReportMetric
          icon="arrow-top-right"
          label={t("reports.overview.expenses")}
          value={money(flow.expense)}
        />
        <ReportMetric
          icon="wallet"
          label={t("reports.overview.netFlow")}
          value={money(flow.net)}
          tone={flow.net < 0 ? "danger" : "foreground"}
        />
        <ReportMetric
          icon="chart-donut-variant"
          label={t("reports.overview.incomeSpent")}
          value={spent}
        />
      </View>
      {flow.largestExpense ? (
        <View className="flex-row items-center justify-between gap-4 border-t border-border pt-4">
          <View className="flex-1 gap-1">
            <Text className="font-sans text-xs text-muted">
              {t("reports.stats.largest")}
            </Text>
            <Text className="font-manrope-semibold text-sm text-foreground">
              {flow.largestExpense.name}
            </Text>
          </View>
          <Text
            selectable
            className="font-manrope-bold text-base text-foreground"
          >
            {money(flow.largestExpense.amount)}
          </Text>
        </View>
      ) : null}
    </ReportPanel>
  );
}
