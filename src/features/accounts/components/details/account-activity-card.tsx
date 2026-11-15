import { useTranslation } from "react-i18next";
import { View } from "react-native";

import type { AccountActivityTotal } from "@/data/selectors/document-selectors";
import {
  CONTINUOUS,
  FigureTile,
  RatioBar,
  TABULAR,
} from "@/features/reports/components/report-primitives";
import { useCurrencyFormat } from "@/shared/lib/use-currency-format";
import { useAppThemeColors } from "@/shared/theme/app-theme";
import { Text } from "@/shared/ui/app-text";
import { FilledIcon } from "@/shared/ui/filled-icon";

export type SpendingComparison = {
  /** Signed change of spending against the comparable earlier window. */
  percent: number;
  /** The period is still running, so it is compared at the same point. */
  soFar: boolean;
};

/**
 * The selected period in one glance: the net result first, then what came in
 * and went out, then how spending compares with the period before.
 */
export function AccountActivityCard({
  primary,
  others,
  comparison,
}: {
  primary: AccountActivityTotal;
  others: AccountActivityTotal[];
  comparison: SpendingComparison | null;
}) {
  const { t } = useTranslation();
  const theme = useAppThemeColors();
  const { amountsHidden, formatCurrency, formatSignedCurrency } =
    useCurrencyFormat();
  const net = primary.income - primary.expense;
  const netColor =
    amountsHidden || net === 0
      ? theme.foreground
      : net > 0
        ? theme.success
        : theme.danger;

  let compareText = "";
  let compareTone = theme.muted;
  let compareIcon: "trending-down" | "trending-up" | "check" = "check";
  if (comparison && !amountsHidden) {
    const magnitude = Math.abs(comparison.percent);
    if (magnitude < 1) {
      compareText = t("accounts.details.compare.same");
    } else {
      const lower = comparison.percent < 0;
      const percent = magnitude > 999 ? "999+" : String(Math.round(magnitude));
      compareText = lower
        ? comparison.soFar
          ? t("accounts.details.compare.lessSoFar", { percent })
          : t("accounts.details.compare.less", { percent })
        : comparison.soFar
          ? t("accounts.details.compare.moreSoFar", { percent })
          : t("accounts.details.compare.more", { percent });
      compareTone = lower ? theme.success : theme.danger;
      compareIcon = lower ? "trending-down" : "trending-up";
    }
  }

  return (
    <View
      className="gap-4 overflow-hidden rounded-[28px] border border-border bg-surface p-5"
      style={CONTINUOUS}
    >
      <View className="gap-0.5">
        <Text
          accessibilityRole="header"
          numberOfLines={1}
          className="font-manrope-semibold text-[13px] leading-[18px] text-muted"
        >
          {t("accounts.details.netChange")}
        </Text>
        <Text
          adjustsFontSizeToFit
          minimumFontScale={0.65}
          numberOfLines={1}
          selectable={!amountsHidden}
          className="font-manrope-bold text-[32px] leading-[40px] tracking-[-0.6px]"
          style={{ ...TABULAR, color: netColor }}
        >
          {net === 0
            ? formatCurrency(0, primary.currencyCode)
            : formatSignedCurrency(net, primary.currencyCode)}
        </Text>
      </View>

      <RatioBar primary={primary.income} secondary={primary.expense} />

      <View className="flex-row gap-2.5">
        <FigureTile
          dotColor={theme.success}
          label={t("accounts.details.moneyIn")}
          value={formatCurrency(primary.income, primary.currencyCode)}
        />
        <FigureTile
          dotColor={theme.danger}
          label={t("accounts.details.moneyOut")}
          value={formatCurrency(primary.expense, primary.currencyCode)}
        />
      </View>

      {compareText ? (
        <View
          className="flex-row items-center gap-2.5 rounded-2xl bg-surface-secondary/70 px-3.5 py-3"
          style={CONTINUOUS}
        >
          <FilledIcon name={compareIcon} size={18} color={compareTone} />
          <Text className="min-w-0 flex-1 font-sans text-[13px] leading-[18px] text-foreground">
            {compareText}
          </Text>
        </View>
      ) : null}

      {others.length > 0 ? (
        <View className="flex-row flex-wrap gap-2 border-t border-border/70 pt-3">
          {others.map((total) => (
            <View
              key={total.currencyCode}
              className="flex-row items-center gap-2 rounded-xl border border-border/60 bg-surface-secondary/75 px-3 py-1.5"
              style={CONTINUOUS}
            >
              <Text className="font-manrope-semibold text-[11px] leading-[15px] text-muted">
                {total.currencyCode}
              </Text>
              <Text
                className="font-manrope-bold text-[13px] leading-[17px] text-foreground"
                style={TABULAR}
              >
                {amountsHidden
                  ? formatCurrency(0, total.currencyCode)
                  : `+${formatCurrency(total.income, total.currencyCode)} · −${formatCurrency(total.expense, total.currencyCode)}`}
              </Text>
            </View>
          ))}
        </View>
      ) : null}
    </View>
  );
}
