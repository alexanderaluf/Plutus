# Bottom Action Button and Safe-Area Gradient

The shared `BottomSafeAreaGradient` is the current implementation. Render it
over a viewport that reaches the phone bottom. It draws one translucent fade
through the entire navigation inset; do not append a solid safe-area band or
pad the viewport. Reserve safe space in scroll content and action offsets.

Expo Go uses its own native navigation-bar contrast settings. In light mode,
Android's button navigation can therefore show a white system scrim even when
the app gradient is translucent. Test this behavior in the application's own
Android build with `expo-navigation-bar` configured with `enforceContrast: false`;
SDK 57 does not expose a runtime override for Expo Go's contrast setting.

## Purpose and Scope

Use this pattern for a persistent primary action such as Add account or Save
changes on a scrollable editor. Match the New account page: an opaque accent
button floats above a theme-derived gradient, and that gradient blends into the
background behind the native Android navigation buttons or iOS home indicator.

Source references:

- [Account create screen](../src/features/accounts/account-create-screen.tsx)
- [Theme helpers](../src/shared/theme/app-theme.tsx)
- [System bars and root providers](../src/app/_layout.tsx)
- [Expo native configuration](../app.json)
- [Companion sticky top/header guide](./sticky-top-selector-header-guide.md)

This is an action-button guide, not a bottom segmented-control guide. Do not
modify the existing [bottom glass selector guide](./bottom-glass-selector-guide.md)
or application bottom navigation to implement it.

