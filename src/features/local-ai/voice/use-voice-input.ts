import { useCallback, useEffect, useReducer, useRef, useState } from "react";
import { AppState, Platform } from "react-native";
import {
  getRecordingPermissionsAsync,
  requestRecordingPermissionsAsync,
} from "expo-audio";

import nativeAI from "../../../../modules/plutus-local-ai/src/PlutusLocalAIModule";
import { errorCode, PlutusAIError, type PlutusAIErrorCode } from "../ai-errors";
import type { ChatModel } from "../chat-controller";
import { TRANSCRIBE_PROMPT } from "../chat-prompts";
import { parseTranscript, validateRecording, VOICE_LIMITS } from "./voice-audio";
import { isVoiceBusy, voiceReducer } from "./voice-state";

/**
 * Push-to-talk: record a 16 kHz mono WAV in app-private storage, transcribe
 * it with the local Gemma model, and hand the text to the normal chat
 * pipeline. Audio never leaves the device and is deleted afterwards.
 */
/** Number of bars in the recording sound wave. */
export const WAVE_BARS = 36;

export function useVoiceInput(options: {
  model: { current: ChatModel | null };
  language: string;
  onTranscript: (transcript: string) => void;
  onError: (code: PlutusAIErrorCode) => void;
}) {
  const [state, dispatch] = useReducer(voiceReducer, { type: "idle" });
  const [level, setLevel] = useState(0);
  /** Recent input levels, oldest first, for the scrolling sound wave. */
  const [levels, setLevels] = useState<number[]>([]);
  const stateRef = useRef(state);
  const callbacks = useRef(options);
  useEffect(() => {
    stateRef.current = state;
    callbacks.current = options;
  });
  const generation = useRef(0);

  const fail = useCallback((code: PlutusAIErrorCode) => {
    dispatch({ type: "fail", code });
    callbacks.current.onError(code);
  }, []);

  const cancel = useCallback(async () => {
    generation.current++;
    if (!isVoiceBusy(stateRef.current)) return;
    dispatch({ type: "cancel" });
    await nativeAI?.stopRecordingAndDeleteAsync().catch(() => undefined);
    await nativeAI?.cancelVoiceRecognitionAsync().catch(() => undefined);
    dispatch({ type: "reset" });
  }, []);

  const start = useCallback(async () => {
    if (!nativeAI || isVoiceBusy(stateRef.current)) return;
    const run = ++generation.current;
    dispatch({ type: "request_permission" });
    try {
      // Asking again when already granted still opens the system permission
      // activity on Android, which briefly backgrounds the app. Only ask once.
      const current = await getRecordingPermissionsAsync();
      const permission = current.granted ? current : await requestRecordingPermissionsAsync();
      if (!permission.granted) throw new PlutusAIError("MIC_PERMISSION_DENIED");
      if (run !== generation.current) {
        dispatch({ type: "reset" });
        return;
      }
      await nativeAI.startRecordingAsync(VOICE_LIMITS.maxDurationMs);
      if (run !== generation.current) {
        await nativeAI.stopRecordingAndDeleteAsync().catch(() => undefined);
        dispatch({ type: "reset" });
        return;
      }
      setLevels([]);
      dispatch({ type: "permission_granted", at: Date.now() });
    } catch (error) {
      fail(errorCode(error, "AUDIO_RECORD_FAILED"));
    }
  }, [fail]);

  const transcribe = useCallback(async (path: string, uri: string) => {
    const model = callbacks.current.model.current;
    try {
      if (!model) throw new PlutusAIError("MODEL_NOT_INSTALLED");
      model.resetConversation("[]", "You transcribe audio. You never answer questions.");
      const output = await model.execute(
        [
          { type: "audio", path },
          { type: "text", text: TRANSCRIBE_PROMPT },
        ],
        undefined,
        { maxOutputTokens: 256 },
      );
      return parseTranscript(output).transcript;
    } catch (error) {
      // iOS keeps Apple's on-device recognizer as a fallback; still offline.
      if (Platform.OS === "ios" && nativeAI) {
        try {
          const text = await nativeAI.transcribeRecordingAsync(uri, callbacks.current.language);
          if (text.trim()) return text.trim();
        } catch {
          /* Report the Gemma failure below. */
        }
      }
      throw error instanceof PlutusAIError ? error : new PlutusAIError("AUDIO_INFERENCE_FAILED", String(error));
    }
  }, []);

  const stop = useCallback(async () => {
    if (!nativeAI || stateRef.current.type !== "recording") return;
    const run = generation.current;
    dispatch({ type: "stop" });
    let path: string | null = null;
    try {
      const info = await nativeAI.stopRecordingAsync();
      path = info.path;
      if (run !== generation.current) return;
      dispatch({ type: "validate" });
      validateRecording(info);
      dispatch({ type: "transcribe" });
      const transcript = await transcribe(info.path, info.uri);
      if (run !== generation.current) return;
      if (!transcript) throw new PlutusAIError("TRANSCRIPT_EMPTY");
      dispatch({ type: "transcript", transcript });
      callbacks.current.onTranscript(transcript);
      dispatch({ type: "reset" });
    } catch (error) {
      if (run === generation.current) fail(errorCode(error, "AUDIO_INFERENCE_FAILED"));
    } finally {
      // Recordings are never kept.
      if (path) await nativeAI.deleteRecordingAsync(path).catch(() => undefined);
    }
  }, [fail, transcribe]);

  // Level meter and the hard duration limit.
  useEffect(() => {
    if (state.type !== "recording" || !nativeAI) return;
    const startedAt = state.startedAt;
    const timer = setInterval(() => {
      if (Date.now() - startedAt >= VOICE_LIMITS.maxDurationMs) {
        void stop();
        return;
      }
      void nativeAI!
        .getRecordingLevelAsync()
        .then((value) => {
          const next = Math.min(1, Math.max(0, value));
          setLevel(next);
          setLevels((current) => [...current.slice(-(WAVE_BARS - 1)), next]);
        })
        .catch(() => undefined);
    }, 120);
    return () => clearInterval(timer);
  }, [state, stop]);

  // Backgrounding or leaving the screen stops the microphone and deletes audio.
  useEffect(() => {
    const subscription = AppState.addEventListener("change", (next) => {
      // Permission dialogs make the app briefly "inactive"/"background";
      // only a real background move during capture or transcription cancels.
      const type = stateRef.current.type;
      if (next === "background" && type !== "requesting_permission" && type !== "idle") void cancel();
    });
    return () => {
      subscription.remove();
      void cancel();
    };
  }, [cancel]);

  return {
    state,
    level: state.type === "recording" ? level : 0,
    levels: state.type === "recording" ? levels : [],
    busy: isVoiceBusy(state),
    recording: state.type === "recording",
    start,
    stop,
    cancel,
    reset: () => dispatch({ type: "reset" }),
  };
}
