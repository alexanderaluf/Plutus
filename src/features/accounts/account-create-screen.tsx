import { AppAlert } from "@/shared/ui/app-alert";
import { useCollapsingHeader } from "@/shared/ui/collapsing-header";
import {
  BottomSafeAreaGradient,
  TopSafeAreaGradient,
} from "@/shared/ui/safe-area-gradients";
import { BlurTargetView } from "expo-blur";
import { uuid } from "expo";
import { useRouter } from "expo-router";
import { Button } from "heroui-native";
import {
  useEffect,
  useRef,
  useState,
  type ComponentType,
  type RefObject,
} from "react";
import { useTranslation } from "react-i18next";
import {
  Animated,
  I18nManager,
  Keyboard,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  TextInput,
  View,
  type ScrollViewInstance,
  type TextInputInstance,
  type ViewInstance,
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
  ACCOUNT_TYPES,
  CARD_COMPANIES,
  addAccountToDocument,
  parseAccountAmount,
  updateAccountInDocument,
  validateAccountDraft,
  type AccountDraft,
} from "@/data/model/account-record";
import {
  selectAccountDraft,
  selectBankAccounts,
} from "@/data/selectors/document-selectors";
import { CurrencySelectorSheet } from "@/features/profile/components/currency-selector-sheet";
import { getCurrencySymbol } from "@/features/profile/data/currency-symbols";
import { useProfiles } from "@/features/profile/profile-provider";
import { useAppLocalization } from "@/localization/localization-provider";
import { colorWithAlpha, useAppThemeColors } from "@/shared/theme/app-theme";
import { Text } from "@/shared/ui/app-text";
import { FilledIcon, type FilledIconName } from "@/shared/ui/filled-icon";
import { GlassSegmentedControl } from "@/shared/ui/glass-segmented-control";
import { usePostFrameReady } from "@/shared/lib/use-post-frame-ready";
import type { IconSelection } from "@/shared/ui/record-icon";

type IconPickerProps = {
  selected: IconSelection;
  onSelect: (icon: IconSelection) => void;
  onClose: () => void;
};

let cachedIconPicker: ComponentType<IconPickerProps> | null = null;
function LazyIconPicker(props: IconPickerProps) {
  if (!cachedIconPicker) {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    cachedIconPicker = require("@/shared/ui/icon-picker")
      .IconPicker as ComponentType<IconPickerProps>;
  }
  const Picker = cachedIconPicker;
  return <Picker {...props} />;
}
import { ACCOUNT_COLORS, colorForeground } from "./account-options";
import {
  AccountCurrencyChangeSheet,
  type CurrencyChangeRequest,
} from "./components/account-currency-change-sheet";
import {
  CONTINUOUS,
  ChoicePill,
  FieldInput,
  FormCard,
  FormDivider,
  FormField,
  FormHelp,
  FormLabel,
  SwitchRow,
  TABULAR,
} from "@/shared/ui/form-ui";
import { AccountIcon } from "./components/account-icon";
import { CardCompanyLogo } from "./components/card-company-logo";
type SavingsDetailsFormProps = import("react").ComponentProps<
  typeof import("./components/savings-details-form").SavingsDetailsForm
>;

let cachedSavingsDetailsForm: ComponentType<SavingsDetailsFormProps> | null =
  null;
function LazySavingsDetailsForm(props: SavingsDetailsFormProps) {
  if (!cachedSavingsDetailsForm) {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    cachedSavingsDetailsForm = require("./components/savings-details-form")
      .SavingsDetailsForm as ComponentType<SavingsDetailsFormProps>;
  }
  const Form = cachedSavingsDetailsForm;
  return <Form {...props} />;
}
import {
  createInitialAccountDraft,
  defaultIcons,
} from "./lib/initial-account-draft";


/** The add button names the kind of account it creates through its icon. */
const actionIcons: Record<AccountType, FilledIconName> = {
  card: "credit-card-plus",
  cash: "cash",
  savings: "piggy-bank",
  bank: "bank",
};

type AccountType = (typeof ACCOUNT_TYPES)[number];
const ACCOUNT_TYPE_OPTIONS: readonly AccountType[] = [
  "bank",
  "card",
  "cash",
  "savings",
];
const DAYS = Array.from({ length: 31 }, (_, index) => index + 1);
const DAY_PILL = 48;
const DAY_GAP = 8;

