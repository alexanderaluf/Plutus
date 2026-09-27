import {
  useCallback,
  useDeferredValue,
  useMemo,
  useRef,
  useState,
} from "react";
import { useTranslation } from "react-i18next";
import {
  ActivityIndicator,
  Animated,
  type FlatList,
  StyleSheet,
  View,
  type ViewToken,
} from "react-native";
import Reanimated, {
  Easing,
  FadeInDown,
  ReduceMotion,
} from "react-native-reanimated";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { localDateKey } from "@/data/model/recurring-record";
import { useLocalData } from "@/data/local-data-provider";
import {
  countActiveFilters,
  createSearchContext,
  DEFAULT_SEARCH_FILTERS,
  searchTransactions,
  type SearchFilters,
} from "@/data/selectors/search-selectors";
import { createTransactionProjector } from "@/data/selectors/transaction-selectors";
import { useCategoryClock } from "@/features/categories/use-category-clock";
import { VisibleFadeRow } from "@/features/home/components/visible-fade-row";
import type { Transaction } from "@/features/home/types";
import { createVisibleRowFade } from "@/features/home/visible-row-fade";
import { useProfiles } from "@/features/profile/profile-provider";
import { TransactionDetailSheet } from "@/features/transactions/transaction-detail-sheet";
import {
  CollapsingHeader,
  CollapsingHeaderSpacer,
  useCollapsingHeader,
} from "@/shared/ui/collapsing-header";
import { TAB_HEADER_HEIGHT, TabHeader } from "@/shared/navigation/tab-header";

import { ActiveFilters, CategoryShortcuts } from "./components/active-filters";
import { QuickFilters } from "./components/quick-filters";
import { SearchFilterSheet } from "./components/search-filter-sheet";
import {
  SearchDayHeader,
  SearchEmptyState,
  SearchTransactionCell,
} from "./components/search-results";
import { ScrollTopButton } from "./components/scroll-top-button";
import { SearchSummary } from "./components/search-summary";
import { SearchToolbar } from "./components/search-toolbar";
import {
  buildSearchRows,
  nextSearchWindow,
  SEARCH_PAGE_SIZE,
  type SearchRow,
} from "./search-rows";

const HEADER_HEIGHT = TAB_HEADER_HEIGHT;
// Tab bar clearance, matching TabPage.
const BOTTOM_INSET = 106;
// Page entry runs top to bottom: header sections first, then visible rows.
const SECTION_DELAY = 45;
const SECTION_STAGGER = 85;
const ROWS_AFTER_MS = 260;
const ROW_RISE = 14;
const ROW_VIEWABILITY = { itemVisiblePercentThreshold: 1 };
const rowKey = (row: SearchRow) => row.key;

function sectionEntry(index: number) {
  return FadeInDown.duration(420)
    .delay(SECTION_DELAY + index * SECTION_STAGGER)
    .easing(Easing.bezier(0.22, 1, 0.36, 1))
    .reduceMotion(ReduceMotion.System);
}

export function SearchScreen() {
  const { activeProfile } = useProfiles();
  // A profile switch starts a clean search rather than filtering by foreign ids.
  return <ProfileSearch key={activeProfile.id} />;
}

