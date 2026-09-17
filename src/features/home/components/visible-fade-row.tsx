import { useLayoutEffect, type ReactNode } from "react";
import type { StyleProp, ViewStyle } from "react-native";
import Animated, {
  cancelAnimation,
  Easing,
  ReduceMotion,
  useAnimatedStyle,
  useSharedValue,
  withDelay,
  withTiming,
} from "react-native-reanimated";

import type { VisibleRowFade } from "../visible-row-fade";

const FADE = {
  duration: 250,
  easing: Easing.bezier(0.23, 1, 0.32, 1),
  reduceMotion: ReduceMotion.System,
};

export function VisibleFadeRow({
  rowKey,
  controller,
  style,
  children,
}: {
  rowKey: string;
  controller: VisibleRowFade;
  style?: StyleProp<ViewStyle>;
  children: ReactNode;
}) {
  const opacity = useSharedValue(0);
  const fadeStyle = useAnimatedStyle(() => ({ opacity: opacity.get() }));

  useLayoutEffect(
    () =>
      controller.register(rowKey, {
        reveal: (delay) => {
          cancelAnimation(opacity);
          opacity.set(0);
          opacity.set(
            withDelay(delay, withTiming(1, FADE), ReduceMotion.System),
          );
        },
        finish: () => {
          cancelAnimation(opacity);
          opacity.set(1);
        },
        hide: () => {
          cancelAnimation(opacity);
          opacity.set(0);
        },
      }),
    [controller, rowKey, opacity],
  );

  return <Animated.View style={[style, fadeStyle]}>{children}</Animated.View>;
}
