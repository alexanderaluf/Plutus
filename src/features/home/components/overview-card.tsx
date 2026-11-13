import { LinearGradient } from "expo-linear-gradient";
import { useRouter, type Href } from "expo-router";
import { useTranslation } from "react-i18next";
import { Pressable, StyleSheet, View } from "react-native";

import type {
  HomeMoney,
  HomeOverview,
} from "@/data/selectors/document-selectors";
import { useAppDate } from "@/shared/lib/use-app-date";
import { useCurrencyFormat } from "@/shared/lib/use-currency-format";
import { colorWithAlpha, useAppThemeColors } from "@/shared/theme/app-theme";
import { Text } from "@/shared/ui/app-text";
import { FilledIcon, type FilledIconName } from "@/shared/ui/filled-icon";

export type OverviewStatTone = "foreground" | "success" | "danger";

export type OverviewCardModel = {
  id: string;
  title: string;
  tab: string;
  context: string;
  icon: FilledIconName;
  value: HomeMoney;
  valueTone?: OverviewStatTone;
  footer: string;
  footerMeta?: string;
  alert?: string;
  href: Href;
  action: string;
  ratio?: {
    primary: number;
    secondary: number;
  };
  stats: {
    label: string;
    value: HomeMoney;
    tone?: string;
    dotTone?: "success" | "danger" | "accent";
  }[];
};

export function useOverviewCards(
  overview: HomeOverview,
  now: Date,
  visible: boolean,
): OverviewCardModel[] {
  const { formatCurrency } = useCurrencyFormat();
  const { formatDayMonth } = useAppDate();
  const { t, i18n } = useTranslation();

  const dailyAverageAvailable =
    visible && !overview.dailyExpense.unconverted.length;
  const transactionSummary = t("home.budgets.transactions", {
    count: overview.transactionCount,
  });

  return [
    {
      id: "balance",
      title: t("home.overview.balance"),
      tab: t("home.overview.balanceTab"),
      context: overview.currencyCode,
      icon: "wallet",
      value: overview.balance,
      valueTone: overview.balance.amount < 0 ? "danger" : "foreground",
      footer: t("home.overview.includedAccounts", {
        count: overview.accountCount,
      }),
      href: "/accounts",
      action: t("home.overview.accounts"),
      ratio: {
        primary: overview.assets.amount,
        secondary: overview.debt.amount,
      },
      stats: [
        {
          label: t("home.overview.positiveBalances"),
          value: overview.assets,
          dotTone: "success",
        },
        {
          label: t("home.overview.negativeBalances"),
          value: overview.debt,
          tone: overview.debt.amount > 0 ? "text-danger" : "text-foreground",
          dotTone: "danger",
        },
      ],
    },
    {
      id: "cashflow",
      title: t("home.overview.cashflow"),
      tab: t("home.overview.flowTab"),
      context: now.toLocaleDateString(i18n.resolvedLanguage, {
        month: "short",
      }),
      icon: "swap-horizontal",
      value: overview.net,
      valueTone: overview.net.amount < 0 ? "danger" : "foreground",
      footer: dailyAverageAvailable
        ? t("home.overview.dailyAverage", {
            amount: formatCurrency(
              overview.dailyExpense.amount,
              overview.currencyCode,
            ),
          })
        : transactionSummary,
      footerMeta: dailyAverageAvailable ? transactionSummary : undefined,
      href: "/search",
      action: t("home.overview.activity"),
      ratio: {
        primary: overview.income.amount,
        secondary: overview.expense.amount,
      },
      stats: [
        {
          label: t("home.overview.income"),
          value: overview.income,
          tone: "text-success",
          dotTone: "success",
        },
        {
          label: t("home.overview.expenses"),
          value: overview.expense,
          tone: "text-danger",
          dotTone: "danger",
        },
      ],
    },
    {
      id: "upcoming",
      title: t("home.overview.upcoming"),
      tab: t("home.overview.upcomingTab"),
      context: t("home.overview.days30"),
      icon: "clock",
      value: overview.upcomingExpense,
      footer: overview.next
        ? `${overview.next.name} · ${formatDayMonth(overview.next.date)}`
        : t("home.overview.nothingScheduled"),
      footerMeta:
        overview.upcomingCount > 0
          ? t("recurring.count", { count: overview.upcomingCount })
          : undefined,
      alert: overview.overdueCount
        ? t("home.overview.overdueShort", { count: overview.overdueCount })
        : undefined,
      href: "/recurring",
      action: t("home.overview.recurring"),
      ratio: {
        primary: overview.upcomingIncome.amount,
        secondary: overview.upcomingExpense.amount,
      },
      stats: [
        {
          label: t("home.overview.expectedIncome"),
          value: overview.upcomingIncome,
          tone: "text-success",
          dotTone: "success",
        },
        {
          label: t("home.overview.scheduledNet"),
          value: overview.upcomingNet,
          tone:
            overview.upcomingNet.amount < 0 ? "text-danger" : "text-foreground",
          dotTone: "accent",
        },
      ],
    },
  ];
}

