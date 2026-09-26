import { useCallback, useEffect, useRef, useState } from "react";
import type { LiteRTLMInstance } from "react-native-litert-lm";

import nativeAI from "../../../modules/plutus-local-ai/src/PlutusLocalAIModule";
import { LOCAL_AI_MODEL } from "./model-compatibility-policy";

const MODEL_CONFIG = {
  // Replaced per question with today's date, currency and the tool packs.
  systemPrompt: "You are Plutus, a private on-device financial assistant.",
  maxOutputTokens: 1024,
  // Reasoning tokens would compete with record context and slow replies.
  thinking: { enabled: false },
} as const;

/**
 * Larger windows let the model read more records at once. Smaller windows are
 * tried when the device cannot spare the KV-cache memory.
 */
const CONTEXT_SIZES = [8192, 4096] as const;

function isMemoryError(cause: unknown) {
  return /MemoryError|out of memory|insufficient memory|memory pressure/i.test(
    String(cause),
  );
}

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
    memoryLimited: boolean;
    contextTokens: number;
    /** True when the engine was created with the audio backend. */
    audio?: boolean;
  } | null>(null);

  useEffect(() => {
    if (!enabled || !nativeAI) return;
    const ai = nativeAI;
    let disposed = false;
    let instance: LiteRTLMInstance | null = null;
    void (async () => {
      // A retry may be caused by a runtime cache that no longer matches.
      if (attempt > 0) await ai.clearRuntimeCacheAsync();
      const availableMemory = await ai.getAvailableMemoryAsync();
      const path = await ai.getModelPathAsync();
      const { createLLM, estimateMemory } = await import("react-native-litert-lm");
      if (disposed) return;
      let failure: unknown = null;
      let memoryLimited = false;
      // Some Android GPU drivers initialize LiteRT-LM successfully but fail on
      // the first decode. Prefer the stable CPU path for this small model.
      // `multimodal` must be explicit: without it the runtime guesses from the
      // file name, treats Gemma 4 as text-only and never creates the audio
      // backend, so voice input cannot work. Text-only is the last resort.
      const attempts = [
        ...(["cpu", "gpu"] as const).flatMap((backend) =>
          CONTEXT_SIZES.map((maxContextTokens) => ({ backend, maxContextTokens, multimodal: true })),
        ),
        { backend: "cpu" as const, maxContextTokens: 4096, multimodal: false },
      ];
      for (const { backend, maxContextTokens, multimodal } of attempts) {
        const config = { ...MODEL_CONFIG, backend, maxContextTokens, multimodal };
        const estimate = estimateMemory({
          modelFileSizeBytes: LOCAL_AI_MODEL.sizeBytes,
          availableMemoryBytes: availableMemory,
          config,
        });
        if (estimate.verdict === "critical") {
          memoryLimited = true;
          continue;
        }
        if (disposed) return;
        instance = createLLM();
        try {
          await instance.loadModel(path, config);
          if (disposed) {
            instance.close();
            return;
          }
          engine.current = instance;
          setOutcome({
            attempt,
            error: "",
            memoryLimited: false,
            contextTokens: maxContextTokens,
            audio: multimodal,
          });
          return;
        } catch (cause) {
          instance.close();
          instance = null;
          failure = cause;
          memoryLimited = isMemoryError(cause);
        }
      }
      if (disposed) return;
      setOutcome({
        attempt,
        error: memoryLimited ? "" : String(failure),
        memoryLimited,
        contextTokens: 0,
      });
    })().catch((cause) => {
      instance?.close();
      instance = null;
      if (disposed) return;
      setOutcome({
        attempt,
        error: isMemoryError(cause) ? "" : String(cause),
        memoryLimited: isMemoryError(cause),
        contextTokens: 0,
      });
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
        : settled.error || settled.memoryLimited
          ? "failed"
          : "ready";
  const error = status === "failed" ? (settled?.error ?? "") : "";

  return {
    engine,
    status,
    ready: status === "ready",
    error,
    memoryLimited: status === "failed" && !!settled?.memoryLimited,
    contextTokens: settled?.contextTokens ?? 0,
    audioCapable: status === "ready" && settled?.audio === true,
    retry,
    release,
  };
}
