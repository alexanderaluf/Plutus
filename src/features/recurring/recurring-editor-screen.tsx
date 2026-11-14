import { useAppDate } from "@/shared/lib/use-app-date";
import { useLocalData } from "@/data/local-data-provider";
import {
  RECURRING_PERIODS,
  saveRecurring,
  type RecurringDraft,
} from "@/data/model/recurring-record";
import { requestRecurringReminderPermission } from "@/data/recurring/recurring-reminders";
import {
  selectAccounts,
  selectCategories,
  selectRecurringRelations,
  selectRecurrings,
} from "@/data/selectors/document-selectors";
import { BudgetColorPicker } from "@/features/budgets/components/budget-color-picker";
import { CurrencySelectorSheet } from "@/features/profile/components/currency-selector-sheet";
import { currencies } from "@/features/profile/data/currencies-data";
import { useProfiles } from "@/features/profile/profile-provider";
import {
  TransactionAccountCard,
  TransactionCategoryCard,
} from "@/features/transactions/components/transaction-flow-section";
import { TransactionOptionPickerSheet } from "@/features/transactions/components/transaction-option-picker-sheet";
import type { TransactionOption } from "@/features/transactions/components/transaction-selection-section";
import {
  fallbackTransactionName,
  formatTransactionTime,
  getTransactionTypeTone,
  getTransactionTypeVisual,
  orderAccountsForPicker,
  rankRootCategories,
} from "@/features/transactions/transaction-form-helpers";
import { useAppLocalization } from "@/localization/localization-provider";
import { colorForeground } from "@/shared/icons/colors";
import { colorWithAlpha, useAppThemeColors } from "@/shared/theme/app-theme";
import { Text } from "@/shared/ui/app-text";
import { DateTimePopover } from "@/shared/ui/date-time-popover";
import { FilledIcon, type FilledIconName } from "@/shared/ui/filled-icon";
import {
  CONTINUOUS,
  FieldInput,
  FormCard,
  FormDivider,
  FormHelp,
  FormLabel,
  SwitchRow,
  TABULAR,
} from "@/shared/ui/form-ui";
import { IconPicker } from "@/shared/ui/icon-picker";
import { RecordIcon } from "@/shared/ui/record-icon";
import { DateTimePicker } from "@expo/ui/community/datetime-picker";
import { uuid } from "expo";
import { useCalendars } from "expo-localization";
import { LinearGradient } from "expo-linear-gradient";
import { useRouter } from "expo-router";
import { useRef, useState, type ReactNode } from "react";
import { useTranslation } from "react-i18next";
import {
  Keyboard,
  Platform,
  Pressable,
  StyleSheet,
  TextInput,
  View,
} from "react-native";
import {
  RecurringAction,
  RecurringEditorShell,
} from "./components/recurring-ui";
import {
  REMINDER_OPTIONS,
  createInitialRecurringDraft,
  withCategoryLook,
} from "./lib/recurring-form-helpers";

type Relation = "budget" | "label" | "place" | "person";

