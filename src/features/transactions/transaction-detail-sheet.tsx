import { BottomSheetScrollView } from "@gorhom/bottom-sheet";
import { useRouter } from "expo-router";
import { BottomSheet, Button, useThemeColor } from "heroui-native";
import { useEffect, useRef, useState, type ReactNode } from "react";
import { I18nManager, Image, StyleSheet, View } from "react-native";
import { useTranslation } from "react-i18next";
import Animated, {
  FadeIn,
  FadeOut,
  ReduceMotion,
} from "react-native-reanimated";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import {
  deleteAttachment,
  getAttachmentFile,
} from "@/data/attachments/attachment-store";
import { useLocalData } from "@/data/local-data-provider";
import { deleteTransaction } from "@/data/model/transaction-record";
import { selectRecurringTransactionSnapshot } from "@/data/selectors/recurring-selectors";
import { useProfiles } from "@/features/profile/profile-provider";
import type { Transaction } from "@/features/home/types";
import { formatCurrency } from "@/shared/lib/currency";
import { colorWithAlpha, useAppThemeColors } from "@/shared/theme/app-theme";
import { Text } from "@/shared/ui/app-text";
import { AppBottomSheetPortal } from "@/shared/ui/app-bottom-sheet-portal";
import { FilledIcon, type FilledIconName } from "@/shared/ui/filled-icon";
import { RecordIcon } from "@/shared/ui/record-icon";
import { useBottomSheetInitialPositionFix } from "@/shared/ui/use-bottom-sheet-initial-position-fix";
import { RecurringPaymentSnapshot } from "./recurring-payment-snapshot";

function useSheetDirection() {
  const { i18n } = useTranslation();
  const isRTL = i18n.dir(i18n.resolvedLanguage ?? i18n.language) === "rtl";
  const flip = isRTL !== I18nManager.isRTL;

  return {
    nativeDirection: I18nManager.isRTL ? ("rtl" as const) : ("ltr" as const),
    writingDirection: isRTL ? ("rtl" as const) : ("ltr" as const),
    row: (flip ? "row-reverse" : "row") as "row" | "row-reverse",
    start: (flip ? "right" : "left") as "left" | "right",
    end: (flip ? "left" : "right") as "left" | "right",
  };
}

function DetailRow({
  icon,
  label,
  value,
  leading,
}: {
  icon: FilledIconName;
  label: string;
  value: string;
  leading?: ReactNode;
}) {
  const { row, start, writingDirection } = useSheetDirection();

  return (
    <View className="items-center gap-4 py-3" style={{ flexDirection: row }}>
      <View className="size-10 items-center justify-center">
        {leading ?? <FilledIcon name={icon} size={24} tone="muted" />}
      </View>
      <View className="min-w-0 flex-1 gap-0.5">
        <Text
          className="font-sans text-sm text-muted"
          style={{ textAlign: start, writingDirection }}
        >
          {label}
        </Text>
        <Text
          className="font-manrope-semibold text-base text-foreground"
          style={{ textAlign: start, writingDirection }}
        >
          {value}
        </Text>
      </View>
    </View>
  );
}

