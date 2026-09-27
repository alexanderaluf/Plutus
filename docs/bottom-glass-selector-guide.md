# Bottom Glass Selector Implementation Guide

The shared `BottomSafeAreaGradient` is the current implementation. Render it
over a viewport that reaches the phone bottom. It draws one translucent fade
through the entire navigation inset; do not append a solid safe-area band or
pad the viewport. Reserve safe space in scroll content and action offsets.

Use this guide when building a segmented selector that floats near the bottom safe area, such as Expense / Income / Transfer or Daily / Weekly / Monthly / Yearly.

The canonical implementations in this repository are:

- `src/shared/ui/glass-segmented-control.tsx`
- `src/features/categories/categories-screen.tsx`
- `src/features/accounts/account-details-screen.tsx`
- `src/shared/navigation/bottom-navigation.tsx` for visual reference only

Do not modify the bottom navigation when applying this pattern to another screen.

## Required Packages

This pattern uses packages already installed in the project:

```tsx
import { BlurTargetView, BlurView } from "expo-blur";
import { BottomSafeAreaGradient } from "@/shared/ui/safe-area-gradients";
import { useRef } from "react";
import { Platform, Pressable, StyleSheet, Text, View } from "react-native";
import Animated, {
  ReduceMotion,
  useAnimatedStyle,
  useSharedValue,
  withSpring,
} from "react-native-reanimated";
import { useSafeAreaInsets } from "react-native-safe-area-context";
```

Follow the exact Expo version installed by this project. This repository uses Expo SDK 57.

## Required Visual Structure

The screen must have these layers, from back to front:

1. Scrollable screen content inside a `BlurTargetView`.
2. A non-interactive bottom `LinearGradient` scrim.
3. The floating segmented selector above the scrim.
4. Optional floating action buttons above the same scrim.

The selector must not participate in normal document layout. Position it absolutely near the bottom safe area and reserve equivalent padding in the scrollable content.

```tsx
<View style={[styles.screen, { backgroundColor: theme.background }]}>
  <BlurTargetView ref={blurTargetRef} style={styles.content}>
    <FlatList
      data={items}
      contentContainerStyle={{
        paddingBottom: 110 + insets.bottom,
      }}
    />
  </BlurTargetView>

  <BottomSafeAreaGradient />

  <View style={[styles.selectorDock, { bottom: Math.max(insets.bottom, 10) }]}>
    <GlassSegmentedControl
      accessibilityLabel="Transaction type"
      blurTarget={blurTargetRef}
      options={options}
      value={value}
      onChange={setValue}
    />
  </View>
</View>
```

```tsx
const styles = StyleSheet.create({
  screen: {
    flex: 1,
  },
  content: {
    flex: 1,
  },
  bottomScrim: {
    position: "absolute",
    bottom: 0,
    left: 0,
    right: 0,
    zIndex: 10,
  },
  selectorDock: {
    position: "absolute",
    left: 12,
    right: 12,
    zIndex: 20,
  },
});
```

## Android Blur Rules

Android requires an explicit blur target. Use a `BlurTargetView` around the content behind the selector and pass its ref to the selector's `BlurView`.

```tsx
const blurTargetRef = useRef<View | null>(null);

<BlurTargetView ref={blurTargetRef} style={{ flex: 1 }}>
  {screenContent}
</BlurTargetView>

<GlassSegmentedControl blurTarget={blurTargetRef} {...props} />
```

Configure the selector blur as follows:

```tsx
<BlurView
  blurMethod="dimezisBlurViewSdk31Plus"
  blurReductionFactor={3}
  blurTarget={blurTarget}
  intensity={36}
  pointerEvents="none"
  style={StyleSheet.absoluteFill}
  tint="dark"
/>
```

### Critical Android Constraint

The `BlurView` must be a sibling of its `BlurTargetView`, never a descendant of that target.

Correct:

```tsx
<>
  <BlurTargetView ref={blurTargetRef}>{content}</BlurTargetView>
  <GlassSegmentedControl blurTarget={blurTargetRef} />
</>
```

Incorrect:

```tsx
<BlurTargetView ref={blurTargetRef}>
  {content}
  <GlassSegmentedControl blurTarget={blurTargetRef} />
</BlurTargetView>
```

The incorrect structure makes Android capture a blur view inside its own blur target. On tested Samsung hardware this caused recursive RenderThread drawing, a native stack overflow, and a `SIGSEGV` crash in Expo Go.

Do not create one root-level `BlurTargetView` around the entire router or application. A screen-local sibling target is safer and prevents nested blur controls from capturing themselves or other blur views.

If Android has no valid `blurTarget`, do not request `dimezisBlurViewSdk31Plus`. Render the translucent selector shell without native blur instead. This avoids the Expo warning that `blurTarget` was not configured.

## iOS Blur Rules

iOS does not require `BlurTargetView` or the `blurTarget` prop. The same shared selector can render `BlurView` directly:

```tsx
{
  Platform.OS === "ios" || blurTarget ? (
    <BlurView
      blurMethod={
        Platform.OS === "android" ? "dimezisBlurViewSdk31Plus" : undefined
      }
      blurReductionFactor={3}
      blurTarget={blurTarget}
      intensity={36}
      pointerEvents="none"
      style={StyleSheet.absoluteFill}
      tint="dark"
    />
  ) : null;
}
```

Keep `overflow: "hidden"` and the pill border radius on the selector container. `BlurView` does not clip correctly to rounded corners on all platforms unless its parent clips its contents.

## Safe Area and System Navigation Gradient

For a bottom-floating selector, the gradient must extend through the bottom safe area.

Use:

```tsx
<SafeAreaView edges={["top"]} style={styles.screen}>
```

