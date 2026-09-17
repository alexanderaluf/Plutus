import { BlurTargetView } from "expo-blur";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useRouter } from "expo-router";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { Animated, FlatList, Pressable, StyleSheet, View } from "react-native";

import { useLocalData } from "@/data/local-data-provider";
import {
  selectCategories,
  selectCategoryMonthlyTotals,
  selectHomeOverview,
  selectHomeRecurringPayments,
  selectTrackedBudgets,
} from "@/data/selectors/document-selectors";
import { useProfiles } from "@/features/profile/profile-provider";
import { colorForeground } from "@/shared/icons/colors";
import { Text } from "@/shared/ui/app-text";
import { GlassSegmentedControl } from "@/shared/ui/glass-segmented-control";
import { FilledIcon } from "@/shared/ui/filled-icon";
import {
  CollapsingHeader,
  CollapsingHeaderSpacer,
  useCollapsingHeader,
} from "@/shared/ui/collapsing-header";

import { useCategoryClock } from "@/features/categories/use-category-clock";
import { TransactionDetailSheet } from "@/features/transactions/transaction-detail-sheet";
import { BudgetCard } from "./components/budget-card";
import { CategoryList } from "./components/category-list";
import { OverviewCarousel } from "./components/overview-carousel";
import { RecurringHomeSection } from "./components/recurring-home-section";
import { IndexedTransactionRow } from "./components/transaction-list";
import { TransactionMonthSelector } from "./components/transaction-month-selector";
import { financialMonth } from "@/data/model/financial-month";
import {
  createTransactionIndex,
  createTransactionProjector,
  selectTransactionPeriod,
  transactionPeriodBounds,
  type TransactionIndexEntry,
} from "@/data/selectors/transaction-selectors";
import type { Transaction } from "./types";

type HomeSection = "transactions" | "categories" | "budgets" | "recurring";

const HEADER_HEIGHT = 64;
const SELECTOR_PINNED_TOP = 8;
const TRANSACTION_PAGE_SIZE = 30;
const EMPTY_TRANSACTIONS: TransactionIndexEntry[] = [];

