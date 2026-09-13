import { useRouter, type Href } from "expo-router";
import { useTranslation } from "react-i18next";
import { Pressable, View } from "react-native";
import type {
  HomeMoney,
  HomeOverview,
} from "@/data/selectors/document-selectors";
import { formatCurrency } from "@/shared/lib/currency";
import { Text } from "@/shared/ui/app-text";
import { FilledIcon, type FilledIconName } from "@/shared/ui/filled-icon";

export type OverviewCardModel = {
  id: string;
  title: string;
  tab: string;
  context: string;
  icon: FilledIconName;
  value: HomeMoney;
  footer: string;
  alert?: string;
  href: Href;
  action: string;
  stats: { label: string; value: HomeMoney; tone?: string }[];
};
export function useOverviewCards(
  overview: HomeOverview,
  now: Date,
  visible: boolean,
): OverviewCardModel[] {
  const { t, i18n } = useTranslation();
  return [
    {
      id: "balance",
      title: t("home.overview.balance"),
      tab: t("home.overview.balanceTab"),
      context: overview.currencyCode,
      icon: "wallet",
      value: overview.balance,
      footer: t("home.overview.includedAccounts", {
        count: overview.accountCount,
      }),
      href: "/accounts",
      action: t("home.overview.accounts"),
      stats: [
        { label: t("home.overview.positiveBalances"), value: overview.assets },
        {
          label: t("home.overview.negativeBalances"),
          value: overview.debt,
          tone: "text-danger",
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
      footer:
        visible && !overview.dailyExpense.unconverted.length
          ? t("home.overview.dailyAverage", {
              amount: formatCurrency(
                overview.dailyExpense.amount,
                overview.currencyCode,
              ),
            })
          : t("home.budgets.transactions", {
              count: overview.transactionCount,
            }),
      href: "/search",
      action: t("home.overview.activity"),
      stats: [
        {
          label: t("home.overview.income"),
          value: overview.income,
          tone: "text-success",
        },
        {
          label: t("home.overview.expenses"),
          value: overview.expense,
          tone: "text-danger",
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
        ? overview.next.name +
          " · " +
          overview.next.date.toLocaleDateString(i18n.resolvedLanguage, {
            month: "short",
            day: "numeric",
          })
        : t("home.overview.nothingScheduled"),
      alert: overview.overdueCount
        ? t("home.overview.overdueShort", { count: overview.overdueCount })
        : undefined,
      href: "/recurring",
      action: t("home.overview.recurring"),
      stats: [
        {
          label: t("home.overview.expectedIncome"),
          value: overview.upcomingIncome,
          tone: "text-success",
        },
        { label: t("home.overview.scheduledNet"), value: overview.upcomingNet },
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
  return (
    <View className="gap-1">
      <Text
        className={`font-manrope-bold ${large ? "text-4xl" : "text-lg"} ${tone}`}
        style={{ fontVariant: ["tabular-nums"] }}
      >
        {visible
          ? `${value.rateDate || value.unconverted.length ? "≈ " : ""}${value.amount < 0 ? "−" : ""}${formatCurrency(value.amount, value.currencyCode)}`
          : "••••••"}
      </Text>
      {visible &&
        value.unconverted.map((item) => (
          <Text key={item.currencyCode} className="text-xs text-muted">
            {item.amount < 0 ? "−" : "+"}
            {formatCurrency(item.amount, item.currencyCode)} {item.currencyCode}
          </Text>
        ))}
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
  const values = [card.value, ...card.stats.map((stat) => stat.value)];
  const partial = values.some((value) => value.unconverted.length > 0);
  const rateDate = values
    .map((value) => value.rateDate)
    .filter((date): date is string => !!date)
    .sort()[0];
  return (
    <View className="grow gap-4 rounded-[28px] border border-border bg-surface px-5 pt-5 pb-2">
      <View className="flex-row items-center gap-2">
        <FilledIcon name={card.icon} size={18} tone="accent" />
        <Text className="min-w-0 flex-1 font-manrope-semibold text-sm text-muted">
          {card.title}
        </Text>
        <View className="rounded-full bg-surface-secondary px-2.5 py-1">
          <Text className="font-manrope-medium text-xs text-muted">
            {card.context}
          </Text>
        </View>
      </View>
      <Money value={card.value} visible={visible} large />
      <View className="flex-row gap-4">
        {card.stats.map((stat, index) => (
          <View
            key={stat.label}
            className={`min-w-0 flex-1 gap-1 ${index ? "border-s border-border ps-4" : ""}`}
          >
            <Text className="text-xs text-muted">{stat.label}</Text>
            <Money value={stat.value} visible={visible} tone={stat.tone} />
          </View>
        ))}
      </View>
      <View className="mt-auto border-t border-border">
        <Pressable
          onPress={() => router.push(card.href)}
          accessibilityRole="button"
          accessibilityLabel={[card.footer, card.alert, card.action]
            .filter(Boolean)
            .join(". ")}
          className="min-h-11 flex-row items-center gap-2"
          style={({ pressed }) => ({ opacity: pressed ? 0.6 : 1 })}
        >
          <View className="min-w-0 flex-1 gap-1 py-2">
            <Text className="text-xs text-muted" numberOfLines={1}>
              {card.footer}
            </Text>
            {card.alert && (
              <Text className="text-xs text-danger">{card.alert}</Text>
            )}
          </View>
          <FilledIcon name="chevron-right" size={19} tone="accent" />
        </Pressable>
        {partial || rateDate ? (
          <Text className="pb-2 text-xs text-muted">
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
      accessibilityRole="button"
      accessibilityLabel={t(
        visible ? "home.overview.hideAmounts" : "home.overview.showAmounts",
      )}
      className="size-11 items-center justify-center rounded-full"
    >
      <FilledIcon name={visible ? "eye" : "eye-off"} size={19} tone="muted" />
    </Pressable>
  );
}
