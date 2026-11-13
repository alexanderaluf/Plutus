import type {
  Category,
  CategoryTotal,
} from "@/data/selectors/category-selectors";
import type { HomeCategoryRow } from "@/data/selectors/home-section-selectors";
import { useCategoryClock } from "@/features/categories/use-category-clock";
import { colorForeground } from "@/shared/icons/colors";
import { useCurrencyFormat } from "@/shared/lib/use-currency-format";
import { colorWithAlpha, useAppThemeColors } from "@/shared/theme/app-theme";
import { Text } from "@/shared/ui/app-text";
import { RecordIcon } from "@/shared/ui/record-icon";
import { useRouter } from "expo-router";
import { useTranslation } from "react-i18next";
import { Pressable, StyleSheet, View } from "react-native";

import { HomeSectionHeader } from "./home-section-header";

export function CategoryListHeader({
  count,
  now,
}: {
  count: number;
  now?: Date;
}) {
  const { t, i18n } = useTranslation();
  const router = useRouter();
  const clockNow = useCategoryClock();
  const activeDate = now ?? clockNow;
  const monthLabel = activeDate.toLocaleDateString(i18n.resolvedLanguage, {
    month: "long",
    year: "numeric",
  });

  return (
    <HomeSectionHeader
      title={t("categories.list.title")}
      count={count}
      subtitle={monthLabel}
      actionLabel={t("categories.list.manage")}
      actionIcon="plus"
      onActionPress={() => router.push("/categories")}
    />
  );
}

export function CategoryListRow({
  row,
  total,
  fallbackCurrency,
  onPress,
}: {
  row: HomeCategoryRow;
  total?: CategoryTotal;
  fallbackCurrency: string;
  onPress: (category: Category) => void;
}) {
  const { formatCurrency } = useCurrencyFormat();
  const { t } = useTranslation();
  const theme = useAppThemeColors();
  const { category, depth, last } = row;
  const amounts = Object.entries(total?.amounts ?? {});
  const displayAmounts = amounts.length
    ? amounts
    : ([[fallbackCurrency, 0]] as [string, number][]);
  const hasNonZero = displayAmounts.some(([, amount]) => amount !== 0);

  const toneColor =
    category.type === 0
      ? theme.danger
      : category.type === 1
        ? theme.success
        : theme.foreground;
  const amountColor = hasNonZero ? toneColor : theme.muted;

  const indent = depth ? 14 + Math.min(depth, 5) * 14 : 16;
  const txLabel = total?.count
    ? t("categories.list.transactionCount", { count: total.count })
    : t("categories.list.noTransactions");
  const subtitle = category.description
    ? total?.count
      ? `${category.description} · ${txLabel}`
      : category.description
    : txLabel;

  return (
    <View
      style={{
        backgroundColor: theme.surface,
        borderColor: theme.border,
        borderTopWidth: depth === 0 ? 1 : 0,
        borderLeftWidth: 1,
        borderRightWidth: 1,
        borderBottomWidth: last ? 1 : 0,
        borderTopLeftRadius: depth === 0 ? 24 : 0,
        borderTopRightRadius: depth === 0 ? 24 : 0,
        borderBottomLeftRadius: last ? 24 : 0,
        borderBottomRightRadius: last ? 24 : 0,
        borderCurve: "continuous",
        overflow: "hidden",
        marginBottom: last ? 12 : 0,
      }}
    >
      {depth > 0 ? (
        <View
          style={{
            height: StyleSheet.hairlineWidth,
            backgroundColor: theme.border,
            marginStart: indent,
            marginEnd: 16,
          }}
        />
      ) : null}
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={t("categories.list.openWithTransactions", {
          name: category.name,
          count: total?.count ?? 0,
        })}
        onPress={() => onPress(category)}
        className="flex-row items-center gap-3 py-3.5 pe-4"
        style={({ pressed }) => ({
          paddingStart: indent,
          opacity: pressed ? 0.68 : 1,
        })}
      >
        {depth > 0 ? (
          <View
            className="w-0.5 self-stretch rounded-full"
            style={{
              backgroundColor: colorWithAlpha(category.color, 0.35),
              marginVertical: 2,
            }}
          />
        ) : null}
        <View
          className={
            depth > 0
              ? "size-8 shrink-0 items-center justify-center rounded-xl"
              : "size-11 shrink-0 items-center justify-center rounded-2xl"
          }
          style={{
            backgroundColor: category.color,
            borderCurve: "continuous",
          }}
        >
          <RecordIcon
            name={category.icon}
            pathData={category.iconPath}
            color={colorForeground(category.color)}
            size={depth > 0 ? 16 : 21}
          />
        </View>

        <View className="min-w-0 flex-1 gap-0.5">
          <Text
            numberOfLines={1}
            className={
              depth > 0
                ? "font-manrope-semibold text-[14px] leading-[19px] text-foreground"
                : "font-manrope-bold text-[15px] leading-[20px] text-foreground"
            }
          >
            {category.name}
          </Text>
          <Text
            numberOfLines={1}
            className="font-sans text-[12px] leading-[16px] text-muted"
          >
            {subtitle}
          </Text>
        </View>

        <View className="ms-2 max-w-[36%] shrink-0 items-end gap-0.5">
          {displayAmounts.map(([currency, amount]) => (
            <Text
              key={currency}
              adjustsFontSizeToFit
              minimumFontScale={0.78}
              numberOfLines={1}
              className="text-right font-manrope-bold text-[14px] leading-[19px]"
              style={{ color: amountColor, fontVariant: ["tabular-nums"] }}
            >
              {formatCurrency(amount, currency)}
            </Text>
          ))}
        </View>
      </Pressable>
    </View>
  );
}
