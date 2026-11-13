import { useAppDate } from "@/shared/lib/use-app-date";
import { useRouter } from "expo-router";
import { useTranslation } from "react-i18next";
import { Pressable, View } from "react-native";
import Animated, {
  FadeIn,
  FadeOut,
  LinearTransition,
  ReduceMotion,
} from "react-native-reanimated";
import type { Budget } from "@/data/selectors/budget-selectors";
import {
  BudgetProgress,
  useBudgetLabels,
} from "@/features/budgets/components/budget-ui";
import { colorForeground } from "@/shared/icons/colors";
import { useCurrencyFormat } from "@/shared/lib/use-currency-format";
import { colorWithAlpha, useAppThemeColors } from "@/shared/theme/app-theme";
import { Text } from "@/shared/ui/app-text";
import { FilledIcon } from "@/shared/ui/filled-icon";
import { RecordIcon } from "@/shared/ui/record-icon";

import { HomeSectionHeader } from "./home-section-header";

const layout = LinearTransition.duration(240).reduceMotion(ReduceMotion.System);

export function BudgetOverviewCard({
  budget: b,
  expanded,
  onToggle,
  onOpen,
}: {
  budget: Budget;
  expanded: boolean;
  onToggle: () => void;
  onOpen?: () => void;
}) {
  const { formatCurrency } = useCurrencyFormat();
  const { formatDayMonth } = useAppDate();
  const router = useRouter();
  const { t, i18n } = useTranslation();
  const theme = useAppThemeColors();
  const labels = useBudgetLabels();
  const money = (amount: number) => formatCurrency(amount, b.currencyCode);
  const open =
    onOpen ??
    (() => router.push({ pathname: "/budgets/[id]", params: { id: b.id } }));

  const remaining = t(
    b.remaining < 0
      ? b.transactionType === 0
        ? "home.budgets.over"
        : "home.budgets.aboveGoal"
      : "home.budgets.left",
    { amount: money(b.remaining) },
  );
  const danger = b.transactionType === 0 && b.remaining < 0;
  const indicatorColor = danger ? theme.danger : b.color;

  return (
    <Animated.View
      layout={layout}
      className="overflow-hidden rounded-[24px] border border-border bg-surface p-4"
      style={{ borderCurve: "continuous" }}
    >
      <View className="flex-row items-center gap-3">
        <Pressable
          onPress={open}
          accessibilityRole="button"
          accessibilityLabel={t("home.budgets.open", { name: b.name })}
          className="min-w-0 flex-1 flex-row items-center gap-3"
          style={({ pressed }) => ({ opacity: pressed ? 0.68 : 1 })}
        >
          <View
            className="size-11 shrink-0 items-center justify-center rounded-2xl"
            style={{ backgroundColor: b.color, borderCurve: "continuous" }}
          >
            <RecordIcon
              name={b.icon}
              pathData={b.iconPath}
              color={colorForeground(b.color)}
              size={21}
            />
          </View>
          <View className="min-w-0 flex-1 gap-0.5">
            <Text
              numberOfLines={1}
              className="font-manrope-bold text-[15px] leading-[20px] text-foreground"
            >
              {b.name}
            </Text>
            <Text
              numberOfLines={1}
              className="font-sans text-[12px] leading-[16px] text-muted"
            >
              {labels.periods[b.period]} · {labels.types[b.transactionType]}
            </Text>
          </View>
        </Pressable>

        <View className="max-w-[44%] shrink-0 items-end gap-0.5">
          <Text
            adjustsFontSizeToFit
            minimumFontScale={0.75}
            numberOfLines={1}
            className={`text-right font-manrope-bold text-[18px] leading-[22px] ${danger ? "text-danger" : "text-accent"}`}
            style={{ fontVariant: ["tabular-nums"] }}
          >
            {b.active
              ? money(b.dailyAllowance)
              : money(Math.max(0, b.remaining))}
          </Text>
          <Text
            numberOfLines={1}
            className="text-right font-sans text-[11px] leading-[14px] text-muted"
          >
            {b.active
              ? t(
                  b.transactionType === 0
                    ? "home.budgets.availablePerDay"
                    : "home.budgets.neededPerDay",
                )
              : t(
                  b.periodStatus === "upcoming"
                    ? "home.budgets.upcomingShort"
                    : "home.budgets.endedShort",
                )}
          </Text>
        </View>
      </View>

      <View className="mt-3.5 gap-2">
        <View className="flex-row items-center justify-between gap-2">
          <Text
            numberOfLines={1}
            className="min-w-0 flex-1 font-sans text-[12px] leading-[16px] text-muted"
            style={{ fontVariant: ["tabular-nums"] }}
          >
            {labels.tracked[b.transactionType]}{" "}
            <Text className="font-manrope-semibold text-foreground">
              {money(b.tracked)}
            </Text>{" "}
            / {money(b.limit)}
          </Text>
          <View
            className="shrink-0 rounded-full px-2 py-0.5"
            style={{
              backgroundColor: colorWithAlpha(
                indicatorColor,
                theme.isDark ? 0.22 : 0.14,
              ),
            }}
          >
            <Text
              className="font-manrope-bold text-[11px] leading-[14px]"
              style={{
                color: indicatorColor,
                fontVariant: ["tabular-nums"],
              }}
            >
              {Math.round(b.percent).toLocaleString(i18n.resolvedLanguage)}%
            </Text>
          </View>
        </View>

        <BudgetProgress percent={b.percent} color={indicatorColor} />
      </View>

      <View className="mt-3 flex-row items-center justify-between gap-2">
        <Text
          className={`min-w-0 flex-1 font-manrope-semibold text-[13px] leading-[18px] ${danger ? "text-danger" : "text-foreground"}`}
          style={{ fontVariant: ["tabular-nums"] }}
        >
          {remaining}
        </Text>
        <Pressable
          onPress={onToggle}
          hitSlop={6}
          accessibilityRole="button"
          accessibilityState={{ expanded }}
          accessibilityLabel={t(
            expanded
              ? "home.budgets.collapseBudget"
              : "home.budgets.expandBudget",
            { name: b.name },
          )}
          className="shrink-0 flex-row items-center gap-1 rounded-full bg-surface-secondary px-3 py-1.5"
          style={({ pressed }) => ({ opacity: pressed ? 0.68 : 1 })}
        >
          <Text className="font-manrope-semibold text-[12px] leading-[16px] text-muted">
            {t(expanded ? "home.budgets.less" : "home.budgets.more")}
          </Text>
          <View
            style={{ transform: [{ rotate: expanded ? "0deg" : "180deg" }] }}
          >
            <FilledIcon name="chevron-up" size={15} tone="muted" />
          </View>
        </Pressable>
      </View>

      {expanded && (
        <Animated.View
          entering={FadeIn.duration(180).reduceMotion(ReduceMotion.System)}
          exiting={FadeOut.duration(120).reduceMotion(ReduceMotion.System)}
          className="mt-3 gap-2.5 border-t border-border pt-3"
        >
          <View className="flex-row gap-2.5">
            <View
              className="min-w-0 flex-1 gap-0.5 rounded-2xl bg-surface-secondary p-3"
              style={{ borderCurve: "continuous" }}
            >
              <Text
                numberOfLines={1}
                className="font-sans text-[11px] leading-[15px] text-muted"
              >
                {t("home.budgets.plannedPerDay")}
              </Text>
              <Text
                adjustsFontSizeToFit
                minimumFontScale={0.8}
                numberOfLines={1}
                className="font-manrope-bold text-[16px] leading-[21px] text-foreground"
                style={{ fontVariant: ["tabular-nums"] }}
              >
                {money(b.dailyPlan)}
              </Text>
              <Text
                numberOfLines={1}
                className="font-sans text-[11px] leading-[15px] text-muted"
              >
                {t("home.budgets.periodDaysShort", { count: b.periodDays })}
              </Text>
            </View>

            <View
              className="min-w-0 flex-1 gap-0.5 rounded-2xl bg-surface-secondary p-3"
              style={{ borderCurve: "continuous" }}
            >
              <Text
                numberOfLines={1}
                className="font-sans text-[11px] leading-[15px] text-muted"
              >
                {t("home.budgets.daysLeftShort")}
              </Text>
              <Text
                numberOfLines={1}
                className="font-manrope-bold text-[16px] leading-[21px] text-foreground"
                style={{ fontVariant: ["tabular-nums"] }}
              >
                {b.daysLeft.toLocaleString(i18n.resolvedLanguage)}
              </Text>
              <Text
                numberOfLines={1}
                className="font-sans text-[11px] leading-[15px] text-muted"
              >
                {b.active
                  ? t("home.budgets.includesToday")
                  : t(
                      b.periodStatus === "upcoming"
                        ? "home.budgets.upcomingShort"
                        : "home.budgets.endedShort",
                    )}
              </Text>
            </View>
          </View>

          <View className="flex-row flex-wrap items-center justify-between gap-2 px-0.5">
            <View className="flex-row items-center gap-1.5">
              <FilledIcon name="calendar" size={13} tone="muted" />
              <Text className="font-sans text-[12px] leading-[16px] text-muted">
                {formatDayMonth(b.range.start)} –{" "}
                {formatDayMonth(new Date(b.range.end.getTime() - 1))}
              </Text>
            </View>
            <View className="flex-row items-center gap-1.5">
              <FilledIcon name="receipt" size={13} tone="muted" />
              <Text
                className="font-sans text-[12px] leading-[16px] text-muted"
                style={{ fontVariant: ["tabular-nums"] }}
              >
                {t("home.budgets.transactions", { count: b.transactionCount })}
              </Text>
            </View>
          </View>

          {b.rollover > 0 && (
            <Text className="px-0.5 font-sans text-[12px] leading-[16px] text-muted">
              {t("home.budgets.rollover", { amount: money(b.rollover) })}
            </Text>
          )}
          {b.excludedCurrencyCount > 0 && (
            <Text className="px-0.5 font-sans text-[12px] leading-[16px] text-muted">
              {t("home.budgets.otherCurrencies", {
                count: b.excludedCurrencyCount,
              })}
            </Text>
          )}

          <Pressable
            onPress={open}
            accessibilityRole="button"
            className="min-h-11 flex-row items-center justify-between rounded-2xl bg-surface-secondary px-3.5"
            style={({ pressed }) => ({
              opacity: pressed ? 0.68 : 1,
              borderCurve: "continuous",
            })}
          >
            <Text className="font-manrope-semibold text-[13px] leading-[18px] text-accent">
              {t("home.budgets.fullDetails")}
            </Text>
            <FilledIcon name="chevron-right" size={17} tone="accent" />
          </Pressable>
        </Animated.View>
      )}
    </Animated.View>
  );
}

export function BudgetListHeader({ count }: { count: number }) {
  const router = useRouter();
  const { t } = useTranslation();
  return (
    <HomeSectionHeader
      title={t("home.budgets.title")}
      count={count}
      actionLabel={t("home.budgets.manage")}
      actionIcon="plus"
      onActionPress={() => router.push("/budgets")}
    />
  );
}