export function RecurringEditorScreen({ editId }: { editId?: string }) {
  const { document, updateDocument, reconcileRecurringPayments } =
      useLocalData(),
    { activeProfile } = useProfiles(),
    router = useRouter(),
    c = useAppThemeColors(),
    { t, i18n } = useTranslation();
  const { direction } = useAppLocalization();
  const calendars = useCalendars();
  const { formatDate } = useAppDate();
  const existing = editId
    ? selectRecurrings(document).find((r) => r.id === editId)
    : null;
  const accounts = selectAccounts(document),
    categories = selectCategories(document);
  const [draft, setDraft] = useState<RecurringDraft>(
    () =>
      existing?.draft ??
      createInitialRecurringDraft(accounts, activeProfile.currencyCode),
  );
  const [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  const [sheet, setSheet] = useState<"currency" | "icon" | null>(null);
  const [relationSheet, setRelationSheet] = useState<Relation | null>(null);
  const [datePicker, setDatePicker] = useState<"start" | "time" | "end" | null>(
    null,
  );
  const saving = useRef(false);
  const [recurringId] = useState(() => editId ?? uuid.v4());
  // The category lends its look until the person picks an icon or colour.
  const lookChosen = useRef(!!editId);
  const selectedCategory = categories.find((item) => item.id === draft.category);
  const fallbackName = fallbackTransactionName({
    type: draft.type,
    categoryName: selectedCategory?.name,
  });
  const namedDraft: RecurringDraft = {
    ...draft,
    name: draft.name.trim() || fallbackName,
  };
  // Ready exactly when the record's own save rules would accept it.
  const isReady = (() => {
    try {
      saveRecurring(
        document,
        namedDraft,
        recurringId,
        activeProfile.id,
        "",
        !!editId,
      );
      return true;
    } catch {
      return false;
    }
  })();
  const relationOptions: Record<Relation, TransactionOption[]> = {
    budget: selectRecurringRelations(document, "budgets"),
    label: selectRecurringRelations(document, "labels"),
    place: selectRecurringRelations(document, "places"),
    person: selectRecurringRelations(document, "peoples"),
  };
  const relationIcons: Record<Relation, FilledIconName> = {
    budget: "piggy-bank",
    label: "tag",
    place: "map-marker",
    person: "account",
  };
  const startAt = new Date(draft.startAt);
  const typeTone = getTransactionTypeTone(draft.type, c);
  const parsedAmount = Number(draft.amount.replace(",", "."));
  const hasAmount = Number.isFinite(parsedAmount) && parsedAmount > 0;
  const color = /^#[a-f\d]{6}$/i.test(draft.color) ? draft.color : "#70d2eb";
  const currency = currencies.find((item) => item.code === draft.currencyCode);

  function update(next: (current: RecurringDraft) => RecurringDraft) {
    setDraft(next);
    setError("");
  }
  const change = <K extends keyof RecurringDraft>(
    key: K,
    value: RecurringDraft[K],
  ) => update((current) => ({ ...current, [key]: value }));
  const back = () =>
    router.canGoBack() ? router.back() : router.replace("/recurring");
  function updateDateTime(
    mode: Exclude<typeof datePicker, null>,
    selected: Date,
  ) {
    const field = mode === "end" ? "endAt" : "startAt";
    const current = new Date(
      mode === "end" ? (draft.endAt ?? draft.startAt) : draft.startAt,
    );
    const next = new Date(current);
    if (mode === "time") {
      next.setHours(selected.getHours(), selected.getMinutes(), 0, 0);
    } else {
      next.setFullYear(
        selected.getFullYear(),
        selected.getMonth(),
        selected.getDate(),
      );
    }
    change(field, next.toISOString());
    if (Platform.OS === "android") setDatePicker(null);
  }
  function chooseReminder(days: (typeof REMINDER_OPTIONS)[number]) {
    void (async () => {
      try {
        if (days !== null) await requestRecurringReminderPermission();
        change("reminderDays", days);
      } catch (reason) {
        setError(
          reason instanceof Error ? reason.message : t("recurring.error"),
        );
      }
    })();
  }
  async function save() {
    if (saving.current) return;
    saving.current = true;
    setBusy(true);
    setError("");
    Keyboard.dismiss();
    try {
      await updateDocument((current) =>
        saveRecurring(
          current,
          namedDraft,
          recurringId,
          activeProfile.id,
          new Date().toISOString(),
          !!editId,
        ),
      );
      // Catch-up is awaited by its provider and reports errors without undoing the saved schedule.
      await reconcileRecurringPayments().catch(() => undefined);
      back();
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : t("recurring.error"));
    } finally {
      saving.current = false;
      setBusy(false);
    }
  }

  const reminderLabel = (days: number | null) =>
    t(
      days === null
        ? "recurring.noReminder"
        : days === 0
          ? "recurring.reminderAt"
          : "recurring.reminderBefore",
      { count: days ?? 0 },
    );
  const androidDateTimePicker =
    Platform.OS === "android" && datePicker ? (
      <DateTimePicker
        accentColor={c.accent}
        display="default"
        mode={datePicker === "time" ? "time" : "date"}
        is24Hour={calendars[0]?.uses24hourClock !== false}
        presentation="dialog"
        value={
          new Date(
            datePicker === "end"
              ? (draft.endAt ?? draft.startAt)
              : draft.startAt,
          )
        }
        onValueChange={(_, value) => updateDateTime(datePicker, value)}
        onDismiss={() => setDatePicker(null)}
      />
    ) : null;
  const activeRelation = relationSheet
    ? {
        title: t(`recurring.${relationSheet}`),
        options: relationOptions[relationSheet],
        selectedId: draft[relationSheet],
      }
    : null;

  return (
    <>
      <RecurringEditorShell
        title={t(editId ? "recurring.edit" : "recurring.create")}
        value={draft.type}
        options={[
          { label: t("recurring.expense"), value: 0 },
          { label: t("recurring.income"), value: 1 },
        ]}
        busy={busy}
        onChange={(value) =>
          update((d) => ({ ...d, type: value === 1 ? 1 : 0, category: "" }))
        }
        onBack={back}
        bottomOverlay={
          <RecurringAction
            label={t(
              busy
                ? "recurring.processing"
                : editId
                  ? "recurring.update"
                  : "recurring.save",
            )}
            busy={busy || (!!editId && !existing)}
            ready={isReady}
            icon={editId ? "save" : "event-repeat"}
            error={error}
            onPress={save}
          />
        }
      >
        {!!editId && !existing ? (
          <Text className="text-danger">{t("recurring.missing")}</Text>
        ) : (
          <View className="-mt-2 gap-3">
            {/* Hero: what repeats, and how much. */}
            <View
              style={[
                styles.hero,
                {
                  backgroundColor: c.surface,
                  borderColor: hasAmount
                    ? colorWithAlpha(typeTone, c.isDark ? 0.42 : 0.3)
                    : c.border,
                },
              ]}
            >
              <LinearGradient
                colors={[
                  colorWithAlpha(typeTone, c.isDark ? 0.14 : 0.09),
                  colorWithAlpha(typeTone, 0),
                ]}
                end={{ x: 0.8, y: 1 }}
                pointerEvents="none"
                start={{ x: 0, y: 0 }}
                style={StyleSheet.absoluteFill}
              />
              <View className="flex-row items-center gap-3.5">
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel={t("recurring.icon")}
                  onPress={() => {
                    Keyboard.dismiss();
                    setSheet("icon");
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
                  <FormLabel>{t("recurring.name")}</FormLabel>
                  <FieldInput
                    accessibilityLabel={t("recurring.name")}
                    placeholder={fallbackName || t("recurring.name")}
                    value={draft.name}
                    maxLength={100}
                    onChangeText={(v) => change("name", v)}
                    style={styles.nameInput}
                  />
                </View>
              </View>
              <FormDivider />
              <View className="gap-1">
                <FormLabel>{t("recurring.amount")}</FormLabel>
                <View className="flex-row items-center gap-2">
                  <Text
                    accessibilityElementsHidden
                    importantForAccessibility="no"
                    style={[styles.sign, { color: typeTone }]}
                  >
                    {getTransactionTypeVisual(draft.type).symbol}
                  </Text>
                  <TextInput
                    accessibilityLabel={t("recurring.amount")}
                    placeholder="0.00"
                    placeholderTextColor={colorWithAlpha(c.foreground, 0.2)}
                    selectionColor={typeTone}
                    keyboardType="decimal-pad"
                    value={draft.amount}
                    onChangeText={(v) => change("amount", v)}
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
                    accessibilityLabel={`${t("recurring.currency")}: ${draft.currencyCode}`}
                    onPress={() => {
                      Keyboard.dismiss();
                      setSheet("currency");
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
                {draft.currencyCode !== activeProfile.currencyCode && (
                  <FormHelp>
                    {t("recurring.currencyHint", {
                      currency: activeProfile.currencyCode,
                    })}
                  </FormHelp>
                )}
              </View>
            </View>

            {/* Same cards and behaviour as a single transaction. */}
            <TransactionCategoryCard
              categories={categories}
              disabled={busy}
              rootCategories={rankRootCategories(
                document,
                categories,
                draft.type,
              )}
              selectedCategoryId={draft.category}
              type={draft.type}
              onAddCategory={() =>
                router.push({
                  pathname: "/categories/create",
                  params: { type: String(draft.type) },
                })
              }
              onSelectCategory={(value) =>
                update((current) =>
                  withCategoryLook(
                    { ...current, category: value },
                    categories.find((item) => item.id === value),
                    lookChosen.current,
                  ),
                )
              }
            />
            <TransactionAccountCard
              accounts={orderAccountsForPicker(accounts)}
              destinationAccountId=""
              disabled={busy}
              selectedAccountId={draft.account}
              type={draft.type}
              onAddAccount={() => router.push("/accounts/create")}
              onSelectAccount={(value) => change("account", value)}
              onSelectDestinationAccount={() => undefined}
              onSwapAccounts={() => undefined}
            />

            <FormCard title={t("recurring.period")} icon="event-repeat">
              <View style={styles.wrap}>
                {RECURRING_PERIODS.map((period) => (
                  <Pill
                    key={period}
                    selected={draft.period === period}
                    label={t(`recurring.periods.${period}`)}
                    onPress={() => change("period", period)}
                  />
                ))}
              </View>
              <View className="flex-row gap-2">
                {(["start", "time"] as const).map((key) => (
                  <Pressable
                    key={key}
                    accessibilityRole="button"
                    accessibilityLabel={`${t(`recurring.${key}`)}, ${
                      key === "start"
                        ? formatDate(startAt)
                        : formatTransactionTime(
                            startAt,
                            i18n.resolvedLanguage,
                            calendars[0]?.uses24hourClock,
                          )
                    }`}
                    onPress={() => {
                      Keyboard.dismiss();
                      setDatePicker(key);
                    }}
                    className="min-h-16 flex-1 justify-center gap-0.5 rounded-2xl px-4 py-3"
                    style={({ pressed }) => ({
                      backgroundColor: c.surfaceSecondary,
                      opacity: pressed ? 0.72 : 1,
                      ...CONTINUOUS,
                    })}
                  >
                    <View className="flex-row items-center gap-1.5">
                      <FilledIcon
                        name={key === "start" ? "calendar" : "clock"}
                        size={14}
                        tone="muted"
                      />
                      <Text className="font-manrope-semibold text-[12px] text-muted">
                        {t(`recurring.${key}`)}
                      </Text>
                    </View>
                    <Text
                      className="font-manrope-bold text-[17px] text-foreground"
                      style={TABULAR}
                    >
                      {key === "start"
                        ? formatDate(startAt)
                        : formatTransactionTime(
                            startAt,
                            i18n.resolvedLanguage,
                            calendars[0]?.uses24hourClock,
                          )}
                    </Text>
                    <DateTimePopover
                      accentColor={c.accent}
                      isDark={c.isDark}
                      isPresented={datePicker === key}
                      mode={key === "time" ? "time" : "date"}
                      title={t(`recurring.${key}`)}
                      value={startAt}
                      onDismiss={() => {
                        if (datePicker === key) setDatePicker(null);
                      }}
                      onValueChange={(value) => updateDateTime(key, value)}
                    />
                  </Pressable>
                ))}
              </View>
              <View className="gap-2">
                <FormLabel>{t("recurring.end")}</FormLabel>
                <View style={styles.wrap}>
                  <Pill
                    selected={!draft.endAt}
                    label={t("recurring.noEnd")}
                    onPress={() => change("endAt", null)}
                  />
                  <Pill
                    selected={!!draft.endAt}
                    label={
                      draft.endAt
                        ? formatDate(new Date(draft.endAt))
                        : t("recurring.end")
                    }
                    icon="calendar"
                    onPress={() => {
                      Keyboard.dismiss();
                      setDatePicker("end");
                    }}
                  >
                    <DateTimePopover
                      accentColor={c.accent}
                      isDark={c.isDark}
                      isPresented={datePicker === "end"}
                      mode="date"
                      title={t("recurring.end")}
                      value={new Date(draft.endAt ?? draft.startAt)}
                      onDismiss={() => {
                        if (datePicker === "end") setDatePicker(null);
                      }}
                      onValueChange={(value) => updateDateTime("end", value)}
                    />
                  </Pill>
                </View>
              </View>
            </FormCard>

            <FormCard>
              <SwitchRow
                icon="history"
                title={t("recurring.automatic")}
                description={t("recurring.automaticHint")}
                value={draft.automatic}
                disabled={busy}
                onChange={(value) => change("automatic", value)}
              />
              <FormDivider />
              <View className="gap-2.5">
                <View className="flex-row items-center gap-2">
                  <FilledIcon name="bell" size={16} tone="muted" />
                  <FormLabel>{t("recurring.reminder")}</FormLabel>
                </View>
                <View style={styles.wrap}>
                  {REMINDER_OPTIONS.map((days) => (
                    <Pill
                      key={String(days)}
                      selected={draft.reminderDays === days}
                      label={reminderLabel(days)}
                      onPress={() => chooseReminder(days)}
                    />
                  ))}
                </View>
              </View>
            </FormCard>

            <FormCard>
              <View style={styles.wrap}>
                {(["budget", "label", "place", "person"] as const)
                  .filter(
                    (key) =>
                      relationOptions[key].length > 0 || Boolean(draft[key]),
                  )
                  .map((key) => {
                    const selected = relationOptions[key].find(
                      (option) => option.id === draft[key],
                    );
                    return (
                      <RelationChip
                        key={key}
                        title={t(`recurring.${key}`)}
                        icon={relationIcons[key]}
                        selected={selected}
                        onOpen={() => {
                          Keyboard.dismiss();
                          setRelationSheet(key);
                        }}
                        onClear={() => change(key, "")}
                      />
                    );
                  })}
              </View>
              <FieldInput
                accessibilityLabel={t("recurring.description")}
                placeholder={t("recurring.description")}
                value={draft.description}
                onChangeText={(v) => change("description", v)}
                multiline
                textAlignVertical="top"
                style={styles.notes}
              />
            </FormCard>

            <FormCard title={t("recurring.colors")} icon="format-paint">
              <BudgetColorPicker
                value={draft.color}
                onChange={(v) => {
                  lookChosen.current = true;
                  change("color", v);
                }}
              />
            </FormCard>

            <View className="px-2">
              <FormHelp>{t("recurring.scheduleHint")}</FormHelp>
            </View>
          </View>
        )}
      </RecurringEditorShell>
      <CurrencySelectorSheet
        currencies={currencies}
        isOpen={sheet === "currency"}
        selectedCode={draft.currencyCode}
        onOpenChange={(open) => !open && setSheet(null)}
        onSelect={(v) => {
          change("currencyCode", v.code);
          setSheet(null);
        }}
      />
      {sheet === "icon" && (
        <IconPicker
          selected={{ name: draft.icon, pathData: draft.iconPath }}
          onSelect={(v) => {
            lookChosen.current = true;
            update((d) => ({
              ...d,
              icon: v.name,
              iconPath: v.pathData ?? null,
            }));
            setSheet(null);
          }}
          onClose={() => setSheet(null)}
        />
      )}
      {activeRelation && relationSheet ? (
        <TransactionOptionPickerSheet
          options={activeRelation.options}
          selectedId={activeRelation.selectedId}
          title={activeRelation.title}
          onDismiss={() => setRelationSheet(null)}
          onSelect={(value) => change(relationSheet, value)}
        />
      ) : null}
      {androidDateTimePicker}
    </>
  );
}

/** A one-tap choice; the chosen one fills with the accent. */
function Pill({
  selected,
  label,
  icon,
  onPress,
  children,
}: {
  selected: boolean;
  label: string;
  icon?: FilledIconName;
  onPress: () => void;
  children?: ReactNode;
}) {
  const c = useAppThemeColors();
  return (
    <Pressable
      accessibilityRole="radio"
      accessibilityLabel={label}
      accessibilityState={{ checked: selected }}
      onPress={onPress}
      style={({ pressed }) => [
        styles.pill,
        {
          backgroundColor: selected ? c.accent : c.surfaceSecondary,
          opacity: pressed ? 0.72 : 1,
        },
      ]}
    >
      {icon ? (
        <FilledIcon
          name={icon}
          size={15}
          color={selected ? c.accentForeground : c.muted}
        />
      ) : null}
      <Text
        numberOfLines={1}
        style={[
          styles.pillLabel,
          { color: selected ? c.accentForeground : c.foreground },
        ]}
      >
        {label}
      </Text>
      {children}
    </Pressable>
  );
}

/** Optional links, as on a single transaction: empty chips invite, chosen ones wear their colour. */
function RelationChip({
  title,
  icon,
  selected,
  onOpen,
  onClear,
}: {
  title: string;
  icon: FilledIconName;
  selected: TransactionOption | undefined;
  onOpen: () => void;
  onClear: () => void;
}) {
  const { t } = useTranslation();
  const c = useAppThemeColors();
  if (!selected)
    return (
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={title}
        onPress={onOpen}
        style={({ pressed }) => [
          styles.pill,
          { backgroundColor: c.surfaceSecondary, opacity: pressed ? 0.72 : 1 },
        ]}
      >
        <FilledIcon name={icon} size={15} tone="muted" />
        <Text style={[styles.pillLabel, { color: c.muted }]}>{title}</Text>
        <FilledIcon name="plus" size={14} tone="muted" />
      </Pressable>
    );
  const ink = colorForeground(selected.color);
  return (
    <View
      style={[styles.pill, { backgroundColor: selected.color, paddingEnd: 8 }]}
    >
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={`${title}: ${selected.name}`}
        onPress={onOpen}
        className="flex-row items-center gap-2"
        style={({ pressed }) => ({ flexShrink: 1, opacity: pressed ? 0.72 : 1 })}
      >
        <RecordIcon
          name={selected.icon}
          pathData={selected.iconPath}
          color={ink}
          size={15}
        />
        <Text numberOfLines={1} style={[styles.pillLabel, { color: ink }]}>
          {selected.name}
        </Text>
      </Pressable>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={t("transactions.selection.deselect", {
          name: selected.name,
        })}
        hitSlop={10}
        onPress={onClear}
        style={({ pressed }) => [
          styles.clear,
          {
            backgroundColor: colorWithAlpha(ink, 0.18),
            opacity: pressed ? 0.6 : 1,
          },
        ]}
      >
        <FilledIcon name="close" size={12} color={ink} />
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  hero: {
    borderRadius: 28,
    borderCurve: "continuous",
    borderWidth: 1,
    overflow: "hidden",
    padding: 16,
    gap: 14,
  },
  nameInput: { fontSize: 17, height: 50 },
  sign: {
    fontFamily: "Huninn_400Regular",
    fontSize: 36,
    lineHeight: 44,
    includeFontPadding: false,
  },
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
    paddingHorizontal: 14,
    paddingVertical: 6,
    borderRadius: 22,
    borderCurve: "continuous",
    flexDirection: "row",
    alignItems: "center",
    gap: 7,
  },
  pillLabel: {
    fontFamily: "Huninn_400Regular",
    fontSize: 14,
    lineHeight: 19,
    flexShrink: 1,
  },
  clear: {
    width: 22,
    height: 22,
    borderRadius: 11,
    alignItems: "center",
    justifyContent: "center",
    marginStart: 6,
  },
  notes: {
    height: "auto",
    minHeight: 88,
    paddingVertical: 14,
  },
});
