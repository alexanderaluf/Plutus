import { Directory, File, Paths } from "expo-file-system";
import * as Sharing from "expo-sharing";
import { strFromU8 } from "fflate";

import { i18n } from "@/localization/i18n";

import type { ArchivedAttachment } from "../attachments/attachment-store";
import type { BackupDocument } from "../model/backup-document";
import { parseBackupDocument } from "../model/normalize-backup";
import { transactionsFromCsv, transactionsToCsv } from "./csv-backup";
import { createJsonBackupDocument } from "./document-export";
import { createZipBackup, parseZipBackup } from "./zip-backup";

export type BackupFormat = "zip" | "json" | "csv";
const MAX_IMPORT_BYTES = 128 * 1024 * 1024;

export type ImportedBackup = {
  format: BackupFormat;
  document: BackupDocument;
  attachments?: ArchivedAttachment[];
};

function timestamp() {
  return new Date().toISOString().replace(/[:.]/g, "-");
}

function createExportFile(name: string, content: string | Uint8Array) {
  const file = new File(Paths.cache, name);
  file.create({ overwrite: true, intermediates: true });
  file.write(content);
  return file;
}

const BACKUP_MIME_TYPES: Record<BackupFormat, string> = {
  zip: "application/zip",
  json: "application/json",
  csv: "text/csv",
};

async function shareFile(file: File, mimeType: string) {
  if (!(await Sharing.isAvailableAsync())) {
    throw new Error(i18n.t("errors.backup.sharingUnavailable"));
  }

  await Sharing.shareAsync(file.uri, {
    dialogTitle: "Export Plutus data",
    mimeType,
  });
}

export async function createBackupFile(
  document: BackupDocument,
  format: BackupFormat,
) {
  const suffix = timestamp();

  if (format === "json") {
    return createExportFile(
      `plutus-${suffix}.json`,
      JSON.stringify(createJsonBackupDocument(document), null, 2),
    );
  }

  if (format === "csv") {
    return createExportFile(
      `plutus-transactions-${suffix}.csv`,
      transactionsToCsv(document.transactions),
    );
  }

  return createExportFile(
    `plutus-full-${suffix}.zip`,
    await createZipBackup(document),
  );
}

export async function shareBackup(
  document: BackupDocument,
  format: BackupFormat,
) {
  const file = await createBackupFile(document, format);
  await shareFile(file, BACKUP_MIME_TYPES[format]);
  return file.uri;
}

export async function saveBackup(
  document: BackupDocument,
  format: BackupFormat,
) {
  const file = await createBackupFile(document, format);
  try {
    const directory = await Directory.pickDirectoryAsync();
    const destination = new File(directory, file.name);
    await file.copy(destination, { overwrite: true });
    return destination.uri;
  } catch (error) {
    if (error instanceof Error && /cancel/i.test(error.message)) return null;
    throw error;
  }
}

export const exportBackup = shareBackup;

function mergeTransactions(
  current: BackupDocument,
  incoming: BackupDocument["transactions"],
) {
  const merged = new Map<string, BackupDocument["transactions"][number]>();
  current.transactions.forEach((item, index) => {
    merged.set(String(item.uuid ?? item.id ?? `existing-${index}`), item);
  });
  incoming.forEach((item, index) => {
    merged.set(String(item.uuid ?? item.id ?? `imported-${index}`), item);
  });
  return { ...current, transactions: [...merged.values()] };
}

function isZip(bytes: Uint8Array) {
  return (
    bytes.length >= 4 &&
    bytes[0] === 0x50 &&
    bytes[1] === 0x4b &&
    ((bytes[2] === 0x03 && bytes[3] === 0x04) ||
      (bytes[2] === 0x05 && bytes[3] === 0x06) ||
      (bytes[2] === 0x07 && bytes[3] === 0x08))
  );
}

export function importBackupBytes(
  current: BackupDocument,
  bytes: Uint8Array,
  fileName = "",
  mimeType = "",
): ImportedBackup {
  if (bytes.byteLength > MAX_IMPORT_BYTES) {
    throw new Error(i18n.t("errors.backup.importTooLarge"));
  }

  const normalizedName = fileName.toLowerCase();
  const extension = normalizedName.includes(".")
    ? normalizedName.split(".").pop()
    : "";
  if (
    isZip(bytes) ||
    extension === "zip" ||
    mimeType.toLowerCase().includes("zip")
  ) {
    const restored = parseZipBackup(bytes);
    return {
      format: "zip",
      document: restored.document,
      attachments: restored.attachments,
    };
  }

  const text = strFromU8(bytes);
  const isCsv =
    extension === "csv" ||
    mimeType.toLowerCase().includes("csv") ||
    (!extension && !text.trimStart().startsWith("{"));
  if (isCsv) {
    return {
      format: "csv",
      document: mergeTransactions(current, transactionsFromCsv(text)),
    };
  }

  return {
    format: "json",
    document: parseBackupDocument(text),
  };
}

export async function pickAndImportBackup(current: BackupDocument) {
  const result = await File.pickFileAsync({
    multipleFiles: false,
    mimeTypes: ["application/json", "text/csv", "application/zip", "*/*"],
  });

  if (result.canceled) return null;

  const file = result.result;
  if (file.size > MAX_IMPORT_BYTES) {
    throw new Error(i18n.t("errors.backup.importTooLarge"));
  }
  return importBackupBytes(current, await file.bytes(), file.name, file.type);
}
