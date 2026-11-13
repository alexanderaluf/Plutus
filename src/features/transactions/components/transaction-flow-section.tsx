import { useState } from "react";
import { useTranslation } from "react-i18next";
import { Keyboard, Pressable, ScrollView, StyleSheet, View } from "react-native";

import type { TransactionType } from "@/data/model/transaction-record";
import {
  categoryDescendants,
  categoryHasChildren,
  categoryRootIdIn,
  type Category,
} from "@/data/selectors/category-selectors";
import type { Account } from "../transaction-form-helpers";
import { useAppLocalization } from "@/localization/localization-provider";
import { useCurrencyFormat } from "@/shared/lib/use-currency-format";
import { colorWithAlpha, useAppThemeColors } from "@/shared/theme/app-theme";
import { Text } from "@/shared/ui/app-text";
import { FilledIcon } from "@/shared/ui/filled-icon";
import { RecordIcon } from "@/shared/ui/record-icon";

import { TransactionCategorySheet } from "./transaction-category-sheet";
import type { TransactionOption } from "./transaction-selection-section";

function categoryToOption(category: Category): TransactionOption {
  return {
    id: category.id,
    name: category.name,
    description: "",
    icon: category.icon,
    iconPath: category.iconPath,
    color: category.color,
  };
}

function AccountMiniRail({
  accounts,
  selectedId,
  disabled,
  emptyLabel,
  onSelect,
  onAdd,
}: {
  accounts: readonly Account[];
  selectedId: string;
  disabled: boolean;
  emptyLabel: string;
  onSelect: (accountId: string) => void;
  onAdd: () => void;
}) {
  const { t } = useTranslation();
  const { direction } = useAppLocalization();
  const { amountsHidden, formatCurrency } = useCurrencyFormat();
  const theme = useAppThemeColors();

  if (accounts.length === 0) {
    return (
      <Pressable
        accessibilityLabel={t("transactions.selection.addAccessibility", {
          title: emptyLabel,
        })}
        accessibilityRole="button"
        disabled={disabled}
        onPress={() => {
          Keyboard.dismiss();
          onAdd();
        }}
        style={({ pressed }) => [
          styles.emptyAccountTile,
          {
            backgroundColor: colorWithAlpha(
              theme.accent,
              theme.isDark ? 0.14 : 0.08,
            ),
            borderColor: colorWithAlpha(theme.accent, 0.35),
            opacity: pressed ? 0.72 : 1,
          },
        ]}
      >
        <View
          style={[
            styles.emptyPlusBadge,
            { backgroundColor: colorWithAlpha(theme.accent, 0.18) },
          ]}
        >
          <FilledIcon name="plus" size={20} tone="accent" />
        </View>
        <Text className="flex-1 font-manrope-semibold text-sm text-foreground">
          {emptyLabel}
        </Text>
        <Text className="font-manrope-semibold text-sm text-accent">
          {t("transactions.selection.add")}
        </Text>
      </Pressable>
    );
  }

  return (
    <ScrollView
      horizontal
      keyboardShouldPersistTaps="handled"
      showsHorizontalScrollIndicator={false}
      contentContainerStyle={[styles.accountRailContent, { direction }]}
    >
      {accounts.map((account) => {
        const selected = account.id === selectedId;
        const cardColor = account.color;
        const balanceNegative = !amountsHidden && account.balance < 0;

        return (
          <Pressable
            key={account.id}
            accessibilityLabel={account.name}
            accessibilityRole="radio"
            accessibilityState={{ checked: selected, disabled }}
            disabled={disabled}
            onPress={() => {
              Keyboard.dismiss();
              onSelect(account.id);
            }}
            style={({ pressed }) => [
              styles.accountCard,
              {
                backgroundColor: selected
                  ? colorWithAlpha(cardColor, theme.isDark ? 0.22 : 0.11)
                  : theme.surfaceSecondary,
                borderColor: selected
                  ? cardColor
                  : colorWithAlpha(theme.border, 0.8),
                borderWidth: selected ? 1.5 : 1,
                opacity: pressed ? 0.75 : 1,
              },
            ]}
          >
            <View style={styles.accountCardTop}>
              <View
                style={[
                  styles.accountIconCircle,
                  {
                    backgroundColor: colorWithAlpha(
                      cardColor,
                      theme.isDark ? 0.26 : 0.16,
                    ),
                  },
                ]}
              >
                <RecordIcon
                  color={cardColor}
                  name={account.icon}
                  pathData={account.iconPath}
                  size={17}
                />
              </View>
              <Text
                numberOfLines={1}
                className="min-w-0 flex-1 font-manrope-semibold text-sm text-foreground"
              >
                {account.name}
              </Text>
              {selected ? (
                <View
                  style={[styles.checkBadge, { backgroundColor: cardColor }]}
                >
                  <FilledIcon
                    name="check"
                    size={12}
                    tone="accent-foreground"
                  />
                </View>
              ) : account.isDefault ? (
                <FilledIcon name="pin" size={13} tone="muted" />
              ) : null}
            </View>

            <Text
              numberOfLines={1}
              style={[
                styles.accountBalance,
                {
                  color: balanceNegative ? theme.danger : theme.muted,
                },
              ]}
            >
              {amountsHidden
                ? `${formatCurrency(account.balance, account.currencyCode)} · ${account.currencyCode}`
                : formatCurrency(account.balance, account.currencyCode)}
            </Text>
          </Pressable>
        );
      })}

      <Pressable
        accessibilityLabel={t("transactions.selection.addAccessibility", {
          title: t("transactions.common.fields.account"),
        })}
        accessibilityRole="button"
        disabled={disabled}
        onPress={() => {
          Keyboard.dismiss();
          onAdd();
        }}
        style={({ pressed }) => [
          styles.addAccountCard,
          {
            backgroundColor: theme.surfaceSecondary,
            borderColor: colorWithAlpha(theme.border, 0.9),
            opacity: pressed ? 0.7 : 1,
          },
        ]}
      >
        <View
          style={[
            styles.emptyPlusBadge,
            { backgroundColor: colorWithAlpha(theme.accent, 0.14) },
          ]}
        >
          <FilledIcon name="plus" size={18} tone="accent" />
        </View>
        <Text
          numberOfLines={1}
          className="font-manrope-semibold text-xs text-accent"
        >
          {t("transactions.selection.add")}
        </Text>
      </Pressable>
    </ScrollView>
  );
}

