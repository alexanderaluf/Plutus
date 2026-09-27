# Native iOS bottom sheets

All bottom-sheet features import `BottomSheet` and sheet scroll/list components
from `src/shared/ui/app-bottom-sheet`, and use `AppBottomSheetPortal` when needed.
Metro chooses the implementation for the device:

- **iOS:** Expo UI's SwiftUI `BottomSheet`, presented in its own native window.
- **Android/web:** the existing HeroUI `BottomSheet` and Gorhom scroll components.

The iOS adapter uses the installed Expo SDK 57 APIs. SwiftUI manages the backdrop,
drag indicator, transitions, interactive dismissal, and keyboard safe area.
`Host` applies the app's theme and language direction. `RNHostView` embeds the
existing feature content and gives it working touches in the presented window.
Parent scroll/list contexts are reset so a currency FlatList can scroll even
when the sheet was opened from another list.

## Coverage

The adapter covers transaction details and delete confirmation, transaction
categories and save actions, account actions and currency changes, profile
deletion and currency search, category deletion, budget deletion, budget sorting
and selection, and recurring editor selectors. The reused `BudgetSheet` has an
iOS implementation as well; its Android modal is retained in `budget-sheet.tsx`.
Full-screen icon/account pickers remain full-screen modals.

## Presentation rules

- Percentage snap points become native fractional detents; numeric points become
  height detents. Sheets with dynamic sizing and no snap points fit their content.
- Existing sheet content classes, records, validation and callbacks are reused.
- Disable interactive dismissal during protected writes using the existing
  `enablePanDownToClose`, handle and content gesture flags. Programmatic closing
  remains available after a successful write.
- `onOpenChange(false)` handles a user's dismissal request. `Content.onClose`
  runs after the native dismissal finishes; use it when the parent must wait
  before removing the sheet or reporting a completed deletion.
- Native iOS content mounts on presentation. A conditionally mounted sheet must
  start open on iOS instead of waiting for hidden content to emit `onLayout`.
  Existing Android portal opening and positioning fixes remain unchanged.

## Verification

`tests/native-ios-bottom-sheet.test.cjs` checks native presentation configuration,
theme/direction, detents, protected dismissal, completion timing, scroll context
isolation, and Android component identity. The category deletion tests exercise
both opening sequences. Run these along with TypeScript and Android/iOS exports.

Device checks should cover opening, dragging to dismiss, typing in currency
search, scrolling long content, transaction edit/copy/delete, nested pickers,
dark/light themes, Hebrew direction, and dismissal during an awaited write.

References: [Expo UI skill](../.agents/skills/expo-ui/SKILL.md),
[SDK 57 SwiftUI BottomSheet](https://docs.expo.dev/versions/v57.0.0/sdk/ui/swift-ui/bottomsheet/),
[SDK 57 presentation modifiers](https://docs.expo.dev/versions/v57.0.0/sdk/ui/swift-ui/modifiers/).
