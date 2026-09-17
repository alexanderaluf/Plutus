import { normalizeAccountRecord } from "./account-record";
import { normalizeRecurringRecord } from "./recurring-record";
import { normalizeBudgetRecord } from "./budget-record";
import {
  ACCENT_COLOR_IDS,
  APP_LANGUAGES,
  DATE_FORMATS,
  type AppDateFormat,
  BACKUP_COLLECTION_KEYS,
  BACKUP_VERSION,
  DEFAULT_APP_LANGUAGE,
  DEFAULT_ACCENT_COLOR,
  LOCAL_SCHEMA_VERSION,
  THEME_MODES,
  type AccentColorId,
  type AppLanguage,
  type AttachmentManifest,
  type BackupDocument,
  type ThemeMode,
} from "./backup-document";
import { normalizeCategoryRecord } from "./category-record";
import { RATE_SOURCE, readRateSnapshot } from "./exchange-rate";
import { isJsonObject } from "./json";

function normalizeAttachments(value: unknown): AttachmentManifest[] {
  if (!Array.isArray(value)) return [];

  return value.filter(
    (item): item is AttachmentManifest =>
      isJsonObject(item) &&
      typeof item.id === "string" &&
      typeof item.fileName === "string" &&
      typeof item.mimeType === "string" &&
      typeof item.relativePath === "string" &&
      typeof item.size === "number",
  );
}

function isThemeMode(value: unknown): value is ThemeMode {
  return typeof value === "string" && THEME_MODES.includes(value as ThemeMode);
}

function isAccentColor(value: unknown): value is AccentColorId {
  return (
    typeof value === "string" &&
    ACCENT_COLOR_IDS.includes(value as AccentColorId)
  );
}

function isAppLanguage(value: unknown): value is AppLanguage {
  return (
    typeof value === "string" && APP_LANGUAGES.includes(value as AppLanguage)
  );
}

function normalizeTransactionCurrency(
  record: BackupDocument["transactions"][number],
) {
  const amount =
    typeof record.amount === "number" && Number.isFinite(record.amount)
      ? record.amount
      : 0;
  const transactionCurrency =
    typeof record.currencyCode === "string" &&
    /^[A-Z]{3}$/.test(record.currencyCode.toUpperCase())
      ? record.currencyCode.toUpperCase()
      : "USD";
  const accountCurrency =
    typeof record.accountCurrencyCode === "string" &&
    /^[A-Z]{3}$/.test(record.accountCurrencyCode.toUpperCase())
      ? record.accountCurrencyCode.toUpperCase()
      : transactionCurrency;
  return {
    ...record,
    conversionSnapshot:
      isJsonObject(record.conversionSnapshot) &&
      readRateSnapshot(record.conversionSnapshot)
        ? {
            ...record.conversionSnapshot,
            ...readRateSnapshot(record.conversionSnapshot)!,
          }
        : null,
    profileCurrencyCode:
      typeof record.profileCurrencyCode === "string" &&
      /^[A-Z]{3}$/i.test(record.profileCurrencyCode)
        ? record.profileCurrencyCode.toUpperCase()
        : null,
    profileAmount:
      typeof record.profileAmount === "number" &&
      Number.isFinite(record.profileAmount)
        ? record.profileAmount
        : null,
    currencyCode: transactionCurrency,
    accountAmount:
      typeof record.accountAmount === "number" &&
      Number.isFinite(record.accountAmount)
        ? record.accountAmount
        : amount,
    accountCurrencyCode: accountCurrency,
    exchangeRate:
      typeof record.exchangeRate === "number" &&
      Number.isFinite(record.exchangeRate) &&
      record.exchangeRate > 0
        ? record.exchangeRate
        : null,
    exchangeRateDate:
      typeof record.exchangeRateDate === "string"
        ? record.exchangeRateDate
        : null,
    exchangeRateFetchedAt:
      typeof record.exchangeRateFetchedAt === "string"
        ? record.exchangeRateFetchedAt
        : null,
    exchangeRateSource:
      typeof record.exchangeRateSource === "string"
        ? record.exchangeRateSource
        : null,
  };
}

