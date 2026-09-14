# Expo HAS CHANGED

Read the exact versioned docs at https://docs.expo.dev/versions/v57.0.0/ before writing any code.

# Local-First Data Architecture

Before changing startup, persisted schemas, database paths, or profile creation,
read `docs/storage-upgrades.md`. Never treat unreadable/missing established data
as a fresh installation. Foreground and background startup must use
`initializeLocalDatabase`, retain pre-upgrade checkpoints, and stop for recovery
on unsupported layouts. Production defaults contain only base categories;
demo generation requires explicit onboarding. New migrations must retain the
independent `app_storage_identity` guard and pass the onboarding/migration tests.

This application has no backend. Do not add API calls, remote databases,
authentication servers, analytics uploads, or network persistence. Every user
record must work offline and remain on the device.

Google Drive may become an optional backup destination later. Do not implement
Google Drive now. Keep backup generation independent from its destination so a
future adapter can upload the same generated files. `_local.cloudProvider` is
reserved for that integration and must remain `null` until then.

## Source of Truth

The canonical state is one versioned `BackupDocument` stored in SQLite:

- Schema: `src/data/model/backup-document.ts`
- Default data: `src/data/model/default-backup.ts`
- Validation/normalization: `src/data/model/normalize-backup.ts`
- SQLite migration: `src/data/database/migrations.ts`
- Atomic repository: `src/data/database/document-repository.ts`
- React access: `src/data/local-data-provider.tsx`
- Attachments: `src/data/attachments/attachment-store.ts`

SQLite stores one JSON document in `app_document` with `id = 1`. SQLite uses WAL
mode and commit-first serialized writes. Images and binary attachments are files
under the app-private documents directory; the JSON document stores their
relative paths and metadata in `_local.attachments`.

Never use component state, fixture files, AsyncStorage, module globals, or cache
files as the authoritative record store. Component state is acceptable only for
temporary UI state such as an open dialog, draft input, or selected filter.

## Provider Boundary

The root provider order in `src/app/_layout.tsx` is intentional:

1. `SQLiteProvider` opens `budget-manager.db` and runs migrations.
2. `LocalDataProvider` hydrates the canonical document.
3. Feature providers, such as `ProfileProvider`, derive and mutate records
   through `LocalDataProvider`.
4. Routes render only after hydration finishes.

Code that calls `useLocalData()` must render under `LocalDataProvider`. Do not
open additional database connections from feature components.

## Reading Records

Use `const { document } = useLocalData()` inside React code. Derive view models
with selectors in `src/data/selectors/document-selectors.ts`. Add a selector
when a screen needs a new projection; do not duplicate parsing rules inside UI
components.

The canonical collections are listed in `BACKUP_COLLECTION_KEYS` and include:

`transactions`, `accounts`, `assets`, `budgets`, `billSplitters`,
`billParticipants`, `categories`, `goals`, `loans`, `recurrings`, `labels`,
`places`, `peoples`, `users`, `images`, `templates`, `achievements`, and
`exchangeRates`.

Imported backups may contain additional top-level fields. Preserve unknown
fields and collections. Never rebuild an imported document by selecting only
fields currently understood by the UI.

## Writing Records

All mutations must go through `useLocalData()` and must be awaited.

Use `upsertRecord(collection, record)` for a single create or update. Every
record requires a stable `uuid` or `id`:

```tsx
const { upsertRecord } = useLocalData();

await upsertRecord("transactions", {
  uuid: generatedUuid,
  name: "Coffee",
  amount: 4.5,
  type: 0,
  createdAt: new Date().toISOString(),
  updatedAt: new Date().toISOString(),
  account: accountId,
  category: categoryId,
  user: profileId,
  tags: [],
});
```

Use `removeRecord(collection, uuidOrId)` for deletion.

Use `updateDocument(current => next)` when one user action changes multiple
collections or relationships. The updater receives a deep clone. Return a new
document and preserve all unrelated keys:

```tsx
await updateDocument((current) => ({
  ...current,
  accounts: current.accounts.map((account) =>
    account.uuid === accountId
      ? { ...account, amount: nextAmount, updatedAt: now }
      : account,
  ),
  transactions: [...current.transactions, transaction],
}));
```

