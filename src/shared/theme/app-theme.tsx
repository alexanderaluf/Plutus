import { useThemeColor } from "heroui-native";
import { useEffect, useMemo } from "react";
import { Appearance, processColor } from "react-native";
import { Uniwind, useUniwind } from "uniwind";

import { useLocalData } from "@/data/local-data-provider";
import type { AccentColorId } from "@/data/model/backup-document";

type AccentOption = {
  id: AccentColorId;
  label: string;
  swatch: string;
  light: { accent: string; foreground: string };
  dark: { accent: string; foreground: string };
};

export const ACCENT_OPTIONS: AccentOption[] = [
  {
    id: "cyan",
    label: "Cyan",
    swatch: "#45BCD4",
    light: { accent: "#087E8B", foreground: "#FFFFFF" },
    dark: { accent: "#70D2EB", foreground: "#083442" },
  },
  {
    id: "blue",
    label: "Blue",
    swatch: "#4D8FF7",
    light: { accent: "#2563EB", foreground: "#FFFFFF" },
    dark: { accent: "#7DB3FF", foreground: "#0B2850" },
  },
  {
    id: "violet",
    label: "Violet",
    swatch: "#9A77E8",
    light: { accent: "#7138C7", foreground: "#FFFFFF" },
    dark: { accent: "#B89CF5", foreground: "#2A1750" },
  },
  {
    id: "rose",
    label: "Rose",
    swatch: "#E36A98",
    light: { accent: "#B83768", foreground: "#FFFFFF" },
    dark: { accent: "#F187AE", foreground: "#4B1028" },
  },
  {
    id: "coral",
    label: "Coral",
    swatch: "#EA685B",
    light: { accent: "#BB4034", foreground: "#FFFFFF" },
    dark: { accent: "#FF958A", foreground: "#4C130E" },
  },
  {
    id: "amber",
    label: "Amber",
    swatch: "#D99A2B",
    light: { accent: "#966000", foreground: "#FFFFFF" },
    dark: { accent: "#F2C66D", foreground: "#3E2900" },
  },
  {
    id: "green",
    label: "Green",
    swatch: "#42B77B",
    light: { accent: "#177849", foreground: "#FFFFFF" },
    dark: { accent: "#7ADDAA", foreground: "#123D29" },
  },
  {
    id: "lime",
    label: "Lime",
    swatch: "#86AD3A",
    light: { accent: "#557817", foreground: "#FFFFFF" },
    dark: { accent: "#B9DB72", foreground: "#2D3D0D" },
  },
];

const MAX_ALPHA_CACHE_ENTRIES = 512;
const alphaColorCache = new Map<string, string>();

export function colorWithAlpha(color: string, alpha: number) {
  const normalized = color.trim();
  const clamped = Math.min(Math.max(alpha, 0), 1);
  const key = `${normalized}|${clamped}`;
  const cached = alphaColorCache.get(key);
  if (cached !== undefined) return cached;

  const processed = processColor(normalized);
  const result =
    typeof processed !== "number"
      ? normalized
      : `rgba(${(processed >>> 16) & 255}, ${(processed >>> 8) & 255}, ${processed & 255}, ${clamped})`;
  if (alphaColorCache.size >= MAX_ALPHA_CACHE_ENTRIES) {
    alphaColorCache.clear();
  }
  alphaColorCache.set(key, result);
  return result;
}

export function useAppThemeColors() {
  const [
    background,
    foreground,
    surface,
    surfaceSecondary,
    surfaceTertiary,
    border,
    muted,
    accent,
    accentForeground,
    danger,
    success,
  ] = useThemeColor([
    "background",
    "foreground",
    "surface",
    "surface-secondary",
    "surface-tertiary",
    "border",
    "muted",
    "accent",
    "accent-foreground",
    "danger",
    "success",
  ]);
  const { theme } = useUniwind();
  const isDark = theme === "dark";

  return useMemo(
    () => ({
      accent,
      accentForeground,
      background,
      border,
      danger,
      foreground,
      isDark,
      muted,
      success,
      surface,
      surfaceSecondary,
      surfaceTertiary,
    }),
    [
      accent,
      accentForeground,
      background,
      border,
      danger,
      foreground,
      isDark,
      muted,
      success,
      surface,
      surfaceSecondary,
      surfaceTertiary,
    ],
  );
}

export function AppThemeController() {
  const { document } = useLocalData();
  const { accentColor, themeMode } = document._local;

  useEffect(() => {
    const accent =
      ACCENT_OPTIONS.find((option) => option.id === accentColor) ??
      ACCENT_OPTIONS[0];
    Uniwind.updateCSSVariables("light", {
      "--accent": accent.light.accent,
      "--accent-foreground": accent.light.foreground,
      "--focus": accent.light.accent,
      "--link": accent.light.accent,
    });
    Uniwind.updateCSSVariables("dark", {
      "--accent": accent.dark.accent,
      "--accent-foreground": accent.dark.foreground,
      "--focus": accent.dark.accent,
      "--link": accent.dark.accent,
    });
    Appearance.setColorScheme(
      themeMode === "system" ? "unspecified" : themeMode,
    );
    Uniwind.setTheme(themeMode);
  }, [accentColor, themeMode]);

  return null;
}
