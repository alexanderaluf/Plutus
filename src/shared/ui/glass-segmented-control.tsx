import { BlurView } from "expo-blur";
import type { RefObject } from "react";
import { Platform, Pressable, StyleSheet, View } from "react-native";
import { colorWithAlpha, useAppThemeColors } from "@/shared/theme/app-theme";
import { Text } from "@/shared/ui/app-text";
import {
  SlidingIndicator,
  useIndicatorFrames,
} from "@/shared/ui/sliding-indicator";

type SegmentValue = string | number;
type SegmentOption<Value extends SegmentValue> = {
  label: string;
  value: Value;
};

type GlassSegmentedControlProps<Value extends SegmentValue> = {
  accessibilityLabel?: string;
  blurTarget?: RefObject<View | null>;
  fitLabels?: boolean;
  minHeight?: number;
  multilineLabels?: boolean;
  onChange: (value: Value) => void;
  options: readonly SegmentOption<Value>[];
  tabPaddingHorizontal?: number;
  textSize?: number;
  value: Value;
};

export function GlassSegmentedControl<Value extends SegmentValue>({
  accessibilityLabel,
  blurTarget,
  fitLabels = false,
  minHeight = 48,
  multilineLabels = false,
  onChange,
  options,
  tabPaddingHorizontal = 8,
  textSize = 14,
  value,
}: GlassSegmentedControlProps<Value>) {
  const colors = useAppThemeColors();
  const { frames, onItemLayout } = useIndicatorFrames<string>();

  return (
    <View
      accessibilityLabel={accessibilityLabel}
      accessibilityRole="tablist"
      style={[
        styles.container,
        {
          backgroundColor: colorWithAlpha(colors.surface, 0.72),
          borderColor: colors.border,
        },
      ]}
    >
      {Platform.OS === "ios" || blurTarget ? (
        <BlurView
          blurMethod={
            Platform.OS === "android" ? "dimezisBlurViewSdk31Plus" : undefined
          }
          blurReductionFactor={3}
          blurTarget={blurTarget}
          intensity={36}
          pointerEvents="none"
          style={StyleSheet.absoluteFill}
          tint={colors.isDark ? "dark" : "light"}
        />
      ) : null}
      <View style={styles.track}>
        <SlidingIndicator
          frame={frames[String(value)]}
          style={[styles.indicator, { backgroundColor: colors.accent }]}
        />
        {options.map((option) => {
          const isSelected = option.value === value;
          return (
            <Pressable
              key={String(option.value)}
              accessibilityRole="tab"
              accessibilityState={{ selected: isSelected }}
              onLayout={(event) => onItemLayout(String(option.value), event)}
              onPress={() => onChange(option.value)}
              style={({ pressed }) => [
                styles.tab,
                { minHeight, paddingHorizontal: tabPaddingHorizontal },
                pressed && styles.pressed,
              ]}
            >
              <Text
                adjustsFontSizeToFit={fitLabels || multilineLabels}
                minimumFontScale={
                  fitLabels || multilineLabels ? 0.78 : undefined
                }
                numberOfLines={multilineLabels ? 2 : 1}
                className="font-manrope-bold"
                style={{
                  color: isSelected
                    ? colors.accentForeground
                    : colors.foreground,
                  fontSize: textSize,
                  lineHeight: multilineLabels ? textSize * 1.2 : undefined,
                  textAlign: "center",
                }}
              >
                {option.label}
              </Text>
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    borderRadius: 999,
    borderWidth: 1,
    overflow: "hidden",
  },
  track: {
    flexDirection: "row",
    margin: 4,
    position: "relative",
  },
  indicator: {
    borderRadius: 999,
  },
  tab: {
    alignItems: "center",
    borderRadius: 999,
    flex: 1,
    justifyContent: "center",
    minWidth: 0,
    paddingHorizontal: 8,
    zIndex: 1,
  },
  pressed: {
    opacity: 0.72,
  },
});
