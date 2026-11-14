import type { ConsumptionFlow } from "@/data/selectors/consumption-report-selectors";
import { useCurrencyFormat } from "@/shared/lib/use-currency-format";
import { useAppThemeColors } from "@/shared/theme/app-theme";
import { Text } from "@/shared/ui/app-text";
import { useTranslation } from "react-i18next";
import { View } from "react-native";
import {
  FigureTile,
  RatioBar,
  ReportCard,
  ReportCardHeader,
  ReportPill,
  TABULAR,
} from "./report-primitives";

/** What came in, what went out and what is left, in that reading order. */
export function CashFlowCard({ flow }: { flow: ConsumptionFlow }) {
  const { t, i18n } = useTranslation();
  const theme = useAppThemeColors();
  const { formatCurrency, amountsHidden } = useCurrencyFormat();
  const money = (value: number) => formatCurrency(value, flow.currencyCode);
  const isNegative = !amountsHidden && flow.net < 0;
  const spentPercent =
    flow.spentIncomePercent === null
      ? null
      : amountsHidden
        ? "••"
        : new Intl.NumberFormat(i18n.resolvedLanguage, {
            style: "percent",
            maximumFractionDigits: 1,
          }).format(flow.spentIncomePercent / 100);
  const footnote =
    spentPercent !== null
      ? t("reports.overview.incomeSpentSentence", { percent: spentPercent })
      : flow.expense > 0
        ? t("reports.overview.noIncome")
        : null;

  return (
    <ReportCard>
      <ReportCardHeader
        icon="swap-horizontal"
        title={t("reports.overview.cashFlow")}
        trailing={<ReportPill label={flow.currencyCode} />}
      />
      <View className="gap-2.5">
        <View className="gap-0.5">
          <Text
            adjustsFontSizeToFit
            minimumFontScale={0.68}
            numberOfLines={1}
            selectable={!amountsHidden}
            className={`font-manrope-bold text-[34px] leading-[40px] tracking-[-0.6px] ${
              isNegative ? "text-danger" : "text-foreground"
            }`}
            style={TABULAR}
          >
            {isNegative ? "−" : ""}
            {money(flow.net)}
          </Text>
          <Text className="font-sans text-[12px] leading-[16px] text-muted">
            {t("reports.overview.netCaption")}
          </Text>
        </View>
        {amountsHidden ? null : (
          <RatioBar primary={flow.income} secondary={flow.expense} />
        )}
      </View>
      <View className="flex-row gap-2.5">
        <FigureTile
          dotColor={theme.success}
          label={t("reports.kpi.income")}
          value={money(flow.income)}
          toneClass="text-success"
        />
        <FigureTile
          dotColor={theme.danger}
          label={t("reports.overview.expenses")}
          value={money(flow.expense)}
          toneClass="text-danger"
        />
      </View>
      {footnote ? (
        <View className="border-t border-border/70 pt-3">
          <Text className="font-sans text-[12px] leading-[17px] text-muted">
            {footnote}
          </Text>
        </View>
      ) : null}
    </ReportCard>
  );
}
