import {
  EdgeToEdgeLayout,
  EdgeToEdgeScrollView,
  EdgeToEdgeHeaderScrollView,
} from "@/shared/ui/edge-to-edge-layout";
import { BottomSafeAreaGradient } from "@/shared/ui/safe-area-gradients";
import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { useRouter } from "expo-router";
import { uuid } from "expo";
import { Button } from "heroui-native";

import { useTranslation } from "react-i18next";
import {
  Keyboard,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  StyleSheet,
  TextInput,
  View,
} from "react-native";
import Reanimated, {
  Easing,
  FadeIn,
  LinearTransition,
  ReduceMotion,
  useAnimatedStyle,
  useSharedValue,
  withTiming,
} from "react-native-reanimated";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useLocalData } from "@/data/local-data-provider";
import {
  BUDGET_PERIODS,
  budgetDefaults,
  saveBudget,
  type BudgetDraft,
} from "@/data/model/budget-record";
import { identity, references } from "@/data/model/category-record";
import {
  selectBudgetCurrency,
  selectBudgetDraft,
} from "@/data/selectors/budget-selectors";
import {
  categoryDescendants,
  type Category,
} from "@/data/selectors/category-selectors";
import {
  selectAccounts,
  selectCategories,
} from "@/data/selectors/document-selectors";
import { CurrencySelectorSheet } from "@/features/profile/components/currency-selector-sheet";
import { TransactionCategorySheet } from "@/features/transactions/components/transaction-category-sheet";
import type { TransactionOption } from "@/features/transactions/components/transaction-selection-section";
import { currencies } from "@/features/profile/data/currencies-data";
import { useAppLocalization } from "@/localization/localization-provider";
import { colorForeground } from "@/shared/icons/colors";
import { FilledIcon } from "@/shared/ui/filled-icon";
import { colorWithAlpha, useAppThemeColors } from "@/shared/theme/app-theme";
import { Text } from "@/shared/ui/app-text";
import {
  CONTINUOUS,
  FieldInput,
  FormCard,
  FormDivider,
  FormField,
  FormHelp,
  FormLabel,
  FormTabs,
  SwitchRow,
  TABULAR,
} from "@/shared/ui/form-ui";
import { GlassSegmentedControl } from "@/shared/ui/glass-segmented-control";
import { IconPicker } from "@/shared/ui/icon-picker";
import { RecordIcon } from "@/shared/ui/record-icon";
import { BudgetColorPicker } from "./components/budget-color-picker";
import { BudgetHeader, useBudgetLabels } from "./components/budget-ui";
import {
  budgetCategoryOptions,
  categoryAppearance,
  fallbackBudgetName,
} from "./lib/budget-form-helpers";

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

const SECTION_LAYOUT = LinearTransition.duration(240)
  .easing(Easing.bezier(0.77, 0, 0.175, 1))
  .reduceMotion(ReduceMotion.System);
const SECTION_ENTER = FadeIn.duration(200)
  .easing(Easing.bezier(0.23, 1, 0.32, 1))
  .reduceMotion(ReduceMotion.System);

