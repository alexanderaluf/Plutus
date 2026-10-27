import * as Crypto from "expo-crypto";
import * as LocalAuthentication from "expo-local-authentication";
import * as SecureStore from "expo-secure-store";

import {
  isValidPin,
  parseAppLockSettings,
  type AppLockSettings,
} from "./app-lock-policy";

/**
 * App-lock state lives only in the device keychain/keystore. It is never
 * written to the document, so backups never carry a PIN and a restore on a
 * new device cannot lock the user out.
 */
const SETTINGS_KEY = "plutus.appLock.settings";
const PIN_KEY = "plutus.appLock.pin";
const OPTIONS: SecureStore.SecureStoreOptions = {
  keychainAccessible: SecureStore.WHEN_UNLOCKED_THIS_DEVICE_ONLY,
};

export type BiometricKind = "face" | "fingerprint" | "iris";
export type BiometricSupport = {
  /** Hardware exists and the user enrolled at least one biometric. */
  available: boolean;
  kind: BiometricKind | null;
  /** The device has a screen lock, usable to recover a forgotten PIN. */
  deviceSecure: boolean;
};

export async function readAppLock() {
  const [settings, pin] = await Promise.all([
    SecureStore.getItemAsync(SETTINGS_KEY, OPTIONS),
    SecureStore.getItemAsync(PIN_KEY, OPTIONS),
  ]);
  return { settings: parseAppLockSettings(settings), hasPin: !!pin };
}

export async function writeAppLockSettings(settings: AppLockSettings) {
  await SecureStore.setItemAsync(
    SETTINGS_KEY,
    JSON.stringify(settings),
    OPTIONS,
  );
}

function hex(bytes: Uint8Array) {
  return Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join(
    "",
  );
}

function digest(salt: string, pin: string) {
  return Crypto.digestStringAsync(
    Crypto.CryptoDigestAlgorithm.SHA256,
    `${salt}:${pin}`,
  );
}

/** Stores only a salted SHA-256 of the PIN. */
export async function savePin(pin: string) {
  if (!isValidPin(pin)) throw new Error("Invalid PIN.");
  const salt = hex(Crypto.getRandomBytes(16));
  const hash = await digest(salt, pin);
  await SecureStore.setItemAsync(
    PIN_KEY,
    JSON.stringify({ salt, hash }),
    OPTIONS,
  );
}

export async function verifyPin(pin: string) {
  const stored = await SecureStore.getItemAsync(PIN_KEY, OPTIONS);
  if (!stored || !isValidPin(pin)) return false;
  try {
    const { salt, hash } = JSON.parse(stored) as { salt: string; hash: string };
    return (await digest(salt, pin)) === hash;
  } catch {
    return false;
  }
}

export async function clearPin() {
  await SecureStore.deleteItemAsync(PIN_KEY, OPTIONS);
}

export async function readBiometricSupport(): Promise<BiometricSupport> {
  try {
    const [hardware, enrolled, types, level] = await Promise.all([
      LocalAuthentication.hasHardwareAsync(),
      LocalAuthentication.isEnrolledAsync(),
      LocalAuthentication.supportedAuthenticationTypesAsync(),
      LocalAuthentication.getEnrolledLevelAsync(),
    ]);
    const { AuthenticationType } = LocalAuthentication;
    const kind: BiometricKind | null = types.includes(
      AuthenticationType.FACIAL_RECOGNITION,
    )
      ? "face"
      : types.includes(AuthenticationType.FINGERPRINT)
        ? "fingerprint"
        : types.includes(AuthenticationType.IRIS)
          ? "iris"
          : null;
    return {
      available: hardware && enrolled && kind !== null,
      kind,
      deviceSecure: level !== LocalAuthentication.SecurityLevel.NONE,
    };
  } catch {
    return { available: false, kind: null, deviceSecure: false };
  }
}

let systemPrompts = 0;

/** True while Plutus itself shows a system prompt (Face ID, passcode, …). */
export function isShowingSystemPrompt() {
  return systemPrompts > 0;
}

/**
 * Runs work that briefly hands the screen to the system. Face ID makes the
 * app "inactive" and the Android passcode screen backgrounds it; neither may
 * cover or relock the app. The flag outlives the promise slightly because the
 * "active" AppState event can arrive after it resolves.
 */
export async function withSystemPrompt<T>(work: () => Promise<T>) {
  systemPrompts++;
  try {
    return await work();
  } finally {
    setTimeout(() => {
      systemPrompts--;
    }, 800);
  }
}

/**
 * Face ID, Touch ID or the Android biometric prompt. The device passcode is
 * allowed as fallback so a failed sensor never locks the user out.
 */
export async function authenticateWithDevice(
  promptMessage: string,
  cancelLabel: string,
) {
  try {
    const result = await withSystemPrompt(() =>
      LocalAuthentication.authenticateAsync({
        promptMessage,
        cancelLabel,
        disableDeviceFallback: false,
      }),
    );
    return result.success;
  } catch {
    return false;
  }
}
