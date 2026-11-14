import {
  EdgeToEdgeFlatList,
  EdgeToEdgeLayout,
} from "@/shared/ui/edge-to-edge-layout";
import { BottomSafeAreaGradient } from "@/shared/ui/safe-area-gradients";
import Animated from "react-native-reanimated";
import { BlurTargetView } from "expo-blur";
import {
  categoryEntrance,
  categoryLayout,
  categoryExit,
} from "./components/category-motion";
import { useRouter } from "expo-router";
import { Button } from "heroui-native";
import { Fragment, useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import {
  I18nManager,
  Pressable,
  StyleSheet,
  View,
  type ViewInstance,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useLocalData } from "@/data/local-data-provider";
import type { CategoryType } from "@/data/model/category-record";
import {
  selectCategories,
  selectCategoryMonthlyTotals,
} from "@/data/selectors/document-selectors";
import type {
  Category,
  CategoryTotal,
} from "@/data/selectors/category-selectors";
import {
  BudgetOption,
  BudgetSheet,
} from "@/features/budgets/components/budget-ui";
import { useProfiles } from "@/features/profile/profile-provider";
import { colorForeground } from "@/shared/icons/colors";
import { useCurrencyFormat } from "@/shared/lib/use-currency-format";
import { colorWithAlpha, useAppThemeColors } from "@/shared/theme/app-theme";
import { Text } from "@/shared/ui/app-text";
import { FilledIcon } from "@/shared/ui/filled-icon";
import { CONTINUOUS, TABULAR } from "@/shared/ui/form-ui";
import { RecordIcon } from "@/shared/ui/record-icon";
import { CategoryHeader, CategoryTypeSelector } from "./components/category-ui";
import {
  buildCategoryTree,
  sortCategories,
  summarizeMonth,
  type CategorySort,
} from "./lib/category-list-helpers";
import { useCategoryClock } from "./use-category-clock";

/** Expense reads red and income green, as everywhere else in the app. */
function useTypeColor(type: CategoryType) {
  const theme = useAppThemeColors();
  return type === 0 ? theme.danger : type === 1 ? theme.success : theme.foreground;
}

function Amounts({
  total,
  color,
  large = false,
}: {
  total: { amount: number; currencyCode: string }[];
  color: string;
  large?: boolean;
}) {
  const { formatCurrency } = useCurrencyFormat();
  return (
    <View className={large ? "gap-0.5" : "items-end gap-0.5"}>
      {total.map(({ amount, currencyCode }) => (
        <Text
          key={currencyCode}
          numberOfLines={1}
          adjustsFontSizeToFit
          minimumFontScale={0.6}
          className={
            large
              ? "font-manrope-bold text-[34px] leading-[42px]"
              : "font-manrope-bold text-[15px]"
          }
          style={{ ...TABULAR, color, writingDirection: "ltr" }}
        >
          {formatCurrency(amount, currencyCode)}
        </Text>
      ))}
    </View>
  );
}

function ShareBar({ share, color }: { share: number; color: string }) {
  const theme = useAppThemeColors();
  return (
    <View
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
      className="mt-1.5 h-1 overflow-hidden rounded-full"
      style={{ backgroundColor: theme.surfaceSecondary }}
    >
      <View
        className="h-full rounded-full"
        style={{
          width: `${Math.max(share * 100, 2)}%`,
          backgroundColor: color,
        }}
      />
    </View>
  );
}

/**
 * One category line. Identity on the start side (icon, name, description),
 * this month's numbers on the end side (amount, then how many transactions).
 */
function CategoryRow({
  category,
  total,
  share,
  child = false,
  onPress,
}: {
  category: Category;
  total: CategoryTotal | undefined;
  share: number | null;
  child?: boolean;
  onPress: () => void;
}) {
  const { t } = useTranslation();
  const theme = useAppThemeColors();
  const typeColor = useTypeColor(category.type);
  const count = total?.count ?? 0;
  const amounts = Object.entries(total?.amounts ?? {})
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([currencyCode, amount]) => ({ currencyCode, amount }));
  const badge = child ? 32 : 44;
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={t("categories.list.openWithTransactions", {
        name: category.name,
        count,
      })}
      onPress={onPress}
      style={({ pressed }) => ({
        flexDirection: "row",
        alignItems: "center",
        gap: 12,
        paddingVertical: child ? 11 : 14,
        paddingStart: child ? 28 : 16,
        paddingEnd: 16,
        backgroundColor: pressed ? theme.surfaceSecondary : "transparent",
      })}
    >
      <View
        style={{
          width: badge,
          height: badge,
          borderRadius: Math.round(badge * 0.3),
          ...CONTINUOUS,
          alignItems: "center",
          justifyContent: "center",
          backgroundColor: category.color,
        }}
      >
        <RecordIcon
          name={category.icon}
          pathData={category.iconPath}
          color={colorForeground(category.color)}
          size={Math.round(badge * 0.5)}
        />
      </View>
      <View className="min-w-0 flex-1 gap-0.5">
        <Text
          numberOfLines={1}
          className={`font-manrope-semibold text-foreground ${child ? "text-[15px]" : "text-base"}`}
        >
          {category.name}
        </Text>
        {category.description ? (
          <Text numberOfLines={1} className="text-[13px] text-muted">
            {category.description}
          </Text>
        ) : null}
        {share !== null && count > 0 && (
          <ShareBar share={share} color={category.color} />
        )}
      </View>
      <View className="max-w-[42%] items-end gap-0.5">
        {count > 0 && <Amounts total={amounts} color={typeColor} />}
        <Text numberOfLines={1} className="text-[12px] text-muted">
          {count
            ? t("categories.list.transactionCount", { count })
            : t("categories.list.noTransactions")}
        </Text>
      </View>
    </Pressable>
  );
}