export function normalizeBackupDocument(value: unknown): BackupDocument {
  if (!isJsonObject(value)) {
    throw new Error("Backup must contain a JSON object at its root.");
  }

  const document = { ...value } as unknown as BackupDocument;
  const version = value.backupVersion;
  if (typeof version === "number" && version > BACKUP_VERSION) {
    throw new Error(
      `Backup version ${version} is newer than supported version ${BACKUP_VERSION}.`,
    );
  }
  document.backupVersion =
    typeof version === "number" && Number.isFinite(version)
      ? version
      : BACKUP_VERSION;

  for (const key of BACKUP_COLLECTION_KEYS) {
    const collection = value[key];
    if (
      collection !== undefined &&
      (!Array.isArray(collection) || !collection.every(isJsonObject))
    ) {
      throw new Error(
        `The ${key} collection is damaged or uses an unsupported format. The original data has been retained.`,
      );
    }
    document[key] = Array.isArray(collection)
      ? collection.filter(isJsonObject)
      : [];
  }

  const local = isJsonObject(value._local) ? value._local : {};
  if (
    typeof local.schemaVersion === "number" &&
    local.schemaVersion > LOCAL_SCHEMA_VERSION
  ) {
    throw new Error(
      "This backup uses a newer local schema. Update the app before restoring it.",
    );
  }
  document.accounts = document.accounts.map(normalizeAccountRecord);
  document.recurrings = document.recurrings.map(normalizeRecurringRecord);
  document.transactions = document.transactions.map(
    normalizeTransactionCurrency,
  );
  document.categories = document.categories.map(normalizeCategoryRecord);
  document.budgets = document.budgets.map(normalizeBudgetRecord);
  // Leave foreign/imported rate formats intact. Selectors validate our tables
  // before use; missing freshness metadata must never imply a current rate.
  document.exchangeRates = document.exchangeRates.map((record) =>
    record.source === RATE_SOURCE ? { fetchedAt: null, ...record } : record,
  );
  document._local = {
    ...local,
    schemaVersion: LOCAL_SCHEMA_VERSION,
    defaultCategoriesRevision:
      typeof local.defaultCategoriesRevision === "number" &&
      Number.isInteger(local.defaultCategoriesRevision)
        ? local.defaultCategoriesRevision
        : 0,
    exportedAt: typeof local.exportedAt === "string" ? local.exportedAt : null,
    selectedProfileId:
      typeof local.selectedProfileId === "string"
        ? local.selectedProfileId
        : null,
    appLanguage: isAppLanguage(local.appLanguage)
      ? local.appLanguage
      : DEFAULT_APP_LANGUAGE,
    themeMode: isThemeMode(local.themeMode) ? local.themeMode : "system",
    accentColor: isAccentColor(local.accentColor)
      ? local.accentColor
      : DEFAULT_ACCENT_COLOR,
    attachments: normalizeAttachments(local.attachments),
    cloudProvider: null,
    onboardingCompletedAt:
      typeof local.onboardingCompletedAt === "string"
        ? local.onboardingCompletedAt
        : null,
    dataMode:
      local.dataMode === "demo" || local.dataMode === "restored"
        ? local.dataMode
        : "fresh",
    mainCurrency:
      typeof local.mainCurrency === "string" &&
      /^[A-Z]{3}$/.test(local.mainCurrency)
        ? local.mainCurrency
        : typeof document.users[0]?.currency === "string"
          ? document.users[0].currency
          : "USD",
    dateFormat: DATE_FORMATS.includes(local.dateFormat as AppDateFormat)
      ? (local.dateFormat as AppDateFormat)
      : "DD/MM/YYYY",
    monthStartDay:
      typeof local.monthStartDay === "number" &&
      Number.isInteger(local.monthStartDay) &&
      local.monthStartDay >= 1 &&
      local.monthStartDay <= 31
        ? local.monthStartDay
        : 1,
    weekStartDay:
      typeof local.weekStartDay === "number" &&
      Number.isInteger(local.weekStartDay) &&
      local.weekStartDay >= 0 &&
      local.weekStartDay <= 6
        ? local.weekStartDay
        : 0,
  };

  return document;
}

export function parseBackupDocument(json: string): BackupDocument {
  try {
    return normalizeBackupDocument(JSON.parse(json));
  } catch (error) {
    if (error instanceof SyntaxError) {
      throw new Error("The selected file is not valid JSON.");
    }
    throw error;
  }
}

/** Persisted canonical documents have already passed import normalization.
 * Missing envelope fields here indicate damage, not an incomplete import. */
export function parseStoredDocument(json: string): BackupDocument {
  const raw: unknown = JSON.parse(json);
  if (
    !isJsonObject(raw) ||
    !Array.isArray(raw.users) ||
    !isJsonObject(raw._local) ||
    typeof raw.backupVersion !== "number" ||
    typeof raw._local.schemaVersion !== "number"
  ) {
    throw new Error(
      "The saved document has an unsupported structure. Existing data has not been reset.",
    );
  }
  return normalizeBackupDocument(raw);
}

export function cloneBackupDocument(document: BackupDocument) {
  return JSON.parse(JSON.stringify(document)) as BackupDocument;
}
