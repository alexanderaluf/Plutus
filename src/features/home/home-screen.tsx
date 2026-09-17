import { useAppDate } from "@/shared/lib/use-app-date";
import { BlurTargetView } from "expo-blur";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useRouter } from "expo-router";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { useAmountVisibility } from "@/shared/lib/use-currency-format";
import { useTimeOfDayGreeting } from "@/shared/lib/use-time-of-day-greeting";
import { useAppThemeColors } from "@/shared/theme/app-theme";
import { useTranslation } from "react-i18next";
import {
  ActivityIndicator,
  Animated,
  FlatList,
  Pressable,
  StyleSheet,
  useWindowDimensions,
  View,
  type ViewToken,
} from "react-native";
import Reanimated, {
  Easing,
  ReduceMotion,
  useAnimatedStyle,
  useSharedValue,
  withTiming,
} from "react-native-reanimated";

import { useLocalData } from "@/data/local-data-provider";
import {
  type HomeRow,
  type HomeSection,
} from "@/data/selectors/home-section-selectors";
import { useProfiles } from "@/features/profile/profile-provider";
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
import { BudgetListHeader, BudgetOverviewCard } from "./components/budget-card";
import {
  CategoryListHeader,
  CategoryListRow,
} from "./components/category-list";
import { OverviewCarousel } from "./components/overview-carousel";
import {
  RecurringHomeHeader,
  RecurringHomeRow,
} from "./components/recurring-home-section";
import { IndexedTransactionRow } from "./components/transaction-list";
import { TransactionMonthSelector } from "./components/transaction-month-selector";
import { financialMonth } from "@/data/model/financial-month";
import {
  createTransactionProjector,
  selectTransactionPeriod,
  transactionPeriodBounds,
  type TransactionIndexEntry,
} from "@/data/selectors/transaction-selectors";
import type { Transaction } from "./types";
import { createVisibleRowFade } from "./visible-row-fade";
import { VisibleFadeRow } from "./components/visible-fade-row";
import { useHomeData } from "./use-home-data";

const HEADER_HEIGHT = 64;
const SELECTOR_PINNED_TOP = 8;
const TRANSACTION_PAGE_SIZE = 30;
const EMPTY_ROWS: HomeRow[] = [];
const EMPTY_INDEX: TransactionIndexEntry[] = [];
const ROW_VIEWABILITY = { itemVisiblePercentThreshold: 1 };
const SECTION_FADE = {
  duration: 120,
  easing: Easing.bezier(0.23, 1, 0.32, 1),
  reduceMotion: ReduceMotion.System,
};

