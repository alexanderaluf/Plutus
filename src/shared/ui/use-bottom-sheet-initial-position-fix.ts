import { useCallback, useEffect, useRef, useState } from "react";
import { Platform, StyleSheet } from "react-native";

/** The two Gorhom sheet methods this hook drives (passed via `ref`). */
export type SheetPositionHandle = {
  snapToIndex: (index: number) => void;
  close: () => void;
};

/** How often, and how many times, an unconfirmed open/close is re-sent. */
export const SHEET_SYNC_INTERVAL_MS = 120;
export const SHEET_SYNC_MAX_ATTEMPTS = 25;

/**
 * What the sheet still needs, given what the app wants (`isOpen`) and where
 * Gorhom last reported it settled (-1 closed, >= 0 an open snap point).
 */
export function sheetSyncCommand(
  isOpen: boolean,
  settledIndex: number,
): "open" | "close" | null {
  if (isOpen) return settledIndex >= 0 ? null : "open";
  return settledIndex === -1 ? null : "close";
}

/**
 * Re-sends the open/close request until Gorhom confirms it. Gorhom silently
 * drops `snapToIndex`/`close` while its layout is still being measured, and
 * HeroUI sends each request only once, so on Android a sheet could stay at
 * its closed position: below the screen, or peeking behind the navigation
 * buttons when it was measured shorter than the window. Repeating a request
 * that is already animating is a no-op in Gorhom, so retries are harmless.
 * Returns a function that stops the retries.
 */
export function startSheetSync({
  isOpen,
  openIndex,
  getSettledIndex,
  getSheet,
  schedule,
  cancel,
}: {
  isOpen: boolean;
  openIndex: number;
  getSettledIndex: () => number;
  getSheet: () => SheetPositionHandle | null;
  schedule: (callback: () => void, delay: number) => unknown;
  cancel: (handle: unknown) => void;
}) {
  let attempts = 0;
  let handle: unknown = null;
  const tick = () => {
    const command = sheetSyncCommand(isOpen, getSettledIndex());
    if (!command) return;
    const sheet = getSheet();
    if (command === "open") sheet?.snapToIndex(openIndex);
    else sheet?.close();
    attempts += 1;
    if (attempts < SHEET_SYNC_MAX_ATTEMPTS)
      handle = schedule(tick, SHEET_SYNC_INTERVAL_MS);
  };
  // HeroUI sends the first request itself; check after it had time to land.
  handle = schedule(tick, SHEET_SYNC_INTERVAL_MS);
  return () => {
    if (handle !== null) cancel(handle);
  };
}

/**
 * Keeps an Android Gorhom sheet where the app wants it. Pass `bindSheet` as
 * the `ref` of `BottomSheet.Content`, with `containerStyle` and `onChange`.
 *
 * - Opening and closing are confirmed by Gorhom's `onChange`; unconfirmed
 *   requests are retried (see `startSheetSync`).
 * - A sheet that is closed and settled is hidden, so a sheet left at a
 *   miscalculated closed position can never show behind the system buttons.
 *
 * iOS uses native SwiftUI sheets and is unaffected.
 */
export function useBottomSheetInitialPositionFix(
  isOpen: boolean,
  openIndex = 0,
) {
  const sheet = useRef<SheetPositionHandle | null>(null);
  // A callback ref: it accepts Gorhom's full method set and keeps the
  // returned object free of ref objects, so it can be read during render.
  const bindSheet = useCallback((instance: SheetPositionHandle | null) => {
    sheet.current = instance;
  }, []);
  const settledIndex = useRef(-1);
  const [isSettledClosed, setIsSettledClosed] = useState(true);

  const onChange = useCallback((index: number) => {
    settledIndex.current = index;
    setIsSettledClosed(index < 0);
  }, []);

  useEffect(() => {
    if (Platform.OS !== "android") return;
    return startSheetSync({
      isOpen,
      openIndex,
      getSettledIndex: () => settledIndex.current,
      getSheet: () => sheet.current,
      schedule: (callback, delay) => setTimeout(callback, delay),
      cancel: (handle) => clearTimeout(handle as ReturnType<typeof setTimeout>),
    });
  }, [isOpen, openIndex]);

  return {
    bindSheet,
    containerStyle:
      Platform.OS === "android" && !isOpen && isSettledClosed
        ? styles.hidden
        : undefined,
    onChange,
  };
}

const styles = StyleSheet.create({
  // Invisible and moved away, so a stranded closed sheet cannot catch taps
  // meant for the page's bottom buttons. Transforms do not change the layout
  // Gorhom measures, so its positions stay correct.
  hidden: {
    opacity: 0,
    transform: [{ translateY: 10000 }],
  },
});
