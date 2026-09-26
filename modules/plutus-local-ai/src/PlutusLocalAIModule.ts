import { NativeModule, requireOptionalNativeModule } from "expo";

import type {
  LocalAIDownloadState,
  PlutusLocalAIModuleEvents,
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
  startVoiceRecognitionAsync(language: string): Promise<void>;
  stopVoiceRecognitionAsync(): Promise<string>;
  cancelVoiceRecognitionAsync(): Promise<void>;
  transcribeRecordingAsync(uri: string, language: string): Promise<string>;
  startRecordingAsync(): Promise<void>;
  stopRecordingAsync(): Promise<string>;
  stopRecordingAndDeleteAsync(): Promise<void>;
}

export default requireOptionalNativeModule<PlutusLocalAIModule>(
  "PlutusLocalAI",
);
