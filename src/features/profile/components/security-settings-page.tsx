import { DateTimePicker } from "@expo/ui/community/datetime-picker";
import { Button, Switch as HeroSwitch } from "heroui-native";
import { useEffect, useRef, useState, type ReactNode } from "react";
import { useTranslation } from "react-i18next";
import { Platform, Pressable, View } from "react-native";
import Animated, {
  Easing,
  FadeInDown,
  ReduceMotion,
} from "react-native-reanimated";

import { useLocalData } from "@/data/local-data-provider";
import {
  NOTIFICATION_KINDS,
  type NotificationKind,
} from "@/data/model/backup-document";
import {
  notificationsAvailable,
  openNotificationSettings,
  requestNotificationPermission,
} from "@/data/notifications/daily-notifications";
import { useAppLock } from "@/features/security/app-lock-provider";
import {
  RELOCK_DELAYS,
  type AppLockMethod,
  type RelockDelay,
} from "@/features/security/app-lock-policy";
import {
  authenticateWithDevice,
  withSystemPrompt,
} from "@/features/security/app-lock-store";
import {
  biometricIcon,
  biometricLabel,
} from "@/features/security/biometric-label";
import {
  PinSetupSheet,
  type PinSheetMode,
} from "@/features/security/components/pin-setup-sheet";
import { colorWithAlpha, useAppThemeColors } from "@/shared/theme/app-theme";
import { Text } from "@/shared/ui/app-text";
import { DateTimePopover } from "@/shared/ui/date-time-popover";
import { EdgeToEdgeScrollView } from "@/shared/ui/edge-to-edge-layout";
import { FilledIcon, type FilledIconName } from "@/shared/ui/filled-icon";

const reveal = FadeInDown.duration(400)
  .easing(Easing.bezier(0.22, 1, 0.36, 1))
  .reduceMotion(ReduceMotion.System);

const NOTIFICATION_ICONS: Record<NotificationKind, FilledIconName> = {
  expenseReminder: "edit-note",
  dailySummary: "query-stats",
  recurringDigest: "event-repeat",
};

function timeToDate(time: string) {
  const [hours, minutes] = time.split(":").map(Number);
  const date = new Date();
  date.setHours(hours, minutes, 0, 0);
  return date;
}

function dateToTime(date: Date) {
  return `${String(date.getHours()).padStart(2, "0")}:${String(
    date.getMinutes(),
  ).padStart(2, "0")}`;
}

function Section({
  title,
  description,
  children,
  delay = 0,
}: {
  title: string;
  description: string;
  children: ReactNode;
  delay?: number;
}) {
  return (
    <Animated.View entering={reveal.delay(delay)} className="gap-3">
      <View className="gap-1 px-1">
        <Text
          accessibilityRole="header"
          className="font-manrope-bold text-lg text-foreground"
        >
          {title}
        </Text>
        <Text className="font-sans text-sm leading-5 text-muted">
          {description}
        </Text>
      </View>
      {children}
    </Animated.View>
  );
}

function IconTile({ icon }: { icon: FilledIconName }) {
  const c = useAppThemeColors();
  return (
    <View
      className="size-11 items-center justify-center rounded-[14px]"
      style={{ backgroundColor: colorWithAlpha(c.accent, 0.16) }}
    >
      <FilledIcon name={icon} size={24} tone="accent" />
    </View>
  );
}

function ToggleRow({
  icon,
  title,
  description,
  value,
  disabled,
  onToggle,
  children,
  showBorder,
}: {
  icon: FilledIconName;
  title: string;
  description: string;
  value: boolean;
  disabled?: boolean;
  onToggle: () => void;
  children?: ReactNode;
  showBorder?: boolean;
}) {
  return (
    <View className={showBorder ? "border-b border-border" : ""}>
      <Pressable
        accessibilityRole="switch"
        accessibilityState={{ checked: value, disabled }}
        accessibilityHint={description}
        disabled={disabled}
        onPress={onToggle}
        className="min-h-[76px] flex-row items-center gap-4 px-4 py-4"
        style={({ pressed }) => ({
          opacity: disabled ? 0.5 : pressed ? 0.72 : 1,
        })}
      >
        <IconTile icon={icon} />
        <View className="min-w-0 flex-1 gap-0.5">
          <Text className="font-manrope-semibold text-base text-foreground">
            {title}
          </Text>
          <Text className="font-sans text-sm leading-5 text-muted">
            {description}
          </Text>
        </View>
        {/* The switch handles its own taps, so it must toggle too. */}
        <HeroSwitch
          isSelected={value}
          isDisabled={disabled}
          onSelectedChange={onToggle}
          style={{ width: 60, height: 28 }}
        >
          <HeroSwitch.Thumb style={{ width: 36, height: 24 }} />
        </HeroSwitch>
      </Pressable>
      {children}
    </View>
  );
}

