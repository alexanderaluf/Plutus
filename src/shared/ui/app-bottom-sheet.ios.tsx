import { Host, RNHostView } from "@expo/ui";
import { BottomSheet as NativeBottomSheet, Group } from "@expo/ui/swift-ui";
import {
  interactiveDismissDisabled,
  presentationBackground,
  presentationDetents,
  presentationDragIndicator,
  presentationSizing,
  type PresentationDetent,
} from "@expo/ui/swift-ui/modifiers";
import {
  CloseButton,
  type BottomSheetRootProps,
  type BottomSheetContentProps,
  type BottomSheetTitleProps,
  type BottomSheetDescriptionProps,
  type BottomSheetCloseProps,
} from "heroui-native";
import {
  createContext,
  useContext,
  useMemo,
  useState,
  type Context,
  type PropsWithChildren,
} from "react";
import {
  Keyboard,
  ScrollView,
  View,
  VirtualizedList,
  useWindowDimensions,
} from "react-native";

import { useAppLocalization } from "@/localization/localization-provider";
import { useAppThemeColors } from "@/shared/theme/app-theme";
import { Text } from "./app-text";

export {
  FlatList as BottomSheetFlatList,
  ScrollView as BottomSheetScrollView,
} from "react-native";

type SheetState = { isOpen: boolean; onOpenChange: (open: boolean) => void };
const SheetContext = createContext<SheetState | null>(null);

function useSheet() {
  const value = useContext(SheetContext);
  if (!value)
    throw new Error("BottomSheet components must render under BottomSheet.");
  return value;
}

function SheetRoot({
  children,
  isOpen,
  isDefaultOpen = false,
  onOpenChange,
}: BottomSheetRootProps) {
  const [internalOpen, setInternalOpen] = useState(isDefaultOpen);
  const value = useMemo(
    () => ({
      isOpen: isOpen ?? internalOpen,
      onOpenChange: (open: boolean) => {
        if (isOpen === undefined) setInternalOpen(open);
        onOpenChange?.(open);
      },
    }),
    [isOpen, internalOpen, onOpenChange],
  );
  return (
    <SheetContext.Provider value={value}>{children}</SheetContext.Provider>
  );
}

// Like RN Modal and Expo's community sheet, a presented native window must
// break the parent list context so a FlatList inside the sheet can scroll.
const ListContext = (
  VirtualizedList as unknown as { contextType?: Context<unknown> }
).contextType;
const ScrollContext = (ScrollView as unknown as { Context?: Context<unknown> })
  .Context;
function SheetScrollContextReset({ children }: PropsWithChildren) {
  let content = children;
  if (ScrollContext)
    content = (
      <ScrollContext.Provider value={null}>{content}</ScrollContext.Provider>
    );
  if (ListContext)
    content = (
      <ListContext.Provider value={null}>{content}</ListContext.Provider>
    );
  return <>{content}</>;
}

function detent(point: string | number): PresentationDetent {
  if (typeof point === "number") return { height: Math.max(1, point) };
  const fraction = Number.parseFloat(point) / 100;
  return Number.isFinite(fraction)
    ? { fraction: Math.min(1, Math.max(0.01, fraction)) }
    : "large";
}

function SheetContent({
  children,
  snapPoints,
  enableDynamicSizing = true,
  enablePanDownToClose = true,
  enableHandlePanningGesture = true,
  enableContentPanningGesture = true,
  handleComponent,
  contentContainerClassName,
  contentContainerProps,
  onChange,
  onClose,
}: BottomSheetContentProps) {
  const { isOpen, onOpenChange } = useSheet();
  const theme = useAppThemeColors();
  const { isRTL } = useAppLocalization();
  const { width } = useWindowDimensions();
  const points = Array.isArray(snapPoints) ? snapPoints : [];
  const fitToContents = enableDynamicSizing && points.length === 0;
  const detents = points.length
    ? points.map(detent)
    : (["medium", "large"] as PresentationDetent[]);
  const canDismiss =
    enablePanDownToClose &&
    enableHandlePanningGesture &&
    enableContentPanningGesture;
  const modifiers = [
    presentationSizing("page"),
    presentationDragIndicator(handleComponent === null ? "hidden" : "visible"),
    presentationBackground(theme.surface),
    interactiveDismissDisabled(!canDismiss),
    ...(!fitToContents
      ? [
          presentationDetents(detents, {
            selection: detents[0],
            onSelectionChange: (selected) => {
              const index = detents.findIndex(
                (item) => JSON.stringify(item) === JSON.stringify(selected),
              );
              if (index >= 0) onChange?.(index, 0, 0);
            },
          }),
        ]
      : []),
  ];

  return (
    <Host
      style={{ position: "absolute", width }}
      pointerEvents="none"
      colorScheme={theme.isDark ? "dark" : "light"}
      layoutDirection={isRTL ? "rightToLeft" : "leftToRight"}
    >
      <NativeBottomSheet
        isPresented={isOpen}
        fitToContents={fitToContents}
        onIsPresentedChange={(presented) => {
          if (!presented && canDismiss) {
            Keyboard.dismiss();
            onOpenChange(false);
          }
        }}
        onDismiss={() => {
          onClose?.();
          onChange?.(-1, 0, 0);
        }}
      >
        <Group modifiers={modifiers}>
          <RNHostView matchContents={fitToContents}>
            <View
              style={
                fitToContents
                  ? { width, paddingTop: 16 }
                  : { flexGrow: 1, height: 0, paddingTop: 16 }
              }
            >
              <SheetScrollContextReset>
                <View
                  {...contentContainerProps}
                  accessibilityViewIsModal
                  className={contentContainerClassName}
                  style={[
                    !fitToContents && { flex: 1 },
                    contentContainerProps?.style,
                  ]}
                >
                  {children}
                </View>
              </SheetScrollContextReset>
            </View>
          </RNHostView>
        </Group>
      </NativeBottomSheet>
    </Host>
  );
}

function SheetTitle({ className, ...props }: BottomSheetTitleProps) {
  return (
    <Text
      accessibilityRole="header"
      className={`font-manrope-bold text-xl text-foreground ${className ?? ""}`}
      {...props}
    />
  );
}
function SheetDescription({
  className,
  ...props
}: BottomSheetDescriptionProps) {
  return (
    <Text
      className={`font-sans text-sm text-muted ${className ?? ""}`}
      {...props}
    />
  );
}
function SheetClose({ onPress, ...props }: BottomSheetCloseProps) {
  const { onOpenChange } = useSheet();
  return (
    <CloseButton
      {...props}
      onPress={(event) => {
        if (typeof onPress === "function") onPress(event);
        onOpenChange(false);
      }}
    />
  );
}
function SheetOverlay() {
  return null;
}

export const BottomSheet = Object.assign(SheetRoot, {
  Content: SheetContent,
  Overlay: SheetOverlay,
  Title: SheetTitle,
  Description: SheetDescription,
  Close: SheetClose,
});
