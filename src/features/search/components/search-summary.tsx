import { useTranslation } from "react-i18next";
import { Pressable, View } from "react-native";

import type {
  SearchOutcome,
  SearchSort,
} from "@/data/selectors/search-selectors";
import { useCurrencyFormat } from "@/shared/lib/use-currency-format";
import { Text } from "@/shared/ui/app-text";
import { FilledIcon, type FilledIconName } from "@/shared/ui/filled-icon";

function Metric({
  icon,
  label,
  value,
  tone,
  divider = false,
}: {
  icon: FilledIconName;
  label: string;
  value: string;
  tone: "success" | "foreground" | "danger";
  divider?: boolean;
}) {
  // One full-width row per metric: long amounts get the whole line instead of
  // a third of it, so they are never clipped (Android ignores font shrinking).
  return (
    <View
      className={`min-h-12 flex-row items-center gap-3 px-4 py-2.5 ${
        divider ? "border-b border-border" : ""
      }`}
    >
      <FilledIcon name={icon} size={17} tone={tone} />
      <Text numberOfLines={1} className="flex-1 font-sans text-sm text-muted">
        {label}
      </Text>
      <Text
        selectable
        className={`shrink font-manrope-bold text-base ${
          tone === "success"
            ? "text-success"
            : tone === "danger"
              ? "text-danger"
              : "text-foreground"
        }`}
        style={{ fontVariant: ["tabular-nums"] }}
      >
        {value}
      </Text>
    </View>
  );
}

type SearchSummaryProps = {
  outcome: SearchOutcome;
  sort: SearchSort;
  onSortPress: () => void;
};

export function SearchSummary({
  outcome,
  sort,
  onSortPress,
}: SearchSummaryProps) {
  const { t, i18n } = useTranslation();
  const { formatCurrency } = useCurrencyFormat();
  const count = (value: number) =>
    new Intl.NumberFormat(i18n.resolvedLanguage).format(value);

  return (
    <View className="gap-4 rounded-[28px] bg-surface p-5">
      <View className="flex-row items-center justify-between gap-3">
        <Text
          accessibilityRole="header"
          className="flex-1 font-manrope-bold text-lg text-foreground"
        >
          {t("search.results.matches", {
            count: outcome.total,
            formattedCount: count(outcome.total),
          })}
        </Text>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={`${t("search.sort.title")}: ${t(`search.sort.${sort}`)}`}
          hitSlop={6}
          onPress={onSortPress}
          className="min-h-9 flex-row items-center gap-1.5 rounded-full bg-surface-secondary px-3"
          style={({ pressed }) => ({ opacity: pressed ? 0.7 : 1 })}
        >
          <FilledIcon name="sort" size={16} tone="muted" />
          <Text className="font-manrope-semibold text-xs text-foreground">
            {t(`search.sort.${sort}`)}
          </Text>
        </Pressable>
      </View>

      {outcome.totals.map((totals) => (
        <View key={totals.currencyCode} className="gap-2">
          {outcome.totals.length > 1 ? (
            <Text className="font-manrope-semibold text-xs text-muted">
              {totals.currencyCode}
            </Text>
          ) : null}
          <View className="overflow-hidden rounded-2xl bg-surface-secondary">
            <Metric
              icon="arrow-bottom-left"
              label={t("search.summary.income")}
              value={formatCurrency(totals.income, totals.currencyCode)}
              tone="success"
              divider
            />
            <Metric
              icon="arrow-top-right"
              label={t("search.summary.expenses")}
              value={formatCurrency(totals.expense, totals.currencyCode)}
              tone="foreground"
              divider
            />
            <Metric
              icon="wallet"
              label={t("search.summary.net")}
              value={formatCurrency(totals.net, totals.currencyCode)}
              tone={totals.net < 0 ? "danger" : "foreground"}
            />
          </View>
        </View>
      ))}

      {outcome.transfers > 0 ? (
        <View className="flex-row items-center gap-2">
          <FilledIcon name="swap-horizontal" size={15} tone="muted" />
          <Text className="flex-1 font-sans text-xs text-muted">
            {t("search.summary.transfers", {
              count: outcome.transfers,
              formattedCount: count(outcome.transfers),
            })}
          </Text>
        </View>
      ) : null}
    </View>
  );
}