function SectionKicker({
  icon,
  label,
  required,
  badgeText,
  selectedLabel,
  selectedColor,
  addAccessibilityLabel,
  disabled,
  onAdd,
}: {
  icon: "credit-card" | "arrow-top-right" | "arrow-bottom-left";
  label: string;
  required?: boolean;
  badgeText?: string;
  selectedLabel?: string;
  selectedColor?: string;
  addAccessibilityLabel: string;
  disabled: boolean;
  onAdd: () => void;
}) {
  const theme = useAppThemeColors();
  return (
    <View style={styles.sectionHeader}>
      <View className="min-w-0 flex-1 flex-row items-center gap-2">
        <FilledIcon name={icon} size={16} tone="muted" />
        <Text numberOfLines={1} style={[styles.kickerText, { color: theme.muted }]}>
          {label}
        </Text>
        {required ? (
          <View
            style={[styles.requiredDot, { backgroundColor: theme.accent }]}
          />
        ) : null}
        {selectedLabel ? (
          <View
            style={[
              styles.selectedAccountChip,
              {
                backgroundColor: colorWithAlpha(
                  selectedColor ?? theme.accent,
                  theme.isDark ? 0.22 : 0.13,
                ),
              },
            ]}
          >
            <Text
              numberOfLines={1}
              style={[
                styles.selectedAccountChipText,
                { color: selectedColor ?? theme.accent },
              ]}
            >
              {selectedLabel}
            </Text>
          </View>
        ) : null}
      </View>

      {badgeText ? (
        <View
          style={[
            styles.inlineCodeBadge,
            { backgroundColor: theme.surfaceSecondary },
          ]}
        >
          <Text className="font-manrope-semibold text-[11px] tracking-wider text-muted">
            {badgeText}
          </Text>
        </View>
      ) : null}

      <Pressable
        accessibilityLabel={addAccessibilityLabel}
        accessibilityRole="button"
        disabled={disabled}
        hitSlop={8}
        onPress={() => {
          Keyboard.dismiss();
          onAdd();
        }}
        style={({ pressed }) => [
          styles.headerAddButton,
          {
            backgroundColor: colorWithAlpha(theme.accent, 0.12),
            opacity: pressed ? 0.65 : 1,
          },
        ]}
      >
        <FilledIcon name="plus" size={15} tone="accent" />
      </Pressable>
    </View>
  );
}

