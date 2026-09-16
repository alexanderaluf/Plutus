import { EdgeToEdgeScrollView } from "@/shared/ui/edge-to-edge-layout";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { Pressable, View } from "react-native";

import { Text } from "@/shared/ui/app-text";
import Animated, {
  Easing,
  FadeInDown,
  ReduceMotion,
} from "react-native-reanimated";

import { useLocalData } from "@/data/local-data-provider";
import {
  THEME_MODES,
  type AccentColorId,
  type ThemeMode,
} from "@/data/model/backup-document";
import { colorForeground } from "@/shared/icons/colors";
import { ACCENT_OPTIONS } from "@/shared/theme/app-theme";
import { FilledIcon } from "@/shared/ui/filled-icon";
import { GlassSegmentedControl } from "@/shared/ui/glass-segmented-control";

const reveal = FadeInDown.duration(400)
  .easing(Easing.bezier(0.22, 1, 0.36, 1))
  .reduceMotion(ReduceMotion.System);

export function ThemeSettingsPage() {
  const { t } = useTranslation();
  const { document, updateDocument } = useLocalData();
  const { accentColor, themeMode } = document._local;
  const [error, setError] = useState<"accent" | "appearance" | null>(null);
  const modeOptions = THEME_MODES.map((mode) => ({
    label: t(`theme.modes.${mode}`),
    value: mode,
  }));

  async function setThemeMode(mode: ThemeMode) {
    if (mode === themeMode) return;
    setError(null);
    try {
      await updateDocument((current) => ({
        ...current,
        _local: { ...current._local, themeMode: mode },
      }));
    } catch {
      setError("appearance");
    }
  }

  async function setAccentColor(nextAccent: AccentColorId) {
    if (nextAccent === accentColor) return;
    setError(null);
    try {
      await updateDocument((current) => ({
        ...current,
        _local: { ...current._local, accentColor: nextAccent },
      }));
    } catch {
      setError("accent");
    }
  }

  return (
    <EdgeToEdgeScrollView
      className="flex-1"
      contentContainerClassName="gap-6 px-4 pt-3"
      contentContainerStyle={{ paddingBottom: 32 }}
      showsVerticalScrollIndicator={false}
    >
      <Animated.View entering={reveal} className="gap-3">
        <View className="gap-1 px-1">
          <Text className="font-manrope-bold text-lg text-foreground">
            {t("theme.appearance")}
          </Text>
          <Text className="font-sans text-sm leading-5 text-muted">
            {t("theme.appearanceDescription")}
          </Text>
        </View>
        <GlassSegmentedControl
          accessibilityLabel={t("theme.appearanceAccessibility")}
          minHeight={52}
          onChange={(mode) => void setThemeMode(mode)}
          options={modeOptions}
          value={themeMode}
        />
      </Animated.View>

      <Animated.View entering={reveal.delay(80)} className="gap-3">
        <View className="gap-1 px-1">
          <Text className="font-manrope-bold text-lg text-foreground">
            {t("theme.accentColor")}
          </Text>
          <Text className="font-sans text-sm leading-5 text-muted">
            {t("theme.accentDescription")}
          </Text>
        </View>
        <View className="flex-row flex-wrap gap-3">
          {ACCENT_OPTIONS.map((option) => {
            const selected = option.id === accentColor;
            const label = t(`theme.accents.${option.id}`);
            return (
              <Pressable
                key={option.id}
                accessibilityLabel={t("theme.accentAccessibility", {
                  color: label,
                })}
                accessibilityRole="radio"
                accessibilityState={{ checked: selected }}
                className={`min-h-20 w-[48%] flex-row items-center gap-3 rounded-2xl border px-3 py-3 ${
                  selected
                    ? "border-accent bg-accent/10"
                    : "border-border bg-surface"
                }`}
                onPress={() => void setAccentColor(option.id)}
                style={({ pressed }) => ({ opacity: pressed ? 0.72 : 1 })}
              >
                <View
                  className="size-10 items-center justify-center rounded-full"
                  style={{ backgroundColor: option.swatch }}
                >
                  {selected ? (
                    <FilledIcon
                      color={colorForeground(option.swatch)}
                      name="check"
                      size={22}
                    />
                  ) : null}
                </View>
                <Text
                  className="min-w-0 flex-1 font-manrope-semibold text-sm text-foreground"
                  numberOfLines={1}
                >
                  {label}
                </Text>
              </Pressable>
            );
          })}
        </View>
      </Animated.View>

      {error ? (
        <Text
          accessibilityRole="alert"
          className="font-sans text-sm text-danger"
        >
          {t(
            error === "appearance"
              ? "theme.appearanceSaveError"
              : "theme.accentSaveError",
          )}
        </Text>
      ) : null}
    </EdgeToEdgeScrollView>
  );
}
