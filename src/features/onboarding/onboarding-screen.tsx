import { Button, useThemeColor } from "heroui-native";
import { useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import {
  ActivityIndicator,
  Alert,
  BackHandler,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  TextInput,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useLocalData } from "@/data/local-data-provider";
import {
  DATE_FORMATS,
  type AppLanguage,
  type AppDateFormat,
} from "@/data/model/backup-document";
import {
  completeSetup,
  formatAppDate,
  getSetupStatus,
  withBaseCategories,
} from "@/data/model/onboarding";
import { cloneBackupDocument } from "@/data/model/normalize-backup";
import { pickAndImportBackup } from "@/data/backup/backup-service";
import {
  stageAttachments,
  commitStagedAttachments,
  discardStagedAttachments,
} from "@/data/attachments/attachment-store";
import { LANGUAGE_OPTIONS } from "@/localization/languages";
import { useAppLocalization } from "@/localization/localization-provider";
import {
  currencies,
  type CurrencyOption,
} from "@/features/profile/data/currencies-data";
import { CurrencySelectorSheet } from "@/features/profile/components/currency-selector-sheet";
import { Text } from "@/shared/ui/app-text";
import { FilledIcon, type FilledIconName } from "@/shared/ui/filled-icon";

const STEPS = [
  "welcome",
  "language",
  "control",
  "name",
  "currency",
  "date",
  "month",
  "week",
] as const;
const ICONS: FilledIconName[] = [
  "wallet",
  "translate",
  "shield-check",
  "account",
  "currency-usd",
  "clock",
  "clock",
  "clock",
];
const WEEKDAYS = [
  "sunday",
  "monday",
  "tuesday",
  "wednesday",
  "thursday",
  "friday",
  "saturday",
] as const;
// Availability lives in a shared catalog. Russian is retained for existing
// installations; the requested initial setup currently offers English/Hebrew.
const SETUP_LANGUAGES = LANGUAGE_OPTIONS.filter(
  (option) => option.isAvailable && option.code !== "ru",
);

export function OnboardingScreen({
  onBusyChange,
}: {
  onBusyChange: (busy: boolean) => void;
}) {
  const { document, updateDocument, replaceDocument } = useLocalData();
  const {
    language: activeLanguage,
    isRTL,
    setPreviewLanguage,
  } = useAppLocalization();
  const { t } = useTranslation();
  const insets = useSafeAreaInsets();
  const [foreground, muted, accent] = useThemeColor([
    "foreground",
    "muted",
    "accent",
  ]);
  const [step, setStep] = useState(0);
  const [demo, setDemo] = useState(false);
  const [language, setLanguage] = useState<AppLanguage>(
    activeLanguage === "he" ? "he" : "en",
  );
  const [name, setName] = useState("");
  const [currency, setCurrency] = useState<CurrencyOption | null>(null);
  const [currencyOpen, setCurrencyOpen] = useState(false);
  const [dateFormat, setDateFormat] = useState<AppDateFormat>("DD/MM/YYYY");
  const [monthStartDay, setMonthStartDay] = useState(1);
  const [weekStartDay, setWeekStartDay] = useState(0);
  const [backupAccepted, setBackupAccepted] = useState(false);
  const [responsibilityAccepted, setResponsibilityAccepted] = useState(false);
  const [busy, setBusy] = useState(false);
  const busyRef = useRef(false);
  const scroll = useRef<ScrollView>(null);
  const key = STEPS[step];
  const disabled =
    busy ||
    (key === "control" && (!backupAccepted || !responsibilityAccepted)) ||
    (key === "name" && !name.trim()) ||
    (key === "currency" && !currency);

  useEffect(() => () => setPreviewLanguage(null), [setPreviewLanguage]);
  useEffect(() => {
    scroll.current?.scrollTo({ y: 0, animated: false });
  }, [step]);
  useEffect(() => {
    const subscription = BackHandler.addEventListener(
      "hardwareBackPress",
      () => {
        if (busy) return true;
        if (currencyOpen) {
          setCurrencyOpen(false);
          return true;
        }
        if (step > 0) {
          setStep((value) => value - 1);
          return true;
        }
        return false;
      },
    );
    return () => subscription.remove();
  }, [busy, currencyOpen, step]);

  function markBusy(value: boolean) {
    busyRef.current = value;
    setBusy(value);
    onBusyChange(value);
  }
  function fail(error: unknown) {
    Alert.alert(
      t("onboarding.failed"),
      error instanceof Error ? error.message : t("onboarding.retry"),
    );
  }

  async function restore() {
    if (busyRef.current) return;
    markBusy(true);
    try {
      const imported = await pickAndImportBackup(document);
      if (!imported) return;
      if (imported.format === "csv")
        throw new Error(t("onboarding.fullBackupOnly"));
      if (getSetupStatus(imported.document) !== "ready")
        throw new Error(t("onboarding.missingProfile"));
      const confirmed = await new Promise<boolean>((resolve) =>
        Alert.alert(
          t("backup.restoreTitle"),
          t("backup.restoreDescription"),
          [
            {
              text: t("backup.cancel"),
              style: "cancel",
              onPress: () => resolve(false),
            },
            {
              text: t("backup.restore"),
              style: "destructive",
              onPress: () => resolve(true),
            },
          ],
          { cancelable: true, onDismiss: () => resolve(false) },
        ),
      );
      if (!confirmed) return;
      const previous = cloneBackupDocument(document);
      let committed = false;
      try {
        stageAttachments(imported.attachments ?? []);
        const next = withBaseCategories(imported.document);
        next._local.dataMode = "restored";
        await replaceDocument(next);
        committed = true;
        commitStagedAttachments();
      } catch (error) {
        discardStagedAttachments();
        if (committed) await replaceDocument(previous);
        throw error;
      }
    } catch (error) {
      fail(error);
    } finally {
      markBusy(false);
    }
  }

  async function next() {
    if (disabled || busyRef.current) return;
    if (step < STEPS.length - 1) {
      setStep(step + 1);
      return;
    }
    markBusy(true);
    try {
      const uuid = `profile-${Date.now()}-${Math.random().toString(36).slice(2, 12)}`;
      const now = new Date();
      const sample = demo
        ? (await import("@/data/model/demo-backup")).createDemoBackup(
            uuid,
            currency!.code,
            now,
          )
        : undefined;
      await updateDocument((current) =>
        completeSetup(
          current,
          {
            name,
            language,
            currency: currency!.code,
            currencyName: currency!.name,
            currencySymbol: currency!.symbol,
            dateFormat,
            monthStartDay,
            weekStartDay,
            backupAccepted,
            responsibilityAccepted,
          },
          uuid,
          now.toISOString(),
          sample,
        ),
      );
    } catch (error) {
      fail(error);
    } finally {
      markBusy(false);
    }
  }

  function choice(
    label: string,
    selected: boolean,
    onPress: () => void,
    detail?: string,
    checkbox = false,
  ) {
    return (
      <Pressable
        key={label}
        accessibilityRole={checkbox ? "checkbox" : "radio"}
        accessibilityState={{ checked: selected, disabled: busy }}
        disabled={busy}
        onPress={onPress}
        className={`min-h-20 flex-row items-center gap-4 rounded-3xl border px-5 py-5 ${selected ? "border-accent bg-accent/10" : "border-border bg-surface-secondary"}`}
      >
        <View
          className={`size-6 items-center justify-center rounded-full border ${selected ? "border-accent bg-accent" : "border-muted"}`}
        >
          {selected && (
            <FilledIcon name="check" size={16} tone="accent-foreground" />
          )}
        </View>
        <View className="flex-1 gap-1">
          <Text className="font-sans text-lg text-foreground">{label}</Text>
          {detail && (
            <Text className="font-sans text-sm text-muted">{detail}</Text>
          )}
        </View>
      </Pressable>
    );
  }

  return (
    <KeyboardAvoidingView
      behavior={Platform.OS === "ios" ? "padding" : "height"}
      className="flex-1 bg-background"
      style={{ paddingTop: insets.top, paddingBottom: insets.bottom }}
    >
      <View className="flex-row items-center justify-between px-5 py-3">
        <Button
          isIconOnly
          variant="ghost"
          isDisabled={busy || step === 0}
          accessibilityLabel={t("onboarding.back")}
          onPress={() => setStep(step - 1)}
        >
          <FilledIcon name="arrow-left" color={foreground} size={24} />
        </Button>
        <Text
          accessibilityLiveRegion="polite"
          className="font-sans text-sm text-muted"
        >
          {t("onboarding.progress", { current: step + 1, total: STEPS.length })}
        </Text>
        <Text className="font-sans text-sm text-foreground">
          {language.toUpperCase()}
        </Text>
      </View>
      <View className="mx-6 h-1 overflow-hidden rounded-full bg-surface-secondary">
        <View
          className="h-full rounded-full bg-accent"
          style={{ width: `${((step + 1) / STEPS.length) * 100}%` }}
        />
      </View>
      <ScrollView
        ref={scroll}
        keyboardShouldPersistTaps="handled"
        contentContainerStyle={{
          flexGrow: 1,
          padding: 24,
          gap: 24,
          justifyContent: "center",
        }}
      >
        <View className="items-center">
          <View className="size-28 items-center justify-center rounded-full bg-accent/10">
            <FilledIcon name={ICONS[step]} color={accent} size={58} />
          </View>
        </View>
        <View className="gap-3">
          <Text
            accessibilityRole="header"
            className="text-center font-sans text-3xl text-foreground"
          >
            {t(`onboarding.${key}`)}
          </Text>
          <Text className="text-center font-sans text-base leading-6 text-muted">
            {t(`onboarding.${key}Description`)}
          </Text>
        </View>
        <View className="gap-3">
          {key === "welcome" && (
            <>
              <Button
                variant="outline"
                className="h-20 justify-start rounded-full px-6"
                isDisabled={busy}
                onPress={restore}
              >
                <FilledIcon name="database-import" color={accent} size={25} />
                <Button.Label className="ms-3 font-sans text-lg">
                  {t("onboarding.restore")}
                </Button.Label>
              </Button>
              <Button
                variant="outline"
                className="h-20 justify-start rounded-full px-6"
                isDisabled={busy}
                onPress={() => {
                  setDemo(true);
                  setStep(1);
                }}
              >
                <FilledIcon name="experiment" color={accent} size={25} />
                <Button.Label className="ms-3 font-sans text-lg">
                  {t("onboarding.demo")}
                </Button.Label>
              </Button>
            </>
          )}
          {key === "language" && (
            <>
              {demo && (
                <Text className="mb-3 text-center font-sans text-sm text-muted">
                  {t("onboarding.demoDescription")}
                </Text>
              )}
              {SETUP_LANGUAGES.map((option) =>
                choice(option.nativeName, option.code === language, () => {
                  setLanguage(option.code);
                  setPreviewLanguage(option.code);
                }),
              )}
            </>
          )}
          {key === "control" && (
            <>
              {choice(
                t("onboarding.backupConsent"),
                backupAccepted,
                () => setBackupAccepted(!backupAccepted),
                undefined,
                true,
              )}
              {choice(
                t("onboarding.responsibilityConsent"),
                responsibilityAccepted,
                () => setResponsibilityAccepted(!responsibilityAccepted),
                undefined,
                true,
              )}
            </>
          )}
          {key === "name" && (
            <TextInput
              value={name}
              onChangeText={setName}
              maxLength={80}
              editable={!busy}
              autoCapitalize="words"
              autoComplete="name"
              returnKeyType="next"
              onSubmitEditing={() => {
                void next();
              }}
              accessibilityLabel={t("onboarding.namePlaceholder")}
              placeholder={t("onboarding.namePlaceholder")}
              placeholderTextColor={muted}
              className="min-h-20 rounded-3xl bg-surface-secondary px-6 font-sans text-xl text-foreground"
              style={{ textAlign: isRTL ? "right" : "left" }}
            />
          )}
          {key === "currency" && (
            <Button
              variant="secondary"
              className="h-24 justify-start rounded-3xl px-6"
              onPress={() => setCurrencyOpen(true)}
            >
              <FilledIcon name="currency-usd" color={accent} size={28} />
              <View className="ms-4 flex-1 gap-1">
                <Text className="font-sans text-lg text-foreground">
                  {currency?.name ?? t("onboarding.selectCurrency")}
                </Text>
                {currency && (
                  <Text className="font-sans text-sm text-muted">
                    {currency.code}
                  </Text>
                )}
              </View>
              <FilledIcon name="chevron-right" color={muted} size={22} />
            </Button>
          )}
          {key === "date" &&
            DATE_FORMATS.map((format) =>
              choice(
                format,
                format === dateFormat,
                () => setDateFormat(format),
                formatAppDate(new Date(2026, 8, 14), format),
              ),
            )}
          {key === "month" && (
            <View className="flex-row flex-wrap justify-center gap-2">
              {Array.from({ length: 31 }, (_, i) => i + 1).map((day) => (
                <Pressable
                  key={day}
                  accessibilityRole="radio"
                  accessibilityLabel={String(day)}
                  accessibilityState={{ checked: day === monthStartDay }}
                  onPress={() => setMonthStartDay(day)}
                  className={`size-14 items-center justify-center rounded-2xl border ${day === monthStartDay ? "border-accent bg-accent" : "border-border bg-surface-secondary"}`}
                >
                  <Text
                    className={`font-sans text-lg ${day === monthStartDay ? "text-accent-foreground" : "text-foreground"}`}
                  >
                    {day}
                  </Text>
                </Pressable>
              ))}
            </View>
          )}
          {key === "week" &&
            WEEKDAYS.map((day, index) =>
              choice(t(`onboarding.${day}`), weekStartDay === index, () =>
                setWeekStartDay(index),
              ),
            )}
        </View>
      </ScrollView>
      <View className="px-6 pb-4 pt-3">
        <Button
          className="h-16 rounded-full"
          isDisabled={disabled}
          onPress={() => {
            if (key === "welcome") setDemo(false);
            void next();
          }}
        >
          <Button.Label className="font-sans text-lg">
            {t(
              key === "welcome"
                ? "onboarding.fresh"
                : key === "control"
                  ? "onboarding.agree"
                  : key === "week"
                    ? "onboarding.finish"
                    : "onboarding.continue",
            )}
          </Button.Label>
        </Button>
      </View>
      <CurrencySelectorSheet
        currencies={currencies}
        isOpen={currencyOpen}
        selectedCode={currency?.code ?? ""}
        onOpenChange={setCurrencyOpen}
        onSelect={setCurrency}
      />
      {busy && (
        <View
          accessibilityViewIsModal
          className="absolute inset-0 items-center justify-center gap-5 bg-background/95 px-8"
        >
          <ActivityIndicator size="large" color={accent} />
          <Text
            accessibilityLiveRegion="polite"
            className="text-center font-sans text-xl text-foreground"
          >
            {t("onboarding.saving")}
          </Text>
        </View>
      )}
    </KeyboardAvoidingView>
  );
}
