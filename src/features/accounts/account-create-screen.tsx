import { useCollapsingHeader } from "@/shared/ui/collapsing-header";
import {
    BottomSafeAreaGradient,
    TopSafeAreaGradient,
} from "@/shared/ui/safe-area-gradients";
import { BlurTargetView } from "expo-blur";
import { uuid } from "expo-modules-core";
import { useRouter } from "expo-router";
import { Button, Switch as HeroSwitch, Input } from "heroui-native";
import { useRef, useState, type ReactNode, type RefObject } from "react";
import { useTranslation } from "react-i18next";
import {
    Alert,
    Animated,
    I18nManager,
    Keyboard,
    KeyboardAvoidingView,
    Platform,
    Pressable,
    ScrollView,
    StyleSheet,
    Switch,
    View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { useLocalData } from "@/data/local-data-provider";
import {
    ACCOUNT_TYPES,
    CARD_COMPANIES,
    addAccountToDocument,
    parseAccountAmount,
    updateAccountInDocument,
    validateAccountDraft,
    type AccountDraft,
} from "@/data/model/account-record";
import { createDefaultSavingsDetails } from "@/data/model/savings-account";
import {
    selectAccountDraft,
    selectBankAccounts,
} from "@/data/selectors/document-selectors";
import { CurrencySelectorSheet } from "@/features/profile/components/currency-selector-sheet";
import { currencies } from "@/features/profile/data/currencies-data";
import { useProfiles } from "@/features/profile/profile-provider";
import { useAppLocalization } from "@/localization/localization-provider";
import { useAppThemeColors } from "@/shared/theme/app-theme";
import { Text } from "@/shared/ui/app-text";
import { FilledIcon, type FilledIconName } from "@/shared/ui/filled-icon";
import { GlassSegmentedControl } from "@/shared/ui/glass-segmented-control";
import {
    PickerModal as AccountPicker,
    IconPicker,
} from "@/shared/ui/icon-picker";
import { ACCOUNT_COLORS, colorForeground } from "./account-options";
import {
    AccountCurrencyChangeSheet,
    type CurrencyChangeRequest,
} from "./components/account-currency-change-sheet";
import { AccountIcon } from "./components/account-icon";
import { CardCompanyLogo } from "./components/card-company-logo";
import { SavingsDetailsForm } from "./components/savings-details-form";

const defaultIcons = {
  card: "credit-card",
  cash: "cash",
  savings: "piggy-bank",
  bank: "bank",
} as const;

type AccountType = (typeof ACCOUNT_TYPES)[number];
const ACCOUNT_TYPE_OPTIONS: readonly AccountType[] = [
  "bank",
  "card",
  "cash",
  "savings",
];

function AccountTypeSelector({
  blurTarget,
  selected,
  onChange,
}: {
  blurTarget: RefObject<View | null>;
  selected: AccountType;
  onChange: (type: AccountType) => void;
}) {
  const { t } = useTranslation();
  const labels: Record<AccountType, string> = {
    bank: t("accounts.form.accountTypes.bank"),
    card: t("accounts.form.accountTypes.card"),
    cash: t("accounts.form.accountTypes.cash"),
    savings: t("accounts.form.accountTypes.savings"),
  };
  const accountTypeSegments = ACCOUNT_TYPE_OPTIONS.map((type) => ({
    label: labels[type],
    value: type,
  }));

  return (
    <GlassSegmentedControl
      accessibilityLabel={t("accounts.form.accountType")}
      blurTarget={blurTarget}
      minHeight={Platform.OS === "android" ? 52 : 48}
      onChange={onChange}
      options={accountTypeSegments}
      value={selected}
    />
  );
}

function OptionRow({
  icon,
  title,
  description,
  onPress,
  hasDivider = false,
  leading,
}: {
  icon: FilledIconName;
  title: string;
  description: string;
  onPress: () => void;
  hasDivider?: boolean;
  leading?: ReactNode;
}) {
  const { t } = useTranslation();

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={t("accounts.form.optionAccessibility", {
        title,
        description,
      })}
      onPress={onPress}
      className={`min-h-20 flex-row items-center gap-4 py-3 ${
        hasDivider ? "border-b border-border" : ""
      }`}
    >
      {leading ?? <FilledIcon name={icon} size={26} tone="accent" />}
      <View className="flex-1 gap-1">
        <Text className="font-manrope-semibold text-base text-foreground">
          {title}
        </Text>
        <Text className="font-sans text-sm text-muted">{description}</Text>
      </View>
      <FilledIcon name="chevron-right" size={24} />
    </Pressable>
  );
}

