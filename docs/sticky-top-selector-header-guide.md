# Sticky Top Selector and Fading Header

## Purpose and Scope

Use this pattern for an editor with a page title/back button followed by a
segmented selector, matching the New account page. Only the selector remains
visible when the user scrolls down. The header moves upward and fades away; it
must not remain fixed beside the pinned selector.

Source references:

- [Account create screen](../src/features/accounts/account-create-screen.tsx)
- [Shared glass segmented control](../src/shared/ui/glass-segmented-control.tsx)
- [Theme helpers](../src/shared/theme/app-theme.tsx)
- [Root providers and system bars](../src/app/_layout.tsx)
- [Companion bottom action guide](./bottom-action-gradient-guide.md)

Before implementing, read the exact installed Expo version's docs. This project
uses [Expo SDK 57](https://docs.expo.dev/versions/v57.0.0/), including
[BlurView](https://docs.expo.dev/versions/v57.0.0/sdk/blur-view/) and
[LinearGradient](https://docs.expo.dev/versions/v57.0.0/sdk/linear-gradient/).
Reuse installed packages and the shared control, not a new selector library.

Do not modify the application bottom navigation or the existing
[bottom glass selector guide](./bottom-glass-selector-guide.md) to apply this
pattern. These are separate UI elements. Keep persistence and form logic in
their existing feature providers; scrolling and selection are temporary UI state.

## Observable Behavior

| State             | Header                                     | Selector                             |
| ----------------- | ------------------------------------------ | ------------------------------------ |
| Scroll offset 0   | Visible above the gradient                 | Top at 64 points                     |
| Offset 0 to 40    | Moves upward and fades from opacity 1 to 0 | Moves upward with the header         |
| Offset 40 to 56   | Invisible                                  | Continues toward its pinned position |
| Offset 56 or more | Invisible, non-interactive                 | Pinned at 8 points                   |
| Scroll back to 0  | Returns and fades back in                  | Returns beneath the header           |

All offsets are relative to the content area below the top safe-area inset.
React Native numeric layout values are density-independent units, not physical
screenshot pixels. The viewport reaches the phone edges. Apply `insets.top`
to the initial scroll spacer and the header/selector docks, never to viewport
padding. The gradient starts at phone coordinate zero.

## Geometry and Layering

| Element                                   | Required reference value                                                                               |
| ----------------------------------------- | ------------------------------------------------------------------------------------------------------ |
| Header spacer in scroll content           | insets.top + 56                                                                                        |
| Selector spacer in scroll content         | 84                                                                                                     |
| Initial combined space before form fields | insets.top + 140                                                                                       |
| Header dock                               | Top insets.top, left/right 16                                                                          |
| Selector dock                             | Top insets.top + 64, left/right 12                                                                     |
| Selector/header upward travel             | 56, clamped                                                                                            |
| Header opacity range                      | Scroll 0 to 40                                                                                         |
| Top gradient                              | Height insets.top + 96 with title visible; insets.top + 32 once hidden; top 0, left/right 0, zIndex 10 |
| Header and selector overlays              | zIndex 20; selector rendered after header                                                              |
| Segment minimum height                    | Android 52, iOS 48                                                                                     |

The segment minimum height is not the entire glass shell height: the shared
control also has track margins and a border. Preserve the 84-point spacer.

Use this hierarchy, from back to front, under the existing root providers:

1. A full-height `View` with `theme.background` and `flex: 1`.
2. `KeyboardAvoidingView`, then one full-height screen-local container.
3. `BlurTargetView` containing only the scrollable content and its spacers.
4. A non-interactive top gradient, outside the blur target.
5. An animated header overlay, outside the blur target and above the gradient.
6. An animated selector overlay, also outside the blur target.
7. Optional bottom action siblings as described in the companion guide.

The header is an overlay for rendering order, not a sticky header in behavior.
Its scroll-driven translation and opacity make it disappear. Putting it inside
the scroll target underneath the scrim makes the title dark or invisible at rest.

## Reusable Layout Example

This example preserves the reference animation and dimensions. It also hides
the faded header from touches and screen readers, and clips it to its header
slot so it cannot draw over the status bar. These are accessibility safeguards
to retain when applying the pattern, not claims that the reference already has
all of them.

Render the bottom guide's action component through `bottomOverlay`; do not wrap
it in another safe-area or scroll container. `children` contains the feature's
form fields. The feature owns `value`, `onChange`, `onBack`, and save behavior.

```tsx
import { BlurTargetView } from "expo-blur";
import { TopSafeAreaGradient } from "@/shared/ui/safe-area-gradients";
import { Button } from "heroui-native";
import { useEffect, useRef, useState, type ReactNode } from "react";
import {
  Animated,
  KeyboardAvoidingView,
  Platform,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useAppThemeColors } from "@/shared/theme/app-theme";
import { FilledIcon } from "@/shared/ui/filled-icon";
import { GlassSegmentedControl } from "@/shared/ui/glass-segmented-control";

type TopSectionProps<Value extends string> = {
  title: string;
  selectorLabel: string;
  options: readonly { label: string; value: Value }[];
  value: Value;
  onChange: (value: Value) => void;
  onBack: () => void;
  busy: boolean;
  children: ReactNode;
  bottomOverlay?: ReactNode;
};

export function StickyTopSection<Value extends string>({
  title,
  selectorLabel,
  options,
  value,
  onChange,
  onBack,
  busy,
  children,
  bottomOverlay,
}: TopSectionProps<Value>) {
  const theme = useAppThemeColors();
  const insets = useSafeAreaInsets();
  const blurTargetRef = useRef<View | null>(null);
  const scrollY = useRef(new Animated.Value(0)).current;
  const [headerHidden, setHeaderHidden] = useState(false);

  useEffect(() => {
    let wasHidden = false;
    const listener = scrollY.addListener(({ value: offset }) => {
      const hidden = offset >= 40;
      if (hidden !== wasHidden) {
        wasHidden = hidden;
        setHeaderHidden(hidden);
      }
    });
    return () => scrollY.removeListener(listener);
  }, [scrollY]);

  const translateY = scrollY.interpolate({
    inputRange: [0, 56],
    outputRange: [0, -56],
    extrapolate: "clamp",
  });
  const opacity = scrollY.interpolate({
    inputRange: [0, 40],
    outputRange: [1, 0],
    extrapolate: "clamp",
  });

  return (
    <View style={[styles.fill, { backgroundColor: theme.background }]}>
      <KeyboardAvoidingView
        behavior={Platform.OS === "ios" ? "padding" : "height"}
        style={styles.fill}
      >
        <View style={styles.fill}>
          <BlurTargetView ref={blurTargetRef} style={styles.fill}>
            <Animated.ScrollView
              contentContainerStyle={{ paddingBottom: 104 + insets.bottom }}
              keyboardShouldPersistTaps="handled"
              showsVerticalScrollIndicator={false}
              scrollEventThrottle={16}
              onScroll={Animated.event(
                [{ nativeEvent: { contentOffset: { y: scrollY } } }],
                { useNativeDriver: true },
              )}
            >
              <View style={{ height: insets.top + 56 }} />
              <View style={{ height: 84 }} />
              <View
                pointerEvents={busy ? "none" : "auto"}
                className="gap-5 px-5"
              >
                {children}
              </View>
            </Animated.ScrollView>
          </BlurTargetView>
          <TopSafeAreaGradient headerHidden={headerHidden} />
          <View
            style={[styles.headerClip, { top: insets.top }]}
            pointerEvents={headerHidden ? "none" : "box-none"}
            accessibilityElementsHidden={headerHidden}
            importantForAccessibility={
              headerHidden ? "no-hide-descendants" : "auto"
            }
          >
            <Animated.View
              style={[styles.header, { opacity, transform: [{ translateY }] }]}
            >
              <Button
                isIconOnly
                variant="ghost"
                accessibilityLabel="Go back"
                isDisabled={busy}
                onPress={onBack}
              >
                <FilledIcon name="arrow-left" size={24} />
              </Button>
              <Text
                accessibilityRole="header"
                numberOfLines={1}
                style={{ flexShrink: 1 }}
                className="font-manrope-bold text-xl text-foreground"
              >
                {title}
              </Text>
            </Animated.View>
          </View>
          <Animated.View
            pointerEvents={busy ? "none" : "auto"}
            style={[
              styles.selectorDock,
              { top: insets.top + 64, transform: [{ translateY }] },
            ]}
          >
            <GlassSegmentedControl
              accessibilityLabel={selectorLabel}
              blurTarget={blurTargetRef}
              minHeight={Platform.OS === "android" ? 52 : 48}
              options={options}
              value={value}
              onChange={onChange}
            />
          </Animated.View>
          {bottomOverlay}
        </View>
      </KeyboardAvoidingView>
    </View>
  );
}

const styles = StyleSheet.create({
  fill: { flex: 1 },
  headerClip: {
    position: "absolute",
    top: 0,
    left: 16,
    right: 16,
    height: 56,
    overflow: "hidden",
    zIndex: 20,
  },
  header: { flexDirection: "row", alignItems: "center", gap: 12, height: 56 },
  selectorDock: {
    position: "absolute",
    top: 64,
    left: 12,
    right: 12,
    zIndex: 20,
  },
});
```

Do not use `stickyHeaderIndices` on the title. Do not animate layout height or
top padding on every frame. The native driver handles only the opacity and
translation here; the listener above changes React state only at the visibility
threshold. Negative overscroll is clamped so the header does not over-fade.

## Android Rules

- The selector's BlurView must be a sibling of its `BlurTargetView`, never a
  descendant. Self-capture previously caused native RenderThread crashes.
- Do not put one BlurTargetView around the router or the entire app. Keep each
  target screen-local, and keep bottom sheets and other blurred overlays outside it.
- Pass the target ref to the existing control. Its Android native blur uses
  `dimezisBlurViewSdk31Plus`, intensity 36, and reduction factor 3. With no target,
  retain its translucent fallback instead of requesting invalid native blur.
- Preserve the shared shell's clipping, theme tint, border, track margins, and
  single measured selection indicator. Reuse its reduced-motion-aware springs.
- Test on both an emulator and physical hardware when changing blur topology.

## iOS Rules

- iOS BlurView does not require an explicit target. The same shared component
  and sibling layout can be used on both platforms without an iOS-specific fork.
- Keep header and selector controls below the notch/Dynamic Island using
  their dock offsets. The scrolling viewport and gradient start at the phone
  edge. The shared gradient is one continuous translucent fade through the
  safe area, with no separate opaque status-bar band.
- Use `KeyboardAvoidingView` with `padding` as in the reference. Verify keyboard
  opening, dismissal, bounce, and scrolling back to zero without changing dock sizes.

## Theme, Accessibility, and Consistency

Always derive the gradient from `theme.background` using `colorWithAlpha`.
Dark mode resolves to black; light mode resolves to the light theme background.
The shared top gradient spans `insets.top + 96` while the title is visible
and `insets.top + 32` once hidden. Its theme-derived translucent stops fade
through the safe area to clear content. There is no solid safe-area band.
Pass header visibility to `TopSafeAreaGradient`; Home receives this through
`CollapsingHeader`, independently of its selector. These are threshold-driven
changes at offset 40, with no per-frame height animation or extra timing.
Never hard-code black in light mode or white as an Android workaround. Keep the
header above the gradient so it is fully readable at rest.

Use the existing Manrope text classes and FilledIcon component. Keep the shared
selector's tablist/tab roles and selected state. Hide an invisible header from
TalkBack/VoiceOver and touch hit testing; opacity alone does not do that. Keep
system back/edge-swipe navigation working after the visible back button fades.

The collapse is directly controlled by scrolling, not an autonomous spring.
Do not add decorative bounce to it. Preserve `ReduceMotion.System` in the shared
selector. Test large text: if the title cannot fit, measure and update header
slot, spacer, selector offset, and collapse distance together, not independently.

## Verification and Failure Cases

After implementing this pattern on a screen, run `npx tsc --noEmit` and
`node --test tests/*.test.cjs`. These checks do not prove native visual correctness.

1. Test light and dark themes on Android and iOS, with the keyboard open and closed.
2. At offset zero, confirm the title/back button are readable above the gradient.
3. At offsets near 20, 40, and 56, confirm synchronized movement and fading.
4. Scroll farther: only the selector remains, 8 points below the top content edge.
5. Return to the top and switch every segment, including a segment with short content.
6. Confirm fields can scroll clear of top controls and any bottom action dock.
7. Check TalkBack/VoiceOver focus and non-inverted accessibility bounds.
8. Check reduced motion and large text. Capture top, intermediate, and pinned states.
9. On Android, check Logcat for `Fatal signal`, `FATAL EXCEPTION`, `stack overflow`,
   and `blurTarget prop has not been configured`.

Use `adb -s <serial>` when an emulator and phone are both connected. Record which
platform, theme, and build was actually tested; do not report iOS verified from
an Android screenshot.

| Symptom                          | First check                                                          |
| -------------------------------- | -------------------------------------------------------------------- |
| Title invisible at rest          | Header is below the gradient instead of above it                     |
| Title stays pinned               | Header is missing its opacity/translation or is a sticky list header |
| Selector disappears              | It is inside the scroller instead of the sibling overlay             |
| Selector overlaps first field    | Missing 56 + 84 points of scroll spacers                             |
| Top elements jump or bounce      | Unclamped scroll interpolation or per-frame layout mutations         |
| Invisible back action gets focus | Missing hidden-header accessibility and pointer guards               |
| Android crash or no blur         | Invalid blur target or recursive target topology                     |