function Money({
  value,
  visible,
  large,
  tone = "text-foreground",
}: {
  value: HomeMoney;
  visible: boolean;
  large?: boolean;
  tone?: string;
}) {
  const { formatCurrency, formatSignedCurrency } = useCurrencyFormat();
  const formatted = visible
    ? `${value.rateDate || value.unconverted.length ? "≈ " : ""}${
        value.amount < 0
          ? formatSignedCurrency(value.amount, value.currencyCode)
          : formatCurrency(value.amount, value.currencyCode)
      }`
    : "••••••";

  return (
    <View className="gap-1.5">
      <Text
        adjustsFontSizeToFit
        minimumFontScale={large ? 0.68 : 0.72}
        numberOfLines={1}
        selectable={visible}
        className={
          large
            ? `font-manrope-bold text-[34px] leading-[40px] tracking-[-0.6px] ${tone}`
            : `font-manrope-bold text-[17px] leading-[22px] ${tone}`
        }
        style={{ fontVariant: ["tabular-nums"] }}
      >
        {formatted}
      </Text>
      {visible && value.unconverted.length > 0 ? (
        <View className="flex-row flex-wrap gap-1.5">
          {value.unconverted.map((item) => (
            <View
              key={item.currencyCode}
              className="rounded-lg border border-border/60 bg-surface-secondary/75 px-2 py-0.5"
            >
              <Text
                className="font-manrope-medium text-[11px] leading-[15px] text-muted"
                style={{ fontVariant: ["tabular-nums"] }}
              >
                {formatSignedCurrency(item.amount, item.currencyCode)}{" "}
                {item.currencyCode}
              </Text>
            </View>
          ))}
        </View>
      ) : null}
    </View>
  );
}

function RatioBar({
  primary,
  secondary,
}: {
  primary: number;
  secondary: number;
}) {
  const theme = useAppThemeColors();
  const total = Math.max(0, primary) + Math.max(0, secondary);
  if (total <= 0) return null;

  const primaryShare = Math.max(0, primary) / total;
  const secondaryShare = Math.max(0, secondary) / total;

  return (
    <View
      accessible={false}
      className="h-1.5 w-full flex-row gap-1 overflow-hidden rounded-full bg-surface-secondary"
    >
      {primary > 0 ? (
        <View
          style={{
            backgroundColor: theme.success,
            borderRadius: 999,
            flex: Math.max(primaryShare, 0.04),
            height: "100%",
          }}
        />
      ) : null}
      {secondary > 0 ? (
        <View
          style={{
            backgroundColor: theme.danger,
            borderRadius: 999,
            flex: Math.max(secondaryShare, 0.04),
            height: "100%",
          }}
        />
      ) : null}
    </View>
  );
}

