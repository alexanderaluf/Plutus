import type { AppLanguage } from "@/data/model/backup-document";

export type LanguageOption = {
  code: AppLanguage;
  direction: "ltr" | "rtl";
  isAvailable: boolean;
  nameKey: "language.english" | "language.hebrew" | "language.russian";
  nativeName: string;
};

export const LANGUAGE_OPTIONS: readonly LanguageOption[] = [
  {
    code: "en",
    direction: "ltr",
    isAvailable: true,
    nameKey: "language.english",
    nativeName: "English",
  },
  {
    code: "he",
    direction: "rtl",
    isAvailable: true,
    nameKey: "language.hebrew",
    nativeName: "עברית",
  },
  {
    code: "ru",
    direction: "ltr",
    isAvailable: true,
    nameKey: "language.russian",
    nativeName: "Русский",
  },
] as const;
