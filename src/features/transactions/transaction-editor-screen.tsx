import { DateTimePicker } from "@expo/ui/community/datetime-picker";
import { uuid } from "expo";
import { BlurTargetView } from "expo-blur";
import * as ImagePicker from "expo-image-picker";
import { useCalendars } from "expo-localization";
import { useLocalSearchParams, useRouter } from "expo-router";
import { Button } from "heroui-native";
import { useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import {
  Animated,
  I18nManager,
  Keyboard,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  StyleSheet,
  View,
  type ViewInstance,
} from "react-native";
import Reanimated, {
  Easing,
  ReduceMotion,
  useAnimatedStyle,
  useSharedValue,
  withTiming,
} from "react-native-reanimated";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import {
  deleteAttachment,
  getAttachmentFile,
  persistAttachment,
} from "@/data/attachments/attachment-store";
import { useLocalData } from "@/data/local-data-provider";
import { convertCurrency } from "@/data/model/exchange-rate";
import { transactionSnapshot } from "@/data/model/transaction-conversion";
import {
  saveTransaction,
  saveTransactionTemplate,
  transactionDraftFromRecord,
  type TransactionDraft,
  type TransactionType,
} from "@/data/model/transaction-record";
import {
  selectAccounts,
  selectAppPreferences,
  selectBudgets,
  selectCategories,
} from "@/data/selectors/document-selectors";
import { selectExchangeRates } from "@/data/selectors/exchange-rate-selectors";
import { CurrencySelectorSheet } from "@/features/profile/components/currency-selector-sheet";
import { currencies } from "@/features/profile/data/currencies-data";
import { useProfiles } from "@/features/profile/profile-provider";
import { useAppLocalization } from "@/localization/localization-provider";
import { colorWithAlpha, useAppThemeColors } from "@/shared/theme/app-theme";
import { AppAlert } from "@/shared/ui/app-alert";
import { BottomSheet } from "@/shared/ui/app-bottom-sheet";
import { AppBottomSheetPortal } from "@/shared/ui/app-bottom-sheet-portal";
import { Text } from "@/shared/ui/app-text";
import { FilledIcon } from "@/shared/ui/filled-icon";
import { GlassSegmentedControl } from "@/shared/ui/glass-segmented-control";
import {
  BottomSafeAreaGradient,
  TopSafeAreaGradient,
} from "@/shared/ui/safe-area-gradients";
import { useBottomSheetInitialPositionFix } from "@/shared/ui/use-bottom-sheet-initial-position-fix";

import { TransactionExtrasSection } from "./components/transaction-extras-section";
import {
  TransactionAccountCard,
  TransactionCategoryCard,
} from "./components/transaction-flow-section";
import { TransactionHeroCard } from "./components/transaction-hero-card";
import { TransactionScheduleSection } from "./components/transaction-schedule-section";
import type { TransactionOption } from "./components/transaction-selection-section";
import {
  applyQuickDatePreset,
  fallbackTransactionName,
  getTransactionTypeVisual,
  isTransactionDraftReady,
  localizeBudgetPeriod,
  mapTransactionSaveError,
  orderAccountsForPicker,
  parseTransactionAmount,
  rankRootCategories,
  recordOptions,
  resolveAccountSelectionUpdate,
  resolveInitialTransactionDraft,
  resolveUses24HourClock,
} from "./transaction-form-helpers";

type SaveMode = "transaction" | "another" | "template";
type DatePickerMode = "date" | "time" | null;

export function TransactionEditorScreen({ editId }: { editId?: string }) {
  const { t } = useTranslation();
  const calendars = useCalendars();
  const uses24Hour = resolveUses24HourClock(calendars[0]?.uses24hourClock);
  const { direction } = useAppLocalization();
  const router = useRouter();
  const params = useLocalSearchParams<{
    copyId?: string;
    budgetId?: string;
    type?: string;
  }>();
  const insets = useSafeAreaInsets();
  const theme = useAppThemeColors();
  const { document, ensureExchangeRates, updateDocument } = useLocalData();
  const { activeProfile } = useProfiles();
  const [profileId] = useState(activeProfile.id);

  const typeOptions = [
    { label: t("transactions.common.types.expense"), value: 0 as const },
    { label: t("transactions.common.types.income"), value: 1 as const },
    { label: t("transactions.common.types.transfer"), value: 2 as const },
  ];

  const sourceId = editId ?? params.copyId;
  const [sourceDraft] = useState(() =>
    sourceId ? transactionDraftFromRecord(document, sourceId) : null,
  );
  const [isEditingRecord, setIsEditingRecord] = useState(Boolean(editId));

  const accounts = selectAccounts(document);
  const categories = selectCategories(document);
  const budgets = selectBudgets(document);
  const preferences = selectAppPreferences(document);
  const presetBudget =
    !sourceId && params.budgetId
      ? budgets.find((budget) => budget.id === params.budgetId)
      : null;
  const defaultAccount =
    accounts.find((account) => account.isDefault) ?? accounts[0];

  const [draft, setDraft] = useState<TransactionDraft>(() =>
    resolveInitialTransactionDraft({
      sourceDraft,
      isCopy: Boolean(params.copyId),
      presetBudget,
      accounts,
      defaultAccount,
      paramType: params.type,
      activeProfileCurrencyCode: activeProfile.currencyCode,
    }),
  );

  const [pendingReceipt, setPendingReceipt] = useState<{
    uri: string;
    mimeType: string;
  } | null>(null);
  const [datePickerMode, setDatePickerMode] = useState<DatePickerMode>(null);
  const [actionMenuOpen, setActionMenuOpen] = useState(false);
  const { bindSheet: bindActionSheet, ...actionSheetInitialPositionFix } =
    useBottomSheetInitialPositionFix(actionMenuOpen);
  const [currencySheetOpen, setCurrencySheetOpen] = useState(false);
  const [currencyRateLoading, setCurrencyRateLoading] = useState(false);
  const [currencyRateError, setCurrencyRateError] = useState("");
  const [currencyRateNotice, setCurrencyRateNotice] = useState("");
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [isSaving, setIsSaving] = useState(false);
  const [headerHidden, setHeaderHidden] = useState(false);

  const saving = useRef(false);
  const currencyRequest = useRef(0);
  const transactionId = useRef(editId ?? uuid.v4());
  const blurTargetRef = useRef<ViewInstance | null>(null);
  const [scrollY] = useState(() => new Animated.Value(0));

  useEffect(() => {
    let wasHidden = false;
    const listener = scrollY.addListener(({ value }) => {
      const hidden = value >= 40;
      if (hidden !== wasHidden) {
        wasHidden = hidden;
        setHeaderHidden(hidden);
      }
    });
    return () => scrollY.removeListener(listener);
  }, [scrollY]);

  const occurredAt = new Date(draft.occurredAt);
  const safeOccurredAt = Number.isFinite(occurredAt.getTime())
    ? occurredAt
    : new Date();
  const selectedAccount = accounts.find(
    (account) => account.id === draft.accountId,
  );
  const destinationAccount = accounts.find(
    (account) => account.id === draft.destinationAccountId,
  );
  const selectedCategory =
    categories.find((category) => category.id === draft.categoryId) ?? null;

  const transactionCurrencyCode =
    draft.currencyCode ||
    selectedAccount?.currencyCode ||
    activeProfile.currencyCode.toUpperCase();
  const accountCurrencyCode =
    selectedAccount?.currencyCode ?? draft.accountCurrencyCode;

  const enteredAmount = parseTransactionAmount(draft.amount);
  let convertedAccountAmount: number | null = null;
  if (
    Number.isFinite(enteredAmount) &&
    enteredAmount > 0 &&
    draft.exchangeRate &&
    accountCurrencyCode
  ) {
    try {
      convertedAccountAmount = convertCurrency(
        enteredAmount,
        draft.exchangeRate,
        accountCurrencyCode,
      );
    } catch {
      convertedAccountAmount = null;
    }
  }

  const typeNamePlaceholder =
    draft.type === 0
      ? t("transactions.form.namePlaceholders.expense")
      : draft.type === 1
        ? t("transactions.form.namePlaceholders.income")
        : t("transactions.form.namePlaceholders.transfer");
  // An empty name is saved as the category (or the transfer route); the
  // placeholder shows that name, so what gets saved is always visible.
  const fallbackName = fallbackTransactionName({
    type: draft.type,
    categoryName: selectedCategory?.name,
    fromName: selectedAccount?.name,
    toName: destinationAccount?.name,
    arrow: I18nManager.isRTL ? "←" : "→",
  });
  const transactionNamePlaceholder = fallbackName || typeNamePlaceholder;
  const savedName = draft.name.trim() || fallbackName;
  const pickerAccounts = orderAccountsForPicker(accounts);
  const rootCategories = rankRootCategories(document, categories, draft.type);
  const isReady = isTransactionDraftReady({
    draft,
    name: savedName,
    hasAccount: Boolean(selectedAccount),
    hasDestination: Boolean(destinationAccount),
    rateLoading: currencyRateLoading,
  });

  const budgetOptions: TransactionOption[] = budgets
    .filter((budget) => budget.transactionType === draft.type)
    .map((budget) => ({
      id: budget.id,
      name: budget.name,
      description: t("transactions.common.budgetDescription", {
        period: localizeBudgetPeriod(budget.period, t),
        currency: budget.currencyCode,
      }),
      icon: budget.icon,
      iconPath: budget.iconPath,
      color: budget.color,
    }));

  const labelOptions = recordOptions(
    document.labels,
    profileId,
    document,
    "check",
    "#70d2eb",
    t("transactions.common.untitledOption"),
  );
  const loanOptions = recordOptions(
    document.loans,
    profileId,
    document,
    "credit-card",
    "#f2c66d",
    t("transactions.common.untitledOption"),
  );
  const placeOptions = recordOptions(
    document.places,
    profileId,
    document,
    "home",
    "#78d6a3",
    t("transactions.common.untitledOption"),
  );
  const personOptions = recordOptions(
    document.peoples,
    profileId,
    document,
    "account",
    "#b89cf5",
    t("transactions.common.untitledOption"),
  );

  const topControlsTranslateY = scrollY.interpolate({
    inputRange: [0, 56],
    outputRange: [0, -56],
    extrapolate: "clamp",
  });
  const headerOpacity = scrollY.interpolate({
    inputRange: [0, 40],
    outputRange: [1, 0],
    extrapolate: "clamp",
  });

  const receiptUri =
    pendingReceipt?.uri ??
    (() => {
      if (!draft.receiptPath) return null;
      try {
        return getAttachmentFile(draft.receiptPath).uri;
      } catch {
        return null;
      }
    })();

  const missingSource = Boolean(sourceId) && !sourceDraft;

  function change<K extends keyof TransactionDraft>(
    key: K,
    value: TransactionDraft[K],
  ) {
    setDraft((current) => ({ ...current, [key]: value }));
    setError("");
    setNotice("");
  }

  function changeType(type: TransactionType) {
    setDraft((current) => ({
      ...current,
      type,
      categoryId: "",
      budgetId: "",
      destinationAccountId: type === 2 ? current.destinationAccountId : "",
      ...(type === 2 && selectedAccount
        ? {
            currencyCode: selectedAccount.currencyCode,
            accountCurrencyCode: selectedAccount.currencyCode,
            exchangeRate: null,
            exchangeRateDate: null,
            exchangeRateFetchedAt: null,
            exchangeRateSource: null,
          }
        : {}),
    }));
    currencyRequest.current += 1;
    setCurrencyRateLoading(false);
    setCurrencyRateError("");
    setCurrencyRateNotice("");
    setError("");
    setNotice("");
  }

  function selectAccount(accountId: string) {
    const account = accounts.find((item) => item.id === accountId);
    currencyRequest.current += 1;
    setCurrencyRateLoading(false);
    setCurrencyRateError("");
    setCurrencyRateNotice("");
    setDraft((current) =>
      resolveAccountSelectionUpdate(current, account, accounts),
    );
    setError("");
    setNotice("");
  }

  function swapTransferAccounts() {
    if (!selectedAccount || !destinationAccount) return;
    setDraft((current) => ({
      ...current,
      accountId: destinationAccount.id,
      destinationAccountId: selectedAccount.id,
      currencyCode: destinationAccount.currencyCode,
      accountCurrencyCode: destinationAccount.currencyCode,
    }));
    setError("");
    setNotice("");
  }

  async function selectCurrency(code: string) {
    if (!selectedAccount || draft.type === 2) return;
    const accountCode = selectedAccount.currencyCode.toUpperCase();
    const selectedCode = code.toUpperCase();
    const request = currencyRequest.current + 1;
    currencyRequest.current = request;
    setCurrencyRateError("");
    setCurrencyRateNotice("");
    setDraft((current) => ({
      ...current,
      currencyCode: selectedCode,
      accountCurrencyCode: accountCode,
      exchangeRate: null,
      exchangeRateDate: null,
      exchangeRateFetchedAt: null,
      exchangeRateSource: null,
      conversionSnapshot: null,
    }));
    if (selectedCode === accountCode) {
      setCurrencyRateLoading(false);
      return;
    }
    setCurrencyRateLoading(true);
    try {
      const snapshot = await ensureExchangeRates(selectedCode);
      if (request !== currencyRequest.current) return;
      const rate = snapshot.rates[accountCode];
      if (!rate) throw new Error("Missing exchange rate");
      setDraft((current) =>
        current.currencyCode === selectedCode &&
        current.accountCurrencyCode === accountCode
          ? {
              ...current,
              exchangeRate: rate,
              exchangeRateDate: snapshot.date,
              exchangeRateFetchedAt: snapshot.fetchedAt,
              exchangeRateSource: snapshot.source,
              conversionSnapshot: snapshot,
            }
          : current,
      );
    } catch {
      if (request !== currencyRequest.current) return;
      const saved = selectExchangeRates(document, selectedCode);
      const rate = saved?.rates[accountCode];
      if (saved && rate) {
        setDraft((current) =>
          current.currencyCode === selectedCode &&
          current.accountCurrencyCode === accountCode
            ? {
                ...current,
                exchangeRate: rate,
                exchangeRateDate: saved.date,
                exchangeRateFetchedAt: saved.fetchedAt,
                exchangeRateSource: saved.source,
                conversionSnapshot: saved,
              }
            : current,
        );
        setCurrencyRateNotice(
          t("transactions.form.currencyRateCached", { date: saved.date }),
        );
      } else {
        setCurrencyRateError(t("transactions.form.currencyRateUnavailable"));
      }
    } finally {
      if (request === currencyRequest.current) setCurrencyRateLoading(false);
    }
  }

  function goBack() {
    if (saving.current) return;
    if (router.canGoBack()) router.back();
    else router.replace("/");
  }

  function updateDateTime(mode: Exclude<DatePickerMode, null>, selected: Date) {
    if (Platform.OS === "android") setDatePickerMode(null);
    const next = new Date(safeOccurredAt);
    if (mode === "date") {
      next.setFullYear(
        selected.getFullYear(),
        selected.getMonth(),
        selected.getDate(),
      );
    } else {
      next.setHours(selected.getHours(), selected.getMinutes(), 0, 0);
    }
    const now = new Date();
    change(
      "occurredAt",
      (next.getTime() > now.getTime() ? now : next).toISOString(),
    );
  }

  function handleQuickDatePreset(preset: "today" | "yesterday") {
    const next = applyQuickDatePreset(safeOccurredAt, preset);
    change("occurredAt", next.toISOString());
  }

  async function pickReceipt() {
    Keyboard.dismiss();
    try {
      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ["images"],
        allowsEditing: false,
        quality: 0.9,
      });
      if (result.canceled) return;
      const asset = result.assets[0];
      if (asset.fileSize && asset.fileSize > 25 * 1024 * 1024)
        throw new Error(t("transactions.form.receiptTooLarge"));
      setPendingReceipt({
        uri: asset.uri,
        mimeType: asset.mimeType ?? "image/jpeg",
      });
      setDraft((current) => ({
        ...current,
        receiptPath: null,
        receiptAttachmentId: null,
      }));
      setError("");
    } catch (reason) {
      const message =
        reason instanceof Error
          ? reason.message
          : t("transactions.form.receiptSelectError");
      setError(message);
      AppAlert.alert(t("transactions.form.receiptSelectErrorTitle"), message);
    }
  }

  async function persist(mode: SaveMode) {
    if (saving.current) return;
    saving.current = true;
    setIsSaving(true);
    setError("");
    setNotice("");
    setActionMenuOpen(false);
    Keyboard.dismiss();
    const namedDraft: TransactionDraft = { ...draft, name: savedName };
    let pendingAttachmentPath: string | null = null;
    let attachmentCommitted = false;
    try {
      if (mode === "template") {
        const id = uuid.v4();
        await updateDocument((current) => {
          if (current._local.selectedProfileId !== profileId)
            throw new Error(t("transactions.form.activeProfileChanged"));
          return saveTransactionTemplate(
            current,
            namedDraft,
            id,
            profileId,
            new Date().toISOString(),
          );
        });
        router.dismissTo("/");
        return;
      }

      const attachment = pendingReceipt
        ? await persistAttachment(pendingReceipt.uri, pendingReceipt.mimeType)
        : null;
      pendingAttachmentPath = attachment?.relativePath ?? null;
      let preparedDraft: TransactionDraft = attachment
        ? {
            ...namedDraft,
            receiptPath: attachment.relativePath,
            receiptAttachmentId: attachment.id,
          }
        : namedDraft;

      const base = (
        draft.type === 2 ? accountCurrencyCode : transactionCurrencyCode
      ).toUpperCase();
      const linkedBankId = selectedAccount?.linkedBankAccountId;
      const linkedBank = linkedBankId
        ? document.accounts.find(
            (account) =>
              account.uuid === linkedBankId ||
              String(account.id) === linkedBankId,
          )
        : undefined;
      const targetCodes = [
        activeProfile.currencyCode.toUpperCase(),
        accountCurrencyCode,
        String(linkedBank?.currencyCode ?? base).toUpperCase(),
      ];
      const captured = transactionSnapshot({
        conversionSnapshot: preparedDraft.conversionSnapshot ?? null,
      });
      if (
        targetCodes.some((code) => code !== base) &&
        (!captured ||
          !captured.rates[base] ||
          targetCodes.some((code) => !captured.rates[code]))
      ) {
        let snapshot;
        try {
          snapshot = await ensureExchangeRates(base);
        } catch {
          snapshot = selectExchangeRates(document, base);
          if (!snapshot)
            throw new Error(t("transactions.form.currencyRateUnavailable"));
          setCurrencyRateNotice(
            t("transactions.form.currencyRateCached", { date: snapshot.date }),
          );
        }
        if (targetCodes.some((code) => !snapshot.rates[code]))
          throw new Error(t("transactions.form.currencyRateUnavailable"));
        preparedDraft = {
          ...preparedDraft,
          conversionSnapshot: snapshot,
          ...(!isEditingRecord && base !== accountCurrencyCode
            ? {
                exchangeRate: snapshot.rates[accountCurrencyCode],
                exchangeRateDate: snapshot.date,
                exchangeRateFetchedAt: snapshot.fetchedAt,
                exchangeRateSource: snapshot.source,
              }
            : {}),
        };
      }

      const id = transactionId.current;
      const now = new Date().toISOString();
      const editingNow = isEditingRecord;
      await updateDocument((current) => {
        if (current._local.selectedProfileId !== profileId)
          throw new Error(t("transactions.form.activeProfileChanged"));
        const saved = saveTransaction(
          current,
          preparedDraft,
          id,
          profileId,
          now,
          editingNow,
        );
        return attachment
          ? {
              ...saved,
              _local: {
                ...saved._local,
                attachments: [...saved._local.attachments, attachment],
              },
            }
          : saved;
      });
      attachmentCommitted = true;
      if (
        sourceDraft?.receiptPath &&
        sourceDraft.receiptPath !== preparedDraft.receiptPath
      ) {
        try {
          deleteAttachment(sourceDraft.receiptPath);
        } catch {}
      }

      if (mode === "another") {
        transactionId.current = uuid.v4();
        setIsEditingRecord(false);
        setPendingReceipt(null);
        setDraft((current) => ({
          ...current,
          name: "",
          conversionSnapshot: null,
          amount: "",
          description: "",
          occurredAt: new Date().toISOString(),
          receiptPath: null,
          receiptAttachmentId: null,
        }));
        setNotice(t("transactions.form.savedAddNext"));
        return;
      }

      if (editingNow && router.canGoBack()) router.back();
      else router.dismissTo("/");
    } catch (reason) {
      if (pendingAttachmentPath && !attachmentCommitted) {
        try {
          deleteAttachment(pendingAttachmentPath);
        } catch {}
      }
      const message = mapTransactionSaveError(reason, t);
      setError(message);
      AppAlert.alert(t("transactions.form.saveErrorTitle"), message);
    } finally {
      saving.current = false;
      setIsSaving(false);
    }
  }

  return (
    <View style={[styles.fill, { backgroundColor: theme.background }]}>
      <KeyboardAvoidingView
        behavior={Platform.OS === "ios" ? "padding" : "height"}
        style={styles.fill}
      >
        <View style={styles.fill}>
          <BlurTargetView ref={blurTargetRef} style={styles.fill}>
            <Animated.ScrollView
              contentContainerStyle={{
                paddingBottom: 148 + insets.bottom,
              }}
              keyboardDismissMode="on-drag"
              keyboardShouldPersistTaps="handled"
              scrollEventThrottle={16}
              showsVerticalScrollIndicator={false}
              onScroll={Animated.event(
                [{ nativeEvent: { contentOffset: { y: scrollY } } }],
                { useNativeDriver: true },
              )}
            >
              <View style={[styles.headerSpace, { height: 56 + insets.top }]} />
              <View style={styles.selectorSpace} />

              <View
                // Toggling pointerEvents flips whether Fabric can flatten this
                // view away. Unflattening it mid-save reparents every child at
                // once and crashes the Android mounting layer with "addViewAt:
                // ... the specified child already has a parent".
                collapsable={false}
                pointerEvents={isSaving ? "none" : "auto"}
                style={[styles.formStack, { direction }]}
              >
                {missingSource ? (
                  <View className="rounded-2xl border border-danger/30 bg-danger/10 p-4">
                    <Text className="font-manrope-semibold text-sm text-danger">
                      {t("transactions.form.unavailable")}
                    </Text>
                  </View>
                ) : null}

                <TransactionHeroCard
                  accountCurrencyCode={accountCurrencyCode}
                  amount={draft.amount}
                  canChangeCurrency={draft.type !== 2 && Boolean(selectedAccount)}
                  convertedAccountAmount={convertedAccountAmount}
                  currencyRateError={currencyRateError}
                  currencyRateLoading={currencyRateLoading}
                  currencyRateNotice={currencyRateNotice}
                  disabled={isSaving}
                  exchangeRate={draft.exchangeRate}
                  exchangeRateDate={draft.exchangeRateDate}
                  name={draft.name}
                  namePlaceholder={transactionNamePlaceholder}
                  selectedCategory={selectedCategory}
                  showConversion={
                    Boolean(selectedAccount) &&
                    transactionCurrencyCode !== accountCurrencyCode
                  }
                  transactionCurrencyCode={transactionCurrencyCode}
                  type={draft.type}
                  autoFocusAmount={!sourceId}
                  onChangeAmount={(value) => change("amount", value)}
                  onChangeName={(value) => change("name", value)}
                  onOpenCurrencyPicker={() => setCurrencySheetOpen(true)}
                />

                {/* What for, then from where; a transfer is a route first. */}
                {draft.type === 2 ? (
                  <>
                    <TransactionAccountCard
                    accounts={pickerAccounts}
                    destinationAccountId={draft.destinationAccountId}
                    disabled={isSaving}
                    selectedAccountId={draft.accountId}
                    type={draft.type}
                    onAddAccount={() => router.push("/accounts/create")}
                    onSelectAccount={selectAccount}
                    onSelectDestinationAccount={(value) =>
                      change("destinationAccountId", value)
                    }
                    onSwapAccounts={swapTransferAccounts}
                  />
                    <TransactionCategoryCard
                    categories={categories}
                    disabled={isSaving}
                    rootCategories={rootCategories}
                    selectedCategoryId={draft.categoryId}
                    type={draft.type}
                    onAddCategory={() =>
                      router.push({
                        pathname: "/categories/create",
                        params: { type: String(draft.type) },
                      })
                    }
                    onSelectCategory={(value) => change("categoryId", value)}
                  />
                  </>
                ) : (
                  <>
                    <TransactionCategoryCard
                    categories={categories}
                    disabled={isSaving}
                    rootCategories={rootCategories}
                    selectedCategoryId={draft.categoryId}
                    type={draft.type}
                    onAddCategory={() =>
                      router.push({
                        pathname: "/categories/create",
                        params: { type: String(draft.type) },
                      })
                    }
                    onSelectCategory={(value) => change("categoryId", value)}
                  />
                    <TransactionAccountCard
                    accounts={pickerAccounts}
                    destinationAccountId={draft.destinationAccountId}
                    disabled={isSaving}
                    selectedAccountId={draft.accountId}
                    type={draft.type}
                    onAddAccount={() => router.push("/accounts/create")}
                    onSelectAccount={selectAccount}
                    onSelectDestinationAccount={(value) =>
                      change("destinationAccountId", value)
                    }
                    onSwapAccounts={swapTransferAccounts}
                  />
                  </>
                )}

                <TransactionScheduleSection
                  activePickerMode={Platform.OS === "ios" ? datePickerMode : null}
                  date={safeOccurredAt}
                  dateFormat={preferences.dateFormat}
                  disabled={isSaving}
                  onDismissPicker={(mode) => {
                    if (datePickerMode === mode) setDatePickerMode(null);
                  }}
                  onOpenPicker={(mode) => setDatePickerMode(mode)}
                  onQuickPreset={handleQuickDatePreset}
                  onUpdateDateTime={updateDateTime}
                />

                {Platform.OS === "android" && datePickerMode ? (
                  <DateTimePicker
                    accentColor={theme.accent}
                    display="default"
                    is24Hour={uses24Hour}
                    maximumDate={new Date()}
                    mode={datePickerMode}
                    presentation="dialog"
                    value={safeOccurredAt}
                    onDismiss={() => setDatePickerMode(null)}
                    onValueChange={(_, selected) =>
                      updateDateTime(datePickerMode, selected)
                    }
                  />
                ) : null}

                <TransactionExtrasSection
                  budgetId={draft.budgetId}
                  budgetOptions={budgetOptions}
                  description={draft.description}
                  disabled={isSaving}
                  labelId={draft.labelId}
                  labelOptions={labelOptions}
                  loanId={draft.loanId}
                  loanOptions={loanOptions}
                  personId={draft.personId}
                  personOptions={personOptions}
                  placeId={draft.placeId}
                  placeOptions={placeOptions}
                  receiptUri={receiptUri}
                  type={draft.type}
                  onAddBudget={() => router.push("/budgets/create")}
                  onChangeDescription={(value) => change("description", value)}
                  onPickReceipt={pickReceipt}
                  onRemoveReceipt={() => {
                    setPendingReceipt(null);
                    setDraft((current) => ({
                      ...current,
                      receiptPath: null,
                      receiptAttachmentId: null,
                    }));
                  }}
                  onSelectBudget={(value) => change("budgetId", value)}
                  onSelectLabel={(value) => change("labelId", value)}
                  onSelectLoan={(value) => change("loanId", value)}
                  onSelectPerson={(value) => change("personId", value)}
                  onSelectPlace={(value) => change("placeId", value)}
                />
              </View>
            </Animated.ScrollView>
          </BlurTargetView>

          <TopSafeAreaGradient headerHidden={headerHidden} />

          <View
            collapsable={false}
            pointerEvents={headerHidden ? "none" : "box-none"}
            accessibilityElementsHidden={headerHidden}
            importantForAccessibility={
              headerHidden ? "no-hide-descendants" : "auto"
            }
            style={[styles.headerClip, { top: insets.top }]}
          >
            <Animated.View
              style={[
                styles.headerDock,
                {
                  opacity: headerOpacity,
                  transform: [{ translateY: topControlsTranslateY }],
                },
              ]}
            >
              <Button
                isIconOnly
                variant="ghost"
                accessibilityLabel={t("transactions.form.back")}
                isDisabled={isSaving}
                onPress={goBack}
              >
                <FilledIcon name="arrow-left" size={24} />
              </Button>
              <Text
                accessibilityRole="header"
                numberOfLines={1}
                className="flex-1 font-manrope-bold text-xl text-foreground"
              >
                {isEditingRecord
                  ? t("transactions.form.editTitle")
                  : t("transactions.form.title")}
              </Text>
            </Animated.View>
          </View>

          <Animated.View
            collapsable={false}
            pointerEvents={isSaving ? "none" : "auto"}
            style={[
              styles.selectorDock,
              { top: 64 + insets.top },
              { transform: [{ translateY: topControlsTranslateY }] },
            ]}
          >
            <GlassSegmentedControl
              accessibilityLabel={t("transactions.form.transactionType")}
              blurTarget={blurTargetRef}
              minHeight={Platform.OS === "android" ? 52 : 48}
              options={typeOptions}
              value={draft.type}
              onChange={changeType}
            />
          </Animated.View>

          <BottomSafeAreaGradient />

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
            {!!notice && !error && (
              <Text
                accessibilityLiveRegion="polite"
                className="font-sans text-sm text-accent"
              >
                {notice}
              </Text>
            )}
            <SaveEmphasis ready={isReady && !missingSource}>
            <View style={styles.splitActionRow}>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel={
                  isSaving
                    ? t("transactions.form.savingAccessibility")
                    : isEditingRecord
                      ? t("transactions.form.saveChangesAccessibility")
                      : t("transactions.form.addAccessibility")
                }
                accessibilityState={{
                  busy: isSaving,
                  disabled: isSaving || missingSource,
                }}
                disabled={isSaving || missingSource}
                onPress={() => persist("transaction")}
                android_ripple={{
                  color: colorWithAlpha(theme.accentForeground, 0.16),
                  borderless: false,
                }}
                style={({ pressed }) => [
                  styles.primaryActionButton,
                  { backgroundColor: theme.accent },
                  (isSaving || missingSource) && styles.actionDisabled,
                  Platform.OS === "ios" && pressed && styles.actionPressed,
                ]}
              >
                <FilledIcon
                  name={
                    isEditingRecord
                      ? "save"
                      : getTransactionTypeVisual(draft.type).icon
                  }
                  size={24}
                  tone="accent-foreground"
                />
                <Text
                  numberOfLines={1}
                  className="shrink font-manrope-bold text-[17px] text-accent-foreground"
                >
                  {isSaving
                    ? t("transactions.form.saving")
                    : isEditingRecord
                      ? t("transactions.form.saveChanges")
                      : t("transactions.form.add")}
                </Text>
              </Pressable>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel={t("transactions.form.moreSaveOptions")}
                accessibilityState={{ disabled: isSaving || missingSource }}
                disabled={isSaving || missingSource}
                onPress={() => {
                  Keyboard.dismiss();
                  setActionMenuOpen(true);
                }}
                android_ripple={{
                  color: colorWithAlpha(theme.accentForeground, 0.16),
                  borderless: false,
                }}
                style={({ pressed }) => [
                  styles.secondaryActionButton,
                  { backgroundColor: theme.accent },
                  (isSaving || missingSource) && styles.actionDisabled,
                  Platform.OS === "ios" && pressed && styles.actionPressed,
                ]}
              >
                <FilledIcon
                  name="chevron-up"
                  size={27}
                  tone="accent-foreground"
                />
              </Pressable>
            </View>
            </SaveEmphasis>
          </View>
        </View>
      </KeyboardAvoidingView>

      <BottomSheet isOpen={actionMenuOpen} onOpenChange={setActionMenuOpen}>
        <AppBottomSheetPortal
          isOpen={actionMenuOpen}
          unstable_accessibilityContainerViewIsModal
        >
          <BottomSheet.Overlay />
          <BottomSheet.Content
            ref={bindActionSheet}
            containerStyle={actionSheetInitialPositionFix.containerStyle}
            onChange={actionSheetInitialPositionFix.onChange}
            topInset={insets.top}
            contentContainerClassName="px-5 pb-0 pt-2"
            backgroundClassName="rounded-t-[28px] bg-surface"
          >
            <View
              className="gap-2"
              style={{ paddingBottom: Math.max(insets.bottom, 16) + 12 }}
            >
              <BottomSheet.Title className="px-2 pb-2">
                {t("transactions.form.saveOptions")}
              </BottomSheet.Title>
              <Button
                variant="ghost"
                className="h-16 justify-start"
                onPress={() => persist("another")}
              >
                <FilledIcon name="plus" size={24} tone="accent" />
                <Button.Label>
                  {t("transactions.form.saveAndAddAnother")}
                </Button.Label>
              </Button>
              <Button
                variant="ghost"
                className="h-16 justify-start"
                onPress={() => persist("template")}
              >
                <FilledIcon name="backup" size={24} tone="accent" />
                <Button.Label>
                  {t("transactions.form.saveAsTemplate")}
                </Button.Label>
              </Button>
            </View>
          </BottomSheet.Content>
        </AppBottomSheetPortal>
      </BottomSheet>

      <CurrencySelectorSheet
        currencies={currencies}
        isOpen={currencySheetOpen}
        selectedCode={transactionCurrencyCode}
        onOpenChange={setCurrencySheetOpen}
        onSelect={(currency) => void selectCurrency(currency.code)}
      />
    </View>
  );
}

