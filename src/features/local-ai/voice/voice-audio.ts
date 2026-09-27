import type { VoiceRecordingInfo } from "../../../../modules/plutus-local-ai/src/PlutusLocalAI.types";
import { PlutusAIError } from "../ai-errors";

export const VOICE_LIMITS = {
  /** Push-to-talk questions are short; the limit is configurable here. */
  maxDurationMs: 60_000,
  minDurationMs: 400,
  maxSizeBytes: 16_000 * 2 * 61 + 4_096,
  sampleRate: 16_000,
} as const;

/**
 * The integration contract for Gemma 4 audio input: WAV, PCM, 16 kHz, mono,
 * 16-bit, non-empty and within the duration limit. Throws a typed error.
 */
export function validateRecording(
  info: VoiceRecordingInfo,
  limits: { maxDurationMs: number; minDurationMs: number; maxSizeBytes: number; sampleRate: number } = VOICE_LIMITS,
) {
  if (!info.path || !info.path.startsWith("/"))
    throw new PlutusAIError("AUDIO_FORMAT_INVALID", "recording path must be an absolute file path");
  if (info.container !== "wav" || info.format !== 1)
    throw new PlutusAIError("AUDIO_FORMAT_INVALID", "not a PCM WAV file");
  if (info.sampleRate !== limits.sampleRate || info.channels !== 1 || info.bitsPerSample !== 16)
    throw new PlutusAIError(
      "AUDIO_NORMALIZATION_FAILED",
      `${info.sampleRate} Hz, ${info.channels} channels, ${info.bitsPerSample} bit`,
    );
  if (info.dataBytes <= 0) throw new PlutusAIError("AUDIO_EMPTY");
  if (info.durationMs < limits.minDurationMs) throw new PlutusAIError("AUDIO_TOO_SHORT");
  if (info.durationMs > limits.maxDurationMs + 1_000 || info.sizeBytes > limits.maxSizeBytes)
    throw new PlutusAIError("AUDIO_TOO_LONG");
  return info;
}

/** `file:///…` (as React Native reports it) to the plain path the engine needs. */
export function uriToPath(uri: string) {
  if (!uri.startsWith("file://")) return uri;
  return decodeURIComponent(uri.replace(/^file:\/\//, ""));
}

/**
 * The transcription step asks for `{"transcript","language"}`. Small models
 * sometimes wrap it in prose or fences; recover the text, never invent it.
 */
export function parseTranscript(output: string): { transcript: string; language: string } {
  const text = output.replace(/```(?:json)?/gi, "").trim();
  const start = text.indexOf("{");
  const end = text.lastIndexOf("}");
  if (start !== -1 && end > start) {
    try {
      const parsed = JSON.parse(text.slice(start, end + 1)) as Record<string, unknown>;
      const transcript = typeof parsed.transcript === "string" ? parsed.transcript.trim() : "";
      const language = typeof parsed.language === "string" ? parsed.language.trim().toLowerCase() : "";
      if (transcript) return { transcript, language: language || detectLanguage(transcript) };
    } catch {
      /* Fall through to the field-level recovery below. */
    }
  }
  // Truncated or malformed JSON: take the transcript field alone.
  const match = text.match(/"transcript"\s*:\s*"((?:[^"\\]|\\.)*)"/);
  if (match) {
    const transcript = match[1].replace(/\\"/g, '"').replace(/\\n/g, " ").trim();
    if (transcript) return { transcript, language: detectLanguage(transcript) };
  }
  const plain = text
    .replace(/^(transcript(ion)?|the user said|user)\s*[:：-]\s*/i, "")
    .replace(/^["“«]|["”»]$/g, "")
    .trim();
  if (!plain) throw new PlutusAIError("TRANSCRIPT_EMPTY");
  return { transcript: plain, language: detectLanguage(plain) };
}

function detectLanguage(text: string) {
  if (/[֐-׿]/.test(text)) return "he";
  if (/[Ѐ-ӿ]/.test(text)) return "ru";
  return "en";
}
