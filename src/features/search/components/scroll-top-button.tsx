import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import {
  type Animated as NativeAnimated,
  Pressable,
  StyleSheet,
  useWindowDimensions,
} from "react-native";
import Animated, {
  Easing,
  FadeIn,
  FadeOut,
  ReduceMotion,
} from "react-native-reanimated";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { colorWithAlpha, useAppThemeColors } from "@/shared/theme/app-theme";
import { FilledIcon } from "@/shared/ui/filled-icon";

// Mirrors the bottom navigation dock: 12pt edge inset, 58pt action button.
const DOCK_EDGE = 12;
const ACTION_SIZE = 58;
const SIZE = 46;
const GAP = 12;

type ScrollTopButtonProps = {
  scrollY: NativeAnimated.Value;
  /** True once at least one extra page has loaded, i.e. the user went deep. */
  armed: boolean;
  onPress: () => void;
};

/**
 * Floats centered above the tab bar's action button. It reacts to scrolling
 * through a threshold listener, so React renders only when it shows or hides.
 */
export function ScrollTopButton({
  scrollY,
  armed,
  onPress,
}: ScrollTopButtonProps) {
  const { t } = useTranslation();
  const theme = useAppThemeColors();
  const insets = useSafeAreaInsets();
  const { height } = useWindowDimensions();
  const [scrolledDown, setScrolledDown] = useState(false);

  useEffect(() => {
    // One viewport down hides it again near the top after a manual scroll up.
    const threshold = height;
    let previous: boolean | undefined;
    const listener = scrollY.addListener(({ value }) => {
      const next = value > threshold;
      if (next === previous) return;
      previous = next;
      setScrolledDown(next);
    });
    return () => scrollY.removeListener(listener);
  }, [height, scrollY]);

  if (!armed || !scrolledDown) return null;

  return (
    <Animated.View
      entering={FadeIn.duration(180)
        .easing(Easing.out(Easing.quad))
        .reduceMotion(ReduceMotion.System)}
      exiting={FadeOut.duration(140).reduceMotion(ReduceMotion.System)}
      style={[
        styles.dock,
        {
          // `end` follows the layout direction, like the navigation dock row.
          end: DOCK_EDGE + (ACTION_SIZE - SIZE) / 2,
          bottom: Math.max(insets.bottom, 10) + ACTION_SIZE + GAP,
        },
      ]}
    >
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={t("search.results.scrollTop")}
        hitSlop={8}
        onPress={onPress}
        style={({ pressed }) => [
          styles.button,
          {
            // No BlurView here: this screen is inside the tab shell's blur
            // target, and a descendant BlurView would capture itself on Android.
            backgroundColor: colorWithAlpha(theme.surface, 0.94),
            borderColor: theme.border,
            shadowColor: "#000",
          },
          pressed && styles.pressed,
        ]}
      >
        <FilledIcon name="chevron-up" size={26} />
      </Pressable>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  dock: { position: "absolute", zIndex: 25 },
  button: {
    alignItems: "center",
    borderRadius: SIZE / 2,
    borderWidth: 1,
    elevation: 4,
    height: SIZE,
    justifyContent: "center",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.18,
    shadowRadius: 10,
    width: SIZE,
  },
  pressed: { opacity: 0.72 },
});
