import {
  BottomSheetScrollView,
  BottomSheet,
} from "@/shared/ui/app-bottom-sheet";
import { useRouter } from "expo-router";
import { Button, useThemeColor } from "heroui-native";

import { Fragment, useEffect, useRef, useState, type ReactNode } from "react";
import {
  Platform,
  I18nManager,
  Image,
  Pressable,
  StyleSheet,
  View,
} from "react-native";
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
import { selectAccounts } from "@/data/selectors/document-selectors";
import { selectRecurringTransactionSnapshot } from "@/data/selectors/recurring-selectors";
import { selectTransactionEntry } from "@/data/selectors/transaction-selectors";
import { useProfiles } from "@/features/profile/profile-provider";
import type { Transaction } from "@/features/home/types";
import { colorForeground } from "@/shared/icons/colors";
import { useCurrencyFormat } from "@/shared/lib/use-currency-format";
import { useAppDate } from "@/shared/lib/use-app-date";
import { colorWithAlpha, useAppThemeColors } from "@/shared/theme/app-theme";
import { Text } from "@/shared/ui/app-text";
import { AppBottomSheetPortal } from "@/shared/ui/app-bottom-sheet-portal";
import { FilledIcon, type FilledIconName } from "@/shared/ui/filled-icon";
import { RecordIcon } from "@/shared/ui/record-icon";
import { useBottomSheetInitialPositionFix } from "@/shared/ui/use-bottom-sheet-initial-position-fix";
import {
  RecurringPaymentSnapshot,
  type SheetDirection,
} from "./recurring-payment-snapshot";

const TABULAR = { fontVariant: ["tabular-nums" as const] };
const CONTINUOUS = { borderCurve: "continuous" as const };
/** Edits within this window of creation are the same save, not an edit. */
const EDIT_THRESHOLD_MS = 60_000;

/**
 * The sheet renders in a portal that does not inherit the app's direction, so
 * rows and text mirror explicitly from the active language — exactly once,
 * whatever the native layout direction is.
 */
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

function textTime(value: unknown) {
  const time = typeof value === "string" ? new Date(value).getTime() : NaN;
  return Number.isFinite(time) ? time : null;
}

/** A titled group: a quiet label above a rounded card. */
function Section({
  title,
  children,
}: {
  title: string;
  children: ReactNode;
}) {
  const { start, writingDirection } = useSheetDirection();
  return (
    <View className="gap-2">
      <Text
        accessibilityRole="header"
        className="px-1 font-manrope-semibold text-[13px] leading-[18px] text-muted"
        style={{ textAlign: start, writingDirection }}
      >
        {title}
      </Text>
      <View
        className="gap-3 rounded-[22px] border border-border/70 bg-surface-secondary/50 p-4"
        style={CONTINUOUS}
      >
        {children}
      </View>
    </View>
  );
}

/** Tinted icon square used by every row of the sheet. */
function RowIcon({
  icon,
  color,
  record,
}: {
  icon?: FilledIconName;
  color: string;
  record?: { name: string; pathData: string | null; filled?: boolean };
}) {
  return (
    <View
      className="size-10 shrink-0 items-center justify-center rounded-xl"
      style={{
        ...CONTINUOUS,
        backgroundColor: record?.filled ? color : colorWithAlpha(color, 0.16),
      }}
    >
      {record ? (
        <RecordIcon
          color={record.filled ? colorForeground(color) : color}
          name={record.name}
          pathData={record.pathData}
          size={20}
        />
      ) : (
        <FilledIcon name={icon ?? "receipt"} size={20} color={color} />
      )}
    </View>
  );
}

