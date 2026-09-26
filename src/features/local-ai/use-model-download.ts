import { useCallback, useEffect, useState } from "react";
import { AppState } from "react-native";

import nativeAI from "../../../modules/plutus-local-ai/src/PlutusLocalAIModule";
import type { LocalAIDownloadState } from "../../../modules/plutus-local-ai/src/PlutusLocalAI.types";

const ACTIVE = new Set(["downloading", "paused", "verifying"]);

/**
 * Mirrors the native download state. The transfer itself is owned by the OS
 * (DownloadManager / background URLSession), so leaving this screen or the app
 * never stops it; this hook only polls while the screen is visible.
 */
export function useModelDownload() {
  const [state, setState] = useState<LocalAIDownloadState | null>(null);
  const [startError, setStartError] = useState("");

  const refresh = useCallback(async () => {
    if (!nativeAI) return;
    try {
      setState(await nativeAI.getDownloadStateAsync());
    } catch (cause) {
      setStartError(String(cause));
    }
  }, []);

  useEffect(() => {
    nativeAI
      ?.getDownloadStateAsync()
      .then(setState)
      .catch((cause) => setStartError(String(cause)));
    const sub = AppState.addEventListener("change", (next) => {
      if (next === "active") void refresh();
    });
    return () => sub.remove();
  }, [refresh]);

  const active = !!state && ACTIVE.has(state.status);
  useEffect(() => {
    if (!active) return;
    const timer = setInterval(() => void refresh(), 1000);
    return () => clearInterval(timer);
  }, [active, refresh]);

  const start = useCallback(async () => {
    if (!nativeAI) return;
    setStartError("");
    try {
      await nativeAI.downloadAsync();
    } catch (cause) {
      setStartError(String(cause));
    }
    await refresh();
  }, [refresh]);

  return {
    state,
    installed: state?.status === "installed",
    active,
    progress: state?.total ? Math.min(1, state.received / state.total) : 0,
    error: startError || state?.error || "",
    start,
  };
}
