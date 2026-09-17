import { Card, Chip } from "heroui-native";
import { useTranslation } from "react-i18next";
import { View } from "react-native";

import { Text } from "@/shared/ui/app-text";

import { useCurrencyFormat } from "@/shared/lib/use-currency-format";
import { FilledIcon } from "@/shared/ui/filled-icon";

import type { DailySpend } from "../types";

type SpendingChartCardProps = {
  totalSpent: number;
  changePercent: number;
  dailyAverage: number;
  dailySpending: DailySpend[];
  currencyCode: string;
};

export function SpendingChartCard({
  totalSpent,
  changePercent,
  dailyAverage,
  dailySpending,
  currencyCode,
}: SpendingChartCardProps) {
  const { formatCurrency } = useCurrencyFormat();
  const { i18n, t } = useTranslation();
  const maximum = Math.max(...dailySpending.map((item) => item.amount), 1);
  const percentage = new Intl.NumberFormat(i18n.resolvedLanguage, {
    style: "percent",
    maximumFractionDigits: 1,
  }).format(Math.abs(changePercent) / 100);

  return (
    <Card className="border border-border bg-surface p-0">
      <Card.Header className="flex-row items-start justify-between px-5 pt-5">
        <View>
          <Card.Description className="font-sans text-muted">
            {t("reports.chart.totalSpent")}
          </Card.Description>
          <Card.Title className="mt-1 font-manrope-bold text-[32px] text-foreground">
            {formatCurrency(totalSpent, currencyCode)}
          </Card.Title>
        </View>
        <Chip
          accessibilityLabel={t("reports.chart.change", { percentage })}
          color="success"
          size="sm"
          variant="soft"
        >
          <FilledIcon name="trending-down" size={15} tone="accent" />
          <Chip.Label className="font-manrope-bold">
            {percentage}
          </Chip.Label>
        </Chip>
      </Card.Header>

      <Card.Body className="gap-4 px-5 pb-5 pt-6">
        <View className="h-32 flex-row items-end justify-between gap-2">
          {dailySpending.map((item, index) => (
            <View
              key={`${item.day}-${index}`}
              accessible
              accessibilityLabel={t("reports.chart.dayAccessibility", {
                day: item.day,
                amount: formatCurrency(item.amount, currencyCode),
              })}
              className="flex-1 items-center gap-2"
            >
              <View className="h-24 w-full justify-end overflow-hidden rounded-md bg-surface-tertiary">
                <View
                  className="w-full rounded-md bg-accent"
                  style={{
                    height: `${Math.max((item.amount / maximum) * 100, 12)}%`,
                  }}
                />
              </View>
              <Text className="font-manrope-semibold text-[10px] text-muted">
                {item.day}
              </Text>
            </View>
          ))}
        </View>

        <View className="flex-row items-center justify-between border-t border-border pt-4">
          <Text className="font-sans text-xs text-muted">
            {t("reports.chart.dailyAverage")}
          </Text>
          <Text className="font-manrope-bold text-sm text-foreground">
            {formatCurrency(dailyAverage, currencyCode)}
          </Text>
        </View>
      </Card.Body>
    </Card>
  );
}
