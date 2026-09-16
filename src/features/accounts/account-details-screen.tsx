import {
  EdgeToEdgeLayout,
  EdgeToEdgeScrollView,
} from "@/shared/ui/edge-to-edge-layout";
import { BottomSafeAreaGradient } from "@/shared/ui/safe-area-gradients";
import { useLocalData } from "@/data/local-data-provider";
import { deleteAccountFromDocument } from "@/data/model/account-record";
import {
  accountPeriodRange,
  filterAccountTransactions,
  selectAccounts,
  selectAccountTransactions,
} from "@/data/selectors/document-selectors";
import { formatCurrency } from "@/shared/lib/currency";
import { FilledIcon } from "@/shared/ui/filled-icon";
import { AppBottomSheetPortal } from "@/shared/ui/app-bottom-sheet-portal";
import { useBottomSheetInitialPositionFix } from "@/shared/ui/use-bottom-sheet-initial-position-fix";
import { useAppLocalization } from "@/localization/localization-provider";
import { useAppThemeColors } from "@/shared/theme/app-theme";
import { BlurTargetView } from "expo-blur";
import { useLocalSearchParams, useRouter } from "expo-router";
import { BottomSheet, Button } from "heroui-native";
import { useEffect, useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { Animated, Pressable, StyleSheet, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { AccountCard } from "./components/account-card";
import { AccountPeriodSelector } from "./components/account-period-selector";
import type { AccountPeriod } from "./types";
import { Text } from "@/shared/ui/app-text";
import {
  CollapsingHeader,
  CollapsingHeaderSpacer,
  useCollapsingHeader,
} from "@/shared/ui/collapsing-header";

export function AccountDetailsScreen() {
  const { t, i18n } = useTranslation();
  const { isRTL } = useAppLocalization();
  const { id } = useLocalSearchParams<{ id: string }>();
  const { document, updateDocument } = useLocalData();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const theme = useAppThemeColors();
  const [period, setPeriod] = useState<AccountPeriod>("Monthly");
  const [anchor, setAnchor] = useState(() => new Date());
  const [allTime, setAllTime] = useState(true);
  const [menu, setMenu] = useState<"actions" | "confirm" | null>(null);
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const menuInitialPositionFix = useBottomSheetInitialPositionFix(isMenuOpen);
  const [deleting, setDeleting] = useState(false);
  const deletingRef = useRef(false);
  const blurTargetRef = useRef<View | null>(null);
  const [deleteError, setDeleteError] = useState("");
  const account = useMemo(
    () => selectAccounts(document).find((item) => item.id === id),
    [document, id],
  );
  const transactions = useMemo(
    () => selectAccountTransactions(document, id),
    [document, id],
  );
  const visible = useMemo(
    () =>
      allTime
        ? transactions
        : filterAccountTransactions(transactions, period, anchor),
    [transactions, allTime, period, anchor],
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
  const { start, end } = accountPeriodRange(period, anchor);
  const periodLabel = {
    Daily: t("accounts.details.periods.daily"),
    Weekly: t("accounts.details.periods.weekly"),
    Monthly: t("accounts.details.periods.monthly"),
    Yearly: t("accounts.details.periods.yearly"),
  }[period];
  const dateLabel = allTime
    ? t("accounts.details.allTransactionHistory")
    : `${start.toLocaleDateString(i18n.resolvedLanguage)}${period === "Daily" ? "" : ` – ${new Date(end.getTime() - 1).toLocaleDateString(i18n.resolvedLanguage)}`}`;
  const isMenuMounted = menu !== null;

  useEffect(() => {
    if (!isMenuMounted) {
      setIsMenuOpen(false);
      return;
    }
    const frame = requestAnimationFrame(() => setIsMenuOpen(true));
    return () => cancelAnimationFrame(frame);
  }, [isMenuMounted]);

  function movePeriod(direction: number) {
    const next = new Date(start);
    if (period === "Yearly") next.setFullYear(next.getFullYear() + direction);
    else if (period === "Monthly") next.setMonth(next.getMonth() + direction);
    else
      next.setDate(next.getDate() + direction * (period === "Weekly" ? 7 : 1));
    setAnchor(next);
    setAllTime(false);
  }

  function editAccount() {
    setIsMenuOpen(false);
    setTimeout(() => {
      router.push({ pathname: "/accounts/[id]/edit", params: { id } });
    }, 220);
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
              <AccountCard account={account} />
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
              {transactions.length
                ? t("accounts.details.emptyPeriod")
                : t("accounts.details.emptyAccount")}
            </Text>
          }
        />
        <BottomSafeAreaGradient fadeHeight={134} />
      </BlurTargetView>
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
            onPress={() => setMenu("actions")}
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
            setAllTime(false);
          }}
        />
      </View>
      {isMenuMounted && (
        <BottomSheet
          isOpen={isMenuOpen}
          onOpenChange={(open) => {
            if (!open && !deleting) {
              setIsMenuOpen(false);
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
              contentContainerClassName="px-5 pb-0 pt-1"
              backgroundClassName="rounded-t-[28px] bg-surface"
              handleIndicatorClassName="w-10 bg-muted/40"
              onClose={() => {
                setMenu(null);
                setDeleteError("");
              }}
            >
              <View
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
                        {transactions.length
                          ? t("accounts.details.delete.withTransactions", {
                              name: account.name,
                              count: transactions.length,
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
                    <Button
                      className="w-full justify-start"
                      variant="secondary"
                      onPress={editAccount}
                    >
                      <FilledIcon name="pencil" size={22} />
                      <Button.Label>
                        {t("accounts.details.delete.edit")}
                      </Button.Label>
                    </Button>
                    <Button
                      className="w-full justify-start"
                      variant="danger-soft"
                      onPress={() => {
                        setDeleteError("");
                        setMenu("confirm");
                      }}
                    >
                      <Button.Label>
                        {t("accounts.details.delete.action")}
                      </Button.Label>
                    </Button>
                  </>
                )}
              </View>
            </BottomSheet.Content>
          </AppBottomSheetPortal>
        </BottomSheet>
      )}
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
  dock: { position: "absolute", left: 12, right: 12 },
  action: {
    minHeight: 52,
    flexDirection: "row",
    alignItems: "center",
    gap: 16,
  },
});
