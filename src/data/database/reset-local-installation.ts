import { deleteDatabaseAsync } from "expo-sqlite";

import { clearLocalAttachmentStorage } from "../attachments/attachment-store";
import { clearNativePartitionCache } from "./fast-store-client";
import { getRecoveryDirectory } from "./safe-startup";

export const LOCAL_DATABASE_NAME = "budget-manager.db";

export async function resetLocalInstallation() {
  clearNativePartitionCache();
  await deleteDatabaseAsync(LOCAL_DATABASE_NAME);

  let cleanupError: unknown;
  try {
    clearLocalAttachmentStorage();
  } catch (error) {
    cleanupError = error;
  }

  try {
    const recovery = getRecoveryDirectory();
    if (recovery.exists) recovery.delete();
  } catch (error) {
    cleanupError ??= error;
  }

  if (cleanupError) throw cleanupError;
}