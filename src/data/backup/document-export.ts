import type { BackupDocument } from "../model/backup-document";
import type { JsonValue } from "../model/json";
import { cloneBackupDocument } from "../model/normalize-backup";

const MEDIA_KEYS = new Set([
  "image",
  "imageUri",
  "attachment",
  "attachmentUri",
  "attachments",
  "receipt",
  "receiptPath",
  "receiptAttachmentId",
]);

function stripMedia(value: JsonValue, key?: string): JsonValue {
  if (key && MEDIA_KEYS.has(key)) {
    return key === "attachments" ? [] : null;
  }

  if (Array.isArray(value)) {
    return value.map((item) => stripMedia(item));
  }

  if (typeof value === "object" && value !== null) {
    return Object.fromEntries(
      Object.entries(value).map(([childKey, childValue]) => [
        childKey,
        stripMedia(childValue, childKey),
      ]),
    );
  }

  return value;
}

export function createJsonBackupDocument(document: BackupDocument) {
  const exported = stripMedia(cloneBackupDocument(document)) as BackupDocument;
  exported.images = [];
  exported._local.attachments = [];
  exported._local.exportedAt = new Date().toISOString();
  return exported;
}

export function createFullBackupDocument(document: BackupDocument) {
  const exported = cloneBackupDocument(document);
  exported._local.exportedAt = new Date().toISOString();
  return exported;
}
