import { useCallback, useEffect, useRef, useState } from "react";
import type { LiteRTLMInstance } from "react-native-litert-lm";

import nativeAI from "../../../modules/plutus-local-ai/src/PlutusLocalAIModule";
import { CHAT_INSTRUCTION } from "./chat-tools";

type EngineStatus = "idle" | "loading" | "ready" | "failed";

/**
 * Loads the model into memory only while the chat screen is mounted and frees
 * it on unmount, including when unmount happens mid-load.
 */
export function useLocalAIEngine(enabled: boolean) {
  const engine = useRef<LiteRTLMInstance | null>(null);
  const [attempt, setAttempt] = useState(0);
  const [released, setReleased] = useState(false);
  // Settled outcome per attempt; anything newer is still loading.
  const [outcome, setOutcome] = useState<{
    attempt: number;
    error: string;
  } | null>(null);

  useEffect(() => {
    if (!enabled || !nativeAI) return;
    const ai = nativeAI;
    let disposed = false;
    let instance: LiteRTLMInstance | null = null;
    void (async () => {
      // A retry may be caused by a runtime cache that no longer matches.
      if (attempt > 0) await ai.clearRuntimeCacheAsync();
      const path = await ai.getModelPathAsync();
      const { createLLM } = await import("react-native-litert-lm");
      if (disposed) return;
      instance = createLLM();
      await instance.loadModel(path, {
        backend: "gpu",
        systemPrompt: CHAT_INSTRUCTION,
        maxContextTokens: 4096,
        maxOutputTokens: 512,
      });
      if (disposed) {
        instance.close();
        return;
      }
      engine.current = instance;
      setOutcome({ attempt, error: "" });
    })().catch((cause) => {
      instance?.close();
      instance = null;
      if (disposed) return;
      setOutcome({ attempt, error: String(cause) });
    });
    return () => {
      disposed = true;
      // A load still in flight closes itself when it settles (see above).
      if (engine.current === instance) {
        engine.current = null;
        instance?.close();
      }
    };
  }, [enabled, attempt]);

  /** Frees memory before navigating away, ahead of the unmount cleanup. */
  const release = useCallback(() => {
    const current = engine.current;
    engine.current = null;
    current?.close();
    setReleased(true);
  }, []);

  const retry = useCallback(() => setAttempt((value) => value + 1), []);

  const settled = outcome?.attempt === attempt ? outcome : null;
  const status: EngineStatus =
    !enabled || !nativeAI || released
      ? "idle"
      : !settled
        ? "loading"
        : settled.error
          ? "failed"
          : "ready";
  const error = status === "failed" ? (settled?.error ?? "") : "";

  return { engine, status, ready: status === "ready", error, retry, release };
}
