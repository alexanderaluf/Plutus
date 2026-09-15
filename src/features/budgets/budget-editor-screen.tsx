import { BottomSheetScrollView } from "@gorhom/bottom-sheet";
import { LinearGradient } from "expo-linear-gradient";
import { useRef, useState, type PropsWithChildren } from "react";
import { useRouter } from "expo-router";
import { uuid } from "expo-modules-core";
import { BottomSheet, Button } from "heroui-native";
import { useTranslation } from "react-i18next";
import {
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  View,
} from "react-native";
import {
  SafeAreaView,
  useSafeAreaInsets,
} from "react-native-safe-area-context";
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
  selectAccounts,
  selectCategories,
} from "@/data/selectors/document-selectors";
import { CurrencySelectorSheet } from "@/features/profile/components/currency-selector-sheet";
import { AppBottomSheetPortal } from "@/shared/ui/app-bottom-sheet-portal";
import { currencies } from "@/features/profile/data/currencies-data";
import { FilledIcon, type FilledIconName } from "@/shared/ui/filled-icon";
import { colorWithAlpha, useAppThemeColors } from "@/shared/theme/app-theme";
import { Text } from "@/shared/ui/app-text";
import { IconPicker } from "@/shared/ui/icon-picker";
import { useBottomSheetInitialPositionFix } from "@/shared/ui/use-bottom-sheet-initial-position-fix";
import { BudgetColorPicker } from "./components/budget-color-picker";
import {
  BudgetBadge,
  BudgetField,
  BudgetHeader,
  BudgetOption,
  BudgetToggle,
  useBudgetLabels,
} from "./components/budget-ui";

type Sheet =
  "type" | "mode" | "scope" | "period" | "categories" | "accounts" | "settings";
const toggleId = (values: string[], id: string) =>
  values.includes(id) ? values.filter((v) => v !== id) : [...values, id];

