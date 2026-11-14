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
import { colorForeground } from "@/shared/icons/colors";
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
  /** New entries open with the keyboard on the amount: the first thing to type. */
  autoFocusAmount?: boolean;
  disabled?: boolean;
  onChangeAmount: (value: string) => void;
  onChangeName: (value: string) => void;
  onOpenCurrencyPicker: () => void;
};

/**
 * The page's centre of gravity: how much, in which currency, and what for.
 * The type's colour carries the meaning (red out, green in, accent moved);
 * the amount uses the full width and the largest type on the page.
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
  autoFocusAmount = false,
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
  const { symbol, icon } = getTransactionTypeVisual(type);
  const parsedAmount = parseTransactionAmount(amount);
  const hasPositiveAmount = Number.isFinite(parsedAmount) && parsedAmount > 0;
  const digitCount = amount.trim().length;
  // The number shrinks only when it would otherwise not fit one line.
  const amountFontSize =
    digitCount > 14 ? 30 : digitCount > 11 ? 38 : digitCount > 8 ? 46 : 54;
  const textAlign = direction === "rtl" ? "right" : "left";

  return (
    <View
      style={[
        styles.card,
        {
          backgroundColor: theme.surface,
          borderColor: hasPositiveAmount
            ? colorWithAlpha(typeTone, theme.isDark ? 0.42 : 0.3)
            : theme.border,
          direction,
        },
      ]}
    >
      <LinearGradient
        colors={[
          colorWithAlpha(typeTone, theme.isDark ? 0.16 : 0.1),
          colorWithAlpha(typeTone, theme.isDark ? 0.04 : 0.025),
          colorWithAlpha(typeTone, 0),
        ]}
        end={{ x: 0.8, y: 1 }}
        locations={[0, 0.6, 1]}
        pointerEvents="none"
        start={{ x: 0, y: 0 }}
        style={StyleSheet.absoluteFill}
      />

      <Pressable
        accessible={false}
        disabled={disabled}
        onPress={() => amountInputRef.current?.focus()}
        style={styles.amountZone}
      >
        <View style={styles.amountMeta}>
          <View
            style={[
              styles.signBadge,
              {
                backgroundColor: colorWithAlpha(
                  typeTone,
                  theme.isDark ? 0.24 : 0.14,
                ),
              },
            ]}
          >
            {type === 2 ? (
              <FilledIcon color={typeTone} name="swap-horizontal" size={18} />
            ) : (
              <FilledIcon color={typeTone} name={icon} size={18} />
            )}
          </View>

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
              {
                backgroundColor: canChangeCurrency
                  ? theme.surfaceSecondary
                  : "transparent",
                borderColor: canChangeCurrency
                  ? colorWithAlpha(theme.border, 0.9)
                  : "transparent",
                opacity: pressed ? 0.72 : 1,
              },
            ]}
          >
            <Text style={[styles.currencyCode, { color: theme.foreground }]}>
              {transactionCurrencyCode}
            </Text>
            {canChangeCurrency ? (
              <FilledIcon
                name="chevron-right"
                size={15}
                tone="muted"
                style={{ transform: [{ rotate: "90deg" }] }}
              />
            ) : null}
          </Pressable>
        </View>

        <View style={styles.amountRow}>
          {type !== 2 ? (
            <Text
              style={[styles.signSymbol, { color: typeTone }]}
              accessibilityElementsHidden
              importantForAccessibility="no"
            >
              {symbol}
            </Text>
          ) : null}
          <TextInput
            ref={amountInputRef}
            accessibilityLabel={t("transactions.form.amount")}
            allowFontScaling
            autoFocus={autoFocusAmount}
            editable={!disabled}
            keyboardType="decimal-pad"
            maxLength={30}
            placeholder="0.00"
            placeholderTextColor={colorWithAlpha(theme.foreground, 0.2)}
            returnKeyType="next"
            selectionColor={typeTone}
            value={amount}
            onChangeText={onChangeAmount}
            onSubmitEditing={() => nameInputRef.current?.focus()}
            style={[
              styles.amountInput,
              {
                color: hasPositiveAmount ? theme.foreground : theme.muted,
                fontSize: amountFontSize,
                lineHeight: amountFontSize + 8,
                textAlign,
                writingDirection: direction,
              },
            ]}
          />
        </View>

        {showConversion ? (
          <View style={styles.conversion}>
            <Text className="font-manrope-semibold text-[12px] leading-[16px] text-muted">
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
              <Text className="font-sans text-[12px] leading-[16px] text-muted">
                {t("transactions.form.currencyRateLoading")}
              </Text>
            ) : null}
            {currencyRateError ? (
              <Text
                accessibilityRole="alert"
                className="font-sans text-[12px] leading-[16px] text-danger"
              >
                {currencyRateError}
              </Text>
            ) : null}
            {currencyRateNotice ? (
              <Text className="font-sans text-[12px] leading-[16px] text-muted">
                {currencyRateNotice}
              </Text>
            ) : null}
            {exchangeRate ? (
              <>
                {convertedAccountAmount !== null ? (
                  <Text
                    className="font-manrope-bold text-[15px] leading-[20px] text-foreground"
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
                <Text
                  className="font-sans text-[12px] leading-[16px] text-muted"
                  style={styles.tabular}
                >
                  {t("transactions.form.exchangeRateSummary", {
                    from: transactionCurrencyCode,
                    rate: exchangeRate,
                    to: accountCurrencyCode,
                    date: exchangeRateDate ?? "",
                  })}
                </Text>
              </>
            ) : null}
          </View>
        ) : null}
      </Pressable>

      <View
        style={[
          styles.divider,
          { backgroundColor: colorWithAlpha(theme.border, 0.8) },
        ]}
      />

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
                ? selectedCategory.color
                : theme.surfaceSecondary,
            },
          ]}
        >
          {selectedCategory ? (
            <RecordIcon
              color={colorForeground(selectedCategory.color)}
              name={selectedCategory.icon}
              pathData={selectedCategory.iconPath}
              size={19}
            />
          ) : (
            <FilledIcon name="edit-note" size={20} tone="muted" />
          )}
        </View>

        <TextInput
          ref={nameInputRef}
          accessibilityLabel={t("transactions.form.name")}
          allowFontScaling
          editable={!disabled}
          maxLength={100}
          placeholder={namePlaceholder}
          placeholderTextColor={colorWithAlpha(theme.foreground, 0.38)}
          returnKeyType="done"
          selectionColor={typeTone}
          value={name}
          onChangeText={onChangeName}
          style={[
            styles.nameInput,
            { color: theme.foreground, textAlign, writingDirection: direction },
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
    paddingHorizontal: 18,
    paddingTop: 16,
    paddingBottom: 18,
    gap: 6,
  },
  amountMeta: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  signBadge: {
    width: 34,
    height: 34,
    borderRadius: 12,
    borderCurve: "continuous",
    alignItems: "center",
    justifyContent: "center",
  },
  amountRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    minHeight: 70,
  },
  signSymbol: {
    fontFamily: "Huninn_400Regular",
    fontSize: 38,
    lineHeight: 46,
    includeFontPadding: false,
  },
  amountInput: {
    flex: 1,
    minWidth: 0,
    paddingVertical: 0,
    fontFamily: "Huninn_400Regular",
    letterSpacing: -1.2,
    fontVariant: ["tabular-nums"],
  },
  currencyPill: {
    height: 36,
    paddingHorizontal: 12,
    borderRadius: 18,
    borderCurve: "continuous",
    borderWidth: 1,
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
  },
  currencyCode: {
    fontFamily: "Huninn_400Regular",
    fontSize: 14,
    lineHeight: 18,
    letterSpacing: 0.6,
  },
  conversion: {
    gap: 2,
    paddingTop: 2,
  },
  tabular: {
    fontVariant: ["tabular-nums"],
  },
  divider: {
    height: StyleSheet.hairlineWidth,
    marginHorizontal: 18,
  },
  nameZone: {
    minHeight: 64,
    paddingHorizontal: 18,
    paddingVertical: 10,
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
  },
  nameBadge: {
    width: 38,
    height: 38,
    borderRadius: 13,
    borderCurve: "continuous",
    alignItems: "center",
    justifyContent: "center",
  },
  nameInput: {
    flex: 1,
    minWidth: 0,
    paddingVertical: 4,
    fontFamily: "Huninn_400Regular",
    fontSize: 18,
    lineHeight: 24,
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
