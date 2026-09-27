import { DatePicker, Host, Popover, Spacer, VStack } from "@expo/ui/swift-ui";
import {
    datePickerStyle,
    frame,
    padding,
    scaleEffect,
    tint,
} from "@expo/ui/swift-ui/modifiers";
import { useEffect, useRef, useState } from "react";
import { View, useWindowDimensions } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import type { DateTimePopoverProps } from "./date-time-popover.types";

const PICKER_LAYOUT = {
  date: {
    frame: { width: 300, height: 310 },
    contentFrame: { width: 340, height: 350 },
    contentScale: 300 / 340,
  },
  time: {
    frame: { width: 300, height: 220 },
    contentFrame: { width: 300, height: 220 },
    contentScale: 1,
  },
} as const;
const POPOVER_PADDING = 12;
const POPOVER_ARROW_HEIGHT = 16;

export function DateTimePopover({
  accentColor,
  isDark,
  isPresented,
  maximumDate,
  mode,
  title,
  value,
  onDismiss,
  onValueChange,
}: DateTimePopoverProps) {
  const anchorRef = useRef<View>(null);
  const { height: windowHeight } = useWindowDimensions();
  const insets = useSafeAreaInsets();
  const pickerLayout = PICKER_LAYOUT[mode];
  const [isPlacementReady, setIsPlacementReady] = useState(false);
  const [opensBelow, setOpensBelow] = useState(true);

  useEffect(() => {
    let cancelled = false;
    const frameId = requestAnimationFrame(() => {
      if (!isPresented) {
        setIsPlacementReady(false);
        return;
      }

      anchorRef.current?.measureInWindow((_x, y, _width, height) => {
        if (cancelled) return;

        const popoverHeight =
          pickerLayout.frame.height +
          POPOVER_PADDING * 2 +
          POPOVER_ARROW_HEIGHT;
        const bottomEdge =
          windowHeight - Math.max(insets.bottom, POPOVER_PADDING);
        const spaceBelow = bottomEdge - (y + height);

        setOpensBelow(spaceBelow >= popoverHeight);
        setIsPlacementReady(true);
      });
    });

    return () => {
      cancelled = true;
      cancelAnimationFrame(frameId);
    };
  }, [insets.bottom, isPresented, pickerLayout.frame.height, windowHeight]);

  return (
    <View
      ref={anchorRef}
      collapsable={false}
      pointerEvents="box-none"
      style={{
        position: "absolute",
        inset: 0,
      }}
    >
      <Host
        colorScheme={isDark ? "dark" : "light"}
        seedColor={accentColor}
        style={{
          position: "absolute",
          ...(opensBelow ? { bottom: 0 } : { top: 0 }),
          left: "50%",
          width: 1,
          height: 1,
        }}
      >
        <Popover
          isPresented={isPresented && isPlacementReady}
          attachmentAnchor={opensBelow ? "bottom" : "top"}
          arrowEdge={opensBelow ? "top" : "bottom"}
          onIsPresentedChange={(presented) => {
            if (!presented) {
              setIsPlacementReady(false);
              if (isPresented) onDismiss();
            }
          }}
        >
          <Popover.Trigger>
            <Spacer modifiers={[frame({ width: 1, height: 1 })]} />
          </Popover.Trigger>
          <Popover.Content>
            <VStack
              spacing={12}
              modifiers={[
                frame(pickerLayout.frame),
                padding({ all: POPOVER_PADDING }),
              ]}
            >
              <DatePicker
                title={title}
                selection={value}
                displayedComponents={[
                  mode === "time" ? "hourAndMinute" : "date",
                ]}
                range={maximumDate ? { end: maximumDate } : undefined}
                modifiers={[
                  datePickerStyle(mode === "time" ? "wheel" : "graphical"),
                  tint(accentColor),
                  frame(pickerLayout.contentFrame),
                  scaleEffect(pickerLayout.contentScale),
                  frame(pickerLayout.frame),
                ]}
                onDateChange={onValueChange}
              />
            </VStack>
          </Popover.Content>
        </Popover>
      </Host>
    </View>
  );
}
