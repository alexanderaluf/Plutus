import { Image } from "expo-image";
import { Button } from "heroui-native";
import { useCallback, useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { Modal, View } from "react-native";
import {
  SafeAreaProvider,
  useSafeAreaInsets,
} from "react-native-safe-area-context";

import { useAppThemeColors } from "@/shared/theme/app-theme";
import { Text } from "@/shared/ui/app-text";
import { FilledIcon } from "@/shared/ui/filled-icon";

import { useAppLock } from "../app-lock-provider";
import { PIN_LENGTH, pinCooldownUntil } from "../app-lock-policy";
import { authenticateWithDevice } from "../app-lock-store";
import { biometricIcon, biometricLabel } from "../biometric-label";
import { PinDots, PinKeypad } from "./pin-pad";

const MARKS = {
  light: require("../../../../assets/icons-android/splash-icon-light.png"),
  dark: require("../../../../assets/icons-android/splash-icon-dark.png"),
};

/** The Plutus coin, cropped from the splash artwork into a circle. */
export function AppMark({ size = 96 }: { size?: number }) {
  const { isDark } = useAppThemeColors();
  return (
    <View
      className="items-center justify-center overflow-hidden rounded-full"
      style={{ width: size, height: size }}
    >
      <Image
        accessibilityIgnoresInvertColors
        contentFit="contain"
        source={isDark ? MARKS.dark : MARKS.light}
        // The coin fills two thirds of the splash image.
        style={{ width: size * 1.5, height: size * 1.5 }}
      />
    </View>
  );
}

function LockContent({ onUnlock }: { onUnlock: () => void }) {
  const { t } = useTranslation();
  const insets = useSafeAreaInsets();
  const { settings, biometric, checkPin } = useAppLock();
  const [pin, setPin] = useState("");
  const [failures, setFailures] = useState(0);
  const [errorKey, setErrorKey] = useState(0);
  const [blockedUntil, setBlockedUntil] = useState<number | null>(null);
  const [now, setNow] = useState(() => Date.now());
  const prompting = useRef(false);
  const biometricName = biometricLabel(biometric.kind, t);
  const canUseDevice = biometric.available || biometric.deviceSecure;

  const promptDevice = useCallback(async () => {
    if (prompting.current) return;
    prompting.current = true;
    try {
      const success = await authenticateWithDevice(
        t("security.lock.prompt"),
        t("security.lock.cancel"),
      );
      if (success) onUnlock();
    } finally {
      prompting.current = false;
    }
  }, [onUnlock, t]);

  // Ask for Face ID / fingerprint as soon as the lock appears.
  useEffect(() => {
    if (settings.method !== "biometric" || !biometric.available) return;
    const timer = setTimeout(() => void promptDevice(), 350);
    return () => clearTimeout(timer);
  }, [biometric.available, promptDevice, settings.method]);

  useEffect(() => {
    if (blockedUntil === null) return;
    const timer = setInterval(() => {
      const current = Date.now();
      setNow(current);
      if (current >= blockedUntil) setBlockedUntil(null);
    }, 500);
    return () => clearInterval(timer);
  }, [blockedUntil]);

  async function submit(value: string) {
    if (await checkPin(value)) {
      onUnlock();
      return;
    }
    const nextFailures = failures + 1;
    const at = Date.now();
    setFailures(nextFailures);
    setErrorKey((key) => key + 1);
    setPin("");
    setNow(at);
    setBlockedUntil(pinCooldownUntil(nextFailures, at));
  }

  function addDigit(digit: string) {
    if (blockedUntil !== null || pin.length >= PIN_LENGTH) return;
    const next = pin + digit;
    setPin(next);
    if (next.length === PIN_LENGTH) void submit(next);
  }

  const usesPin = settings.method === "pin";
  const secondsLeft =
    blockedUntil === null ? 0 : Math.ceil((blockedUntil - now) / 1000);
  const message =
    blockedUntil !== null
      ? t("security.lock.cooldown", { seconds: secondsLeft })
      : errorKey
        ? t("security.lock.wrongPin")
        : null;

  return (
    <View
      className="flex-1 items-center justify-between px-6"
      style={{ paddingTop: insets.top + 48, paddingBottom: insets.bottom + 28 }}
    >
      <View className="items-center gap-4">
        <AppMark />
        <View className="items-center gap-1.5">
          <View className="flex-row items-center gap-2">
            <FilledIcon name="lock" size={20} tone="accent" />
            <Text
              accessibilityRole="header"
              className="font-manrope-bold text-2xl text-foreground"
            >
              {t("security.lock.title")}
            </Text>
          </View>
          <Text className="text-center font-sans text-sm leading-5 text-muted">
            {usesPin
              ? t("security.lock.pinSubtitle")
              : t("security.lock.biometricSubtitle", { method: biometricName })}
          </Text>
        </View>
      </View>

      {usesPin ? (
        <View className="items-center gap-7">
          <View className="items-center gap-3">
            <PinDots filled={pin.length} errorKey={errorKey} />
            <Text
              accessibilityLiveRegion="polite"
              className="min-h-5 text-center font-sans text-sm text-danger"
            >
              {message ?? " "}
            </Text>
          </View>
          <PinKeypad
            disabled={blockedUntil !== null}
            extraAction={
              canUseDevice
                ? {
                    icon: biometric.available
                      ? biometricIcon(biometric.kind)
                      : "lock-open",
                    label: biometric.available
                      ? t("security.lock.useBiometric", {
                          method: biometricName,
                        })
                      : t("security.lock.useDevice"),
                    onPress: () => void promptDevice(),
                  }
                : undefined
            }
            onDigit={addDigit}
            onDelete={() => setPin((value) => value.slice(0, -1))}
          />
        </View>
      ) : (
        <View className="w-full items-center gap-3">
          <FilledIcon
            name={biometricIcon(biometric.kind)}
            size={64}
            tone="accent"
          />
          <Button className="w-full" onPress={() => void promptDevice()}>
            <Button.Label>
              {t("security.lock.useBiometric", { method: biometricName })}
            </Button.Label>
          </Button>
        </View>
      )}
    </View>
  );
}

/**
 * Full-screen lock above every route, sheet and dialog. While the app is only
 * hidden (app switcher), the same window shows the brand cover instead.
 */
export function AppLockScreen({
  locked,
  covered,
  onUnlock,
}: {
  locked: boolean;
  covered: boolean;
  onUnlock: () => void;
}) {
  const c = useAppThemeColors();
  return (
    <Modal
      visible={locked || covered}
      animationType="fade"
      statusBarTranslucent
      navigationBarTranslucent
      // Back must never dismiss the lock.
      onRequestClose={() => undefined}
    >
      <SafeAreaProvider>
        <View className="flex-1" style={{ backgroundColor: c.background }}>
          {locked ? (
            <LockContent onUnlock={onUnlock} />
          ) : (
            <View className="flex-1 items-center justify-center">
              <AppMark size={112} />
            </View>
          )}
        </View>
      </SafeAreaProvider>
    </Modal>
  );
}
