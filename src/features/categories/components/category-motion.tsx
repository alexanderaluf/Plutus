import { Children, type PropsWithChildren } from "react";
import type { ViewProps } from "react-native";
import Animated, {
  Easing,
  FadeInDown,
  FadeOutUp,
  LinearTransition,
  ReduceMotion,
} from "react-native-reanimated";

export const categoryEntrance = (_delay = 0) => undefined;
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
      {Children.map(children, (child) =>
        child ? (
          <Animated.View exiting={categoryExit} layout={categoryLayout}>
            {child}
          </Animated.View>
        ) : null,
      )}
    </Animated.View>
  );
}
