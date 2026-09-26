export type LocalAIDownloadStatus =
  "idle" | "downloading" | "paused" | "verifying" | "installed" | "failed";

export type LocalAIDownloadState = {
  status: LocalAIDownloadStatus;
  received: number;
  total: number;
  error: string | null;
};

export type PlutusLocalAIModuleEvents = Record<string, never>;
