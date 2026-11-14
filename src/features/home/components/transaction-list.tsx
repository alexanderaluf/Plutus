import { memo, useMemo } from "react";
import type {
  createTransactionProjector,
  TransactionIndexEntry,
} from "@/data/selectors/transaction-selectors";
import { I18nManager, Pressable, StyleSheet, View } from "react-native";

import { Text } from "@/shared/ui/app-text";
import { useTranslation } from "react-i18next";

import { useCurrencyFormat } from "@/shared/lib/use-currency-format";
import { colorWithAlpha, useAppThemeColors } from "@/shared/theme/app-theme";
import {
  FilledIcon,
  type FilledIconName,
} from "@/shared/ui/filled-icon";
import { RecordIcon } from "@/shared/ui/record-icon";

import type { Transaction } from "../types";

type TransactionRowProps = {
  transaction: Transaction;
  showBorder: boolean;
  onPress: (transaction: Transaction) => void;
};

export const TransactionRow = memo(function TransactionRow({
  transaction,
  showBorder,
  onPress,
}: TransactionRowProps) {
  const { formatCurrency, formatSignedCurrency } = useCurrencyFormat();
  const { t } = useTranslation();
  const theme = useAppThemeColors();

  const isTransfer = transaction.type === 2;
  const isIncome = transaction.type === 1;

  const directionIcon: FilledIconName = isTransfer
    ? "swap-horizontal"
    : isIncome
      ? "arrow-bottom-left"
      : "arrow-top-right";

  const iconTone: "accent" | "success" | "muted" = isTransfer
    ? "accent"
    : isIncome
      ? "success"
      : "muted";

  const amountColorClass = isTransfer
    ? "text-accent"
    : isIncome
      ? "text-success"
      : "text-foreground";

  const formattedAmount = isTransfer
    ? formatCurrency(transaction.absoluteAmount, transaction.currencyCode)
    : formatSignedCurrency(transaction.amount, transaction.currencyCode);

  const hasCurrencyConversion =
    Boolean(transaction.accountCurrencyCode) &&
    transaction.currencyCode !== transaction.accountCurrencyCode &&
    Number.isFinite(transaction.accountAmount);

  const subtitle =
    isTransfer && transaction.accountName && transaction.destinationAccountName
      ? `${transaction.accountName} ${I18nManager.isRTL ? "←" : "→"} ${transaction.destinationAccountName} · ${transaction.occurredAt}`
      : `${transaction.category} · ${transaction.occurredAt}`;

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={t("home.transactionAccessibility", {
        merchant: transaction.merchant,
      })}
      onPress={() => onPress(transaction)}
      className="flex-row items-center py-3.5"
      style={({ pressed }) => ({
        opacity: pressed ? 0.68 : 1,
        borderBottomWidth: showBorder ? StyleSheet.hairlineWidth : 0,
        borderBottomColor: theme.border,
      })}
    >
      <View
        className="size-11 shrink-0 items-center justify-center rounded-2xl"
        style={{
          backgroundColor: colorWithAlpha(
            transaction.color,
            theme.isDark ? 0.22 : 0.14,
          ),
          borderWidth: 1,
          borderColor: colorWithAlpha(transaction.color, 0.22),
          borderCurve: "continuous",
        }}
      >
        <RecordIcon
          color={transaction.color}
          name={transaction.icon}
          pathData={transaction.iconPath}
          size={20}
        />
      </View>

      <View className="ms-3 min-w-0 flex-1 gap-1">
        <View className="flex-row items-center gap-1.5">
          <Text
            numberOfLines={1}
            className="min-w-0 flex-1 font-manrope-semibold text-[15px] leading-[20px] text-foreground"
          >
            {transaction.merchant}
          </Text>
          {transaction.receiptPath ? (
            <FilledIcon name="receipt" size={13} tone="muted" />
          ) : null}
        </View>
        <Text
          numberOfLines={1}
          className="font-sans text-[12px] leading-[16px] text-muted"
        >
          {subtitle}
        </Text>
      </View>

      <View className="ms-3 max-w-[38%] shrink-0 items-end gap-1">
        <Text
          adjustsFontSizeToFit
          minimumFontScale={0.78}
          numberOfLines={1}
          className={`text-right font-manrope-bold text-[15px] leading-[20px] ${amountColorClass}`}
          style={{ fontVariant: ["tabular-nums"] }}
        >
          {formattedAmount}
        </Text>
        <View className="flex-row items-center justify-end gap-1">
          {hasCurrencyConversion ? (
            <Text
              numberOfLines={1}
              className="text-right font-sans text-[11px] leading-[14px] text-muted"
              style={{ fontVariant: ["tabular-nums"] }}
            >
              ≈{" "}
              {formatCurrency(
                isTransfer
                  ? Math.abs(transaction.accountAmount)
                  : transaction.accountAmount,
                transaction.accountCurrencyCode,
              )}
            </Text>
          ) : !isTransfer && transaction.accountName ? (
            <Text
              numberOfLines={1}
              className="text-right font-sans text-[11px] leading-[14px] text-muted"
            >
              {transaction.accountName}
            </Text>
          ) : null}
          <FilledIcon name={directionIcon} size={13} tone={iconTone} />
        </View>
      </View>
    </Pressable>
  );
});

type IndexedTransactionRowProps = {
  entry: TransactionIndexEntry;
  project: ReturnType<typeof createTransactionProjector>;
  showBorder: boolean;
  onPress: (transaction: Transaction) => void;
};

// The view model lives only for the lifetime of a virtualized row.
export const IndexedTransactionRow = memo(function IndexedTransactionRow({
  entry,
  project,
  ...props
}: IndexedTransactionRowProps) {
  const transaction = useMemo(() => project(entry), [entry, project]);
  return <TransactionRow transaction={transaction} {...props} />;
});
