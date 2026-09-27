import { useCallback, useEffect, useRef, useState } from "react";
import {
  StyleSheet,
  View,
  type LayoutChangeEvent,
  type StyleProp,
  type ViewStyle,
} from "react-native";
import Animated, {
  ReduceMotion,
  useAnimatedStyle,
  useSharedValue,
  withSpring,
} from "react-native-reanimated";

export type IndicatorFrame = { x: number; width: number };

const MOVE = {
  damping: 20,
  mass: 0.7,
  stiffness: 210,
  reduceMotion: ReduceMotion.System,
};
const RESIZE = {
  damping: 22,
  mass: 0.7,
  stiffness: 230,
  reduceMotion: ReduceMotion.System,
};

/**
 * The next frame map after an item reports its layout. A hidden or detached
 * screen can report an empty layout; keeping the last real frame means the pill
 * is still in place when the page returns. Unchanged layouts keep the object.
 */
export function mergeIndicatorFrame<Key extends string>(
  current: Partial<Record<Key, IndicatorFrame>>,
  key: Key,
  { x, width }: IndicatorFrame,
): Partial<Record<Key, IndicatorFrame>> {
  if (!(width > 0) || !Number.isFinite(x)) return current;
  const previous = current[key];
  if (previous?.x === x && previous.width === width) return current;
  return { ...current, [key]: { x, width } };
}

/** Keeps the last real layout of each item, keyed by the item's value. */
export function useIndicatorFrames<Key extends string>() {
  const [frames, setFrames] = useState<Partial<Record<Key, IndicatorFrame>>>(
    {},
  );
  const onItemLayout = useCallback((key: Key, event: LayoutChangeEvent) => {
    const { x, width } = event.nativeEvent.layout;
    setFrames((current) => mergeIndicatorFrame(current, key, { x, width }));
  }, []);
  return { frames, onItemLayout };
}

/**
 * The selected-item pill for segmented controls and the tab bar.
 *
 * - The committed React style holds the target frame. The animated style only
 *   drives the slide between frames, so if native animated props are dropped
 *   (a detached screen re-attaching) the pill still rests on the selection.
 * - Frames come from `onLayout`, which is measured from the physical left
 *   edge. The overlay is forced to LTR so `left` means the physical left edge
 *   in LTR, native RTL (where left/right are swapped) and style-only RTL alike.
 * - The first placement snaps; later changes spring.
 *
 * Render it inside the same parent whose children reported the frames.
 */
export function SlidingIndicator({
  frame,
  style,
}: {
  frame: IndicatorFrame | undefined;
  style?: StyleProp<ViewStyle>;
}) {
  const left = useSharedValue(frame?.x ?? 0);
  const width = useSharedValue(frame?.width ?? 0);
  const placed = useRef(frame !== undefined);
  const x = frame?.x;
  const size = frame?.width;

  useEffect(() => {
    if (x === undefined || size === undefined) return;
    if (!placed.current) {
      placed.current = true;
      left.set(x);
      width.set(size);
      return;
    }
    left.set(withSpring(x, MOVE));
    width.set(withSpring(size, RESIZE));
  }, [x, size, left, width]);

  const animatedStyle = useAnimatedStyle(() => ({
    left: left.get(),
    width: width.get(),
  }));

  if (!frame) return null;
  return (
    <View pointerEvents="none" style={styles.overlay}>
      <Animated.View
        style={[
          style,
          styles.pill,
          // Resting place, committed with the selection itself.
          { left: frame.x, width: frame.width },
          animatedStyle,
        ]}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  overlay: {
    position: "absolute",
    top: 0,
    bottom: 0,
    left: 0,
    right: 0,
    direction: "ltr",
  },
  pill: { position: "absolute", top: 0, bottom: 0 },
});
