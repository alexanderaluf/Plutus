import { useCallback, useEffect, useState } from "react";
import { AppState } from "react-native";

import nativeAI from "../../../modules/plutus-local-ai/src/PlutusLocalAIModule";
import type { LocalAIDownloadState } from "../../../modules/plutus-local-ai/src/PlutusLocalAI.types";
import type { LocalAIModelKey } from "./model-compatibility-policy";

const KEYS: LocalAIModelKey[] = ["E2B", "E4B"];
const ACTIVE = new Set(["downloading", "paused", "verifying"]);

/** The OS owns transfers. Poll both models so selection does not hide a download. */
export function useModelDownload(modelKey: LocalAIModelKey) {
  const [states, setStates] = useState<
    Partial<Record<LocalAIModelKey, LocalAIDownloadState>>
  >({});
  const [error, setError] = useState("");
  const refresh = useCallback(async () => {
    if (!nativeAI) return;
    const ai = nativeAI;
    try {
      const pairs = await Promise.all(
        KEYS.map(
          async (key) => [key, await ai.getDownloadStateAsync(key)] as const,
        ),
      );
      setStates(Object.fromEntries(pairs));
    } catch (cause) {
      setError(String(cause));
    }
  }, []);
  useEffect(() => {
    void refresh();
    const sub = AppState.addEventListener("change", (next) => {
      if (next === "active") void refresh();
    });
    return () => sub.remove();
  }, [refresh]);
  useEffect(() => {
    if (
      !Object.values(states).some((state) => state && ACTIVE.has(state.status))
    )
      return;
    const timer = setInterval(() => void refresh(), 1000);
    return () => clearInterval(timer);
  }, [states, refresh]);
  const start = useCallback(
    async (key: LocalAIModelKey) => {
      if (!nativeAI) return;
      setError("");
      try {
        await nativeAI.downloadAsync(key);
      } catch (cause) {
        setError(String(cause));
      }
      await refresh();
    },
    [refresh],
  );
  const remove = useCallback(
    async (key: LocalAIModelKey) => {
      if (!nativeAI) return;
      setError("");
      try {
        await nativeAI.deleteModelAsync(key);
        await refresh();
      } catch (cause) {
        setError(String(cause));
        throw cause;
      }
    },
    [refresh],
  );
  const state = states[modelKey] ?? null;
  return {
    states,
    state,
    installed: state?.status === "installed",
    active: !!state && ACTIVE.has(state.status),
    progress: state?.total ? Math.min(1, state.received / state.total) : 0,
    error: error || state?.error || "",
    start,
    remove,
    refresh,
  };
}