/** Label above value; a row that leads somewhere ends with a chevron. */
function InfoRow({
  leading,
  label,
  value,
  onPress,
  openLabel,
}: {
  leading: ReactNode;
  label: string;
  value: string;
  onPress?: () => void;
  openLabel?: string;
}) {
  const { row, start, writingDirection } = useSheetDirection();
  const content = (
    <>
      {leading}
      <View className="min-w-0 flex-1 gap-0.5">
        <Text
          numberOfLines={1}
          className="font-sans text-[12px] leading-[16px] text-muted"
          style={{ textAlign: start, writingDirection }}
        >
          {label}
        </Text>
        <Text
          numberOfLines={2}
          className="font-manrope-semibold text-[15px] leading-[20px] text-foreground"
          style={{ textAlign: start, writingDirection }}
        >
          {value}
        </Text>
      </View>
      {onPress ? (
        <FilledIcon name="chevron-right" size={18} tone="muted" />
      ) : null}
    </>
  );
  return onPress ? (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={openLabel}
      onPress={onPress}
      className="items-center gap-3"
      style={({ pressed }) => ({
        flexDirection: row,
        opacity: pressed ? 0.6 : 1,
      })}
    >
      {content}
    </Pressable>
  ) : (
    <View className="items-center gap-3" style={{ flexDirection: row }}>
      {content}
    </View>
  );
}

/** Hairline between rows, inset past the icon on the reading-start side. */
function RowDivider() {
  const theme = useAppThemeColors();
  const { start } = useSheetDirection();
  return (
    <View
      style={{
        height: StyleSheet.hairlineWidth,
        backgroundColor: theme.border,
        [start === "left" ? "marginLeft" : "marginRight"]: 52,
      }}
    />
  );
}

function Rows({ children }: { children: ReactNode[] }) {
  const rows = children.filter(Boolean);
  return (
    <>
      {rows.map((child, index) => (
        <Fragment key={index}>
          {index > 0 ? <RowDivider /> : null}
          {child}
        </Fragment>
      ))}
    </>
  );
}

