import { colorWithAlpha, useAppThemeColors } from "@/shared/theme/app-theme";
import { Text } from "@/shared/ui/app-text";
import { FilledIcon } from "@/shared/ui/filled-icon";
import { useTranslation } from "react-i18next";
import { Pressable, View } from "react-native";

/**
 * A labelled way into the period review. The bottom-bar action opens the same
 * sheet and shares this icon, so the row also explains what that button does.
 */
export function PeriodCompareRow({ onPress }: { onPress: () => void }) {
  const { t } = useTranslation();
  const theme = useAppThemeColors();

  return (
    <Pressable
      accessibilityRole="button"
      onPress={onPress}
      className="flex-row items-center gap-3.5 rounded-[24px] border border-border bg-surface p-4"
      style={({ pressed }) => ({
        opacity: pressed ? 0.68 : 1,
        borderCurve: "continuous",
      })}
    >
      <View
        className="size-11 shrink-0 items-center justify-center rounded-2xl"
        style={{
          backgroundColor: colorWithAlpha(theme.accent, 0.14),
          borderCurve: "continuous",
        }}
      >
        <FilledIcon name="query-stats" size={21} tone="accent" />
      </View>
      <View className="min-w-0 flex-1 gap-0.5">
        <Text className="font-manrope-bold text-[15px] leading-[20px] text-foreground">
          {t("reports.overview.compareTitle")}
        </Text>
        <Text className="font-sans text-[12px] leading-[17px] text-muted">
          {t("reports.overview.compareDescription")}
        </Text>
      </View>
      <FilledIcon name="chevron-right" size={18} tone="muted" />
    </Pressable>
  );
}
