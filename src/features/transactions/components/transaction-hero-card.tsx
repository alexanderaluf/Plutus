import { LinearGradient } from "expo-linear-gradient";
import { useRef, type ComponentRef } from "react";
import { useTranslation } from "react-i18next";
import {
  Keyboard,
  Pressable,
  StyleSheet,
  TextInput,
  View,
} from "react-native";

import type { TransactionType } from "@/data/model/transaction-record";
import type { Category } from "@/data/selectors/category-selectors";
import { useAppLocalization } from "@/localization/localization-provider";
import { useCurrencyFormat } from "@/shared/lib/use-currency-format";
import { colorWithAlpha, useAppThemeColors } from "@/shared/theme/app-theme";
import { Text } from "@/shared/ui/app-text";
import { FilledIcon } from "@/shared/ui/filled-icon";
import { RecordIcon } from "@/shared/ui/record-icon";

import {
  getTransactionTypeTone,
  getTransactionTypeVisual,
  parseTransactionAmount,
} from "../transaction-form-helpers";

type TransactionHeroCardProps = {
  type: TransactionType;
  amount: string;
  name: string;
  namePlaceholder: string;
  transactionCurrencyCode: string;
  accountCurrencyCode: string;
  canChangeCurrency: boolean;
  showConversion: boolean;
  selectedCategory?: Category | null;
  exchangeRate: number | null;
  exchangeRateDate: string | null;
  convertedAccountAmount: number | null;
  currencyRateLoading: boolean;
  currencyRateError: string;
  currencyRateNotice: string;
  disabled?: boolean;
  onChangeAmount: (value: string) => void;
  onChangeName: (value: string) => void;
  onOpenCurrencyPicker: () => void;
};

/**
 * Primary visual centerpiece uniting Amount, Currency, FX preview, and
 * Transaction Name inside a single mode-tinted elevated card.
 */
