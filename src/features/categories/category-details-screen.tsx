import { EdgeToEdgeLayout } from "@/shared/ui/edge-to-edge-layout";
import Animated from "react-native-reanimated";
import { categoryEntrance, categoryLayout } from "./components/category-motion";
import { CategoryDeleteSheet } from "./components/category-delete-sheet";
import type { Category } from "@/data/selectors/category-selectors";
import { DeleteFill } from "@material-symbols-svg/react-native/rounded/icons/delete";
import { ReceiptLongFill } from "@material-symbols-svg/react-native/rounded/icons/receipt-long";
import { useLocalSearchParams, useRouter } from "expo-router";
import { Button } from "heroui-native";
import { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { FlatList, ScrollView, View } from "react-native";
import { useLocalData } from "@/data/local-data-provider";
import { categoryFamily } from "@/data/model/category-record";
import {
  accountPeriodRange,
  selectCategories,
  selectCategoryTransactions,
} from "@/data/selectors/document-selectors";
import { AccountPeriodSelector } from "@/features/accounts/components/account-period-selector";
import type { AccountPeriod } from "@/features/accounts/types";
import { formatCurrency } from "@/shared/lib/currency";
import { Text } from "@/shared/ui/app-text";
import { FilledIcon } from "@/shared/ui/filled-icon";
import {
  CategoryBadge,
  CategoryChip,
  CategoryHeader,
  TYPE_COLORS,
} from "./components/category-ui";
import { useCategoryClock } from "./use-category-clock";

export function CategoryDetailsScreen() {
  const { t, i18n } = useTranslation();
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const { document } = useLocalData();
  const now = useCategoryClock();
  const [selected, setSelected] = useState<string | null>(null);
  const [period, setPeriod] = useState<AccountPeriod>("Monthly");
  const [anchor, setAnchor] = useState<Date | null>(null);
  const [allTime, setAllTime] = useState(true);
  const [deleteTarget, setDeleteTarget] = useState<Category | null>(null);
  const isDeleting = deleteTarget !== null;
  const categories = useMemo(() => selectCategories(document), [document]);
  const category = categories.find((item) => item.id === id);
  const family = useMemo(
    () => categoryFamily(document.categories, id),
    [document.categories, id],
  );
  const members = categories.filter((item) => family.has(item.id));
  const transactions = useMemo(
    () => selectCategoryTransactions(document, id),
    [document, id],
  );
  const { start, end } = accountPeriodRange(period, anchor ?? now);
  const selectedId = members.some((item) => item.id === selected)
    ? selected
    : null;
  const visible = transactions.filter(
    (transaction) =>
      (!selectedId || transaction.categoryId === selectedId) &&
      (allTime ||
        (transaction.timestamp != null &&
          transaction.timestamp >= start.getTime() &&
          transaction.timestamp < end.getTime())),
  );
  function movePeriod(direction: number) {
    const next = new Date(start);
    if (period === "Yearly") next.setFullYear(next.getFullYear() + direction);
    else if (period === "Monthly") next.setMonth(next.getMonth() + direction);
    else
      next.setDate(next.getDate() + direction * (period === "Weekly" ? 7 : 1));
    setAnchor(next);
    setAllTime(false);
  }
  return (
    <EdgeToEdgeLayout
      header={
        <>
          <CategoryHeader
            title={category?.name ?? t("categories.details.title")}
            disabled={isDeleting}
          >
            {category && (
              <>
                <Button
                  isIconOnly
                  variant="ghost"
                  isDisabled={isDeleting}
                  accessibilityLabel={t("categories.details.addChild")}
                  onPress={() =>
                    router.push({
                      pathname: "/categories/create",
                      params: { parentId: id, type: String(category.type) },
                    })
                  }
                >
                  <FilledIcon name="plus" size={27} />
                </Button>
                <Button
                  isIconOnly
                  variant="ghost"
                  isDisabled={isDeleting}
                  accessibilityLabel={t(
                    "categories.details.deleteAccessibility",
                  )}
                  onPress={() => setDeleteTarget(category)}
                >
                  <DeleteFill color="#ef666d" size={26} />
                </Button>
              </>
            )}
          </CategoryHeader>
          {category && (
            <>
              <Animated.View entering={categoryEntrance(40)}>
                <ScrollView
                  horizontal
                  showsHorizontalScrollIndicator={false}
                  contentContainerStyle={{ padding: 16, gap: 8 }}
                >
                  <CategoryChip
                    selected={!selectedId}
                    onPress={() => setSelected(null)}
                  />
                  {members.map((member) => (
                    <CategoryChip
                      key={member.id}
                      category={member}
                      selected={selectedId === member.id}
                      onPress={() => setSelected(member.id)}
                      onLongPress={
                        member.id !== id
                          ? () => setDeleteTarget(member)
                          : undefined
                      }
                    />
                  ))}
                </ScrollView>
              </Animated.View>
              <Animated.View
                entering={categoryEntrance(70)}
                className="flex-row items-center px-3"
              >
                <Button
                  isIconOnly
                  variant="ghost"
                  accessibilityLabel={t("categories.details.previousPeriod")}
                  onPress={() => movePeriod(-1)}
                >
                  <FilledIcon name="arrow-left" size={20} tone="muted" />
                </Button>
                <Button
                  variant="ghost"
                  className="flex-1"
                  onPress={() => setAllTime((value) => !value)}
                >
                  <Button.Label className="text-sm text-muted">
                    {allTime
                      ? t("categories.details.allHistory")
                      : `${start.toLocaleDateString(i18n.resolvedLanguage)} – ${new Date(end.getTime() - 1).toLocaleDateString(i18n.resolvedLanguage)}`}
                  </Button.Label>
                </Button>
                <Button
                  isIconOnly
                  variant="ghost"
                  accessibilityLabel={t("categories.details.nextPeriod")}
                  onPress={() => movePeriod(1)}
                >
                  <FilledIcon name="chevron-right" size={22} tone="muted" />
                </Button>
              </Animated.View>
              <Text className="px-5 pb-2 font-sans text-xs text-muted">
                {selectedId
                  ? t("categories.details.directTransactions")
                  : t("categories.details.includesChildren")}
              </Text>
            </>
          )}
        </>
      }
      footer={
        category && (
          <>
            <Animated.View
              entering={categoryEntrance(150)}
              className="flex-row items-center justify-end gap-3 px-5 py-3"
            >
              <Button
                isDisabled={isDeleting}
                onPress={() =>
                  router.push({
                    pathname: "/categories/[id]/edit",
                    params: { id: selectedId ?? id },
                  })
                }
                className="rounded-2xl px-6"
              >
                <FilledIcon name="pencil" size={22} tone="accent-foreground" />
                <Button.Label>
                  {selectedId && selectedId !== id
                    ? t("categories.details.editChild")
                    : t("categories.details.edit")}
                </Button.Label>
              </Button>
            </Animated.View>
            <Animated.View
              entering={categoryEntrance(180)}
              className="px-4 pb-2"
            >
              <AccountPeriodSelector
                value={period}
                onChange={(value) => {
                  setPeriod(value);
                  setAllTime(false);
                }}
              />
            </Animated.View>
          </>
        )
      }
    >
      {(contentInsets) => (
        <>
          {!category ? (
            <Text className="p-6 font-sans text-base text-muted">
              {t("categories.details.unavailable")}
            </Text>
          ) : (
            <>
              <FlatList
                data={visible}
                keyExtractor={(item) => item.id}
                contentContainerStyle={{
                  paddingTop: contentInsets.top + 8,
                  flexGrow: 1,
                  paddingHorizontal: 16,
                  paddingBottom: contentInsets.bottom + 24,
                }}
                renderItem={({ item, index }) => (
                  <Animated.View
                    entering={categoryEntrance(90 + Math.min(index, 6) * 30)}
                    layout={categoryLayout}
                    className="flex-row items-center gap-3 border-b border-border py-4"
                  >
                    <CategoryBadge
                      small
                      category={
                        categories.find(
                          (member) => member.id === item.categoryId,
                        ) ?? category
                      }
                    />
                    <View className="flex-1 gap-1">
                      <Text className="font-manrope-semibold text-base text-foreground">
                        {item.name}
                      </Text>
                      <Text className="font-sans text-xs text-muted">
                        {item.categoryName} · {item.accountName}
                      </Text>
                      <Text className="font-sans text-xs text-muted">
                        {item.timestamp == null
                          ? t("categories.details.unknownDate")
                          : new Date(item.timestamp).toLocaleDateString(
                              i18n.resolvedLanguage,
                            )}
                      </Text>
                    </View>
                    <Text
                      className="font-manrope-bold text-sm"
                      style={{ color: TYPE_COLORS[item.type] }}
                    >
                      {item.type === 0 ? "−" : item.type === 1 ? "+" : ""}
                      {formatCurrency(item.amount, item.currencyCode)}
                    </Text>
                  </Animated.View>
                )}
                ListEmptyComponent={
                  <Animated.View
                    entering={categoryEntrance(120)}
                    className="flex-1 items-center justify-center gap-3 py-16"
                  >
                    <ReceiptLongFill color="#555555" size={70} />
                    <Text className="font-manrope-semibold text-xl text-foreground">
                      {t("categories.details.emptyTitle")}
                    </Text>
                    <Text className="px-8 text-center font-sans text-base text-muted">
                      {t("categories.details.emptyDescription")}
                    </Text>
                  </Animated.View>
                }
              />
            </>
          )}
          {deleteTarget && (
            <CategoryDeleteSheet
              category={deleteTarget}
              onDismiss={() => setDeleteTarget(null)}
              onDeleted={(deletedId) => {
                setDeleteTarget(null);
                if (deletedId === id) router.dismissTo("/categories");
                else setSelected(null);
              }}
            />
          )}
        </>
      )}
    </EdgeToEdgeLayout>
  );
}
