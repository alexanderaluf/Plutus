import { LinearGradient } from "expo-linear-gradient";
import type { PropsWithChildren } from "react";
import { useEffect, useMemo, useRef, useState } from "react";
import { Animated, Platform, StyleSheet, View } from "react-native";

import { colorWithAlpha, useAppThemeColors } from "@/shared/theme/app-theme";

export const COLLAPSING_HEADER_HEIGHT = 56;
const HEADER_FADE_DISTANCE = 40;

export function useCollapsingHeader() {
  const scrollY = useRef(new Animated.Value(0)).current;
  const [headerHidden, setHeaderHidden] = useState(false);

  useEffect(() => {
    const listener = scrollY.addListener(({ value }) => {
      const hidden = value >= HEADER_FADE_DISTANCE;
      setHeaderHidden((current) => (current === hidden ? current : hidden));
    });
    return () => scrollY.removeListener(listener);
  }, [scrollY]);

  const onScroll = useMemo(
    () =>
      Animated.event([{ nativeEvent: { contentOffset: { y: scrollY } } }], {
        useNativeDriver: true,
      }),
    [scrollY],
  );

  return { headerHidden, onScroll, scrollY };
}

export function CollapsingHeaderSpacer({
  height = COLLAPSING_HEADER_HEIGHT,
}: {
  height?: number;
}) {
  return <View aria-hidden style={{ height }} />;
}

export function CollapsingHeader({
  children,
  height = COLLAPSING_HEADER_HEIGHT,
  horizontalInset = 16,
  headerHidden,
  scrollY,
  topInset = 0,
}: PropsWithChildren<{
  height?: number;
  horizontalInset?: number;
  headerHidden: boolean;
  scrollY: Animated.Value;
  topInset?: number;
}>) {
  const theme = useAppThemeColors();
  const translateY = scrollY.interpolate({
    inputRange: [0, COLLAPSING_HEADER_HEIGHT],
    outputRange: [0, -COLLAPSING_HEADER_HEIGHT],
    extrapolate: "clamp",
  });
  const opacity = scrollY.interpolate({
    inputRange: [0, HEADER_FADE_DISTANCE],
    outputRange: [1, 0],
    extrapolate: "clamp",
  });

  return (
    <>
      <LinearGradient
        pointerEvents="none"
        colors={[
          theme.background,
          colorWithAlpha(theme.background, 0.82),
          colorWithAlpha(theme.background, 0),
        ]}
        locations={[0, 0.58, 1]}
        style={[styles.gradient, { top: topInset }]}
      />
      <View
        pointerEvents={headerHidden ? "none" : "auto"}
        accessibilityElementsHidden={headerHidden}
        importantForAccessibility={
          headerHidden ? "no-hide-descendants" : "auto"
        }
        style={[
          styles.clip,
          {
            height,
            left: horizontalInset,
            right: horizontalInset,
            top: topInset,
          },
        ]}
      >
        <Animated.View style={{ opacity, transform: [{ translateY }] }}>
          {children}
        </Animated.View>
      </View>
    </>
  );
}

const styles = StyleSheet.create({
  gradient: {
    position: "absolute",
    left: 0,
    right: 0,
    height: Platform.OS === "ios" ? 24 : 80,
    zIndex: 10,
  },
  clip: {
    position: "absolute",
    zIndex: 20,
    overflow: "hidden",
  },
});
