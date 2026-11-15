import { useTranslation } from "react-i18next";
import { Pressable, View } from "react-native";

import { useAppThemeColors } from "@/shared/theme/app-theme";
import { Text } from "@/shared/ui/app-text";
import { FilledIcon } from "@/shared/ui/filled-icon";

/**
 * Steps through periods of the granularity chosen in the bottom dock. One
 * control governs both the activity summary and the transaction list below.
 */
export function AccountPeriodNavigator({
  title,
  subtitle,
  canGoNext,
  showArrows,
  onPrevious,
  onNext,
}: {
  title: string;
  subtitle: string;
  canGoNext: boolean;
  showArrows: boolean;
  onPrevious: () => void;
  onNext: () => void;
}) {
  const { t } = useTranslation();
  const theme = useAppThemeColors();
  // FilledIcon already mirrors the chevron in RTL; "previous" turns it back
  // toward the reading start.
  const backFlip = { transform: [{ scaleX: -1 }] };

  const arrow = (
    direction: "previous" | "next",
    enabled: boolean,
    onPress: () => void,
  ) => (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={t(
        direction === "previous"
          ? "accounts.details.previousPeriod"
          : "accounts.details.nextPeriod",
      )}
      accessibilityState={{ disabled: !enabled }}
      disabled={!enabled}
      hitSlop={4}
      onPress={onPress}
      className="size-11 items-center justify-center rounded-full"
      style={({ pressed }) => ({
        backgroundColor: theme.surfaceSecondary,
        opacity: !enabled ? 0.3 : pressed ? 0.6 : 1,
      })}
    >
      <FilledIcon
        name="chevron-right"
        size={22}
        style={direction === "previous" ? backFlip : undefined}
      />
    </Pressable>
  );

  return (
    <View
      className="min-h-[56px] flex-row items-center rounded-full border border-border bg-surface p-1.5"
      style={{ borderCurve: "continuous" }}
    >
      {showArrows ? arrow("previous", true, onPrevious) : null}
      <View
        accessible
        accessibilityLabel={`${title}, ${subtitle}`}
        accessibilityLiveRegion="polite"
        className="min-w-0 flex-1 items-center px-2 py-1"
      >
        <Text
          numberOfLines={1}
          className="text-center font-manrope-bold text-[15px] leading-[20px] text-foreground"
        >
          {title}
        </Text>
        <Text
          numberOfLines={1}
          className="text-center font-sans text-[12px] leading-[16px] text-muted"
          style={{ fontVariant: ["tabular-nums"] }}
        >
          {subtitle}
        </Text>
      </View>
      {showArrows ? arrow("next", canGoNext, onNext) : null}
    </View>
  );
}