type TransactionFlowSectionProps = {
  type: TransactionType;
  accounts: readonly Account[];
  selectedAccountId: string;
  destinationAccountId: string;
  categories: Category[];
  selectedCategoryId: string;
  disabled?: boolean;
  onSelectAccount: (accountId: string) => void;
  onSelectDestinationAccount: (accountId: string) => void;
  onSwapAccounts: () => void;
  onSelectCategory: (categoryId: string) => void;
  onAddAccount: () => void;
  onAddCategory: () => void;
};

/**
 * Mode-tailored money flow section:
 * - Expense / Income: fast horizontal account cards + direct category chip cloud.
 * - Transfer: unified From -> To route with one-tap account swap and same-currency filtering.
 */
export function TransactionFlowSection({
  type,
  accounts,
  selectedAccountId,
  destinationAccountId,
  categories,
  selectedCategoryId,
  disabled = false,
  onSelectAccount,
  onSelectDestinationAccount,
  onSwapAccounts,
  onSelectCategory,
  onAddAccount,
  onAddCategory,
}: TransactionFlowSectionProps) {
  const { t } = useTranslation();
  const { direction } = useAppLocalization();
  const theme = useAppThemeColors();
  const [sheetParent, setSheetParent] = useState<TransactionOption | null>(
    null,
  );

  const selectedAccount = accounts.find(
    (account) => account.id === selectedAccountId,
  );
  const destinationAccount = accounts.find(
    (account) => account.id === destinationAccountId,
  );
  const destinationAccounts = accounts.filter(
    (account) =>
      account.id !== selectedAccountId &&
      (!selectedAccount ||
        account.currencyCode === selectedAccount.currencyCode),
  );
  const canSwapAccounts =
    type === 2 &&
    Boolean(selectedAccount) &&
    accounts.some((account) => account.id === destinationAccountId);

  const rootCategories = categories.filter(
    (category) => category.type === type && category.parentId === null,
  );
  const selectedCategory = categories.find(
    (category) => category.id === selectedCategoryId,
  );
  const selectedRootId = selectedCategoryId
    ? categoryRootIdIn(categories, selectedCategoryId)
    : "";
  const showCategoryCard =
    type !== 2 || rootCategories.length > 0 || Boolean(selectedCategoryId);
  const sheetOptions = sheetParent
    ? categoryDescendants(categories, sheetParent.id).map(categoryToOption)
    : [];

  return (
    <View className="gap-3.5" style={{ direction }}>
      {type === 2 ? (
        <View
          style={[
            styles.card,
            {
              backgroundColor: theme.surface,
              borderColor: theme.border,
            },
          ]}
        >
          <View className="gap-2.5 pb-3.5 pt-3.5">
            <View className="px-4">
              <SectionKicker
                addAccessibilityLabel={t(
                  "transactions.selection.addAccessibility",
                  { title: t("transactions.common.fields.transferFrom") },
                )}
                disabled={disabled}
                icon="arrow-top-right"
                label={t("transactions.common.fields.transferFrom")}
                required={!selectedAccountId}
                selectedColor={selectedAccount?.color}
                selectedLabel={
                  accounts.length > 2 ? selectedAccount?.name : undefined
                }
                onAdd={onAddAccount}
              />
            </View>
            <AccountMiniRail
              accounts={accounts}
              disabled={disabled}
              emptyLabel={t("transactions.form.selectAccount")}
              selectedId={selectedAccountId}
              onAdd={onAddAccount}
              onSelect={onSelectAccount}
            />
          </View>

          <View style={styles.bridgeRow}>
            <View
              style={[
                styles.bridgeLine,
                { backgroundColor: colorWithAlpha(theme.border, 0.85) },
              ]}
            />
            {canSwapAccounts ? (
              <Pressable
                accessibilityLabel={t("transactions.common.types.transfer")}
                accessibilityRole="button"
                disabled={disabled}
                hitSlop={8}
                onPress={() => {
                  Keyboard.dismiss();
                  onSwapAccounts();
                }}
                style={({ pressed }) => [
                  styles.bridgePill,
                  {
                    backgroundColor: colorWithAlpha(
                      theme.accent,
                      theme.isDark ? 0.22 : 0.12,
                    ),
                    borderColor: colorWithAlpha(theme.accent, 0.4),
                    transform: [{ rotate: "90deg" }],
                    opacity: pressed ? 0.72 : 1,
                  },
                ]}
              >
                <FilledIcon name="swap-horizontal" size={18} tone="accent" />
              </Pressable>
            ) : (
              <View
                style={[
                  styles.bridgePill,
                  {
                    backgroundColor: theme.surfaceSecondary,
                    borderColor: colorWithAlpha(theme.border, 0.85),
                    transform: [{ rotate: "180deg" }],
                  },
                ]}
              >
                <FilledIcon name="arrow-upward" size={16} tone="muted" />
              </View>
            )}
            <View
              style={[
                styles.bridgeLine,
                { backgroundColor: colorWithAlpha(theme.border, 0.85) },
              ]}
            />
          </View>

          <View className="gap-2.5 pb-4 pt-3.5">
            <View className="px-4">
              <SectionKicker
                addAccessibilityLabel={t(
                  "transactions.selection.addAccessibility",
                  { title: t("transactions.common.fields.transferTo") },
                )}
                badgeText={selectedAccount?.currencyCode}
                disabled={disabled}
                icon="arrow-bottom-left"
                label={t("transactions.common.fields.transferTo")}
                required={!destinationAccountId}
                selectedColor={destinationAccount?.color}
                selectedLabel={
                  destinationAccounts.length > 2
                    ? destinationAccount?.name
                    : undefined
                }
                onAdd={onAddAccount}
              />
            </View>
            <AccountMiniRail
              accounts={destinationAccounts}
              disabled={disabled}
              emptyLabel={t("transactions.form.selectDestinationAccount")}
              selectedId={destinationAccountId}
              onAdd={onAddAccount}
              onSelect={onSelectDestinationAccount}
            />
          </View>
        </View>
      ) : (
        <View
          style={[
            styles.card,
            {
              backgroundColor: theme.surface,
              borderColor: theme.border,
            },
          ]}
        >
          <View className="gap-2.5 py-3.5">
            <View className="px-4">
              <SectionKicker
                addAccessibilityLabel={t(
                  "transactions.selection.addAccessibility",
                  { title: t("transactions.common.fields.account") },
                )}
                disabled={disabled}
                icon="credit-card"
                label={t("transactions.common.fields.account")}
                required={!selectedAccountId}
                selectedColor={selectedAccount?.color}
                selectedLabel={
                  accounts.length > 2 ? selectedAccount?.name : undefined
                }
                onAdd={onAddAccount}
              />
            </View>
            <AccountMiniRail
              accounts={accounts}
              disabled={disabled}
              emptyLabel={t("transactions.form.selectAccount")}
              selectedId={selectedAccountId}
              onAdd={onAddAccount}
              onSelect={onSelectAccount}
            />
          </View>
        </View>
      )}

      {showCategoryCard ? (
        <View
          style={[
            styles.card,
            styles.categoryCard,
            {
              backgroundColor: theme.surface,
              borderColor: theme.border,
            },
          ]}
        >
          <View style={styles.sectionHeader}>
            <View className="min-w-0 flex-1 flex-row items-center gap-2">
              <FilledIcon name="tune" size={16} tone="muted" />
              <Text
                numberOfLines={1}
                style={[styles.kickerText, { color: theme.muted }]}
              >
                {t("transactions.common.fields.category")}
              </Text>
              {selectedCategory && selectedCategory.parentId !== null ? (
                <Pressable
                  accessibilityLabel={t("transactions.selection.deselect", {
                    name: selectedCategory.name,
                  })}
                  accessibilityRole="button"
                  disabled={disabled}
                  hitSlop={6}
                  onPress={() => onSelectCategory("")}
                  style={({ pressed }) => [
                    styles.selectedSubchip,
                    {
                      backgroundColor: colorWithAlpha(
                        selectedCategory.color,
                        theme.isDark ? 0.24 : 0.14,
                      ),
                      opacity: pressed ? 0.72 : 1,
                    },
                  ]}
                >
                  <Text
                    numberOfLines={1}
                    style={[
                      styles.selectedSubchipText,
                      { color: selectedCategory.color },
                    ]}
                  >
                    {selectedCategory.name}
                  </Text>
                  <FilledIcon
                    color={selectedCategory.color}
                    name="close"
                    size={12}
                  />
                </Pressable>
              ) : null}
            </View>

            <Pressable
              accessibilityLabel={t("transactions.selection.addAccessibility", {
                title: t("transactions.common.fields.category"),
              })}
              accessibilityRole="button"
              disabled={disabled}
              hitSlop={8}
              onPress={() => {
                Keyboard.dismiss();
                onAddCategory();
              }}
              style={({ pressed }) => [
                styles.headerAddButton,
                {
                  backgroundColor: colorWithAlpha(theme.accent, 0.12),
                  opacity: pressed ? 0.65 : 1,
                },
              ]}
            >
              <FilledIcon name="plus" size={15} tone="accent" />
            </Pressable>
          </View>

          {rootCategories.length > 0 ? (
            <View style={styles.categoryWrap}>
              {rootCategories.map((root) => {
                const selected = root.id === selectedRootId;
                const hasChildren = categoryHasChildren(categories, root.id);
                const rootOption = categoryToOption(root);

                return (
                  <Pressable
                    key={root.id}
                    accessibilityLabel={root.name}
                    accessibilityRole={hasChildren ? "button" : "radio"}
                    accessibilityState={
                      hasChildren ? { disabled } : { checked: selected, disabled }
                    }
                    disabled={disabled}
                    onPress={() => {
                      Keyboard.dismiss();
                      if (hasChildren) {
                        setSheetParent(rootOption);
                        return;
                      }
                      onSelectCategory(
                        selectedCategoryId === root.id ? "" : root.id,
                      );
                    }}
                    style={({ pressed }) => [
                      styles.categoryPill,
                      {
                        backgroundColor: selected
                          ? colorWithAlpha(
                              root.color,
                              theme.isDark ? 0.24 : 0.14,
                            )
                          : theme.surfaceSecondary,
                        borderColor: selected
                          ? root.color
                          : colorWithAlpha(theme.border, 0.75),
                        borderWidth: selected ? 1.5 : 1,
                        opacity: pressed ? 0.72 : 1,
                      },
                    ]}
                  >
                    <View
                      style={[
                        styles.categoryIconDot,
                        {
                          backgroundColor: colorWithAlpha(
                            root.color,
                            theme.isDark ? 0.28 : 0.16,
                          ),
                        },
                      ]}
                    >
                      <RecordIcon
                        color={root.color}
                        name={root.icon}
                        pathData={root.iconPath}
                        size={14}
                      />
                    </View>
                    <Text
                      numberOfLines={1}
                      style={[
                        styles.categoryLabel,
                        {
                          color: theme.foreground,
                        },
                      ]}
                    >
                      {root.name}
                    </Text>
                    {hasChildren ? (
                      <FilledIcon name="chevron-right" size={14} tone="muted" />
                    ) : null}
                  </Pressable>
                );
              })}
            </View>
          ) : (
            <Pressable
              accessibilityLabel={t("transactions.selection.addAccessibility", {
                title: t("transactions.common.fields.category"),
              })}
              accessibilityRole="button"
              disabled={disabled}
              onPress={() => {
                Keyboard.dismiss();
                onAddCategory();
              }}
              style={({ pressed }) => [
                styles.emptyCategoryTile,
                {
                  backgroundColor: theme.surfaceSecondary,
                  borderColor: colorWithAlpha(theme.border, 0.9),
                  opacity: pressed ? 0.72 : 1,
                },
              ]}
            >
              <FilledIcon name="plus" size={17} tone="accent" />
              <Text className="font-manrope-semibold text-sm text-accent">
                {t("transactions.form.selectCategory")}
              </Text>
            </Pressable>
          )}
        </View>
      ) : null}

      {sheetParent ? (
        <TransactionCategorySheet
          options={sheetOptions}
          parent={sheetParent}
          selectedId={selectedCategoryId}
          onDismiss={() => setSheetParent(null)}
          onSelect={onSelectCategory}
        />
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    borderRadius: 24,
    borderCurve: "continuous",
    borderWidth: 1,
    overflow: "hidden",
  },
  categoryCard: {
    paddingHorizontal: 16,
    paddingVertical: 14,
    gap: 12,
  },
  sectionHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 8,
  },
  kickerText: {
    fontFamily: "Huninn_400Regular",
    fontSize: 12,
    lineHeight: 16,
    letterSpacing: 0.5,
    textTransform: "uppercase",
  },
  requiredDot: {
    width: 5,
    height: 5,
    borderRadius: 2.5,
  },
  inlineCodeBadge: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 999,
  },
  headerAddButton: {
    width: 28,
    height: 28,
    borderRadius: 14,
    alignItems: "center",
    justifyContent: "center",
  },
  accountRailContent: {
    paddingHorizontal: 16,
    gap: 10,
    alignItems: "stretch",
  },
  accountCard: {
    minWidth: 164,
    maxWidth: 224,
    minHeight: 74,
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderRadius: 18,
    borderCurve: "continuous",
    justifyContent: "space-between",
    gap: 8,
  },
  accountCardTop: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  accountIconCircle: {
    width: 30,
    height: 30,
    borderRadius: 11,
    borderCurve: "continuous",
    alignItems: "center",
    justifyContent: "center",
  },
  checkBadge: {
    width: 20,
    height: 20,
    borderRadius: 10,
    alignItems: "center",
    justifyContent: "center",
  },
  accountBalance: {
    fontFamily: "Huninn_400Regular",
    fontSize: 12,
    lineHeight: 16,
    fontVariant: ["tabular-nums"],
  },
  addAccountCard: {
    width: 88,
    minHeight: 74,
    padding: 10,
    borderRadius: 18,
    borderCurve: "continuous",
    borderWidth: 1,
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
  },
  emptyAccountTile: {
    marginHorizontal: 16,
    minHeight: 56,
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 18,
    borderCurve: "continuous",
    borderWidth: 1,
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
  },
  emptyPlusBadge: {
    width: 32,
    height: 32,
    borderRadius: 12,
    borderCurve: "continuous",
    alignItems: "center",
    justifyContent: "center",
  },
  bridgeRow: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 16,
    gap: 10,
  },
  bridgeLine: {
    flex: 1,
    height: StyleSheet.hairlineWidth,
  },
  bridgePill: {
    width: 34,
    height: 34,
    borderRadius: 17,
    borderWidth: 1,
    alignItems: "center",
    justifyContent: "center",
  },
  categoryWrap: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
  },
  categoryPill: {
    minHeight: 40,
    maxWidth: "100%",
    paddingStart: 7,
    paddingEnd: 11,
    paddingVertical: 6,
    borderRadius: 20,
    borderCurve: "continuous",
    flexDirection: "row",
    alignItems: "center",
    gap: 7,
  },
  categoryIconDot: {
    width: 26,
    height: 26,
    borderRadius: 13,
    alignItems: "center",
    justifyContent: "center",
  },
  categoryLabel: {
    fontFamily: "Huninn_400Regular",
    fontSize: 13.5,
    lineHeight: 18,
    flexShrink: 1,
  },
  selectedSubchip: {
    maxWidth: 170,
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 999,
  },
  selectedAccountChip: {
    maxWidth: 132,
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 999,
  },
  selectedAccountChipText: {
    fontFamily: "Huninn_400Regular",
    fontSize: 11.5,
    lineHeight: 15,
  },
  selectedSubchipText: {
    fontFamily: "Huninn_400Regular",
    fontSize: 12,
    lineHeight: 15,
    flexShrink: 1,
  },
  emptyCategoryTile: {
    minHeight: 48,
    borderRadius: 16,
    borderCurve: "continuous",
    borderWidth: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
  },
});
