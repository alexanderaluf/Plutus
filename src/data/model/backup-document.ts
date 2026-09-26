import type { JsonObject, JsonValue } from "./json";

export const BACKUP_VERSION = 3;
export const LOCAL_SCHEMA_VERSION = 21;
export const DEFAULT_CATEGORIES_REVISION = 1;

export const APP_LANGUAGES = ["en", "he", "ru"] as const;
export type AppLanguage = (typeof APP_LANGUAGES)[number];
export const DATE_FORMATS = [
  "DD/MM/YY",
  "DD/MM/YYYY",
  "MM/DD/YY",
  "MM/DD/YYYY",
  "YYYY/MM/DD",
  "YYYY-MM-DD",
  "DD.MM.YYYY",
] as const;
export type AppDateFormat = (typeof DATE_FORMATS)[number];
export const DEFAULT_APP_LANGUAGE: AppLanguage = "en";

export const THEME_MODES = ["system", "light", "dark"] as const;
export type ThemeMode = (typeof THEME_MODES)[number];

export const ACCENT_COLOR_IDS = [
  "cyan",
  "blue",
  "violet",
  "rose",
  "coral",
  "amber",
  "green",
  "lime",
] as const;
export type AccentColorId = (typeof ACCENT_COLOR_IDS)[number];
export const DEFAULT_ACCENT_COLOR: AccentColorId = "cyan";

export const BACKUP_COLLECTION_KEYS = [
  "transactions",
  "accounts",
  "assets",
  "budgets",
  "billSplitters",
  "billParticipants",
  "categories",
  "goals",
  "loans",
  "recurrings",
  "labels",
  "places",
  "peoples",
  "users",
  "images",
  "templates",
  "achievements",
  "exchangeRates",
] as const;

export type BackupCollectionKey = (typeof BACKUP_COLLECTION_KEYS)[number];

export interface AttachmentManifest extends JsonObject {
  id: string;
  fileName: string;
  mimeType: string;
  relativePath: string;
  size: number;
}

export interface LocalBackupMetadata extends JsonObject {
  schemaVersion: number;
  defaultCategoriesRevision: number;
  exportedAt: string | null;
  selectedProfileId: string | null;
  appLanguage: AppLanguage;
  themeMode: ThemeMode;
  accentColor: AccentColorId;
  attachments: AttachmentManifest[];
  cloudProvider: null;
  onboardingCompletedAt: string | null;
  dataMode: "fresh" | "demo" | "restored";
  mainCurrency: string;
  dateFormat: AppDateFormat;
  monthStartDay: number;
  weekStartDay: number;
  /** Masks every monetary amount in the UI until the user reveals them again. */
  amountsHidden: boolean;
  /** UI preference only; no chat messages are persisted. */
  aiExitWarningDismissed: boolean;
  /** When the user first sent a message to the local AI; hides the intro card. */
  aiFirstChatAt: string | null;
}

export interface BackupDocument extends JsonObject {
  backupVersion: number;
  transactions: JsonObject[];
  accounts: JsonObject[];
  assets: JsonObject[];
  budgets: JsonObject[];
  billSplitters: JsonObject[];
  billParticipants: JsonObject[];
  categories: JsonObject[];
  goals: JsonObject[];
  loans: JsonObject[];
  recurrings: JsonObject[];
  labels: JsonObject[];
  places: JsonObject[];
  peoples: JsonObject[];
  users: JsonObject[];
  images: JsonObject[];
  templates: JsonObject[];
  achievements: JsonObject[];
  exchangeRates: JsonObject[];
  _local: LocalBackupMetadata;
  [key: string]: JsonValue;
}
