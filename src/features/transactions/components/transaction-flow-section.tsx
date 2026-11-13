import { useState, type ReactNode } from "react";
import { useTranslation } from "react-i18next";
import { Keyboard, Pressable, ScrollView, StyleSheet, View } from "react-native";

import type { TransactionType } from "@/data/model/transaction-record";
import {
  categoryDescendants,
  categoryHasChildren,
  categoryRootIdIn,
  type Category,
} from "@/data/selectors/category-selectors";
import { useAppLocalization } from "@/localization/localization-provider";
import { colorForeground } from "@/shared/icons/colors";
import { useCurrencyFormat } from "@/shared/lib/use-currency-format";
import { colorWithAlpha, useAppThemeColors } from "@/shared/theme/app-theme";
import { Text } from "@/shared/ui/app-text";
import { FilledIcon } from "@/shared/ui/filled-icon";
import { RecordIcon } from "@/shared/ui/record-icon";

import type { Account } from "../transaction-form-helpers";
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

/** A section: quiet sentence-case label, optional status, and an add button. */
function SectionCard({
  label,
  status,
  addLabel,
  disabled,
  onAdd,
  children,
  flush = false,
}: {
  label: string;
  status?: ReactNode;
  addLabel: string;
  disabled: boolean;
  onAdd: () => void;
  children: ReactNode;
  /** Horizontal rails run to the card edges. */
  flush?: boolean;
}) {
  const theme = useAppThemeColors();
  return (
    <View
      style={[
        styles.card,
        { backgroundColor: theme.surface, borderColor: theme.border },
      ]}
    >
      <View style={[styles.sectionHeader, styles.inset]}>
        <View className="min-w-0 flex-1 flex-row items-center gap-2">
          <Text
            accessibilityRole="header"
            numberOfLines={1}
            style={[styles.label, { color: theme.muted }]}
          >
            {label}
          </Text>
          {status}
        </View>
        <AddButton label={addLabel} disabled={disabled} onPress={onAdd} />
      </View>
      <View style={flush ? undefined : styles.inset}>{children}</View>
    </View>
  );
}

function AddButton({
  label,
  disabled,
  onPress,
}: {
  label: string;
  disabled: boolean;
  onPress: () => void;
}) {
  const theme = useAppThemeColors();
  return (
    <Pressable
      accessibilityLabel={label}
      accessibilityRole="button"
      disabled={disabled}
      hitSlop={10}
      onPress={() => {
        Keyboard.dismiss();
        onPress();
      }}
      style={({ pressed }) => [
        styles.addButton,
        {
          backgroundColor: colorWithAlpha(theme.accent, 0.12),
          opacity: pressed ? 0.65 : 1,
        },
      ]}
    >
      <FilledIcon name="plus" size={16} tone="accent" />
    </Pressable>
  );
}

function AccountRail({
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
          styles.emptyTile,
          styles.inset,
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
        <FilledIcon name="plus" size={20} tone="accent" />
        <Text className="flex-1 font-manrope-semibold text-[15px] text-foreground">
          {emptyLabel}
        </Text>
      </Pressable>
    );
  }

  return (
    <ScrollView
      horizontal
      keyboardShouldPersistTaps="handled"
      showsHorizontalScrollIndicator={false}
      contentContainerStyle={[styles.railContent, { direction }]}
    >
      {accounts.map((account) => {
        const selected = account.id === selectedId;
        const negative = !amountsHidden && account.balance < 0;

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
                  ? colorWithAlpha(account.color, theme.isDark ? 0.24 : 0.14)
                  : theme.surfaceSecondary,
                borderColor: selected ? account.color : "transparent",
                opacity: pressed ? 0.75 : 1,
              },
            ]}
          >
            <View style={styles.accountTop}>
              <View
                style={[styles.accountIcon, { backgroundColor: account.color }]}
              >
                <RecordIcon
                  color={colorForeground(account.color)}
                  name={account.icon}
                  pathData={account.iconPath}
                  size={17}
                />
              </View>
              {selected ? (
                <View
                  style={[styles.checkBadge, { backgroundColor: account.color }]}
                >
                  <FilledIcon
                    color={colorForeground(account.color)}
                    name="check"
                    size={13}
                  />
                </View>
              ) : null}
            </View>
            <View className="gap-0.5">
              <Text
                numberOfLines={1}
                className="font-manrope-semibold text-[15px] leading-[20px] text-foreground"
              >
                {account.name}
              </Text>
              <Text
                numberOfLines={1}
                style={[
                  styles.balance,
                  { color: negative ? theme.danger : theme.muted },
                ]}
              >
                {formatCurrency(account.balance, account.currencyCode)}
                {amountsHidden ? ` · ${account.currencyCode}` : ""}
              </Text>
            </View>
          </Pressable>
        );
      })}
    </ScrollView>
  );
}