export function TransactionDetailSheet({
  transaction,
  onDismiss,
}: {
  transaction: Transaction;
  onDismiss: () => void;
}) {
  const { t, i18n } = useTranslation();
  const router = useRouter();
  const { nativeDirection, writingDirection, row, start, end } =
    useSheetDirection();
  const insets = useSafeAreaInsets();
  const theme = useAppThemeColors();
  const dangerForeground = useThemeColor("danger-foreground");
  const { document, updateDocument } = useLocalData();
  const { activeProfile } = useProfiles();
  const [isOpen, setIsOpen] = useState(false);
  const initialPositionFix = useBottomSheetInitialPositionFix(isOpen);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [deleteConfirmationVisible, setDeleteConfirmationVisible] =
    useState(false);
  const opened = useRef(false);
  const openingFrame = useRef<number | null>(null);
  const receiptUri = (() => {
    if (!transaction.receiptPath) return null;
    try {
      return getAttachmentFile(transaction.receiptPath).uri;
    } catch {
      return null;
    }
  })();
  const occurredAt = new Date(transaction.occurredAtIso);
  const dateLabel = Number.isFinite(occurredAt.getTime())
    ? occurredAt.toLocaleString(i18n.resolvedLanguage, {
        dateStyle: "medium",
        timeStyle: "short",
      })
    : t("transactions.common.unknownDate");
  const typeLabel =
    transaction.type === 0
      ? t("transactions.common.types.expense")
      : transaction.type === 1
        ? t("transactions.common.types.income")
        : t("transactions.common.types.transfer");
  const amountColor =
    transaction.type === 0
      ? theme.danger
      : transaction.type === 1
        ? theme.success
        : theme.accent;
  const hasCurrencyConversion =
    transaction.exchangeRate !== null &&
    transaction.currencyCode !== transaction.accountCurrencyCode;
  const rateTimestamp = new Date(
    transaction.exchangeRateFetchedAt ?? transaction.exchangeRateDate ?? "",
  );
  const rateDateLabel = Number.isFinite(rateTimestamp.getTime())
    ? rateTimestamp.toLocaleString(i18n.resolvedLanguage, {
        dateStyle: "medium",
        ...(transaction.exchangeRateFetchedAt
          ? { timeStyle: "short" as const }
          : {}),
      })
    : (transaction.exchangeRateDate ?? "");
  const displayedExchangeRate = transaction.exchangeRate?.toFixed(2) ?? "";
  const recurringSnapshot = selectRecurringTransactionSnapshot(
    document,
    transaction.id,
  );

  useEffect(() => {
    return () => {
      if (openingFrame.current !== null)
        cancelAnimationFrame(openingFrame.current);
    };
  }, []);

  function openAfterLayout() {
    if (opened.current || openingFrame.current !== null) return;
    openingFrame.current = requestAnimationFrame(() => {
      openingFrame.current = null;
      opened.current = true;
      setIsOpen(true);
    });
  }

  function close() {
    if (busy) return;
    setIsOpen(false);
    onDismiss();
  }

  function edit() {
    onDismiss();
    router.push({
      pathname: "/transactions/[id]/edit",
      params: { id: transaction.id },
    });
  }

  function copy() {
    onDismiss();
    router.push({
      pathname: "/transactions/create",
      params: { copyId: transaction.id },
    });
  }

  function requestDelete() {
    setError("");
    setDeleteConfirmationVisible(true);
  }

  function cancelDelete() {
    if (busy) return;
    setError("");
    setDeleteConfirmationVisible(false);
  }

  function transactionDeleteError(reason: unknown) {
    if (!(reason instanceof Error))
      return t("transactions.details.deleteError");
    switch (reason.message) {
      case "This transaction no longer exists.":
        return t("transactions.form.validation.missing");
      case "This transaction belongs to another profile.":
        return t("transactions.form.validation.wrongProfile");
      case "This transaction has an invalid amount.":
        return t("transactions.form.validation.invalidAmount");
      case "This account has an invalid balance.":
        return t("transactions.details.invalidAccountBalance");
      default:
        return reason.message;
    }
  }

  async function confirmDelete() {
    if (busy) return;
    setBusy(true);
    setError("");
    try {
      await updateDocument((current) =>
        deleteTransaction(
          current,
          transaction.id,
          activeProfile.id,
          new Date().toISOString(),
        ),
      );
      if (transaction.receiptPath) {
        try {
          deleteAttachment(transaction.receiptPath);
        } catch {}
      }
      setIsOpen(false);
      onDismiss();
    } catch (reason) {
      setError(transactionDeleteError(reason));
    } finally {
      setBusy(false);
    }
  }

  return (
    <BottomSheet
      isOpen={isOpen}
      onOpenChange={(open) => {
        if (!open && opened.current && isOpen && !busy) close();
      }}
    >
      <AppBottomSheetPortal
        isOpen={isOpen}
        unstable_accessibilityContainerViewIsModal
      >
        <BottomSheet.Overlay isCloseOnPress={!busy} />
        <BottomSheet.Content
          containerStyle={initialPositionFix.containerStyle}
          onChange={initialPositionFix.onChange}
          snapPoints={[deleteConfirmationVisible ? "38%" : "80%"]}
          enableDynamicSizing={false}
          enableOverDrag={false}
          enablePanDownToClose={!busy}
          enableHandlePanningGesture={!busy}
          enableContentPanningGesture={!busy}
          topInset={insets.top}
          contentContainerClassName="h-full px-0 pb-0 pt-1"
          contentContainerProps={{ style: { direction: nativeDirection } }}
          backgroundClassName="rounded-t-[28px] bg-surface"
          handleIndicatorClassName="w-10 bg-muted/40"
        >
          <View
            onLayout={openAfterLayout}
            style={[styles.fill, { direction: nativeDirection }]}
          >
            {deleteConfirmationVisible ? (
              <Animated.View
                entering={FadeIn.duration(180).reduceMotion(
                  ReduceMotion.System,
                )}
                exiting={FadeOut.duration(120).reduceMotion(
                  ReduceMotion.System,
                )}
                className="flex-1 justify-center gap-5 px-5"
                style={{ paddingBottom: Math.max(insets.bottom, 16) + 12 }}
              >
                <View className="items-center gap-2">
                  <BottomSheet.Title
                    className="text-center text-danger"
                    style={{ textAlign: "center", writingDirection }}
                  >
                    {t("transactions.details.deleteTitle")}
                  </BottomSheet.Title>
                  <BottomSheet.Description
                    numberOfLines={2}
                    className="px-3 text-center font-sans text-sm leading-5"
                    style={{ textAlign: "center", writingDirection }}
                  >
                    {t("transactions.details.deleteDescription", {
                      name: transaction.merchant,
                    })}
                  </BottomSheet.Description>
                </View>

                {!!error && (
                  <Text
                    accessibilityRole="alert"
                    className="text-center font-sans text-sm text-danger"
                    style={{ textAlign: "center", writingDirection }}
                  >
                    {error}
                  </Text>
                )}

                <View className="gap-3" style={{ flexDirection: row }}>
                  <Button
                    variant="tertiary"
                    className="flex-1"
                    style={{ flexDirection: row }}
                    isDisabled={busy}
                    onPress={cancelDelete}
                  >
                    <Button.Label style={{ writingDirection }}>
                      {t("transactions.details.cancel")}
                    </Button.Label>
                  </Button>
                  <Button
                    variant="danger"
                    className="flex-1"
                    style={{ flexDirection: row }}
                    isDisabled={busy}
                    accessibilityState={{ busy }}
                    onPress={confirmDelete}
                  >
                    <FilledIcon
                      color={dangerForeground}
                      name="delete"
                      size={20}
                    />
                    <Button.Label style={{ writingDirection }}>
                      {busy
                        ? t("transactions.details.deleting")
                        : t("transactions.details.delete")}
                    </Button.Label>
                  </Button>
                </View>
              </Animated.View>
            ) : (
              <>
                <BottomSheetScrollView
                  showsVerticalScrollIndicator={false}
                  contentContainerStyle={[
                    styles.scrollContent,
                    { direction: nativeDirection },
                  ]}
                >
                  <View
                    className="items-center gap-4 border-b border-border pb-5"
                    style={{ flexDirection: row }}
                  >
                    <View
                      className="size-16 items-center justify-center rounded-2xl"
                      style={{
                        backgroundColor: colorWithAlpha(transaction.color, 0.2),
                      }}
                    >
                      <RecordIcon
                        color={transaction.color}
                        name={transaction.icon}
                        pathData={transaction.iconPath}
                        size={32}
                      />
                    </View>
                    <View className="min-w-0 flex-1 gap-1">
                      <BottomSheet.Title
                        numberOfLines={1}
                        style={{ textAlign: start, writingDirection }}
                      >
                        {transaction.merchant}
                      </BottomSheet.Title>
                      <BottomSheet.Description
                        numberOfLines={2}
                        style={{ textAlign: start, writingDirection }}
                      >
                        {t("transactions.details.typeAndDate", {
                          type: typeLabel,
                          date: dateLabel,
                        })}
                      </BottomSheet.Description>
                    </View>
                    <Text
                      numberOfLines={1}
                      className="font-manrope-bold text-lg"
                      style={{
                        color: amountColor,
                        textAlign: end,
                        writingDirection: "ltr",
                      }}
                    >
                      {transaction.type === 1
                        ? "+"
                        : transaction.type === 0
                          ? "-"
                          : ""}
                      {formatCurrency(
                        transaction.absoluteAmount,
                        transaction.currencyCode,
                      )}
                    </Text>
                  </View>

                  <Text
                    className="pt-5 font-manrope-bold text-base text-accent"
                    style={{ textAlign: start, writingDirection }}
                  >
                    {t("transactions.details.heading")}
                  </Text>
                  <DetailRow
                    icon="credit-card"
                    label={
                      transaction.type === 2
                        ? t("transactions.common.fields.transferFrom")
                        : t("transactions.common.fields.account")
                    }
                    value={transaction.accountName}
                  />
                  <RecurringPaymentSnapshot snapshot={recurringSnapshot} />
                  {hasCurrencyConversion ? (
                    <View
                      className="gap-4 border-y border-border py-3"
                      style={{ flexDirection: row }}
                    >
                      <View className="size-10 items-center justify-center">
                        <FilledIcon
                          name="currency-exchange"
                          size={24}
                          tone="accent"
                        />
                      </View>
                      <View className="min-w-0 flex-1 gap-2.5">
                        <View
                          className="flex-wrap items-center justify-between gap-3"
                          style={{
                            flexDirection: row,
                          }}
                        >
                          <Text
                            className="shrink font-sans text-sm text-muted"
                            style={{ textAlign: start, writingDirection }}
                          >
                            {t("transactions.details.conversionTitle")}
                          </Text>
                          <Text
                            className="font-manrope-semibold text-xs text-accent"
                            style={{ textAlign: end, writingDirection }}
                          >
                            {t("transactions.details.conversionPair", {
                              from: transaction.currencyCode,
                              to: transaction.accountCurrencyCode,
                            })}
                          </Text>
                        </View>
                        <View
                          className="items-stretch gap-3"
                          style={{
                            flexDirection: row,
                          }}
                        >
                          <View className="min-w-0 flex-1 gap-0.5">
                            <Text
                              className="font-sans text-xs text-muted"
                              style={{ textAlign: start, writingDirection }}
                            >
                              {t("transactions.details.originalAmount", {
                                type: typeLabel,
                              })}
                            </Text>
                            <Text
                              adjustsFontSizeToFit
                              minimumFontScale={0.72}
                              numberOfLines={1}
                              className="font-manrope-bold text-base text-foreground"
                              style={{
                                textAlign: start,
                                writingDirection: "ltr",
                              }}
                            >
                              {formatCurrency(
                                transaction.absoluteAmount,
                                transaction.currencyCode,
                              )}
                            </Text>
                          </View>
                          <View className="w-10 shrink-0 items-center justify-center border-x border-border">
                            <FilledIcon
                              name="swap-horizontal"
                              size={20}
                              tone="accent"
                            />
                          </View>
                          <View className="min-w-0 flex-1 gap-0.5">
                            <Text
                              className="font-sans text-xs text-muted"
                              style={{ textAlign: start, writingDirection }}
                            >
                              {t("transactions.details.accountAmount", {
                                currency: transaction.accountCurrencyCode,
                              })}
                            </Text>
                            <Text
                              adjustsFontSizeToFit
                              minimumFontScale={0.72}
                              numberOfLines={1}
                              className="font-manrope-bold text-base"
                              style={{
                                color: amountColor,
                                textAlign: start,
                                writingDirection: "ltr",
                              }}
                            >
                              {formatCurrency(
                                transaction.accountAmount,
                                transaction.accountCurrencyCode,
                              )}
                            </Text>
                          </View>
                        </View>
                        <View
                          className="flex-wrap gap-2"
                          style={{
                            flexDirection: row,
                          }}
                        >
                          <View className="max-w-full rounded-full bg-surface-tertiary px-2.5 py-1.5">
                            <Text
                              className="font-manrope-semibold text-xs text-foreground"
                              style={{
                                textAlign: start,
                                writingDirection: "ltr",
                              }}
                            >
                              {t("transactions.details.exchangeRateValue", {
                                from: transaction.currencyCode,
                                rate: displayedExchangeRate,
                                to: transaction.accountCurrencyCode,
                              })}
                            </Text>
                          </View>
                          <View
                            className="max-w-full items-center gap-1.5 rounded-full bg-surface-tertiary px-2.5 py-1.5"
                            style={{
                              flexDirection: row,
                            }}
                          >
                            <FilledIcon name="clock" size={13} tone="muted" />
                            <Text
                              className="min-w-0 shrink font-sans text-xs text-muted"
                              style={{ textAlign: start, writingDirection }}
                            >
                              {t("transactions.details.rateCaptured", {
                                date: rateDateLabel,
                              })}
                            </Text>
                          </View>
                        </View>
                      </View>
                    </View>
                  ) : null}
                  {transaction.destinationAccountName ? (
                    <DetailRow
                      icon="credit-card"
                      label={t("transactions.common.fields.transferTo")}
                      value={transaction.destinationAccountName}
                    />
                  ) : null}
                  {transaction.categoryId ? (
                    <DetailRow
                      icon="chart-donut-variant"
                      label={t("transactions.common.fields.category")}
                      value={transaction.category}
                      leading={
                        <View
                          className="size-9 items-center justify-center rounded-xl"
                          style={{
                            backgroundColor: colorWithAlpha(
                              transaction.color,
                              0.2,
                            ),
                          }}
                        >
                          <RecordIcon
                            color={transaction.color}
                            name={transaction.icon}
                            pathData={transaction.iconPath}
                            size={21}
                          />
                        </View>
                      }
                    />
                  ) : null}
                  {transaction.description ? (
                    <DetailRow
                      icon="code-json"
                      label={t("transactions.common.fields.description")}
                      value={transaction.description}
                    />
                  ) : null}
                  {transaction.budgetName ? (
                    <DetailRow
                      icon="wallet"
                      label={t("transactions.common.fields.budget")}
                      value={transaction.budgetName}
                    />
                  ) : null}
                  {transaction.labelName ? (
                    <DetailRow
                      icon="check"
                      label={t("transactions.common.fields.label")}
                      value={transaction.labelName}
                    />
                  ) : null}
                  {transaction.loanName ? (
                    <DetailRow
                      icon="credit-card"
                      label={t("transactions.common.fields.loan")}
                      value={transaction.loanName}
                    />
                  ) : null}
                  {transaction.placeName ? (
                    <DetailRow
                      icon="home"
                      label={t("transactions.common.fields.place")}
                      value={transaction.placeName}
                    />
                  ) : null}
                  {transaction.personName ? (
                    <DetailRow
                      icon="account"
                      label={t("transactions.common.fields.payee")}
                      value={transaction.personName}
                    />
                  ) : null}

                  {receiptUri ? (
                    <View className="gap-2 pt-3">
                      <Text
                        className="font-manrope-semibold text-sm text-muted"
                        style={{ textAlign: start, writingDirection }}
                      >
                        {t("transactions.details.receipt")}
                      </Text>
                      <Image
                        accessibilityLabel={t(
                          "transactions.details.receiptAccessibility",
                          { name: transaction.merchant },
                        )}
                        resizeMode="cover"
                        source={{ uri: receiptUri }}
                        className="h-52 w-full rounded-2xl"
                      />
                    </View>
                  ) : null}

                  <Text
                    className="pb-2 pt-5 font-sans text-xs text-muted"
                    style={{ textAlign: start, writingDirection }}
                  >
                    {t("transactions.details.created", { date: dateLabel })}
                  </Text>
                </BottomSheetScrollView>

                <View
                  className="border-t border-border px-3 pt-2"
                  style={{
                    flexDirection: row,
                    paddingBottom: Math.max(insets.bottom, 10),
                  }}
                >
                  <Button
                    variant="ghost"
                    className="flex-1"
                    style={{ flexDirection: row }}
                    isDisabled={busy}
                    onPress={requestDelete}
                  >
                    <FilledIcon name="delete" size={22} tone="danger" />
                    <Button.Label
                      className="text-danger"
                      style={{ writingDirection }}
                    >
                      {t("transactions.details.delete")}
                    </Button.Label>
                  </Button>
                  <Button
                    variant="ghost"
                    className="flex-1"
                    style={{ flexDirection: row }}
                    isDisabled={busy}
                    onPress={edit}
                  >
                    <FilledIcon name="pencil" size={22} tone="accent" />
                    <Button.Label
                      className="text-accent"
                      style={{ writingDirection }}
                    >
                      {t("transactions.details.edit")}
                    </Button.Label>
                  </Button>
                  <Button
                    variant="ghost"
                    className="flex-1"
                    style={{ flexDirection: row }}
                    isDisabled={busy}
                    onPress={copy}
                  >
                    <FilledIcon name="copy" size={22} tone="accent" />
                    <Button.Label
                      className="text-accent"
                      style={{ writingDirection }}
                    >
                      {t("transactions.details.copy")}
                    </Button.Label>
                  </Button>
                </View>
              </>
            )}
          </View>
        </BottomSheet.Content>
      </AppBottomSheetPortal>
    </BottomSheet>
  );
}

const styles = StyleSheet.create({
  fill: { flex: 1 },
  scrollContent: {
    paddingHorizontal: 20,
    paddingBottom: 16,
  },
});
