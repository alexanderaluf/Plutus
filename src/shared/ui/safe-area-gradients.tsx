import { LinearGradient } from "expo-linear-gradient";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { colorWithAlpha, useAppThemeColors } from "@/shared/theme/app-theme";

/**
 * Render over a full-height scrolling viewport. One continuous translucent
 * fade starts at the phone edge, including the safe area, with no solid band.
 */
export function TopSafeAreaGradient({
  headerHidden = false,
}: {
  headerHidden?: boolean;
}) {
  const { top } = useSafeAreaInsets();
  const { background } = useAppThemeColors();

  return (
    <LinearGradient
      pointerEvents="none"
      aria-hidden
      style={{
        position: "absolute",
        top: 0,
        left: 0,
        right: 0,
        zIndex: 10,
        height: top + (headerHidden ? 32 : 96),
      }}
      colors={[
        colorWithAlpha(background, headerHidden ? 0.72 : 0.92),
        colorWithAlpha(background, headerHidden ? 0.18 : 0.36),
        colorWithAlpha(background, 0),
      ]}
      locations={[0, 0.58, 1]}
      start={{ x: 0.5, y: 0 }}
      end={{ x: 0.5, y: 1 }}
    />
  );
}

/** Render in a container that reaches the bottom edge; don't pad it for bottom safety. */
export function BottomSafeAreaGradient({
  fadeHeight = 152,
  zIndex = 10,
}: {
  fadeHeight?: number;
  zIndex?: number;
}) {
  const { bottom } = useSafeAreaInsets();
  const { background } = useAppThemeColors();

  return (
    <LinearGradient
      pointerEvents="none"
      aria-hidden
      style={{
        position: "absolute",
        bottom: 0,
        left: 0,
        right: 0,
        zIndex,
        height: fadeHeight + bottom,
      }}
      colors={[
        colorWithAlpha(background, 0),
        colorWithAlpha(background, 0.36),
        colorWithAlpha(background, 0.92),
      ]}
      locations={[0, 0.54, 1]}
      start={{ x: 0.5, y: 0 }}
      end={{ x: 0.5, y: 1 }}
    />
  );
}