/**
 * Categories as one-tap pills, most used first. A choice fills with the
 * category's own colour so the selection reads from across the screen.
 */
export function TransactionCategoryCard({
  type,
  categories,
  rootCategories,
  selectedCategoryId,
  disabled = false,
  onSelectCategory,
  onAddCategory,
}: {
  type: TransactionType;
  categories: Category[];
  /** Top-level categories of this type, already in display order. */
  rootCategories: Category[];
  selectedCategoryId: string;
  disabled?: boolean;
  onSelectCategory: (categoryId: string) => void;
  onAddCategory: () => void;
}) {
  const { t } = useTranslation();
  const { direction } = useAppLocalization();
  const theme = useAppThemeColors();
  const [sheetParent, setSheetParent] = useState<TransactionOption | null>(
    null,
  );
  const selectedCategory = categories.find(
    (category) => category.id === selectedCategoryId,
  );
  const selectedRootId = selectedCategoryId
    ? categoryRootIdIn(categories, selectedCategoryId)
    : "";
  if (type === 2 && rootCategories.length === 0 && !selectedCategoryId)
    return null;
  const sheetOptions = sheetParent
    ? categoryDescendants(categories, sheetParent.id).map(categoryToOption)
    : [];

  return (
    <View style={{ direction }}>
      <SectionCard
        label={t("transactions.common.fields.category")}
        addLabel={t("transactions.selection.addAccessibility", {
          title: t("transactions.common.fields.category"),
        })}
        disabled={disabled}
        onAdd={onAddCategory}
      >
        {rootCategories.length > 0 ? (
          <View style={styles.categoryWrap}>
            {rootCategories.map((root) => {
              const selected = root.id === selectedRootId;
              const hasChildren = categoryHasChildren(categories, root.id);
              // A chosen subcategory shows on its parent's pill.
              const shown =
                selected && selectedCategory ? selectedCategory : root;
              const ink = selected ? colorForeground(shown.color) : null;

              return (
                <Pressable
                  key={root.id}
                  accessibilityLabel={
                    selected && shown !== root
                      ? `${root.name}, ${shown.name}`
                      : root.name
                  }
                  accessibilityRole={hasChildren ? "button" : "radio"}
                  accessibilityState={
                    hasChildren ? { disabled } : { checked: selected, disabled }
                  }
                  disabled={disabled}
                  onPress={() => {
                    Keyboard.dismiss();
                    if (hasChildren) {
                      setSheetParent(categoryToOption(root));
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
                        ? shown.color
                        : theme.surfaceSecondary,
                      opacity: pressed ? 0.72 : 1,
                    },
                  ]}
                >
                  <View
                    style={[
                      styles.categoryIcon,
                      {
                        backgroundColor: selected
                          ? colorWithAlpha(ink!, 0.16)
                          : colorWithAlpha(
                              root.color,
                              theme.isDark ? 0.28 : 0.18,
                            ),
                      },
                    ]}
                  >
                    <RecordIcon
                      color={ink ?? root.color}
                      name={shown.icon}
                      pathData={shown.iconPath}
                      size={16}
                    />
                  </View>
                  <Text
                    numberOfLines={1}
                    style={[
                      styles.categoryLabel,
                      { color: ink ?? theme.foreground },
                    ]}
                  >
                    {shown.name}
                  </Text>
                  {hasChildren && selected ? (
                    <Pressable
                      accessibilityLabel={t("transactions.selection.deselect", {
                        name: shown.name,
                      })}
                      accessibilityRole="button"
                      disabled={disabled}
                      hitSlop={10}
                      onPress={() => onSelectCategory("")}
                      style={({ pressed }) => [
                        styles.pillClear,
                        {
                          backgroundColor: colorWithAlpha(ink!, 0.18),
                          opacity: pressed ? 0.6 : 1,
                        },
                      ]}
                    >
                      <FilledIcon color={ink!} name="close" size={12} />
                    </Pressable>
                  ) : hasChildren ? (
                    <FilledIcon
                      color={theme.muted}
                      name="chevron-right"
                      size={15}
                    />
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
              styles.emptyTile,
              {
                backgroundColor: theme.surfaceSecondary,
                borderColor: colorWithAlpha(theme.border, 0.9),
                opacity: pressed ? 0.72 : 1,
              },
            ]}
          >
            <FilledIcon name="plus" size={18} tone="accent" />
            <Text className="font-manrope-semibold text-[15px] text-accent">
              {t("transactions.form.selectCategory")}
            </Text>
          </Pressable>
        )}
      </SectionCard>

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

/**
 * Where the money is: one account for expense and income, or a route for a
 * transfer — From, a swap, then To (limited to the same currency).
 */
export function TransactionAccountCard({
  type,
  accounts,
  selectedAccountId,
  destinationAccountId,
  disabled = false,
  onSelectAccount,
  onSelectDestinationAccount,
  onSwapAccounts,
  onAddAccount,
}: {
  type: TransactionType;
  /** Already in display order (default account first). */
  accounts: readonly Account[];
  selectedAccountId: string;
  destinationAccountId: string;
  disabled?: boolean;
  onSelectAccount: (accountId: string) => void;
  onSelectDestinationAccount: (accountId: string) => void;
  onSwapAccounts: () => void;
  onAddAccount: () => void;
}) {
  const { t } = useTranslation();
  const { direction } = useAppLocalization();
  const theme = useAppThemeColors();
  const selectedAccount = accounts.find(
    (account) => account.id === selectedAccountId,
  );
  const destinationAccounts = accounts.filter(
    (account) =>
      account.id !== selectedAccountId &&
      (!selectedAccount ||
        account.currencyCode === selectedAccount.currencyCode),
  );
  const canSwap =
    Boolean(selectedAccount) &&
    accounts.some((account) => account.id === destinationAccountId);

  if (type !== 2)
    return (
      <View style={{ direction }}>
        <SectionCard
          flush
          label={t("transactions.common.fields.account")}
          addLabel={t("transactions.selection.addAccessibility", {
            title: t("transactions.common.fields.account"),
          })}
          disabled={disabled}
          onAdd={onAddAccount}
        >
          <AccountRail
            accounts={accounts}
            disabled={disabled}
            emptyLabel={t("transactions.form.selectAccount")}
            selectedId={selectedAccountId}
            onAdd={onAddAccount}
            onSelect={onSelectAccount}
          />
        </SectionCard>
      </View>
    );

  return (
    <View
      style={[
        styles.card,
        { backgroundColor: theme.surface, borderColor: theme.border, direction },
      ]}
    >
      <View style={[styles.sectionHeader, styles.inset]}>
        <Text
          accessibilityRole="header"
          numberOfLines={1}
          style={[styles.label, { color: theme.muted, flex: 1 }]}
        >
          {t("transactions.common.fields.transferFrom")}
        </Text>
        <AddButton
          label={t("transactions.selection.addAccessibility", {
            title: t("transactions.common.fields.transferFrom"),
          })}
          disabled={disabled}
          onPress={onAddAccount}
        />
      </View>
      <AccountRail
        accounts={accounts}
        disabled={disabled}
        emptyLabel={t("transactions.form.selectAccount")}
        selectedId={selectedAccountId}
        onAdd={onAddAccount}
        onSelect={onSelectAccount}
      />

      <View style={[styles.bridge, styles.inset]}>
        <View
          style={[
            styles.bridgeLine,
            { backgroundColor: colorWithAlpha(theme.border, 0.85) },
          ]}
        />
        <Pressable
          accessibilityLabel={t("transactions.common.types.transfer")}
          accessibilityRole="button"
          accessibilityState={{ disabled: disabled || !canSwap }}
          disabled={disabled || !canSwap}
          hitSlop={8}
          onPress={() => {
            Keyboard.dismiss();
            onSwapAccounts();
          }}
          style={({ pressed }) => [
            styles.swapButton,
            {
              backgroundColor: canSwap
                ? theme.accent
                : theme.surfaceSecondary,
              opacity: pressed ? 0.72 : 1,
            },
          ]}
        >
          <FilledIcon
            name="swap-horizontal"
            size={20}
            tone={canSwap ? "accent-foreground" : "muted"}
            style={{ transform: [{ rotate: "90deg" }] }}
          />
        </Pressable>
        <View
          style={[
            styles.bridgeLine,
            { backgroundColor: colorWithAlpha(theme.border, 0.85) },
          ]}
        />
      </View>

      <View style={[styles.sectionHeader, styles.inset]}>
        <View className="min-w-0 flex-1 flex-row items-center gap-2">
          <Text
            accessibilityRole="header"
            numberOfLines={1}
            style={[styles.label, { color: theme.muted, flexShrink: 1 }]}
          >
            {t("transactions.common.fields.transferTo")}
          </Text>
          {selectedAccount ? (
            <View
              style={[
                styles.codeBadge,
                { backgroundColor: theme.surfaceSecondary },
              ]}
            >
              <Text className="font-manrope-semibold text-[11px] tracking-wider text-muted">
                {selectedAccount.currencyCode}
              </Text>
            </View>
          ) : null}
        </View>
        <AddButton
          label={t("transactions.selection.addAccessibility", {
            title: t("transactions.common.fields.transferTo"),
          })}
          disabled={disabled}
          onPress={onAddAccount}
        />
      </View>
      <View style={styles.railBottom}>
        <AccountRail
          accounts={destinationAccounts}
          disabled={disabled}
          emptyLabel={t("transactions.form.selectDestinationAccount")}
          selectedId={destinationAccountId}
          onAdd={onAddAccount}
          onSelect={onSelectDestinationAccount}
        />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    borderRadius: 24,
    borderCurve: "continuous",
    borderWidth: 1,
    overflow: "hidden",
    paddingTop: 14,
    paddingBottom: 16,
    gap: 12,
  },
  inset: {
    marginHorizontal: 16,
  },
  sectionHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 8,
    minHeight: 30,
  },
  label: {
    fontFamily: "Huninn_400Regular",
    fontSize: 13,
    lineHeight: 18,
  },
  addButton: {
    width: 30,
    height: 30,
    borderRadius: 15,
    alignItems: "center",
    justifyContent: "center",
  },
  railContent: {
    paddingHorizontal: 16,
    gap: 10,
    alignItems: "stretch",
  },
  railBottom: {
    marginTop: -2,
  },
  accountCard: {
    width: 156,
    minHeight: 92,
    padding: 12,
    borderRadius: 18,
    borderCurve: "continuous",
    borderWidth: 1.5,
    justifyContent: "space-between",
    gap: 10,
  },
  accountTop: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  accountIcon: {
    width: 32,
    height: 32,
    borderRadius: 11,
    borderCurve: "continuous",
    alignItems: "center",
    justifyContent: "center",
  },
  checkBadge: {
    width: 22,
    height: 22,
    borderRadius: 11,
    alignItems: "center",
    justifyContent: "center",
  },
  balance: {
    fontFamily: "Huninn_400Regular",
    fontSize: 12,
    lineHeight: 16,
    fontVariant: ["tabular-nums"],
  },
  emptyTile: {
    minHeight: 52,
    paddingHorizontal: 14,
    borderRadius: 16,
    borderCurve: "continuous",
    borderWidth: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 10,
  },
  bridge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
  },
  bridgeLine: {
    flex: 1,
    height: StyleSheet.hairlineWidth,
  },
  swapButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: "center",
    justifyContent: "center",
  },
  codeBadge: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 999,
  },
  categoryWrap: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
  },
  categoryPill: {
    minHeight: 44,
    maxWidth: "100%",
    paddingStart: 6,
    paddingEnd: 13,
    paddingVertical: 6,
    borderRadius: 22,
    borderCurve: "continuous",
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  categoryIcon: {
    width: 30,
    height: 30,
    borderRadius: 15,
    alignItems: "center",
    justifyContent: "center",
  },
  pillClear: {
    width: 22,
    height: 22,
    borderRadius: 11,
    alignItems: "center",
    justifyContent: "center",
  },
  categoryLabel: {
    fontFamily: "Huninn_400Regular",
    fontSize: 14,
    lineHeight: 19,
    flexShrink: 1,
  },
});
