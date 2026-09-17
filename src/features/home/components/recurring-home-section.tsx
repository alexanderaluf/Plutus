import { useAppDate } from "@/shared/lib/use-app-date";
import { useRouter } from "expo-router";
import { Button } from "heroui-native";
import { useTranslation } from "react-i18next";
import { Pressable, View } from "react-native";

import type { RecurringEvent } from "@/data/selectors/recurring-selectors";
import { RecurringBadge } from "@/features/recurring/components/recurring-ui";
import { useCurrencyFormat } from "@/shared/lib/use-currency-format";
import { colorWithAlpha, useAppThemeColors } from "@/shared/theme/app-theme";
import { Text } from "@/shared/ui/app-text";
import { FilledIcon } from "@/shared/ui/filled-icon";

type MoneyTotal = { amount: number; currencyCode: string };

function Amounts({
  values,
  fallbackCurrency,
  color,
}: {
  values: MoneyTotal[];
  fallbackCurrency: string;
  color: string;
}) {
  const { formatCurrency } = useCurrencyFormat();
  const totals = values.length
    ? values
    : [{ amount: 0, currencyCode: fallbackCurrency }];

  return (
    <View className="min-w-0 gap-0.5">
      {totals.map((total) => (
        <Text
          key={total.currencyCode}
          adjustsFontSizeToFit
          minimumFontScale={0.72}
          numberOfLines={1}
          className="font-manrope-bold text-lg"
          style={{ color, writingDirection: "ltr" }}
        >
          {formatCurrency(total.amount, total.currencyCode)}{" "}
          {total.currencyCode}
        </Text>
      ))}
    </View>
  );
}

export function RecurringHomeHeader({
  paid,
  count,
  remaining,
  fallbackCurrency,
}: {
  paid: MoneyTotal[];
  count: number;
  remaining: MoneyTotal[];
  fallbackCurrency: string;
}) {
  const router = useRouter();
  const { t } = useTranslation();
  const theme = useAppThemeColors();

  return (
    <View className="mb-3 gap-3">
      <View className="flex-row items-center justify-between gap-3">
        <View className="min-w-0 flex-1 flex-row items-center gap-2">
          <Text
            numberOfLines={2}
            className="font-manrope-bold text-lg text-foreground"
          >
            {t("home.recurring.title")}
          </Text>
          <Text className="text-xs text-muted">{count}</Text>
        </View>
        <Button
          size="sm"
          variant="outline"
          onPress={() => router.push("/recurring")}
        >
          <FilledIcon name="swap-horizontal" size={16} tone="accent" />
          <Button.Label className="font-manrope-semibold text-accent">
            {t("home.recurring.manage")}
          </Button.Label>
        </Button>
      </View>

      <View className="flex-row gap-3">
        <View
          className="min-w-0 flex-1 gap-2 rounded-3xl p-4"
          style={{ backgroundColor: colorWithAlpha(theme.success, 0.14) }}
        >
          <Text
            numberOfLines={2}
            className="min-h-10 font-manrope-semibold text-sm text-success"
          >
            {t("home.recurring.paid")}
          </Text>
          <Amounts
            values={paid}
            fallbackCurrency={fallbackCurrency}
            color={theme.success}
          />
        </View>
        <View
          className="min-w-0 flex-1 gap-2 rounded-3xl p-4"
          style={{ backgroundColor: colorWithAlpha(theme.danger, 0.14) }}
        >
          <Text
            numberOfLines={2}
            className="min-h-10 font-manrope-semibold text-sm text-danger"
          >
            {t("home.recurring.remaining")}
          </Text>
          <Amounts
            values={remaining}
            fallbackCurrency={fallbackCurrency}
            color={theme.danger}
          />
        </View>
      </View>

      <Text className="pt-1 font-manrope-bold text-base text-foreground">
        {t("home.recurring.remainingTitle")}
      </Text>
    </View>
  );
}

export function RecurringHomeRow({ event }: { event: RecurringEvent }) {
  const { formatCurrency } = useCurrencyFormat();
  const { formatDate } = useAppDate();
  const router = useRouter();
  const { t } = useTranslation();
  return (
    <Pressable
      key={`${event.recurring.id}:${event.date.toISOString()}`}
      accessibilityLabel={t("home.recurring.open", {
        name: event.recurring.name,
      })}
      accessibilityRole="button"
      onPress={() =>
        router.push({
          pathname: "/recurring/[id]",
          params: { id: event.recurring.id },
        })
      }
      className="flex-row items-center gap-3 rounded-3xl border border-border bg-surface p-3"
      style={({ pressed }) => ({ opacity: pressed ? 0.7 : 1 })}
    >
      <RecurringBadge item={event.recurring} />
      <View className="min-w-0 flex-1 gap-1">
        <Text
          numberOfLines={2}
          className="font-manrope-bold text-base text-foreground"
        >
          {event.recurring.name}
        </Text>
        <Text numberOfLines={2} className="text-xs text-muted">
          {t("home.recurring.due", {
            date: formatDate(event.date),
          })}
        </Text>
      </View>
      <Text
        adjustsFontSizeToFit
        minimumFontScale={0.75}
        numberOfLines={1}
        className="max-w-[34%] font-manrope-bold text-sm text-danger"
        style={{ writingDirection: "ltr" }}
      >
        {formatCurrency(event.amount, event.currencyCode)} {event.currencyCode}
      </Text>
    </Pressable>
  );
}
