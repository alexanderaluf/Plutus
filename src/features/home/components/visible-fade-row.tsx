import { useLayoutEffect, type ReactNode } from "react";
import { View, type StyleProp, type ViewStyle } from "react-native";

import type { VisibleRowFade } from "../visible-row-fade";

const NOOP_HANDLE = {
  reveal: () => undefined,
  finish: () => undefined,
  hide: () => undefined,
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
  /** Kept for API compatibility; rows now paint immediately at full opacity. */
  rise?: number;
  children: ReactNode;
}) {
  useLayoutEffect(
    () => controller.register(rowKey, NOOP_HANDLE),
    [controller, rowKey],
  );

  return <View style={style}>{children}</View>;
}