const SECTION_LAYOUT = LinearTransition.duration(240)
  .easing(Easing.bezier(0.77, 0, 0.175, 1))
  .reduceMotion(ReduceMotion.System);
const SECTION_ENTER = FadeIn.duration(200)
  .easing(Easing.bezier(0.23, 1, 0.32, 1))
  .reduceMotion(ReduceMotion.System);

function AccountTypeSelector({
  blurTarget,
  selected,
  onChange,
}: {
  blurTarget: RefObject<ViewInstance | null>;
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

export function AccountCreateScreen({ editId }: { editId?: string }) {
  const { t } = useTranslation();
  const { direction } = useAppLocalization();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const theme = useAppThemeColors();
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
      (editId ? selectAccountDraft(document, editId) : null) ??
      createInitialAccountDraft(document, activeProfile.currencyCode),
  );
  const [picker, setPicker] = useState<"icon" | "currency" | null>(null);
  const [showHex, setShowHex] = useState(
    () => !ACCOUNT_COLORS.includes(draft.color.toLowerCase()),
  );
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState("");
  const saving = useRef(false);
  const blurTargetRef = useRef<ViewInstance | null>(null);
  const amountRef = useRef<TextInputInstance>(null);
  const { scrollY, headerHidden } = useCollapsingHeader();
  const accountId = useRef<string | null>(null);
  const iconChosen = useRef(!!editId);
  const color = /^#[a-f\d]{6}$/i.test(draft.color)
    ? draft.color
    : ACCOUNT_COLORS[0];
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
  const isNegative = draft.amount.trim().startsWith("-");
  const isCard = draft.accountType === "card";
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

  /** Card spending is entered as a positive amount and stored as debt. */
  function toSavedDraft(value: AccountDraft): AccountDraft {
    return {
      ...value,
      amount:
        value.accountType === "card" &&
        Number(value.amount.replace(",", ".")) > 0
          ? `-${value.amount.trim()}`
          : value.amount,
    };
  }
  const isReady = (() => {
    try {
      validateAccountDraft(toSavedDraft(draft));
      return !isCard || !!linkedBankAccount;
    } catch {
      return false;
    }
  })();

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
    const draftToSave = toSavedDraft(draft);
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
      AppAlert.alert(t("accounts.form.saveErrorTitle"), message);
    } finally {
      saving.current = false;
      setIsSaving(false);
    }
  }

  const postFrameReady = usePostFrameReady();
  const hasInteracted = useRef(false);
  const balanceLabel = isCard
    ? t("accounts.form.cardCurrentBalance", { currency: draft.currencyCode })
    : draft.accountType === "savings"
      ? t("accounts.form.currentBalance", { currency: draft.currencyCode })
      : t("accounts.form.openingBalance", { currency: draft.currencyCode });
  const accountNumberField = (
    <FormField label={t("accounts.form.accountNumberOptional")}>
      <FieldInput
        accessibilityLabel={t("accounts.form.accountNumber")}
        placeholder={t("accounts.form.accountNumber")}
        autoCorrect={false}
        maxLength={64}
        value={draft.accountNumber}
        onChangeText={(value) => change("accountNumber", value)}
      />
    </FormField>
  );

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
                paddingBottom: 120 + insets.bottom,
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
                className="gap-3 px-4"
              >
                {/* Identity: the tile is a live preview of the colour and icon. */}
                <View>
                  <FormCard>
                    <View className="flex-row items-center gap-3.5">
                      <Pressable
                        accessibilityRole="button"
                        accessibilityLabel={t("accounts.form.chooseIcon")}
                        onPress={() => openPicker("icon")}
                        className="size-[72px] items-center justify-center rounded-[22px]"
                        style={({ pressed }) => ({
                          backgroundColor: color,
                          opacity: pressed ? 0.8 : 1,
                          ...CONTINUOUS,
                        })}
                      >
                        <AccountIcon
                          name={draft.icon}
                          pathData={draft.iconPath}
                          color={colorForeground(color)}
                          size={34}
                        />
                        <View
                          className="absolute -bottom-1 rounded-full border-2 bg-surface p-1"
                          style={[
                            { borderColor: theme.surface },
                            I18nManager.isRTL ? { left: -4 } : { right: -4 },
                          ]}
                        >
                          <FilledIcon name="pencil" size={13} />
                        </View>
                      </Pressable>
                      <View className="min-w-0 flex-1 gap-2">
                        <FormLabel>{t("accounts.form.accountName")}</FormLabel>
                        <FieldInput
                          accessibilityLabel={t("accounts.form.accountName")}
                          placeholder={
                            draft.accountType === "bank"
                              ? t("accounts.form.namePlaceholders.bank")
                              : draft.accountType === "savings"
                                ? t("accounts.form.namePlaceholders.savings")
                                : t("accounts.form.namePlaceholders.default")
                          }
                          maxLength={100}
                          returnKeyType="next"
                          submitBehavior="submit"
                          onSubmitEditing={() => amountRef.current?.focus()}
                          value={draft.name}
                          onChangeText={(value) => change("name", value)}
                          style={styles.nameInput}
                        />
                      </View>
                    </View>
                    <View className="gap-2.5">
                      <FormLabel>{t("accounts.form.accountColor")}</FormLabel>
                      <ScrollView
                        horizontal
                        showsHorizontalScrollIndicator={false}
                        keyboardShouldPersistTaps="handled"
                        contentContainerStyle={styles.swatches}
                        style={styles.bleed}
                      >
                        {ACCOUNT_COLORS.map((swatch) => {
                          const selected =
                            draft.color.toLowerCase() === swatch;
                          return (
                            <Pressable
                              key={swatch}
                              accessibilityRole="radio"
                              accessibilityLabel={t(
                                "accounts.form.colorAccessibility",
                                { color: swatch },
                              )}
                              accessibilityState={{ checked: selected }}
                              onPress={() => {
                                change("color", swatch);
                                setShowHex(false);
                              }}
                              style={[
                                styles.swatchRing,
                                {
                                  borderColor: selected
                                    ? theme.foreground
                                    : "transparent",
                                },
                              ]}
                            >
                              <View
                                style={[
                                  styles.swatch,
                                  {
                                    backgroundColor: swatch,
                                    borderColor: colorWithAlpha(
                                      theme.foreground,
                                      0.12,
                                    ),
                                  },
                                ]}
                              >
                                {selected && (
                                  <FilledIcon
                                    name="check"
                                    color={colorForeground(swatch)}
                                    size={18}
                                  />
                                )}
                              </View>
                            </Pressable>
                          );
                        })}
                        <Pressable
                          accessibilityRole="button"
                          accessibilityLabel={t("accounts.form.customHexColor")}
                          accessibilityState={{ expanded: showHex }}
                          onPress={() => setShowHex((value) => !value)}
                          style={[
                            styles.swatchRing,
                            {
                              borderColor: showHex
                                ? theme.foreground
                                : "transparent",
                            },
                          ]}
                        >
                          <View
                            style={[
                              styles.swatch,
                              {
                                backgroundColor: theme.surfaceSecondary,
                                borderColor: theme.border,
                              },
                            ]}
                          >
                            <Text className="font-manrope-bold text-[15px] text-foreground">
                              #
                            </Text>
                          </View>
                        </Pressable>
                      </ScrollView>
                      {showHex && (
                        <Reanimated.View entering={SECTION_ENTER} className="gap-2">
                          <FieldInput
                            accessibilityLabel={t(
                              "accounts.form.customHexColor",
                            )}
                            placeholder={t("accounts.form.hexPlaceholder")}
                            autoCapitalize="none"
                            autoCorrect={false}
                            maxLength={7}
                            value={draft.color}
                            onChangeText={(value) => change("color", value)}
                          />
                          <FormHelp>{t("accounts.form.colorHelp")}</FormHelp>
                        </Reanimated.View>
                      )}
                    </View>
                  </FormCard>
                </View>

                {/* Balance: the one number every account needs, set large. */}
                <View>
                  <FormCard>
                    <View className="gap-2.5">
                      <FormLabel>{balanceLabel}</FormLabel>
                      <View
                        className="flex-row items-center gap-2 rounded-[20px] p-2"
                        style={{
                          backgroundColor: theme.surfaceSecondary,
                          ...CONTINUOUS,
                        }}
                      >
                        <Pressable
                          accessibilityRole="button"
                          accessibilityLabel={t(
                            "accounts.form.toggleNegativeBalance",
                          )}
                          accessibilityState={{ selected: isNegative }}
                          onPress={() =>
                            change(
                              "amount",
                              draft.amount.startsWith("-")
                                ? draft.amount.slice(1)
                                : `-${draft.amount}`,
                            )
                          }
                          className="size-12 items-center justify-center rounded-2xl"
                          style={({ pressed }) => ({
                            backgroundColor: isNegative
                              ? colorWithAlpha(theme.danger, 0.16)
                              : theme.surface,
                            opacity: pressed ? 0.72 : 1,
                            ...CONTINUOUS,
                          })}
                        >
                          <Text
                            className="font-manrope-bold text-[17px]"
                            style={{
                              color: isNegative ? theme.danger : theme.foreground,
                            }}
                          >
                            +/−
                          </Text>
                        </Pressable>
                        <TextInput
                          ref={amountRef}
                          accessibilityLabel={t(
                            "accounts.form.openingBalanceAccessibility",
                          )}
                          placeholder={t("accounts.form.amountPlaceholder")}
                          placeholderTextColor={colorWithAlpha(
                            theme.muted,
                            0.6,
                          )}
                          selectionColor={theme.accent}
                          keyboardType="decimal-pad"
                          value={draft.amount}
                          onChangeText={(value) => change("amount", value)}
                          style={[
                            styles.amountInput,
                            TABULAR,
                            {
                              color: isNegative
                                ? theme.danger
                                : theme.foreground,
                              direction,
                              writingDirection: direction,
                              textAlign: direction === "rtl" ? "right" : "left",
                            },
                          ]}
                        />
                        <Pressable
                          accessibilityRole="button"
                          accessibilityLabel={`${t("accounts.form.accountCurrency")}: ${draft.currencyCode}`}
                          onPress={() => openPicker("currency")}
                          className="h-12 flex-row items-center gap-1.5 rounded-2xl px-3"
                          style={({ pressed }) => ({
                            backgroundColor: theme.surface,
                            opacity: pressed ? 0.72 : 1,
                            ...CONTINUOUS,
                          })}
                        >
                          <Text className="font-manrope-bold text-[15px] text-foreground">
                            {getCurrencySymbol(draft.currencyCode)}
                          </Text>
                          <Text className="font-manrope-semibold text-[12px] text-muted">
                            {draft.currencyCode}
                          </Text>
                          <FilledIcon
                            name="chevron-right"
                            size={16}
                            tone="muted"
                            style={{ transform: [{ rotate: "90deg" }] }}
                          />
                        </Pressable>
                      </View>
                      {isCard && (
                        <FormHelp>{t("accounts.form.cardCurrentBalanceHelp")}</FormHelp>
                      )}
                      {draft.accountType === "bank" && (
                        <FormHelp>{t("accounts.form.negativeBalanceHelp")}</FormHelp>
                      )}
                      {!!currencyChangeNote && (
                        <FormHelp>
                          {currencyChangeNote}{" "}
                          {t("accounts.form.pastTransactionsCurrency")}
                        </FormHelp>
                      )}
                    </View>
                    {isCard && (
                      <>
                        <FormDivider />
                        <FormField
                          label={t("accounts.form.creditLimit", {
                            currency: draft.currencyCode,
                          })}
                          help={t("accounts.form.creditLimitHelp")}
                        >
                          <FieldInput
                            accessibilityLabel={t(
                              "accounts.form.creditLimitAccessibility",
                            )}
                            placeholder={t(
                              "accounts.form.creditLimitPlaceholder",
                            )}
                            keyboardType="decimal-pad"
                            value={draft.creditLimit ?? ""}
                            onChangeText={(value) =>
                              change("creditLimit", value)
                            }
                            style={TABULAR}
                          />
                        </FormField>
                      </>
                    )}
                  </FormCard>
                </View>

                {postFrameReady ? (
                  <>
                    {/* Details for the selected type only. */}
                    <Reanimated.View
                      key={draft.accountType}
                      entering={hasInteracted.current ? SECTION_ENTER : undefined}
                      layout={SECTION_LAYOUT}
                      className="gap-3"
                    >
                      {draft.accountType === "bank" && (
                        <FormCard title={t("accounts.form.bankDetails")} icon="bank">
                          <FormField label={t("accounts.form.bankName")}>
                            <FieldInput
                              accessibilityLabel={t("accounts.form.bankName")}
                              placeholder={t("accounts.form.bankNamePlaceholder")}
                              maxLength={100}
                              value={draft.bankName}
                              onChangeText={(value) => change("bankName", value)}
                            />
                          </FormField>
                          {accountNumberField}
                        </FormCard>
                      )}
                      {isCard && (
                        <CardDetails
                          draft={draft}
                          bankAccounts={bankAccounts}
                          linkedBankAccount={linkedBankAccount}
                          onChange={change}
                          accountNumberField={accountNumberField}
                        />
                      )}
                      {draft.accountType === "savings" && (
                        <LazySavingsDetailsForm
                          balance={savingsBalance}
                          currencyCode={draft.currencyCode}
                          value={draft.savingsDetails}
                          onChange={(savingsDetails) =>
                            change("savingsDetails", savingsDetails)
                          }
                        />
                      )}
                      {(draft.accountType === "cash" ||
                        draft.accountType === "savings") && (
                        <FormCard>{accountNumberField}</FormCard>
                      )}
                    </Reanimated.View>

                    <View>
                      <FormCard>
                        <SwitchRow
                          icon="check"
                          title={t("accounts.form.defaultAccount")}
                          description={t("accounts.form.defaultAccountHelp")}
                          value={draft.isDefault}
                          disabled={isSaving}
                          onChange={(value) => change("isDefault", value)}
                        />
                        <FormDivider />
                        <SwitchRow
                          icon="eye-off"
                          tone="danger"
                          title={t("accounts.form.excludeAccount")}
                          description={t("accounts.form.excludeAccountHelp")}
                          value={draft.isExcluded}
                          disabled={isSaving}
                          onChange={(value) => change("isExcluded", value)}
                        />
                      </FormCard>
                    </View>
                  </>
                ) : null}
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
                hasInteracted.current = true;
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
                className="px-2 text-center font-sans text-sm text-danger"
              >
                {error}
              </Text>
            )}
            <SaveButton
              ready={isReady}
              busy={isSaving}
              icon={actionIcons[draft.accountType]}
              label={
                isSaving
                  ? t("accounts.form.saving")
                  : editId
                    ? t("accounts.form.saveChanges")
                    : t("accounts.form.addAccount")
              }
              accessibilityLabel={
                isSaving
                  ? t("accounts.form.savingAccessibility")
                  : editId
                    ? t("accounts.form.saveChanges")
                    : t("accounts.form.addAccount")
              }
              onPress={save}
            />
          </View>
        </View>
      </KeyboardAvoidingView>
      <CurrencySelectorSheet
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
        <LazyIconPicker
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
    </View>
  );
}

