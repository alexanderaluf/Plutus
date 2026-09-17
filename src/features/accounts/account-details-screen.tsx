import { useLocalData } from "@/data/local-data-provider";
import { deleteAccountFromDocument } from "@/data/model/account-record";
import {
  accountPeriodRange,
  selectAccounts,
  selectAccountTransactionCount,
  selectAccountTransactions,
  shiftAccountPeriodAnchor,
} from "@/data/selectors/document-selectors";
import { useAppLocalization } from "@/localization/localization-provider";
import { formatCurrency } from "@/shared/lib/currency";
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
import { useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { Animated, Platform, Pressable, StyleSheet, View } from "react-native";
import { Easing } from "react-native-reanimated";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { AccountCard } from "./components/account-card";
import { AccountPeriodSelector } from "./components/account-period-selector";
import type { AccountPeriod } from "./types";

export function AccountDetailsScreen() {
  const { t, i18n } = useTranslation();
  const { isRTL } = useAppLocalization();
  const { id } = useLocalSearchParams<{ id: string }>();
  const { document, updateDocument } = useLocalData();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const theme = useAppThemeColors();
  const now = useLocalDayClock();
  const [period, setPeriod] = useState<AccountPeriod>("Monthly");
  const [selectedAnchor, setAnchor] = useState<Date | null>(null);
  const anchor = selectedAnchor ?? now;
  const [allTime, setAllTime] = useState(false);
  const [menu, setMenu] = useState<"actions" | "confirm" | null>(null);
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const menuReady = useRef(Platform.OS === "ios");
  const menuRequested = useRef(false);
  const menuClosing = useRef(false);
  const pendingEdit = useRef(false);
  const menuInitialPositionFix = useBottomSheetInitialPositionFix(isMenuOpen);
  const [deleting, setDeleting] = useState(false);
  const deletingRef = useRef(false);
  const blurTargetRef = useRef<View | null>(null);
  const [deleteError, setDeleteError] = useState("");
  const account = useMemo(
    () => selectAccounts(document, now).find((item) => item.id === id),
    [document, id, now],
  );
  const transactionCount = useMemo(
    () => selectAccountTransactionCount(document, id),
    [document, id],
  );
  const visible = useMemo(
    () =>
      selectAccountTransactions(
        document,
        id,
        allTime ? undefined : { period, anchor },
      ),
    [document, id, allTime, period, anchor],
  );
  const totals = useMemo(
    () =>
      [...new Set(visible.map((item) => item.currencyCode))].map(
        (currency) => ({
          currency,
          income: visible
            .filter(
              (item) =>
                item.currencyCode === currency && item.type === "income",
            )
            .reduce((sum, item) => sum + item.amount, 0),
          expense: visible
            .filter(
              (item) =>
                item.currencyCode === currency && item.type === "expense",
            )
            .reduce((sum, item) => sum + item.amount, 0),
        }),
      ),
    [visible],
  );
  const paymentDay = account?.kind === "credit" ? account.paymentDay : null;
  const { start, end } = accountPeriodRange(period, anchor, paymentDay);
  const periodLabel = {
    Daily: t("accounts.details.periods.daily"),
    Weekly: t("accounts.details.periods.weekly"),
    Monthly: t("accounts.details.periods.monthly"),
    Yearly: t("accounts.details.periods.yearly"),
  }[period];
  const dateLabel = allTime
    ? t("accounts.details.allTransactionHistory")
    : `${start.toLocaleDateString(i18n.resolvedLanguage)}${period === "Daily" ? "" : ` – ${new Date(end.getTime() - 1).toLocaleDateString(i18n.resolvedLanguage)}`}`;
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

  return (
    <View style={[styles.screen, { backgroundColor: theme.background }]}>
      <BlurTargetView ref={blurTargetRef} style={{ flex: 1 }}>
        <Animated.FlatList
          data={visible}
          keyExtractor={(item) => item.id}
          contentContainerStyle={{
            paddingHorizontal: 16,
            paddingBottom: 110 + insets.bottom,
          }}
          onScroll={onScroll}
          scrollEventThrottle={16}
          showsVerticalScrollIndicator={false}
          ListHeaderComponent={
            <View style={{ gap: 20 }}>
              <CollapsingHeaderSpacer />
              <AccountCard account={account} showDetails />
              <View
                style={[styles.summary, { backgroundColor: theme.surface }]}
              >
                <Text className="font-manrope-bold text-base text-accent">
                  {allTime
                    ? t("accounts.details.allTime")
                    : t("accounts.details.activity", { period: periodLabel })}
                </Text>
                {(totals.length
                  ? totals
                  : [{ currency: account.currencyCode, income: 0, expense: 0 }]
                ).map((total) => (
                  <View key={total.currency} style={styles.row}>
                    <View style={{ flex: 1, gap: 6 }}>
                      <Text className="text-sm text-muted">
                        {t("accounts.details.incomeCurrency", {
                          currency: total.currency,
                        })}
                      </Text>
                      <Text className="font-manrope-bold text-lg text-[#82d6a1]">
                        {formatCurrency(total.income, total.currency)}
                      </Text>
                    </View>
                    <View style={{ flex: 1, gap: 6 }}>
                      <Text className="text-sm text-muted">
                        {t("accounts.details.expenseCurrency", {
                          currency: total.currency,
                        })}
                      </Text>
                      <Text className="font-manrope-bold text-lg text-[#ef8175]">
                        {formatCurrency(total.expense, total.currency)}
                      </Text>
                    </View>
                  </View>
                ))}
              </View>
              <View style={styles.row}>
                <Text
                  accessibilityRole="header"
                  className="flex-1 font-manrope-bold text-lg text-foreground"
                >
                  {t("accounts.details.transactions", {
                    count: visible.length,
                  })}
                </Text>
                <Pressable
                  accessibilityRole="button"
                  accessibilityState={{ selected: allTime }}
                  onPress={() => setAllTime(true)}
                  style={styles.iconButton}
                >
                  <Text className="font-manrope-semibold text-sm text-accent">
                    {t("accounts.details.allHistory")}
                  </Text>
                </Pressable>
              </View>
              <View style={[styles.row, { marginBottom: 12 }]}>
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel={t("accounts.details.previousPeriod")}
                  onPress={() => movePeriod(-1)}
                  style={styles.iconButton}
                >
                  <Text className="text-xl text-foreground">
                    {isRTL ? "›" : "‹"}
                  </Text>
                </Pressable>
                <Text className="flex-1 text-center font-sans text-sm text-muted">
                  {dateLabel}
                </Text>
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel={t("accounts.details.nextPeriod")}
                  onPress={() => movePeriod(1)}
                  style={styles.iconButton}
                >
                  <Text className="text-xl text-foreground">
                    {isRTL ? "‹" : "›"}
                  </Text>
                </Pressable>
              </View>
            </View>
          }
          renderItem={({ item }) => (
            <View
              style={[styles.transaction, { borderBottomColor: theme.border }]}
            >
              <FilledIcon
                name={
                  item.type === "income"
                    ? "arrow-bottom-left"
                    : item.type === "expense"
                      ? "arrow-top-right"
                      : "swap-horizontal"
                }
                color={
                  item.type === "income"
                    ? "#82d6a1"
                    : item.type === "expense"
                      ? theme.danger
                      : theme.accent
                }
                size={24}
              />
              <View style={{ flex: 1, gap: 5 }}>
                <Text className="font-manrope-semibold text-base text-foreground">
                  {item.name}
                </Text>
                <Text className="font-sans text-xs text-muted">
                  {item.type === "transfer"
                    ? t("accounts.details.transfer")
                    : item.category}{" "}
                  ·{" "}
                  {item.timestamp == null
                    ? t("accounts.details.unknownDate")
                    : new Date(item.timestamp).toLocaleDateString(
                        i18n.resolvedLanguage,
                      )}
                </Text>
              </View>
              <Text
                className="font-manrope-bold text-sm"
                style={{
                  color: item.type === "income" ? "#82d6a1" : theme.foreground,
                }}
              >
                {item.type === "income"
                  ? "+"
                  : item.type === "expense"
                    ? "−"
                    : ""}
                {formatCurrency(item.amount, item.currencyCode)}
              </Text>
            </View>
          )}
          ListEmptyComponent={
            <Text className="py-10 text-center font-sans text-base text-muted">
              {transactionCount
                ? t("accounts.details.emptyPeriod")
                : t("accounts.details.emptyAccount")}
            </Text>
          }
        />
      </BlurTargetView>
      <BottomSafeAreaGradient fadeHeight={134} />
      <CollapsingHeader
        headerHidden={headerHidden}
        scrollY={scrollY}
        topInset={insets.top}
      >
        <View style={styles.header}>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={t("accounts.common.backToAccounts")}
            onPress={() => router.dismissTo("/accounts")}
            style={styles.iconButton}
          >
            <FilledIcon name="arrow-left" size={26} />
          </Pressable>
          <Text
            accessibilityRole="header"
            className="flex-1 font-manrope-bold text-xl text-foreground"
          >
            {t("accounts.details.title")}
          </Text>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={t("accounts.details.options")}
            accessibilityState={{ expanded: isMenuOpen }}
            onPress={openMenu}
            style={styles.iconButton}
          >
            <Text style={{ color: theme.foreground, fontSize: 30 }}>⋮</Text>
          </Pressable>
        </View>
      </CollapsingHeader>
      <View style={[styles.dock, { bottom: Math.max(insets.bottom, 10) }]}>
        <AccountPeriodSelector
          blurTarget={blurTargetRef}
          value={period}
          onChange={(value) => {
            setPeriod(value);
            setAnchor(null);
            setAllTime(false);
          }}
        />
      </View>
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
            containerStyle={menuInitialPositionFix.containerStyle}
            onChange={menuInitialPositionFix.onChange}
            bottomInset={insets.bottom}
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
    gap: 12,
    paddingVertical: 12,
  },
  row: { flexDirection: "row", alignItems: "center", gap: 12 },
  iconButton: {
    minWidth: 44,
    minHeight: 44,
    justifyContent: "center",
    alignItems: "center",
  },
  summary: {
    padding: 20,
    borderRadius: 24,
    gap: 18,
  },
  transaction: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    paddingVertical: 18,
    borderBottomWidth: 1,
  },
  dock: { position: "absolute", left: 12, right: 12, zIndex: 20 },
  action: {
    minHeight: 52,
    flexDirection: "row",
    alignItems: "center",
    gap: 16,
  },
});
