import type {
  Category,
  CategoryTotal,
} from "@/data/selectors/category-selectors";
import { CategoryBadge } from "@/features/categories/components/category-ui";
import { formatCurrency } from "@/shared/lib/currency";
import { useAppThemeColors } from "@/shared/theme/app-theme";
import { Text } from "@/shared/ui/app-text";
import { FilledIcon } from "@/shared/ui/filled-icon";
import { useRouter } from "expo-router";
import { Button } from "heroui-native";
import { useMemo } from "react";
import { Pressable, StyleSheet, View } from "react-native";
import { useTranslation } from "react-i18next";

type CategoryTree = {
  category: Category;
  children: CategoryTree[];
};

function createCategoryTree(categories: Category[]): CategoryTree[] {
  const byParentId = new Map<string, Category[]>();
  const roots: Category[] = [];
  const categoryIds = new Set(categories.map((category) => category.id));

  for (const category of categories) {
    if (!category.parentId || !categoryIds.has(category.parentId)) {
      roots.push(category);
      continue;
    }
    const children = byParentId.get(category.parentId) ?? [];
    children.push(category);
    byParentId.set(category.parentId, children);
  }

  const toTree = (
    category: Category,
    ancestors: Set<string>,
  ): CategoryTree => ({
    category,
    children: (byParentId.get(category.id) ?? [])
      .filter((child) => !ancestors.has(child.id))
      .map((child) => toTree(child, new Set([...ancestors, child.id]))),
  });
  const tree = roots.map((category) =>
    toTree(category, new Set([category.id])),
  );
  const rendered = new Set<string>();
  const markRendered = (nodes: CategoryTree[]) => {
    for (const node of nodes) {
      rendered.add(node.category.id);
      markRendered(node.children);
    }
  };

  markRendered(tree);
  for (const category of categories) {
    if (!rendered.has(category.id)) {
      const branch = toTree(category, new Set([category.id]));
      tree.push(branch);
      markRendered([branch]);
    }
  }

  return tree;
}

function CategoryAmounts({
  category,
  total,
  fallbackCurrency,
}: {
  category: Category;
  total?: CategoryTotal;
  fallbackCurrency: string;
}) {
  const theme = useAppThemeColors();
  const amounts = Object.entries(total?.amounts ?? {});
  const color =
    category.type === 0
      ? theme.danger
      : category.type === 1
        ? theme.success
        : theme.foreground;

  return (
    <View className="items-end" style={styles.amounts}>
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
  );
}

function SubcategoryRows({
  categories,
  depth,
  totals,
  fallbackCurrency,
  onPress,
}: {
  categories: CategoryTree[];
  depth: number;
  totals: Map<string, CategoryTotal>;
  fallbackCurrency: string;
  onPress: (category: Category) => void;
}) {
  const { t } = useTranslation();

  return categories.map(({ category, children }) => {
    const total = totals.get(category.id);

    return (
      <View key={category.id}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={t("categories.list.openWithTransactions", {
            name: category.name,
            count: total?.count ?? 0,
          })}
          onPress={() => onPress(category)}
          className="flex-row items-center gap-3 border-t border-border py-3 pe-3"
          style={({ pressed }) => [
            { paddingStart: 16 + depth * 16 },
            pressed && styles.pressed,
          ]}
        >
          <CategoryBadge category={category} small />
          <View className="min-w-0 flex-1 gap-0.5">
            <Text
              numberOfLines={1}
              className="font-manrope-semibold text-sm text-foreground"
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
          <CategoryAmounts
            category={category}
            total={total}
            fallbackCurrency={fallbackCurrency}
          />
        </Pressable>
        {children.length ? (
          <SubcategoryRows
            categories={children}
            depth={depth + 1}
            totals={totals}
            fallbackCurrency={fallbackCurrency}
            onPress={onPress}
          />
        ) : null}
      </View>
    );
  });
}

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
  const categoryTree = useMemo(
    () => createCategoryTree(categories),
    [categories],
  );

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
      {categoryTree.map(({ category, children }) => {
        const total = totals.get(category.id);

        return (
          <View
            key={category.id}
            className="overflow-hidden rounded-[24px] border border-border bg-surface"
          >
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={t("categories.list.openWithTransactions", {
                name: category.name,
                count: total?.count ?? 0,
              })}
              onPress={() => onPress(category)}
              className="flex-row items-center gap-3 p-3"
              style={({ pressed }) => pressed && styles.pressed}
            >
              <CategoryBadge category={category} />
              <View className="min-w-0 flex-1 gap-1">
                <Text
                  numberOfLines={1}
                  className="font-manrope-bold text-base text-foreground"
                >
                  {category.name}
                </Text>
                <Text
                  numberOfLines={1}
                  className="font-sans text-xs text-muted"
                >
                  {category.description ||
                    (total?.count
                      ? t("categories.list.transactionCount", {
                          count: total.count,
                        })
                      : t("categories.list.noTransactions"))}
                </Text>
              </View>
              <CategoryAmounts
                category={category}
                total={total}
                fallbackCurrency={fallbackCurrency}
              />
            </Pressable>
            {children.length ? (
              <SubcategoryRows
                categories={children}
                depth={1}
                totals={totals}
                fallbackCurrency={fallbackCurrency}
                onPress={onPress}
              />
            ) : null}
          </View>
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

const styles = StyleSheet.create({
  amounts: { maxWidth: "34%" },
  pressed: { opacity: 0.68 },
});