export function AccountCreateScreen({ editId }: { editId?: string }) {
  const { t } = useTranslation();
  const { direction } = useAppLocalization();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const theme = useAppThemeColors();
  const inputDirectionStyle = {
    direction,
    textAlign: "auto" as const,
    writingDirection: direction,
  };
  const { document, updateDocument } = useLocalData();
  const { activeProfile } = useProfiles();
  // Capture the owner for this draft; a later profile change cannot reassign it.
  const [profileId] = useState(activeProfile.id);
  const [originalAccount] = useState(() =>
    editId ? selectAccountDraft(document, editId) : null,
  );
  const [currencyChange, setCurrencyChange] =
    useState<CurrencyChangeRequest | null>(null);
  const [currencyChangeNote, setCurrencyChangeNote] = useState("");
  const [draft, setDraft] = useState<AccountDraft>(
    () =>
      (editId ? selectAccountDraft(document, editId) : null) ?? {
        name: "",
        amount: "",
        creditLimit: "",
        accountNumber: "",
        accountType: "card",
        currencyCode: activeProfile.currencyCode.toUpperCase(),
        icon: "credit-card",
        iconPath: null,
        color: ACCOUNT_COLORS[0],
        isDefault: false,
        isExcluded: false,
        cardLastFour: "",
        cardCompany: "",
        paymentDay: null,
        bankName: "",
        linkedBankAccountId: null,
        savingsDetails: createDefaultSavingsDetails(),
      },
  );
  const [picker, setPicker] = useState<
    "icon" | "currency" | "company" | "day" | "bank" | null
  >(null);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState("");
  const saving = useRef(false);
  const blurTargetRef = useRef<View | null>(null);
  const { scrollY, headerHidden } = useCollapsingHeader();
  const accountId = useRef<string | null>(null);
  const iconChosen = useRef(!!editId);
  const color = /^#[a-f\d]{6}$/i.test(draft.color)
    ? draft.color
    : ACCOUNT_COLORS[0];
  const currency = currencies.find((item) => item.code === draft.currencyCode);
  const bankAccounts = selectBankAccounts(document).filter(
    (account) => account.id !== editId,
  );
  const linkedBankAccount = bankAccounts.find(
    (account) => account.id === draft.linkedBankAccountId,
  );
  const parsedDraftBalance = Number(draft.amount.replace(",", "."));
  const savingsBalance = Number.isFinite(parsedDraftBalance)
    ? parsedDraftBalance
    : 0;
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
  function change<K extends keyof AccountDraft>(
    key: K,
    value: AccountDraft[K],
  ) {
    setDraft((current) => ({ ...current, [key]: value }));
    setError("");
  }
  function openPicker(next: typeof picker) {
    Keyboard.dismiss();
    setPicker(next);
  }
  function goBack() {
    if (!saving.current) {
      if (router.canGoBack()) router.back();
      else router.replace("/accounts");
    }
  }

  async function save() {
    if (saving.current) return;
    const draftToSave: AccountDraft = {
      ...draft,
      amount:
        draft.accountType === "card" &&
        Number(draft.amount.replace(",", ".")) > 0
          ? `-${draft.amount.trim()}`
          : draft.amount,
    };
    try {
      validateAccountDraft(draftToSave);
    } catch (reason) {
      setError(
        reason instanceof Error
          ? reason.message
          : t("accounts.form.checkDetails"),
      );
      return;
    }
    saving.current = true;
    setIsSaving(true);
    Keyboard.dismiss();
    try {
      accountId.current ??= uuid.v4();
      const id = accountId.current;
      const now = new Date().toISOString();
      await updateDocument((current) => {
        if (editId && originalAccount) {
          const latest = selectAccountDraft(current, editId);
          if (
            latest &&
            (latest.amount !== originalAccount.amount ||
              latest.currencyCode !== originalAccount.currencyCode)
          )
            throw new Error(t("accounts.form.staleBalance"));
        }
        return editId
          ? updateAccountInDocument(current, draftToSave, editId, now)
          : addAccountToDocument(current, draftToSave, profileId, id, now);
      });
      if (editId) router.back();
      else router.dismissTo("/accounts");
    } catch (reason) {
      const message =
        reason instanceof Error ? reason.message : t("accounts.form.saveError");
      setError(message);
      Alert.alert(t("accounts.form.saveErrorTitle"), message);
    } finally {
      saving.current = false;
      setIsSaving(false);
    }
  }

  return (
    <View style={{ flex: 1, backgroundColor: theme.background }}>
      <KeyboardAvoidingView
        behavior={Platform.OS === "ios" ? "padding" : "height"}
        style={{ flex: 1 }}
      >
        <View style={styles.formArea}>
          <BlurTargetView ref={blurTargetRef} style={styles.scrollTarget}>
            <Animated.ScrollView
              keyboardShouldPersistTaps="handled"
              contentContainerStyle={{
                paddingBottom: 104 + insets.bottom,
              }}
              onScroll={Animated.event(
                [{ nativeEvent: { contentOffset: { y: scrollY } } }],
                { useNativeDriver: true },
              )}
              scrollEventThrottle={16}
              showsVerticalScrollIndicator={false}
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
                className="gap-5 px-5"
              >
                <View className="gap-2">
                  <Text className="font-manrope-medium text-sm text-muted">
                    {t("accounts.form.accountName")}
                  </Text>
                  <View className="flex-row items-center gap-3">
                    <Pressable
                      accessibilityRole="button"
                      accessibilityLabel={t("accounts.form.chooseIcon")}
                      onPress={() => openPicker("icon")}
                      className="size-16 items-center justify-center rounded-2xl"
                      style={{ backgroundColor: color }}
                    >
                      <AccountIcon
                        name={draft.icon}
                        pathData={draft.iconPath}
                        color={colorForeground(color)}
                        size={30}
                      />
                      <View
                        className="absolute -bottom-1 rounded-full border-2 border-background bg-surface p-1"
                        style={I18nManager.isRTL ? { left: -4 } : { right: -4 }}
                      >
                        <FilledIcon name="pencil" size={13} />
                      </View>
                    </Pressable>
                    <Input
                      accessibilityLabel={t("accounts.form.accountName")}
                      placeholder={
                        draft.accountType === "bank"
                          ? t("accounts.form.namePlaceholders.bank")
                          : draft.accountType === "savings"
                            ? t("accounts.form.namePlaceholders.savings")
                            : t("accounts.form.namePlaceholders.default")
                      }
                      maxLength={100}
                      value={draft.name}
                      onChangeText={(value) => change("name", value)}
                      containerClassName="flex-1"
                      className="h-16 rounded-2xl bg-surface font-manrope-semibold"
                      style={inputDirectionStyle}
                    />
                  </View>
                </View>
                {draft.accountType === "card" && (
                  <View className="gap-2">
                    <Text className="font-manrope-medium text-sm text-muted">
                      {t("accounts.form.creditLimit", {
                        currency: draft.currencyCode,
                      })}
                    </Text>
                    <Input
                      accessibilityLabel={t(
                        "accounts.form.creditLimitAccessibility",
                      )}
                      placeholder={t("accounts.form.creditLimitPlaceholder")}
                      keyboardType="decimal-pad"
                      value={draft.creditLimit ?? ""}
                      onChangeText={(value) => change("creditLimit", value)}
                      className="h-14 rounded-2xl bg-surface font-manrope-semibold"
                      style={inputDirectionStyle}
                    />
                    <Text className="font-sans text-xs leading-5 text-muted">
                      {t("accounts.form.creditLimitHelp")}
                    </Text>
                  </View>
                )}
                <View className="gap-2">
                  <Text className="font-manrope-medium text-sm text-muted">
                    {draft.accountType === "card"
                      ? t("accounts.form.cardCurrentBalance", {
                          currency: draft.currencyCode,
                        })
                      : draft.accountType === "savings"
                        ? t("accounts.form.currentBalance", {
                            currency: draft.currencyCode,
                          })
                        : t("accounts.form.openingBalance", {
                            currency: draft.currencyCode,
                          })}
                  </Text>
                  <View className="flex-row items-center gap-2">
                    <Button
                      variant="secondary"
                      accessibilityLabel={t(
                        "accounts.form.toggleNegativeBalance",
                      )}
                      onPress={() =>
                        change(
                          "amount",
                          draft.amount.startsWith("-")
                            ? draft.amount.slice(1)
                            : `-${draft.amount}`,
                        )
                      }
                    >
                      <Button.Label>+/−</Button.Label>
                    </Button>
                    <Input
                      accessibilityLabel={t(
                        "accounts.form.openingBalanceAccessibility",
                      )}
                      placeholder={t("accounts.form.amountPlaceholder")}
                      keyboardType="decimal-pad"
                      value={draft.amount}
                      onChangeText={(value) => change("amount", value)}
                      containerClassName="flex-1"
                      className="h-14 rounded-2xl bg-surface"
                      style={inputDirectionStyle}
                    />
                  </View>
                  {draft.accountType === "card" && (
                    <Text className="font-sans text-xs leading-5 text-muted">
                      {t("accounts.form.cardCurrentBalanceHelp")}
                    </Text>
                  )}
                  {draft.accountType === "bank" && (
                    <Text className="font-sans text-xs leading-5 text-muted">
                      {t("accounts.form.negativeBalanceHelp")}
                    </Text>
                  )}
                </View>
                <View className="gap-2">
                  <Text className="font-manrope-medium text-sm text-muted">
                    {t("accounts.form.accountNumberOptional")}
                  </Text>
                  <Input
                    accessibilityLabel={t("accounts.form.accountNumber")}
                    placeholder={t("accounts.form.accountNumber")}
                    autoCorrect={false}
                    maxLength={64}
                    value={draft.accountNumber}
                    onChangeText={(value) => change("accountNumber", value)}
                    className="h-14 rounded-2xl bg-surface"
                    style={inputDirectionStyle}
                  />
                </View>
                {draft.accountType === "bank" && (
                  <View className="gap-3 pt-1">
                    <View className="flex-row items-center gap-3">
                      <FilledIcon name="bank" size={24} tone="accent" />
                      <Text className="font-manrope-semibold text-base text-foreground">
                        {t("accounts.form.bankDetails")}
                      </Text>
                    </View>
                    <View className="gap-2">
                      <Text className="font-manrope-medium text-sm text-muted">
                        {t("accounts.form.bankName")}
                      </Text>
                      <Input
                        accessibilityLabel={t("accounts.form.bankName")}
                        placeholder={t("accounts.form.bankNamePlaceholder")}
                        maxLength={100}
                        value={draft.bankName}
                        onChangeText={(value) => change("bankName", value)}
                        className="h-14 rounded-2xl bg-surface"
                        style={inputDirectionStyle}
                      />
                    </View>
                  </View>
                )}
                {draft.accountType === "savings" && (
                  <SavingsDetailsForm
                    balance={savingsBalance}
                    currencyCode={draft.currencyCode}
                    value={draft.savingsDetails}
                    onChange={(savingsDetails) =>
                      change("savingsDetails", savingsDetails)
                    }
                  />
                )}
                {draft.accountType === "card" && (
                  <View className="gap-3 pt-1">
                    <View className="flex-row items-center gap-3">
                      <FilledIcon name="credit-card" size={24} tone="accent" />
                      <Text className="font-manrope-semibold text-base text-foreground">
                        {t("accounts.form.cardDetails")}
                      </Text>
                    </View>
                    <View className="gap-2">
                      <Text className="font-manrope-medium text-sm text-muted">
                        {t("accounts.form.lastFourDigits")}
                      </Text>
                      <Input
                        accessibilityLabel={t(
                          "accounts.form.lastFourAccessibility",
                        )}
                        placeholder={t("accounts.form.lastFourPlaceholder")}
                        keyboardType="number-pad"
                        maxLength={4}
                        value={draft.cardLastFour}
                        onChangeText={(value) => change("cardLastFour", value)}
                        className="h-14 rounded-2xl bg-surface"
                        style={inputDirectionStyle}
                      />
                    </View>
                    <View>
                      <OptionRow
                        icon="credit-card"
                        title={t("accounts.form.cardCompany")}
                        description={
                          draft.cardCompany || t("accounts.form.selectCompany")
                        }
                        leading={
                          draft.cardCompany ? (
                            <CardCompanyLogo company={draft.cardCompany} />
                          ) : undefined
                        }
                        onPress={() => openPicker("company")}
                        hasDivider
                      />
                      <OptionRow
                        icon="clock"
                        title={t("accounts.form.monthlyPaymentDay")}
                        description={
                          draft.paymentDay
                            ? t("accounts.form.paymentDay", {
                                day: String(draft.paymentDay).padStart(2, "0"),
                              })
                            : t("accounts.form.chooseDay")
                        }
                        onPress={() => openPicker("day")}
                        hasDivider
                      />
                      <OptionRow
                        icon="bank"
                        title={t("accounts.form.bankAccount")}
                        description={
                          linkedBankAccount
                            ? `${linkedBankAccount.name} · ${linkedBankAccount.bankName}`
                            : bankAccounts.length
                              ? t("accounts.form.selectPayingAccount")
                              : t("accounts.form.createBankAccountFirst")
                        }
                        onPress={() => openPicker("bank")}
                      />
                    </View>
                    <Text className="font-sans text-xs leading-5 text-muted">
                      {t("accounts.form.paymentHelp")}
                      {linkedBankAccount &&
                      linkedBankAccount.currencyCode !== draft.currencyCode
                        ? ` ${t("accounts.form.paymentConversionHelp", {
                            from: draft.currencyCode,
                            to: linkedBankAccount.currencyCode,
                          })}`
                        : ""}
                    </Text>
                  </View>
                )}
                <OptionRow
                  icon="currency-exchange"
                  title={t("accounts.form.accountCurrency")}
                  description={`${draft.currencyCode} (${currency?.symbol ?? draft.currencyCode})`}
                  onPress={() => openPicker("currency")}
                />
                {!!currencyChangeNote && (
                  <Text className="font-sans text-sm text-muted">
                    {currencyChangeNote}{" "}
                    {t("accounts.form.pastTransactionsCurrency")}
                  </Text>
                )}
                {(
                  [
                    {
                      key: "isDefault",
                      icon: "check",
                      title: t("accounts.form.defaultAccount"),
                      description: t("accounts.form.defaultAccountHelp"),
                    },
                    {
                      key: "isExcluded",
                      icon: "eye-off",
                      title: t("accounts.form.excludeAccount"),
                      description: t("accounts.form.excludeAccountHelp"),
                    },
                  ] as const
                ).map((option) => (
                  <Pressable
                    key={option.key}
                    accessibilityRole="switch"
                    accessibilityLabel={option.title}
                    accessibilityHint={option.description}
                    accessibilityState={{
                      checked: draft[option.key],
                      disabled: isSaving,
                    }}
                    disabled={isSaving}
                    onPress={() => change(option.key, !draft[option.key])}
                    className="flex-row items-center gap-4 py-2"
                  >
                    <FilledIcon
                      name={option.icon}
                      tone={option.key === "isExcluded" ? "danger" : "accent"}
                      size={26}
                    />
                    <View className="flex-1 gap-1">
                      <Text className="font-manrope-semibold text-base text-foreground">
                        {option.title}
                      </Text>
                      <Text className="font-sans text-sm leading-5 text-muted">
                        {option.description}
                      </Text>
                    </View>
                    <View
                      pointerEvents="none"
                      accessibilityElementsHidden
                      importantForAccessibility="no-hide-descendants"
                      className="shrink-0"
                    >
                      {Platform.OS === "android" ? (
                        <HeroSwitch
                          isSelected={draft[option.key]}
                          isDisabled={isSaving}
                          style={{ width: 60, height: 28 }}
                        >
                          <HeroSwitch.Thumb style={{ width: 36, height: 24 }} />
                        </HeroSwitch>
                      ) : (
                        <Switch
                          value={draft[option.key]}
                          disabled={isSaving}
                          trackColor={{
                            false: theme.surfaceTertiary,
                            true: theme.accent,
                          }}
                          thumbColor={
                            draft[option.key]
                              ? theme.accentForeground
                              : theme.muted
                          }
                        />
                      )}
                    </View>
                  </Pressable>
                ))}
                <View className="gap-3">
                  <Text className="font-manrope-semibold text-base text-foreground">
                    {t("accounts.form.accountColor")}
                  </Text>
                  <View className="flex-row flex-wrap gap-3">
                    {ACCOUNT_COLORS.map((swatch) => (
                      <Pressable
                        key={swatch}
                        accessibilityRole="radio"
                        accessibilityLabel={t(
                          "accounts.form.colorAccessibility",
                          { color: swatch },
                        )}
                        accessibilityState={{
                          checked: draft.color.toLowerCase() === swatch,
                        }}
                        onPress={() => change("color", swatch)}
                        className="size-11 items-center justify-center rounded-xl border border-white/10"
                        style={{ backgroundColor: swatch }}
                      >
                        {draft.color.toLowerCase() === swatch && (
                          <FilledIcon
                            name="check"
                            color={colorForeground(swatch)}
                            size={24}
                          />
                        )}
                      </Pressable>
                    ))}
                  </View>
                  <Input
                    accessibilityLabel={t("accounts.form.customHexColor")}
                    placeholder={t("accounts.form.hexPlaceholder")}
                    autoCapitalize="none"
                    autoCorrect={false}
                    maxLength={7}
                    value={draft.color}
                    onChangeText={(value) => change("color", value)}
                    className="rounded-xl bg-surface"
                    style={inputDirectionStyle}
                  />
                  <Text className="font-sans text-xs text-muted">
                    {t("accounts.form.colorHelp")}
                  </Text>
                </View>
              </View>
            </Animated.ScrollView>
          </BlurTargetView>
          <TopSafeAreaGradient headerHidden={headerHidden} />
          <Animated.View
            collapsable={false}
            pointerEvents={headerHidden ? "none" : "auto"}
            accessibilityElementsHidden={headerHidden}
            importantForAccessibility={
              headerHidden ? "no-hide-descendants" : "auto"
            }
            style={[
              styles.headerDock,
              {
                top: insets.top,
                opacity: headerOpacity,
                transform: [{ translateY: topControlsTranslateY }],
              },
            ]}
          >
            <Button
              isIconOnly
              isDisabled={isSaving}
              variant="ghost"
              accessibilityLabel={t("common.back")}
              onPress={goBack}
            >
              <FilledIcon name="arrow-left" size={24} />
            </Button>
            <Text
              accessibilityRole="header"
              className="font-manrope-bold text-xl text-foreground"
            >
              {editId
                ? t("accounts.form.editTitle")
                : t("accounts.form.newTitle")}
            </Text>
          </Animated.View>
          <Animated.View
            collapsable={false}
            pointerEvents={isSaving ? "none" : "auto"}
            style={[
              styles.selectorDock,
              { top: 64 + insets.top },
              {
                transform: [{ translateY: topControlsTranslateY }],
              },
            ]}
          >
            <AccountTypeSelector
              blurTarget={blurTargetRef}
              selected={draft.accountType}
              onChange={(type) => {
                change("accountType", type);
                if (!iconChosen.current) {
                  setDraft((current) => ({
                    ...current,
                    accountType: type,
                    icon: defaultIcons[type],
                    iconPath: null,
                  }));
                }
              }}
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
            <Pressable
              accessibilityLabel={
                isSaving
                  ? t("accounts.form.savingAccessibility")
                  : editId
                    ? t("accounts.form.saveChanges")
                    : t("accounts.form.addAccount")
              }
              accessibilityRole="button"
              accessibilityState={{ busy: isSaving, disabled: isSaving }}
              disabled={isSaving}
              onPress={save}
              style={({ pressed }) => [
                styles.addButton,
                { backgroundColor: theme.accent },
                pressed && styles.pressed,
                isSaving && styles.disabled,
              ]}
            >
              <FilledIcon
                name="credit-card-plus"
                size={24}
                tone="accent-foreground"
              />
              <Text className="font-manrope-bold text-base text-accent-foreground">
                {isSaving
                  ? t("accounts.form.saving")
                  : editId
                    ? t("accounts.form.saveChanges")
                    : t("accounts.form.addAccount")}
              </Text>
            </Pressable>
          </View>
        </View>
      </KeyboardAvoidingView>
      <CurrencySelectorSheet
        currencies={currencies}
        isOpen={picker === "currency"}
        selectedCode={draft.currencyCode}
        onOpenChange={(open) => {
          if (!open) setPicker(null);
        }}
        onSelect={(item) => {
          if (item.code === draft.currencyCode) return;
          try {
            const amount = draft.amount.trim()
              ? parseAccountAmount(draft.amount)
              : 0;
            setCurrencyChange({
              from: draft.currencyCode,
              to: item.code,
              amount,
            });
            setError("");
          } catch (reason) {
            setError(
              reason instanceof Error
                ? reason.message
                : t("accounts.form.validBalanceFirst"),
            );
          }
        }}
      />
      <AccountCurrencyChangeSheet
        request={currencyChange}
        onClose={() => setCurrencyChange(null)}
        onApply={(amount, explanation) => {
          if (!currencyChange) return;
          setDraft((current) => ({
            ...current,
            currencyCode: currencyChange.to,
            amount: String(amount),
          }));
          setCurrencyChangeNote(explanation);
          setCurrencyChange(null);
        }}
      />
      {picker === "icon" && (
        <IconPicker
          selected={{ name: draft.icon, pathData: draft.iconPath }}
          onClose={() => setPicker(null)}
          onSelect={(icon) => {
            iconChosen.current = true;
            setDraft((current) => ({
              ...current,
              icon: icon.name,
              iconPath: icon.pathData,
            }));
            setError("");
          }}
        />
      )}
      {picker === "company" && (
        <AccountPicker
          title={t("accounts.form.cardCompany")}
          onClose={() => setPicker(null)}
        >
          <ScrollView contentContainerClassName="px-5 pb-5">
            {CARD_COMPANIES.map((company) => (
              <Pressable
                key={company}
                accessibilityRole="radio"
                accessibilityLabel={company}
                accessibilityState={{ checked: draft.cardCompany === company }}
                onPress={() => {
                  change("cardCompany", company);
                  setPicker(null);
                }}
                className="min-h-16 flex-row items-center gap-4 border-b border-border py-4"
              >
                <CardCompanyLogo company={company} />
                <Text className="flex-1 font-manrope-semibold text-base text-foreground">
                  {company}
                </Text>
                {draft.cardCompany === company && (
                  <FilledIcon name="check" size={24} tone="accent" />
                )}
              </Pressable>
            ))}
          </ScrollView>
        </AccountPicker>
      )}
      {picker === "day" && (
        <AccountPicker
          title={t("accounts.form.monthlyPaymentDay")}
          onClose={() => setPicker(null)}
        >
          <ScrollView contentContainerClassName="gap-5 px-5 py-5">
            <Text className="font-sans text-base text-muted">
              {t("accounts.form.choosePaymentDay")}
            </Text>
            <View className="flex-row flex-wrap gap-2">
              {Array.from({ length: 31 }, (_, index) => index + 1).map(
                (day) => (
                  <Pressable
                    key={day}
                    accessibilityRole="radio"
                    accessibilityLabel={t("accounts.form.paymentDay", { day })}
                    accessibilityState={{ checked: draft.paymentDay === day }}
                    onPress={() => {
                      change("paymentDay", day);
                      setPicker(null);
                    }}
                    className={`size-12 items-center justify-center rounded-full ${draft.paymentDay === day ? "bg-accent" : "bg-surface"}`}
                  >
                    <Text
                      className={`font-manrope-bold text-base ${draft.paymentDay === day ? "text-accent-foreground" : "text-foreground"}`}
                    >
                      {String(day).padStart(2, "0")}
                    </Text>
                  </Pressable>
                ),
              )}
            </View>
            <Text className="font-sans text-sm text-muted">
              {t("accounts.form.shorterMonths")}
            </Text>
          </ScrollView>
        </AccountPicker>
      )}
      {picker === "bank" && (
        <AccountPicker
          title={t("accounts.form.bankAccount")}
          onClose={() => setPicker(null)}
        >
          <ScrollView contentContainerClassName="px-5 pb-5">
            {bankAccounts.length ? (
              bankAccounts.map((account) => (
                <Pressable
                  key={account.id}
                  accessibilityRole="radio"
                  accessibilityLabel={t(
                    "accounts.form.bankAccountAccessibility",
                    { name: account.name, bankName: account.bankName },
                  )}
                  accessibilityState={{
                    checked: draft.linkedBankAccountId === account.id,
                  }}
                  onPress={() => {
                    change("linkedBankAccountId", account.id);
                    setPicker(null);
                  }}
                  className="min-h-20 flex-row items-center gap-4 border-b border-border py-4"
                >
                  <View
                    className="size-12 items-center justify-center rounded-2xl"
                    style={{ backgroundColor: account.color }}
                  >
                    <AccountIcon
                      name={account.icon}
                      pathData={account.iconPath}
                      color={colorForeground(account.color)}
                      size={24}
                    />
                  </View>
                  <View className="flex-1 gap-1">
                    <Text className="font-manrope-semibold text-base text-foreground">
                      {account.name}
                    </Text>
                    <Text className="font-sans text-sm text-muted">
                      {account.bankName} · {account.currencyCode}
                    </Text>
                  </View>
                  {draft.linkedBankAccountId === account.id && (
                    <FilledIcon name="check" size={24} tone="accent" />
                  )}
                </Pressable>
              ))
            ) : (
              <View className="items-center gap-3 px-4 py-12">
                <FilledIcon name="bank" size={36} tone="accent" />
                <Text className="text-center font-manrope-semibold text-base text-foreground">
                  {t("accounts.form.noBankAccounts")}
                </Text>
                <Text className="text-center font-sans text-sm leading-5 text-muted">
                  {t("accounts.form.noBankAccountsHelp")}
                </Text>
              </View>
            )}
          </ScrollView>
        </AccountPicker>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  formArea: {
    flex: 1,
  },
  scrollTarget: {
    flex: 1,
  },
  headerDock: {
    alignItems: "center",
    flexDirection: "row",
    gap: 12,
    left: 16,
    position: "absolute",
    right: 16,
    top: 0,
    zIndex: 20,
  },
  headerSpace: {
    height: 56,
  },
  selectorSpace: {
    height: 84,
  },
  selectorDock: {
    left: 12,
    position: "absolute",
    right: 12,
    top: 64,
    zIndex: 20,
  },
  actionDock: {
    gap: 6,
    left: 0,
    paddingHorizontal: 12,
    position: "absolute",
    right: 0,
    zIndex: 20,
  },
  addButton: {
    alignItems: "center",
    borderRadius: 29,
    flexDirection: "row",
    gap: 10,
    height: 58,
    justifyContent: "center",
    overflow: "hidden",
  },
  pressed: { opacity: 0.72 },
  disabled: { opacity: 0.5 },
});