export function CategoriesScreen() {
  const { t, i18n } = useTranslation();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const theme = useAppThemeColors();
  const blurTargetRef = useRef<ViewInstance | null>(null);
  const { document } = useLocalData();
  const { activeProfile } = useProfiles();
  const now = useCategoryClock();
  const [type, setType] = useState<CategoryType>(0);
  const [sort, setSort] = useState<CategorySort>("original");
  const [sheet, setSheet] = useState<"sort" | "info" | null>(null);
  const typeColor = useTypeColor(type);
  const typeLabels = [
    t("categories.common.types.expense"),
    t("categories.common.types.income"),
    t("categories.common.types.transfer"),
  ] as const;
  const categories = useMemo(() => selectCategories(document), [document]);
  const totals = useMemo(
    () => selectCategoryMonthlyTotals(document, now),
    [document, now],
  );
  const { roots, children } = useMemo(
    () => buildCategoryTree(categories.filter((c) => c.type === type)),
    [categories, type],
  );
  const summary = summarizeMonth(roots, totals);
  const sortedRoots = sortCategories(roots, sort, totals);
  const monthLabel = now.toLocaleDateString(i18n.resolvedLanguage, {
    month: "long",
    year: "numeric",
  });
  const openCategory = (id: string) =>
    router.push({ pathname: "/categories/[id]", params: { id } });
  const sortOptions: [CategorySort, string][] = [
    ["original", t("categories.list.sortOriginal")],
    ["name", t("categories.list.sortName")],
    ["amount", t("categories.list.sortAmount")],
  ];
  return (
    <EdgeToEdgeLayout
      header={
        <CategoryHeader title={t("categories.list.title")}>
          {roots.length > 1 && (
            <Button
              isIconOnly
              variant="ghost"
              accessibilityLabel={t("categories.list.sortTitle")}
              onPress={() => setSheet("sort")}
            >
              <FilledIcon
                name="sort"
                size={25}
                color={sort === "original" ? theme.foreground : theme.accent}
              />
            </Button>
          )}
          <Button
            isIconOnly
            variant="ghost"
            accessibilityLabel={t("categories.list.about")}
            onPress={() => setSheet("info")}
          >
            <FilledIcon name="help" size={25} />
          </Button>
        </CategoryHeader>
      }
      bottomFade={false}
    >
      {(contentInsets) => (
        <>
          <BlurTargetView ref={blurTargetRef} style={{ flex: 1 }}>
            <EdgeToEdgeFlatList
              data={sortedRoots}
              keyExtractor={(item) => item.id}
              contentContainerStyle={{
                paddingTop: contentInsets.top + 8,
                paddingHorizontal: 16,
                paddingBottom: 170 + insets.bottom,
                gap: 12,
                flexGrow: 1,
              }}
              ListHeaderComponent={
                roots.length ? (
                  <Animated.View
                    entering={categoryEntrance(40)}
                    className="mb-2 gap-1 rounded-[28px] border border-border bg-surface p-4"
                    style={CONTINUOUS}
                  >
                    <Text className="font-manrope-semibold text-[15px] text-muted">
                      {typeLabels[type]} · {monthLabel}
                    </Text>
                    <Amounts
                      large
                      color={summary.count ? typeColor : theme.foreground}
                      total={
                        summary.amounts.length
                          ? summary.amounts
                          : [{ amount: 0, currencyCode: activeProfile.currencyCode }]
                      }
                    />
                    <Text className="text-[13px] text-muted">
                      {summary.count
                        ? t("categories.list.transactionCount", {
                            count: summary.count,
                          })
                        : t("categories.list.noTransactions")}
                    </Text>
                  </Animated.View>
                ) : undefined
              }
              renderItem={({ item, index }) => {
                const kids = sortCategories(
                  children.get(item.id) ?? [],
                  sort,
                  totals,
                );
                return (
                  <Animated.View
                    entering={categoryEntrance(70 + Math.min(index, 7) * 35)}
                    exiting={categoryExit}
                    layout={categoryLayout}
                    className="overflow-hidden rounded-[24px] border border-border bg-surface"
                    style={CONTINUOUS}
                  >
                    <CategoryRow
                      category={item}
                      total={totals.get(item.id)}
                      share={summary.share(totals.get(item.id))}
                      onPress={() => openCategory(item.id)}
                    />
                    {kids.map((child) => (
                      <Fragment key={child.id}>
                        <View
                          style={{
                            height: StyleSheet.hairlineWidth,
                            backgroundColor: theme.border,
                            marginStart: 28 + 32 + 12,
                          }}
                        />
                        <CategoryRow
                          child
                          category={child}
                          total={totals.get(child.id)}
                          share={null}
                          onPress={() => openCategory(child.id)}
                        />
                      </Fragment>
                    ))}
                  </Animated.View>
                );
              }}
              ListEmptyComponent={
                <Animated.View
                  entering={categoryEntrance(90)}
                  className="flex-1 items-center justify-center gap-3 px-8"
                >
                  <View
                    className="size-20 items-center justify-center rounded-[26px]"
                    style={{
                      ...CONTINUOUS,
                      backgroundColor: colorWithAlpha(theme.accent, 0.12),
                    }}
                  >
                    <FilledIcon name="shopping" size={40} tone="accent" />
                  </View>
                  <Text className="mt-2 text-center font-manrope-bold text-xl text-foreground">
                    {t("categories.list.emptyTitle", {
                      type: typeLabels[type].toLocaleLowerCase(
                        i18n.resolvedLanguage,
                      ),
                    })}
                  </Text>
                  <Text className="text-center font-sans text-[15px] leading-6 text-muted">
                    {t("categories.list.emptyDescription")}
                  </Text>
                </Animated.View>
              }
            />
          </BlurTargetView>
          <BottomSafeAreaGradient />
          <Animated.View
            entering={categoryEntrance(180)}
            style={{
              position: "absolute",
              left: 12,
              right: 12,
              bottom: Math.max(insets.bottom, 10),
              zIndex: 20,
            }}
          >
            <CategoryTypeSelector
              blurTarget={blurTargetRef}
              value={type}
              onChange={setType}
            />
          </Animated.View>
          <Animated.View
            entering={categoryEntrance(180)}
            style={{
              position: "absolute",
              left: I18nManager.isRTL ? 20 : undefined,
              right: I18nManager.isRTL ? undefined : 20,
              bottom: Math.max(insets.bottom, 10) + 76,
              zIndex: 20,
            }}
          >
            <Button
              isIconOnly
              accessibilityLabel={t("categories.list.add")}
              className="size-16 rounded-full bg-accent"
              onPress={() =>
                router.push({
                  pathname: "/categories/create",
                  params: { type: String(type) },
                })
              }
            >
              <FilledIcon name="plus" size={32} tone="accent-foreground" />
            </Button>
          </Animated.View>
          {sheet === "sort" && (
            <BudgetSheet
              title={t("categories.list.sortTitle")}
              onClose={() => setSheet(null)}
            >
              {sortOptions.map(([value, title]) => (
                <BudgetOption
                  key={value}
                  title={title}
                  selected={sort === value}
                  onPress={() => {
                    setSort(value);
                    setSheet(null);
                  }}
                />
              ))}
            </BudgetSheet>
          )}
          {sheet === "info" && (
            <BudgetSheet
              title={t("categories.list.about")}
              onClose={() => setSheet(null)}
            >
              <Text className="text-base leading-7 text-foreground">
                {t("categories.list.aboutDescription")}
              </Text>
            </BudgetSheet>
          )}
        </>
      )}
    </EdgeToEdgeLayout>
  );
}
