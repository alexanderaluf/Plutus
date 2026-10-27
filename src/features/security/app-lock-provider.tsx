import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type PropsWithChildren,
} from "react";
import { AppState } from "react-native";

import {
  DEFAULT_APP_LOCK,
  shouldRelock,
  type AppLockSettings,
} from "./app-lock-policy";
import {
  clearPin,
  isShowingSystemPrompt,
  readAppLock,
  readBiometricSupport,
  savePin,
  verifyPin,
  writeAppLockSettings,
  type BiometricSupport,
} from "./app-lock-store";
import { AppLockScreen } from "./components/app-lock-screen";

type AppLockContextValue = {
  settings: AppLockSettings;
  hasPin: boolean;
  biometric: BiometricSupport;
  locked: boolean;
  unlock: () => void;
  saveSettings: (settings: AppLockSettings) => Promise<void>;
  setPin: (pin: string) => Promise<void>;
  removePin: () => Promise<void>;
  checkPin: (pin: string) => Promise<boolean>;
  refreshBiometric: () => Promise<BiometricSupport>;
};

const AppLockContext = createContext<AppLockContextValue | null>(null);

/**
 * Locks the app on launch and after it was away longer than the chosen delay.
 * While the app is hidden, a cover keeps finances out of the app switcher.
 */
export function AppLockProvider({ children }: PropsWithChildren) {
  const [ready, setReady] = useState(false);
  const [settings, setSettings] = useState<AppLockSettings>(DEFAULT_APP_LOCK);
  const [hasPin, setHasPin] = useState(false);
  const [biometric, setBiometric] = useState<BiometricSupport>({
    available: false,
    kind: null,
    deviceSecure: false,
  });
  const [locked, setLocked] = useState(false);
  const [covered, setCovered] = useState(false);
  const settingsRef = useRef(settings);
  const leftAt = useRef<number | null>(null);

  useEffect(() => {
    let cancelled = false;
    void Promise.all([readAppLock(), readBiometricSupport()])
      .then(([stored, support]) => {
        if (cancelled) return;
        settingsRef.current = stored.settings;
        setSettings(stored.settings);
        setHasPin(stored.hasPin);
        setBiometric(support);
        setLocked(stored.settings.enabled);
      })
      // An unreadable keystore must not brick the app; it opens unlocked.
      .catch(() => undefined)
      .finally(() => {
        if (!cancelled) setReady(true);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    const subscription = AppState.addEventListener("change", (state) => {
      const current = settingsRef.current;
      // Our own Face ID / passcode prompt is not the user leaving the app.
      if (isShowingSystemPrompt()) {
        if (state === "active") setCovered(false);
        return;
      }
      if (state === "background") {
        leftAt.current ??= Date.now();
        setCovered(current.enabled);
      } else if (state === "inactive") {
        // iOS takes the app-switcher snapshot while inactive.
        setCovered(current.enabled);
      } else if (state === "active") {
        setCovered(false);
        if (shouldRelock(current, leftAt.current, Date.now())) setLocked(true);
        leftAt.current = null;
      }
    });
    return () => subscription.remove();
  }, []);

  const saveSettings = useCallback(async (next: AppLockSettings) => {
    await writeAppLockSettings(next);
    settingsRef.current = next;
    setSettings(next);
  }, []);

  const setPin = useCallback(async (pin: string) => {
    await savePin(pin);
    setHasPin(true);
  }, []);

  const removePin = useCallback(async () => {
    await clearPin();
    setHasPin(false);
  }, []);

  const refreshBiometric = useCallback(async () => {
    const support = await readBiometricSupport();
    setBiometric(support);
    return support;
  }, []);

  const value = useMemo<AppLockContextValue>(
    () => ({
      settings,
      hasPin,
      biometric,
      locked,
      unlock: () => setLocked(false),
      saveSettings,
      setPin,
      removePin,
      checkPin: verifyPin,
      refreshBiometric,
    }),
    [
      settings,
      hasPin,
      biometric,
      locked,
      saveSettings,
      setPin,
      removePin,
      refreshBiometric,
    ],
  );

  // Rendering nothing until the keystore answers avoids a flash of content.
  if (!ready) return null;

  return (
    <AppLockContext.Provider value={value}>
      {children}
      <AppLockScreen
        locked={locked}
        covered={covered && settings.enabled}
        onUnlock={() => setLocked(false)}
      />
    </AppLockContext.Provider>
  );
}

export function useAppLock() {
  const context = useContext(AppLockContext);
  if (!context)
    throw new Error("useAppLock must be used within AppLockProvider");
  return context;
}