export function TransactionHeroCard({
  type,
  amount,
  name,
  namePlaceholder,
  transactionCurrencyCode,
  accountCurrencyCode,
  canChangeCurrency,
  showConversion,
  selectedCategory,
  exchangeRate,
  exchangeRateDate,
  convertedAccountAmount,
  currencyRateLoading,
  currencyRateError,
  currencyRateNotice,
  disabled = false,
  onChangeAmount,
  onChangeName,
  onOpenCurrencyPicker,
}: TransactionHeroCardProps) {
  const { t } = useTranslation();
  const { direction } = useAppLocalization();
  const { formatCurrency } = useCurrencyFormat();
  const theme = useAppThemeColors();
  const amountInputRef = useRef<ComponentRef<typeof TextInput>>(null);
  const nameInputRef = useRef<ComponentRef<typeof TextInput>>(null);

  const typeTone = getTransactionTypeTone(type, theme);
  const { symbol } = getTransactionTypeVisual(type);
  const parsedAmount = parseTransactionAmount(amount);
  const hasPositiveAmount =
    Number.isFinite(parsedAmount) && parsedAmount > 0;
  const digitCount = amount.trim().length;
  const amountFontSize = digitCount > 13 ? 27 : digitCount > 9 ? 34 : 42;
  const amountLineHeight = amountFontSize + 8;

  return (
    <View
      style={[
        styles.card,
        {
          backgroundColor: theme.surface,
          borderColor: hasPositiveAmount
            ? colorWithAlpha(typeTone, theme.isDark ? 0.36 : 0.24)
            : theme.border,
          direction,
        },
      ]}
    >
      <LinearGradient
        colors={[
          colorWithAlpha(typeTone, theme.isDark ? 0.14 : 0.09),
          colorWithAlpha(typeTone, theme.isDark ? 0.04 : 0.025),
          colorWithAlpha(typeTone, 0),
        ]}
        end={{ x: 0.9, y: 1 }}
        locations={[0, 0.55, 1]}
        pointerEvents="none"
        start={{ x: 0, y: 0 }}
        style={StyleSheet.absoluteFill}
      />

      {/* Hero Amount Row */}
      <Pressable
        accessible={false}
        disabled={disabled}
        onPress={() => amountInputRef.current?.focus()}
        style={styles.amountZone}
      >
        <View
          style={[
            styles.signBadge,
            {
              backgroundColor: colorWithAlpha(
                typeTone,
                theme.isDark ? 0.22 : 0.12,
              ),
            },
          ]}
        >
          {type === 2 ? (
            <FilledIcon color={typeTone} name="swap-horizontal" size={22} />
          ) : (
            <Text style={[styles.signSymbol, { color: typeTone }]}>
              {symbol}
            </Text>
          )}
        </View>

        <TextInput
          ref={amountInputRef}
          accessibilityLabel={t("transactions.form.amount")}
          allowFontScaling
          editable={!disabled}
          keyboardType="decimal-pad"
          maxLength={30}
          placeholder="0.00"
          placeholderTextColor={colorWithAlpha(theme.foreground, 0.22)}
          returnKeyType="done"
          selectionColor={typeTone}
          value={amount}
          onChangeText={onChangeAmount}
          style={[
            styles.amountInput,
            {
              color: theme.foreground,
              fontSize: amountFontSize,
              lineHeight: amountLineHeight,
              textAlign: direction === "rtl" ? "right" : "left",
              writingDirection: direction,
            },
          ]}
        />

        <Pressable
          accessibilityLabel={t("transactions.form.currencyAccessibility", {
            currency: transactionCurrencyCode,
          })}
          accessibilityRole="button"
          accessibilityState={{ disabled: disabled || !canChangeCurrency }}
          disabled={disabled || !canChangeCurrency}
          hitSlop={6}
          onPress={() => {
            Keyboard.dismiss();
            onOpenCurrencyPicker();
          }}
          style={({ pressed }) => [
            styles.currencyPill,
            canChangeCurrency
              ? {
                  backgroundColor: colorWithAlpha(
                    theme.accent,
                    theme.isDark ? 0.18 : 0.1,
                  ),
                  borderColor: colorWithAlpha(
                    theme.accent,
                    theme.isDark ? 0.36 : 0.24,
                  ),
                  opacity: pressed ? 0.72 : 1,
                }
              : {
                  backgroundColor: theme.surfaceSecondary,
                  borderColor: colorWithAlpha(theme.border, 0.7),
                  opacity: 0.78,
                },
          ]}
        >
          <Text
            style={[
              styles.currencyCode,
              {
                color: canChangeCurrency ? theme.accent : theme.muted,
              },
            ]}
          >
            {transactionCurrencyCode}
          </Text>
          {canChangeCurrency ? (
            <FilledIcon name="currency-exchange" size={15} tone="accent" />
          ) : null}
        </Pressable>
      </Pressable>

      {/* Foreign-currency conversion summary */}
      {showConversion ? (
        <View
          style={[
            styles.conversionBox,
            {
              backgroundColor: theme.surfaceSecondary,
              borderColor: colorWithAlpha(theme.border, 0.7),
            },
          ]}
        >
          <Text className="font-manrope-semibold text-xs text-muted">
            {t("transactions.form.transactionCurrency", {
              type: t(
                type === 1
                  ? "transactions.common.types.income"
                  : "transactions.common.types.expense",
              ),
              currency: transactionCurrencyCode,
            })}
          </Text>
          {currencyRateLoading ? (
            <Text className="font-sans text-xs text-muted">
              {t("transactions.form.currencyRateLoading")}
            </Text>
          ) : null}
          {currencyRateError ? (
            <Text
              accessibilityRole="alert"
              className="font-sans text-xs text-danger"
            >
              {currencyRateError}
            </Text>
          ) : null}
          {currencyRateNotice ? (
            <Text className="font-sans text-xs text-muted">
              {currencyRateNotice}
            </Text>
          ) : null}
          {exchangeRate ? (
            <View className="gap-0.5 pt-0.5">
              <Text
                className="font-sans text-xs text-muted"
                style={styles.tabular}
              >
                {t("transactions.form.exchangeRateSummary", {
                  from: transactionCurrencyCode,
                  rate: exchangeRate,
                  to: accountCurrencyCode,
                  date: exchangeRateDate ?? "",
                })}
              </Text>
              {convertedAccountAmount !== null ? (
                <Text
                  className="font-manrope-semibold text-sm text-foreground"
                  style={styles.tabular}
                >
                  {t("transactions.form.amountInAccountCurrency", {
                    currency: accountCurrencyCode,
                    amount: formatCurrency(
                      convertedAccountAmount,
                      accountCurrencyCode,
                    ),
                  })}
                </Text>
              ) : null}
            </View>
          ) : null}
        </View>
      ) : null}

      <View
        style={[
          styles.divider,
          { backgroundColor: colorWithAlpha(theme.border, 0.8) },
        ]}
      />

      {/* Transaction Name Row */}
      <Pressable
        accessible={false}
        disabled={disabled}
        onPress={() => nameInputRef.current?.focus()}
        style={styles.nameZone}
      >
        <View
          style={[
            styles.nameBadge,
            {
              backgroundColor: selectedCategory
                ? colorWithAlpha(
                    selectedCategory.color,
                    theme.isDark ? 0.22 : 0.14,
                  )
                : theme.surfaceSecondary,
            },
          ]}
        >
          {selectedCategory ? (
            <RecordIcon
              color={selectedCategory.color}
              name={selectedCategory.icon}
              pathData={selectedCategory.iconPath}
              size={18}
            />
          ) : (
            <FilledIcon name="edit-note" size={19} tone="muted" />
          )}
        </View>

        <TextInput
          ref={nameInputRef}
          accessibilityLabel={t("transactions.form.name")}
          allowFontScaling
          editable={!disabled}
          maxLength={100}
          placeholder={namePlaceholder}
          placeholderTextColor={colorWithAlpha(theme.foreground, 0.36)}
          returnKeyType={hasPositiveAmount ? "done" : "next"}
          selectionColor={typeTone}
          value={name}
          onChangeText={onChangeName}
          onSubmitEditing={() => {
            if (!hasPositiveAmount) amountInputRef.current?.focus();
          }}
          style={[
            styles.nameInput,
            {
              color: theme.foreground,
              textAlign: direction === "rtl" ? "right" : "left",
              writingDirection: direction,
            },
          ]}
        />

        {name.length > 0 && !disabled ? (
          <Pressable
            accessibilityLabel={t("transactions.selection.deselect", {
              name: t("transactions.form.name"),
            })}
            accessibilityRole="button"
            hitSlop={10}
            onPress={() => onChangeName("")}
            style={({ pressed }) => [
              styles.clearButton,
              {
                backgroundColor: theme.surfaceSecondary,
                opacity: pressed ? 0.6 : 1,
              },
            ]}
          >
            <FilledIcon name="close" size={15} tone="muted" />
          </Pressable>
        ) : null}
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    borderRadius: 28,
    borderCurve: "continuous",
    borderWidth: 1,
    overflow: "hidden",
  },
  amountZone: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    paddingHorizontal: 16,
    paddingTop: 22,
    paddingBottom: 18,
    minHeight: 88,
  },
  signBadge: {
    width: 40,
    height: 40,
    borderRadius: 15,
    borderCurve: "continuous",
    alignItems: "center",
    justifyContent: "center",
  },
  signSymbol: {
    fontFamily: "Huninn_400Regular",
    fontSize: 22,
    lineHeight: 24,
    includeFontPadding: false,
    textAlign: "center",
  },
  amountInput: {
    flex: 1,
    minWidth: 0,
    paddingVertical: 0,
    fontFamily: "Huninn_400Regular",
    letterSpacing: -1.1,
    fontVariant: ["tabular-nums"],
  },
  currencyPill: {
    height: 38,
    paddingHorizontal: 12,
    borderRadius: 19,
    borderCurve: "continuous",
    borderWidth: 1,
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
  },
  currencyCode: {
    fontFamily: "Huninn_400Regular",
    fontSize: 13,
    lineHeight: 16,
    letterSpacing: 0.6,
  },
  conversionBox: {
    marginHorizontal: 14,
    marginBottom: 14,
    paddingHorizontal: 14,
    paddingVertical: 11,
    borderRadius: 18,
    borderCurve: "continuous",
    borderWidth: 1,
    gap: 3,
  },
  tabular: {
    fontVariant: ["tabular-nums"],
  },
  divider: {
    height: StyleSheet.hairlineWidth,
    marginHorizontal: 16,
  },
  nameZone: {
    minHeight: 60,
    paddingHorizontal: 16,
    paddingVertical: 10,
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
  },
  nameBadge: {
    width: 34,
    height: 34,
    borderRadius: 12,
    borderCurve: "continuous",
    alignItems: "center",
    justifyContent: "center",
  },
  nameInput: {
    flex: 1,
    minWidth: 0,
    paddingVertical: 4,
    fontFamily: "Huninn_400Regular",
    fontSize: 17,
    lineHeight: 23,
    letterSpacing: -0.2,
  },
  clearButton: {
    width: 28,
    height: 28,
    borderRadius: 14,
    alignItems: "center",
    justifyContent: "center",
  },
});