export function TransactionDetailSheet({
  transaction,
  onDismiss,
}: {
  transaction: Transaction;
  onDismiss: () => void;
}) {
  const { amountsHidden, formatCurrency } = useCurrencyFormat();
  const { formatDate, formatDateTime } = useAppDate();
  const { t, i18n } = useTranslation();
  const router = useRouter();
  const direction = useSheetDirection();
  const { nativeDirection, writingDirection, row, start } = direction;
  const insets = useSafeAreaInsets();
  const theme = useAppThemeColors();
  const dangerForeground = useThemeColor("danger-foreground");
  const { document, updateDocument } = useLocalData();
  const { activeProfile } = useProfiles();
  const [isOpen, setIsOpen] = useState(Platform.OS === "ios");
  const { bindSheet, ...initialPositionFix } =
    useBottomSheetInitialPositionFix(isOpen);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [deleteConfirmationVisible, setDeleteConfirmationVisible] =
    useState(false);
  const opened = useRef(Platform.OS === "ios");
  const openingFrame = useRef<number | null>(null);
  const receiptUri = (() => {
    if (!transaction.receiptPath) return null;
    try {
      return getAttachmentFile(transaction.receiptPath).uri;
    } catch {
      return null;
    }
  })();

  const isExpense = transaction.type === 0;
  const isIncome = transaction.type === 1;
  const isTransfer = transaction.type === 2;
  const typeLabel = isExpense
    ? t("transactions.common.types.expense")
    : isIncome
      ? t("transactions.common.types.income")
      : t("transactions.common.types.transfer");
  // Same tones as the transaction lists: only income and transfers are tinted.
  const typeColor = isExpense
    ? theme.danger
    : isIncome
      ? theme.success
      : theme.accent;
  const amountColor = isExpense
    ? theme.foreground
    : isIncome
      ? theme.success
      : theme.accent;
  const sign = amountsHidden ? "" : isIncome ? "+" : isExpense ? "−" : "";

  const occurredAt = new Date(transaction.occurredAtIso);
  const occurredTime = Number.isFinite(occurredAt.getTime())
    ? occurredAt.getTime()
    : null;
  const dateLabel =
    occurredTime === null
      ? t("transactions.common.unknownDate")
      : `${occurredAt.toLocaleDateString(i18n.resolvedLanguage, {
          weekday: "long",
        })}, ${formatDateTime(occurredAt)}`;

  const hasCurrencyConversion =
    transaction.exchangeRate !== null &&
    transaction.currencyCode !== transaction.accountCurrencyCode;
  const rateTimestamp = new Date(
    transaction.exchangeRateFetchedAt ?? transaction.exchangeRateDate ?? "",
  );
  const rateDateLabel = Number.isFinite(rateTimestamp.getTime())
    ? transaction.exchangeRateFetchedAt
      ? formatDateTime(rateTimestamp)
      : formatDate(rateTimestamp)
    : (transaction.exchangeRateDate ?? "");
  const displayedExchangeRate = transaction.exchangeRate?.toFixed(2) ?? "";

  const recurringSnapshot = selectRecurringTransactionSnapshot(
    document,
    transaction.id,
  );
  // The stored record supplies its own history and schedule link.
  const record = selectTransactionEntry(document, transaction.id)?.record;
  const recurringId =
    typeof record?.recurring === "string" ? record.recurring : null;
  const scheduleRecord = recurringId
    ? (document.recurrings ?? []).find(
        (item) => String(item.uuid ?? item.id ?? "") === recurringId,
      )
    : undefined;
  const schedule = scheduleRecord
    ? {
        name: typeof scheduleRecord.name === "string" ? scheduleRecord.name : "",
        period:
          typeof scheduleRecord.period === "string"
            ? scheduleRecord.period
            : "",
      }
    : null;
  const createdTime = textTime(record?.createdAt);
  const updatedTime = textTime(record?.updatedAt);
  const history = [
    occurredTime !== null
      ? { key: "happened", label: t("transactions.details.happened"), time: occurredTime }
      : null,
    createdTime !== null
      ? { key: "recorded", label: t("transactions.details.recorded"), time: createdTime }
      : null,
    updatedTime !== null &&
    (createdTime === null || updatedTime - createdTime > EDIT_THRESHOLD_MS)
      ? { key: "edited", label: t("transactions.details.edited"), time: updatedTime }
      : null,
  ]
    .filter((item) => item !== null)
    .sort((a, b) => a.time - b.time);

  const accounts = selectAccounts(document);
  const accountFor = (id: string) =>
    id ? accounts.find((account) => account.id === id) : undefined;
  const source = accountFor(transaction.accountId);
  const destination = accountFor(transaction.destinationAccountId);

  const extras = (
    [
      ["wallet", t("transactions.common.fields.budget"), transaction.budgetName],
      ["tag", t("transactions.common.fields.label"), transaction.labelName],
      ["map-marker", t("transactions.common.fields.place"), transaction.placeName],
      ["account", t("transactions.common.fields.payee"), transaction.personName],
      ["credit-card", t("transactions.common.fields.loan"), transaction.loanName],
    ] as const
  ).filter(([, , value]) => !!value);

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

  /** Leaves the sheet for another screen. */
  function open(route: Parameters<typeof router.push>[0]) {
    if (busy) return;
    onDismiss();
    router.push(route);
  }

  function edit() {
    open({
      pathname: "/transactions/[id]/edit",
      params: { id: transaction.id },
    });
  }

  function copy() {
    open({
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

  const accountRow = (
    key: string,
    label: string,
    name: string,
    account: ReturnType<typeof accountFor>,
  ) => (
    <InfoRow
      key={key}
      leading={
        account ? (
          <RowIcon
            color={account.color}
            record={{
              name: account.icon,
              pathData: account.iconPath,
              filled: true,
            }}
          />
        ) : (
          <RowIcon icon="wallet" color={theme.accent} />
        )
      }
      label={label}
      value={name}
      openLabel={t("transactions.details.openAccessibility", { name })}
      onPress={
        account
          ? () =>
              open({
                pathname: "/accounts/[id]",
                params: { id: account.id },
              })
          : undefined
      }
    />
  );

  return (
    <BottomSheet
      isOpen={isOpen}
      onOpenChange={(isNowOpen) => {
        if (!isNowOpen && opened.current && isOpen && !busy) close();
      }}
    >
      <AppBottomSheetPortal
        isOpen={isOpen}
        unstable_accessibilityContainerViewIsModal
      >
        <BottomSheet.Overlay isCloseOnPress={!busy} />
        <BottomSheet.Content
          ref={bindSheet}
          containerStyle={initialPositionFix.containerStyle}
          onChange={initialPositionFix.onChange}
          snapPoints={[deleteConfirmationVisible ? "38%" : "85%"]}
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
                  {/* Hero: what it was, how much, and when. */}
                  <View className="items-center px-2 pb-1 pt-2">
                    <View
                      className="size-16 items-center justify-center rounded-[20px]"
                      style={{
                        ...CONTINUOUS,
                        backgroundColor: colorWithAlpha(
                          isTransfer && !transaction.categoryId
                            ? theme.accent
                            : transaction.color,
                          theme.isDark ? 0.22 : 0.14,
                        ),
                      }}
                    >
                      {isTransfer && !transaction.categoryId ? (
                        <FilledIcon
                          name="swap-horizontal"
                          size={30}
                          tone="accent"
                        />
                      ) : (
                        <RecordIcon
                          color={transaction.color}
                          name={transaction.icon}
                          pathData={transaction.iconPath}
                          size={30}
                        />
                      )}
                    </View>
                    {/* Plain Text with explicit metrics: the sheet Title adds
                        its own font size and line height, so its measured box
                        could be shorter than the two lines it draws and the
                        name would overlap the amount below. */}
                    <Text
                      accessibilityRole="header"
                      numberOfLines={2}
                      className="font-manrope-bold text-foreground"
                      style={[
                        styles.heroName,
                        { textAlign: "center", writingDirection },
                      ]}
                    >
                      {transaction.merchant}
                    </Text>
                    <Text
                      adjustsFontSizeToFit
                      minimumFontScale={0.6}
                      numberOfLines={1}
                      selectable={!amountsHidden}
                      className="font-manrope-bold"
                      style={[
                        styles.heroAmount,
                        TABULAR,
                        {
                          color: amountColor,
                          textAlign: "center",
                          writingDirection: "ltr",
                        },
                      ]}
                    >
                      {sign}
                      {formatCurrency(
                        transaction.absoluteAmount,
                        transaction.currencyCode,
                      )}
                    </Text>
                    <View
                      className="mt-3 items-center gap-2"
                      style={{ flexDirection: row }}
                    >
                      <View
                        className="rounded-full px-2.5 py-1"
                        style={{ backgroundColor: colorWithAlpha(typeColor, 0.14) }}
                      >
                        <Text
                          className="font-manrope-bold text-[12px] leading-[16px]"
                          style={{
                            color: typeColor,
                            textAlign: "center",
                            writingDirection,
                          }}
                        >
                          {typeLabel}
                        </Text>
                      </View>
                      {transaction.receiptPath ? (
                        <View className="rounded-full bg-surface-secondary px-2 py-1">
                          <FilledIcon name="receipt" size={14} tone="muted" />
                        </View>
                      ) : null}
                    </View>
                    <Text
                      className="mt-2 font-sans text-[14px] leading-[20px] text-muted"
                      style={{ textAlign: "center", writingDirection }}
                    >
                      {dateLabel}
                    </Text>
                  </View>

                  {/* Where the money moved. */}
                  <Section
                    title={
                      isTransfer
                        ? t("transactions.details.transferRoute")
                        : isIncome
                          ? t("transactions.details.receivedInto")
                          : t("transactions.details.paidFrom")
                    }
                  >
                    {isTransfer ? (
                      <Rows>
                        {[
                          accountRow(
                            "from",
                            t("transactions.details.from"),
                            transaction.accountName,
                            source,
                          ),
                          transaction.destinationAccountName
                            ? accountRow(
                                "to",
                                t("transactions.details.to"),
                                transaction.destinationAccountName,
                                destination,
                              )
                            : null,
                        ]}
                      </Rows>
                    ) : (
                      accountRow(
                        "account",
                        t("transactions.common.fields.account"),
                        transaction.accountName,
                        source,
                      )
                    )}
                    {hasCurrencyConversion ? (
                      <View className="gap-3 pt-1">
                        <RowDivider />
                        <View
                          className="items-center gap-2"
                          style={{ flexDirection: row }}
                        >
                          <FilledIcon
                            name="currency-exchange"
                            size={16}
                            tone="accent"
                          />
                          <Text
                            className="min-w-0 flex-1 font-manrope-semibold text-[13px] leading-[18px] text-foreground"
                            style={{ textAlign: start, writingDirection }}
                          >
                            {t("transactions.details.conversionTitle")}
                          </Text>
                        </View>
                        <View className="gap-2" style={{ flexDirection: row }}>
                          {[
                            {
                              key: "original",
                              label: t("transactions.details.originalAmount", {
                                type: typeLabel,
                              }),
                              value: formatCurrency(
                                transaction.absoluteAmount,
                                transaction.currencyCode,
                              ),
                            },
                            {
                              key: "account",
                              label: t("transactions.details.accountAmount", {
                                currency: transaction.accountCurrencyCode,
                              }),
                              value: formatCurrency(
                                transaction.accountAmount,
                                transaction.accountCurrencyCode,
                              ),
                            },
                          ].map((tile) => (
                            <View
                              key={tile.key}
                              className="min-w-0 flex-1 gap-1 rounded-2xl bg-surface px-3 py-2.5"
                              style={CONTINUOUS}
                            >
                              <Text
                                numberOfLines={1}
                                className="font-sans text-[11px] leading-[15px] text-muted"
                                style={{ textAlign: start, writingDirection }}
                              >
                                {tile.label}
                              </Text>
                              <Text
                                adjustsFontSizeToFit
                                minimumFontScale={0.72}
                                numberOfLines={1}
                                className="font-manrope-bold text-[16px] leading-[21px] text-foreground"
                                style={{
                                  ...TABULAR,
                                  textAlign: start,
                                  writingDirection: "ltr",
                                }}
                              >
                                {tile.value}
                              </Text>
                            </View>
                          ))}
                        </View>
                        <View
                          className="flex-wrap items-center gap-x-2 gap-y-1"
                          style={{ flexDirection: row }}
                        >
                          <Text
                            className="font-manrope-semibold text-[12px] leading-[16px] text-foreground"
                            style={{
                              ...TABULAR,
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
                          <Text
                            className="font-sans text-[12px] leading-[16px] text-muted"
                            style={{ textAlign: start, writingDirection }}
                          >
                            {t("transactions.details.rateCaptured", {
                              date: rateDateLabel,
                            })}
                          </Text>
                        </View>
                      </View>
                    ) : null}
                  </Section>

                  {/* What it belongs to. */}
                  {transaction.categoryId || extras.length > 0 ? (
                    <Section title={t("transactions.details.detailsTitle")}>
                      <Rows>
                        {[
                          transaction.categoryId ? (
                            <InfoRow
                              key="category"
                              leading={
                                <RowIcon
                                  color={transaction.color}
                                  record={{
                                    name: transaction.icon,
                                    pathData: transaction.iconPath,
                                  }}
                                />
                              }
                              label={t("transactions.common.fields.category")}
                              value={transaction.category}
                              openLabel={t(
                                "transactions.details.openAccessibility",
                                { name: transaction.category },
                              )}
                              onPress={() =>
                                open({
                                  pathname: "/categories/[id]",
                                  params: { id: transaction.categoryId },
                                })
                              }
                            />
                          ) : null,
                          ...extras.map(([icon, label, value]) => (
                            <InfoRow
                              key={label}
                              leading={
                                <RowIcon icon={icon} color={theme.accent} />
                              }
                              label={label}
                              value={value}
                            />
                          )),
                        ]}
                      </Rows>
                    </Section>
                  ) : null}

                  {transaction.description ? (
                    <Section title={t("transactions.details.notes")}>
                      <Text
                        selectable
                        className="font-sans text-[15px] leading-[22px] text-foreground"
                        style={{ textAlign: start, writingDirection }}
                      >
                        {transaction.description}
                      </Text>
                    </Section>
                  ) : null}

                  {receiptUri ? (
                    <Section title={t("transactions.details.receipt")}>
                      <Image
                        accessibilityLabel={t(
                          "transactions.details.receiptAccessibility",
                          { name: transaction.merchant },
                        )}
                        resizeMode="cover"
                        source={{ uri: receiptUri }}
                        className="-m-1 h-56 rounded-2xl"
                      />
                    </Section>
                  ) : null}

                  {recurringSnapshot ? (
                    <Section title={t("recurring.snapshot.heading")}>
                      <RecurringPaymentSnapshot
                        snapshot={recurringSnapshot}
                        direction={direction as SheetDirection}
                        schedule={schedule}
                        onOpenSchedule={
                          scheduleRecord && recurringId
                            ? () =>
                                open({
                                  pathname: "/recurring/[id]",
                                  params: { id: recurringId },
                                })
                            : undefined
                        }
                      />
                    </Section>
                  ) : null}

                  {/* Oldest first: when it happened, was added, was edited. */}
                  {history.length > 0 ? (
                    <Section title={t("transactions.details.history")}>
                      {history.map((item, index) => (
                        <View
                          key={item.key}
                          className="gap-3"
                          style={{ flexDirection: row }}
                        >
                          <View className="w-3 items-center">
                            <View
                              className="mt-1.5 size-2.5 rounded-full"
                              style={{
                                backgroundColor:
                                  item.key === "happened"
                                    ? theme.accent
                                    : theme.muted,
                              }}
                            />
                            {index < history.length - 1 ? (
                              <View
                                className="mt-1 w-px flex-1"
                                style={{
                                  backgroundColor: theme.border,
                                  marginBottom: -12,
                                }}
                              />
                            ) : null}
                          </View>
                          <View className="min-w-0 flex-1 gap-0.5">
                            <Text
                              className="font-sans text-[12px] leading-[16px] text-muted"
                              style={{ textAlign: start, writingDirection }}
                            >
                              {item.label}
                            </Text>
                            <Text
                              className="font-manrope-semibold text-[14px] leading-[20px] text-foreground"
                              style={{ textAlign: start, writingDirection }}
                            >
                              {formatDateTime(new Date(item.time))}
                            </Text>
                          </View>
                        </View>
                      ))}
                    </Section>
                  ) : null}
                </BottomSheetScrollView>

                {/* Edit is the likely next step, so it leads. */}
                <View
                  className="gap-2 border-t border-border px-4 pt-3"
                  style={{
                    flexDirection: row,
                    paddingBottom: Math.max(insets.bottom, 12),
                  }}
                >
                  <Button
                    variant="danger-soft"
                    className="flex-1"
                    style={{ flexDirection: row }}
                    isDisabled={busy}
                    onPress={requestDelete}
                  >
                    <FilledIcon name="delete" size={20} tone="danger" />
                    <Button.Label style={{ writingDirection }}>
                      {t("transactions.details.delete")}
                    </Button.Label>
                  </Button>
                  <Button
                    variant="secondary"
                    className="flex-1"
                    style={{ flexDirection: row }}
                    isDisabled={busy}
                    onPress={copy}
                  >
                    <FilledIcon name="copy" size={20} tone="accent" />
                    <Button.Label style={{ writingDirection }}>
                      {t("transactions.details.copy")}
                    </Button.Label>
                  </Button>
                  <Button
                    variant="primary"
                    className="flex-[1.3]"
                    style={{ flexDirection: row }}
                    isDisabled={busy}
                    onPress={edit}
                  >
                    <FilledIcon
                      name="pencil"
                      size={20}
                      tone="accent-foreground"
                    />
                    <Button.Label style={{ writingDirection }}>
                      {t("transactions.details.edit")}
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
  heroName: {
    alignSelf: "stretch",
    marginTop: 14,
    fontSize: 20,
    lineHeight: 28,
  },
  // A roomy line box: tall digits never reach the name above.
  heroAmount: {
    alignSelf: "stretch",
    marginTop: 10,
    fontSize: 36,
    lineHeight: 48,
    letterSpacing: -0.6,
  },
  scrollContent: {
    paddingHorizontal: 16,
    paddingBottom: 20,
    gap: 18,
  },
});
