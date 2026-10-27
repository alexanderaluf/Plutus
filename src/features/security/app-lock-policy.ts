// Pure app-lock rules. Native storage and biometrics live in app-lock-store.

export const PIN_LENGTH = 4;
/** Seconds the app may stay in the background before it locks again. */
export const RELOCK_DELAYS = [0, 60, 300, 900, 1800, 3600] as const;
export type RelockDelay = (typeof RELOCK_DELAYS)[number];
export type AppLockMethod = "biometric" | "pin";

export type AppLockSettings = {
  enabled: boolean;
  method: AppLockMethod;
  relockAfterSeconds: RelockDelay;
};

export const DEFAULT_APP_LOCK: AppLockSettings = {
  enabled: false,
  method: "biometric",
  // A grace minute keeps photo and file pickers from relocking the app.
  relockAfterSeconds: 60,
};

/** Wrong PINs allowed before a cooldown; each further round doubles it. */
export const PIN_ATTEMPTS_PER_ROUND = 5;
export const PIN_COOLDOWN_MS = 30_000;

export function isValidPin(pin: string) {
  return new RegExp(`^\\d{${PIN_LENGTH}}$`).test(pin);
}

export function parseAppLockSettings(raw: string | null): AppLockSettings {
  if (!raw) return { ...DEFAULT_APP_LOCK };
  try {
    const value = JSON.parse(raw) as Partial<AppLockSettings>;
    return {
      enabled: value.enabled === true,
      method: value.method === "pin" ? "pin" : "biometric",
      relockAfterSeconds: RELOCK_DELAYS.includes(
        value.relockAfterSeconds as RelockDelay,
      )
        ? (value.relockAfterSeconds as RelockDelay)
        : DEFAULT_APP_LOCK.relockAfterSeconds,
    };
  } catch {
    return { ...DEFAULT_APP_LOCK };
  }
}

/** Whether returning to the app after `leftAt` must show the lock screen. */
export function shouldRelock(
  settings: AppLockSettings,
  leftAt: number | null,
  now: number,
) {
  return (
    settings.enabled &&
    leftAt !== null &&
    now - leftAt >= settings.relockAfterSeconds * 1000
  );
}

/** Epoch ms until which PIN entry is blocked, or null when allowed. */
export function pinCooldownUntil(failures: number, lastFailureAt: number) {
  if (failures < PIN_ATTEMPTS_PER_ROUND || failures % PIN_ATTEMPTS_PER_ROUND)
    return null;
  const round = failures / PIN_ATTEMPTS_PER_ROUND;
  return lastFailureAt + PIN_COOLDOWN_MS * 2 ** (round - 1);
}
