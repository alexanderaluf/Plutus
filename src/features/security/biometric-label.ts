import type { TFunction } from "i18next";
import { Platform } from "react-native";

import type { FilledIconName } from "@/shared/ui/filled-icon";

import type { BiometricKind } from "./app-lock-store";

/** Platform names users recognise: Face ID / Touch ID, or fingerprint. */
export function biometricLabel(kind: BiometricKind | null, t: TFunction) {
  if (Platform.OS === "ios")
    return t(
      kind === "fingerprint"
        ? "security.biometric.touchId"
        : "security.biometric.faceId",
    );
  return t(
    kind === "face"
      ? "security.biometric.faceUnlock"
      : kind === "iris"
        ? "security.biometric.iris"
        : "security.biometric.fingerprint",
  );
}

export function biometricIcon(kind: BiometricKind | null): FilledIconName {
  return kind === "face" ? "face" : "fingerprint";
}
