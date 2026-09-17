import { TopSafeAreaGradient } from "@/shared/ui/safe-area-gradients";
import type { PropsWithChildren } from "react";
import { useEffect, useMemo, useState } from "react";
import { Animated, StyleSheet, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

export const COLLAPSING_HEADER_HEIGHT = 56;
const HEADER_FADE_DISTANCE = 40;

export function useCollapsingHeader() {
  const [scrollY] = useState(() => new Animated.Value(0));
  const [headerHidden, setHeaderHidden] = useState(false);

  useEffect(() => {
    let previousHidden: boolean | undefined;
    const listener = scrollY.addListener(({ value }) => {
      const hidden = value >= HEADER_FADE_DISTANCE;
      if (hidden === previousHidden) return;
      previousHidden = hidden;
      setHeaderHidden(hidden);
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
  const insets = useSafeAreaInsets();
  return <View aria-hidden style={{ height: height + insets.top }} />;
}

export function CollapsingHeader({
  children,
  height = COLLAPSING_HEADER_HEIGHT,
  horizontalInset = 16,
  headerHidden,
  scrollY,
  topInset,
}: PropsWithChildren<{
  height?: number;
  horizontalInset?: number;
  headerHidden: boolean;
  scrollY: Animated.Value;
  topInset?: number;
}>) {
  const insets = useSafeAreaInsets();
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
      <TopSafeAreaGradient headerHidden={headerHidden} />
      <View
        collapsable={false}
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
            top: topInset ?? insets.top,
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
  clip: {
    position: "absolute",
    zIndex: 20,
    overflow: "hidden",
  },
});
