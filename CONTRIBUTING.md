<div align="center">

<img src="assets/icons-android/adaptive-icon.png" alt="Plutus logo" width="96" />

# Contributing to Plutus

**A developer guide to forking, building, testing and contributing to Plutus.**

</div>

This guide is for developers who want to run Plutus locally, fork it, or send
changes back. It explains how the project is organized, where each part lives,
how to build it for Android and iOS, and how to test your changes before you
open a pull request.

> **Before you change anything related to storage, backups or startup, read
> [AGENTS.md](AGENTS.md) and [docs/storage-upgrades.md](docs/storage-upgrades.md).**
> Plutus stores irreplaceable financial records on a user's device, with no
> server copy. A careless migration can permanently destroy someone's data.

---

## Table of contents

1. [Code of conduct and license](#1-code-of-conduct-and-license)
2. [Prerequisites](#2-prerequisites)
3. [Fork, clone and install](#3-fork-clone-and-install)
4. [Running the app](#4-running-the-app)
5. [Repository tour: where everything lives](#5-repository-tour-where-everything-lives)
6. [Architecture you must understand](#6-architecture-you-must-understand)
7. [Common development tasks](#7-common-development-tasks)
8. [Testing](#8-testing)
9. [Building release binaries](#9-building-release-binaries)
10. [Validation checklist before a pull request](#10-validation-checklist-before-a-pull-request)
11. [Git workflow and pull requests](#11-git-workflow-and-pull-requests)
12. [Troubleshooting](#12-troubleshooting)
13. [Contact](#13-contact)

---

## 1. Code of conduct and license

- Be respectful and constructive in issues, reviews and discussions.
- Plutus is licensed under the **[PolyForm Noncommercial License 1.0.0](LICENSE)**.
  You may fork, modify and redistribute it for noncommercial purposes only.
- **Every fork must keep [LICENSE](LICENSE) and [NOTICE](NOTICE) unchanged**,
  including the `Required Notice:` lines that credit Alexander Aluf as the
  original creator and copyright owner.
- By sending a contribution, you agree that it may be distributed under the
  project's license.
- Commercial use requires prior written permission. Email
  [alexacdem@gmail.com](mailto:alexacdem@gmail.com).

---

## 2. Prerequisites

| Tool | Version | Notes |
| :-- | :-- | :-- |
| **Node.js** | **22.13+** (24 LTS recommended) | The tests import `node:sqlite`, which older versions don't have. |
| **npm** | Comes with Node | The repository uses `package-lock.json`, so use npm, not yarn or pnpm. |
| **Git** | Any recent version | |
| **JDK** | 17 | Needed for Android builds. |
| **Android Studio** | Latest | Install the Android SDK, platform tools and NDK. The minimum SDK is **26**. |
| **Xcode** | 26+ (macOS only) | Needed for iOS builds. CocoaPods must be installed. |
| **Physical device** | arm64, 4 GB+ RAM | Only needed to test Plutus AI. Simulators and emulators are reported as unsupported. |

Recommended editor: **VS Code** with the recommended extensions in
[.vscode/extensions.json](.vscode/extensions.json) (Expo Tools). The workspace
settings organize imports on save and configure Tailwind IntelliSense for
Uniwind. [.vscode/mcp.json](.vscode/mcp.json) registers the HeroUI Native MCP
server for component documentation.

> **Expo Go is not supported.** Plutus includes custom native code
> (`modules/plutus-local-ai`, `react-native-litert-lm`, Nitro Modules). You need
> a development build (`npx expo run:*`) or a release build.

---

## 3. Fork, clone and install

```bash
# 1. Fork https://github.com/alexanderaluf/budget-tracker on GitHub, then:
git clone https://github.com/<your-username>/budget-tracker.git
cd budget-tracker

# 2. Keep a reference to the original repository
git remote add upstream https://github.com/alexanderaluf/budget-tracker.git

# 3. Install dependencies
npm install
```

`npm install` runs a **postinstall** step that patches two packages in
`node_modules`. Both patches are required for a working native build:

| Script | Why it exists |
| :-- | :-- |
| [scripts/patch-expo-jsi-xcode26.cjs](scripts/patch-expo-jsi-xcode26.cjs) | Xcode 26.2 rejects a Swift interop annotation in Expo SDK 57's JSI header and needs Swift 5 language mode. |
| [scripts/patch-litert-lm.cjs](scripts/patch-litert-lm.cjs) | On Android, the patch uses a CPU vision executor when the main backend is CPU. Without it, devices without OpenCL lose the multimodal (audio) engine. |

If you install with `--ignore-scripts`, run `npm run postinstall` before you
build.

---

## 4. Running the app

### Development build

```bash
npx expo run:android      # builds the native app, installs it and starts Metro
npx expo run:ios          # macOS only; add --device to choose a physical iPhone
```

Both commands run `expo prebuild`, which generates the `android/` and `ios/`
folders. **These folders are generated and ignored by git.** Don't edit them
by hand. Put native configuration in [app.json](app.json) or in a config plugin
in [plugins/](plugins/).

After the first build, you can reuse the installed development app:

```bash
npx expo start --dev-client
```

Add `--clear` if Metro serves stale code after a dependency or CSS change.

### First launch

A fresh install opens **onboarding**. There you choose a language, confirm the
backup notices, and enter a profile name, currency, date format, financial-month
start day and week start day. You can also:

- **Generate demo data** to explore the app with sample records, or
- **Restore a backup.** The fictional datasets in [test-data/](test-data/)
  (`plutus-en.json`, `plutus-he.json`, `plutus-ru.json`) each contain about
  1,657 transactions, 10 accounts, 107 categories, 14 budgets and
  28 recurring schedules across 3 profiles.

To load a test dataset on a device, copy the JSON file to the phone and choose
**Restore** during onboarding, or **Settings → Backup → Import** later. See
[docs/device-test-backup-guide.md](docs/device-test-backup-guide.md) for the
full device test checklist.

### Plutus AI on a device

1. Use a physical arm64 phone with at least 4 GB of RAM.
2. Open the chat (the speech-bubble button on Home) and download a model.
   **Gemma 4 E2B** is about 2.6 GB. **Gemma 4 E4B** is about 3.7 GB. The app
   needs about twice the model size plus 1 GB of free storage.
3. The download is managed by the system and continues while the app is in
   the background. The native `LocalAIModelStore` checks the file's size and
   SHA-256 hash before the model is used.

---

## 5. Repository tour: where everything lives

```text
.
├── app.json                      # Expo config: bundle IDs, icons, splash, permissions, plugins
├── package.json                  # Dependencies and scripts (npm test, lint, android, ios)
├── global.css                    # Tailwind v4 / Uniwind / HeroUI theme tokens (light & dark)
├── metro.config.js               # Metro + Uniwind integration
├── AGENTS.md / CLAUDE.md         # Binding rules for the data layer (humans and AI agents)
├── LICENSE / NOTICE              # PolyForm Noncommercial + required attribution notices
│
├── src/
│   ├── app/                      # Expo Router file-based routes
│   │   ├── _layout.tsx           #   Root provider tree (order matters, see §6)
│   │   ├── (tabs)/               #   Home, Accounts, Reports, Search tabs
│   │   ├── accounts/ budgets/ categories/ recurring/ transactions/ profile/
│   │   ├── ai.tsx                #   Plutus AI chat
│   │   └── insights.tsx
│   │
│   ├── data/                     # Everything that touches persisted state
│   │   ├── model/                #   Schema + pure domain logic
│   │   │   ├── backup-document.ts      BackupDocument type, LOCAL_SCHEMA_VERSION, collections
│   │   │   ├── default-backup.ts       Production default (18 base categories, empty collections)
│   │   │   ├── normalize-backup.ts     The only entry point for untrusted JSON
│   │   │   ├── onboarding.ts           Setup status + completeSetup
│   │   │   ├── transaction-record.ts   Save/delete transactions and balance effects
│   │   │   ├── account-record.ts, card-payment.ts, savings-account.ts
│   │   │   ├── budget-record.ts, category-record.ts, recurring-record.ts, profile-record.ts
│   │   │   └── transaction-conversion.ts, exchange-rate.ts, financial-month.ts
│   │   ├── database/
│   │   │   ├── safe-startup.ts         initializeLocalDatabase (checkpoints + recovery)
│   │   │   ├── migrations.ts           DATABASE_VERSION + forward-only migrations
│   │   │   └── document-repository.ts  Serialized, atomic read/mutate/write
│   │   ├── selectors/            #   Read-only projections for screens and the AI
│   │   ├── backup/               #   backup-service, zip/csv codecs, document export
│   │   ├── attachments/          #   persistAttachment, staged restore
│   │   ├── recurring/            #   Recurring engine, background task, reminders
│   │   ├── exchange-rates/       #   Public currency-code-only rate client
│   │   └── local-data-provider.tsx     useLocalData(): the single React write surface
│   │
│   ├── features/                 # One folder per product area
│   │   ├── home/ accounts/ budgets/ categories/ recurring/ transactions/
│   │   ├── reports/ search/ profile/ onboarding/
│   │   └── local-ai/             #   Plutus AI (see docs/local-ai-architecture.md)
│   │       ├── intent-router.ts, chat-controller.ts, chat-prompts.ts, evidence.ts
│   │       ├── tools/            #     tool-catalog.ts + one file per tool pack
│   │       ├── mutations/        #     prepare-change.ts, proposal-store.ts
│   │       ├── voice/            #     recorder hook, WAV validation, state machine
│   │       └── components/       #     chat UI, cards, proposal review card
│   │
│   ├── localization/             # i18next instance + locales/{en,he,ru}.ts (+ namespaces)
│   └── shared/                   # navigation/, theme/, icons/, lib/, ui/ primitives
│
├── modules/plutus-local-ai/      # Custom Expo module
│   ├── src/                      #   TS interface (requireOptionalNativeModule)
│   ├── android/                  #   Kotlin: model download store, WAV recorder
│   └── ios/                      #   Swift: model store, recorder, on-device speech fallback
│
├── plugins/                      # Expo config plugins
│   ├── with-local-ai-android-ndk.js   # Speech query + NDK version for LiteRT-LM
│   └── with-local-ai-ios-build.js     # Swift 5.9 for ExpoModulesJSI under Xcode 26
│
├── scripts/
│   ├── patch-*.cjs                     # postinstall patches (see §3)
│   ├── generate-device-test-backup.cjs # Deterministic test dataset generator
│   └── generate-material-account-icons.mjs
│
├── tests/                        # *.test.cjs + fixtures/legacy-development-backup.ts
├── test-data/                    # Large fictional backups (en/he/ru)
├── docs/                         # Architecture + UI implementation guides
├── assets/                       # Icons (plutus.icon for iOS, icons-android), screenshots, logos
└── .agents/skills/               # Expo & HeroUI skills for AI coding agents (skills-lock.json)
```

### Routes are thin

Route files in `src/app/` only read the route parameters and render a screen
from `src/features/`:

```tsx
// src/app/budgets/[id]/index.tsx
export default function BudgetDetailsRoute() {
  const { id } = useLocalSearchParams<{ id: string }>();
  return <BudgetDetailsScreen key={id} id={id} />;
}
```

Put logic in `src/features/<area>/`. Put reusable, persistence-independent
logic in `src/data/model/` or `src/data/selectors/`, where the Node tests can
reach it.

### Import aliases

`@/*` maps to `src/*` and `@/assets/*` maps to `assets/*` (see
[tsconfig.json](tsconfig.json)).

### Platform-specific files

Metro chooses `*.ios.tsx` over `*.tsx` on iOS. For example,
`src/shared/ui/app-bottom-sheet.ios.tsx` renders a native SwiftUI sheet, while
Android uses HeroUI and Gorhom. Keep the same props on both versions.

---

## 6. Architecture you must understand

### 6.1 One document, one row

All user data is **one JSON `BackupDocument`** stored in SQLite
(`budget-manager.db`, table `app_document`, row `id = 1`, WAL mode). Images and
receipts are files in the app's private documents directory. The document only
stores their relative paths in `_local.attachments`.

The document is compatible with the **Paisa version 3** backup format and
contains these collections: `transactions`, `accounts`, `assets`, `budgets`,
`billSplitters`, `billParticipants`, `categories`, `goals`, `loans`,
`recurrings`, `labels`, `places`, `peoples`, `users`, `images`, `templates`,
`achievements` and `exchangeRates`. App settings live in `_local`.

**Unknown fields and collections must always be preserved.**

### 6.2 Provider order

The provider order in [src/app/_layout.tsx](src/app/_layout.tsx) is intentional:

```text
StorageBoundary                 ← shows the recovery screen if startup throws
 └ SQLiteProvider               ← opens budget-manager.db, runs initializeLocalDatabase
    └ LocalDataProvider         ← hydrates the document; the only write surface
       └ LocalizationProvider → HeroUI / theme
          └ OnboardingGate      ← setup, restore, or continue
             └ ProfileProvider  ← active profile derived from the document
                └ Stack (routes)
```

Code that calls `useLocalData()` must render inside `LocalDataProvider`.
**Never open another database connection from a feature.**

### 6.3 Reading and writing

```tsx
const { document, upsertRecord, removeRecord, updateDocument } = useLocalData();
```

- **Read** through selectors in `src/data/selectors/`. If a screen needs a new
  projection, add a selector; don't parse records inside components.
- **Write** only through `useLocalData()`, and always `await` the call:
  - `upsertRecord(collection, record)` to create or update one record.
  - `removeRecord(collection, uuidOrId)` to delete one record.
  - `updateDocument(current => next)` when one user action changes several
    collections or relationships. The updater receives a deep clone, and the
    returned document must keep all unrelated keys.
  - `replaceDocument(doc)` only for a validated full restore.
- The provider normalizes, queues and commits each change to SQLite **before**
  it updates React state. Don't show success until the promise resolves, and
  show an error if it rejects.

Record rules:

- Use stable UUIDs. Never persist an array index as an ID.
- Use ISO-8601 timestamps for `createdAt` and `updatedAt`.
- Store money as finite numbers, never as formatted strings.
- Transaction `type`: `0` is an expense and `1` is an income.
- When a relationship is stored on both sides, update both.
- Never log documents, personal data or attachment contents.

### 6.4 Safe startup and migrations

Foreground and background startup both use `initializeLocalDatabase`
([safe-startup.ts](src/data/database/safe-startup.ts)). It does the following:

1. Saves a full SQLite snapshot (`storage-recovery/before-vN.sqlite`) before
   any upgrade. Existing checkpoints are never overwritten.
2. Checks integrity with `quick_check` and validates the version and document.
3. Migrates inside one exclusive transaction, keeping the original JSON in
   `app_migration_snapshots`.
4. Uses `app_storage_identity` to remember whether a profile was ever created,
   so an empty document is never mistaken for a new install.

If any step fails, the app shows the **storage recovery screen**. It
**never** resets to defaults.

### 6.5 Plutus AI in one paragraph

A question goes through `resolveIntent`, which picks the language, intent,
tool packs and period. The selected read-only tools (`runChatTools`) build an
`EvidenceBundle`, and the model writes its answer from that evidence only. To
change data, the model can only call `prepare_change`. That creates a dry-run
`ChangeProposal`, which the user reviews in a card. Only the user's confirm tap
calls `ProposalStore.execute()`, which applies the change through the app's
normal domain functions. Details are in
[docs/local-ai-architecture.md](docs/local-ai-architecture.md).

### 6.6 No backend, ever

Don't add API calls, remote databases, authentication, analytics or crash
uploads. The app makes only two network requests: the public exchange-rate
lookup (which sends only a currency code) and the pinned Hugging Face model
download. `_local.cloudProvider` is reserved for a future optional Google Drive
backup and must stay `null`.

---

## 7. Common development tasks

### Add a screen

1. Build the screen in `src/features/<area>/<name>-screen.tsx`.
2. Add a thin route file in `src/app/…`. Typed routes are enabled, so `href`
   values are type-checked.
3. Reuse the shared UI in `src/shared/ui/` (`TabPage`, `PageHeader`,
   `GlassSegmentedControl`, `AppBottomSheet`, `AppModal`, `AppAlert` and more).
   Follow the layout guides in `docs/`:
   [glass selector](docs/bottom-glass-selector-guide.md),
   [bottom action gradient](docs/bottom-action-gradient-guide.md) and
   [sticky header](docs/sticky-top-selector-header-guide.md).
4. Use `AppAlert` rather than React Native's `Alert.alert`.
5. Add every user-facing string to **all three** locales (see below).

### Add or change a selector

Add it to `src/data/selectors/`, keep it pure (document in, view model out) and
add a test in `tests/`. The AI tools reuse the same selectors, so a fix there
fixes both the UI and the AI.

### Add a translation string

Strings live in `src/localization/locales/en.ts`, `he.ts` and `ru.ts`, and in
the namespace files `onboarding.ts`, `recurring.ts` and `local-ai.ts`.
`tests/localization.test.cjs` checks that all catalogs have the same keys, so
add the key to every language. Hebrew is right-to-left. Check the layout with
the app set to Hebrew.

### Change the persisted schema

Follow [AGENTS.md → Schema Migrations](AGENTS.md) exactly:

1. Increase `LOCAL_SCHEMA_VERSION` in
   [backup-document.ts](src/data/model/backup-document.ts).
2. Increase `DATABASE_VERSION` in [migrations.ts](src/data/database/migrations.ts).
3. Add a **forward-only** migration that keeps user data and unknown data.
4. Give new optional fields defaults in `normalizeBackupDocument`.
5. Update `createDefaultBackup` for new installs.
6. Add selectors and backup round-trip tests, and make sure
   `tests/onboarding-migrations.test.cjs` passes.

Never use `DROP TABLE`, `DELETE`, `INSERT OR REPLACE`, default replacement or
bulk collection rebuilding in an upgrade. Don't change a migration that has
already shipped. Don't change the database name, its path, or the bundle ID
`com.plutus.budgettracker`.

### Add a Plutus AI tool

1. Add a catalog entry (name, pack, accepted arguments, one-line guide) in
   [tools/tool-catalog.ts](src/features/local-ai/tools/tool-catalog.ts).
2. Implement it as `(ToolContext, args) => ToolOutput` in the matching
   `tools/*-tools.ts` pack file. It must be read-only.
3. Register it in `TOOL_RUNNERS` in
   [chat-tools.ts](src/features/local-ai/chat-tools.ts).
4. Run `npm test`. The capability test fails if a catalog entry has no runner
   or if a tool changes the document.

### Work on the native module

`modules/plutus-local-ai` is a local Expo module that Expo autolinking picks
up automatically. After you edit Kotlin or Swift code, rebuild the native app
(`npx expo run:android` / `run:ios`). Metro reload doesn't pick up native
changes. When you update a model, keep the size, SHA-256 hash and URL in
`LocalAIModelStore.kt`, `LocalAIModelStore.swift` and
[model-compatibility-policy.ts](src/features/local-ai/model-compatibility-policy.ts)
in sync.

### Attachments

Always call `persistAttachment(sourceUri, mimeType)` before you store an image
reference, because picker URIs can point to temporary files. Store the returned
`relativePath`, and add the manifest to `_local.attachments` in the same
change. Use `getAttachmentFile(relativePath)` to resolve a file. Never build
paths by hand.

---

## 8. Testing

### Unit and integration tests

```bash
npm test                                       # all tests
node --test tests/recurring.test.cjs           # one file
node --test --test-name-pattern="CSV" tests/*.test.cjs   # filter by name
```

How the suite works:

- Tests are plain CommonJS files (`tests/*.test.cjs`) that run with Node's
  built-in `node:test` runner. There is no Jest.
- Each test file registers a `.ts` loader that transpiles `src/` modules with
  the `typescript` package and resolves `@/…` imports. Tests import the real
  domain code directly.
- Database tests use **`node:sqlite`** (`DatabaseSync`) with an adapter that
  imitates the `expo-sqlite` API, so migrations and the repository run against
  a real SQLite engine.
- UI tests check component source and layout logic. They don't render native
  views.

What is covered (selection):

| File | Coverage |
| :-- | :-- |
| `onboarding-migrations.test.cjs` | 85 randomized datasets across all historical versions, failure injection at every migration write, retries and rejection of unknown layouts |
| `onboarding-flow.test.cjs` | Fresh setup, validation, restart, double taps, staged restore and rollback |
| `recurring.test.cjs` | Calendar anchors, daylight saving, catch-up, skips, missing rates, concurrency and SQLite rollback |
| `transaction-conversion.test.cjs` | Multi-currency snapshots and account and profile amounts |
| `accounts.test.cjs`, `budgets.test.cjs`, `categories.test.cjs`, `transactions.test.cjs` | Domain rules and cascades |
| `reports.test.cjs`, `search.test.cjs`, `home-*.test.cjs` | Selectors and screen data |
| `local-ai-*.test.cjs` | Tool registry, profile isolation, evidence audit, intents in all three languages, the proposal lifecycle and voice parsing |
| `localization.test.cjs` | Matching keys across en, he and ru |

### Generated device-test fixture

Two tests read `test-data/plutus-device-test-2026-09.json`. This file is
**generated** and isn't committed. Create it before you run the whole suite:

```bash
node scripts/generate-device-test-backup.cjs        # English (default)
node scripts/generate-device-test-backup.cjs he     # Hebrew variant
node scripts/generate-device-test-backup.cjs ru     # Russian variant
```

The generator is deterministic. It checks its output with the app's own
validators, CSV round trip and balance reconstruction, and writes a
`-summary.json` report with a SHA-256 checksum.

### Static checks

```bash
npx tsc --noEmit
npm run lint
npx expo-doctor
```

### Production bundle exports

These catch Metro and bundling errors without building a native app:

```bash
npx expo export --platform android --output-dir /tmp/budget-manager-android
npx expo export --platform ios     --output-dir /tmp/budget-manager-ios
```

If your system doesn't allow writing to `/tmp`, use `.artifacts/` (it's
ignored by git). On Windows, use `npx.cmd` if PowerShell blocks `npx.ps1`.

### Device testing

Node tests can't check native behavior. For UI, storage, background tasks,
notifications and AI changes, also test on real devices:

- Test light and dark themes, Hebrew right-to-left layout, Android gesture and
  three-button navigation, and iOS safe areas.
- Use the checklist in
  [docs/device-test-backup-guide.md](docs/device-test-backup-guide.md).
- **Test upgrades:** install the previous signed build, create data with
  attachments, then install the new build **over it without uninstalling**.
  Check that profiles, balances, relationships, preferences and media survive.
- Test Plutus AI and voice in a release build on a physical arm64 device.
- Never clear a real user's app data to test onboarding. Use a separate device
  or simulator.

---

## 9. Building release binaries

### Android APK (local)

```bash
npx expo prebuild --platform android --no-install
cd android
./gradlew assembleRelease -PreactNativeArchitectures=arm64-v8a
adb install -r app/build/outputs/apk/release/app-release.apk
```

On macOS with Homebrew, you may need to set the toolchain paths explicitly:

```bash
JAVA_HOME=/opt/homebrew/opt/openjdk@17 \
ANDROID_HOME=/opt/homebrew/share/android-commandlinetools \
./gradlew assembleRelease -PreactNativeArchitectures=arm64-v8a
```

For a Play Store bundle, use `./gradlew bundleRelease`. Keystores (`*.jks`) and
other signing files are ignored by git. **Never commit them.**

### iOS

```bash
npx expo prebuild --platform ios
open ios/Plutus.xcworkspace   # choose a team, then Product → Archive
```

Or build a release on a connected device with
`npx expo run:ios --configuration Release --device`.

### Release rules

- Keep the application ID / bundle identifier **`com.plutus.budgettracker`**.
  Changing it creates a separate app sandbox, and users would lose access to
  their data.
- Keep the same signing identity and increase platform build numbers for each
  release.
- EAS Build and Submit can be used as well. See the skills in
  [.agents/skills/](.agents/skills/) (`eas-app-stores`, `expo-dev-client`, …).

---

## 10. Validation checklist before a pull request

Copy this list into your pull request description and tick what applies:

```markdown
- [ ] `npm test` passes (after generating the device-test fixture)
- [ ] `npx tsc --noEmit` passes
- [ ] `npm run lint` passes
- [ ] `npx expo-doctor` passes
- [ ] `npx expo export` succeeds for android and ios
- [ ] New strings added to en, he and ru
- [ ] Checked in light/dark themes and Hebrew RTL (UI changes)
- [ ] Tested on a physical device (native / AI / background changes)
- [ ] Storage changes: both version constants increased, forward-only migration,
      normalizer defaults, round-trip tests, AGENTS.md rules followed
- [ ] Backup codec changes: Paisa fixture, JSON media stripping, CSV quoted fields,
      ZIP attachment round trip, unsafe ZIP paths and missing attachments tested
- [ ] No network calls, logging of personal data or new persistence stores added
```

---

## 11. Git workflow and pull requests

1. Sync with upstream before you start:
   ```bash
   git fetch upstream
   git checkout main && git merge upstream/main
   ```
2. Create a focused branch: `feature/<short-name>`, `fix/<short-name>` or
   `docs/<short-name>`.
3. Keep commits small, with clear messages in the imperative mood
   ("Add budget rollover preview", not "changes").
4. Match the surrounding code style. Prettier with the Tailwind plugin and the
   Expo ESLint config are the reference. Keep route files thin and domain logic
   pure and testable.
5. Open the pull request against **`main`**. Describe the problem, the solution
   and how you tested it, and add screenshots or recordings for UI changes.
6. Keep one topic per pull request. Big refactors should start as an issue for
   discussion.

### Reporting bugs

Open a GitHub issue with the platform and OS version, device model, app
version, steps to reproduce, and what you expected compared with what happened.
**Never attach real backups or screenshots that show personal financial
data.** Use the fictional datasets in `test-data/` instead.

---

## 12. Troubleshooting

| Problem | Fix |
| :-- | :-- |
| App crashes on start in Expo Go | Expo Go isn't supported. Use `npx expo run:android` / `run:ios`. |
| iOS build fails in `ExpoModulesJSI` with Xcode 26 | Run `npm install` again so the postinstall patch is applied, then `npx expo prebuild --clean`. |
| Android: voice or AI engine has no audio backend | Make sure `scripts/patch-litert-lm.cjs` ran (reinstall), then rebuild the native app. |
| Native changes don't appear | Rebuild the native app; Metro reload only updates JavaScript. |
| Styles or theme tokens are stale | `npx expo start --clear` |
| Two tests fail with `ENOENT … plutus-device-test-2026-09.json` | Run `node scripts/generate-device-test-backup.cjs`. |
| `node:sqlite` not found | Upgrade Node to 22.13 or newer. |
| Plutus AI says the device is unsupported | It needs a physical arm64 device, at least 4 GB of RAM and enough free storage. Simulators are rejected on purpose. |
| Storage recovery screen appears | Don't clear the app data. Export the recovery archive from that screen and report the issue. |
| Windows: CMake or Ninja rebuilds forever | Already handled by `plugins/with-local-ai-android-ndk.js`. Keep the repository in a short path. |

To debug AI voice in a release build, check logcat for the `HybridLiteRTLM`
tag and follow the steps in
[docs/local-ai-architecture.md §10](docs/local-ai-architecture.md).

---

## 13. Contact

| | |
| :-- | :-- |
| <img src="assets/alexander-aluf.jpg" alt="Alexander Aluf" width="56" /> | **Alexander Aluf**, creator<br />✉️ [alexacdem@gmail.com](mailto:alexacdem@gmail.com) · 🌐 [alexanderaluf.com](https://alexanderaluf.com) |
| <img src="assets/project-aurora.jpg" alt="Project Aurora LTD" width="56" /> | **Project Aurora LTD**, collaborator<br />✉️ [projectaurora@orrora.com](mailto:projectaurora@orrora.com) · 🌐 [beznest.com](https://beznest.com) |

Thank you for helping make Plutus better. 💙
