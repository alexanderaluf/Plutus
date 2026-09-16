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
import type { AppLanguage } from "@/data/model/backup-document";
import { LANGUAGE_OPTIONS } from "@/localization/languages";
import { FilledIcon } from "@/shared/ui/filled-icon";

const reveal = FadeInDown.duration(400)
  .easing(Easing.bezier(0.22, 1, 0.36, 1))
  .reduceMotion(ReduceMotion.System);

export function LanguageSettingsPage() {
  const { t } = useTranslation();
  const { document, updateDocument } = useLocalData();
  const [error, setError] = useState("");
  const selectedLanguage = document._local.appLanguage;

  async function selectLanguage(language: AppLanguage) {
    if (language === selectedLanguage) return;
    setError("");
    try {
      await updateDocument((current) => ({
        ...current,
        _local: { ...current._local, appLanguage: language },
      }));
    } catch {
      setError(t("common.saveError"));
    }
  }

  return (
    <EdgeToEdgeScrollView
      className="flex-1"
      contentContainerClassName="gap-5 px-4 pt-3"
      contentContainerStyle={{ paddingBottom: 32 }}
      showsVerticalScrollIndicator={false}
    >
      <Animated.View entering={reveal} className="gap-1 px-1">
        <Text className="font-manrope-bold text-lg text-foreground">
          {t("language.heading")}
        </Text>
        <Text className="font-sans text-sm leading-5 text-muted">
          {t("language.description")}
        </Text>
      </Animated.View>

      <Animated.View
        entering={reveal.delay(70)}
        className="overflow-hidden rounded-3xl bg-surface"
      >
        {LANGUAGE_OPTIONS.map((option, index) => {
          const isSelected = option.code === selectedLanguage;
          return (
            <Pressable
              key={option.code}
              accessibilityLabel={t("language.accessibilityLabel", {
                language: t(option.nameKey),
              })}
              accessibilityRole="radio"
              accessibilityState={{
                checked: isSelected,
                disabled: !option.isAvailable,
              }}
              disabled={!option.isAvailable}
              className={`min-h-[76px] flex-row items-center px-5 py-3 ${
                index < LANGUAGE_OPTIONS.length - 1
                  ? "border-b border-border"
                  : ""
              }`}
              onPress={() => void selectLanguage(option.code)}
              style={({ pressed }) => ({ opacity: pressed ? 0.72 : 1 })}
            >
              <View className="flex-1">
                <Text className="font-manrope-semibold text-base text-foreground">
                  {option.nativeName}
                </Text>
                {option.nativeName !== t(option.nameKey) ? (
                  <Text className="mt-0.5 font-sans text-xs text-muted">
                    {t(option.nameKey)}
                  </Text>
                ) : null}
              </View>
              <Text className="me-3 font-sans text-xs text-muted">
                {isSelected
                  ? t("language.selected")
                  : option.isAvailable
                    ? t("language.available")
                    : t("common.comingSoon")}
              </Text>
              {isSelected ? (
                <View className="size-8 items-center justify-center rounded-full bg-accent/15">
                  <FilledIcon name="check" size={20} tone="accent" />
                </View>
              ) : (
                <View className="size-8" />
              )}
            </Pressable>
          );
        })}
      </Animated.View>

      {error ? (
        <Text
          accessibilityRole="alert"
          className="font-sans text-sm text-danger"
        >
          {error}
        </Text>
      ) : null}
    </EdgeToEdgeScrollView>
  );
}
