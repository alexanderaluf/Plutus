import { EdgeToEdgeLayout } from "@/shared/ui/edge-to-edge-layout";
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
import { useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { Alert, FlatList, I18nManager, Pressable, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useLocalData } from "@/data/local-data-provider";
import type { CategoryType } from "@/data/model/category-record";
import {
  selectCategories,
  selectCategoryMonthlyTotals,
} from "@/data/selectors/document-selectors";
import { useProfiles } from "@/features/profile/profile-provider";
import { formatCurrency } from "@/shared/lib/currency";
import { Text } from "@/shared/ui/app-text";
import { FilledIcon } from "@/shared/ui/filled-icon";
import { RecordIcon } from "@/shared/ui/record-icon";
import { useAppThemeColors } from "@/shared/theme/app-theme";
import {
  CategoryBadge,
  CategoryHeader,
  CategoryTypeSelector,
  TYPE_COLORS,
} from "./components/category-ui";
import { useCategoryClock } from "./use-category-clock";

export function CategoriesScreen() {
  const { t, i18n } = useTranslation();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const theme = useAppThemeColors();
  const blurTargetRef = useRef<View | null>(null);
  const { document } = useLocalData();
  const { activeProfile } = useProfiles();
  const now = useCategoryClock();
  const [type, setType] = useState<CategoryType>(0);
  const [alphabetical, setAlphabetical] = useState(false);
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
  const matching = categories.filter((category) => category.type === type);
  const roots = matching.filter((category) => {
    // Imported cycles remain reachable as cards, so they can be repaired.
    const visited = new Set([category.id]);
    let parent = matching.find((item) => item.id === category.parentId);
    if (!parent) return true;
    while (parent) {
      if (visited.has(parent.id)) return true;
      visited.add(parent.id);
      parent = matching.find((item) => item.id === parent!.parentId);
    }
    return false;
  });
  if (alphabetical) roots.sort((a, b) => a.name.localeCompare(b.name));
  const openCategory = (id: string) =>
    router.push({ pathname: "/categories/[id]", params: { id } });
  return (
    <EdgeToEdgeLayout
      header={
        <>
          <CategoryHeader title={t("categories.list.title")}>
            <Button
              isIconOnly
              variant="ghost"
              accessibilityLabel={t("categories.list.about")}
              onPress={() =>
                Alert.alert(
                  t("categories.list.title"),
                  t("categories.list.aboutDescription"),
                )
              }
            >
              <FilledIcon name="help" size={25} />
            </Button>
          </CategoryHeader>
          <Animated.View
            entering={categoryEntrance(40)}
            className="flex-row items-center justify-between px-5 py-2"
          >
            <View>
              <Text className="font-manrope-bold text-lg text-accent">
                {t("categories.list.count", { count: matching.length })}
              </Text>
              <Text className="font-sans text-sm text-muted">
                {now.toLocaleDateString(i18n.resolvedLanguage, {
                  month: "long",
                  year: "numeric",
                })}
              </Text>
            </View>
            <Button
              isIconOnly
              variant="ghost"
              accessibilityLabel={
                alphabetical
                  ? t("categories.list.originalOrder")
                  : t("categories.list.alphabeticalOrder")
              }
              onPress={() => setAlphabetical((value) => !value)}
            >
              <FilledIcon
                name="filter"
                color={alphabetical ? theme.accent : theme.foreground}
                size={26}
              />
            </Button>
          </Animated.View>
        </>
      }
      bottomFade={false}
    >
      {(contentInsets) => (
        <>
          <BlurTargetView ref={blurTargetRef} style={{ flex: 1 }}>
            <FlatList
              data={roots}
              keyExtractor={(item) => item.id}
              contentContainerStyle={{
                paddingTop: contentInsets.top + 8,
                padding: 8,
                paddingBottom: 110 + insets.bottom,
                flexGrow: 1,
              }}
              ItemSeparatorComponent={() => <View className="h-2" />}
              renderItem={({ item, index }) => {
                const total = totals.get(item.id)!;
                const amounts = Object.entries(total.amounts);
                const children = matching.filter(
                  (category) => category.parentId === item.id,
                );
                return (
                  <Animated.View
                    entering={categoryEntrance(70 + Math.min(index, 7) * 35)}
                    exiting={categoryExit}
                    layout={categoryLayout}
                    className="rounded-[26px] border p-3"
                    style={{ borderColor: `${item.color}35` }}
                  >
                    <Pressable
                      accessibilityRole="button"
                      accessibilityLabel={t(
                        "categories.list.openWithTransactions",
                        {
                          name: item.name,
                          count: total.count,
                        },
                      )}
                      onPress={() => openCategory(item.id)}
                      className="flex-row items-center gap-3"
                    >
                      <CategoryBadge category={item} />
                      <View className="flex-1 gap-1">
                        <Text className="font-manrope-bold text-lg text-foreground">
                          {item.name}
                        </Text>
                        {item.description ? (
                          <Text
                            numberOfLines={2}
                            className="font-sans text-sm text-muted"
                          >
                            {item.description}
                          </Text>
                        ) : null}
                        <Text className="font-sans text-sm text-muted">
                          {total.count === 0
                            ? t("categories.list.noTransactions")
                            : t("categories.list.transactionCount", {
                                count: total.count,
                              })}
                        </Text>
                      </View>
                      <View style={{ maxWidth: "40%" }}>
                        {(amounts.length
                          ? amounts
                          : [
                              [activeProfile.currencyCode, 0] as [
                                string,
                                number,
                              ],
                            ]
                        ).map(([currency, amount]) => (
                          <Text
                            key={currency}
                            className="text-right font-manrope-bold text-sm"
                            style={{ color: TYPE_COLORS[type] }}
                          >
                            {formatCurrency(amount, currency)}
                          </Text>
                        ))}
                      </View>
                    </Pressable>
                    {children.length > 0 && (
                      <View
                        className="mt-3 flex-row flex-wrap gap-2"
                        style={{
                          marginLeft: I18nManager.isRTL ? 0 : 68,
                          marginRight: I18nManager.isRTL ? 68 : 0,
                        }}
                      >
                        {children.map((child) => (
                          <Pressable
                            key={child.id}
                            accessibilityRole="button"
                            accessibilityLabel={t("categories.list.open", {
                              name: child.name,
                            })}
                            onPress={() => openCategory(child.id)}
                            className="min-h-9 flex-row items-center gap-1.5 rounded-lg px-2 py-1"
                            style={{ backgroundColor: `${child.color}18` }}
                          >
                            <RecordIcon
                              name={child.icon}
                              pathData={child.iconPath}
                              color={child.color}
                              size={17}
                            />
                            <Text
                              className="font-manrope-semibold text-xs"
                              style={{ color: child.color }}
                            >
                              {child.name}
                            </Text>
                          </Pressable>
                        ))}
                      </View>
                    )}
                  </Animated.View>
                );
              }}
              ListEmptyComponent={
                <Animated.View
                  entering={categoryEntrance(90)}
                  className="flex-1 items-center justify-center gap-3 px-8"
                >
                  <FilledIcon name="shopping" size={64} tone="muted" />
                  <Text className="font-manrope-bold text-xl text-foreground">
                    {t("categories.list.emptyTitle", {
                      type: typeLabels[type].toLocaleLowerCase(
                        i18n.resolvedLanguage,
                      ),
                    })}
                  </Text>
                  <Text className="text-center font-sans text-base text-muted">
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
        </>
      )}
    </EdgeToEdgeLayout>
  );
}
