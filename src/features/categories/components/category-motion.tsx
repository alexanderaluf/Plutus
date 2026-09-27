import { Children, type PropsWithChildren } from "react";
import type { ViewProps } from "react-native";
import Animated, {
  Easing,
  FadeInDown,
  FadeOutUp,
  LinearTransition,
  ReduceMotion,
} from "react-native-reanimated";

export const categoryEntrance = (delay = 0) =>
  FadeInDown.duration(320)
    .delay(delay)
    .easing(Easing.bezier(0.22, 1, 0.36, 1))
    .reduceMotion(ReduceMotion.System);
export const categoryExit = FadeOutUp.duration(160).reduceMotion(
  ReduceMotion.System,
);
export const categoryLayout = LinearTransition.duration(240)
  .easing(Easing.inOut(Easing.cubic))
  .reduceMotion(ReduceMotion.System);

export function CategoryFormSections({
  children,
  ...props
}: PropsWithChildren<ViewProps>) {
  return (
    <Animated.View {...props} layout={categoryLayout}>
      {Children.map(children, (child, index) =>
        child ? (
          <Animated.View
            entering={categoryEntrance(Math.min(index * 35, 210))}
            exiting={categoryExit}
            layout={categoryLayout}
          >
            {child}
          </Animated.View>
        ) : null,
      )}
    </Animated.View>
  );
}
