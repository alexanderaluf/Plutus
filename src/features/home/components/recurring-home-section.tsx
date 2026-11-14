import { useAppDate } from "@/shared/lib/use-app-date";
import { useRouter } from "expo-router";
import { useTranslation } from "react-i18next";
import { Pressable, View } from "react-native";

import type { RecurringEvent } from "@/data/selectors/recurring-selectors";
import { colorForeground } from "@/shared/icons/colors";
import { useCurrencyFormat } from "@/shared/lib/use-currency-format";
import { colorWithAlpha, useAppThemeColors } from "@/shared/theme/app-theme";
import { Text } from "@/shared/ui/app-text";
import { FilledIcon } from "@/shared/ui/filled-icon";
import { RecordIcon } from "@/shared/ui/record-icon";

import { HomeSectionAction } from "./home-section-header";

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
    <View className="min-w-0 gap-1">
      {totals.map((total) => (
        <View
          key={total.currencyCode}
          className="flex-row items-baseline gap-1.5"
        >
          <Text
            adjustsFontSizeToFit
            minimumFontScale={0.72}
            numberOfLines={1}
            className="min-w-0 shrink font-manrope-bold text-[19px] leading-[23px]"
            style={{ color, fontVariant: ["tabular-nums"] }}
          >
            {formatCurrency(total.amount, total.currencyCode)}
          </Text>
          <Text className="shrink-0 font-manrope-semibold text-[11px] leading-[15px] text-muted">
            {total.currencyCode}
          </Text>
        </View>
      ))}
    </View>
  );
}

export function RecurringHomeHeader({
  paid,
  remaining,
  fallbackCurrency,
}: {
  paid: MoneyTotal[];
  remaining: MoneyTotal[];
  fallbackCurrency: string;
}) {
  const router = useRouter();
  const { t } = useTranslation();
  const theme = useAppThemeColors();

  return (
    <View className="mb-3">
      <HomeSectionAction
        label={t("home.recurring.manage")}
        onPress={() => router.push("/recurring")}
      />

      <View className="flex-row gap-3">
        <View
          className="min-w-0 flex-1 justify-between gap-2.5 rounded-[22px] p-3.5"
          style={{
            backgroundColor: colorWithAlpha(
              theme.success,
              theme.isDark ? 0.16 : 0.11,
            ),
            borderWidth: 1,
            borderColor: colorWithAlpha(theme.success, 0.25),
            borderCurve: "continuous",
          }}
        >
          <View className="flex-row items-center gap-2">
            <View
              className="size-6 shrink-0 items-center justify-center rounded-full"
              style={{ backgroundColor: colorWithAlpha(theme.success, 0.18) }}
            >
              <FilledIcon name="check" size={13} tone="success" />
            </View>
            <Text
              numberOfLines={2}
              className="min-w-0 flex-1 font-manrope-semibold text-[12px] leading-[16px] text-success"
            >
              {t("home.recurring.paid")}
            </Text>
          </View>
          <Amounts
            values={paid}
            fallbackCurrency={fallbackCurrency}
            color={theme.success}
          />
        </View>

        <View
          className="min-w-0 flex-1 justify-between gap-2.5 rounded-[22px] p-3.5"
          style={{
            backgroundColor: colorWithAlpha(
              theme.danger,
              theme.isDark ? 0.16 : 0.11,
            ),
            borderWidth: 1,
            borderColor: colorWithAlpha(theme.danger, 0.25),
            borderCurve: "continuous",
          }}
        >
          <View className="flex-row items-center gap-2">
            <View
              className="size-6 shrink-0 items-center justify-center rounded-full"
              style={{ backgroundColor: colorWithAlpha(theme.danger, 0.18) }}
            >
              <FilledIcon name="clock" size={13} tone="danger" />
            </View>
            <Text
              numberOfLines={2}
              className="min-w-0 flex-1 font-manrope-semibold text-[12px] leading-[16px] text-danger"
            >
              {t("home.recurring.remaining")}
            </Text>
          </View>
          <Amounts
            values={remaining}
            fallbackCurrency={fallbackCurrency}
            color={theme.danger}
          />
        </View>
      </View>
    </View>
  );
}

export function RecurringHomeRow({ event }: { event: RecurringEvent }) {
  const { formatCurrency } = useCurrencyFormat();
  const { formatDate } = useAppDate();
  const router = useRouter();
  const { t } = useTranslation();
  const theme = useAppThemeColors();

  const startOfToday = new Date();
  startOfToday.setHours(0, 0, 0, 0);
  const isOverdue = event.date.getTime() < startOfToday.getTime();

  const periodLabel = t(`recurring.periods.${event.recurring.period}`);
  const accountLabel =
    event.recurring.accountName && event.recurring.accountName !== "No account"
      ? `${event.currencyCode} · ${event.recurring.accountName}`
      : event.currencyCode;

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
      className="flex-row items-center gap-3 rounded-[24px] border border-border bg-surface p-3.5"
      style={({ pressed }) => ({
        opacity: pressed ? 0.68 : 1,
        borderCurve: "continuous",
      })}
    >
      <View
        className="size-11 shrink-0 items-center justify-center rounded-2xl"
        style={{
          backgroundColor: event.recurring.color,
          borderCurve: "continuous",
        }}
      >
        <RecordIcon
          name={event.recurring.icon}
          pathData={event.recurring.iconPath}
          size={21}
          color={colorForeground(event.recurring.color)}
        />
      </View>

      <View className="min-w-0 flex-1 gap-1">
        <Text
          numberOfLines={2}
          className="font-manrope-bold text-[15px] leading-[20px] text-foreground"
        >
          {event.recurring.name}
        </Text>
        <Text
          numberOfLines={2}
          className="font-sans text-[12px] leading-[16px] text-muted"
        >
          {t("home.recurring.due", {
            date: formatDate(event.date),
          })}{" "}
          · {periodLabel}
        </Text>
        {isOverdue ? (
          <View
            className="mt-0.5 self-start rounded-full px-2 py-0.5"
            style={{
              backgroundColor: colorWithAlpha(
                theme.danger,
                theme.isDark ? 0.22 : 0.12,
              ),
            }}
          >
            <Text className="font-manrope-semibold text-[11px] leading-[14px] text-danger">
              {t("recurring.overdue")}
            </Text>
          </View>
        ) : null}
      </View>

      <View className="ms-2 max-w-[38%] shrink-0 items-end gap-0.5">
        <Text
          adjustsFontSizeToFit
          minimumFontScale={0.75}
          numberOfLines={1}
          className="text-right font-manrope-bold text-[15px] leading-[20px] text-danger"
          style={{ fontVariant: ["tabular-nums"] }}
        >
          {formatCurrency(event.amount, event.currencyCode)}
        </Text>
        <Text
          numberOfLines={1}
          className="text-right font-sans text-[11px] leading-[14px] text-muted"
        >
          {accountLabel}
        </Text>
      </View>
    </Pressable>
  );
}
