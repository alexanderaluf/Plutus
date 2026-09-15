import { Directory, File, Paths } from "expo-file-system";

import { i18n } from "@/localization/i18n";

import type { AttachmentManifest } from "../model/backup-document";

const APP_DIRECTORY_NAME = "budget-manager";
const ATTACHMENTS_DIRECTORY_NAME = "attachments";
const STAGING_DIRECTORY_NAME = "attachments-restoring";
const PREVIOUS_DIRECTORY_NAME = "attachments-previous";

function getAppDirectory() {
  return new Directory(Paths.document, APP_DIRECTORY_NAME);
}

export function clearLocalAttachmentStorage() {
  const directory = getAppDirectory();
  if (directory.exists) directory.delete();
}

export function getAttachmentsDirectory() {
  return new Directory(getAppDirectory(), ATTACHMENTS_DIRECTORY_NAME);
}

export function ensureLocalDirectories() {
  getAppDirectory().create({ idempotent: true, intermediates: true });
  getAttachmentsDirectory().create({ idempotent: true, intermediates: true });
}

function safeFileName(fileName: string) {
  return fileName.replace(/[^a-zA-Z0-9._-]/g, "-");
}

export async function persistAttachment(
  sourceUri: string,
  mimeType = "application/octet-stream",
): Promise<AttachmentManifest> {
  ensureLocalDirectories();
  const source = new File(sourceUri);
  const id = `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
  const fileName = safeFileName(source.name || `attachment${source.extension}`);
  const relativePath = `${id}-${fileName}`;
  const destination = new File(getAttachmentsDirectory(), relativePath);
  await source.copy(destination, { overwrite: true });

  return {
    id,
    fileName,
    mimeType: source.type || mimeType,
    relativePath,
    size: destination.size,
  };
}

export function getAttachmentFile(relativePath: string) {
  if (
    relativePath.includes("..") ||
    relativePath.startsWith("/") ||
    relativePath.includes("\\")
  ) {
    throw new Error(i18n.t("errors.attachments.unsafePath"));
  }

  return new File(getAttachmentsDirectory(), relativePath);
}

export function deleteAttachment(relativePath: string) {
  const file = getAttachmentFile(relativePath);
  if (file.exists) file.delete();
}

export type ArchivedAttachment = {
  relativePath: string;
  data: Uint8Array;
};

export function stageAttachments(attachments: ArchivedAttachment[]) {
  ensureLocalDirectories();
  const appDirectory = getAppDirectory();
  const staging = new Directory(appDirectory, STAGING_DIRECTORY_NAME);
  staging.create({ idempotent: true, intermediates: true });

  for (const item of staging.list()) item.delete();

  for (const attachment of attachments) {
    if (
      attachment.relativePath.includes("..") ||
      attachment.relativePath.startsWith("/") ||
      attachment.relativePath.includes("\\")
    ) {
      throw new Error(i18n.t("errors.attachments.unsafeBackupPath"));
    }

    const file = new File(staging, attachment.relativePath);
    file.create({ intermediates: true, overwrite: true });
    file.write(attachment.data);
  }

  return staging;
}

export function discardStagedAttachments() {
  const staging = new Directory(getAppDirectory(), STAGING_DIRECTORY_NAME);
  if (staging.exists) staging.delete();
}

export function commitStagedAttachments() {
  const appDirectory = getAppDirectory();
  const staging = new Directory(appDirectory, STAGING_DIRECTORY_NAME);
  const current = getAttachmentsDirectory();
  const previous = new Directory(appDirectory, PREVIOUS_DIRECTORY_NAME);

  if (!staging.exists) {
    throw new Error(i18n.t("errors.attachments.noStaged"));
  }

  if (previous.exists) previous.delete();
  if (current.exists) current.rename(PREVIOUS_DIRECTORY_NAME);

  try {
    staging.rename(ATTACHMENTS_DIRECTORY_NAME);
    if (previous.exists) previous.delete();
  } catch (error) {
    const failedCurrent = getAttachmentsDirectory();
    if (failedCurrent.exists) failedCurrent.delete();
    if (previous.exists) previous.rename(ATTACHMENTS_DIRECTORY_NAME);
    throw error;
  }
}

export function replaceAttachments(attachments: ArchivedAttachment[]) {
  stageAttachments(attachments);
  commitStagedAttachments();
}
