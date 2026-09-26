/** Typed failures; the UI maps each to safe, translated copy. */
export type PlutusAIErrorCode =
  | "MODEL_NOT_INSTALLED"
  | "MODEL_CORRUPT"
  | "DEVICE_INCOMPATIBLE"
  | "INSUFFICIENT_RAM"
  | "INSUFFICIENT_STORAGE"
  | "ENGINE_INIT_FAILED"
  | "AUDIO_BACKEND_INIT_FAILED"
  | "MIC_PERMISSION_DENIED"
  | "AUDIO_RECORD_FAILED"
  | "AUDIO_EMPTY"
  | "AUDIO_TOO_SHORT"
  | "AUDIO_TOO_LONG"
  | "AUDIO_FORMAT_INVALID"
  | "AUDIO_NORMALIZATION_FAILED"
  | "AUDIO_INFERENCE_FAILED"
  | "TRANSCRIPT_EMPTY"
  | "TOOL_PLAN_INVALID"
  | "TOOL_EXECUTION_FAILED"
  | "AMBIGUOUS_ENTITY"
  | "PROPOSAL_STALE"
  | "MUTATION_VALIDATION_FAILED"
  | "MUTATION_FAILED"
  | "INFERENCE_CANCELLED";

export class PlutusAIError extends Error {
  constructor(
    readonly code: PlutusAIErrorCode,
    detail?: string,
  ) {
    super(detail ? `${code}: ${detail}` : code);
  }
}

/** Native errors carry the code as a message prefix, e.g. "AUDIO_EMPTY: …". */
export function errorCode(error: unknown, fallback: PlutusAIErrorCode): PlutusAIErrorCode {
  if (error instanceof PlutusAIError) return error.code;
  const match = String(error instanceof Error ? error.message : error).match(
    /\b(MODEL_NOT_INSTALLED|AUDIO_[A-Z_]+|MIC_PERMISSION_DENIED|TRANSCRIPT_EMPTY|INFERENCE_CANCELLED)\b/,
  );
  return (match?.[1] as PlutusAIErrorCode | undefined) ?? fallback;
}
