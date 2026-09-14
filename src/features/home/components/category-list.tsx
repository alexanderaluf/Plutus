import type {
  Category,
  CategoryTotal,
} from "@/data/selectors/category-selectors";
import { CategoryBadge } from "@/features/categories/components/category-ui";
import { formatCurrency } from "@/shared/lib/currency";
import { Text } from "@/shared/ui/app-text";
import { FilledIcon } from "@/shared/ui/filled-icon";
import { useRouter } from "expo-router";
import { Button } from "heroui-native";
import { useTranslation } from "react-i18next";
import { Pressable, View } from "react-native";

export function CategoryList({
  categories,
  totals,
  fallbackCurrency,
  onPress,
}: {
  categories: Category[];
  totals: Map<string, CategoryTotal>;
  fallbackCurrency: string;
  onPress: (category: Category) => void;
}) {
  const { t } = useTranslation();
  const router = useRouter();

  return (
    <View className="gap-3">
      <View className="flex-row items-center justify-between">
        <View className="min-w-0 flex-1 flex-row items-center gap-2">
          <Text className="font-manrope-bold text-lg text-foreground">
            {t("categories.list.title")}
          </Text>
          <Text className="text-xs text-muted">{categories.length}</Text>
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
      {categories.map((category) => {
        const total = totals.get(category.id);
        const amounts = Object.entries(total?.amounts ?? {});

        return (
          <Pressable
            key={category.id}
            accessibilityRole="button"
            accessibilityLabel={t("categories.list.openWithTransactions", {
              name: category.name,
              count: total?.count ?? 0,
            })}
            onPress={() => onPress(category)}
            className="flex-row items-center gap-3 rounded-[24px] border border-border bg-surface p-3"
            style={({ pressed }) => ({ opacity: pressed ? 0.68 : 1 })}
          >
            <CategoryBadge category={category} />
            <View className="min-w-0 flex-1 gap-1">
              <Text
                numberOfLines={1}
                className="font-manrope-bold text-base text-foreground"
              >
                {category.name}
              </Text>
              <Text numberOfLines={1} className="font-sans text-xs text-muted">
                {category.description ||
                  (total?.count
                    ? t("categories.list.transactionCount", {
                        count: total.count,
                      })
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
                  style={{ color: category.color }}
                >
                  {formatCurrency(amount, currency)}
                </Text>
              ))}
            </View>
          </Pressable>
        );
      })}
      {!categories.length && (
        <View className="rounded-3xl bg-surface p-4">
          <Text className="text-sm text-muted">
            {t("home.categories.empty")}
          </Text>
        </View>
      )}
    </View>
  );
}