export function HomeScreen() {
  const insets = useSafeAreaInsets();
  const { height: viewportHeight } = useWindowDimensions();
  const router = useRouter();
  const { i18n, t } = useTranslation();
  const { formatDate } = useAppDate();
  const { activeProfile } = useProfiles();
  const { document } = useLocalData();
  const [transactionPage, setTransactionPage] = useState({
    key: "",
    limit: TRANSACTION_PAGE_SIZE,
  });
  const [sectionPage, setSectionPage] = useState({
    key: "",
    limit: TRANSACTION_PAGE_SIZE,
  });
  const [expandedBudgetId, setExpandedBudgetId] = useState<string | null>(null);
  const [monthOffset, setMonthOffset] = useState(0);
  const listRef = useRef<FlatList<HomeRow> | null>(null);
  // Persisted so hidden amounts stay hidden across restarts, and shared so the
  // toggle masks every amount in the app rather than just these cards.
  const theme = useAppThemeColors();
  const greeting = useTimeOfDayGreeting();
  const { hidden: amountsHidden, toggle: toggleAmounts } = useAmountVisibility();
  const isBalanceVisible = !amountsHidden;
  const onToggleBalance = useCallback(() => void toggleAmounts(), [toggleAmounts]);
  const [overviewHeight, setOverviewHeight] = useState(300);
  const [section, setSection] = useState<HomeSection>("transactions");
  const [selectedTransactionId, setSelectedTransactionId] = useState<
    string | null
  >(null);
  const [selectorTop, setSelectorTop] = useState<number | null>(null);
  const [isSelectorSticky, setIsSelectorSticky] = useState(false);
  const blurTargetRef = useRef<View | null>(null);
  const { headerHidden, onScroll, scrollY } = useCollapsingHeader();
  const sectionOpacity = useSharedValue(1);
  const sectionStyle = useAnimatedStyle(() => ({
    opacity: sectionOpacity.get(),
  }));
  const now = useCategoryClock();
  const headerDate = useMemo(
    () =>
      // Weekday stays localized text; the date itself follows the user's format.
      `${now.toLocaleDateString(i18n.resolvedLanguage, {
        weekday: "long",
      })}, ${formatDate(now)}`,
    [now, i18n.resolvedLanguage, formatDate],
  );
  const [loadRetry, setLoadRetry] = useState(0);
  const homeData = useHomeData(
    document,
    activeProfile.currencyCode,
    now,
    section,
    loadRetry,
  );
  const transactionIndex = homeData.index ?? EMPTY_INDEX;
  const isSectionPending = homeData.pending;
  const sectionData = homeData.sectionData;
  useEffect(() => {
    if (!isSectionPending) sectionOpacity.set(withTiming(1, SECTION_FADE));
  }, [section, isSectionPending, sectionOpacity]);
  const { start: monthStart, end: monthEnd } = financialMonth(
    now,
    document._local.monthStartDay,
    monthOffset,
  );
  const projectTransaction = useMemo(
    () => createTransactionProjector(document, i18n.resolvedLanguage),
    [document, i18n.resolvedLanguage],
  );
  const monthStartTime = monthStart.getTime();
  const monthEndTime = monthEnd.getTime();
  const pageKey = `${activeProfile.id}:${monthStartTime}:${monthEndTime}`;
  const revealScope = section === "transactions" ? pageKey : activeProfile.id;
  // A new section/month visit resets reveal history, but pagination does not.
  const rowFade = useMemo(
    () => ({ scope: `${section}:${revealScope}`, ...createVisibleRowFade() }),
    [section, revealScope],
  );
  const onViewableItemsChanged = useCallback(
    ({ viewableItems }: { viewableItems: ViewToken<HomeRow>[] }) => {
      rowFade.update(viewableItems);
    },
    [rowFade],
  );
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
  const sectionPageKey = `${activeProfile.id}:${section}`;
  const sectionLimit =
    sectionPage.key === sectionPageKey
      ? sectionPage.limit
      : TRANSACTION_PAGE_SIZE;
  const rows = useMemo<HomeRow[]>(() => {
    if (isSectionPending) return EMPTY_ROWS;
    if (section === "transactions")
      return transactions.map((entry) => ({
        kind: "transaction",
        id: entry.id,
        entry,
      }));
    return sectionData?.rows.slice(0, sectionLimit) ?? EMPTY_ROWS;
  }, [isSectionPending, section, transactions, sectionData, sectionLimit]);
  const totalRows =
    section === "transactions"
      ? monthTransactionCount
      : (sectionData?.rows.length ?? 0);
  const loadMoreItems = useCallback(() => {
    if (isSectionPending || rows.length >= totalRows) return;
    const key = section === "transactions" ? pageKey : sectionPageKey;
    const setPage =
      section === "transactions" ? setTransactionPage : setSectionPage;
    setPage((current) => ({
      key,
      limit: Math.min(
        totalRows,
        (current.key === key ? current.limit : TRANSACTION_PAGE_SIZE) +
          TRANSACTION_PAGE_SIZE,
      ),
    }));
  }, [
    isSectionPending,
    rows.length,
    totalRows,
    section,
    pageKey,
    sectionPageKey,
  ]);
  const onTransactionPress = useCallback(
    (transaction: Transaction) => setSelectedTransactionId(transaction.id),
    [],
  );
  const onCategoryPress = useCallback(
    (category: { id: string }) => {
      router.push({
        pathname: "/categories/[id]",
        params: { id: category.id },
      });
    },
    [router],
  );
  const renderRow = useCallback(
    ({ item, index }: { item: HomeRow; index: number }) => (
      <VisibleFadeRow
        rowKey={`${item.kind}:${item.id}`}
        controller={rowFade}
        style={[
          item.kind !== "category" &&
            item.kind !== "transaction" &&
            styles.rowGap,
        ]}
      >
        {item.kind === "transaction" ? (
          <IndexedTransactionRow
            entry={item.entry}
            project={projectTransaction}
            showBorder={index < transactions.length - 1}
            onPress={onTransactionPress}
          />
        ) : item.kind === "category" ? (
          <CategoryListRow
            row={item}
            total={
              sectionData?.section === "categories"
                ? sectionData.totals.get(item.id)
                : undefined
            }
            fallbackCurrency={activeProfile.currencyCode}
            onPress={onCategoryPress}
          />
        ) : item.kind === "budget" ? (
          <BudgetOverviewCard
            budget={item.budget}
            expanded={expandedBudgetId === item.id}
            onToggle={() =>
              setExpandedBudgetId((current) =>
                current === item.id ? null : item.id,
              )
            }
          />
        ) : (
          <RecurringHomeRow event={item.event} />
        )}
      </VisibleFadeRow>
    ),
    [
      projectTransaction,
      transactions.length,
      onTransactionPress,
      rowFade,
      sectionData,
      activeProfile.currencyCode,
      onCategoryPress,
      expandedBudgetId,
    ],
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
  }, [pageKey, scrollY]);
  const onSectionChange = useCallback(
    (next: HomeSection) => {
      if (next === section) return;
      sectionOpacity.set(0);
      // When switching from a scrolled section, start the new content directly
      // below the pinned controls rather than retaining a deep list offset.
      if (isSelectorSticky && selectorTop !== null) {
        const offset = Math.max(
          0,
          selectorTop - (insets.top + SELECTOR_PINNED_TOP),
        );
        listRef.current?.scrollToOffset({ offset, animated: false });
        scrollY.setValue(offset);
      }
      setSelectedTransactionId(null);
      setTransactionPage({ key: "", limit: TRANSACTION_PAGE_SIZE });
      setSectionPage({ key: "", limit: TRANSACTION_PAGE_SIZE });
      setExpandedBudgetId(null);
      setSection(next);
    },
    [
      section,
      sectionOpacity,
      isSelectorSticky,
      selectorTop,
      insets.top,
      scrollY,
    ],
  );
  const overview = homeData.overview;

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
    let previousSticky: boolean | undefined;
    const listener = scrollY.addListener(({ value }) => {
      const nextSticky = value >= stickyThreshold;
      if (nextSticky === previousSticky) return;
      previousSticky = nextSticky;
      setIsSelectorSticky(nextSticky);
    });

    return () => scrollY.removeListener(listener);
  }, [insets.top, scrollY, selectorTop]);

  return (
    <>
      <View style={styles.fill}>
        <BlurTargetView ref={blurTargetRef} style={styles.fill}>
          {/* Preserve the measured overview and selector across section/month
              changes. Remounting collapses the carousel until its next layout. */}
          <Animated.FlatList
            ref={listRef}
            key={activeProfile.id}
            data={rows}
            renderItem={renderRow}
            keyExtractor={(row) => `${row.kind}:${row.id}`}
            onViewableItemsChanged={onViewableItemsChanged}
            viewabilityConfig={ROW_VIEWABILITY}
            initialNumToRender={10}
            maxToRenderPerBatch={4}
            windowSize={5}
            updateCellsBatchingPeriod={50}
            onEndReached={loadMoreItems}
            onEndReachedThreshold={0.5}
            removeClippedSubviews={false}
            contentInsetAdjustmentBehavior="never"
            ListEmptyComponent={
              homeData.error ? (
                <View accessibilityRole="alert" style={styles.loading}>
                  <Text className="text-center text-sm text-danger">
                    {t("home.loadError")}
                  </Text>
                  <Pressable
                    accessibilityRole="button"
                    className="min-h-11 items-center justify-center"
                    onPress={() => setLoadRetry((retry) => retry + 1)}
                  >
                    <Text className="text-sm text-accent">
                      {t("home.retryLoad")}
                    </Text>
                  </Pressable>
                </View>
              ) : isSectionPending ? (
                <View
                  accessibilityState={{ busy: true }}
                  style={styles.loading}
                >
                  <ActivityIndicator
                    accessibilityLabel={t(`home.sectionSelector.${section}`)}
                  />
                </View>
              ) : section === "transactions" ? (
                <Reanimated.View style={sectionStyle}>
                  <Text className="py-5 text-center font-sans text-sm text-muted">
                    {t("home.monthSelector.empty")}
                  </Text>
                </Reanimated.View>
              ) : (
                <Reanimated.View style={sectionStyle}>
                  <Pressable
                    accessibilityRole="button"
                    onPress={() =>
                      router.push(
                        section === "categories"
                          ? "/categories"
                          : section === "budgets"
                            ? "/budgets"
                            : "/recurring",
                      )
                    }
                    className="rounded-3xl bg-surface p-4"
                  >
                    <Text className="text-sm text-muted">
                      {t(`home.${section}.empty`)}
                    </Text>
                  </Pressable>
                </Reanimated.View>
              )
            }
            contentContainerStyle={[
              styles.content,
              {
                paddingBottom: 160 + insets.bottom,
                // Keep short/loading sections tall enough to retain the dock's
                // scroll anchor while deferred content is being prepared.
                minHeight:
                  viewportHeight +
                  Math.max(
                    0,
                    (selectorTop ?? 0) - (insets.top + SELECTOR_PINNED_TOP),
                  ),
              },
            ]}
            keyboardShouldPersistTaps="handled"
            onScroll={onScroll}
            scrollEventThrottle={16}
            showsVerticalScrollIndicator={false}
            ListHeaderComponent={
              <View>
                <CollapsingHeaderSpacer height={HEADER_HEIGHT} />
                <View style={styles.headerGap} />
                {homeData.error && rows.length > 0 ? (
                  <View accessibilityRole="alert">
                    <Text className="text-sm text-danger">
                      {t("home.loadError")}
                    </Text>
                    <Pressable
                      accessibilityRole="button"
                      className="min-h-11 justify-center"
                      onPress={() => setLoadRetry((retry) => retry + 1)}
                    >
                      <Text className="text-sm text-accent">
                        {t("home.retryLoad")}
                      </Text>
                    </Pressable>
                  </View>
                ) : null}
                <View
                  accessibilityState={{ busy: homeData.overviewRefreshing }}
                  onLayout={({ nativeEvent: { layout } }) => {
                    if (overview)
                      setOverviewHeight((current) =>
                        current === layout.height ? current : layout.height,
                      );
                  }}
                >
                  {overview ? (
                    <OverviewCarousel
                      key={activeProfile.id}
                      overview={overview}
                      now={now}
                      isBalanceVisible={isBalanceVisible}
                      onToggleBalance={onToggleBalance}
                    />
                  ) : (
                    <View
                      style={{ height: overviewHeight }}
                      accessibilityState={{ busy: true }}
                    >
                      <ActivityIndicator />
                    </View>
                  )}
                </View>
                <View style={styles.sectionGap} />
                <View
                  onLayout={({ nativeEvent: { layout } }) => {
                    setSelectorTop((current) =>
                      current === layout.y ? current : layout.y,
                    );
                  }}
                  collapsable={false}
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
                <Reanimated.View style={sectionStyle}>
                  {isSectionPending ? null : section === "transactions" ? (
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
                  ) : sectionData?.section === "categories" ? (
                    <CategoryListHeader count={totalRows} />
                  ) : sectionData?.section === "budgets" ? (
                    <BudgetListHeader count={totalRows} />
                  ) : sectionData?.section === "recurring" ? (
                    <RecurringHomeHeader
                      count={totalRows}
                      paid={sectionData.paid}
                      remaining={sectionData.remaining}
                      fallbackCurrency={activeProfile.currencyCode}
                    />
                  ) : null}
                </Reanimated.View>
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
                {headerDate}
              </Text>
              <Text className="mt-1 font-manrope-bold text-2xl text-foreground">
                {t(`home.greetings.${greeting}`, {
                  name: activeProfile.name.split(" ")[0],
                })}
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
                style={{ backgroundColor: theme.accent }}
              >
                <FilledIcon
                  color={theme.accentForeground}
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
  rowGap: { marginBottom: 12 },
  loading: { minHeight: 80, alignItems: "center", justifyContent: "center" },
  selectorSpacer: { paddingBottom: 20 },
  hiddenSelectorSpacer: { opacity: 0 },
  selectorDock: {
    left: 12,
    position: "absolute",
    right: 12,
    zIndex: 20,
  },
});