export function BudgetEditorScreen({ editId }: { editId?: string }) {
  const { t, i18n } = useTranslation();
  const labels = useBudgetLabels();
  const { direction } = useAppLocalization();
  const { document, updateDocument } = useLocalData();
  const router = useRouter(),
    insets = useSafeAreaInsets(),
    c = useAppThemeColors();
  const existing = editId ? selectBudgetDraft(document, editId) : null;
  const [draft, setDraft] = useState<BudgetDraft>(() =>
    existing
      ? existing
      : {
          ...budgetDefaults(),
          // The profile currency and salary-cycle day set during onboarding.
          currencyCode: selectBudgetCurrency(document),
          cycleDay: String(document._local.monthStartDay),
        },
  );
  const [currencySheetOpen, setCurrencySheetOpen] = useState(false);
  const [iconPickerOpen, setIconPickerOpen] = useState(false);
  const [query, setQuery] = useState("");
  // The main category whose subcategories are open in the bottom sheet.
  const [sheetRoot, setSheetRoot] = useState<Category | null>(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const saving = useRef(false);
  const [budgetId] = useState(() => editId ?? uuid.v4());
  // A single tracked category lends its look until the person picks one.
  const appearanceChosen = useRef(!!editId);
  const allCategories = useMemo(() => selectCategories(document), [document]);
  const categoryOptions = useMemo(
    () => budgetCategoryOptions(document, allCategories, draft.transactionType),
    [document, allCategories, draft.transactionType],
  );
  const categories = categoryOptions;
  const accounts = selectAccounts(document);
  const isSelected = (category: Category) => {
    const record = document.categories.find(
      (item) => identity(item) === category.id,
    );
    return draft.categories.some((value) =>
      record ? references(record, value) : value === category.id,
    );
  };
  const selectedCategories = categories.filter(isSelected);
  const fallbackName = fallbackBudgetName({
    budgetType: draft.budgetType,
    categoryNames: selectedCategories.map((category) => category.name),
    overallName: t("budgets.common.typeBudget", {
      type: labels.types[draft.transactionType],
    }),
  });
  const namedDraft: BudgetDraft = {
    ...draft,
    name: draft.name.trim() || fallbackName,
    // Decimal keypads in some languages type a comma.
    amount: draft.amount.trim().replace(",", "."),
  };
  // Ready exactly when the record's own save rules would accept it.
  const isReady = (() => {
    try {
      saveBudget(document, namedDraft, budgetId, "", !!editId);
      return true;
    } catch {
      return false;
    }
  })();
  // Same as the transaction page: main categories only; subcategories open
  // in a bottom sheet from their parent.
  const familyOf = (root: Category) => [
    root,
    ...categoryDescendants(categories, root.id),
  ];
  const search = query.trim().toLowerCase();
  const visibleRoots = categories.filter(
    (category) =>
      category.depth === 0 &&
      (!search ||
        familyOf(category).some((member) =>
          member.name.toLowerCase().includes(search),
        )),
  );
  const parsedAmount = Number(draft.amount.replace(",", "."));
  const hasAmount = Number.isFinite(parsedAmount) && parsedAmount > 0;
  const currency = currencies.find((item) => item.code === draft.currencyCode);

  function update(next: (current: BudgetDraft) => BudgetDraft) {
    setDraft(next);
    setError("");
  }
  function change<K extends keyof BudgetDraft>(key: K, value: BudgetDraft[K]) {
    update((current) => ({ ...current, [key]: value }));
  }
  function setCategories(ids: string[]) {
    update((current) => {
      const next = { ...current, categories: ids };
      const look = appearanceChosen.current
        ? null
        : categoryAppearance(
            current.budgetType,
            categories.filter((category) => ids.includes(category.id)),
          );
      return look ? { ...next, ...look } : next;
    });
  }
  function toggleCategory(category: Category) {
    const record = document.categories.find(
      (item) => identity(item) === category.id,
    );
    setCategories(
      isSelected(category)
        ? draft.categories.filter((value) =>
            record ? !references(record, value) : value !== category.id,
          )
        : [...draft.categories, category.id],
    );
  }
  function toggleAccount(accountId: string) {
    change(
      "accounts",
      draft.accounts.includes(accountId)
        ? draft.accounts.filter((value) => value !== accountId)
        : [...draft.accounts, accountId],
    );
  }

  async function save() {
    if (saving.current) return;
    saving.current = true;
    setBusy(true);
    setError("");
    Keyboard.dismiss();
    try {
      await updateDocument((current) =>
        saveBudget(
          current,
          namedDraft,
          budgetId,
          new Date().toISOString(),
          !!editId,
        ),
      );
      router.replace({ pathname: "/budgets/[id]", params: { id: budgetId } });
    } catch (reason) {
      setError(
        reason instanceof Error ? reason.message : t("budgets.form.saveError"),
      );
    } finally {
      saving.current = false;
      setBusy(false);
    }
  }

  if (editId && !existing)
    return (
      <EdgeToEdgeLayout
        header={<BudgetHeader title={t("budgets.form.unavailableTitle")} />}
        bottomFade={false}
      >
        <EdgeToEdgeScrollView
          contentContainerStyle={{ paddingHorizontal: 20, paddingTop: 20 }}
        >
          <Text className="text-muted">
            {t("budgets.form.unavailableDescription")}
          </Text>
        </EdgeToEdgeScrollView>
      </EdgeToEdgeLayout>
    );

  const typeDescription =
    draft.transactionType === 0
      ? t("budgets.form.typeDescriptions.expense")
      : draft.transactionType === 1
        ? t("budgets.form.typeDescriptions.income")
        : t("budgets.form.typeDescriptions.transfer");
  const color = /^#[a-f\d]{6}$/i.test(draft.color) ? draft.color : "#5c6bc0";

  return (
    <EdgeToEdgeLayout
      header={
        <BudgetHeader
          title={editId ? t("budgets.form.editTitle") : t("budgets.form.title")}
          disabled={busy}
        />
      }
      // What the budget tracks stays in reach while the title scrolls away.
      headerDock={
        <View pointerEvents={busy ? "none" : "auto"} style={styles.typeDock}>
          <GlassSegmentedControl
            accessibilityLabel={t("budgets.form.budgetFor")}
            minHeight={Platform.OS === "android" ? 52 : 48}
            options={labels.types.map((label, index) => ({
              label,
              value: index as 0 | 1 | 2,
            }))}
            value={draft.transactionType}
            onChange={(type) =>
              update((current) => ({
                ...current,
                transactionType: type,
                categories:
                  current.transactionType === type ? current.categories : [],
              }))
            }
          />
        </View>
      }
      bottomFade={false}
    >
      {(contentInsets) => (
        <>
          <KeyboardAvoidingView
            style={styles.fill}
            behavior={Platform.OS === "ios" ? "padding" : undefined}
          >
            <View style={styles.fill}>
              <EdgeToEdgeHeaderScrollView
                keyboardShouldPersistTaps="handled"
                showsVerticalScrollIndicator={false}
                contentContainerStyle={{
                  paddingHorizontal: 16,
                  paddingTop: contentInsets.top + 8,
                  paddingBottom: 120 + insets.bottom,
                  gap: 12,
                }}
              >
                {/* Hero: what it is called, and the one number that matters. */}
                <View
                  pointerEvents={busy ? "none" : "auto"}
                  style={[
                    styles.hero,
                    {
                      backgroundColor: c.surface,
                      borderColor: hasAmount
                        ? colorWithAlpha(color, 0.55)
                        : c.border,
                    },
                  ]}
                >
                  <View className="flex-row items-center gap-3.5">
                    <Pressable
                      accessibilityRole="button"
                      accessibilityLabel={t("budgets.form.chooseIcon")}
                      onPress={() => {
                        Keyboard.dismiss();
                        setIconPickerOpen(true);
                      }}
                      className="size-[60px] items-center justify-center rounded-[20px]"
                      style={({ pressed }) => ({
                        backgroundColor: color,
                        opacity: pressed ? 0.8 : 1,
                        ...CONTINUOUS,
                      })}
                    >
                      <RecordIcon
                        name={draft.icon}
                        pathData={draft.iconPath}
                        color={colorForeground(color)}
                        size={30}
                      />
                      <View
                        className="absolute -bottom-1 rounded-full border-2 bg-surface p-1"
                        style={{ end: -4, borderColor: c.surface }}
                      >
                        <FilledIcon name="pencil" size={12} />
                      </View>
                    </Pressable>
                    <View className="min-w-0 flex-1 gap-1.5">
                      <FormLabel>{t("budgets.form.name")}</FormLabel>
                      <FieldInput
                        accessibilityLabel={t("budgets.form.name")}
                        placeholder={
                          fallbackName || t("budgets.form.namePlaceholder")
                        }
                        maxLength={100}
                        value={draft.name}
                        onChangeText={(name) => change("name", name)}
                        style={styles.nameInput}
                      />
                    </View>
                  </View>
                  <FormDivider />
                  <View className="gap-1">
                    <FormLabel>{t("budgets.form.amount")}</FormLabel>
                    <View className="flex-row items-center gap-2">
                      <TextInput
                        accessibilityLabel={t("budgets.form.amount")}
                        placeholder="0"
                        placeholderTextColor={colorWithAlpha(c.foreground, 0.2)}
                        selectionColor={color}
                        keyboardType="decimal-pad"
                        value={draft.amount}
                        onChangeText={(amount) => change("amount", amount)}
                        style={[
                          styles.amount,
                          TABULAR,
                          {
                            color: hasAmount ? c.foreground : c.muted,
                            direction,
                            textAlign: direction === "rtl" ? "right" : "left",
                            writingDirection: direction,
                          },
                        ]}
                      />
                      <Pressable
                        accessibilityRole="button"
                        accessibilityLabel={`${t("budgets.form.currency")}: ${draft.currencyCode}`}
                        onPress={() => {
                          Keyboard.dismiss();
                          setCurrencySheetOpen(true);
                        }}
                        className="h-11 flex-row items-center gap-1.5 rounded-full px-3.5"
                        style={({ pressed }) => ({
                          backgroundColor: c.surfaceSecondary,
                          opacity: pressed ? 0.72 : 1,
                        })}
                      >
                        <Text className="font-manrope-bold text-[15px] text-foreground">
                          {currency?.symbol ?? draft.currencyCode}
                        </Text>
                        <Text className="font-manrope-semibold text-[12px] text-muted">
                          {draft.currencyCode}
                        </Text>
                        <FilledIcon
                          name="chevron-right"
                          size={15}
                          tone="muted"
                          style={{ transform: [{ rotate: "90deg" }] }}
                        />
                      </Pressable>
                    </View>
                    <FormHelp>{typeDescription}</FormHelp>
                    <FormHelp>{t("budgets.form.currencyContribution")}</FormHelp>
                  </View>
                </View>

                <Reanimated.View layout={SECTION_LAYOUT}>
                  <FormCard title={t("budgets.form.period")} icon="clock">
                    <FormHelp>{t("budgets.form.periodHelp")}</FormHelp>
                    <View style={styles.wrap}>
                      {BUDGET_PERIODS.map((period) => (
                        <SelectPill
                          key={period}
                          selected={draft.period === period}
                          label={labels.periods[period]}
                          onPress={() => change("period", period)}
                        />
                      ))}
                    </View>
                    {draft.period === "Monthly" && (
                      <Reanimated.View entering={SECTION_ENTER}>
                        <FormField
                          label={t("budgets.form.customMonthlyCycle")}
                          help={t("budgets.form.shorterMonths")}
                        >
                          <FieldInput
                            accessibilityLabel={t("budgets.form.startDay")}
                            placeholder={t("budgets.form.startDayPlaceholder")}
                            keyboardType="number-pad"
                            maxLength={2}
                            value={draft.cycleDay}
                            onChangeText={(value) => change("cycleDay", value)}
                            style={TABULAR}
                          />
                        </FormField>
                      </Reanimated.View>
                    )}
                    {draft.period === "Custom" && (
                      <Reanimated.View entering={SECTION_ENTER} className="gap-2">
                        <View className="flex-row gap-2">
                          <FieldInput
                            accessibilityLabel={t("budgets.form.startDate")}
                            placeholder={t("budgets.form.startDatePlaceholder")}
                            value={draft.startDate}
                            onChangeText={(value) => change("startDate", value)}
                            style={[styles.flex, TABULAR]}
                          />
                          <FieldInput
                            accessibilityLabel={t("budgets.form.endDate")}
                            placeholder={t("budgets.form.endDatePlaceholder")}
                            value={draft.endDate}
                            onChangeText={(value) => change("endDate", value)}
                            style={[styles.flex, TABULAR]}
                          />
                        </View>
                        <FormHelp>{t("budgets.form.datesIncluded")}</FormHelp>
                      </Reanimated.View>
                    )}
                  </FormCard>
                </Reanimated.View>

                <Reanimated.View layout={SECTION_LAYOUT}>
                  <FormCard title={t("budgets.form.scope")} icon="wallet">
                    <FormTabs
                      accessibilityLabel={t("budgets.form.scope")}
                      value={draft.budgetType}
                      options={(["Category", "Overall"] as const).map(
                        (scope) => ({ value: scope, label: labels.scopes[scope] }),
                      )}
                      onChange={(scope) => change("budgetType", scope)}
                    />
                    <FormHelp>
                      {draft.budgetType === "Category"
                        ? t("budgets.form.scopeDescriptions.category")
                        : t("budgets.form.scopeDescriptions.overall")}
                    </FormHelp>
                    {draft.budgetType === "Category" && (
                      <Reanimated.View entering={SECTION_ENTER} className="gap-4">
                        <FormDivider />
                        <View className="gap-2">
                          <FormLabel>{t("budgets.form.mode")}</FormLabel>
                          <FormTabs
                            accessibilityLabel={t("budgets.form.mode")}
                            value={draft.budgetMode}
                            options={(["Automatic", "Manual"] as const).map(
                              (mode) => ({ value: mode, label: labels.modes[mode] }),
                            )}
                            onChange={(mode) => change("budgetMode", mode)}
                          />
                          <FormHelp>
                            {draft.budgetMode === "Automatic"
                              ? t("budgets.form.modeDescriptions.automatic")
                              : t("budgets.form.modeDescriptions.manual")}
                          </FormHelp>
                        </View>
                        <View className="gap-2.5">
                          <View className="flex-row items-center justify-between gap-2">
                            <FormLabel>
                              {draft.budgetMode === "Automatic"
                                ? t("budgets.form.autoTrackCategories")
                                : t("budgets.form.selectCategories")}
                            </FormLabel>
                            <Text
                              className="font-manrope-semibold text-[12px] text-muted"
                              style={TABULAR}
                            >
                              {t("budgets.form.categorySelection", {
                                selected: selectedCategories.length,
                                total: categories.length,
                              })}
                            </Text>
                          </View>
                          {categories.length > 8 && (
                            <View style={styles.searchBox}>
                              <FieldInput
                                accessibilityLabel={t(
                                  "budgets.form.searchCategories",
                                )}
                                placeholder={t("budgets.form.searchCategories")}
                                returnKeyType="search"
                                value={query}
                                onChangeText={setQuery}
                                style={styles.search}
                              />
                              {query.length > 0 && (
                                <Pressable
                                  accessibilityRole="button"
                                  accessibilityLabel={t(
                                    "budgets.form.clearSearch",
                                  )}
                                  hitSlop={8}
                                  onPress={() => setQuery("")}
                                  style={({ pressed }) => [
                                    styles.searchClear,
                                    {
                                      backgroundColor: colorWithAlpha(
                                        c.foreground,
                                        0.1,
                                      ),
                                      opacity: pressed ? 0.6 : 1,
                                    },
                                  ]}
                                >
                                  <FilledIcon
                                    name="close"
                                    size={14}
                                    tone="muted"
                                  />
                                </Pressable>
                              )}
                            </View>
                          )}
                          {categories.length ? (
                            <View style={styles.wrap}>
                              {visibleRoots.map((root) => {
                                const family = familyOf(root);
                                const chosen = family.filter(isSelected);
                                const hasChildren = family.length > 1;
                                const selected = chosen.length > 0;
                                // One chosen member shows on its parent's pill;
                                // several show as a count.
                                const shown =
                                  chosen.length === 1 ? chosen[0] : root;
                                const ink = colorForeground(shown.color);
                                return (
                                  <SelectPill
                                    key={root.id}
                                    multiple
                                    selected={selected}
                                    color={shown.color}
                                    label={shown.name}
                                    count={
                                      chosen.length > 1
                                        ? chosen.length
                                        : undefined
                                    }
                                    onPress={() =>
                                      hasChildren
                                        ? setSheetRoot(root)
                                        : toggleCategory(root)
                                    }
                                    trailing={
                                      hasChildren && selected ? (
                                        <Pressable
                                          accessibilityRole="button"
                                          accessibilityLabel={t(
                                            "transactions.selection.deselect",
                                            { name: shown.name },
                                          )}
                                          hitSlop={10}
                                          onPress={() =>
                                            setCategories(
                                              draft.categories.filter(
                                                (value) =>
                                                  !family.some((member) => {
                                                    const record =
                                                      document.categories.find(
                                                        (item) =>
                                                          identity(item) ===
                                                          member.id,
                                                      );
                                                    return record
                                                      ? references(record, value)
                                                      : value === member.id;
                                                  }),
                                              ),
                                            )
                                          }
                                          style={({ pressed }) => [
                                            styles.pillClear,
                                            {
                                              backgroundColor: colorWithAlpha(
                                                ink,
                                                0.18,
                                              ),
                                              opacity: pressed ? 0.6 : 1,
                                            },
                                          ]}
                                        >
                                          <FilledIcon
                                            color={ink}
                                            name="close"
                                            size={12}
                                          />
                                        </Pressable>
                                      ) : hasChildren ? (
                                        <FilledIcon
                                          color={c.muted}
                                          name="chevron-right"
                                          size={15}
                                        />
                                      ) : null
                                    }
                                  >
                                    <RecordIcon
                                      name={shown.icon}
                                      pathData={shown.iconPath}
                                      color={selected ? ink : root.color}
                                      size={15}
                                    />
                                  </SelectPill>
                                );
                              })}
                            </View>
                          ) : (
                            <FormHelp>
                              {t("budgets.form.noCategories", {
                                type: labels.types[
                                  draft.transactionType
                                ].toLocaleLowerCase(i18n.resolvedLanguage),
                              })}
                            </FormHelp>
                          )}
                          {categories.length > 0 && (
                            <BulkActions
                              onSelectAll={() =>
                                setCategories(categories.map((item) => item.id))
                              }
                              onClear={() => setCategories([])}
                            />
                          )}
                        </View>
                        {draft.budgetMode === "Manual" ? (
                          <SwitchRow
                            icon="filter"
                            title={t("budgets.form.includeSubcategories")}
                            description={t(
                              "budgets.form.includeSubcategoriesHelp",
                            )}
                            value={draft.includeSubcategories}
                            onChange={(value) =>
                              change("includeSubcategories", value)
                            }
                          />
                        ) : (
                          <FormHelp>
                            {t("budgets.form.automaticIncludesDescendants")}
                          </FormHelp>
                        )}
                      </Reanimated.View>
                    )}
                  </FormCard>
                </Reanimated.View>

                <Reanimated.View layout={SECTION_LAYOUT}>
                  <FormCard title={t("budgets.form.filterAccounts")} icon="bank">
                    <FormHelp>{t("budgets.form.filterAccountsHelp")}</FormHelp>
                    <View style={styles.wrap}>
                      {accounts.map((account) => {
                        const selected = draft.accounts.includes(account.id);
                        return (
                          <SelectPill
                            key={account.id}
                            multiple
                            selected={selected}
                            color={account.color}
                            label={account.name}
                            detail={account.currencyCode}
                            onPress={() => toggleAccount(account.id)}
                          >
                            <RecordIcon
                              name={account.icon}
                              pathData={account.iconPath}
                              color={
                                selected
                                  ? colorForeground(account.color)
                                  : account.color
                              }
                              size={15}
                            />
                          </SelectPill>
                        );
                      })}
                    </View>
                    <FormHelp>
                      {t("budgets.form.accountSelection", {
                        selected: draft.accounts.length,
                        total: accounts.length,
                      })}
                    </FormHelp>
                    {accounts.length > 0 && (
                      <BulkActions
                        onSelectAll={() =>
                          change(
                            "accounts",
                            accounts.map((account) => account.id),
                          )
                        }
                        onClear={() => change("accounts", [])}
                      />
                    )}
                  </FormCard>
                </Reanimated.View>

                <Reanimated.View layout={SECTION_LAYOUT}>
                  <FormCard
                    title={t("budgets.form.additionalSettings")}
                    icon="cog"
                  >
                    <SwitchRow
                      icon="history"
                      title={t("budgets.common.rollingBudget")}
                      description={
                        draft.period === "Custom"
                          ? t("budgets.form.rollingCustomHelp")
                          : t("budgets.form.rollingHelp")
                      }
                      disabled={draft.period === "Custom"}
                      value={draft.rolling}
                      onChange={(value) => change("rolling", value)}
                    />
                    <FormDivider />
                    <SwitchRow
                      icon="home"
                      title={t("budgets.form.showBudget")}
                      description={t("budgets.form.showBudgetHelp")}
                      value={draft.showOnHome}
                      onChange={(value) => change("showOnHome", value)}
                    />
                  </FormCard>
                </Reanimated.View>

                <Reanimated.View layout={SECTION_LAYOUT}>
                  <FormCard title={t("budgets.form.colors")} icon="format-paint">
                    <FormHelp>{t("budgets.form.colorsHelp")}</FormHelp>
                    <BudgetColorPicker
                      value={draft.color}
                      onChange={(value) => {
                        appearanceChosen.current = true;
                        change("color", value);
                      }}
                    />
                  </FormCard>
                </Reanimated.View>

                <Reanimated.View layout={SECTION_LAYOUT}>
                  <FormCard>
                    <FormField label={t("budgets.form.notes")}>
                      <FieldInput
                        accessibilityLabel={t("budgets.form.notes")}
                        placeholder={t("budgets.form.notesPlaceholder")}
                        multiline
                        maxLength={2000}
                        value={draft.notes}
                        onChangeText={(notes) => change("notes", notes)}
                        textAlignVertical="top"
                        style={styles.notes}
                      />
                    </FormField>
                  </FormCard>
                </Reanimated.View>
              </EdgeToEdgeHeaderScrollView>

              <BottomSafeAreaGradient />

              <View
                pointerEvents="box-none"
                style={[
                  styles.actionDock,
                  { bottom: Math.max(insets.bottom, 10) },
                ]}
              >
                {!!error && (
                  <Text
                    accessibilityRole="alert"
                    accessibilityLiveRegion="polite"
                    className="px-2 text-center font-sans text-sm text-danger"
                  >
                    {error}
                  </Text>
                )}
                <SaveEmphasis ready={isReady}>
                  <Pressable
                    accessibilityRole="button"
                    accessibilityLabel={
                      busy
                        ? t("budgets.form.saving")
                        : editId
                          ? t("budgets.form.save")
                          : t("budgets.form.add")
                    }
                    accessibilityState={{ busy, disabled: busy }}
                    disabled={busy}
                    onPress={save}
                    android_ripple={{
                      color: colorWithAlpha(c.accentForeground, 0.16),
                      borderless: false,
                    }}
                    style={({ pressed }) => [
                      styles.actionButton,
                      { backgroundColor: c.accent },
                      busy && styles.actionDisabled,
                      Platform.OS === "ios" && pressed && styles.actionPressed,
                    ]}
                  >
                    <FilledIcon
                      name={editId ? "check" : "wallet"}
                      size={24}
                      tone="accent-foreground"
                    />
                    <Text
                      numberOfLines={1}
                      className="shrink font-manrope-bold text-[17px] text-accent-foreground"
                    >
                      {busy
                        ? t("budgets.form.saving")
                        : editId
                          ? t("budgets.form.save")
                          : t("budgets.form.add")}
                    </Text>
                  </Pressable>
                </SaveEmphasis>
              </View>
            </View>
          </KeyboardAvoidingView>
          {sheetRoot ? (
            <TransactionCategorySheet
              parent={categoryToOption(sheetRoot)}
              options={categoryDescendants(categories, sheetRoot.id).map(
                categoryToOption,
              )}
              selectedIds={selectedCategories.map((category) => category.id)}
              onToggle={(categoryId) => {
                const category = categories.find(
                  (item) => item.id === categoryId,
                );
                if (category) toggleCategory(category);
              }}
              onDismiss={() => setSheetRoot(null)}
            />
          ) : null}
          <CurrencySelectorSheet
            currencies={currencies}
            isOpen={currencySheetOpen}
            selectedCode={draft.currencyCode}
            closeOnSelect={false}
            onOpenChange={setCurrencySheetOpen}
            onSelect={(item) => change("currencyCode", item.code)}
          />
          {iconPickerOpen && (
            <IconPicker
              selected={{ name: draft.icon, pathData: draft.iconPath }}
              onClose={() => setIconPickerOpen(false)}
              onSelect={(icon) => {
                appearanceChosen.current = true;
                update((current) => ({
                  ...current,
                  icon: icon.name,
                  iconPath: icon.pathData,
                }));
              }}
            />
          )}
        </>
      )}
    </EdgeToEdgeLayout>
  );
}

/**
 * A one-tap choice. A chosen pill is shown by colour alone: it fills with its
 * own colour (or the accent), never a check mark, like the transaction page.
 */
function SelectPill({
  selected,
  label,
  detail,
  color,
  depth = 0,
  multiple = false,
  count,
  trailing,
  onPress,
  children,
}: {
  selected: boolean;
  label: string;
  detail?: string;
  color?: string;
  depth?: number;
  multiple?: boolean;
  count?: number;
  trailing?: ReactNode;
  onPress: () => void;
  children?: ReactNode;
}) {
  const c = useAppThemeColors();
  const fill = selected ? (color ?? c.accent) : c.surfaceSecondary;
  const ink = selected
    ? color
      ? colorForeground(color)
      : c.accentForeground
    : c.foreground;
  return (
    <Pressable
      accessibilityRole={multiple ? "checkbox" : "radio"}
      accessibilityLabel={detail ? `${label}, ${detail}` : label}
      accessibilityState={{ checked: selected }}
      onPress={() => {
        Keyboard.dismiss();
        onPress();
      }}
      style={({ pressed }) => [
        styles.pill,
        {
          backgroundColor: fill,
          paddingStart: children ? 7 : 16,
          opacity: pressed ? 0.72 : 1,
        },
      ]}
    >
      {depth > 0 ? (
        <View
          style={[
            styles.depthMark,
            { backgroundColor: colorWithAlpha(ink, 0.4) },
          ]}
        />
      ) : null}
      {children ? (
        <View
          style={[
            styles.pillIcon,
            {
              backgroundColor: selected
                ? colorWithAlpha(ink, 0.16)
                : color
                  ? colorWithAlpha(color, c.isDark ? 0.28 : 0.18)
                  : "transparent",
            },
          ]}
        >
          {children}
        </View>
      ) : null}
      <Text numberOfLines={1} style={[styles.pillLabel, { color: ink }]}>
        {label}
      </Text>
      {detail ? (
        <Text
          style={[
            styles.pillDetail,
            { color: selected ? colorWithAlpha(ink, 0.7) : c.muted },
          ]}
        >
          {detail}
        </Text>
      ) : null}
      {count ? (
        <View
          style={[
            styles.countBadge,
            { backgroundColor: colorWithAlpha(ink, 0.18) },
          ]}
        >
          <Text style={[styles.countText, TABULAR, { color: ink }]}>
            {count}
          </Text>
        </View>
      ) : null}
      {trailing}
    </Pressable>
  );
}

function BulkActions({
  onSelectAll,
  onClear,
}: {
  onSelectAll: () => void;
  onClear: () => void;
}) {
  const { t } = useTranslation();
  return (
    <View className="flex-row gap-2">
      <Button size="sm" variant="secondary" onPress={onSelectAll}>
        {t("budgets.form.selectAll")}
      </Button>
      <Button size="sm" variant="ghost" onPress={onClear}>
        {t("budgets.form.clearAll")}
      </Button>
    </View>
  );
}

/**
 * Dimmed until the budget can be saved, then fully lit: readiness is seen,
 * not read. It stays pressable so a tap explains what is missing.
 */
function SaveEmphasis({
  ready,
  children,
}: {
  ready: boolean;
  children: ReactNode;
}) {
  const emphasis = useSharedValue(ready ? 1 : 0);
  useEffect(() => {
    emphasis.set(
      withTiming(ready ? 1 : 0, {
        duration: 220,
        easing: Easing.bezier(0.23, 1, 0.32, 1),
        reduceMotion: ReduceMotion.System,
      }),
    );
  }, [emphasis, ready]);
  const style = useAnimatedStyle(() => ({
    opacity: 0.5 + emphasis.get() * 0.5,
    transform: [{ scale: 0.98 + emphasis.get() * 0.02 }],
  }));
  return <Reanimated.View style={style}>{children}</Reanimated.View>;
}

const styles = StyleSheet.create({
  fill: { flex: 1 },
  flex: { flex: 1 },
  typeDock: { paddingHorizontal: 12, paddingBottom: 8 },
  hero: {
    borderRadius: 28,
    borderCurve: "continuous",
    borderWidth: 1,
    padding: 16,
    gap: 14,
  },
  nameInput: { fontSize: 17, height: 50 },
  amount: {
    flex: 1,
    minWidth: 0,
    fontFamily: "Huninn_400Regular",
    fontSize: 44,
    lineHeight: 52,
    letterSpacing: -1,
    paddingVertical: 0,
  },
  wrap: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  pill: {
    minHeight: 44,
    maxWidth: "100%",
    paddingEnd: 14,
    paddingVertical: 6,
    borderRadius: 22,
    borderCurve: "continuous",
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  pillIcon: {
    width: 28,
    height: 28,
    borderRadius: 14,
    alignItems: "center",
    justifyContent: "center",
  },
  pillLabel: {
    fontFamily: "Huninn_400Regular",
    fontSize: 14,
    lineHeight: 19,
    flexShrink: 1,
  },
  pillDetail: {
    fontFamily: "Huninn_400Regular",
    fontSize: 11,
    letterSpacing: 0.5,
  },
  depthMark: { width: 3, height: 16, borderRadius: 2 },
  pillClear: {
    width: 22,
    height: 22,
    borderRadius: 11,
    alignItems: "center",
    justifyContent: "center",
  },
  countBadge: {
    minWidth: 20,
    height: 20,
    borderRadius: 10,
    paddingHorizontal: 5,
    alignItems: "center",
    justifyContent: "center",
  },
  countText: {
    fontFamily: "Huninn_400Regular",
    fontSize: 11,
    lineHeight: 14,
  },
  searchBox: { justifyContent: "center" },
  // Room at the end so typed text never runs under the clear button.
  search: { height: 48, paddingEnd: 44 },
  searchClear: {
    position: "absolute",
    end: 10,
    width: 26,
    height: 26,
    borderRadius: 13,
    alignItems: "center",
    justifyContent: "center",
  },
  notes: {
    height: "auto",
    minHeight: 104,
    paddingVertical: 14,
  },
  actionDock: {
    position: "absolute",
    left: 0,
    right: 0,
    paddingHorizontal: 12,
    gap: 6,
    zIndex: 20,
  },
  actionButton: {
    height: 58,
    borderRadius: 29,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 10,
    paddingHorizontal: 16,
    overflow: "hidden",
  },
  actionPressed: { opacity: 0.72 },
  actionDisabled: { opacity: 0.5 },
});