function OptionTile({
  icon,
  label,
  description,
  selected,
  disabled,
  onPress,
}: {
  icon: FilledIconName;
  label: string;
  description: string;
  selected: boolean;
  disabled?: boolean;
  onPress: () => void;
}) {
  return (
    <Pressable
      accessibilityRole="radio"
      accessibilityState={{ checked: selected, disabled }}
      accessibilityHint={description}
      disabled={disabled}
      onPress={onPress}
      className={`min-h-[104px] flex-1 gap-2 rounded-2xl border p-3 ${
        selected ? "border-accent bg-accent/10" : "border-border bg-surface"
      }`}
      style={({ pressed }) => ({
        opacity: disabled ? 0.5 : pressed ? 0.72 : 1,
      })}
    >
      <View className="flex-row items-center justify-between">
        <FilledIcon
          name={icon}
          size={26}
          tone={selected ? "accent" : "muted"}
        />
        {selected ? <FilledIcon name="check" size={20} tone="accent" /> : null}
      </View>
      <Text className="font-manrope-semibold text-sm text-foreground">
        {label}
      </Text>
      <Text className="font-sans text-xs leading-4 text-muted">
        {description}
      </Text>
    </Pressable>
  );
}

export function SecuritySettingsPage() {
  const { t, i18n } = useTranslation();
  const c = useAppThemeColors();
  const lock = useAppLock();
  const { document, updateDocument } = useLocalData();
  const preferences = document._local.notifications;
  const [pinSheet, setPinSheet] = useState<PinSheetMode | null>(null);
  const pinResolver = useRef<((pin: string | null) => void) | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [timePicker, setTimePicker] = useState<NotificationKind | null>(null);
  const [notificationsBlocked, setNotificationsBlocked] = useState(false);
  const [nativeNotifications, setNativeNotifications] = useState(true);
  const biometricName = biometricLabel(lock.biometric.kind, t);
  const { settings } = lock;

  useEffect(() => {
    void lock.refreshBiometric();
    void notificationsAvailable().then(setNativeNotifications);
    // Biometric enrolment can change while the app is in the background.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  /** Opens the PIN sheet; resolves with the PIN, "verified", or null. */
  function requestPin(mode: PinSheetMode) {
    pinResolver.current?.(null);
    return new Promise<string | null>((resolve) => {
      pinResolver.current = resolve;
      setPinSheet(mode);
    });
  }

  function finishPin(result: string | null) {
    const resolve = pinResolver.current;
    pinResolver.current = null;
    setPinSheet(null);
    resolve?.(result);
  }

  /** Re-checks the current unlock method before a sensitive change. */
  async function confirmIdentity() {
    if (!settings.enabled) return true;
    if (settings.method === "pin") return (await requestPin("verify")) !== null;
    return authenticateWithDevice(
      t("security.settings.confirmPrompt"),
      t("security.lock.cancel"),
    );
  }

  async function run(action: () => Promise<void>) {
    if (busy) return;
    setBusy(true);
    setError("");
    try {
      await action();
    } catch {
      setError(t("security.settings.saveError"));
    } finally {
      setBusy(false);
    }
  }

  function enableWith(method: AppLockMethod) {
    return run(async () => {
      if (method === "biometric") {
        const confirmed = await authenticateWithDevice(
          t("security.settings.enablePrompt", { method: biometricName }),
          t("security.lock.cancel"),
        );
        if (!confirmed) return;
        await lock.removePin();
      } else {
        const pin = await requestPin("create");
        if (!pin) return;
        await lock.setPin(pin);
      }
      await lock.saveSettings({ ...settings, enabled: true, method });
    });
  }

  function toggleLock() {
    if (!settings.enabled) {
      void enableWith(lock.biometric.available ? "biometric" : "pin");
      return;
    }
    void run(async () => {
      if (!(await confirmIdentity())) return;
      await lock.saveSettings({ ...settings, enabled: false });
      await lock.removePin();
    });
  }

  function chooseMethod(method: AppLockMethod) {
    if (method === settings.method) return;
    void run(async () => {
      if (!(await confirmIdentity())) return;
      if (method === "pin") {
        const pin = await requestPin("create");
        if (!pin) return;
        await lock.setPin(pin);
      } else {
        const confirmed = await authenticateWithDevice(
          t("security.settings.enablePrompt", { method: biometricName }),
          t("security.lock.cancel"),
        );
        if (!confirmed) return;
      }
      await lock.saveSettings({ ...settings, method });
      if (method === "biometric") await lock.removePin();
    });
  }

  function changePin() {
    void run(async () => {
      const pin = await requestPin("change");
      if (pin) await lock.setPin(pin);
    });
  }

  function chooseDelay(delay: RelockDelay) {
    if (delay === settings.relockAfterSeconds) return;
    void run(() =>
      lock.saveSettings({ ...settings, relockAfterSeconds: delay }),
    );
  }

  async function updateNotification(
    kind: NotificationKind,
    change: Partial<{ enabled: boolean; time: string }>,
  ) {
    setError("");
    try {
      await updateDocument((current) => ({
        ...current,
        _local: {
          ...current._local,
          notifications: {
            ...current._local.notifications,
            [kind]: { ...current._local.notifications[kind], ...change },
          },
        },
      }));
    } catch {
      setError(t("security.settings.saveError"));
    }
  }

  async function toggleNotification(kind: NotificationKind) {
    const enabled = !preferences[kind].enabled;
    if (enabled) {
      const allowed = await withSystemPrompt(
        requestNotificationPermission,
      ).catch(() => false);
      setNotificationsBlocked(!allowed);
      if (!allowed) return;
    }
    await updateNotification(kind, { enabled });
  }

  const formatTime = (time: string) =>
    timeToDate(time).toLocaleTimeString(i18n.resolvedLanguage, {
      hour: "2-digit",
      minute: "2-digit",
    });

  const relockLabel = (delay: RelockDelay) =>
    t(`security.settings.relock.${delay}`);

  return (
    <>
      <EdgeToEdgeScrollView
        className="flex-1"
        contentContainerClassName="gap-7 px-4 pt-3"
        contentContainerStyle={{ paddingBottom: 40 }}
        showsVerticalScrollIndicator={false}
      >
        <Section
          title={t("security.settings.lockTitle")}
          description={t(
            Platform.OS === "ios"
              ? "security.settings.lockDescriptionIos"
              : "security.settings.lockDescriptionAndroid",
          )}
        >
          <View className="overflow-hidden rounded-[28px] bg-surface">
            <ToggleRow
              icon="lock"
              title={t("security.settings.lockToggle")}
              description={
                settings.enabled
                  ? t("security.settings.lockOn", {
                      method:
                        settings.method === "pin"
                          ? t("security.settings.pin")
                          : biometricName,
                    })
                  : t("security.settings.lockOff")
              }
              value={settings.enabled}
              disabled={busy}
              onToggle={toggleLock}
            />
          </View>

          {settings.enabled ? (
            <>
              <Text className="px-1 pt-2 font-manrope-semibold text-sm text-muted">
                {t("security.settings.methodTitle")}
              </Text>
              <View className="flex-row gap-3">
                <OptionTile
                  icon={biometricIcon(lock.biometric.kind)}
                  label={biometricName}
                  description={
                    lock.biometric.available
                      ? t("security.settings.biometricDescription")
                      : t(
                          Platform.OS === "ios"
                            ? "security.settings.biometricMissingIos"
                            : "security.settings.biometricMissingAndroid",
                          { method: biometricName },
                        )
                  }
                  selected={settings.method === "biometric"}
                  disabled={busy || !lock.biometric.available}
                  onPress={() => chooseMethod("biometric")}
                />
                <OptionTile
                  icon="dialpad"
                  label={t("security.settings.pin")}
                  description={t("security.settings.pinDescription")}
                  selected={settings.method === "pin"}
                  disabled={busy}
                  onPress={() => chooseMethod("pin")}
                />
              </View>

              {settings.method === "pin" ? (
                <Button
                  variant="secondary"
                  isDisabled={busy}
                  onPress={changePin}
                >
                  <FilledIcon name="pencil" size={18} tone="accent" />
                  <Button.Label>
                    {t("security.settings.changePin")}
                  </Button.Label>
                </Button>
              ) : null}

              <Text className="px-1 pt-2 font-manrope-semibold text-sm text-muted">
                {t("security.settings.relockTitle")}
              </Text>
              <View className="flex-row flex-wrap gap-2">
                {RELOCK_DELAYS.map((delay) => {
                  const selected = delay === settings.relockAfterSeconds;
                  return (
                    <Pressable
                      key={delay}
                      accessibilityRole="radio"
                      accessibilityState={{ checked: selected, disabled: busy }}
                      disabled={busy}
                      onPress={() => chooseDelay(delay)}
                      className={`min-h-11 flex-row items-center gap-1.5 rounded-full border px-4 ${
                        selected
                          ? "border-accent bg-accent/10"
                          : "border-border bg-surface"
                      }`}
                      style={({ pressed }) => ({ opacity: pressed ? 0.72 : 1 })}
                    >
                      {selected ? (
                        <FilledIcon name="check" size={16} tone="accent" />
                      ) : null}
                      <Text
                        className={`font-manrope-semibold text-sm ${
                          selected ? "text-accent" : "text-foreground"
                        }`}
                      >
                        {relockLabel(delay)}
                      </Text>
                    </Pressable>
                  );
                })}
              </View>
              <Text className="px-1 font-sans text-xs leading-5 text-muted">
                {settings.method === "pin" && lock.biometric.deviceSecure
                  ? t("security.settings.pinRecovery")
                  : t("security.settings.relockHint")}
              </Text>
            </>
          ) : null}
        </Section>

        <Section
          title={t("security.notifications.title")}
          description={t("security.notifications.description")}
          delay={80}
        >
          {!nativeNotifications ? (
            <Text className="px-1 font-sans text-sm text-muted">
              {t("security.notifications.unavailable")}
            </Text>
          ) : null}
          {notificationsBlocked ? (
            <View className="gap-3 rounded-[22px] border border-danger/40 bg-danger/10 p-4">
              <View className="flex-row items-center gap-3">
                <FilledIcon name="bell" size={22} tone="danger" />
                <Text className="flex-1 font-sans text-sm leading-5 text-foreground">
                  {t("security.notifications.blocked")}
                </Text>
              </View>
              <Button
                size="sm"
                variant="secondary"
                onPress={() => void openNotificationSettings()}
              >
                <Button.Label>
                  {t("security.notifications.openSettings")}
                </Button.Label>
              </Button>
            </View>
          ) : null}
          <View className="overflow-hidden rounded-[28px] bg-surface">
            {NOTIFICATION_KINDS.map((kind, index) => {
              const preference = preferences[kind];
              return (
                <ToggleRow
                  key={kind}
                  icon={NOTIFICATION_ICONS[kind]}
                  title={t(`security.notifications.${kind}.title`)}
                  description={t(`security.notifications.${kind}.description`)}
                  value={preference.enabled}
                  disabled={!nativeNotifications}
                  onToggle={() => void toggleNotification(kind)}
                  showBorder={index < NOTIFICATION_KINDS.length - 1}
                >
                  {preference.enabled ? (
                    <Pressable
                      accessibilityRole="button"
                      accessibilityLabel={t(
                        "security.notifications.timeLabel",
                        {
                          time: formatTime(preference.time),
                        },
                      )}
                      onPress={() => setTimePicker(kind)}
                      className="mx-4 mb-4 flex-row items-center gap-3 rounded-2xl bg-background px-4 py-3"
                      style={({ pressed }) => ({ opacity: pressed ? 0.72 : 1 })}
                    >
                      <FilledIcon name="clock" size={20} tone="muted" />
                      <Text className="flex-1 font-sans text-sm text-muted">
                        {t("security.notifications.deliveredAt")}
                      </Text>
                      <Text
                        className="font-manrope-bold text-base text-accent"
                        style={{ fontVariant: ["tabular-nums"] }}
                      >
                        {formatTime(preference.time)}
                      </Text>
                      <FilledIcon name="chevron-right" size={20} tone="muted" />
                      <DateTimePopover
                        accentColor={c.accent}
                        isDark={c.isDark}
                        isPresented={timePicker === kind}
                        mode="time"
                        title={t(`security.notifications.${kind}.title`)}
                        value={timeToDate(preference.time)}
                        onDismiss={() => {
                          if (timePicker === kind) setTimePicker(null);
                        }}
                        onValueChange={(value) =>
                          void updateNotification(kind, {
                            time: dateToTime(value),
                          })
                        }
                      />
                    </Pressable>
                  ) : null}
                </ToggleRow>
              );
            })}
          </View>
          <Text className="px-1 font-sans text-xs leading-5 text-muted">
            {t("security.notifications.privacy")}
          </Text>
        </Section>

        {error ? (
          <Text
            accessibilityRole="alert"
            className="px-1 font-sans text-sm text-danger"
          >
            {error}
          </Text>
        ) : null}
      </EdgeToEdgeScrollView>

      {Platform.OS === "android" && timePicker ? (
        <DateTimePicker
          accentColor={c.accent}
          display="default"
          mode="time"
          presentation="dialog"
          value={timeToDate(preferences[timePicker].time)}
          onValueChange={(_, value) => {
            const kind = timePicker;
            setTimePicker(null);
            void updateNotification(kind, { time: dateToTime(value) });
          }}
          onDismiss={() => setTimePicker(null)}
        />
      ) : null}

      <PinSetupSheet
        mode={pinSheet ?? "create"}
        isOpen={pinSheet !== null}
        onOpenChange={(open) => {
          if (!open) finishPin(null);
        }}
        onCreated={(pin) => finishPin(pin)}
        onVerified={() => finishPin("verified")}
      />
    </>
  );
}