/**
 * Dimmed until the entry can be saved, then fully lit: readiness is seen,
 * not read. The buttons stay pressable so a tap explains what is missing.
 */
function SaveEmphasis({
  ready,
  children,
}: {
  ready: boolean;
  children: React.ReactNode;
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
  formStack: {
    gap: 14,
    paddingHorizontal: 16,
  },
  headerSpace: { height: 56 },
  selectorSpace: { height: 84 },
  headerClip: {
    position: "absolute",
    top: 0,
    left: 16,
    right: 16,
    height: 56,
    overflow: "hidden",
    zIndex: 20,
  },
  headerDock: {
    height: 56,
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
  },
  selectorDock: {
    position: "absolute",
    top: 64,
    left: 12,
    right: 12,
    zIndex: 20,
  },
  actionDock: {
    position: "absolute",
    left: 0,
    right: 0,
    paddingHorizontal: 12,
    gap: 6,
    zIndex: 20,
  },
  splitActionRow: {
    flexDirection: "row",
    gap: 4,
  },
  primaryActionButton: {
    height: 58,
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 10,
    paddingHorizontal: 16,
    ...Platform.select({
      android: {
        borderTopLeftRadius: 29,
        borderBottomLeftRadius: 29,
        borderTopRightRadius: 8,
        borderBottomRightRadius: 8,
      },
      ios: {
        borderStartStartRadius: 29,
        borderEndStartRadius: 29,
        borderStartEndRadius: 8,
        borderEndEndRadius: 8,
      },
    }),
    overflow: "hidden",
  },
  secondaryActionButton: {
    width: 68,
    height: 58,
    alignItems: "center",
    justifyContent: "center",
    ...Platform.select({
      android: {
        borderTopLeftRadius: 8,
        borderBottomLeftRadius: 8,
        borderTopRightRadius: 29,
        borderBottomRightRadius: 29,
      },
      ios: {
        borderStartStartRadius: 8,
        borderEndStartRadius: 8,
        borderStartEndRadius: 29,
        borderEndEndRadius: 29,
      },
    }),
    overflow: "hidden",
  },
  actionPressed: { opacity: 0.78 },
  actionDisabled: { opacity: 0.5 },
});