Use `replaceDocument(document)` only for a validated full restore. Never mutate
`document` directly and never write SQL from feature components. The provider
normalizes, queues, and commits each mutation before updating React state.

## Record Integrity

When creating or editing data:

- Generate and retain stable UUIDs. Never use array indexes as persisted IDs.
- Store ISO-8601 timestamps in `createdAt` and `updatedAt`.
- Preserve relationship IDs (`user`, `account`, `category`, `budget`, etc.).
- Update both sides of denormalized relationships when the format requires it.
- Store money as finite numbers in the record currency; never formatted strings.
- Keep transaction `type` compatible with the backup format: `0` is expense and
  `1` is income in current selectors.
- Await writes and show an error when they fail. Do not report success before the
  returned promise resolves.
- Do not log complete backup documents, personal data, or attachment contents.

## Schema Migrations

When persisted structure changes:

1. Increment `LOCAL_SCHEMA_VERSION` in `backup-document.ts`.
2. Increment the SQLite `DATABASE_VERSION` in `migrations.ts`.
3. Add a forward-only migration that preserves user and unknown imported data.
4. Update `normalizeBackupDocument` to default newly optional fields.
5. Update `createDefaultBackup` for new installations.
6. Add or update selectors and backup round-trip tests.

Never silently replace an existing user document with defaults. A migration may
seed missing defaults only when it can identify the original development seed
and must not overwrite imported data.

## Attachments

Image-picker and document-picker URIs can point to temporary cache files. Before
storing a reference, call `persistAttachment(sourceUri, mimeType)`. Store the
returned `relativePath` in the owning record and append the returned manifest to
`document._local.attachments` in the same logical mutation.

Resolve stored files with `getAttachmentFile(relativePath)`. Never construct
attachment paths manually or persist absolute sandbox paths in backup records.

For restore, use the staged flow:

1. Validate and parse the entire archive.
2. `stageAttachments(files)`.
3. Commit the document with `replaceDocument`.
4. `commitStagedAttachments()`.
5. On any failure, `discardStagedAttachments()` and restore the previous
   document.

Keep path traversal checks, archive size limits, file count limits, individual
file limits, and missing-manifest validation intact.

## Backup Formats

Backup implementation lives in `src/data/backup/`.

### ZIP

Call `exportBackup(document, "zip")` for a full restorable backup. ZIP contains
`backup.json` and every manifest attachment under `attachments/`. Export must
fail if a declared attachment is missing; never create a silently incomplete
full backup.

### JSON

Call `exportBackup(document, "json")` for a restorable data-only backup. JSON
preserves records and unknown fields but intentionally strips image/attachment
references and clears attachment manifests.

### CSV

Call `exportBackup(document, "csv")` for spreadsheet transaction export. CSV is
not a full application backup. Import merges transactions by UUID and preserves
unrecognized transaction fields through the `extra` column. Use `papaparse`; do
not hand-roll CSV parsing or quoting.

### Import

Call `pickAndImportBackup(currentDocument)` to select ZIP, JSON, or CSV. It
returns a validated `ImportedBackup` and does not commit it automatically.

- ZIP and JSON replace the canonical document after explicit user confirmation.
- ZIP also restores attachments through the staged flow above.
- JSON clears local attachments because media is absent by contract.
- CSV merges transactions and leaves all other collections untouched.
- Future unsupported backup versions must be rejected, not guessed at.

The settings implementation in
`src/features/profile/components/backup-management.tsx` is the reference import
and export flow. Keep destructive restore confirmation and error reporting.

## Backup Compatibility

The document is compatible with Paisa-style backup version 3 JSON. Keep every
known collection and preserve unknown keys. `normalizeBackupDocument` is the
only entry point for untrusted JSON. Do not cast imported JSON directly to
`BackupDocument`.

## Required Validation

For storage or backup changes, run at minimum:

```sh
npx tsc --noEmit
npx expo-doctor
npx expo export --platform android --output-dir /tmp/budget-manager-android
npx expo export --platform ios --output-dir /tmp/budget-manager-ios
```

Also validate the supplied Paisa fixture, JSON media stripping, CSV quoted-field
round trip, ZIP attachment round trip, unsafe ZIP path rejection, and missing
attachment rejection whenever those codecs change.
