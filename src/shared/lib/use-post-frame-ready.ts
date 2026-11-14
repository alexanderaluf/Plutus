import { useCallback, useEffect, useRef, useState } from "react";
import { Platform } from "react-native";

/**
 * Returns `false` during the first synchronous render so navigation transitions
 * and critical above-the-fold UI can commit in a single tiny frame, then flips
 * to `true` on the very next animation frame (~16ms) to mount secondary sections.
 */
export function usePostFrameReady(enabled = true): boolean {
  const [ready, setReady] = useState(!enabled);

  useEffect(() => {
    if (!enabled || ready) return;
    if (typeof requestAnimationFrame !== "function") {
      setReady(true);
      return;
    }
    const frameId = requestAnimationFrame(() => {
      setReady(true);
    });
    return () => cancelAnimationFrame(frameId);
  }, [enabled, ready]);

  return ready;
}

/**
 * Latches `true` on the first render where `isOpen` is truthy so closed modal
 * sheets mount zero native/portal views during initial screen transitions.
 */
export function useLazySheetMount(isOpen: boolean): boolean {
  const [mounted, setMounted] = useState(isOpen);
  if (isOpen && !mounted) {
    setMounted(true);
  }
  return mounted;
}

/**
 * Coordinates first-mount layout with Gorhom BottomSheet on Android so a freshly
 * mounted lazy sheet waits one layout frame before opening instead of dropping
 * its initial snap command.
 */
export function useLazySheetOpenState(isOpen: boolean) {
  const [readyToOpen, setReadyToOpen] = useState(Platform.OS === "ios");
  const openedRef = useRef(Platform.OS === "ios");
  const openingFrame = useRef<number | null>(null);

  useEffect(() => {
    return () => {
      if (openingFrame.current !== null && typeof cancelAnimationFrame === "function") {
        cancelAnimationFrame(openingFrame.current);
      }
    };
  }, []);

  const openAfterLayout = useCallback(() => {
    if (openedRef.current || openingFrame.current !== null) return;
    if (typeof requestAnimationFrame !== "function") {
      openedRef.current = true;
      setReadyToOpen(true);
      return;
    }
    openingFrame.current = requestAnimationFrame(() => {
      openingFrame.current = null;
      openedRef.current = true;
      setReadyToOpen(true);
    });
  }, []);

  const effectiveIsOpen = readyToOpen && isOpen;
  const canDismiss = useCallback(
    (open: boolean) => !open && openedRef.current && effectiveIsOpen,
    [effectiveIsOpen],
  );

  return { effectiveIsOpen, openAfterLayout, canDismiss };
}
