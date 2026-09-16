import {
  TopSafeAreaGradient,
  BottomSafeAreaGradient,
} from "@/shared/ui/safe-area-gradients";
import {
  commitStagedAttachments,
  discardStagedAttachments,
  stageAttachments,
} from "@/data/attachments/attachment-store";
import { pickAndImportBackup } from "@/data/backup/backup-service";
import { useLocalData } from "@/data/local-data-provider";
import {
  DATE_FORMATS,
  type AppDateFormat,
  type AppLanguage,
} from "@/data/model/backup-document";
import { cloneBackupDocument } from "@/data/model/normalize-backup";
import {
  completeSetup,
  formatAppDate,
  getSetupStatus,
  withBaseCategories,
} from "@/data/model/onboarding";
import { CurrencySelectorSheet } from "@/features/profile/components/currency-selector-sheet";
import {
  currencies,
  type CurrencyOption,
} from "@/features/profile/data/currencies-data";
import { LANGUAGE_OPTIONS } from "@/localization/languages";
import { useAppLocalization } from "@/localization/localization-provider";
import { colorWithAlpha, useAppThemeColors } from "@/shared/theme/app-theme";
import { Text } from "@/shared/ui/app-text";
import { FilledIcon, type FilledIconName } from "@/shared/ui/filled-icon";
import { useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import {
  ActivityIndicator,
  Alert,
  BackHandler,
  Keyboard,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  TextInput,
  useWindowDimensions,
  View,
} from "react-native";
import Animated, {
  Easing,
  ReduceMotion,
  runOnJS,
  useAnimatedStyle,
  useSharedValue,
  withTiming,
} from "react-native-reanimated";
import { useSafeAreaInsets } from "react-native-safe-area-context";

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
const MONTH_DAYS = Array.from({ length: 31 }, (_, index) => index + 1);
const DAY_COLUMNS = 7;
const DAY_GAP = 8;
const DAY_ROWS = Math.ceil(MONTH_DAYS.length / DAY_COLUMNS);
const TRANSITION = {
  duration: 320,
  easing: Easing.bezier(0.22, 1, 0.36, 1),
  reduceMotion: ReduceMotion.System,
};
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
  const theme = useAppThemeColors();
  const { width: windowWidth } = useWindowDimensions();
  const [step, setStep] = useState(0);
  const [leavingStep, setLeavingStep] = useState<number | null>(null);
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
  const [dayArea, setDayArea] = useState({ height: 0, width: 0 });
  const [busy, setBusy] = useState(false);
  const busyRef = useRef(false);
  const enterOffset = useSharedValue(0);
  const enteringStyle = useAnimatedStyle(() => ({
    transform: [{ translateX: enterOffset.value }],
  }));
  const key = STEPS[step];
  const contentBottom = 104 + insets.bottom;
  const disabled =
    busy ||
    (key === "control" && (!backupAccepted || !responsibilityAccepted)) ||
    (key === "name" && !name.trim()) ||
    (key === "currency" && !currency);

  useEffect(() => () => setPreviewLanguage(null), [setPreviewLanguage]);
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
          goToStep(step - 1, -1);
          return true;
        }
        return false;
      },
    );
    return () => subscription.remove();
  });

  // The entering step slides in over the step that stays in place: from the
  // trailing edge when moving forward, from the leading edge when going back.
  function goToStep(target: number, direction: 1 | -1) {
    if (target < 0 || target >= STEPS.length || target === step) return;
    Keyboard.dismiss();
    setLeavingStep(step);
    setStep(target);
    enterOffset.value = (isRTL ? -1 : 1) * direction * windowWidth;
    enterOffset.value = withTiming(0, TRANSITION, (finished) => {
      if (finished) runOnJS(setLeavingStep)(null);
    });
  }

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
    Keyboard.dismiss();
    if (step < STEPS.length - 1) {
      goToStep(step + 1, 1);
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
        style={({ pressed }) => [
          styles.row,
          {
            backgroundColor: selected
              ? colorWithAlpha(theme.accent, 0.12)
              : theme.surfaceSecondary,
            borderColor: selected ? theme.accent : theme.border,
          },
          pressed && styles.pressed,
        ]}
      >
        <View
          style={[
            styles.mark,
            {
              backgroundColor: selected ? theme.accent : "transparent",
              borderColor: selected ? theme.accent : theme.muted,
            },
          ]}
        >
          {selected && (
            <FilledIcon name="check" size={14} tone="accent-foreground" />
          )}
        </View>
        <View className="flex-1 gap-0.5">
          <Text className="font-sans text-base leading-5 text-foreground">
            {label}
          </Text>
          {detail && (
            <Text className="font-sans text-xs text-muted">{detail}</Text>
          )}
        </View>
      </Pressable>
    );
  }

  function option(
    icon: FilledIconName,
    label: string,
    onPress: () => void | Promise<void>,
    detail?: string,
  ) {
    return (
      <Pressable
        accessibilityRole="button"
        accessibilityState={{ disabled: busy }}
        disabled={busy}
        onPress={onPress}
        style={({ pressed }) => [
          styles.row,
          {
            backgroundColor: theme.surfaceSecondary,
            borderColor: theme.border,
          },
          pressed && styles.pressed,
        ]}
      >
        <FilledIcon name={icon} color={theme.accent} size={22} />
        <View className="flex-1 gap-0.5">
          <Text className="font-sans text-base text-foreground">{label}</Text>
          {detail && (
            <Text className="font-sans text-xs text-muted">{detail}</Text>
          )}
        </View>
        <FilledIcon name="chevron-right" color={theme.muted} size={18} />
      </Pressable>
    );
  }

  function monthDayGrid() {
    const byWidth =
      dayArea.width > 0
        ? (dayArea.width - DAY_GAP * (DAY_COLUMNS - 1)) / DAY_COLUMNS
        : 44;
    const byHeight =
      dayArea.height > 0
        ? (dayArea.height - DAY_GAP * (DAY_ROWS - 1)) / DAY_ROWS
        : 44;
    const size = Math.round(Math.max(26, Math.min(46, byWidth, byHeight)));
    return (
      <View
        className="flex-1 justify-center"
        onLayout={({ nativeEvent }) => {
          const { height, width } = nativeEvent.layout;
          setDayArea((current) =>
            Math.abs(current.height - height) < 1 &&
            Math.abs(current.width - width) < 1
              ? current
              : { height, width },
          );
        }}
      >
        <View
          style={[
            styles.dayGrid,
            { width: size * DAY_COLUMNS + DAY_GAP * (DAY_COLUMNS - 1) },
          ]}
        >
          {MONTH_DAYS.map((day) => {
            const selected = day === monthStartDay;
            return (
              <Pressable
                key={day}
                accessibilityRole="radio"
                accessibilityLabel={String(day)}
                accessibilityState={{ checked: selected, disabled: busy }}
                disabled={busy}
                onPress={() => setMonthStartDay(day)}
                style={[
                  styles.day,
                  {
                    backgroundColor: selected
                      ? theme.accent
                      : theme.surfaceSecondary,
                    borderColor: selected ? theme.accent : theme.border,
                    borderRadius: Math.round(size / 3),
                    height: size,
                    width: size,
                  },
                ]}
              >
                <Text
                  className="font-sans"
                  style={{
                    color: selected ? theme.accentForeground : theme.foreground,
                    fontSize: Math.max(12, Math.round(size * 0.38)),
                    textAlign: "center",
                  }}
                >
                  {day}
                </Text>
              </Pressable>
            );
          })}
        </View>
      </View>
    );
  }

  function stepIntro(index: number) {
    const stepKey = STEPS[index];
    return (
      <View className="items-center gap-2">
        <View
          style={[
            styles.badge,
            { backgroundColor: colorWithAlpha(theme.accent, 0.12) },
          ]}
        >
          <FilledIcon name={ICONS[index]} color={theme.accent} size={32} />
        </View>
        <Text
          accessibilityRole="header"
          className="text-center font-manrope-bold text-2xl text-foreground"
        >
          {t(`onboarding.${stepKey}`)}
        </Text>
        <Text
          className={`text-center font-sans text-muted ${stepKey === "month" ? "text-xs leading-4" : "text-sm leading-5"}`}
        >
          {t(`onboarding.${stepKey}Description`)}
        </Text>
      </View>
    );
  }

  function stepControls(index: number) {
    const stepKey = STEPS[index];
    if (stepKey === "welcome")
      return (
        <>
          {option("database-import", t("onboarding.restore"), restore)}
          {option("experiment", t("onboarding.demo"), () => {
            setDemo(true);
            goToStep(1, 1);
          })}
        </>
      );
    if (stepKey === "language")
      return (
        <>
          {demo && (
            <Text className="mb-1 text-center font-sans text-xs leading-4 text-muted">
              {t("onboarding.demoDescription")}
            </Text>
          )}
          {SETUP_LANGUAGES.map((languageOption) =>
            choice(
              languageOption.nativeName,
              languageOption.code === language,
              () => {
                setLanguage(languageOption.code);
                setPreviewLanguage(languageOption.code);
              },
            ),
          )}
        </>
      );
    if (stepKey === "control")
      return (
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
      );
    if (stepKey === "name")
      return (
        <TextInput
          value={name}
          onChangeText={setName}
          maxLength={80}
          editable={!busy}
          autoCapitalize="words"
          autoComplete="name"
          returnKeyType="done"
          submitBehavior="blurAndSubmit"
          onSubmitEditing={() => {
            void next();
          }}
          accessibilityLabel={t("onboarding.namePlaceholder")}
          placeholder={t("onboarding.namePlaceholder")}
          placeholderTextColor={theme.muted}
          className="font-sans text-base text-foreground"
          style={[
            styles.row,
            {
              backgroundColor: theme.surfaceSecondary,
              borderColor: theme.border,
              textAlign: isRTL ? "right" : "left",
            },
          ]}
        />
      );
    if (stepKey === "currency")
      return option(
        "currency-usd",
        currency?.name ?? t("onboarding.selectCurrency"),
        () => setCurrencyOpen(true),
        currency?.code,
      );
    if (stepKey === "date")
      return DATE_FORMATS.map((format) =>
        choice(
          format,
          format === dateFormat,
          () => setDateFormat(format),
          formatAppDate(new Date(2026, 8, 14), format),
        ),
      );
    if (stepKey === "week")
      return WEEKDAYS.map((day, dayIndex) =>
        choice(t(`onboarding.${day}`), weekStartDay === dayIndex, () =>
          setWeekStartDay(dayIndex),
        ),
      );
    return null;
  }

  function renderStep(index: number) {
    // The day picker must stay fully visible, so that step never scrolls.
    if (STEPS[index] === "month")
      return (
        <View
          className="gap-3"
          style={[
            styles.staticStep,
            { paddingTop: insets.top + 63, paddingBottom: contentBottom },
          ]}
        >
          {stepIntro(index)}
          {monthDayGrid()}
        </View>
      );
    return (
      <ScrollView
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
        contentContainerStyle={[
          styles.scrollContent,
          { paddingTop: insets.top + 63, paddingBottom: contentBottom },
        ]}
      >
        {stepIntro(index)}
        <View className="gap-2.5">{stepControls(index)}</View>
      </ScrollView>
    );
  }

  const actionLabel = t(
    key === "welcome"
      ? "onboarding.fresh"
      : key === "control"
        ? "onboarding.agree"
        : key === "week"
          ? "onboarding.finish"
          : "onboarding.continue",
  );

  return (
    <View style={[styles.screen, { backgroundColor: theme.background }]}>
      <KeyboardAvoidingView
        behavior={Platform.OS === "ios" ? "padding" : "height"}
        style={styles.screen}
      >
        <View style={styles.screen}>
          <View
            style={{
              position: "absolute",
              top: insets.top,
              left: 0,
              right: 0,
              zIndex: 20,
            }}
          >
            <View style={styles.header}>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel={t("onboarding.back")}
                disabled={busy || step === 0}
                onPress={() => goToStep(step - 1, -1)}
                style={({ pressed }) => [
                  styles.back,
                  {
                    backgroundColor: theme.surfaceSecondary,
                    opacity: step === 0 ? 0 : pressed ? 0.72 : 1,
                  },
                ]}
              >
                <FilledIcon
                  name="arrow-left"
                  color={theme.foreground}
                  size={20}
                />
              </Pressable>
              <Text
                accessibilityLiveRegion="polite"
                className="font-sans text-xs text-muted"
              >
                {t("onboarding.progress", {
                  current: step + 1,
                  total: STEPS.length,
                })}
              </Text>
              <Text className="font-sans text-xs text-foreground">
                {language.toUpperCase()}
              </Text>
            </View>
            <View
              style={[
                styles.track,
                { backgroundColor: theme.surfaceSecondary },
              ]}
            >
              <View
                style={{
                  backgroundColor: theme.accent,
                  height: "100%",
                  width: `${((step + 1) / STEPS.length) * 100}%`,
                }}
              />
            </View>
          </View>
          <View style={styles.stage}>
            {leavingStep !== null && leavingStep !== step && (
              <View pointerEvents="none" style={StyleSheet.absoluteFill}>
                {renderStep(leavingStep)}
              </View>
            )}
            <Animated.View
              key={step}
              style={[
                StyleSheet.absoluteFill,
                { backgroundColor: theme.background },
                enteringStyle,
              ]}
            >
              {renderStep(step)}
            </Animated.View>
          </View>
          <TopSafeAreaGradient />
          <BottomSafeAreaGradient />
          <View
            pointerEvents="box-none"
            style={[styles.actionDock, { bottom: Math.max(insets.bottom, 10) }]}
          >
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={actionLabel}
              accessibilityState={{ busy, disabled }}
              disabled={disabled}
              onPress={() => {
                if (key === "welcome") setDemo(false);
                void next();
              }}
              style={({ pressed }) => [
                styles.action,
                { backgroundColor: theme.accent },
                pressed && styles.pressed,
                disabled && styles.disabled,
              ]}
            >
              <FilledIcon
                name={key === "week" ? "check" : "chevron-right"}
                size={24}
                tone="accent-foreground"
              />
              <Text
                numberOfLines={1}
                style={{ flexShrink: 1 }}
                className="font-manrope-bold text-base text-accent-foreground"
              >
                {actionLabel}
              </Text>
            </Pressable>
          </View>
        </View>
      </KeyboardAvoidingView>
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
          <ActivityIndicator size="large" color={theme.accent} />
          <Text
            accessibilityLiveRegion="polite"
            className="text-center font-sans text-lg text-foreground"
          >
            {t("onboarding.saving")}
          </Text>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1 },
  header: {
    alignItems: "center",
    flexDirection: "row",
    height: 48,
    justifyContent: "space-between",
    paddingHorizontal: 16,
  },
  back: {
    alignItems: "center",
    borderRadius: 18,
    height: 36,
    justifyContent: "center",
    width: 36,
  },
  track: {
    borderRadius: 999,
    height: 3,
    marginHorizontal: 20,
    overflow: "hidden",
  },
  stage: { flex: 1, overflow: "hidden" },
  scrollContent: {
    flexGrow: 1,
    gap: 18,
    justifyContent: "center",
    paddingHorizontal: 20,
    paddingTop: 12,
  },
  staticStep: { flex: 1, paddingHorizontal: 20, paddingTop: 12 },
  row: {
    alignItems: "center",
    borderRadius: 18,
    borderWidth: 1,
    flexDirection: "row",
    gap: 12,
    minHeight: 54,
    paddingHorizontal: 16,
    paddingVertical: 10,
  },
  mark: {
    alignItems: "center",
    borderRadius: 11,
    borderWidth: 1,
    height: 22,
    justifyContent: "center",
    width: 22,
  },
  badge: {
    alignItems: "center",
    borderRadius: 34,
    height: 68,
    justifyContent: "center",
    width: 68,
  },
  dayGrid: {
    alignSelf: "center",
    flexDirection: "row",
    flexWrap: "wrap",
    gap: DAY_GAP,
  },
  day: {
    alignItems: "center",
    borderWidth: 1,
    justifyContent: "center",
  },
  actionDock: {
    gap: 6,
    left: 0,
    paddingHorizontal: 12,
    position: "absolute",
    right: 0,
    zIndex: 20,
  },
  action: {
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