export function OverviewCard({
  card,
  visible,
}: {
  card: OverviewCardModel;
  visible: boolean;
}) {
  const router = useRouter();
  const { t } = useTranslation();
  const theme = useAppThemeColors();
  const values = [card.value, ...card.stats.map((stat) => stat.value)];
  const partial = values.some((value) => value.unconverted.length > 0);
  const rateDate = values
    .map((value) => value.rateDate)
    .filter((date): date is string => !!date)
    .sort()[0];
  const heroTone =
    card.valueTone === "danger" ? "text-danger" : "text-foreground";
  const showRatio =
    visible &&
    card.ratio &&
    card.ratio.primary + card.ratio.secondary > 0;

  return (
    <View
      className="grow justify-between gap-4 overflow-hidden rounded-[28px] border border-border bg-surface p-5 pb-3"
      style={{ borderCurve: "continuous" }}
    >
      <LinearGradient
        colors={[
          colorWithAlpha(theme.accent, theme.isDark ? 0.1 : 0.07),
          "transparent",
        ]}
        end={{ x: 0.9, y: 0.7 }}
        pointerEvents="none"
        start={{ x: 0, y: 0 }}
        style={StyleSheet.absoluteFill}
      />

      {/* Card Header */}
      <View className="flex-row items-center gap-2.5">
        <View
          className="size-9 items-center justify-center rounded-xl"
          style={{
            backgroundColor: colorWithAlpha(theme.accent, 0.14),
            borderCurve: "continuous",
          }}
        >
          <FilledIcon name={card.icon} size={18} tone="accent" />
        </View>
        <Text
          numberOfLines={1}
          className="min-w-0 flex-1 font-manrope-semibold text-[15px] leading-[20px] text-foreground"
        >
          {card.title}
        </Text>
        <View className="rounded-full border border-border/70 bg-surface-secondary/80 px-2.5 py-1">
          <Text className="font-manrope-semibold text-[11px] leading-[14px] tracking-[0.4px] text-muted">
            {card.context}
          </Text>
        </View>
      </View>

      {/* Hero Metric & Ratio Bar */}
      <View className="gap-2.5">
        <Money value={card.value} visible={visible} large tone={heroTone} />
        {showRatio && card.ratio ? (
          <RatioBar
            primary={card.ratio.primary}
            secondary={card.ratio.secondary}
          />
        ) : null}
      </View>

      {/* Breakdown Tiles */}
      <View className="flex-row gap-2.5">
        {card.stats.map((stat) => {
          const dotColor =
            stat.dotTone === "success"
              ? theme.success
              : stat.dotTone === "danger"
                ? theme.danger
                : theme.accent;
          return (
            <View
              key={stat.label}
              className="min-w-0 flex-1 gap-1.5 rounded-2xl border border-border/60 bg-surface-secondary/65 px-3.5 py-3"
              style={{ borderCurve: "continuous" }}
            >
              <View className="flex-row items-center gap-1.5">
                <View
                  style={{
                    backgroundColor: dotColor,
                    borderRadius: 999,
                    height: 6,
                    width: 6,
                  }}
                />
                <Text
                  numberOfLines={1}
                  className="min-w-0 flex-1 font-manrope-medium text-[11px] leading-[15px] text-muted"
                >
                  {stat.label}
                </Text>
              </View>
              <Money value={stat.value} visible={visible} tone={stat.tone} />
            </View>
          );
        })}
      </View>

      {/* Footer Action */}
      <View className="mt-auto border-t border-border/70 pt-2">
        <Pressable
          onPress={() => router.push(card.href)}
          accessibilityRole="button"
          accessibilityLabel={[
            card.footer,
            card.footerMeta,
            card.alert,
            card.action,
          ]
            .filter(Boolean)
            .join(". ")}
          className="min-h-11 flex-row items-center justify-between gap-3"
          style={({ pressed }) => ({ opacity: pressed ? 0.65 : 1 })}
        >
          <View className="min-w-0 flex-1 gap-1 py-1">
            <Text
              numberOfLines={1}
              className="font-sans text-[12px] leading-[16px] text-muted"
              style={{ fontVariant: ["tabular-nums"] }}
            >
              {card.footer}
            </Text>
            {card.footerMeta ? (
              <Text
                numberOfLines={1}
                className="font-sans text-[11px] leading-[14px] text-muted"
                style={{ fontVariant: ["tabular-nums"] }}
              >
                {card.footerMeta}
              </Text>
            ) : null}
            {card.alert ? (
              <View
                className="self-start rounded-full px-2.5 py-0.5"
                style={{ backgroundColor: colorWithAlpha(theme.danger, 0.14) }}
              >
                <Text className="font-manrope-semibold text-[11px] leading-[14px] text-danger">
                  {card.alert}
                </Text>
              </View>
            ) : null}
          </View>
          <View className="shrink-0 flex-row items-center gap-1 rounded-full bg-surface-secondary/80 px-2.5 py-1.5">
            <Text className="font-manrope-semibold text-[11px] leading-[14px] text-accent">
              {card.action}
            </Text>
            <FilledIcon name="chevron-right" size={14} tone="accent" />
          </View>
        </Pressable>
        {partial || rateDate ? (
          <Text className="pb-1 pt-0.5 font-sans text-[11px] leading-[15px] text-muted">
            {partial
              ? t("home.overview.missingRates")
              : t("home.overview.savedRates", { date: rateDate! })}
          </Text>
        ) : null}
      </View>
    </View>
  );
}

export function OverviewPrivacyButton({
  visible,
  onPress,
}: {
  visible: boolean;
  onPress: () => void;
}) {
  const { t } = useTranslation();
  return (
    <Pressable
      onPress={onPress}
      hitSlop={4}
      accessibilityRole="button"
      accessibilityLabel={t(
        visible ? "home.overview.hideAmounts" : "home.overview.showAmounts",
      )}
      className="size-10 items-center justify-center rounded-full border border-border/80 bg-surface"
      style={({ pressed }) => ({ opacity: pressed ? 0.68 : 1 })}
    >
      <FilledIcon name={visible ? "eye" : "eye-off"} size={18} tone="muted" />
    </Pressable>
  );
}
