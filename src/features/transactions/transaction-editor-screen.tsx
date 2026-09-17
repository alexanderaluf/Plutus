import {
  TopSafeAreaGradient,
  BottomSafeAreaGradient,
} from "@/shared/ui/safe-area-gradients";
import { formatAppDate } from "@/data/model/onboarding";
import { DateTimePicker } from "@expo/ui/community/datetime-picker";
import { BlurTargetView } from "expo-blur";
import * as ImagePicker from "expo-image-picker";
import { uuid } from "expo-modules-core";
import { useLocalSearchParams, useRouter } from "expo-router";
import { Button, Input } from "heroui-native";
import { BottomSheet } from "@/shared/ui/app-bottom-sheet";
import { useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import {
  Alert,
  Animated,
  Image,
  Keyboard,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  StyleSheet,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import {
  deleteAttachment,
  getAttachmentFile,
  persistAttachment,
} from "@/data/attachments/attachment-store";
import { useLocalData } from "@/data/local-data-provider";
import { AppBottomSheetPortal } from "@/shared/ui/app-bottom-sheet-portal";
import { belongsToProfile, identity } from "@/data/model/category-record";
import { convertCurrency } from "@/data/model/exchange-rate";
import { transactionSnapshot } from "@/data/model/transaction-conversion";
import type { JsonObject } from "@/data/model/json";
import {
  createTransactionDraft,
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
  selectCategoryRootId,
  selectTopLevelCategories,
} from "@/data/selectors/document-selectors";
import { selectExchangeRates } from "@/data/selectors/exchange-rate-selectors";
import { CurrencySelectorSheet } from "@/features/profile/components/currency-selector-sheet";
import { currencies } from "@/features/profile/data/currencies-data";
import { useProfiles } from "@/features/profile/profile-provider";
import { useAppLocalization } from "@/localization/localization-provider";
import { useCurrencyFormat } from "@/shared/lib/use-currency-format";
import { colorWithAlpha, useAppThemeColors } from "@/shared/theme/app-theme";
import { Text } from "@/shared/ui/app-text";
import { DateTimePopover } from "@/shared/ui/date-time-popover";
import { FilledIcon } from "@/shared/ui/filled-icon";
import { GlassSegmentedControl } from "@/shared/ui/glass-segmented-control";
import { useBottomSheetInitialPositionFix } from "@/shared/ui/use-bottom-sheet-initial-position-fix";

import { TransactionCategorySheet } from "./components/transaction-category-sheet";
import {
  TransactionSelectionSection,
  type TransactionOption,
} from "./components/transaction-selection-section";

type SaveMode = "transaction" | "another" | "template";
type DatePickerMode = "date" | "time" | null;
type ExpandedSection =
  | "account"
  | "destination"
  | "category"
  | "budget"
  | "label"
  | "loan"
  | "place"
  | "person";

function recordOptions(
  records: JsonObject[],
  profileId: string,
  document: ReturnType<typeof useLocalData>["document"],
  fallbackIcon: string,
  fallbackColor: string,
  fallbackName: string,
): TransactionOption[] {
  return records
    .filter(
      (record) =>
        identity(record) && belongsToProfile(document, record, profileId),
    )
    .map((record) => ({
      id: identity(record),
      name: typeof record.name === "string" ? record.name : fallbackName,
      description:
        typeof record.description === "string" ? record.description : "",
      icon: typeof record.icon === "string" ? record.icon : fallbackIcon,
      iconPath: typeof record.iconPath === "string" ? record.iconPath : null,
      color:
        typeof record.color === "string" && /^#[a-f\d]{6}$/i.test(record.color)
          ? record.color
          : fallbackColor,
    }));
}

function formatTransactionTime(value: Date, locale?: string) {
  return value.toLocaleTimeString(locale, {
    hour: "2-digit",
    minute: "2-digit",
  });
}

export function TransactionEditorScreen({ editId }: { editId?: string }) {
  const { formatCurrency } = useCurrencyFormat();
  const { t, i18n } = useTranslation();
  const { direction } = useAppLocalization();
  const router = useRouter();
  const params = useLocalSearchParams<{ copyId?: string; budgetId?: string }>();
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
  const accounts = selectAccounts(document);
  const categories = selectCategories(document);
  const topLevelCategories = selectTopLevelCategories(document);
  const budgets = selectBudgets(document);
  const presetBudget =
    !sourceId && params.budgetId
      ? budgets.find((budget) => budget.id === params.budgetId)
      : null;
  const defaultAccount =
    accounts.find((account) => account.isDefault) ?? accounts[0];
  const [draft, setDraft] = useState<TransactionDraft>(() => {
    if (sourceDraft)
      return params.copyId
        ? {
            ...sourceDraft,
            conversionSnapshot: null,
            receiptPath: null,
            receiptAttachmentId: null,
          }
        : sourceDraft;
    if (presetBudget) {
      const eligibleAccounts = accounts.filter(
        (account) =>
          account.currencyCode === presetBudget.currencyCode &&
          (!presetBudget.accounts.length ||
            presetBudget.accounts.includes(account.id)),
      );
      const account =
        eligibleAccounts.find((candidate) => candidate.isDefault) ??
        eligibleAccounts[0];

      return {
        ...createTransactionDraft(),
        type: presetBudget.transactionType,
        budgetId: presetBudget.id,
        accountId: account?.id ?? "",
        currencyCode: presetBudget.currencyCode,
        accountCurrencyCode: account?.currencyCode ?? presetBudget.currencyCode,
      };
    }
    return {
      ...createTransactionDraft(),
      accountId: defaultAccount?.id ?? "",
      currencyCode:
        defaultAccount?.currencyCode ??
        activeProfile.currencyCode.toUpperCase(),
      accountCurrencyCode:
        defaultAccount?.currencyCode ??
        activeProfile.currencyCode.toUpperCase(),
    };
  });
  const transactionNamePlaceholder =
    draft.type === 0
      ? t("transactions.form.namePlaceholders.expense")
      : draft.type === 1
        ? t("transactions.form.namePlaceholders.income")
        : t("transactions.form.namePlaceholders.transfer");
  const [expanded, setExpanded] = useState<Record<ExpandedSection, boolean>>({
    account: true,
    destination: true,
    category: true,
    budget: true,
    label: false,
    loan: false,
    place: false,
    person: false,
  });
  const [pendingReceipt, setPendingReceipt] = useState<{
    uri: string;
    mimeType: string;
  } | null>(null);
  const [datePickerMode, setDatePickerMode] = useState<DatePickerMode>(null);
  const [actionMenuOpen, setActionMenuOpen] = useState(false);
  const actionSheetInitialPositionFix =
    useBottomSheetInitialPositionFix(actionMenuOpen);
  const [currencySheetOpen, setCurrencySheetOpen] = useState(false);
  const [currencyRateLoading, setCurrencyRateLoading] = useState(false);
  const [currencyRateError, setCurrencyRateError] = useState("");
  const [currencyRateNotice, setCurrencyRateNotice] = useState("");
  const [categorySheetParentId, setCategorySheetParentId] = useState<
    string | null
  >(null);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [isSaving, setIsSaving] = useState(false);
  const [headerHidden, setHeaderHidden] = useState(false);
  const saving = useRef(false);
  const currencyRequest = useRef(0);
  const transactionId = useRef(editId ?? uuid.v4());
  const blurTargetRef = useRef<View | null>(null);
  const [scrollY] = useState(() => new Animated.Value(0));
  const occurredAt = new Date(draft.occurredAt);
  const safeOccurredAt = Number.isFinite(occurredAt.getTime())
    ? occurredAt
    : new Date();
  const selectedAccount = accounts.find(
    (account) => account.id === draft.accountId,
  );
  const transactionCurrencyCode =
    draft.currencyCode ||
    selectedAccount?.currencyCode ||
    activeProfile.currencyCode.toUpperCase();
  const accountCurrencyCode =
    selectedAccount?.currencyCode ?? draft.accountCurrencyCode;
  const enteredAmount = Number(draft.amount.replace(",", "."));
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
  const accountOptions: TransactionOption[] = accounts.map((account) => ({
    id: account.id,
    name: account.name,
    description: t("transactions.common.accountDescription", {
      institution: account.institution,
      currency: account.currencyCode,
    }),
    icon: account.icon,
    iconPath: account.iconPath,
    color: account.color,
  }));
  const destinationOptions = accountOptions.filter((option) => {
    const account = accounts.find((item) => item.id === option.id);
    return (
      option.id !== draft.accountId &&
      (!selectedAccount ||
        account?.currencyCode === selectedAccount.currencyCode)
    );
  });
  const categoryOptions: TransactionOption[] = topLevelCategories
    .filter((category) => category.type === draft.type)
    .map((category) => ({
      id: category.id,
      name: category.name,
      description: category.description,
      icon: category.icon,
      iconPath: category.iconPath,
      color: category.color,
    }));
  const selectedCategoryRootId = selectCategoryRootId(
    document,
    draft.categoryId,
  );
  const categorySheetParent = categorySheetParentId
    ? categories.find((category) => category.id === categorySheetParentId)
    : undefined;
  const categorySheetParentOption = categorySheetParent
    ? {
        id: categorySheetParent.id,
        name: categorySheetParent.name,
        description: categorySheetParent.description,
        icon: categorySheetParent.icon,
        iconPath: categorySheetParent.iconPath,
        color: categorySheetParent.color,
      }
    : null;
  const categorySheetChildren: TransactionOption[] = categorySheetParent
    ? categories
        .filter((category) => {
          const visited = new Set<string>();
          let parentId = category.parentId;
          let isDescendant = false;
          while (parentId && !visited.has(parentId)) {
            if (parentId === categorySheetParent.id) {
              isDescendant = true;
              break;
            }
            visited.add(parentId);
            parentId =
              categories.find((candidate) => candidate.id === parentId)
                ?.parentId ?? null;
          }
          return (
            isDescendant &&
            !categories.some((candidate) => candidate.parentId === category.id)
          );
        })
        .map((category) => ({
          id: category.id,
          name: category.name,
          description:
            categories.find((candidate) => candidate.id === category.parentId)
              ?.name ?? category.description,
          icon: category.icon,
          iconPath: category.iconPath,
          color: category.color,
        }))
    : [];
  function localizeBudgetPeriod(period: string) {
    switch (period.toLowerCase()) {
      case "daily":
        return t("transactions.common.periods.daily");
      case "weekly":
        return t("transactions.common.periods.weekly");
      case "monthly":
        return t("transactions.common.periods.monthly");
      case "yearly":
        return t("transactions.common.periods.yearly");
      case "custom":
        return t("transactions.common.periods.custom");
      default:
        return period;
    }
  }
  const budgetOptions: TransactionOption[] = budgets
    .filter((budget) => budget.transactionType === draft.type)
    .map((budget) => ({
      id: budget.id,
      name: budget.name,
      description: t("transactions.common.budgetDescription", {
        period: localizeBudgetPeriod(budget.period),
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

  function change<K extends keyof TransactionDraft>(
    key: K,
    value: TransactionDraft[K],
  ) {
    setDraft((current) => ({ ...current, [key]: value }));
    setError("");
    setNotice("");
  }

  function toggleSection(section: ExpandedSection) {
    Keyboard.dismiss();
    setExpanded((current) => ({ ...current, [section]: !current[section] }));
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
    if (mode === "date")
      next.setFullYear(
        selected.getFullYear(),
        selected.getMonth(),
        selected.getDate(),
      );
    else next.setHours(selected.getHours(), selected.getMinutes(), 0, 0);
    change("occurredAt", next.toISOString());
  }

  function transactionSaveError(reason: unknown) {
    if (!(reason instanceof Error)) return t("transactions.form.saveError");
    switch (reason.message) {
      case "This transaction has an invalid amount.":
        return t("transactions.form.validation.invalidAmount");
      case "Enter a transaction name (up to 100 characters).":
        return t("transactions.form.validation.name");
      case "Enter an amount greater than zero and no more than one trillion.":
        return t("transactions.form.validation.amount");
      case "Choose a valid transaction type.":
        return t("transactions.form.validation.type");
      case "Choose a valid date and time.":
        return t("transactions.form.validation.dateTime");
      case "Choose an account in this profile.":
        return t("transactions.form.validation.account");
      case "Choose a different destination account.":
        return t("transactions.form.validation.destinationAccount");
      case "Transfer accounts must use the same currency.":
        return t("transactions.form.validation.transferCurrency");
      case "Choose the transaction currency again to load its current exchange rate.":
        return t("transactions.form.validation.exchangeRate");
      case "Choose a category for this transaction type.":
        return t("transactions.form.validation.category");
      case "This transaction no longer exists.":
        return t("transactions.form.validation.missing");
      case "This transaction has already been saved.":
        return t("transactions.form.validation.alreadySaved");
      case "This transaction belongs to another profile.":
        return t("transactions.form.validation.wrongProfile");
      case "This account has an invalid balance. Edit the account before saving a transaction.":
        return t("transactions.form.validation.invalidAccountBalance");
      case "This template has already been saved.":
        return t("transactions.form.validation.templateAlreadySaved");
    }
    const subcategoryMatch = /^Choose a subcategory of (.+)\.$/.exec(
      reason.message,
    );
    if (subcategoryMatch)
      return t("transactions.form.validation.subcategory", {
        name: subcategoryMatch[1],
      });
    const relationMatch =
      /^Choose a valid (budget|label|loan|place|person) in this profile\.$/.exec(
        reason.message,
      );
    if (relationMatch) {
      const relationLabels: Record<string, string> = {
        budget: t("transactions.common.fields.budget"),
        label: t("transactions.common.fields.label"),
        loan: t("transactions.common.fields.loan"),
        place: t("transactions.common.fields.place"),
        person: t("transactions.common.fields.payee"),
      };
      return t("transactions.form.validation.relation", {
        relation: relationLabels[relationMatch[1]].toLocaleLowerCase(
          i18n.resolvedLanguage,
        ),
      });
    }
    return reason.message;
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
      Alert.alert(t("transactions.form.receiptSelectErrorTitle"), message);
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
            draft,
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
            ...draft,
            receiptPath: attachment.relativePath,
            receiptAttachmentId: attachment.id,
          }
        : draft;
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
          ...(!editId && base !== accountCurrencyCode
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
      await updateDocument((current) => {
        if (current._local.selectedProfileId !== profileId)
          throw new Error(t("transactions.form.activeProfileChanged"));
        const saved = saveTransaction(
          current,
          preparedDraft,
          id,
          profileId,
          now,
          !!editId,
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
      if (editId && router.canGoBack()) router.back();
      else router.dismissTo("/");
    } catch (reason) {
      if (pendingAttachmentPath && !attachmentCommitted) {
        try {
          deleteAttachment(pendingAttachmentPath);
        } catch {}
      }
      const message = transactionSaveError(reason);
      setError(message);
      Alert.alert(t("transactions.form.saveErrorTitle"), message);
    } finally {
      saving.current = false;
      setIsSaving(false);
    }
  }

  const missingSource = !!sourceId && !sourceDraft;

  return (
    <View style={{ flex: 1, backgroundColor: theme.background }}>
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
              keyboardShouldPersistTaps="handled"
              showsVerticalScrollIndicator={false}
              scrollEventThrottle={16}
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
                className="gap-4 px-5"
              >
                {missingSource ? (
                  <View className="rounded-2xl bg-danger/10 p-4">
                    <Text className="font-manrope-semibold text-danger">
                      {t("transactions.form.unavailable")}
                    </Text>
                  </View>
                ) : null}

                <Input
                  accessibilityLabel={t("transactions.form.name")}
                  placeholder={transactionNamePlaceholder}
                  maxLength={100}
                  value={draft.name}
                  onChangeText={(value) => change("name", value)}
                  className="h-16 rounded-2xl bg-surface px-4 font-manrope-semibold"
                  style={{
                    direction,
                    textAlign: "auto",
                    writingDirection: direction,
                  }}
                />

                <View className="relative">
                  <Input
                    accessibilityLabel={t("transactions.form.amount")}
                    placeholder={t("transactions.form.amountPlaceholder")}
                    keyboardType="decimal-pad"
                    maxLength={30}
                    value={draft.amount}
                    onChangeText={(value) => change("amount", value)}
                    className="h-16 rounded-2xl bg-surface font-manrope-semibold"
                    style={{
                      direction,
                      paddingStart: 16,
                      paddingEnd: 96,
                      textAlign: "auto",
                      writingDirection: direction,
                    }}
                  />
                  <Pressable
                    accessibilityRole="button"
                    accessibilityLabel={t(
                      "transactions.form.currencyAccessibility",
                      { currency: transactionCurrencyCode },
                    )}
                    accessibilityState={{
                      disabled:
                        isSaving || draft.type === 2 || !selectedAccount,
                    }}
                    disabled={isSaving || draft.type === 2 || !selectedAccount}
                    onPress={() => {
                      Keyboard.dismiss();
                      setCurrencySheetOpen(true);
                    }}
                    className="absolute top-0 h-16 flex-row items-center gap-1 px-3"
                    style={{ end: 4 }}
                  >
                    <Text className="font-manrope-bold text-sm text-accent">
                      {transactionCurrencyCode}
                    </Text>
                    {draft.type !== 2 ? (
                      <FilledIcon
                        name="currency-exchange"
                        size={18}
                        tone="accent"
                      />
                    ) : null}
                  </Pressable>
                </View>

                {selectedAccount &&
                transactionCurrencyCode !== accountCurrencyCode ? (
                  <View className="gap-2 rounded-2xl bg-surface-secondary p-4">
                    <Text className="font-manrope-semibold text-sm text-foreground">
                      {t("transactions.form.transactionCurrency", {
                        type: t(
                          draft.type === 1
                            ? "transactions.common.types.income"
                            : "transactions.common.types.expense",
                        ),
                        currency: transactionCurrencyCode,
                      })}
                    </Text>
                    {currencyRateLoading ? (
                      <Text className="font-sans text-sm text-muted">
                        {t("transactions.form.currencyRateLoading")}
                      </Text>
                    ) : null}
                    {currencyRateError ? (
                      <Text
                        accessibilityRole="alert"
                        className="font-sans text-sm text-danger"
                      >
                        {currencyRateError}
                      </Text>
                    ) : null}
                    {currencyRateNotice ? (
                      <Text className="font-sans text-sm text-muted">
                        {currencyRateNotice}
                      </Text>
                    ) : null}
                    {draft.exchangeRate ? (
                      <>
                        <Text className="font-sans text-sm text-muted">
                          {t("transactions.form.exchangeRateSummary", {
                            from: transactionCurrencyCode,
                            rate: draft.exchangeRate,
                            to: accountCurrencyCode,
                            date: draft.exchangeRateDate ?? "",
                          })}
                        </Text>
                        {convertedAccountAmount !== null ? (
                          <Text className="font-manrope-bold text-base text-foreground">
                            {t("transactions.form.amountInAccountCurrency", {
                              currency: accountCurrencyCode,
                              amount: formatCurrency(
                                convertedAccountAmount,
                                accountCurrencyCode,
                              ),
                            })}
                          </Text>
                        ) : null}
                      </>
                    ) : null}
                  </View>
                ) : null}

                <Input
                  accessibilityLabel={t("transactions.form.description")}
                  placeholder={t("transactions.form.descriptionPlaceholder")}
                  maxLength={300}
                  value={draft.description}
                  onChangeText={(value) => change("description", value)}
                  className="h-16 rounded-2xl bg-surface px-4"
                  style={{
                    direction,
                    textAlign: direction === "rtl" ? "right" : "left",
                    writingDirection: direction,
                  }}
                />

                <View className="flex-row gap-3">
                  <Pressable
                    accessibilityRole="button"
                    accessibilityLabel={t("transactions.form.changeDate", {
                      date: formatAppDate(
                        safeOccurredAt,
                        selectAppPreferences(document).dateFormat,
                      ),
                    })}
                    onPress={() => {
                      Keyboard.dismiss();
                      setDatePickerMode("date");
                    }}
                    className="h-20 flex-1 justify-center gap-1 rounded-2xl bg-surface px-4"
                    style={({ pressed }) => ({ opacity: pressed ? 0.68 : 1 })}
                  >
                    <View className="flex-row items-center gap-2">
                      <FilledIcon name="clock" size={17} tone="muted" />
                      <Text className="font-manrope-medium text-xs text-muted">
                        {t("transactions.form.date")}
                      </Text>
                    </View>
                    <Text className="font-manrope-semibold text-base text-foreground">
                      {formatAppDate(
                        safeOccurredAt,
                        selectAppPreferences(document).dateFormat,
                      )}
                    </Text>
                    <DateTimePopover
                      accentColor={theme.accent}
                      isDark={theme.isDark}
                      isPresented={datePickerMode === "date"}
                      maximumDate={new Date()}
                      mode="date"
                      title={t("transactions.form.date")}
                      value={safeOccurredAt}
                      onDismiss={() => {
                        if (datePickerMode === "date") setDatePickerMode(null);
                      }}
                      onValueChange={(value) => updateDateTime("date", value)}
                    />
                  </Pressable>
                  <Pressable
                    accessibilityRole="button"
                    accessibilityLabel={t("transactions.form.changeTime", {
                      time: formatTransactionTime(
                        safeOccurredAt,
                        i18n.resolvedLanguage,
                      ),
                    })}
                    onPress={() => {
                      Keyboard.dismiss();
                      setDatePickerMode("time");
                    }}
                    className="h-20 flex-1 justify-center gap-1 rounded-2xl bg-surface px-4"
                    style={({ pressed }) => ({ opacity: pressed ? 0.68 : 1 })}
                  >
                    <View className="flex-row items-center gap-2">
                      <FilledIcon name="clock" size={17} tone="muted" />
                      <Text className="font-manrope-medium text-xs text-muted">
                        {t("transactions.form.time")}
                      </Text>
                    </View>
                    <Text className="font-manrope-semibold text-base text-foreground">
                      {formatTransactionTime(
                        safeOccurredAt,
                        i18n.resolvedLanguage,
                      )}
                    </Text>
                    <DateTimePopover
                      accentColor={theme.accent}
                      isDark={theme.isDark}
                      isPresented={datePickerMode === "time"}
                      maximumDate={new Date()}
                      mode="time"
                      title={t("transactions.form.time")}
                      value={safeOccurredAt}
                      onDismiss={() => {
                        if (datePickerMode === "time") setDatePickerMode(null);
                      }}
                      onValueChange={(value) => updateDateTime("time", value)}
                    />
                  </Pressable>
                </View>

                {Platform.OS === "android" && datePickerMode ? (
                  <DateTimePicker
                    accentColor={theme.accent}
                    display="default"
                    maximumDate={new Date()}
                    mode={datePickerMode}
                    presentation="dialog"
                    value={safeOccurredAt}
                    onValueChange={(_, selected) =>
                      updateDateTime(datePickerMode, selected)
                    }
                    onDismiss={() => setDatePickerMode(null)}
                  />
                ) : null}

                <TransactionSelectionSection
                  title={
                    draft.type === 2
                      ? t("transactions.common.fields.transferFrom")
                      : t("transactions.common.fields.account")
                  }
                  placeholder={t("transactions.form.selectAccount")}
                  icon="credit-card"
                  options={accountOptions}
                  selectedId={draft.accountId}
                  expanded={expanded.account}
                  compactOptions
                  disabled={isSaving}
                  onToggle={() => toggleSection("account")}
                  onSelect={(accountId) => {
                    const account = accounts.find(
                      (item) => item.id === accountId,
                    );
                    const currencyCode =
                      account?.currencyCode ?? transactionCurrencyCode;
                    currencyRequest.current += 1;
                    setCurrencyRateLoading(false);
                    setCurrencyRateError("");
                    setCurrencyRateNotice("");
                    setDraft((current) => ({
                      ...current,
                      accountId,
                      currencyCode,
                      accountCurrencyCode: currencyCode,
                      exchangeRate: null,
                      exchangeRateDate: null,
                      exchangeRateFetchedAt: null,
                      exchangeRateSource: null,
                      conversionSnapshot: null,
                      destinationAccountId:
                        current.destinationAccountId === accountId
                          ? ""
                          : current.destinationAccountId,
                    }));
                    setError("");
                  }}
                  onAdd={() => router.push("/accounts/create")}
                />

                {draft.type === 2 ? (
                  <TransactionSelectionSection
                    title={t("transactions.common.fields.transferTo")}
                    placeholder={t(
                      "transactions.form.selectDestinationAccount",
                    )}
                    icon="credit-card"
                    options={destinationOptions}
                    selectedId={draft.destinationAccountId}
                    expanded={expanded.destination}
                    compactOptions
                    disabled={isSaving}
                    onToggle={() => toggleSection("destination")}
                    onSelect={(value) => change("destinationAccountId", value)}
                    onAdd={() => router.push("/accounts/create")}
                  />
                ) : null}

                <TransactionSelectionSection
                  title={t("transactions.common.fields.category")}
                  placeholder={t("transactions.form.selectCategory")}
                  icon="chart-donut-variant"
                  options={categoryOptions}
                  selectedId={selectedCategoryRootId}
                  expanded={expanded.category}
                  compactOptions
                  disabled={isSaving}
                  optional
                  onToggle={() => toggleSection("category")}
                  onSelect={(value) => {
                    const hasChildren = categories.some(
                      (category) => category.parentId === value,
                    );
                    if (value && hasChildren) setCategorySheetParentId(value);
                    else change("categoryId", value);
                  }}
                  onAdd={() =>
                    router.push({
                      pathname: "/categories/create",
                      params: { type: String(draft.type) },
                    })
                  }
                />

                <TransactionSelectionSection
                  title={t("transactions.common.fields.budget")}
                  placeholder={t("transactions.form.selectBudget")}
                  icon="wallet"
                  options={budgetOptions}
                  selectedId={draft.budgetId}
                  expanded={expanded.budget}
                  compactOptions
                  disabled={isSaving}
                  optional
                  onToggle={() => toggleSection("budget")}
                  onSelect={(value) => change("budgetId", value)}
                  onAdd={() => router.push("/budgets/create")}
                />

                <TransactionSelectionSection
                  title={t("transactions.common.fields.label")}
                  placeholder={t("transactions.form.selectLabel")}
                  icon="check"
                  options={labelOptions}
                  selectedId={draft.labelId}
                  expanded={expanded.label}
                  disabled={isSaving}
                  optional
                  onToggle={() => toggleSection("label")}
                  onSelect={(value) => change("labelId", value)}
                />

                <TransactionSelectionSection
                  title={t("transactions.common.fields.loan")}
                  placeholder={t("transactions.form.selectLoan")}
                  icon="credit-card"
                  options={loanOptions}
                  selectedId={draft.loanId}
                  expanded={expanded.loan}
                  disabled={isSaving}
                  optional
                  onToggle={() => toggleSection("loan")}
                  onSelect={(value) => change("loanId", value)}
                />

                <TransactionSelectionSection
                  title={t("transactions.common.fields.place")}
                  placeholder={t("transactions.form.selectPlace")}
                  icon="home"
                  options={placeOptions}
                  selectedId={draft.placeId}
                  expanded={expanded.place}
                  disabled={isSaving}
                  optional
                  onToggle={() => toggleSection("place")}
                  onSelect={(value) => change("placeId", value)}
                />

                <TransactionSelectionSection
                  title={t("transactions.common.fields.payee")}
                  placeholder={t("transactions.form.selectPerson")}
                  icon="account"
                  options={personOptions}
                  selectedId={draft.personId}
                  expanded={expanded.person}
                  disabled={isSaving}
                  optional
                  onToggle={() => toggleSection("person")}
                  onSelect={(value) => change("personId", value)}
                />

                <View className="gap-3 pb-3">
                  <Text className="font-manrope-semibold text-base text-foreground">
                    {t("transactions.form.receiptOptional")}
                  </Text>
                  <Pressable
                    accessibilityRole="button"
                    accessibilityLabel={
                      receiptUri
                        ? t("transactions.form.replaceReceiptAccessibility")
                        : t("transactions.form.addReceiptAccessibility")
                    }
                    onPress={pickReceipt}
                    className="min-h-52 overflow-hidden rounded-2xl border border-border bg-surface"
                    style={({ pressed }) => ({ opacity: pressed ? 0.72 : 1 })}
                  >
                    {receiptUri ? (
                      <Image
                        resizeMode="cover"
                        source={{ uri: receiptUri }}
                        style={StyleSheet.absoluteFill}
                      />
                    ) : (
                      <View className="flex-1 items-center justify-center gap-2 px-6 py-10">
                        <FilledIcon name="camera" size={42} tone="accent" />
                        <Text className="text-center font-manrope-semibold text-base text-accent">
                          {t("transactions.form.addReceipt")}
                        </Text>
                        <Text className="text-center font-sans text-sm text-muted">
                          {t("transactions.form.receiptHint")}
                        </Text>
                      </View>
                    )}
                  </Pressable>
                  {receiptUri ? (
                    <Button
                      variant="danger-soft"
                      className="self-start"
                      onPress={() => {
                        setPendingReceipt(null);
                        setDraft((current) => ({
                          ...current,
                          receiptPath: null,
                          receiptAttachmentId: null,
                        }));
                      }}
                    >
                      <FilledIcon name="close" size={18} tone="danger" />
                      <Button.Label>
                        {t("transactions.form.removeReceipt")}
                      </Button.Label>
                    </Button>
                  ) : null}
                </View>
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
                {editId
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
            <View style={styles.splitActionRow}>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel={
                  isSaving
                    ? t("transactions.form.savingAccessibility")
                    : editId
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
                <FilledIcon name="save" size={24} tone="accent-foreground" />
                <Text
                  numberOfLines={1}
                  className="shrink font-manrope-bold text-base text-accent-foreground"
                >
                  {isSaving
                    ? t("transactions.form.saving")
                    : editId
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
            containerStyle={actionSheetInitialPositionFix.containerStyle}
            onChange={actionSheetInitialPositionFix.onChange}
            topInset={insets.top}
            bottomInset={insets.bottom}
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
      {categorySheetParentOption ? (
        <TransactionCategorySheet
          parent={categorySheetParentOption}
          options={categorySheetChildren}
          selectedId={draft.categoryId}
          onSelect={(value) => change("categoryId", value)}
          onDismiss={() => setCategorySheetParentId(null)}
        />
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  fill: { flex: 1 },
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