function ProfileSearch() {
  const { t, i18n } = useTranslation();
  const insets = useSafeAreaInsets();
  const { document } = useLocalData();
  const { activeProfile } = useProfiles();
  const now = useCategoryClock(document);
  const { headerHidden, onScroll, scrollY } = useCollapsingHeader();
  const listRef = useRef<FlatList<SearchRow> | null>(null);
  const [filters, setFilters] = useState<SearchFilters>(DEFAULT_SEARCH_FILTERS);
  const [loaded, setLoaded] = useState(SEARCH_PAGE_SIZE);
  const [isSheetOpen, setSheetOpen] = useState(false);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const query = useDeferredValue(filters.query);

  // Relation names are resolved once per document; typing only filters.
  const context = useMemo(
    () => createSearchContext(document, activeProfile.currencyCode),
    // Unnamed relations are localized when the context is built.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [document, activeProfile.currencyCode, i18n.resolvedLanguage],
  );
  const project = useMemo(
    () => createTransactionProjector(document, i18n.resolvedLanguage),
    [document, i18n.resolvedLanguage],
  );
  const applied = useMemo(() => ({ ...filters, query }), [filters, query]);
  const outcome = useMemo(
    () => searchTransactions(context, applied, now),
    [context, applied, now],
  );
  const countFor = useCallback(
    (draft: SearchFilters) => searchTransactions(context, draft, now).total,
    [context, now],
  );

  const update = useCallback((next: SearchFilters) => {
    setFilters(next);
    setLoaded(SEARCH_PAGE_SIZE);
  }, []);
  const activeCount = countActiveFilters(filters);
  const refinements =
    activeCount -
    (filters.types.length ? 1 : 0) -
    (filters.period !== "all" ? 1 : 0);
  const idle = !filters.query.trim() && activeCount === 0;
  const groupByDay = filters.sort === "newest" || filters.sort === "oldest";

  // Rows exist only for the loaded window and hold references, not view models.
  const rows = useMemo(
    () => buildSearchRows(outcome.entries, loaded, groupByDay),
    [outcome.entries, loaded, groupByDay],
  );
  const hasMore = loaded < outcome.total;
  const loadMore = useCallback(() => {
    setLoaded((current) =>
      current < outcome.total
        ? nextSearchWindow(current, outcome.total)
        : current,
    );
  }, [outcome.total]);

  const selected = useMemo(() => {
    if (!selectedId) return null;
    const entry = outcome.entries.find((item) => item.id === selectedId);
    return entry ? project(entry) : null;
  }, [outcome.entries, selectedId, project]);
  const onTransactionPress = useCallback(
    (transaction: Transaction) => setSelectedId(transaction.id),
    [],
  );

  // One controller per visit. Only the rows visible on entry animate; rows
  // reached by scrolling or loading appear immediately.
  const [rowFade] = useState(() =>
    createVisibleRowFade(Date.now, {
      entryOnly: true,
      revealAfter: Date.now() + ROWS_AFTER_MS,
    }),
  );
  const onViewableItemsChanged = useCallback(
    ({ viewableItems }: { viewableItems: ViewToken<SearchRow>[] }) =>
      rowFade.update(viewableItems),
    [rowFade],
  );

  const todayKey = localDateKey(now);
  const yesterdayKey = localDateKey(
    new Date(now.getFullYear(), now.getMonth(), now.getDate() - 1),
  );
  const renderRow = useCallback(
    ({ item }: { item: SearchRow }) => (
      <VisibleFadeRow rowKey={item.key} controller={rowFade} rise={ROW_RISE}>
        {item.kind === "day" ? (
          <SearchDayHeader
            row={item}
            todayKey={todayKey}
            yesterdayKey={yesterdayKey}
          />
        ) : (
          <SearchTransactionCell
            row={item}
            project={project}
            onPress={onTransactionPress}
          />
        )}
      </VisibleFadeRow>
    ),
    [rowFade, todayKey, yesterdayKey, project, onTransactionPress],
  );

  // Memoized without `loaded`, so growing the window re-renders only new
  // cells, never the search bar, selector and summary above them.
  const header = useMemo(
    () => (
      <View style={styles.header}>
        <CollapsingHeaderSpacer height={HEADER_HEIGHT} />
        <Reanimated.View entering={sectionEntry(0)} className="gap-4">
          <SearchToolbar
            value={filters.query}
            activeFilters={refinements}
            onChange={(value) => update({ ...filters, query: value })}
            onOpenFilters={() => setSheetOpen(true)}
          />
          <QuickFilters
            types={filters.types}
            period={filters.period}
            onTypesChange={(types) => update({ ...filters, types })}
            onPeriodChange={(period) => update({ ...filters, period })}
          />
          <ActiveFilters
            filters={filters}
            facets={context.facets}
            onChange={update}
          />
        </Reanimated.View>

        {idle && context.facts.length ? (
          <Reanimated.View entering={sectionEntry(1)}>
            <CategoryShortcuts
              categories={context.facets.categories}
              onSelect={(id) => update({ ...filters, categories: [id] })}
            />
          </Reanimated.View>
        ) : null}

        <Reanimated.View entering={sectionEntry(2)}>
          {context.facts.length === 0 ? (
            <SearchEmptyState
              icon="receipt"
              title={t("search.results.noDataTitle")}
              description={t("search.results.noDataDescription")}
            />
          ) : outcome.total === 0 ? (
            <SearchEmptyState
              icon="magnify-close"
              title={t("search.results.emptyTitle")}
              description={t("search.results.emptyDescription")}
            />
          ) : (
            <View style={groupByDay ? undefined : styles.summaryGap}>
              <SearchSummary
                outcome={outcome}
                sort={filters.sort}
                onSortPress={() => setSheetOpen(true)}
              />
            </View>
          )}
        </Reanimated.View>
      </View>
    ),
    [filters, refinements, update, context, idle, outcome, groupByDay, t],
  );
  const footer = useMemo(
    () =>
      hasMore ? (
        <View style={styles.footer}>
          <ActivityIndicator accessibilityLabel={t("search.results.loading")} />
        </View>
      ) : null,
    [hasMore, t],
  );

  return (
    <>
      <View style={styles.fill}>
        <Animated.FlatList
          ref={listRef}
          data={rows}
          renderItem={renderRow}
          keyExtractor={rowKey}
          onViewableItemsChanged={onViewableItemsChanged}
          viewabilityConfig={ROW_VIEWABILITY}
          ListHeaderComponent={header}
          ListFooterComponent={footer}
          // About four screens stay mounted on each side of the viewport, so
          // reversing direction finds rows ready; farther rows are released.
          // Batches of 10 every 30ms fill ahead of a fling without long frames.
          initialNumToRender={12}
          maxToRenderPerBatch={10}
          updateCellsBatchingPeriod={30}
          windowSize={9}
          // Add the next page two screens before the end: rows are local and
          // instant, so a normal scroll never reaches the spinner.
          onEndReached={loadMore}
          onEndReachedThreshold={2}
          removeClippedSubviews={false}
          contentInsetAdjustmentBehavior="never"
          contentContainerStyle={[
            styles.content,
            { paddingBottom: BOTTOM_INSET + insets.bottom },
          ]}
          keyboardShouldPersistTaps="handled"
          keyboardDismissMode="on-drag"
          onScroll={onScroll}
          scrollEventThrottle={16}
          showsVerticalScrollIndicator={false}
        />
        <CollapsingHeader
          height={HEADER_HEIGHT}
          horizontalInset={20}
          headerHidden={headerHidden}
          scrollY={scrollY}
        >
          <TabHeader />
        </CollapsingHeader>
        <ScrollTopButton
          scrollY={scrollY}
          armed={loaded > SEARCH_PAGE_SIZE}
          onPress={() =>
            listRef.current?.scrollToOffset({ offset: 0, animated: true })
          }
        />
      </View>

      <SearchFilterSheet
        isOpen={isSheetOpen}
        filters={filters}
        facets={context.facets}
        countFor={countFor}
        onApply={(next) => {
          update(next);
          setSheetOpen(false);
          // New results start at their top rather than at a stale deep offset.
          listRef.current?.scrollToOffset({ offset: 0, animated: false });
        }}
        onClose={() => setSheetOpen(false)}
      />
      {selected ? (
        <TransactionDetailSheet
          transaction={selected}
          onDismiss={() => setSelectedId(null)}
        />
      ) : null}
    </>
  );
}

const styles = StyleSheet.create({
  fill: { flex: 1 },
  content: { paddingHorizontal: 20 },
  header: { gap: 28 },
  // Without day headers, the first card needs its own space below the summary.
  summaryGap: { marginBottom: 20 },
  footer: { minHeight: 64, alignItems: "center", justifyContent: "center" },
});
