import type { PlutusAIErrorCode } from "../ai-errors";

/** One explicit voice state instead of booleans scattered across the screen. */
export type VoiceState =
  | { type: "idle" }
  | { type: "requesting_permission" }
  | { type: "recording"; startedAt: number }
  | { type: "finalizing" }
  | { type: "validating_audio" }
  | { type: "transcribing" }
  | { type: "ready_transcript"; transcript: string }
  | { type: "cancelled" }
  | { type: "error"; code: PlutusAIErrorCode };

export type VoiceEvent =
  | { type: "request_permission" }
  | { type: "permission_granted"; at: number }
  | { type: "stop" }
  | { type: "validate" }
  | { type: "transcribe" }
  | { type: "transcript"; transcript: string }
  | { type: "cancel" }
  | { type: "fail"; code: PlutusAIErrorCode }
  | { type: "reset" };

/** Transitions that are not listed leave the state unchanged. */
export function voiceReducer(state: VoiceState, event: VoiceEvent): VoiceState {
  switch (event.type) {
    case "request_permission":
      return state.type === "idle" || state.type === "error" || state.type === "cancelled" || state.type === "ready_transcript"
        ? { type: "requesting_permission" }
        : state;
    case "permission_granted":
      return state.type === "requesting_permission" ? { type: "recording", startedAt: event.at } : state;
    case "stop":
      return state.type === "recording" ? { type: "finalizing" } : state;
    case "validate":
      return state.type === "finalizing" ? { type: "validating_audio" } : state;
    case "transcribe":
      return state.type === "validating_audio" ? { type: "transcribing" } : state;
    case "transcript":
      return state.type === "transcribing" ? { type: "ready_transcript", transcript: event.transcript } : state;
    case "cancel":
      return state.type === "idle" ? state : { type: "cancelled" };
    case "fail":
      return { type: "error", code: event.code };
    case "reset":
      return { type: "idle" };
  }
}

export function isVoiceBusy(state: VoiceState) {
  return (
    state.type === "requesting_permission" ||
    state.type === "recording" ||
    state.type === "finalizing" ||
    state.type === "validating_audio" ||
    state.type === "transcribing"
  );
}