export function HomeScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { i18n, t } = useTranslation();
  const { activeProfile } = useProfiles();
  const { document } = useLocalData();
  const [transactionPage, setTransactionPage] = useState({
    key: "",
    limit: TRANSACTION_PAGE_SIZE,
  });
  const [monthOffset, setMonthOffset] = useState(0);
  const listRef = useRef<FlatList<TransactionIndexEntry> | null>(null);
  const [isBalanceVisible, setIsBalanceVisible] = useState(true);
  const [section, setSection] = useState<HomeSection>("transactions");
  const [selectedTransactionId, setSelectedTransactionId] = useState<
    string | null
  >(null);
  const [selectorTop, setSelectorTop] = useState<number | null>(null);
  const [isSelectorSticky, setIsSelectorSticky] = useState(false);
  const blurTargetRef = useRef<View | null>(null);
  const { headerHidden, onScroll, scrollY } = useCollapsingHeader();
  const now = useCategoryClock();
  const { start: monthStart, end: monthEnd } = financialMonth(
    now,
    document._local.monthStartDay,
    monthOffset,
  );
  const transactionIndex = useMemo(
    () => createTransactionIndex(document),
    [document],
  );
  const projectTransaction = useMemo(
    () => createTransactionProjector(document, i18n.resolvedLanguage),
    [document, i18n.resolvedLanguage],
  );
  const monthStartTime = monthStart.getTime();
  const monthEndTime = monthEnd.getTime();
  const pageKey = `${activeProfile.id}:${monthStartTime}:${monthEndTime}`;
  const pageLimit =
    transactionPage.key === pageKey
      ? transactionPage.limit
      : TRANSACTION_PAGE_SIZE;
  const monthTransactionCount = useMemo(
    () =>
      transactionPeriodBounds(
        transactionIndex,
        new Date(monthStartTime),
        new Date(monthEndTime),
      ).count,
    [transactionIndex, monthStartTime, monthEndTime],
  );
  const transactions = useMemo(
    () =>
      selectTransactionPeriod(
        transactionIndex,
        new Date(monthStartTime),
        new Date(monthEndTime),
        pageLimit,
      ),
    [transactionIndex, monthStartTime, monthEndTime, pageLimit],
  );
  const loadMoreTransactions = useCallback(() => {
    if (
      section !== "transactions" ||
      transactions.length >= monthTransactionCount
    )
      return;
    setTransactionPage((current) => ({
      key: pageKey,
      limit: Math.min(
        monthTransactionCount,
        (current.key === pageKey ? current.limit : TRANSACTION_PAGE_SIZE) +
          TRANSACTION_PAGE_SIZE,
      ),
    }));
  }, [section, transactions.length, monthTransactionCount, pageKey]);
  const onTransactionPress = useCallback(
    (transaction: Transaction) => setSelectedTransactionId(transaction.id),
    [],
  );
  const renderTransaction = useCallback(
    ({ item, index }: { item: TransactionIndexEntry; index: number }) => (
      <IndexedTransactionRow
        entry={item}
        project={projectTransaction}
        showBorder={index < transactions.length - 1}
        onPress={onTransactionPress}
      />
    ),
    [projectTransaction, transactions.length, onTransactionPress],
  );
  const onPreviousMonth = useCallback(() => {
    setSelectedTransactionId(null);
    setTransactionPage({ key: "", limit: TRANSACTION_PAGE_SIZE });
    setMonthOffset((offset) => offset - 1);
  }, []);
  const onNextMonth = useCallback(() => {
    setSelectedTransactionId(null);
    setTransactionPage({ key: "", limit: TRANSACTION_PAGE_SIZE });
    setMonthOffset((offset) => Math.min(0, offset + 1));
  }, []);
  useEffect(() => {
    listRef.current?.scrollToOffset({ offset: 0, animated: false });
    scrollY.setValue(0);
  }, [pageKey, section, scrollY]);
  const onSectionChange = useCallback((next: HomeSection) => {
    setSelectedTransactionId(null);
    setTransactionPage({ key: "", limit: TRANSACTION_PAGE_SIZE });
    setSection(next);
  }, []);
  const categories = useMemo(
    () => (section === "categories" ? selectCategories(document) : []),
    [document, section],
  );
  const categoryTotals = useMemo(
    () =>
      section === "categories"
        ? selectCategoryMonthlyTotals(document, now)
        : new Map(),
    [document, now, section],
  );
  const overview = useMemo(
    () => selectHomeOverview(document, activeProfile.currencyCode, now),
    [document, activeProfile.currencyCode, now],
  );
  const persistedBudgets = useMemo(
    () => (section === "budgets" ? selectTrackedBudgets(document, now) : []),
    [document, now, section],
  );
  const recurringPayments = useMemo(
    () =>
      section === "recurring"
        ? selectHomeRecurringPayments(document, now)
        : null,
    [document, now, section],
  );

  const selectedTransaction = useMemo(() => {
    if (!selectedTransactionId) return null;
    const entry = transactions.find(
      (transaction) => transaction.id === selectedTransactionId,
    );
    return entry ? projectTransaction(entry) : null;
  }, [transactions, selectedTransactionId, projectTransaction]);
  const monthSelector =
    section === "transactions" ? (
      <TransactionMonthSelector
        start={monthStart}
        end={monthEnd}
        isCurrent={monthOffset === 0}
        dateFormat={document._local.dateFormat}
        onPrevious={onPreviousMonth}
        onNext={onNextMonth}
      />
    ) : null;
  const selectorOptions = [
    {
      label: t("home.sectionSelector.transactions"),
      value: "transactions",
    },
    {
      label: t("home.sectionSelector.categories"),
      value: "categories",
    },
    { label: t("home.sectionSelector.budgets"), value: "budgets" },
    { label: t("home.sectionSelector.recurring"), value: "recurring" },
  ] as const;

  useEffect(() => {
    if (selectorTop === null) return;

    const stickyThreshold = selectorTop - (insets.top + SELECTOR_PINNED_TOP);
    const listener = scrollY.addListener(({ value }) => {
      const nextSticky = value >= stickyThreshold;
      setIsSelectorSticky((current) =>
        current === nextSticky ? current : nextSticky,
      );
    });

    return () => scrollY.removeListener(listener);
  }, [insets.top, scrollY, selectorTop]);

  return (
    <>
      <View style={styles.fill}>
        <BlurTargetView ref={blurTargetRef} style={styles.fill}>
          <Animated.FlatList
            ref={listRef}
            key={`${pageKey}:${section}`}
            data={
              section === "transactions" ? transactions : EMPTY_TRANSACTIONS
            }
            renderItem={renderTransaction}
            keyExtractor={(entry) => entry.id}
            initialNumToRender={10}
            maxToRenderPerBatch={10}
            windowSize={5}
            updateCellsBatchingPeriod={50}
            onEndReached={loadMoreTransactions}
            onEndReachedThreshold={0.5}
            removeClippedSubviews={false}
            contentInsetAdjustmentBehavior="never"
            ListEmptyComponent={
              section === "transactions" ? (
                <Text className="py-5 text-center font-sans text-sm text-muted">
                  {t("home.monthSelector.empty")}
                </Text>
              ) : null
            }
            contentContainerStyle={[
              styles.content,
              { paddingBottom: 160 + insets.bottom },
            ]}
            keyboardShouldPersistTaps="handled"
            onScroll={onScroll}
            scrollEventThrottle={16}
            showsVerticalScrollIndicator={false}
            ListHeaderComponent={
              <View>
                <CollapsingHeaderSpacer height={HEADER_HEIGHT} />
                <View style={styles.headerGap} />
                <OverviewCarousel
                  key={activeProfile.id}
                  overview={overview}
                  now={now}
                  isBalanceVisible={isBalanceVisible}
                  onToggleBalance={() =>
                    setIsBalanceVisible((current) => !current)
                  }
                />
                <View style={styles.sectionGap} />
                <View
                  onLayout={({ nativeEvent: { layout } }) => {
                    setSelectorTop((current) =>
                      current === layout.y ? current : layout.y,
                    );
                  }}
                  pointerEvents={isSelectorSticky ? "none" : "auto"}
                  accessibilityElementsHidden={isSelectorSticky}
                  importantForAccessibility={
                    isSelectorSticky ? "no-hide-descendants" : "auto"
                  }
                  style={[
                    styles.selectorSpacer,
                    isSelectorSticky && styles.hiddenSelectorSpacer,
                  ]}
                >
                  <GlassSegmentedControl
                    accessibilityLabel={t(
                      "home.sectionSelector.accessibilityLabel",
                    )}
                    fitLabels
                    minHeight={44}
                    options={selectorOptions}
                    tabPaddingHorizontal={4}
                    textSize={12}
                    value={section}
                    onChange={onSectionChange}
                  />
                  {monthSelector}
                </View>
                {section === "transactions" ? (
                  <View>
                    <View className="mb-2">
                      <Text className="font-manrope-bold text-lg text-foreground">
                        {t("home.recentActivity.allTitle")}
                      </Text>
                      <Text className="mt-0.5 font-sans text-xs text-muted">
                        {t("home.recentActivity.description")}
                      </Text>
                    </View>
                  </View>
                ) : section === "categories" ? (
                  <CategoryList
                    categories={categories}
                    totals={categoryTotals}
                    fallbackCurrency={activeProfile.currencyCode}
                    onPress={(category) =>
                      router.push({
                        pathname: "/categories/[id]",
                        params: { id: category.id },
                      })
                    }
                  />
                ) : section === "budgets" ? (
                  <BudgetCard budgets={persistedBudgets} showAll />
                ) : recurringPayments ? (
                  <RecurringHomeSection
                    paid={recurringPayments.paid}
                    pending={recurringPayments.pending}
                    remaining={recurringPayments.remaining}
                    fallbackCurrency={activeProfile.currencyCode}
                  />
                ) : null}
              </View>
            }
          />
        </BlurTargetView>
        <CollapsingHeader
          height={HEADER_HEIGHT}
          horizontalInset={20}
          headerHidden={headerHidden}
          scrollY={scrollY}
        >
          <View className="flex-row items-center justify-between pt-3">
            <View className="flex-1 pe-3">
              <Text className="font-manrope-medium text-xs uppercase tracking-widest text-muted">
                {now.toLocaleDateString(i18n.resolvedLanguage, {
                  weekday: "long",
                  month: "long",
                  day: "numeric",
                })}
              </Text>
              <Text className="mt-1 font-manrope-bold text-2xl text-foreground">
                {t("home.greeting", { name: activeProfile.name.split(" ")[0] })}
              </Text>
            </View>

            <Pressable
              accessibilityLabel={t("home.openProfile")}
              accessibilityRole="button"
              hitSlop={6}
              onPress={() => router.push("/profile")}
              style={({ pressed }) => ({ opacity: pressed ? 0.68 : 1 })}
            >
              <View
                className="size-10 items-center justify-center rounded-full"
                style={{ backgroundColor: activeProfile.color }}
              >
                <FilledIcon
                  color={colorForeground(activeProfile.color)}
                  name="account"
                  size={25}
                />
              </View>
            </Pressable>
          </View>
        </CollapsingHeader>
        {isSelectorSticky ? (
          <View
            style={[
              styles.selectorDock,
              { top: insets.top + SELECTOR_PINNED_TOP },
            ]}
          >
            <GlassSegmentedControl
              accessibilityLabel={t("home.sectionSelector.accessibilityLabel")}
              blurTarget={blurTargetRef}
              fitLabels
              minHeight={44}
              options={selectorOptions}
              tabPaddingHorizontal={4}
              textSize={12}
              value={section}
              onChange={onSectionChange}
            />
            {monthSelector}
          </View>
        ) : null}
      </View>
      {selectedTransaction ? (
        <TransactionDetailSheet
          transaction={selectedTransaction}
          onDismiss={() => setSelectedTransactionId(null)}
        />
      ) : null}
    </>
  );
}

const styles = StyleSheet.create({
  fill: { flex: 1 },
  content: { paddingHorizontal: 20, paddingBottom: 160 },
  headerGap: { height: 28 },
  sectionGap: { height: 28 },
  selectorSpacer: { paddingBottom: 20 },
  hiddenSelectorSpacer: { opacity: 0 },
  selectorDock: {
    left: 12,
    position: "absolute",
    right: 12,
    zIndex: 20,
  },
});
