import { queryScopedTransactionsAsync } from "@/data/database/fast-store-client";
import { getDocumentWindowState } from "@/data/database/month-index";
import { useLocalData } from "@/data/local-data-provider";
import { deleteAccountFromDocument } from "@/data/model/account-record";
import type { BackupDocument } from "@/data/model/backup-document";
import type { JsonObject } from "@/data/model/json";
import {
  accountPeriodRange,
  selectAccountActivity,
  selectAccounts,
  selectAccountTimeline,
  selectAccountTransactionCount,
  shiftAccountPeriodAnchor,
} from "@/data/selectors/document-selectors";
import {
  createHomeTransactionRows,
  type HomeDateRow,
  type HomeTransactionRow,
} from "@/data/selectors/home-section-selectors";
import { selectTransactionProjector } from "@/data/selectors/transaction-selectors";
import { TransactionDateHeader } from "@/features/home/components/transaction-date-header";
import { IndexedTransactionRow } from "@/features/home/components/transaction-list";
import type { Transaction } from "@/features/home/types";
import { TransactionDetailSheet } from "@/features/transactions/transaction-detail-sheet";
import { useAppDate } from "@/shared/lib/use-app-date";
import { useLocalDayClock } from "@/shared/lib/use-local-day-clock";
import { useAppThemeColors } from "@/shared/theme/app-theme";
import { BottomSheet } from "@/shared/ui/app-bottom-sheet";
import { AppBottomSheetPortal } from "@/shared/ui/app-bottom-sheet-portal";
import { Text } from "@/shared/ui/app-text";
import {
  CollapsingHeader,
  CollapsingHeaderSpacer,
  useCollapsingHeader,
} from "@/shared/ui/collapsing-header";
import {
  EdgeToEdgeLayout,
  EdgeToEdgeScrollView,
} from "@/shared/ui/edge-to-edge-layout";
import { FilledIcon } from "@/shared/ui/filled-icon";
import { BottomSafeAreaGradient } from "@/shared/ui/safe-area-gradients";
import { useBottomSheetInitialPositionFix } from "@/shared/ui/use-bottom-sheet-initial-position-fix";
import { BlurTargetView } from "expo-blur";
import { useLocalSearchParams, useRouter } from "expo-router";
import { Button } from "heroui-native";
import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { useTranslation } from "react-i18next";
import {
  Animated,
  Platform,
  Pressable,
  StyleSheet,
  View,
  type ViewInstance,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import Reanimated, { Easing } from "react-native-reanimated";
import {
  EntranceSections,
  EntranceView,
  useListEntrance,
} from "@/shared/ui/page-entrance";
import { AccountActivityCard } from "./components/details/account-activity-card";
import { AccountDetailsHero } from "./components/details/account-details-hero";
import { AccountPeriodNavigator } from "./components/details/account-period-navigator";
import {
  AccountRangeDock,
  type AccountRangeChoice,
} from "./components/details/account-range-dock";
import { AccountStatusCard } from "./components/details/account-status-card";
import type { AccountPeriod } from "./types";

/** Timeline rows rendered before the next page is requested. */
const TIMELINE_PAGE = 40;

type TimelineRow = HomeDateRow | HomeTransactionRow;

/**
 * Account details read top to bottom as now → next → this period → each
 * transaction, newest first. One navigator sets the period for both the
 * summary and the list; the bottom dock sets how long a period is.
 */
export function AccountDetailsScreen() {
  const { formatDate, formatDayMonth, formatDateRange } = useAppDate();
  const { t, i18n } = useTranslation();
  const { id } = useLocalSearchParams<{ id: string }>();
  const { document, ensurePeriodLoaded, updateDocument } = useLocalData();
  const windowState = getDocumentWindowState(document);
  const isPartial = Boolean(windowState?.isPartial);
  const [scopedState, setScopedState] = useState<{
    doc: BackupDocument;
    id: string;
    rows: JsonObject[];
  } | null>(null);
  const accountIds = useMemo(() => {
    const ids = new Set<string>([id]);
    const raw = document.accounts?.find(
      (item) => item.uuid === id || String(item.id ?? "") === id,
    );
    if (raw) {
      if (typeof raw.uuid === "string" && raw.uuid) ids.add(raw.uuid);
      if (typeof raw.id === "string" && raw.id) ids.add(raw.id);
      else if (typeof raw.id === "number" && Number.isFinite(raw.id)) {
        ids.add(String(raw.id));
      }
    }
    return [...ids];
  }, [document, id]);

  useEffect(() => {
    if (!isPartial || !id) return;
    let active = true;
    void queryScopedTransactionsAsync(document, {
      kind: "account",
      ids: accountIds,
    }).then((rows) => {
      if (active && rows) {
        setScopedState({ doc: document, id, rows });
      }
    });
    return () => {
      active = false;
    };
  }, [document, isPartial, id, accountIds]);

  const scopedDocument = useMemo(
    () =>
      scopedState && scopedState.doc === document && scopedState.id === id
        ? { ...document, transactions: scopedState.rows }
        : document,
    [scopedState, document, id],
  );
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const theme = useAppThemeColors();
  const now = useLocalDayClock();
  const [period, setPeriod] = useState<AccountPeriod>("Monthly");
  const [selectedAnchor, setAnchor] = useState<Date | null>(null);
  const anchor = selectedAnchor ?? now;
  const [allTime, setAllTime] = useState(false);
  const [page, setPage] = useState({ key: "", limit: TIMELINE_PAGE });
  const [selectedTransactionId, setSelectedTransactionId] = useState<
    string | null
  >(null);
  const [menu, setMenu] = useState<"actions" | "confirm" | null>(null);
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const menuReady = useRef(Platform.OS === "ios");
  const menuRequested = useRef(false);
  const menuClosing = useRef(false);
  const pendingEdit = useRef(false);
  const { bindSheet: bindMenuSheet, ...menuInitialPositionFix } =
    useBottomSheetInitialPositionFix(isMenuOpen);
  const [deleting, setDeleting] = useState(false);
  const deletingRef = useRef(false);
  const blurTargetRef = useRef<ViewInstance | null>(null);
  const [deleteError, setDeleteError] = useState("");
  const account = useMemo(
    () => selectAccounts(document, now).find((item) => item.id === id),
    [document, id, now],
  );
  const transactionCount = useMemo(
    () => selectAccountTransactionCount(scopedDocument, id),
    [scopedDocument, id],
  );

  // A card with a payday steps by billing cycle rather than calendar month.
  const paymentDay = account?.kind === "credit" ? account.paymentDay : null;
  const bounds = useMemo(() => {
    const current = accountPeriodRange(period, anchor, paymentDay);
    const previous = accountPeriodRange(
      period,
      shiftAccountPeriodAnchor(period, anchor, -1, paymentDay),
      paymentDay,
    );
    const nowTime = now.getTime();
    const startTime = current.start.getTime();
    const endTime = current.end.getTime();
    const isCurrent = nowTime >= startTime && nowTime < endTime;
    const previousStartTime = previous.start.getTime();
    return {
      startTime,
      endTime,
      isCurrent,
      previousStartTime,
      // A running period is compared with the same stretch of the previous
      // one, so the first days of a month are not judged against a whole month.
      previousEndTime: isCurrent
        ? Math.min(
            previous.end.getTime(),
            previousStartTime + (nowTime - startTime),
          )
        : previous.end.getTime(),
    };
  }, [period, anchor, paymentDay, now]);
  const { startTime, endTime, isCurrent, previousStartTime, previousEndTime } =
    bounds;
  const start = new Date(startTime);
  const end = new Date(endTime);

  useLayoutEffect(() => {
    if (!allTime && isPartial) {
      void ensurePeriodLoaded?.(new Date(startTime), new Date(endTime));
    }
  }, [ensurePeriodLoaded, allTime, isPartial, startTime, endTime]);
  useEffect(() => {
    if (!allTime && isPartial) {
      void ensurePeriodLoaded?.(
        new Date(previousStartTime),
        new Date(previousEndTime),
      );
    }
  }, [ensurePeriodLoaded, allTime, isPartial, previousStartTime, previousEndTime]);

  const activity = useMemo(
    () =>
      selectAccountActivity(
        scopedDocument,
        id,
        allTime
          ? null
          : { start: new Date(startTime), end: new Date(endTime) },
      ),
    [scopedDocument, id, allTime, startTime, endTime],
  );
  const previousActivity = useMemo(
    () =>
      allTime || previousEndTime <= previousStartTime
        ? null
        : selectAccountActivity(scopedDocument, id, {
            start: new Date(previousStartTime),
            end: new Date(previousEndTime),
          }),
    [scopedDocument, id, allTime, previousStartTime, previousEndTime],
  );

  const accountCurrency = account?.currencyCode ?? "USD";
  const primaryTotal = activity.totals.find(
    (total) => total.currencyCode === accountCurrency,
  ) ?? { currencyCode: accountCurrency, income: 0, expense: 0 };
  const otherTotals = activity.totals.filter(
    (total) => total.currencyCode !== accountCurrency,
  );
  const previousExpense =
    previousActivity?.totals.find(
      (total) => total.currencyCode === accountCurrency,
    )?.expense ?? 0;
  const comparison =
    previousExpense > 0
      ? {
          percent:
            ((primaryTotal.expense - previousExpense) / previousExpense) * 100,
          soFar: isCurrent,
        }
      : null;

  const pageKey = allTime ? "all" : `${period}:${startTime}:${endTime}`;
  // Hero, status, period and the timeline title enter in turn, then the rows
  // on screen. Choosing another period replays the rows.
  const { rowKey, rowEntering } = useListEntrance(4, { replayKey: pageKey });
  const limit = page.key === pageKey ? page.limit : TIMELINE_PAGE;
  const rows = useMemo<TimelineRow[]>(
    () => createHomeTransactionRows(activity.entries.slice(0, limit)),
    [activity, limit],
  );
  const loadMore = useCallback(() => {
    if (limit >= activity.entries.length) return;
    setPage({ key: pageKey, limit: limit + TIMELINE_PAGE });
  }, [limit, activity, pageKey]);

  const project = selectTransactionProjector(
    scopedDocument,
    i18n.resolvedLanguage,
  );
  const onTransactionPress = useCallback(
    (transaction: Transaction) => setSelectedTransactionId(transaction.id),
    [],
  );
  const selectedTransaction = useMemo(() => {
    if (!selectedTransactionId) return null;
    const entry = selectAccountTimeline(scopedDocument, id).find(
      (item) => item.id === selectedTransactionId,
    );
    return entry ? project(entry) : null;
  }, [selectedTransactionId, scopedDocument, id, project]);

  const renderRow = useCallback(
    ({ item, index }: { item: TimelineRow; index: number }) => (
      <Reanimated.View key={rowKey} entering={rowEntering(index)}>
      {item.kind === "date" ? (
        <TransactionDateHeader
          timestamp={item.timestamp}
          now={now}
          isFirst={index === 0}
        />
      ) : (
        <View
          className={`border-x border-border bg-surface px-4 ${
            item.first ? "rounded-t-[24px] border-t pt-1" : ""
          } ${item.last ? "rounded-b-[24px] border-b pb-1" : ""}`}
          style={{ borderCurve: "continuous" }}
        >
          <IndexedTransactionRow
            entry={item.entry}
            project={project}
            showBorder={!item.last}
            showAccountName={false}
            onPress={onTransactionPress}
          />
        </View>
      )}
      </Reanimated.View>
    ),
    [now, project, onTransactionPress, rowKey, rowEntering],
  );

  const language = i18n.resolvedLanguage;
  const lastDay = new Date(endTime - 1);
  const withYear = (date: Date) =>
    date.getFullYear() === now.getFullYear() ? {} : { year: "numeric" as const };
  let periodTitle: string;
  let periodSubtitle: string;
  if (allTime) {
    let oldest: number | null = null;
    for (let i = activity.entries.length - 1; i >= 0; i--) {
      if (Number.isFinite(activity.entries[i].timestamp)) {
        oldest = activity.entries[i].timestamp;
        break;
      }
    }
    periodTitle = t("accounts.details.navigator.allHistory");
    periodSubtitle =
      oldest === null
        ? t("accounts.details.navigator.noDates")
        : t("accounts.details.navigator.since", {
            date: formatDate(new Date(oldest)),
          });
  } else if (period === "Daily") {
    const yesterday = new Date(
      now.getFullYear(),
      now.getMonth(),
      now.getDate() - 1,
    ).getTime();
    periodTitle = isCurrent
      ? t("accounts.details.navigator.today")
      : startTime === yesterday
        ? t("accounts.details.navigator.yesterday")
        : start.toLocaleDateString(language, { weekday: "long" });
    periodSubtitle = formatDate(start);
  } else {
    periodSubtitle = formatDateRange(start, lastDay);
    if (period === "Weekly") {
      periodTitle = isCurrent
        ? t("accounts.details.navigator.thisWeek")
        : `${formatDayMonth(start)} – ${formatDayMonth(lastDay)}`;
    } else if (period === "Monthly" && paymentDay != null) {
      periodTitle = isCurrent
        ? t("accounts.details.navigator.thisCycle")
        : t("accounts.details.navigator.cycle", {
            month: end.toLocaleDateString(language, {
              month: "long",
              ...withYear(end),
            }),
          });
    } else if (period === "Monthly") {
      periodTitle = isCurrent
        ? t("accounts.details.navigator.thisMonth")
        : start.toLocaleDateString(language, {
            month: "long",
            ...withYear(start),
          });
    } else {
      periodTitle = isCurrent
        ? t("accounts.details.navigator.thisYear")
        : String(start.getFullYear());
    }
  }

  function openMenu() {
    if (menuRequested.current || deletingRef.current || menuClosing.current)
      return;
    menuRequested.current = true;
    setIsMenuOpen(menuReady.current);
    setMenu("actions");
  }

  function openMenuAfterLayout() {
    // Pre-measure the closed sheet so taps can open it immediately. A tap before
    // the portal's first layout still waits for a mounted false -> true change.
    menuReady.current = true;
    if (menuRequested.current && !menuClosing.current) setIsMenuOpen(true);
  }

  function closeMenu() {
    menuClosing.current = true;
    setIsMenuOpen(false);
  }

  function movePeriod(direction: number) {
    setAnchor(shiftAccountPeriodAnchor(period, anchor, direction, paymentDay));
    setAllTime(false);
  }

  function chooseRange(choice: AccountRangeChoice) {
    if (choice === "All") {
      setAllTime(true);
      return;
    }
    setPeriod(choice);
    setAnchor(null);
    setAllTime(false);
  }

  function goBack() {
    if (router.canGoBack?.()) router.back();
    else router.dismissTo("/accounts");
  }

  function editAccount() {
    pendingEdit.current = true;
    closeMenu();
  }

  async function deleteAccount() {
    if (deletingRef.current) return;
    deletingRef.current = true;
    setDeleting(true);
    setDeleteError("");
    try {
      await updateDocument((current) =>
        deleteAccountFromDocument(current, id, new Date().toISOString()),
      );
      menuRequested.current = false;
      setIsMenuOpen(false);
      setMenu(null);
      router.dismissTo("/accounts");
    } catch (reason) {
      setDeleteError(
        reason instanceof Error
          ? reason.message
          : t("accounts.details.delete.error"),
      );
    } finally {
      deletingRef.current = false;
      setDeleting(false);
    }
  }
  const { headerHidden, onScroll, scrollY } = useCollapsingHeader();

  if (!account)
    return (
      <EdgeToEdgeLayout>
        <EdgeToEdgeScrollView
          contentContainerStyle={{ paddingHorizontal: 24, paddingTop: 24 }}
        >
          <Text className="px-5 py-6 text-foreground">
            {t("accounts.common.accountNotFound")}
          </Text>
          <Pressable
            accessibilityRole="button"
            onPress={() => router.dismissTo("/accounts")}
            style={styles.action}
          >
            <Text className="text-accent">
              {t("accounts.common.backToAccounts")}
            </Text>
          </Pressable>
        </EdgeToEdgeScrollView>
      </EdgeToEdgeLayout>
    );

  const periodCount = activity.entries.length;

  return (
    <View style={[styles.screen, { backgroundColor: theme.background }]}>
      <BlurTargetView ref={blurTargetRef} style={{ flex: 1 }}>
        <Animated.FlatList
          data={rows}
          keyExtractor={(row) => `${row.kind}:${row.id}`}
          renderItem={renderRow}
          initialNumToRender={14}
          maxToRenderPerBatch={10}
          updateCellsBatchingPeriod={32}
          windowSize={7}
          onEndReached={loadMore}
          onEndReachedThreshold={0.6}
          contentContainerStyle={{
            paddingHorizontal: 16,
            paddingBottom: 124 + insets.bottom,
          }}
          onScroll={onScroll}
          scrollEventThrottle={16}
          showsVerticalScrollIndicator={false}
          ListHeaderComponent={
            <View>
              <CollapsingHeaderSpacer />
              <EntranceSections style={styles.sections}>
                <AccountDetailsHero account={account} />
                <AccountStatusCard account={account} />
                <View style={styles.periodGroup}>
                  <AccountPeriodNavigator
                    title={periodTitle}
                    subtitle={periodSubtitle}
                    showArrows={!allTime}
                    canGoNext={!isCurrent && startTime <= now.getTime()}
                    onPrevious={() => movePeriod(-1)}
                    onNext={() => movePeriod(1)}
                  />
                  <AccountActivityCard
                    primary={primaryTotal}
                    others={otherTotals}
                    comparison={comparison}
                  />
                </View>
                {periodCount > 0 ? (
                  <View className="flex-row items-center gap-2 px-1 pb-1 pt-2">
                    <Text
                      accessibilityRole="header"
                      numberOfLines={1}
                      className="min-w-0 shrink font-manrope-bold text-[19px] leading-[24px] tracking-[-0.2px] text-foreground"
                    >
                      {t("accounts.details.timeline")}
                    </Text>
                    <View className="shrink-0 rounded-full border border-border/70 bg-surface px-2.5 py-0.5">
                      <Text
                        className="font-manrope-semibold text-[11px] leading-[15px] text-muted"
                        style={{ fontVariant: ["tabular-nums"] }}
                      >
                        {periodCount.toLocaleString(language)}
                      </Text>
                    </View>
                  </View>
                ) : null}
              </EntranceSections>
            </View>
          }
          ListEmptyComponent={
            <EntranceView
              key={rowKey}
              slot={4}
              className="mt-2 items-center gap-3 rounded-[24px] border border-border bg-surface px-6 py-8"
              style={{ borderCurve: "continuous" }}
            >
              <View
                className="size-11 items-center justify-center rounded-2xl bg-surface-secondary"
                style={{ borderCurve: "continuous" }}
              >
                <FilledIcon name="receipt" size={20} tone="muted" />
              </View>
              <Text className="text-center font-sans text-[14px] leading-[20px] text-muted">
                {transactionCount
                  ? t("accounts.details.noPeriodTransactions")
                  : t("accounts.details.emptyAccount")}
              </Text>
              {transactionCount > 0 && !allTime ? (
                <Pressable
                  accessibilityRole="button"
                  onPress={() => setAllTime(true)}
                  className="min-h-10 flex-row items-center gap-1.5 rounded-full border border-border bg-surface-secondary px-4"
                  style={({ pressed }) => ({ opacity: pressed ? 0.68 : 1 })}
                >
                  <FilledIcon name="history" size={16} tone="accent" />
                  <Text className="font-manrope-semibold text-[13px] leading-[18px] text-accent">
                    {t("accounts.details.showAllHistory")}
                  </Text>
                </Pressable>
              ) : null}
            </EntranceView>
          }
        />
      </BlurTargetView>
      <BottomSafeAreaGradient fadeHeight={134} />
      <CollapsingHeader
        horizontalInset={14}
        headerHidden={headerHidden}
        scrollY={scrollY}
        topInset={insets.top}
      >
        <View style={styles.header}>
          <Button
            isIconOnly
            variant="ghost"
            accessibilityLabel={t("accounts.details.back")}
            onPress={goBack}
          >
            <FilledIcon name="arrow-left" size={26} />
          </Button>
          <Text
            accessibilityRole="header"
            numberOfLines={1}
            className="flex-1 font-manrope-bold text-2xl text-foreground"
          >
            {t("accounts.details.title")}
          </Text>
          <Button
            isIconOnly
            variant="ghost"
            accessibilityLabel={t("accounts.details.options")}
            accessibilityState={{ expanded: isMenuOpen }}
            onPress={openMenu}
          >
            <FilledIcon name="more-vert" size={26} />
          </Button>
        </View>
      </CollapsingHeader>
      <View style={[styles.dock, { bottom: Math.max(insets.bottom, 10) }]}>
        <AccountRangeDock
          blurTarget={blurTargetRef}
          value={allTime ? "All" : period}
          monthIsCycle={paymentDay != null}
          onChange={chooseRange}
        />
      </View>
      {selectedTransaction ? (
        <TransactionDetailSheet
          transaction={selectedTransaction}
          onDismiss={() => setSelectedTransactionId(null)}
        />
      ) : null}
      {/* Keep the closed sheet mounted to avoid portal/layout work on each tap. */}
      <BottomSheet
        isOpen={isMenuOpen}
        onOpenChange={(open) => {
          if (!open && !deletingRef.current && isMenuOpen) {
            closeMenu();
          }
        }}
      >
        <AppBottomSheetPortal
          isOpen={isMenuOpen}
          unstable_accessibilityContainerViewIsModal
        >
          <BottomSheet.Overlay isCloseOnPress={!deleting} />
          <BottomSheet.Content
            ref={bindMenuSheet}
            containerStyle={menuInitialPositionFix.containerStyle}
            onChange={menuInitialPositionFix.onChange}
            topInset={insets.top}
            enablePanDownToClose={!deleting}
            enableHandlePanningGesture={!deleting}
            enableContentPanningGesture={!deleting}
            animationConfigs={{
              duration: 250,
              easing: Easing.bezier(0.23, 1, 0.32, 1),
            }}
            contentContainerClassName="px-5 pb-0 pt-1"
            backgroundClassName="rounded-t-[28px] bg-surface"
            handleIndicatorClassName="w-10 bg-muted/40"
            onClose={() => {
              // Mounting closed can emit onClose before the opening layout.
              if (!menuClosing.current) return;
              menuClosing.current = false;
              menuRequested.current = false;
              setMenu(null);
              setDeleteError("");
              if (pendingEdit.current) {
                pendingEdit.current = false;
                router.push({
                  pathname: "/accounts/[id]/edit",
                  params: { id },
                });
              }
            }}
          >
            <View
              onLayout={openMenuAfterLayout}
              className="gap-4"
              style={{ paddingBottom: Math.max(insets.bottom, 16) + 12 }}
            >
              {menu === "confirm" ? (
                <>
                  <View className="gap-2">
                    <BottomSheet.Title>
                      {t("accounts.details.delete.title")}
                    </BottomSheet.Title>
                    <BottomSheet.Description className="font-sans text-base leading-6">
                      {transactionCount
                        ? t("accounts.details.delete.withTransactions", {
                            name: account.name,
                            count: transactionCount,
                          })
                        : t("accounts.details.delete.withoutTransactions", {
                            name: account.name,
                          })}
                    </BottomSheet.Description>
                  </View>
                  {!!deleteError && (
                    <Text accessibilityRole="alert" className="text-danger">
                      {deleteError}
                    </Text>
                  )}
                  <View className="flex-row gap-3">
                    <Button
                      className="flex-1"
                      variant="tertiary"
                      isDisabled={deleting}
                      onPress={() => setMenu("actions")}
                    >
                      <Button.Label>
                        {t("accounts.details.delete.cancel")}
                      </Button.Label>
                    </Button>
                    <Button
                      className="flex-1"
                      variant="danger"
                      isDisabled={deleting}
                      accessibilityLabel={
                        deleting
                          ? t("accounts.details.delete.deletingAccessibility")
                          : t("accounts.details.delete.deleteAccessibility")
                      }
                      accessibilityState={{ busy: deleting }}
                      onPress={deleteAccount}
                    >
                      <Button.Label>
                        {deleting
                          ? t("accounts.details.delete.deleting")
                          : t("accounts.details.delete.confirm")}
                      </Button.Label>
                    </Button>
                  </View>
                </>
              ) : (
                <>
                  <View className="gap-1">
                    <BottomSheet.Title>{account.name}</BottomSheet.Title>
                    {!!account.ownerName && (
                      <BottomSheet.Description>
                        {account.ownerName}
                      </BottomSheet.Description>
                    )}
                  </View>
                  <View className="flex-row gap-3" style={{ direction: "ltr" }}>
                    <Button
                      className="flex-1"
                      variant="secondary"
                      onPress={editAccount}
                    >
                      <FilledIcon name="pencil" size={22} />
                      <Button.Label>
                        {t("accounts.details.delete.edit")}
                      </Button.Label>
                    </Button>
                    <Button
                      className="flex-1"
                      variant="danger-soft"
                      onPress={() => {
                        setDeleteError("");
                        setMenu("confirm");
                      }}
                    >
                      <FilledIcon name="delete" tone="danger" size={22} />
                      <Button.Label>
                        {t("accounts.details.delete.action")}
                      </Button.Label>
                    </Button>
                  </View>
                </>
              )}
            </View>
          </BottomSheet.Content>
        </AppBottomSheetPortal>
      </BottomSheet>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1 },
  header: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    paddingVertical: 8,
  },
  sections: { gap: 24, paddingTop: 12 },
  periodGroup: { gap: 12 },
  dock: { position: "absolute", left: 12, right: 12, zIndex: 20 },
  action: {
    minHeight: 52,
    flexDirection: "row",
    alignItems: "center",
    gap: 16,
  },
});
