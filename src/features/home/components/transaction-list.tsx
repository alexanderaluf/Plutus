import { memo, useMemo } from "react";
import type {
  createTransactionProjector,
  TransactionIndexEntry,
} from "@/data/selectors/transaction-selectors";
import { Pressable, View } from "react-native";

import { Text } from "@/shared/ui/app-text";
import { useTranslation } from "react-i18next";

import { useCurrencyFormat } from "@/shared/lib/use-currency-format";
import { colorWithAlpha } from "@/shared/theme/app-theme";
import { FilledIcon, type FilledIconName } from "@/shared/ui/filled-icon";
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
  const { formatSignedCurrency } = useCurrencyFormat();
  const { t } = useTranslation();
  const directionIcon: FilledIconName =
    transaction.amount >= 0 ? "arrow-bottom-left" : "arrow-top-right";
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={t("home.transactionAccessibility", {
        merchant: transaction.merchant,
      })}
      onPress={() => onPress(transaction)}
      className={`flex-row items-center py-3 ${
        showBorder ? "border-b border-border" : ""
      }`}
      style={({ pressed }) => ({ opacity: pressed ? 0.68 : 1 })}
    >
      <View
        className="size-11 items-center justify-center rounded-xl"
        style={{
          backgroundColor: colorWithAlpha(transaction.color, 0.18),
        }}
      >
        <RecordIcon
          color={transaction.color}
          name={transaction.icon}
          pathData={transaction.iconPath}
          size={21}
        />
      </View>

      <View className="ms-3 flex-1 gap-0.5">
        <Text className="font-manrope-semibold text-[14px] text-foreground">
          {transaction.merchant}
        </Text>
        <Text className="font-sans text-xs text-muted">
          {transaction.category} · {transaction.occurredAt}
        </Text>
      </View>

      <View className="ms-2 items-end gap-1">
        <Text
          className={`font-manrope-bold text-[14px] ${
            transaction.amount >= 0 ? "text-accent" : "text-foreground"
          }`}
        >
          {formatSignedCurrency(transaction.amount, transaction.currencyCode)}
        </Text>
        <FilledIcon name={directionIcon} size={15} tone="muted" />
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