/**
 * Card details answer three questions in one place, each with one tap:
 * which card (last digits and company), when it is paid, and from where.
 */
function CardDetails({
  draft,
  bankAccounts,
  linkedBankAccount,
  onChange,
  accountNumberField,
}: {
  draft: AccountDraft;
  bankAccounts: ReturnType<typeof selectBankAccounts>;
  linkedBankAccount: ReturnType<typeof selectBankAccounts>[number] | undefined;
  onChange: <K extends keyof AccountDraft>(
    key: K,
    value: AccountDraft[K],
  ) => void;
  accountNumberField: React.ReactNode;
}) {
  const { t } = useTranslation();
  const theme = useAppThemeColors();
  const dayStrip = useRef<ScrollViewInstance>(null);

  useEffect(() => {
    // An existing payment day starts in view; RTL scroll origins differ per OS.
    if (!draft.paymentDay || I18nManager.isRTL) return;
    const x = Math.max(0, (draft.paymentDay - 3) * (DAY_PILL + DAY_GAP));
    const frame = requestAnimationFrame(() =>
      dayStrip.current?.scrollTo({ x, animated: false }),
    );
    return () => cancelAnimationFrame(frame);
    // Only on first display; later taps are already visible.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <FormCard title={t("accounts.form.cardDetails")} icon="credit-card">
      <FormField label={t("accounts.form.lastFourDigits")}>
        <View
          className="h-14 flex-row items-center gap-3 rounded-2xl px-4"
          style={{ backgroundColor: theme.surfaceSecondary, ...CONTINUOUS }}
        >
          <Text
            className="font-manrope-bold text-[18px] text-muted"
            style={{ letterSpacing: 2 }}
          >
            ••••
          </Text>
          <TextInput
            accessibilityLabel={t("accounts.form.lastFourAccessibility")}
            placeholder={t("accounts.form.lastFourPlaceholder")}
            placeholderTextColor={colorWithAlpha(theme.muted, 0.6)}
            selectionColor={theme.accent}
            keyboardType="number-pad"
            maxLength={4}
            value={draft.cardLastFour}
            onChangeText={(value) => {
              const digits = value.replace(/\D/g, "");
              onChange("cardLastFour", digits);
              // All four digits entered: put the keyboard away for the taps below.
              if (digits.length === 4) Keyboard.dismiss();
            }}
            style={[styles.lastFour, TABULAR, { color: theme.foreground }]}
          />
        </View>
      </FormField>

      <View className="gap-2.5">
        <FormLabel>{t("accounts.form.cardCompany")}</FormLabel>
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
          contentContainerStyle={styles.strip}
          style={styles.bleed}
        >
          {CARD_COMPANIES.map((company) => {
            const selected = draft.cardCompany === company;
            return (
              <ChoicePill
                key={company}
                selected={selected}
                accessibilityLabel={company}
                onPress={() => onChange("cardCompany", company)}
              >
                <CardCompanyLogo company={company} width={40} height={26} />
                <Text
                  className={`font-manrope-semibold text-[13px] ${selected ? "text-accent-foreground" : "text-foreground"}`}
                >
                  {company}
                </Text>
              </ChoicePill>
            );
          })}
        </ScrollView>
      </View>

      <View className="gap-2.5">
        <View className="gap-0.5">
          <FormLabel>{t("accounts.form.monthlyPaymentDay")}</FormLabel>
          <FormHelp>{t("accounts.form.choosePaymentDay")}</FormHelp>
        </View>
        <ScrollView
          ref={dayStrip}
          horizontal
          showsHorizontalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
          contentContainerStyle={styles.strip}
          style={styles.bleed}
        >
          {DAYS.map((day) => {
            const selected = draft.paymentDay === day;
            return (
              <ChoicePill
                key={day}
                selected={selected}
                minWidth={DAY_PILL}
                accessibilityLabel={t("accounts.form.paymentDay", { day })}
                onPress={() => onChange("paymentDay", day)}
              >
                <Text
                  className={`font-manrope-bold text-[16px] ${selected ? "text-accent-foreground" : "text-foreground"}`}
                  style={TABULAR}
                >
                  {String(day).padStart(2, "0")}
                </Text>
              </ChoicePill>
            );
          })}
        </ScrollView>
        <FormHelp>{t("accounts.form.shorterMonths")}</FormHelp>
      </View>

      <FormDivider />

      <View className="gap-2.5">
        <FormLabel>{t("accounts.form.bankAccount")}</FormLabel>
        {bankAccounts.length ? (
          <View
            className="overflow-hidden rounded-2xl"
            style={{ backgroundColor: theme.surfaceSecondary, ...CONTINUOUS }}
          >
            {bankAccounts.map((account, index) => {
              const selected = draft.linkedBankAccountId === account.id;
              return (
                <Pressable
                  key={account.id}
                  accessibilityRole="radio"
                  accessibilityLabel={t(
                    "accounts.form.bankAccountAccessibility",
                    { name: account.name, bankName: account.bankName },
                  )}
                  accessibilityState={{ checked: selected }}
                  onPress={() => onChange("linkedBankAccountId", account.id)}
                  className="min-h-16 flex-row items-center gap-3 px-3.5 py-3"
                  style={({ pressed }) => ({
                    opacity: pressed ? 0.72 : 1,
                    borderTopWidth: index ? StyleSheet.hairlineWidth : 0,
                    borderTopColor: theme.border,
                    backgroundColor: selected
                      ? colorWithAlpha(theme.accent, 0.12)
                      : "transparent",
                  })}
                >
                  <View
                    className="size-10 items-center justify-center rounded-xl"
                    style={{ backgroundColor: account.color, ...CONTINUOUS }}
                  >
                    <AccountIcon
                      name={account.icon}
                      pathData={account.iconPath}
                      color={colorForeground(account.color)}
                      size={20}
                    />
                  </View>
                  <View className="min-w-0 flex-1 gap-0.5">
                    <Text
                      numberOfLines={1}
                      className="font-manrope-semibold text-[15px] leading-[20px] text-foreground"
                    >
                      {account.name}
                    </Text>
                    <Text
                      numberOfLines={1}
                      className="font-sans text-[12px] leading-[16px] text-muted"
                    >
                      {account.bankName} · {account.currencyCode}
                    </Text>
                  </View>
                  <View
                    className="size-6 items-center justify-center rounded-full"
                    style={{
                      backgroundColor: selected ? theme.accent : "transparent",
                      borderWidth: selected ? 0 : 1.5,
                      borderColor: theme.border,
                    }}
                  >
                    {selected && (
                      <FilledIcon
                        name="check"
                        size={16}
                        tone="accent-foreground"
                      />
                    )}
                  </View>
                </Pressable>
              );
            })}
          </View>
        ) : (
          <View
            className="items-center gap-2 rounded-2xl px-4 py-6"
            style={{ backgroundColor: theme.surfaceSecondary, ...CONTINUOUS }}
          >
            <FilledIcon name="bank" size={28} tone="accent" />
            <Text className="text-center font-manrope-semibold text-[15px] text-foreground">
              {t("accounts.form.noBankAccounts")}
            </Text>
            <Text className="text-center font-sans text-[12px] leading-[17px] text-muted">
              {t("accounts.form.noBankAccountsHelp")}
            </Text>
          </View>
        )}
        <FormHelp>
          {t("accounts.form.paymentHelp")}
          {linkedBankAccount &&
          linkedBankAccount.currencyCode !== draft.currencyCode
            ? ` ${t("accounts.form.paymentConversionHelp", {
                from: draft.currencyCode,
                to: linkedBankAccount.currencyCode,
              })}`
            : ""}
        </FormHelp>
      </View>

      <FormDivider />
      {accountNumberField}
    </FormCard>
  );
}

/**
 * Dimmed until the required details are in, then fully lit: the button shows
 * when the account is ready. It stays pressable so a tap explains what is missing.
 */
function SaveButton({
  ready,
  busy,
  icon,
  label,
  accessibilityLabel,
  onPress,
}: {
  ready: boolean;
  busy: boolean;
  icon: FilledIconName;
  label: string;
  accessibilityLabel: string;
  onPress: () => void;
}) {
  const theme = useAppThemeColors();
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

  return (
    <Reanimated.View style={style}>
      <Pressable
        accessibilityLabel={accessibilityLabel}
        accessibilityRole="button"
        accessibilityState={{ busy, disabled: busy }}
        disabled={busy}
        onPress={onPress}
        style={({ pressed }) => [
          styles.addButton,
          { backgroundColor: theme.accent },
          pressed && styles.pressed,
          busy && styles.disabled,
        ]}
      >
        <FilledIcon name={icon} size={24} tone="accent-foreground" />
        <Text className="font-manrope-bold text-[17px] text-accent-foreground">
          {label}
        </Text>
      </Pressable>
    </Reanimated.View>
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
  nameInput: {
    fontSize: 17,
  },
  amountInput: {
    flex: 1,
    fontFamily: "Huninn_400Regular",
    fontSize: 32,
    height: 56,
    minWidth: 0,
    paddingHorizontal: 4,
  },
  lastFour: {
    flex: 1,
    fontFamily: "Huninn_400Regular",
    fontSize: 20,
    height: 56,
    letterSpacing: 4,
  },
  // Horizontal rows run to the card edges so they read as scrollable.
  bleed: {
    marginHorizontal: -16,
  },
  strip: {
    gap: DAY_GAP,
    paddingHorizontal: 16,
  },
  swatches: {
    gap: 6,
    paddingHorizontal: 12,
  },
  swatchRing: {
    borderRadius: 999,
    borderWidth: 2,
    padding: 2,
  },
  swatch: {
    alignItems: "center",
    borderRadius: 999,
    borderWidth: 1,
    height: 40,
    justifyContent: "center",
    width: 40,
  },
  pressed: { opacity: 0.72 },
  disabled: { opacity: 0.5 },
});