function BudgetEditorSheet({
  isOpen,
  title,
  children,
  onClose,
  busy = false,
}: PropsWithChildren<{
  isOpen: boolean;
  title: string;
  onClose: () => void;
  busy?: boolean;
}>) {
  const insets = useSafeAreaInsets();
  const initialPositionFix = useBottomSheetInitialPositionFix(isOpen);

  return (
    <BottomSheet
      isOpen={isOpen}
      onOpenChange={(open) => {
        if (!open && !busy) onClose();
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
          snapPoints={["85%"]}
          enableDynamicSizing={false}
          enableOverDrag={false}
          enablePanDownToClose={!busy}
          topInset={insets.top}
          bottomInset={insets.bottom}
          keyboardBehavior="interactive"
          keyboardBlurBehavior="restore"
          android_keyboardInputMode="adjustResize"
          contentContainerClassName="h-full px-0 pb-0 pt-2"
          backgroundClassName="rounded-t-[28px] bg-surface"
          handleIndicatorClassName="w-10 bg-muted/40"
        >
          <View className="flex-1">
            <View className="border-b border-border px-5 pb-4">
              <BottomSheet.Title>{title}</BottomSheet.Title>
            </View>
            <BottomSheetScrollView
              keyboardShouldPersistTaps="handled"
              keyboardDismissMode="on-drag"
              showsVerticalScrollIndicator={false}
              contentContainerStyle={{
                gap: 10,
                paddingHorizontal: 18,
                paddingTop: 12,
                paddingBottom: Math.max(insets.bottom, 16) + 24,
              }}
            >
              {children}
            </BottomSheetScrollView>
          </View>
        </BottomSheet.Content>
      </AppBottomSheetPortal>
    </BottomSheet>
  );
}

export function BudgetEditorScreen({ editId }: { editId?: string }) {
  const { t, i18n } = useTranslation();
  const labels = useBudgetLabels();
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
          currencyCode: selectBudgetCurrency(document),
          cycleDay: String(document._local.monthStartDay),
        },
  );
  const [sheet, setSheet] = useState<Sheet | null>(null);
  const [currencySheetOpen, setCurrencySheetOpen] = useState(false);
  const [iconPickerOpen, setIconPickerOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const saving = useRef(false),
    id = useRef(editId ?? uuid.v4());
  const categories = selectCategories(document).filter(
    (cat) => cat.type === draft.transactionType,
  );
  const accounts = selectAccounts(document);
  const titles: Record<Sheet, string> = {
    type: t("budgets.form.sheetTitles.type"),
    mode: t("budgets.form.sheetTitles.mode"),
    scope: t("budgets.form.sheetTitles.scope"),
    period: t("budgets.form.sheetTitles.period"),
    categories: t("budgets.form.sheetTitles.categories"),
    accounts: t("budgets.form.sheetTitles.accounts"),
    settings: t("budgets.form.sheetTitles.settings"),
  };
  const change = <K extends keyof BudgetDraft>(key: K, value: BudgetDraft[K]) =>
    setDraft((current) => ({ ...current, [key]: value }));
  function select<K extends keyof BudgetDraft>(key: K, value: BudgetDraft[K]) {
    change(key, value);
  }
  function open(value: Sheet) {
    setQuery("");
    setSheet(value);
  }
  async function save() {
    if (saving.current) return;
    saving.current = true;
    setBusy(true);
    setError("");
    try {
      await updateDocument((current) =>
        saveBudget(
          current,
          draft,
          id.current,
          new Date().toISOString(),
          !!editId,
        ),
      );
      router.replace({ pathname: "/budgets/[id]", params: { id: id.current } });
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
      <SafeAreaView style={{ flex: 1, backgroundColor: c.background }}>
        <BudgetHeader title={t("budgets.form.unavailableTitle")} />
        <Text className="p-5 text-muted">
          {t("budgets.form.unavailableDescription")}
        </Text>
      </SafeAreaView>
    );
  const row = (
    key: Sheet | "currency",
    title: string,
    description: string,
    current: string,
    icon: FilledIconName,
  ) => (
    <Pressable
      accessibilityRole="button"
      disabled={busy}
      onPress={() =>
        key === "currency" ? setCurrencySheetOpen(true) : open(key)
      }
      className="flex-row items-center gap-4 py-4"
    >
      <FilledIcon name={icon} size={26} tone="accent" />
      <View className="flex-1">
        <Text className="font-manrope-semibold text-lg text-foreground">
          {title}
        </Text>
        <Text className="mt-1 text-base leading-6 text-muted">
          {description}
        </Text>
        <Text className="text-sm leading-6 text-muted">{current}</Text>
      </View>
      <FilledIcon name="chevron-right" size={24} />
    </Pressable>
  );
  return (
    <SafeAreaView
      edges={["top"]}
      style={{ flex: 1, backgroundColor: c.background }}
    >
      <BudgetHeader
        title={editId ? t("budgets.form.editTitle") : t("budgets.form.title")}
        disabled={busy}
      />
      <KeyboardAvoidingView
        style={styles.fill}
        behavior={Platform.OS === "ios" ? "padding" : undefined}
      >
        <View style={styles.fill}>
          <ScrollView
            keyboardShouldPersistTaps="handled"
            contentContainerStyle={{
              paddingHorizontal: 20,
              paddingTop: 14,
              paddingBottom: 104 + insets.bottom,
            }}
          >
            <View className="mb-4 flex-row items-center gap-3">
              <Pressable
                accessibilityRole="button"
                accessibilityLabel={t("budgets.form.chooseIcon")}
                disabled={busy}
                onPress={() => setIconPickerOpen(true)}
              >
                <BudgetBadge budget={draft} />
              </Pressable>
              <View className="flex-1">
                <BudgetField
                  editable={!busy}
                  accessibilityLabel={t("budgets.form.name")}
                  placeholder={t("budgets.form.namePlaceholder")}
                  maxLength={100}
                  value={draft.name}
                  onChangeText={(name) => setDraft((d) => ({ ...d, name }))}
                />
              </View>
            </View>
            <BudgetField
              editable={!busy}
              accessibilityLabel={t("budgets.form.amount")}
              placeholder={t("budgets.form.amountPlaceholder")}
              keyboardType="decimal-pad"
              value={draft.amount}
              onChangeText={(amount) => setDraft((d) => ({ ...d, amount }))}
            />
            {row(
              "type",
              t("budgets.form.budgetFor"),
              t("budgets.form.budgetForHelp"),
              t("budgets.common.current", {
                value: labels.types[draft.transactionType],
              }),
              "swap-horizontal",
            )}
            {row(
              "mode",
              t("budgets.form.mode"),
              t("budgets.form.modeHelp"),
              t("budgets.common.current", {
                value: labels.modes[draft.budgetMode],
              }),
              "tune",
            )}
            {row(
              "scope",
              t("budgets.form.scope"),
              t("budgets.form.scopeHelp"),
              t("budgets.common.current", {
                value: t("budgets.common.typeBudget", {
                  type: labels.scopes[draft.budgetType],
                }),
              }),
              "wallet",
            )}
            {row(
              "period",
              t("budgets.form.period"),
              t("budgets.form.periodHelp"),
              draft.period === "Monthly" && Number(draft.cycleDay) > 1
                ? t("budgets.common.currentMonthlyCycle", {
                    period: labels.periods[draft.period],
                    day: draft.cycleDay,
                  })
                : t("budgets.common.current", {
                    value: labels.periods[draft.period],
                  }),
              "clock",
            )}
            {draft.budgetType === "Category" &&
              row(
                "categories",
                draft.budgetMode === "Automatic"
                  ? t("budgets.form.autoTrackCategories")
                  : t("budgets.form.selectCategories"),
                draft.budgetMode === "Automatic"
                  ? t("budgets.form.autoTrackCategoriesHelp")
                  : t("budgets.form.selectCategoriesHelp"),
                t("budgets.common.selected", {
                  count: draft.categories.length,
                }),
                "shopping",
              )}
            {row(
              "accounts",
              t("budgets.form.filterAccounts"),
              t("budgets.form.filterAccountsHelp"),
              draft.accounts.length
                ? t("budgets.common.selected", { count: draft.accounts.length })
                : t("budgets.common.allAccounts"),
              "bank",
            )}
            {row(
              "currency",
              t("budgets.form.currency"),
              t("budgets.form.currencyHelp"),
              draft.currencyCode,
              "cash",
            )}
            {row(
              "settings",
              t("budgets.form.additionalSettings"),
              t("budgets.form.additionalSettingsHelp"),
              draft.rolling
                ? t("budgets.common.rollingBudget")
                : t("budgets.common.fixedBudget"),
              "cog",
            )}
            <BudgetField
              editable={!busy}
              accessibilityLabel={t("budgets.form.notes")}
              placeholder={t("budgets.form.notesPlaceholder")}
              multiline
              maxLength={2000}
              value={draft.notes}
              onChangeText={(notes) => setDraft((d) => ({ ...d, notes }))}
              style={{
                minHeight: 120,
                textAlignVertical: "top",
                marginTop: 12,
              }}
            />
            <Text className="mt-2 font-manrope-semibold text-lg text-foreground">
              {t("budgets.form.colors")}
            </Text>
            <Text className="text-sm leading-5 text-muted">
              {t("budgets.form.colorsHelp")}
            </Text>
            <BudgetColorPicker
              value={draft.color}
              onChange={(color) =>
                setDraft((current) => ({ ...current, color }))
              }
            />
          </ScrollView>

          <LinearGradient
            colors={[
              colorWithAlpha(c.background, 0),
              colorWithAlpha(c.background, 0.72),
              c.background,
              c.background,
            ]}
            locations={[
              0,
              (128 * 0.54) / (128 + insets.bottom),
              128 / (128 + insets.bottom),
              1,
            ]}
            start={{ x: 0.5, y: 0 }}
            end={{ x: 0.5, y: 1 }}
            pointerEvents="none"
            style={[styles.bottomScrim, { height: 128 + insets.bottom }]}
          />

          <View
            pointerEvents="box-none"
            style={[styles.actionDock, { bottom: Math.max(insets.bottom, 10) }]}
          >
            {!!error && (
              <Text
                accessibilityRole="alert"
                accessibilityLiveRegion="polite"
                className="font-sans text-sm text-danger"
              >
                {error}
              </Text>
            )}
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
              <FilledIcon name="wallet" size={24} tone="accent-foreground" />
              <Text
                numberOfLines={1}
                className="shrink font-manrope-bold text-base text-accent-foreground"
              >
                {busy
                  ? t("budgets.form.saving")
                  : editId
                    ? t("budgets.form.save")
                    : t("budgets.form.add")}
              </Text>
            </Pressable>
          </View>
        </View>
      </KeyboardAvoidingView>
      <BudgetEditorSheet
        isOpen={sheet !== null}
        title={sheet ? titles[sheet] : ""}
        busy={busy}
        onClose={() => setSheet(null)}
      >
        {sheet === "type" &&
          labels.types.map((label, index) => (
            <BudgetOption
              key={label}
              title={t("budgets.common.typeBudget", { type: label })}
              description={
                index === 0
                  ? t("budgets.form.typeDescriptions.expense")
                  : index === 1
                    ? t("budgets.form.typeDescriptions.income")
                    : t("budgets.form.typeDescriptions.transfer")
              }
              selected={draft.transactionType === index}
              onPress={() => {
                setDraft((current) => ({
                  ...current,
                  transactionType: index as 0 | 1 | 2,
                  categories:
                    current.transactionType === index ? current.categories : [],
                }));
              }}
            />
          ))}
        {sheet === "mode" && (
          <>
            {(["Automatic", "Manual"] as const).map((mode) => (
              <BudgetOption
                key={mode}
                title={labels.modes[mode]}
                description={
                  mode === "Automatic"
                    ? t("budgets.form.modeDescriptions.automatic")
                    : t("budgets.form.modeDescriptions.manual")
                }
                selected={draft.budgetMode === mode}
                onPress={() => select("budgetMode", mode)}
              />
            ))}
          </>
        )}
        {sheet === "scope" && (
          <>
            {(["Category", "Overall"] as const).map((scope) => (
              <BudgetOption
                key={scope}
                title={t("budgets.common.typeBudget", {
                  type: labels.scopes[scope],
                })}
                description={
                  scope === "Category"
                    ? t("budgets.form.scopeDescriptions.category")
                    : t("budgets.form.scopeDescriptions.overall")
                }
                selected={draft.budgetType === scope}
                onPress={() => select("budgetType", scope)}
              />
            ))}
          </>
        )}
        {sheet === "period" && (
          <>
            {BUDGET_PERIODS.map((period) => (
              <BudgetOption
                key={period}
                title={labels.periods[period]}
                description={
                  period === "Custom"
                    ? t("budgets.form.customDateRange")
                    : t("budgets.form.resets", {
                        period: labels.periods[period].toLocaleLowerCase(
                          i18n.resolvedLanguage,
                        ),
                      })
                }
                selected={draft.period === period}
                onPress={() => select("period", period)}
              />
            ))}
            {draft.period === "Monthly" && (
              <>
                <Text className="mt-3 font-manrope-semibold text-lg text-foreground">
                  {t("budgets.form.customMonthlyCycle")}
                </Text>
                <BudgetField
                  accessibilityLabel={t("budgets.form.startDay")}
                  placeholder={t("budgets.form.startDayPlaceholder")}
                  keyboardType="number-pad"
                  value={draft.cycleDay}
                  maxLength={2}
                  onChangeText={(v) => change("cycleDay", v)}
                />
                <Text className="text-sm text-muted">
                  {t("budgets.form.shorterMonths")}
                </Text>
              </>
            )}
            {draft.period === "Custom" && (
              <>
                <BudgetField
                  accessibilityLabel={t("budgets.form.startDate")}
                  placeholder={t("budgets.form.startDatePlaceholder")}
                  value={draft.startDate}
                  onChangeText={(v) => change("startDate", v)}
                />
                <BudgetField
                  accessibilityLabel={t("budgets.form.endDate")}
                  placeholder={t("budgets.form.endDatePlaceholder")}
                  value={draft.endDate}
                  onChangeText={(v) => change("endDate", v)}
                />
                <Text className="text-sm text-muted">
                  {t("budgets.form.datesIncluded")}
                </Text>
              </>
            )}
          </>
        )}
        {sheet === "categories" && (
          <>
            <Text className="text-muted">
              {t("budgets.form.categorySelection", {
                selected: draft.categories.length,
                total: categories.length,
              })}
            </Text>
            <BudgetField
              accessibilityLabel={t("budgets.form.searchCategories")}
              placeholder={t("budgets.form.searchCategories")}
              value={query}
              onChangeText={setQuery}
            />
            {categories
              .filter((cat) =>
                cat.name.toLowerCase().includes(query.toLowerCase()),
              )
              .map((cat) => (
                <BudgetOption
                  key={cat.id}
                  title={cat.name}
                  description={
                    cat.parentId
                      ? t("budgets.form.subcategory", {
                          parent:
                            categories.find((p) => p.id === cat.parentId)
                              ?.name ?? t("budgets.form.parentCategory"),
                        })
                      : undefined
                  }
                  selected={draft.categories.some((id) =>
                    references(
                      document.categories.find((r) => identity(r) === cat.id)!,
                      id,
                    ),
                  )}
                  onPress={() =>
                    select("categories", toggleId(draft.categories, cat.id))
                  }
                >
                  <BudgetBadge budget={cat} />
                </BudgetOption>
              ))}
            {!categories.length && (
              <Text className="py-4 text-muted">
                {t("budgets.form.noCategories", {
                  type: labels.types[draft.transactionType].toLocaleLowerCase(
                    i18n.resolvedLanguage,
                  ),
                })}
              </Text>
            )}
            {draft.budgetMode === "Manual" ? (
              <BudgetToggle
                title={t("budgets.form.includeSubcategories")}
                description={t("budgets.form.includeSubcategoriesHelp")}
                value={draft.includeSubcategories}
                onChange={(v) => select("includeSubcategories", v)}
              />
            ) : (
              <Text className="py-3 text-muted">
                {t("budgets.form.automaticIncludesDescendants")}
              </Text>
            )}
            <View className="flex-row gap-3">
              <Button
                variant="secondary"
                onPress={() =>
                  select(
                    "categories",
                    categories.map((cat) => cat.id),
                  )
                }
              >
                {t("budgets.form.selectAll")}
              </Button>
              <Button variant="ghost" onPress={() => select("categories", [])}>
                {t("budgets.form.clearAll")}
              </Button>
            </View>
          </>
        )}
        {sheet === "accounts" && (
          <>
            <Text className="text-muted">
              {t("budgets.form.accountSelection", {
                selected: draft.accounts.length,
                total: accounts.length,
              })}
            </Text>
            {accounts.map((a) => (
              <BudgetOption
                key={a.id}
                title={a.name}
                description={`${a.ownerName} · ${a.currencyCode}`}
                selected={draft.accounts.includes(a.id)}
                onPress={() =>
                  select("accounts", toggleId(draft.accounts, a.id))
                }
                icon="bank"
              />
            ))}
            <View className="flex-row gap-3">
              <Button
                variant="secondary"
                onPress={() =>
                  select(
                    "accounts",
                    accounts.map((a) => a.id),
                  )
                }
              >
                {t("budgets.form.selectAll")}
              </Button>
              <Button variant="ghost" onPress={() => select("accounts", [])}>
                {t("budgets.form.clearAll")}
              </Button>
            </View>
          </>
        )}
        {sheet === "settings" && (
          <>
            <BudgetToggle
              title={t("budgets.common.rollingBudget")}
              description={
                draft.period === "Custom"
                  ? t("budgets.form.rollingCustomHelp")
                  : t("budgets.form.rollingHelp")
              }
              disabled={draft.period === "Custom"}
              value={draft.rolling}
              onChange={(v) => select("rolling", v)}
            />
            <BudgetToggle
              title={t("budgets.form.showBudget")}
              description={t("budgets.form.showBudgetHelp")}
              value={draft.showOnHome}
              onChange={(v) => select("showOnHome", v)}
            />
          </>
        )}
      </BudgetEditorSheet>
      <CurrencySelectorSheet
        currencies={currencies}
        isOpen={currencySheetOpen}
        selectedCode={draft.currencyCode}
        closeOnSelect={false}
        onOpenChange={setCurrencySheetOpen}
        onSelect={(currency) => change("currencyCode", currency.code)}
      />
      {iconPickerOpen && (
        <IconPicker
          selected={{ name: draft.icon, pathData: draft.iconPath }}
          onClose={() => setIconPickerOpen(false)}
          onSelect={(icon) => {
            setDraft((current) => ({
              ...current,
              icon: icon.name,
              iconPath: icon.pathData,
            }));
          }}
        />
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  fill: { flex: 1 },
  bottomScrim: {
    position: "absolute",
    bottom: 0,
    left: 0,
    right: 0,
    zIndex: 10,
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
