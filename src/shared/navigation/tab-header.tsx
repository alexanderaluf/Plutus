import { useRouter } from "expo-router";
import { useMemo } from "react";
import { useTranslation } from "react-i18next";
import { Pressable, View } from "react-native";

import { useProfiles } from "@/features/profile/profile-provider";
import { useAppDate } from "@/shared/lib/use-app-date";
import { useLocalDayClock } from "@/shared/lib/use-local-day-clock";
import { useTimeOfDayGreeting } from "@/shared/lib/use-time-of-day-greeting";
import { useAppThemeColors } from "@/shared/theme/app-theme";
import { Text } from "@/shared/ui/app-text";
import { FilledIcon } from "@/shared/ui/filled-icon";

/** Slot height every tab reserves for this header (spacer and collapse clip). */
export const TAB_HEADER_HEIGHT = 64;

/**
 * The date, greeting and profile button shared by every tab. The bottom
 * navigation already names the current tab, so no page title is repeated here.
 * It renders without an entrance animation: it is chrome, not page content.
 */
export function TabHeader() {
  const router = useRouter();
  const { i18n, t } = useTranslation();
  const { formatDate } = useAppDate();
  const { activeProfile } = useProfiles();
  const theme = useAppThemeColors();
  const greeting = useTimeOfDayGreeting();
  const now = useLocalDayClock();
  const date = useMemo(
    () =>
      // Weekday stays localized text; the date itself follows the user's format.
      `${now.toLocaleDateString(i18n.resolvedLanguage, {
        weekday: "long",
      })}, ${formatDate(now)}`,
    [now, i18n.resolvedLanguage, formatDate],
  );

  return (
    <View className="flex-row items-center justify-between pt-3">
      <View className="flex-1 pe-3">
        <Text className="font-manrope-medium text-xs uppercase tracking-widest text-muted">
          {date}
        </Text>
        <Text
          accessibilityRole="header"
          className="mt-1 font-manrope-bold text-2xl text-foreground"
        >
          {t(`home.greetings.${greeting}`, {
            name: activeProfile.name.split(" ")[0],
          })}
        </Text>
      </View>

      <Pressable
        accessibilityLabel={t("home.openProfile")}
        accessibilityRole="button"
        hitSlop={6}
        onPress={() => router.push("/profile")}
        style={({ pressed }) => ({ opacity: pressed ? 0.68 : 1 })}
      >
        <View
          className="size-10 items-center justify-center rounded-full"
          style={{ backgroundColor: theme.accent }}
        >
          <FilledIcon color={theme.accentForeground} name="account" size={25} />
        </View>
      </Pressable>
    </View>
  );
}
