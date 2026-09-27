import { useRouter } from "expo-router";
import { useMemo } from "react";
import { useTranslation } from "react-i18next";
import { Pressable, View } from "react-native";

import { useLocalData } from "@/data/local-data-provider";
import {
    selectRecurrings,
    selectRecurringSummary,
} from "@/data/selectors/document-selectors";
import { useProfiles } from "@/features/profile/profile-provider";
import { useCurrencyFormat } from "@/shared/lib/use-currency-format";
import { useAppThemeColors } from "@/shared/theme/app-theme";
import { Text } from "@/shared/ui/app-text";
import { FilledIcon } from "@/shared/ui/filled-icon";

type MoneyTotal = { amount: number; currencyCode: string };

function SummaryAmounts({
  values,
  emptyCurrency,
  color,
}: {
  values: MoneyTotal[];
  emptyCurrency: string;
  color: string;
}) {
  const { formatCurrency } = useCurrencyFormat();
  const totals = values.length
    ? values
    : [{ amount: 0, currencyCode: emptyCurrency }];

  return (
    <View className="min-w-0 gap-0.5">
      {totals.map((total) => (
        <Text
          key={total.currencyCode}
          numberOfLines={2}
          className="w-full font-manrope-bold text-sm leading-5"
          style={{ color, writingDirection: "ltr" }}
        >
          {formatCurrency(total.amount, total.currencyCode)}{" "}
          {total.currencyCode}
        </Text>
      ))}
    </View>
  );
}

export function RecurringSummaryCard({ now }: { now: Date }) {
  const { t } = useTranslation();
  const router = useRouter();
  const { document } = useLocalData();
  const { activeProfile } = useProfiles();
  const theme = useAppThemeColors();
  const summary = useMemo(
    () => selectRecurringSummary(selectRecurrings(document, now), now),
    [document, now],
  );
  const periods = [
    {
      label: t("recurring.monthly"),
      income: summary.income,
      expense: summary.expense,
    },
    {
      label: t("recurring.yearly"),
      income: summary.yearlyIncome,
      expense: summary.yearlyExpense,
    },
  ];
  const accessibilityLabel = `${t("recurring.title")}: ${t("recurring.monthly")}, ${t("recurring.yearly")}, ${t("recurring.income")}, ${t("recurring.expense")}`;

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel}
      onPress={() => router.push("/recurring")}
      className="gap-3 rounded-3xl bg-surface p-4"
      style={({ pressed }) => ({ opacity: pressed ? 0.72 : 1 })}
    >
      <View className="flex-row items-center gap-3">
        <View className="size-10 items-center justify-center rounded-xl bg-surface-tertiary">
          <FilledIcon name="swap-horizontal" size={23} tone="accent" />
        </View>
        <View className="min-w-0 flex-1 gap-0.5">
          <Text className="font-manrope-bold text-base text-foreground">
            {t("recurring.title")}
          </Text>
          <Text className="font-sans text-xs text-muted">
            {t("recurring.monthly")} · {t("recurring.yearly")}
          </Text>
        </View>
        <FilledIcon name="chevron-right" size={22} tone="muted" />
      </View>

      <View className="border-t border-border">
        {periods.map((period, index) => (
          <View
            key={period.label}
            className={`flex-row gap-3 py-3 ${index ? "border-t border-border" : ""}`}
          >
            <Text className="w-16 pt-0.5 font-manrope-semibold text-sm text-foreground">
              {period.label}
            </Text>
            <View className="min-w-0 flex-1 gap-1">
              <Text className="font-sans text-xs text-muted">
                {t("recurring.income")}
              </Text>
              <SummaryAmounts
                values={period.income}
                emptyCurrency={activeProfile.currencyCode}
                color={theme.success}
              />
            </View>
            <View className="min-w-0 flex-1 gap-1">
              <Text className="font-sans text-xs text-muted">
                {t("recurring.expense")}
              </Text>
              <SummaryAmounts
                values={period.expense}
                emptyCurrency={activeProfile.currencyCode}
                color={theme.danger}
              />
            </View>
          </View>
        ))}
      </View>
    </Pressable>
  );
}
