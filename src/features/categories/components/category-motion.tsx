import { Children, type PropsWithChildren } from "react";
import type { ViewProps } from "react-native";
import Animated, {
  Easing,
  FadeOutUp,
  LinearTransition,
  ReduceMotion,
} from "react-native-reanimated";
import { slotEntrance } from "@/shared/ui/page-entrance";

/** The shared page entrance at `slot` (0 = page header). */
export const categoryEntrance = (slot = 0) => slotEntrance(slot);
export const categoryExit = FadeOutUp.duration(160).reduceMotion(
  ReduceMotion.System,
);
export const categoryLayout = LinearTransition.duration(240)
  .easing(Easing.inOut(Easing.cubic))
  .reduceMotion(ReduceMotion.System);

export function CategoryFormSections({
  children,
  startSlot = 1,
  ...props
}: PropsWithChildren<ViewProps & { startSlot?: number }>) {
  return (
    <Animated.View {...props} layout={categoryLayout}>
      {Children.map(children, (child, index) =>
        child ? (
          <Animated.View
            entering={slotEntrance(startSlot + index)}
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