Do not include `"bottom"` in `edges` for this screen. Bottom safe-area padding would stop the React Native content before the Android navigation buttons or iOS home indicator, leaving a separate solid strip.

Use the safe-area inset to size the gradient and position the selector:

```tsx
const insets = useSafeAreaInsets();

// BottomSafeAreaGradient defaults to 152 + insets.bottom.
const selectorBottom = Math.max(insets.bottom, 10);
```

The gradient should be behind the selector:

```tsx
bottomScrim: {
  zIndex: 10;
}
selectorDock: {
  zIndex: 20;
}
```

Set `pointerEvents="none"` on the gradient so it never blocks selector, list, or floating-button touches.

### Android Three-Button Navigation

On Android, the navigation-button area may be a separate system surface. Expo SDK 57 controls navigation-button style and visibility but does not expose runtime navigation-bar background-color APIs.

The app must already be drawing edge-to-edge for the screen gradient to appear behind the OS buttons. The Categories screen uses `EdgeToEdgeLayout` with full-height list content and a scrim at `bottom: 0`.

Use the shared theme-derived translucent gradient in both themes. Disable Android navigation-bar contrast in the native configuration so the system does not add a light or dark rectangle over it.

## Segmented Selector Styling

Use a stable pill container so the layout cannot shift when selection changes:

```tsx
const styles = StyleSheet.create({
  container: {
    backgroundColor: "rgba(10, 10, 10, 0.62)",
    borderColor: "#303030",
    borderRadius: 999,
    borderWidth: 1,
    overflow: "hidden",
  },
  track: {
    flexDirection: "row",
    margin: 4,
    position: "relative",
  },
  indicator: {
    position: "absolute",
    top: 0,
    bottom: 0,
    left: 0,
    backgroundColor: "#70d2eb",
    borderRadius: 999,
  },
  tab: {
    flex: 1,
    minWidth: 0,
    minHeight: 48,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 999,
    paddingHorizontal: 8,
    zIndex: 1,
  },
  pressed: {
    opacity: 0.72,
  },
});
```

Use light text for inactive options and dark cyan text for the selected option:

```tsx
color: isSelected ? "#073442" : "#ededed";
```

## Sliding Indicator Animation

Measure each option with `onLayout`, store its `x` and `width`, and animate one absolute indicator between frames.

```tsx
const frames = useRef<Record<string, { width: number; x: number }>>({});
const indicatorX = useSharedValue(0);
const indicatorWidth = useSharedValue(0);

useEffect(() => {
  const frame = frames.current[String(value)];
  if (!frame) return;

  indicatorX.value = withSpring(frame.x, {
    damping: 20,
    mass: 0.7,
    stiffness: 210,
    reduceMotion: ReduceMotion.System,
  });
  indicatorWidth.value = withSpring(frame.width, {
    damping: 22,
    mass: 0.7,
    stiffness: 230,
    reduceMotion: ReduceMotion.System,
  });
}, [indicatorWidth, indicatorX, value]);
```

Do not animate separate backgrounds on every tab. One measured indicator produces a stable sliding effect and prevents layout changes.

## Accessibility

The container and options must expose segmented-control semantics:

```tsx
<View accessibilityRole="tablist" accessibilityLabel="Transaction type">
  <Pressable
    accessibilityRole="tab"
    accessibilityState={{ selected: isSelected }}
    onPress={() => onChange(option.value)}
  >
    <Text numberOfLines={1}>{option.label}</Text>
  </Pressable>
</View>
```

Respect system reduced-motion settings by using `ReduceMotion.System` in Reanimated transitions.

## Floating Action Button

If the screen also has an Add action, render it as a separate sibling of the selector. Do not position it with a negative offset inside the selector container because that can produce invalid or inverted accessibility bounds on Android.

```tsx
<View
  style={{
    position: "absolute",
    right: 20,
    bottom: Math.max(insets.bottom, 10) + 76,
    zIndex: 20,
  }}
>
  <Button
    isIconOnly
    accessibilityLabel="Add item"
    className="size-16 rounded-full bg-accent"
    onPress={openCreateScreen}
  >
    <FilledIcon name="plus" color="#073442" size={32} />
  </Button>
</View>
```

The action button is opaque. Do not add blur or transparency to it.

## Required Validation

After implementation:

1. Run `npx tsc --noEmit`.
2. Run `node --test tests/*.test.cjs`.
3. Test on a physical Android device with `adb devices`.
4. Open the screen and switch every segment.
5. Confirm the app process remains alive with `adb shell pidof host.exp.exponent` when using Expo Go.
6. Check Logcat for `Fatal signal`, `FATAL EXCEPTION`, `stack overflow`, and `blurTarget prop has not been configured`.
7. Capture a screenshot and verify content is visibly blurred beneath the selector.
8. Verify the bottom gradient reaches behind Android Back/Home/Recents or the iOS home indicator.
9. Confirm the list has enough bottom padding that its final item can scroll fully above the selector.
10. Confirm the selector and optional action button have valid, non-inverted accessibility bounds.

## Common Failure Modes

- **Android warning about missing `blurTarget`:** pass a screen-local `BlurTargetView` ref or omit Android native blur.
- **Native Android RenderThread crash:** the `BlurView` is probably inside its own target or a root target contains nested blur views. Restore the sibling topology.
- **Solid strip below the selector:** remove the bottom edge from `SafeAreaView` and draw the gradient to `bottom: 0`.
- **Gray Android navigation area:** use neutral black RGB values for the gradient endpoint, not charcoal values.
- **Content hidden behind selector:** increase list `paddingBottom` by selector height plus `insets.bottom`.
- **Selector changes size:** use fixed minimum heights and one absolute animated indicator.
- **Touches blocked near bottom:** set `pointerEvents="none"` on blur and gradient layers and keep controls at a higher `zIndex`.
