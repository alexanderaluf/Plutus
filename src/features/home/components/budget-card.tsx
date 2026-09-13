import { useState } from "react";
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
import { formatCurrency } from "@/shared/lib/currency";
import { Text } from "@/shared/ui/app-text";
import { FilledIcon } from "@/shared/ui/filled-icon";
import { RecordIcon } from "@/shared/ui/record-icon";

const layout = LinearTransition.duration(240).reduceMotion(ReduceMotion.System);
export function BudgetOverviewCard({
  budget: b,
  expanded,
  onToggle,
}: {
  budget: Budget;
  expanded: boolean;
  onToggle: () => void;
}) {
  const router = useRouter();
  const { t, i18n } = useTranslation();
  const labels = useBudgetLabels();
  const money = (amount: number) => formatCurrency(amount, b.currencyCode);
  const open = () =>
    router.push({ pathname: "/budgets/[id]", params: { id: b.id } });
  const remaining = t(
    b.remaining < 0
      ? b.transactionType === 0
        ? "home.budgets.over"
        : "home.budgets.aboveGoal"
      : "home.budgets.left",
    { amount: money(b.remaining) },
  );
  const danger = b.transactionType === 0 && b.remaining < 0;
  return (
    <Animated.View
      layout={layout}
      className="overflow-hidden rounded-3xl border border-border bg-surface p-4"
    >
      <View className="flex-row items-center gap-3">
        <Pressable
          onPress={open}
          accessibilityRole="button"
          accessibilityLabel={t("home.budgets.open", { name: b.name })}
          className="min-w-0 flex-1 flex-row items-center gap-2.5"
        >
          <View
            className="size-9 items-center justify-center rounded-xl"
            style={{ backgroundColor: b.color }}
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
              className="font-manrope-semibold text-base text-foreground"
            >
              {b.name}
            </Text>
            <Text className="text-xs text-muted">
              {labels.periods[b.period]} · {labels.types[b.transactionType]}
            </Text>
          </View>
        </Pressable>
        <View className="max-w-[45%] items-end gap-0.5">
          <Text
            className={`font-manrope-bold text-lg ${danger ? "text-danger" : "text-accent"}`}
            style={{ fontVariant: ["tabular-nums"] }}
          >
            {b.active
              ? money(b.dailyAllowance)
              : money(Math.max(0, b.remaining))}
          </Text>
          <Text className="text-xs text-muted">
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
      <View className="mt-3 mb-2 flex-row items-baseline justify-between gap-2">
        <Text className="min-w-0 flex-1 text-xs text-muted">
          {labels.tracked[b.transactionType]}{" "}
          <Text className="font-manrope-semibold text-foreground">
            {money(b.tracked)}
          </Text>{" "}
          / {money(b.limit)}
        </Text>
        <Text className="text-xs text-muted">
          {Math.round(b.percent).toLocaleString(i18n.resolvedLanguage)}%
        </Text>
      </View>
      <BudgetProgress percent={b.percent} color={b.color} />
      <View className="-mb-2 mt-1 flex-row items-center justify-between gap-2">
        <Text
          className={`min-w-0 flex-1 font-manrope-semibold text-xs ${danger ? "text-danger" : "text-foreground"}`}
        >
          {remaining}
        </Text>
        <Pressable
          onPress={onToggle}
          accessibilityRole="button"
          accessibilityState={{ expanded }}
          accessibilityLabel={t(
            expanded
              ? "home.budgets.collapseBudget"
              : "home.budgets.expandBudget",
            { name: b.name },
          )}
          className="min-h-11 flex-row items-center gap-1.5 ps-2"
        >
          <Text className="text-xs text-muted">
            {t(expanded ? "home.budgets.less" : "home.budgets.more")}
          </Text>
          <View
            style={{ transform: [{ rotate: expanded ? "0deg" : "180deg" }] }}
          >
            <FilledIcon name="chevron-up" size={18} tone="muted" />
          </View>
        </Pressable>
      </View>
      {expanded && (
        <Animated.View
          entering={FadeIn.duration(180).reduceMotion(ReduceMotion.System)}
          exiting={FadeOut.duration(120).reduceMotion(ReduceMotion.System)}
          className="mt-2 gap-3 border-t border-border pt-3"
        >
          <View className="flex-row gap-4">
            <View className="min-w-0 flex-1 gap-1">
              <Text className="text-xs text-muted">
                {t("home.budgets.plannedPerDay")}
              </Text>
              <Text className="font-manrope-semibold text-lg text-foreground">
                {money(b.dailyPlan)}
              </Text>
              <Text className="text-xs text-muted">
                {t("home.budgets.periodDaysShort", { count: b.periodDays })}
              </Text>
            </View>
            <View className="min-w-0 flex-1 gap-1 border-s border-border ps-4">
              <Text className="text-xs text-muted">
                {t("home.budgets.daysLeftShort")}
              </Text>
              <Text className="font-manrope-semibold text-lg text-foreground">
                {b.daysLeft.toLocaleString(i18n.resolvedLanguage)}
              </Text>
              <Text className="text-xs text-muted">
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
          <View className="flex-row flex-wrap justify-between gap-2">
            <Text className="text-xs text-muted">
              {b.range.start.toLocaleDateString(i18n.resolvedLanguage, {
                month: "short",
                day: "numeric",
              })}{" "}
              –{" "}
              {new Date(b.range.end.getTime() - 1).toLocaleDateString(
                i18n.resolvedLanguage,
                { month: "short", day: "numeric" },
              )}
            </Text>
            <Text className="text-xs text-muted">
              {t("home.budgets.transactions", { count: b.transactions.length })}
            </Text>
          </View>
          {b.rollover > 0 && (
            <Text className="text-xs text-muted">
              {t("home.budgets.rollover", { amount: money(b.rollover) })}
            </Text>
          )}
          {b.excludedCurrencyCount > 0 && (
            <Text className="text-xs text-muted">
              {t("home.budgets.otherCurrencies", {
                count: b.excludedCurrencyCount,
              })}
            </Text>
          )}
          <Pressable
            onPress={open}
            accessibilityRole="button"
            className="min-h-11 flex-row items-center justify-between rounded-xl bg-surface-secondary px-3"
          >
            <Text className="font-manrope-semibold text-xs text-accent">
              {t("home.budgets.fullDetails")}
            </Text>
            <FilledIcon name="chevron-right" size={18} tone="accent" />
          </Pressable>
        </Animated.View>
      )}
    </Animated.View>
  );
}
export function BudgetCard({ budgets }: { budgets: Budget[] }) {
  const router = useRouter();
  const { t } = useTranslation();
  const [expandedId, setExpandedId] = useState<string | null>(null);
  return (
    <View className="gap-3">
      <View className="flex-row items-center justify-between">
        <View className="min-w-0 flex-1 flex-row items-center gap-2">
          <Text className="font-manrope-bold text-lg text-foreground">
            {t("home.budgets.title")}
          </Text>
          <Text className="text-xs text-muted">{budgets.length}</Text>
        </View>
        <Pressable
          onPress={() => router.push("/budgets")}
          accessibilityRole="button"
          className="min-h-11 flex-row items-center gap-1"
        >
          <Text className="font-manrope-semibold text-xs text-accent">
            {t("home.budgets.seeAll")}
          </Text>
          <FilledIcon name="chevron-right" size={16} tone="accent" />
        </Pressable>
      </View>
      {budgets.slice(0, 3).map((b) => (
        <BudgetOverviewCard
          key={b.id}
          budget={b}
          expanded={expandedId === b.id}
          onToggle={() => setExpandedId(expandedId === b.id ? null : b.id)}
        />
      ))}
      {budgets.length > 3 && (
        <Pressable
          onPress={() => router.push("/budgets")}
          accessibilityRole="button"
          className="min-h-11 items-center justify-center rounded-2xl bg-surface"
        >
          <Text className="font-manrope-semibold text-xs text-accent">
            {t("home.budgets.moreTracked", { count: budgets.length - 3 })}
          </Text>
        </Pressable>
      )}
      {!budgets.length && (
        <Pressable
          accessibilityRole="button"
          onPress={() => router.push("/budgets")}
          className="rounded-3xl bg-surface p-4"
        >
          <Text className="text-sm text-muted">{t("home.budgets.empty")}</Text>
        </Pressable>
      )}
    </View>
  );
}
