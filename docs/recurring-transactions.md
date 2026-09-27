# Recurring transactions

Open **Profile → Recurring**. The list, calendar, editor and detail routes live
under `src/app/recurring/`. The editor and bottom controls follow the three
existing layout guides and reuse the shared glass selector.

## Records and scheduling

Schema/SQLite version 16 adds optional recurring settings and an occurrence
ledger to the existing `recurrings` collection. Imports retain unknown fields;
automatic recording and reminders default to off. Unrecognized imported
schedules require editing before they can run.

Each schedule keeps its original amount, currency, local wall time, frequency,
end date, owner and related records. Daily, weekly and fortnightly frequencies
advance calendar days. Monthly, quarterly, biannual (six months) and yearly
frequencies advance from the original anchor, clamping to the month's final
day without drifting in later months. Times follow the device's local time,
including daylight-saving changes. End dates are inclusive.

The cursor points to the next unresolved occurrence. Process is allowed only
at or after that occurrence's date and time. Skip advances one occurrence
without recording a transaction. Archive pauses recording; reactivating a
schedule retains its cursor and catches up any unpaid occurrences. Deleting a
schedule preserves previously recorded transactions. Changing its start or
frequency after recording history requires a start after the last resolved
occurrence; previous history is retained under its original schedule revision.

The transaction, balance effect, relationship references and occurrence ledger
commit together. Stable occurrence keys and an expected-record check prevent
duplicate recording and committing an obsolete rate lookup after an edit.
Both foreground and headless writes read the latest document inside an
exclusive SQLite transaction. SQL contention fails safely and is retried on a
later check.

## Conversion and totals

At recording time the existing public exchange-rate service supplies a table
for the original subscription currency. Only the public currency code is sent.
Records remain in SQLite; there is no backend or remote persistence.

The transaction amount uses the owner's current main currency. The account
amount is converted independently to its own currency, avoiding intermediate
rounding errors. The transaction also preserves the original subscription
amount, currency, rate, source, rate date, retrieval time, scheduled date and
actual recording time. These snapshots appear in transaction details and
survive backup round trips and schedule deletion.

For a missed payment, the transaction date is the scheduled date, while the
rate is the latest table available at processing time. Its actual date is
shown; it is never labeled as the historical scheduled-date rate. A table
retrieved today can be reused offline. Without a suitable table or currency
pair the occurrence remains pending, other valid payments continue, and the
Recurring screen displays an error.

Due this month sums unresolved **expenses scheduled within the current local
month**, including later dates in that month. Earlier-month arrears remain on
the Due tab but are not counted as this month's obligations. Monthly averages
and total yearly are annualized active-schedule estimates (365 daily, 52
weekly, 26 fortnightly, 12 monthly, 4 quarterly, 2 biannual, 1 yearly), grouped
by original currency. They are not netted across currencies. Calendar totals
include pending and processed occurrences and exclude skipped ones.

## Background checks and reminders

The root data provider checks after hydration, every minute while running,
and after refreshing on foreground entry. The headless Expo BackgroundTask
worker requests a 60-minute minimum interval. Foreground runs process up to
200 occurrences; background runs process up to 100, persisting progress so the
next run resumes. An unavailable rate blocks only that schedule in the run.

Background execution needs a rebuilt native/development app. Expo Go cannot
exercise this workflow fully. Android/iOS choose actual execution times;
force-stopping, battery restrictions and disabled background activity can
pause execution. Reopening the app catches up. Clearing cache does not remove
the app-private SQLite document; clearing application storage does.

Optional local reminders are off by default and unavailable in Expo Go. The
notification module is loaded lazily only in a native build, so its push-token
initialization cannot interrupt Expo Go route loading. Selecting a reminder requests the
phone's notification permission. The nearest 48 next-occurrence reminders are
scheduled with the OS and reconciled after local changes and background runs.
Process, Skip, edits, archives and deletes cancel obsolete reminders. Expired
reminders are not replayed. No push tokens or push service are used.

Expo references:

- https://docs.expo.dev/versions/v57.0.0/sdk/background-task/
- https://docs.expo.dev/versions/v57.0.0/sdk/task-manager/
- https://docs.expo.dev/versions/v57.0.0/sdk/notifications/

## Validation

`tests/recurring.test.cjs` covers calendar anchors and DST, overdue catch-up,
manual/future/archived exclusions, skips, missing rates, immutable conversion
snapshots, concurrent processing and edits, bounded runs, monthly totals,
inclusive end dates, backup round trips and SQLite rollback.

Native follow-up requires a connected device: review list/calendar/editor in
both themes; test all selectors, scrolling/blur, keyboard and safe areas;
schedule a near-term payment with and without automatic recording; verify
Process/Skip and reminder permissions; reopen after missed payments; test the
background worker in a native build. Production exports alone do not verify
those behaviors.
