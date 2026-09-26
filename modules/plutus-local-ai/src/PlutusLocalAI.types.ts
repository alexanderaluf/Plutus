export type LocalAIDownloadStatus =
  "idle" | "downloading" | "paused" | "verifying" | "installed" | "failed";

export type LocalAIDownloadState = {
  status: LocalAIDownloadStatus;
  received: number;
  total: number;
  error: string | null;
};

export type PlutusLocalAIModuleEvents = Record<string, never>;

/** Header facts of a recorded WAV, read natively. */
export type VoiceRecordingInfo = {
  uri: string;
  /** Plain filesystem path, as LiteRT-LM requires. */
  path: string;
  container: "wav" | "unknown";
  /** 1 = PCM. */
  format: number;
  sampleRate: number;
  channels: number;
  bitsPerSample: number;
  dataBytes: number;
  sizeBytes: number;
  durationMs: number;
};
