import { NativeModule, requireOptionalNativeModule } from "expo";

import type {
  LocalAIDownloadState,
  PlutusLocalAIModuleEvents,
  VoiceRecordingInfo,
} from "./PlutusLocalAI.types";

declare class PlutusLocalAIModule extends NativeModule<PlutusLocalAIModuleEvents> {
  isInstalledAsync(): Promise<boolean>;
  /** Also finalizes a finished transfer; safe to call from any screen. */
  getDownloadStateAsync(): Promise<LocalAIDownloadState>;
  /** Starts a system-managed download that continues outside the app. */
  downloadAsync(): Promise<void>;
  getModelPathAsync(): Promise<string>;
  getAvailableMemoryAsync(): Promise<number>;
  clearRuntimeCacheAsync(): Promise<void>;
  /** iOS only: cancels the platform on-device recognizer fallback. */
  cancelVoiceRecognitionAsync(): Promise<void>;
  /** iOS only: Apple's on-device recognizer, used when Gemma audio fails. */
  transcribeRecordingAsync(uri: string, language: string): Promise<string>;
  /** Records 16 kHz mono PCM16 WAV into the app-private cache. */
  startRecordingAsync(maxDurationMs: number): Promise<void>;
  /** 0…1 input level for the recording meter. */
  getRecordingLevelAsync(): Promise<number>;
  stopRecordingAsync(): Promise<VoiceRecordingInfo>;
  stopRecordingAndDeleteAsync(): Promise<void>;
  /** Deletes a recording this module created; other paths are refused. */
  deleteRecordingAsync(path: string): Promise<boolean>;
  /** Re-reads the WAV header of a recording this module created. */
  inspectRecordingAsync(path: string): Promise<VoiceRecordingInfo>;
}

export default requireOptionalNativeModule<PlutusLocalAIModule>(
  "PlutusLocalAI",
);
