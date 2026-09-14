import {
  APP_LANGUAGES,
  BACKUP_COLLECTION_KEYS,
  DATE_FORMATS,
  type AppLanguage,
  type AppDateFormat,
  type BackupDocument,
} from "./backup-document";
import { createDefaultBackup } from "./default-backup";
import { normalizeBackupDocument } from "./normalize-backup";

export type SetupValues = {
  name: string;
  language: AppLanguage;
  currency: string;
  currencyName: string;
  currencySymbol: string;
  dateFormat: AppDateFormat;
  monthStartDay: number;
  weekStartDay: number;
  backupAccepted: boolean;
  responsibilityAccepted: boolean;
};

/** A missing profile in a populated document is recovery, never a new install. */
export function getSetupStatus(
  document: BackupDocument,
): "ready" | "setup" | "recovery" {
  if (document.users.length) {
    return document.users.every(
      (user) =>
        (typeof user.uuid === "string" && user.uuid.length > 0) ||
        typeof user.id === "number" ||
        (typeof user.id === "string" && user.id.length > 0),
    )
      ? "ready"
      : "recovery";
  }
  const hasRecords = BACKUP_COLLECTION_KEYS.some(
    (key) => key !== "categories" && document[key].length > 0,
  );
  const unknownData = Object.keys(document).some(
    (key) =>
      ![...BACKUP_COLLECTION_KEYS, "backupVersion", "_local"].includes(key) &&
      document[key] != null,
  );
  return hasRecords ||
    unknownData ||
    document._local.attachments.length > 0 ||
    document._local.onboardingCompletedAt !== null ||
    document._local.selectedProfileId !== null
    ? "recovery"
    : "setup";
}

/** Add only missing base categories. Imported/custom records always win. */
export function withBaseCategories(document: BackupDocument): BackupDocument {
  const defaults = createDefaultBackup().categories;
  const missing = defaults.filter(
    (base) =>
      !document.categories.some((category) => category.uuid === base.uuid),
  );
  let nextId =
    Math.max(
      0,
      ...document.categories.map((category) =>
        typeof category.id === "number" ? category.id : 0,
      ),
    ) + 1;
  return {
    ...document,
    categories: [
      ...document.categories,
      ...missing.map((category) => ({ ...category, id: nextId++ })),
    ],
  };
}

export function completeSetup(
  current: BackupDocument,
  values: SetupValues,
  uuid: string,
  now: string,
  demo?: BackupDocument,
): BackupDocument {
  if (getSetupStatus(current) !== "setup")
    throw new Error(
      "Existing data must be recovered before setup can continue.",
    );
  if (
    !uuid ||
    !values.name.trim() ||
    !values.backupAccepted ||
    !values.responsibilityAccepted ||
    !APP_LANGUAGES.includes(values.language) ||
    !/^[A-Z]{3}$/.test(values.currency) ||
    !DATE_FORMATS.includes(values.dateFormat) ||
    !Number.isInteger(values.monthStartDay) ||
    values.monthStartDay < 1 ||
    values.monthStartDay > 31 ||
    !Number.isInteger(values.weekStartDay) ||
    values.weekStartDay < 0 ||
    values.weekStartDay > 6
  )
    throw new Error("Complete all setup fields before continuing.");
  const document = demo ?? current;
  return normalizeBackupDocument(
    withBaseCategories({
      ...document,
      users: [
        {
          uuid,
          name: values.name.trim(),
          currency: values.currency,
          currencyName: values.currencyName,
          currencySymbol: values.currencySymbol,
          isSelected: true,
          createdAt: now,
          updatedAt: now,
        },
      ],
      _local: {
        ...document._local,
        selectedProfileId: uuid,
        appLanguage: values.language,
        mainCurrency: values.currency,
        dateFormat: values.dateFormat,
        monthStartDay: values.monthStartDay,
        weekStartDay: values.weekStartDay,
        onboardingCompletedAt: now,
        dataMode: demo ? "demo" : "fresh",
        backupResponsibilityAcceptedAt: now,
        localStorageAcceptedAt: now,
      },
    }),
  );
}

export function formatAppDate(date: Date, format: AppDateFormat): string {
  const year = String(date.getFullYear());
  return format.replace(
    /YYYY|YY|MM|DD/g,
    (token) =>
      ({
        YYYY: year,
        YY: year.slice(-2),
        MM: String(date.getMonth() + 1).padStart(2, "0"),
        DD: String(date.getDate()).padStart(2, "0"),
      })[token]!,
  );
}

/** Day 29–31 clamps to the last day in shorter months. */
export function getPersonalMonthStart(date: Date, day: number): Date {
  const start = (month: number) =>
    new Date(
      date.getFullYear(),
      month,
      Math.min(day, new Date(date.getFullYear(), month + 1, 0).getDate()),
    );
  const candidate = start(date.getMonth());
  return date < candidate ? start(date.getMonth() - 1) : candidate;
}

export function getCalendarOffset(month: Date, weekStartDay: number): number {
  return (month.getDay() - weekStartDay + 7) % 7;
}
