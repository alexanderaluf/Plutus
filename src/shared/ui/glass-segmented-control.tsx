import { BlurView } from "expo-blur";
import { useEffect, useState, type RefObject } from "react";
import { Platform, Pressable, StyleSheet, View } from "react-native";
import Animated, {
  ReduceMotion,
  useAnimatedStyle,
  useSharedValue,
  withSpring,
} from "react-native-reanimated";
import { colorWithAlpha, useAppThemeColors } from "@/shared/theme/app-theme";
import { Text } from "@/shared/ui/app-text";

type SegmentValue = string | number;
type SegmentOption<Value extends SegmentValue> = {
  label: string;
  value: Value;
};

type GlassSegmentedControlProps<Value extends SegmentValue> = {
  accessibilityLabel?: string;
  blurTarget?: RefObject<View | null>;
  minHeight?: number;
  multilineLabels?: boolean;
  onChange: (value: Value) => void;
  options: readonly SegmentOption<Value>[];
  textSize?: number;
  value: Value;
};

export function GlassSegmentedControl<Value extends SegmentValue>({
  accessibilityLabel,
  blurTarget,
  minHeight = 48,
  multilineLabels = false,
  onChange,
  options,
  textSize = 14,
  value,
}: GlassSegmentedControlProps<Value>) {
  const [frames, setFrames] = useState<
    Record<string, { width: number; x: number }>
  >({});
  const colors = useAppThemeColors();
  const indicatorX = useSharedValue(0);
  const indicatorWidth = useSharedValue(0);
  const [trackWidth, setTrackWidth] = useState(0);
  const [isReady, setIsReady] = useState(false);

  useEffect(() => {
    const frame = frames[String(value)];
    if (!frame || trackWidth === 0) return;
    indicatorX.value = withSpring(frame.x, {
      damping: 20,
      mass: 0.7,
      stiffness: 210,
      reduceMotion: ReduceMotion.System,
    });
    indicatorWidth.value = withSpring(frame.width, {
      damping: 22,
      mass: 0.7,
      stiffness: 230,
      reduceMotion: ReduceMotion.System,
    });
    setIsReady(true);
  }, [frames, indicatorWidth, indicatorX, trackWidth, value]);

  const indicatorStyle = useAnimatedStyle(() => ({
    width: indicatorWidth.value,
    transform: [{ translateX: indicatorX.value }],
  }));

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
      <View
        onLayout={({ nativeEvent: { layout } }) => setTrackWidth(layout.width)}
        style={styles.track}
      >
        {isReady ? (
          <Animated.View
            pointerEvents="none"
            style={[
              styles.indicator,
              { backgroundColor: colors.accent },
              indicatorStyle,
            ]}
          />
        ) : null}
        {options.map((option) => {
          const isSelected = option.value === value;
          return (
            <Pressable
              key={String(option.value)}
              accessibilityRole="tab"
              accessibilityState={{ selected: isSelected }}
              onLayout={({ nativeEvent: { layout } }) => {
                const key = String(option.value);
                setFrames((current) => {
                  const previous = current[key];
                  if (
                    previous?.width === layout.width &&
                    previous.x === layout.x
                  ) {
                    return current;
                  }
                  return {
                    ...current,
                    [key]: { width: layout.width, x: layout.x },
                  };
                });
              }}
              onPress={() => onChange(option.value)}
              style={({ pressed }) => [
                styles.tab,
                { minHeight },
                pressed && styles.pressed,
              ]}
            >
              <Text
                adjustsFontSizeToFit={multilineLabels}
                minimumFontScale={multilineLabels ? 0.78 : undefined}
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
    bottom: 0,
    left: 0,
    position: "absolute",
    top: 0,
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