Read the installed SDK's documentation before implementing. This project uses
[Expo SDK 57](https://docs.expo.dev/versions/v57.0.0/), including
[NavigationBar](https://docs.expo.dev/versions/v57.0.0/sdk/navigation-bar/),
[LinearGradient](https://docs.expo.dev/versions/v57.0.0/sdk/linear-gradient/), and
[safe-area context](https://docs.expo.dev/versions/v57.0.0/sdk/safe-area-context/).

## Required Geometry

| Element                                | Reference value                            |
| -------------------------------------- | ------------------------------------------ |
| Root safe-area edges                   | None; inset scroll content and controls    |
| Scroll content bottom padding          | 104 + insets.bottom                        |
| Gradient fade distance above safe area | 152                                        |
| Total gradient height                  | 152 + insets.bottom                        |
| Gradient anchor                        | Absolute bottom 0, left/right 0, zIndex 10 |
| Button dock bottom                     | Math.max(insets.bottom, 10)                |
| Button dock horizontal padding         | 12, with left/right 0                      |
| Button dock zIndex                     | 20                                         |
| Button height and radius               | 58 and 29                                  |
| Icon size and icon/label gap           | 24 and 10                                  |
| Error-to-button gap                    | 6                                          |
| Pressed/disabled opacity               | 0.72 / 0.5                                 |

Numeric values are React Native layout units, not physical pixels. The action
dock is a sibling of the scroll content, not a child of it. Both scrim and dock
are positioned within the same full-height content container. Do not use a
negative offset relative to another floating control or put the action in a card.

Use a full-height `View` with `theme.background`. Applying bottom
safe-area padding to the entire screen prevents the gradient from reaching the
system controls. No ancestor may reserve another opaque bottom footer or crop
the screen before its bottom edge.

## One Continuous Gradient

Use the actual theme color for every stop, including the transparent stop. In
dark mode it is black; in light mode it is the current light background. Do not
hard-code black for both themes, and do not substitute white to imitate an
Android system surface.

The shared component defaults to a height of `152 + insets.bottom` and uses three stops across the entire height:

| Location | Color                          |
| -------- | ------------------------------ |
| 0        | Theme background at alpha 0    |
| 0.54     | Theme background at alpha 0.36 |
| 1        | Theme background at alpha 0.92 |

The fade stays translucent through the safe area, with no opaque plateau or separate rectangle.

The scrim covers more space than the button, but it must not intercept touches.
Use `pointerEvents="none"` on the gradient and `pointerEvents="box-none"` on the
dock so its empty space does not block the form.

## Reusable Overlay Example

This component renders only the bottom overlays. Mount it under the full-height
container from the top guide, after the scroll/blur target and alongside the top
overlays. Do not add another ScrollView, SafeAreaView, or KeyboardAvoidingView
inside it. The parent scroll content must reserve `104 + insets.bottom` points.

```tsx
import { BottomSafeAreaGradient } from "@/shared/ui/safe-area-gradients";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useAppThemeColors } from "@/shared/theme/app-theme";
import { FilledIcon, type FilledIconName } from "@/shared/ui/filled-icon";

type BottomActionProps = {
  label: string;
  busyLabel: string;
  icon: FilledIconName;
  busy: boolean;
  error?: string;
  onPress: () => void;
};

export function BottomActionSection({
  label,
  busyLabel,
  icon,
  busy,
  error,
  onPress,
}: BottomActionProps) {
  const theme = useAppThemeColors();
  const insets = useSafeAreaInsets();
  const visibleLabel = busy ? busyLabel : label;

  return (
    <>
      <BottomSafeAreaGradient />
      <View
        pointerEvents="box-none"
        style={[styles.actionDock, { bottom: Math.max(insets.bottom, 10) }]}
      >
        {!!error && (
          <Text
            accessibilityRole="alert"
            accessibilityLiveRegion="polite"
            className="font-sans text-sm text-danger"
          >
            {error}
          </Text>
        )}
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={visibleLabel}
          accessibilityState={{ busy, disabled: busy }}
          disabled={busy}
          onPress={onPress}
          style={({ pressed }) => [
            styles.button,
            { backgroundColor: theme.accent },
            pressed && styles.pressed,
            busy && styles.disabled,
          ]}
        >
          <FilledIcon name={icon} size={24} tone="accent-foreground" />
          <Text
            numberOfLines={1}
            style={{ flexShrink: 1 }}
            className="font-manrope-bold text-base text-accent-foreground"
          >
            {visibleLabel}
          </Text>
        </Pressable>
      </View>
    </>
  );
}

const styles = StyleSheet.create({
  bottomScrim: {
    position: "absolute",
    bottom: 0,
    left: 0,
    right: 0,
    zIndex: 10,
  },
  actionDock: {
    position: "absolute",
    left: 0,
    right: 0,
    paddingHorizontal: 12,
    gap: 6,
    zIndex: 20,
  },
  button: {
    height: 58,
    borderRadius: 29,
    flexDirection: "row",
    gap: 10,
    alignItems: "center",
    justifyContent: "center",
    overflow: "hidden",
  },
  pressed: { opacity: 0.72 },
  disabled: { opacity: 0.5 },
});
```

For the account editor, pass `label="Add account"`, `busyLabel="Saving..."`, and
`icon="credit-card-plus"`; edit mode uses `label="Save changes"`. Preserve
established typography and use an opaque accent button, not a blurred button.

## Android: Native Transparency, Not Color Matching

Keep the real Android navigation buttons. Do not hide them, draw replacement
Back/Home/Recents controls, change the user's navigation mode, or cover native
UI with a fake footer as a product implementation.

In SDK 57, Expo's generated Android theme sets the status/navigation bar colors
to transparent. The navigation plugin must also disable the native contrast
scrim, which otherwise can introduce a light or dark system band:

```json
[
  "expo-navigation-bar",
  { "enforceContrast": false, "hidden": false, "style": "dark" }
]
```

This is an entry in the existing Expo `plugins` array, not a replacement for the
whole app configuration. `style: "dark"` supplies the reference light-startup
button style; it does not set a background color. Continue using the root
`SystemBars` component for runtime theme changes. The current root uses
`NavigationBar style={isDark ? "light" : "dark"}`. Do not add competing global
system-bar effects to every feature screen.

When native projects are generated, verify `AppTheme` contains:

```xml
<item name="android:navigationBarColor">@android:color/transparent</item>
<item name="android:enforceNavigationBarContrast" tools:targetApi="29">false</item>
<item name="expoEnforceNavigationBarContrast">false</item>
```

These items belong under a resources root declaring the Android tools namespace.
Use the existing config plugins to generate them; do not edit node_modules or
rely on manual changes to generated resources that disappear on prebuild.

Native plugin changes require regenerating and rebuilding the app. Fast Refresh
only updates JavaScript. SDK 57 no longer provides runtime navigation-background
or positioning setters such as `setBackgroundColorAsync` or `setPositionAsync`,
and deprecated `androidNavigationBar` config is not a substitute.

Expo Go has its own native host window and cannot be treated as proof that a
project's build-time transparency configuration is applied. If a white band
remains there, test a project-owned debug/development or release build. Do not
keep changing theme colors to match Expo Go's contrast layer. Inspect generated
resources and the actual running package before attributing a remaining band
to application layout.

For this project's approved local Android identity, the package is
`com.plutus.budgettracker`. With the existing Metro server running, a local
emulator build can be launched with:

```powershell
npx expo run:android --device Plutus_API_35 --no-install --no-bundler
```

Use the current AVD name for another machine. Without a running Metro server,
omit `--no-bundler`; do not combine `--port` with `--no-bundler` in this CLI.
SDK 57's docs also warn about navigation-button styling on Android 15 emulators;
cross-check any remaining native discrepancy on physical hardware or another API.

## iOS: Home Indicator and Keyboard

iOS has no Android-style three-button navigation-bar background to configure.
Its home indicator overlays the app. Let the screen fill the bottom safe area,
keep the gradient at `bottom: 0`, and place the button above `insets.bottom`.
Do not introduce an opaque UIKit/footer/React Native safe-area wrapper between
the gradient and the screen edge. Do not hide or replace the home indicator.

Retain the reference screen's single `KeyboardAvoidingView`: `padding` on iOS
and `height` on Android. Its action dock moves with the available editor area
when the keyboard appears. Check keyboard dismissal and avoid adding another
keyboard offset or safe-area pad without measuring the resulting layout.

No iOS visual verification is implied by correct Android rendering. Test an
iPhone with a home indicator, plus a device/simulator with a zero bottom inset.

## Actions, Errors, and Accessibility

- The feature owns the save handler. Validate the draft, guard repeat presses
  with a ref, set busy state, and await the existing provider mutation.
- Do not navigate, clear the form, or report success before persistence resolves.
  Catch errors and show a readable alert; clear the busy guard in `finally`.
- Preserve the button's accessible name, button role, busy/disabled state, and
  theme-derived foreground contrast. Do not put hidden active controls beneath it.
- Keep open sheets outside blur targets. An idle sheet must not leave a handle
  or background under the button. The reference mounts currency sheets only
  when their picker/request state is active; verify opening and dismissal too.
- The 104-point scroll padding is the reference for the normal action. If a
  multiline error or large-font label increases dock height, measure it and
  increase scroll clearance. Do not let the last field become unreachable.
- The fixed button height is a baseline. For long translations or large text,
  accommodate the label and adjust clearance consistently; do not shrink the
  font with viewport width or silently clip the primary action.

## Verification and Failure Cases

After code changes, run `npx tsc --noEmit` and `node --test tests/*.test.cjs`.
For native configuration changes, also run `npx expo-doctor` and rebuild the
project-owned Android binary. Unit/type checks alone cannot verify transparency.

1. Test light and dark themes, including switching themes while the screen is open.
2. On Android, test three-button and gesture navigation. Target the correct
   device explicitly with `adb -s <serial>` when more than one is connected.
3. On iOS, check the home-indicator area and zero-inset behavior separately.
4. Capture the lower screen at rest and while content scrolls under the gradient.
   Compare background pixels on both sides of the safe-area boundary, away from
   system icons: there should be no sudden white/black/tinted horizontal step.
5. Confirm the button stays above native controls and the final form field can
   scroll fully above the button. Test keyboard open, close, and focused fields.
6. Check busy, disabled, success, and long-error states without creating duplicate
   records. Verify TalkBack/VoiceOver focus and touch bounds.
7. Open and dismiss each sheet. Check that no closed sheet background remains.
8. Record device/API, theme, navigation mode, running package, and build type.
   Report untested platforms and build blockers explicitly; do not equate a
   configured transparent bar with visually verified transparency.

| Symptom                                      | First check                                                                 |
| -------------------------------------------- | --------------------------------------------------------------------------- |
| White native band in light mode              | Contrast enforcement, running host package, stale native build              |
| Hard line even with a transparent native bar | Gradient not opaque at inset start, or a separate footer rectangle          |
| Black fade in light mode                     | Hard-coded color instead of theme.background                                |
| Gradient stops above buttons/home indicator  | Bottom safe-area edge/padding applied to the whole screen                   |
| System buttons disappear                     | Incorrect button style or hidden navigation; do not replace system controls |
| Save action overlaps native controls         | Dock bottom is not derived from insets.bottom                               |
| Last field is obscured                       | Missing scroll padding or unmeasured growing error dock                     |
| iOS looks different from Android             | Duplicate safe-area/keyboard handling or an opaque ancestor                 |

This guide describes the implementation contract and how to verify it, not a
claim that every device/build has passed that verification.
