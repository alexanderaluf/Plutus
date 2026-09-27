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
// Travel settles a little after the fade, so rows glide into place.
const RISE = {
  duration: 380,
  easing: Easing.bezier(0.22, 1, 0.36, 1),
  reduceMotion: ReduceMotion.System,
};

export function VisibleFadeRow({
  rowKey,
  controller,
  style,
  rise = 0,
  children,
}: {
  rowKey: string;
  controller: VisibleRowFade;
  style?: StyleProp<ViewStyle>;
  /** Points the row travels up while fading in; 0 is a plain fade. */
  rise?: number;
  children: ReactNode;
}) {
  // Start in the final state when no entrance will run; otherwise the first
  // frame would draw hidden until the layout effect reaches the UI thread.
  const settled = controller.isSettled(rowKey);
  const opacity = useSharedValue(settled ? 1 : 0);
  const offset = useSharedValue(settled ? 0 : rise);
  const fadeStyle = useAnimatedStyle(() =>
    rise
      ? { opacity: opacity.get(), transform: [{ translateY: offset.get() }] }
      : { opacity: opacity.get() },
  );

  useLayoutEffect(
    () =>
      controller.register(rowKey, {
        reveal: (delay) => {
          cancelAnimation(opacity);
          cancelAnimation(offset);
          opacity.set(0);
          offset.set(rise);
          opacity.set(
            withDelay(delay, withTiming(1, FADE), ReduceMotion.System),
          );
          if (rise)
            offset.set(
              withDelay(delay, withTiming(0, RISE), ReduceMotion.System),
            );
        },
        finish: () => {
          cancelAnimation(opacity);
          cancelAnimation(offset);
          opacity.set(1);
          offset.set(0);
        },
        hide: () => {
          cancelAnimation(opacity);
          cancelAnimation(offset);
          opacity.set(0);
          offset.set(rise);
        },
      }),
    [controller, rowKey, opacity, offset, rise],
  );

  return <Animated.View style={[style, fadeStyle]}>{children}</Animated.View>;
}
