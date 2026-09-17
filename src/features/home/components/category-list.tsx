import type {
  Category,
  CategoryTotal,
} from "@/data/selectors/category-selectors";
import type { HomeCategoryRow } from "@/data/selectors/home-section-selectors";
import { CategoryBadge } from "@/features/categories/components/category-ui";
import { formatCurrency } from "@/shared/lib/currency";
import { useAppThemeColors } from "@/shared/theme/app-theme";
import { Text } from "@/shared/ui/app-text";
import { FilledIcon } from "@/shared/ui/filled-icon";
import { useRouter } from "expo-router";
import { Button } from "heroui-native";
import { Pressable, View } from "react-native";
import { useTranslation } from "react-i18next";

export function CategoryListHeader({ count }: { count: number }) {
  const { t } = useTranslation();
  const router = useRouter();
  return (
    <View className="mb-3 flex-row items-center justify-between">
      <View className="min-w-0 flex-1 flex-row items-center gap-2">
        <Text className="font-manrope-bold text-lg text-foreground">
          {t("categories.list.title")}
        </Text>
        <Text className="text-xs text-muted">{count}</Text>
      </View>
      <Button
        size="sm"
        variant="outline"
        onPress={() => router.push("/categories")}
      >
        <FilledIcon name="plus" size={16} tone="accent" />
        <Button.Label className="font-manrope-semibold text-accent">
          {t("categories.list.manage")}
        </Button.Label>
      </Button>
    </View>
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
  const { t } = useTranslation();
  const theme = useAppThemeColors();
  const { category, depth, last } = row;
  const amounts = Object.entries(total?.amounts ?? {});
  const color =
    category.type === 0
      ? theme.danger
      : category.type === 1
        ? theme.success
        : theme.foreground;
  return (
    <View
      style={{
        backgroundColor: theme.surface,
        borderColor: theme.border,
        borderTopWidth: 1,
        borderLeftWidth: 1,
        borderRightWidth: 1,
        borderBottomWidth: last ? 1 : 0,
        borderTopLeftRadius: depth === 0 ? 24 : 0,
        borderTopRightRadius: depth === 0 ? 24 : 0,
        borderBottomLeftRadius: last ? 24 : 0,
        borderBottomRightRadius: last ? 24 : 0,
        overflow: "hidden",
        marginBottom: last ? 12 : 0,
      }}
    >
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={t("categories.list.openWithTransactions", {
          name: category.name,
          count: total?.count ?? 0,
        })}
        onPress={() => onPress(category)}
        className="flex-row items-center gap-3 py-3 pe-3"
        style={({ pressed }) => ({
          paddingStart: depth ? 16 + Math.min(depth, 6) * 16 : 12,
          opacity: pressed ? 0.68 : 1,
        })}
      >
        <CategoryBadge category={category} small={depth > 0} />
        <View className="min-w-0 flex-1 gap-1">
          <Text
            numberOfLines={1}
            className={
              depth
                ? "font-manrope-semibold text-sm text-foreground"
                : "font-manrope-bold text-base text-foreground"
            }
          >
            {category.name}
          </Text>
          <Text numberOfLines={1} className="font-sans text-xs text-muted">
            {category.description ||
              (total?.count
                ? t("categories.list.transactionCount", { count: total.count })
                : t("categories.list.noTransactions"))}
          </Text>
        </View>
        <View className="items-end" style={{ maxWidth: "34%" }}>
          {(amounts.length
            ? amounts
            : [[fallbackCurrency, 0] as [string, number]]
          ).map(([currency, amount]) => (
            <Text
              key={currency}
              numberOfLines={1}
              className="font-manrope-bold text-sm"
              style={{ color }}
            >
              {formatCurrency(amount, currency)}
            </Text>
          ))}
        </View>
      </Pressable>
    </View>
  );
}
