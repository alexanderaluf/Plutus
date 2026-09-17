import { useTranslation } from "react-i18next";
import { View } from "react-native";
import Svg, { Circle, G } from "react-native-svg";

import type { ProfileReport } from "@/data/selectors/report-selectors";
import { useCurrencyFormat } from "@/shared/lib/use-currency-format";
import { useAppThemeColors } from "@/shared/theme/app-theme";
import { Text } from "@/shared/ui/app-text";

const SIZE = 172;
const STROKE = 24;
const RADIUS = (SIZE - STROKE) / 2;
const CIRCUMFERENCE = 2 * Math.PI * RADIUS;
/** Blank arc between slices so neighbouring colors stay readable. */
const SLICE_GAP = 3;

export function CategoryDonutCard({ report }: { report: ProfileReport }) {
  const { t, i18n } = useTranslation();
  const theme = useAppThemeColors();
  const { formatCurrency, amountsHidden } = useCurrencyFormat();

  const slices = report.parentCategories;
  const total = slices.reduce((sum, slice) => sum + slice.amount, 0);
  const percentage = new Intl.NumberFormat(i18n.resolvedLanguage, {
    style: "percent",
    maximumFractionDigits: slices.length > 4 ? 0 : 1,
  });

  // Each arc starts where the previous one ended, drawn from twelve o'clock.
  let offset = 0;
  const arcs = slices.map((slice) => {
    const length = total > 0 ? (slice.amount / total) * CIRCUMFERENCE : 0;
    const arc = {
      id: slice.id,
      color: slice.color,
      length: slices.length > 1 ? Math.max(length - SLICE_GAP, 0.5) : length,
      offset,
    };
    offset += length;
    return arc;
  });

  const labelOf = (id: string, label: string) =>
    id === "__other__" ? t("reports.donut.other") : label;

  return (
    <View className="gap-5 rounded-3xl border border-border bg-surface p-5">
      <View className="gap-1">
        <Text className="font-manrope-bold text-lg text-foreground">
          {t("reports.donut.title")}
        </Text>
        <Text className="font-sans text-xs text-muted">
          {t("reports.donut.subtitle")}
        </Text>
      </View>

      {slices.length === 0 ? (
        <Text className="py-6 text-center font-sans text-sm text-muted">
          {t("reports.donut.empty")}
        </Text>
      ) : (
        <>
          <View className="items-center">
            <View style={{ width: SIZE, height: SIZE }}>
              <Svg width={SIZE} height={SIZE}>
                <Circle
                  cx={SIZE / 2}
                  cy={SIZE / 2}
                  r={RADIUS}
                  stroke={theme.surfaceTertiary}
                  strokeWidth={STROKE}
                  fill="none"
                />
                <G transform={`rotate(-90 ${SIZE / 2} ${SIZE / 2})`}>
                  {arcs.map((arc) => (
                    <Circle
                      key={arc.id}
                      cx={SIZE / 2}
                      cy={SIZE / 2}
                      r={RADIUS}
                      stroke={arc.color}
                      strokeWidth={STROKE}
                      strokeDasharray={`${arc.length} ${CIRCUMFERENCE}`}
                      strokeDashoffset={-arc.offset}
                      fill="none"
                    />
                  ))}
                </G>
              </Svg>
              <View className="absolute inset-0 items-center justify-center px-8">
                <Text className="font-sans text-[10px] uppercase tracking-widest text-muted">
                  {t("reports.donut.total")}
                </Text>
                <Text
                  adjustsFontSizeToFit
                  numberOfLines={1}
                  className="mt-1 font-manrope-bold text-lg text-foreground"
                >
                  {formatCurrency(total, report.currencyCode)}
                </Text>
              </View>
            </View>
          </View>

          <View className="gap-3.5">
            {slices.map((slice) => {
              const label = labelOf(slice.id, slice.label);
              const amount = formatCurrency(slice.amount, report.currencyCode);
              const share = percentage.format(slice.share / 100);
              return (
                <View
                  key={slice.id}
                  accessible
                  accessibilityLabel={t("reports.categories.itemAccessibility", {
                    label,
                    amount,
                    percentage: share,
                  })}
                  className="flex-row items-center gap-3"
                >
                  <View
                    className="size-3 rounded-full"
                    style={{ backgroundColor: slice.color }}
                  />
                  <View className="min-w-0 flex-1">
                    <Text
                      numberOfLines={1}
                      className="font-manrope-semibold text-sm text-foreground"
                    >
                      {label}
                    </Text>
                    {slice.childCount && slice.childCount > 1 ? (
                      <Text
                        numberOfLines={1}
                        className="mt-0.5 font-sans text-[11px] text-muted"
                      >
                        {t("reports.donut.groups", { count: slice.childCount })}
                      </Text>
                    ) : null}
                  </View>
                  <View className="shrink-0 items-end">
                    <Text className="font-manrope-bold text-sm text-foreground">
                      {amount}
                    </Text>
                    <Text className="mt-0.5 font-sans text-[11px] text-muted">
                      {amountsHidden ? "••" : share}
                    </Text>
                  </View>
                </View>
              );
            })}
          </View>
        </>
      )}
    </View>
  );
}
