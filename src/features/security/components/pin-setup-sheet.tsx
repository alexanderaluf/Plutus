import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { useAppLocalization } from "@/localization/localization-provider";
import { BottomSheet } from "@/shared/ui/app-bottom-sheet";
import { AppBottomSheetPortal } from "@/shared/ui/app-bottom-sheet-portal";
import { Text } from "@/shared/ui/app-text";
import { useBottomSheetInitialPositionFix } from "@/shared/ui/use-bottom-sheet-initial-position-fix";

import { useAppLock } from "../app-lock-provider";
import { PIN_LENGTH, pinCooldownUntil } from "../app-lock-policy";
import { PinDots, PinKeypad } from "./pin-pad";

export type PinSheetMode = "create" | "verify" | "change";

type PinSheetCallbacks = {
  onCreated: (pin: string) => void;
  onVerified: () => void;
};

/** One entry session; remounted on every open so it starts empty. */
function PinSheetBody({
  mode,
  blocked,
  onWrongPin,
  onCorrectPin,
  onCreated,
  onVerified,
}: PinSheetCallbacks & {
  mode: PinSheetMode;
  blocked: boolean;
  onWrongPin: () => void;
  onCorrectPin: () => void;
}) {
  const { t } = useTranslation();
  const insets = useSafeAreaInsets();
  const { checkPin } = useAppLock();
  const [stage, setStage] = useState<"verify" | "create">(
    mode === "create" ? "create" : "verify",
  );
  const [pin, setPin] = useState("");
  const [first, setFirst] = useState<string | null>(null);
  const [errorKey, setErrorKey] = useState(0);
  const [error, setError] = useState("");

  function reject(message: string) {
    setError(message);
    setErrorKey((key) => key + 1);
    setPin("");
  }

  async function complete(value: string) {
    if (stage === "verify") {
      if (await checkPin(value)) {
        onCorrectPin();
        setPin("");
        setError("");
        if (mode === "change") setStage("create");
        else onVerified();
        return;
      }
      onWrongPin();
      reject(t("security.lock.wrongPin"));
      return;
    }
    if (first === null) {
      setFirst(value);
      setPin("");
      setError("");
      return;
    }
    if (value !== first) {
      setFirst(null);
      reject(t("security.pin.mismatch"));
      return;
    }
    onCreated(value);
  }

  function addDigit(digit: string) {
    if (blocked || pin.length >= PIN_LENGTH) return;
    const next = pin + digit;
    setPin(next);
    if (next.length === PIN_LENGTH) void complete(next);
  }

  const title =
    stage === "verify"
      ? t("security.pin.verifyTitle")
      : first === null
        ? t("security.pin.createTitle")
        : t("security.pin.confirmTitle");
  const description =
    stage === "verify"
      ? t("security.pin.verifyDescription")
      : first === null
        ? t("security.pin.createDescription", { count: PIN_LENGTH })
        : t("security.pin.confirmDescription");

  return (
    <View
      className="flex-1 items-center justify-between px-6 pt-4"
      style={{ paddingBottom: insets.bottom + 24 }}
    >
      <View className="items-center gap-2">
        <BottomSheet.Title className="text-center">{title}</BottomSheet.Title>
        <BottomSheet.Description className="text-center">
          {description}
        </BottomSheet.Description>
      </View>
      <View className="items-center gap-3">
        <PinDots filled={pin.length} errorKey={errorKey} />
        <Text
          accessibilityLiveRegion="polite"
          className="min-h-5 text-center font-sans text-sm text-danger"
        >
          {blocked ? t("security.lock.cooldownShort") : error || " "}
        </Text>
      </View>
      <View className="rounded-[28px] bg-background px-3 py-4">
        <PinKeypad
          disabled={blocked}
          onDigit={addDigit}
          onDelete={() => setPin((value) => value.slice(0, -1))}
        />
      </View>
    </View>
  );
}

/**
 * "create" asks for a new PIN twice; "verify" checks the current PIN before a
 * sensitive change; "change" verifies, then creates. Completion is reported
 * once; dismissing reports nothing. Wrong-PIN cooldowns survive reopening.
 */
export function PinSetupSheet({
  mode,
  isOpen,
  onOpenChange,
  onCreated,
  onVerified,
}: PinSheetCallbacks & {
  mode: PinSheetMode;
  isOpen: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const { direction } = useAppLocalization();
  const insets = useSafeAreaInsets();
  const initialPositionFix = useBottomSheetInitialPositionFix(isOpen);
  const [session, setSession] = useState(0);
  const [wasOpen, setWasOpen] = useState(isOpen);
  const [failures, setFailures] = useState(0);
  const [blockedUntil, setBlockedUntil] = useState<number | null>(null);

  // Each opening starts a fresh entry session.
  if (isOpen !== wasOpen) {
    setWasOpen(isOpen);
    if (isOpen) setSession((value) => value + 1);
  }

  useEffect(() => {
    if (blockedUntil === null) return;
    const timer = setTimeout(
      () => setBlockedUntil(null),
      Math.max(0, blockedUntil - Date.now()),
    );
    return () => clearTimeout(timer);
  }, [blockedUntil]);

  return (
    <BottomSheet isOpen={isOpen} onOpenChange={onOpenChange}>
      <AppBottomSheetPortal
        isOpen={isOpen}
        unstable_accessibilityContainerViewIsModal
      >
        <BottomSheet.Overlay />
        <BottomSheet.Content
          containerStyle={initialPositionFix.containerStyle}
          onChange={initialPositionFix.onChange}
          snapPoints={["88%"]}
          topInset={insets.top}
          enableDynamicSizing={false}
          enableOverDrag={false}
          contentContainerClassName="h-full px-0 pb-0 pt-1"
          contentContainerProps={{ style: { direction } }}
          backgroundClassName="rounded-t-[28px] bg-surface"
          handleIndicatorClassName="w-10 bg-muted/40"
        >
          <PinSheetBody
            key={`${session}:${mode}`}
            mode={mode}
            blocked={blockedUntil !== null}
            onWrongPin={() => {
              const next = failures + 1;
              setFailures(next);
              setBlockedUntil(pinCooldownUntil(next, Date.now()));
            }}
            onCorrectPin={() => setFailures(0)}
            onCreated={onCreated}
            onVerified={onVerified}
          />
        </BottomSheet.Content>
      </AppBottomSheetPortal>
    </BottomSheet>
  );
}
