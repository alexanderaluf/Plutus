import { useTranslation } from "react-i18next";
import { View } from "react-native";
import Svg, { Circle } from "react-native-svg";

import type { ProfileReport } from "@/data/selectors/report-selectors";
import { useCurrencyFormat } from "@/shared/lib/use-currency-format";
import { colorWithAlpha, useAppThemeColors } from "@/shared/theme/app-theme";
import { Text } from "@/shared/ui/app-text";
import { FilledIcon } from "@/shared/ui/filled-icon";

const RING_SIZE = 116;
const RING_STROKE = 10;
const RADIUS = (RING_SIZE - RING_STROKE) / 2;
const CIRCUMFERENCE = 2 * Math.PI * RADIUS;

function Delta({ value }: { value: number | null }) {
  const { t } = useTranslation();
  const theme = useAppThemeColors();
  if (value == null || !Number.isFinite(value)) {
    return (
      <Text className="font-sans text-[11px] text-muted">
        {t("reports.kpi.noComparison")}
      </Text>
    );
  }
  const rounded = Math.round(value);
  const rising = rounded > 0;
  return (
    <View className="flex-row items-center gap-1">
      <FilledIcon
        name={rising ? "trending-up" : "trending-down"}
        size={13}
        color={theme.muted}
      />
      <Text className="font-sans text-[11px] text-muted">
        {`${rising ? "+" : ""}${rounded}% ${t("reports.kpi.vsPrevious")}`}
      </Text>
    </View>
  );
}

function Kpi({
  delta,
  label,
  tone,
  value,
}: {
  delta: number | null;
  label: string;
  tone: string;
  value: string;
}) {
  return (
    <View className="flex-row items-center justify-between gap-4">
      <View className="min-w-0 flex-1 gap-0.5">
        <Text className="font-sans text-[13px] text-muted">{label}</Text>
        <Delta value={delta} />
      </View>
      <Text
        numberOfLines={1}
        className={`shrink-0 font-manrope-bold text-base ${tone}`}
      >
        {value}
      </Text>
    </View>
  );
}

export function HealthScoreCard({ report }: { report: ProfileReport }) {
  const { t } = useTranslation();
  const theme = useAppThemeColors();
  const { formatCurrency, amountsHidden } = useCurrencyFormat();
  const { band, score } = report.health;
  const tone =
    band === "strong"
      ? theme.success
      : band === "steady"
        ? theme.accent
        : theme.danger;
  // The ring is drawn from the top and clockwise.
  const progress = Math.max(0, Math.min(score, 100)) / 100;

  return (
    <View className="gap-5 rounded-3xl border border-border bg-surface p-5">
      <View className="flex-row items-center gap-5">
        <View style={{ width: RING_SIZE, height: RING_SIZE }}>
          <Svg width={RING_SIZE} height={RING_SIZE}>
            <Circle
              cx={RING_SIZE / 2}
              cy={RING_SIZE / 2}
              r={RADIUS}
              stroke={theme.surfaceTertiary}
              strokeWidth={RING_STROKE}
              fill="none"
            />
            <Circle
              cx={RING_SIZE / 2}
              cy={RING_SIZE / 2}
              r={RADIUS}
              stroke={tone}
              strokeWidth={RING_STROKE}
              strokeLinecap="round"
              strokeDasharray={`${CIRCUMFERENCE * progress} ${CIRCUMFERENCE}`}
              transform={`rotate(-90 ${RING_SIZE / 2} ${RING_SIZE / 2})`}
              fill="none"
            />
          </Svg>
          <View className="absolute inset-0 items-center justify-center">
            <Text
              className="font-manrope-bold text-[30px] text-foreground"
              style={{ fontVariant: ["tabular-nums"] }}
            >
              {report.hasData ? score : "–"}
            </Text>
            <Text className="font-sans text-[10px] text-muted">
              {t("reports.health.outOf")}
            </Text>
          </View>
        </View>

        <View className="flex-1 gap-2">
          <Text className="font-manrope-medium text-xs uppercase tracking-widest text-muted">
            {t("reports.health.title")}
          </Text>
          <View
            className="self-start rounded-full px-3 py-1"
            style={{ backgroundColor: colorWithAlpha(tone, 0.16) }}
          >
            <Text
              className="font-manrope-bold text-sm"
              style={{ color: tone }}
            >
              {t(`reports.health.bands.${band}`)}
            </Text>
          </View>
          {report.hasData ? null : (
            <Text className="font-sans text-sm leading-5 text-muted">
              {t("reports.health.empty")}
            </Text>
          )}
        </View>
      </View>

      {/*
        One KPI per row. Three columns could not hold a formatted amount and a
        "vs previous month" caption side by side, so both clipped their cards.
      */}
      <View className="gap-3 border-t border-border pt-4">
        <Kpi
          delta={report.incomeChange}
          label={t("reports.kpi.income")}
          tone="text-success"
          value={formatCurrency(report.current.income, report.currencyCode)}
        />
        <Kpi
          delta={report.expenseChange}
          label={t("reports.kpi.expenses")}
          tone="text-danger"
          value={formatCurrency(report.current.expense, report.currencyCode)}
        />
        <Kpi
          delta={report.savingsRateChange}
          label={t("reports.kpi.savingsRate")}
          tone="text-foreground"
          value={amountsHidden ? "••" : `${Math.round(report.savingsRate)}%`}
        />
      </View>
    </View>
  );
}
