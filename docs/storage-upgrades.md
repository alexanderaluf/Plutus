# Storage upgrades and first launch

The production default document contains the 18 base categories and empty record
collections. No profile, account, transaction or budget is created automatically,
including in development. Demo generation is an explicit setup choice. The old
development dataset exists only in `tests/fixtures/legacy-development-backup.ts`.
Never import that fixture into application code.

## Setup contract

`getSetupStatus` distinguishes an empty installation, an existing profile and a
document requiring recovery. A populated or unrecognized document without a
usable profile requires recovery. It must never be replaced with a new user.

Fresh/demo setup collects language, both backup acknowledgements, profile name,
currency, date format, financial-month start and week start as temporary drafts.
`completeSetup` validates all values and commits the profile, preferences and any
explicitly requested demo records in one awaited repository mutation. An app
restart before completion repeats setup without leaving partial user records.

Restoring a ZIP/JSON containing a usable profile resumes that profile directly
after confirmation. A CSV cannot restore a profile and is imported later through
Settings. Base categories are added without replacing restored categories, UUIDs,
numeric IDs, unknown fields or existing preferences. ZIP/JSON restore keeps the
setup gate mounted until staged attachments commit; failure rolls the document
back. Existing staged-restore crash limitations still apply: the document and
filesystem are separate systems, not a cross-system transaction.

Date preferences format transaction dates and the transaction editor. New monthly
budgets inherit `monthStartDay`; existing explicit budget periods are preserved.
The recurring calendar uses `weekStartDay`. Other calendar-month reports retain
their existing periods. Future features should read `selectAppPreferences`, not
invent independent preference stores. Dates 29–31 clamp to shorter month ends.

## Upgrade protection

The stable database name is `budget-manager.db`. Its canonical row remains
`app_document.id = 1`. Version 17 upgrades the existing versions 1–16 through the
additive document normalizers. Old development reseeding has been retired: sample
UUIDs do not prove that a record is untouched or disposable.

Both foreground and background entry points use `initializeLocalDatabase`:

1. A stable app-private `storage-recovery/installation-established` marker detects
   accidental changes to the SQLite filename/path on later releases.
2. Before upgrading a populated database, `serializeAsync` saves the complete
   SQLite database to `storage-recovery/before-v17.sqlite` through a staged file.
   This includes committed WAL data and unknown SQL tables. Never copy only the
   live `.db` file: recent committed data can reside in its WAL.
3. SQLite `quick_check`, version checks and document validation must pass. A
   missing canonical table/row in established storage, malformed collections,
   unknown layout, future schema or missing profile stops startup.
4. The migration saves the original JSON in `app_migration_snapshots` and applies
   document changes, identity metadata and `PRAGMA user_version` inside one
   exclusive transaction. Any failure rolls back all of them, including DDL.
5. `app_storage_identity` independently remembers whether a profile was created.
   Replacing just the JSON with pristine defaults cannot silently restart setup.
   Profile creation and this guard update commit together. An explicitly confirmed
   demo reset, last-profile deletion or validated full restore can change the guard
   through the repository. Last-profile deletion resets to the categories-only
   production document and must use the explicit full-document write path.
6. The recovery screen exports SQLite snapshots plus available attachment files
   as a recovery archive. This is a support/recovery artifact, not the ordinary
   `backup.json` ZIP import format. A failed upgrade never deletes existing files.

Snapshots are local and are not uploaded. They are not a substitute for the user's
exported backups and may represent an older state. Attachment bytes are not
duplicated at every schema upgrade; migrations must leave attachment paths and
files intact unless they include a separately staged, reversible conversion.
Do not automatically restore an old checkpoint over newer committed records.

## Rules for human and AI contributors

- Never catch storage/parse/migration errors and return `createDefaultBackup()`.
  That hides data loss as a successful first launch. Surface recovery instead.
- Never seed based on `users.length === 0` alone. Check hydration, document
  contents and the independent identity guard. Never bypass the setup gate with
  fixture profiles or index-based persisted user IDs.
- Keep the database name, its location, attachment directories and installation
  marker paths stable. A rename requires an explicit tested discovery/move
  migration that reads the previous location before creating anything new.
- Keep the Android application ID and iOS bundle identifier fixed at
  `com.plutus.budgettracker` across store releases. Changing either creates a
  different app sandbox. Preserve signing identity and use increasing platform
  build numbers. An uninstall or clear-data operation removes local storage;
  schema migrations cannot recover it.
- Increment both `DATABASE_VERSION` and `LOCAL_SCHEMA_VERSION` for persisted
  structure changes. Preserve every historical input shape, unknown field and
  relationship. Do not derive defaults from a live demo generator.
- Add a version-specific converter for renamed tables, columns, collections or
  profile IDs. Do not guess new semantics from similar field names. Unknown
  layouts must stop safely until a compatible converter is shipped.
- Preserve stable UUIDs, amount/currency meaning and timestamps. Update every
  relationship when a documented converter changes IDs. Verify record counts,
  values and references before advancing the version.
- Keep migration checkpoints until an explicit retention policy is designed.
  Never overwrite the pre-upgrade checkpoint on retries. A disk-full error must
  stop the migration before changing user data.
- Never modify a previously shipped migration in a way that drops or reseeds
  records. No `DROP TABLE`, `DELETE`, `INSERT OR REPLACE`, default replacement or
  bulk collection reconstruction in an upgrade without a proven reversible
  conversion and preservation tests. Version 17 intentionally removes earlier
  development-only reseeding paths because they could overwrite edits.
- Use the same guarded startup for background tasks. Otherwise an updated
  background job can initialize the wrong database before the foreground checks it.
- Do not log documents, financial fields or attachment contents. Recovery exports
  contain private data and must be explicitly saved/shared by the user.

## Automated and device validation

Run `node --test tests/*.test.cjs`, `npx tsc --noEmit`, `npx expo-doctor`, and
production exports for Android and iOS. On Windows, use `npx.cmd` if execution
policy blocks `npx.ps1`. Output directories may be placed under `.artifacts/` when
the operating system does not grant write access to `/tmp`.

The onboarding tests cover empty production installation, field validation,
deferred/failed commits, restart, double taps, confirmation, staged restore and
rollback, demo references, base-category merge, all preference round trips, date
and payday boundaries, and an independent identity guard.

The migration tests run 80 reproducible randomized datasets across all 16
historical versions. They reconstruct SQLite tables with reordered/extra columns,
preserve unknown tables and JSON, inject a failure at each migration write, retry,
and reopen the database. Unknown table/column renames, damaged JSON, future
versions and missing users/rows are rejected without reseeding. A real SQLite
online backup verifies that the checkpoint can be reopened and retains unknown
tables. Expo filesystem/serialization calls are adapter-tested in Node; these
tests do not execute native Expo APIs.

Before a store release, install the previously shipped signed app on physical
Android and iOS devices, create multiple users and records with attachments,
export a reference backup, and install the candidate **over it without uninstalling**.
Verify profiles, UUIDs, money, currencies, relationships, preferences and media.
Repeat with a cold start, an interrupted upgrade, low storage, an imported Paisa
backup, Hebrew RTL, and a background-task-first launch. Verify fresh setup separately
on an empty simulator or test device. Never clear a real user's installation to
test onboarding. Restore an exported backup into a separate test installation and
compare it with the original. Node tests cannot prove store-signing continuity,
native filesystem behavior, or arbitrary future schema semantics.

Expo SDK references used for this implementation:
[SQLite v57](https://docs.expo.dev/versions/v57.0.0/sdk/sqlite/) and
[SDK v57](https://docs.expo.dev/versions/v57.0.0/).
