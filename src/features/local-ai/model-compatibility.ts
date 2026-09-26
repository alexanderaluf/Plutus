import Constants, { ExecutionEnvironment } from "expo-constants";
import * as Device from "expo-device";
import { Paths } from "expo-file-system";
import { Platform } from "react-native";
import {
  evaluateLocalAICompatibility,
  type LocalAICompatibility,
} from "./model-compatibility-policy";

export async function checkLocalAICompatibility(): Promise<LocalAICompatibility> {
  // Paths is an Expo SDK native API and is available in Expo Go. If an OS
  // refuses a capacity query, fail closed instead of guessing free space.
  let freeStorageBytes: number | null = null;
  try {
    freeStorageBytes = Paths.availableDiskSpace;
  } catch {
    // A reason is shown to the user by evaluateLocalAICompatibility.
  }
  return evaluateLocalAICompatibility({
    platform: Platform.OS,
    isDevice: Device.isDevice,
    architectures: Device.supportedCpuArchitectures,
    totalMemoryBytes: Device.totalMemory,
    freeStorageBytes,
    isExpoGo:
      Constants.executionEnvironment === ExecutionEnvironment.StoreClient,
  });
}
