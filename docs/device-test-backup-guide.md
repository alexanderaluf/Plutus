# Plutus comprehensive device-test backup

Import **`test-data/plutus-device-test-2026-09.json`**. This is a fictional dataset
modeled on `plutus-2026-09-15T07-07-22-246Z.json`, using Paisa-compatible backup
version 3 and Plutus local schema 17. The selected profile uses Israeli shekels.

The fixture covers **1 April–16 September 2026**: five complete months plus
September activity. Its baseline timestamp is **16 September 2026, 12:00 in
Asia/Jerusalem**. Dates stay fixed so repeated device tests can start from the
same document.

## Contents

| Records                   | Count and coverage                                                                                                                        |
| ------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------- |
| Transactions              | 1,657 across three profiles; 200 regular personal transactions per month plus recurring payments, transfers, currency and precision cases |
| Budgets                   | 14, each with a different icon and color                                                                                                  |
| Categories                | 107: 28 roots and 79 subcategories, with distinct icons and colors                                                                        |
| Bank accounts             | 2 ILS banks, each linked to exactly 2 credit cards                                                                                        |
| Credit cards              | 4 with different icons, colors, issuers, last four digits and payment days: 5, 10, 20 and 31                                              |
| Other accounts            | Personal savings and cash, a USD freelance wallet and an excluded EUR travel wallet                                                       |
| Recurrings                | 28: 20 monthly subscriptions, 6 other frequencies, 1 archived subscription and 1 pending manual donation                                  |
| Recurring history         | 311 processed payments linked to transactions and 19 skipped occurrences                                                                  |
| Card payment history      | 44 transaction legs representing 22 actual settlements                                                                                    |
| Profiles                  | Personal ILS, freelance USD and travel EUR                                                                                                |
| Selectable relations      | 12 labels, 10 places, 8 people, 2 loans and 12 saved templates                                                                            |
| Additional backup records | 3 assets, 4 goals, 1 bill split with 3 participants and 3 achievements                                                                    |
| Exchange-rate tables      | 8 currency bases using explicitly synthetic fixed rates                                                                                   |

Every income and expense transaction references a valid leaf category of the
matching type. The application derives transaction icons and colors from that
category. Material icons include their actual installed SVG paths. New entity
identities are deterministic UUIDs; recurring and card payment IDs follow the
application's own idempotency conventions.

### Personal transaction counts

| Month                            | Transactions |
| -------------------------------- | -----------: |
| April 2026                       |          271 |
| May 2026                         |          269 |
| June 2026                        |          266 |
| July 2026                        |          269 |
| August 2026                      |          268 |
| September 2026, through the 16th |          242 |

The other two profiles have another 72 transactions combined. All 20 monthly
subscriptions have a processed payment in each complete month, April–August;
September payments are included when due by the baseline.

## Import and reset

1. Export the current device data before using the fixture. JSON restore replaces
   the canonical document after the application's confirmation.
2. In Settings → Backup, choose Import and select
   `plutus-device-test-2026-09.json`. It can also be used by onboarding's restore
   option on a separate test installation.
3. Confirm the restore and verify the selected profile is **QA Personal — ILS**.
4. To repeat a test from the baseline, import the same file again. Do not clear
   app storage to reset a device containing valuable records.

`plutus-device-test-2026-09-summary.json` is a validation report, **not an import
backup**. The backup also embeds counts, profile IDs, opening and expected final
balances, and expected budget totals in `_testDataset`.

## Device test sequence

| Area                   | Checks                                                                                                                                                                                     |
| ---------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Home and scrolling     | Switch all selectors; scroll to hide the header; inspect category icons, recurring cards, budgets, long text and mixed-language notes                                                      |
| Theme and safe areas   | Repeat in light/dark themes, iOS, Android gestures and Android button navigation; use an app-owned Android build to test native contrast settings                                          |
| Reports and history    | Browse each month April–September; compare category/account scopes; confirm transfers do not inflate income or expenses                                                                    |
| Search                 | Search `QA`, `family`, `work`, `weekend`, `subscription`, `refund`, `קניות`, `кофе` and `café`; test results across dates and account/category filters that the screen exposes             |
| Transactions           | Create, edit and delete income, expense and transfer records; change date/account/category; inspect labels, places, people, loans, budgets and templates                                   |
| Precision and currency | Find “one agora” and the USD software purchase; verify ILS 0.01 and USD 49.99 → ILS 184.96 at synthetic rate 3.7; edit/delete and check account effects                                    |
| Categories             | Expand existing and new roots; compare parent totals with child activity; create/edit/reparent/delete a subcategory; try selecting a parent with children in the transaction editor        |
| Accounts and cards     | Verify the two card links per bank; compare bank/card activity; inspect issuer logos, payment dates and outstanding balances; exercise linked-bank edit/delete restrictions                |
| Card settlements       | Inspect paired payment history; cold-start at the same baseline and verify no duplicate payment; advance to the next due date on a test device and check one new settlement per card/month |
| Savings                | Inspect the detailed savings product; exercise contribution, fees, estimated tax and withdrawal calculations; save edits and reopen                                                        |
| Budgets                | Review all 14 scopes, account filters, include-subcategories, manual/automatic modes, rolling totals, month-end cycle and daily/weekly/monthly/yearly/custom periods                       |
| Budget states          | Dining and health are over their caps; groceries and digital subscriptions are below; the daily coffee budget has no baseline spending; July holiday is ended and October holiday upcoming |
| Recurrings             | Inspect 20 subscription histories; navigate the calendar April–September; inspect weekly, fortnightly, quarterly, biannual, yearly and daily schedules, reminders and skipped entries      |
| Recurring actions      | Locate “QA Pending manual donation — Pay or Skip”; pay or skip it, inspect the resulting history, then edit/archive it and verify state after restart                                      |
| Profile isolation      | Switch to QA Freelance — USD and QA Travel — EUR; confirm their transactions/accounts appear without leaking personal transactions; test selected-profile persistence                      |
| Settings               | Change language, theme, accent, date format, financial-month start and week start; restart and verify persistence, formatting and RTL where applicable                                     |
| JSON backup            | Export, restore and compare collection counts, IDs, relationships, recurring history and `_testDataset`; newly exported timestamps can differ                                              |
| CSV                    | Export the large transaction set; verify commas, quoted merchant text, multiline notes and Unicode; reimport and confirm UUID merge avoids duplicate transactions                          |
| ZIP and real media     | Add actual receipts/profile photos on device, export ZIP, restore and check the media; test missing-file/error flows separately                                                            |
| Persistence            | Restart after saves and switches; repeat offline; export and inspect whether edits survived without duplicate recurring or card payments                                                   |

Expected budget totals and account balances are exact fixture baselines in
`_testDataset` and the summary report. UI totals can use display rounding. For
comparison at a later real date, navigate back to the fixture periods where the
screen supports it.

## Scope and limitations

This fixture supplies data for testing; it does not prove the device flows pass.
It intentionally contains no receipt or image file references, because JSON
backups cannot carry binary attachments. Use actual device media and ZIP for
attachment testing.

Assets, goals, loans, bill splits and achievements provide relationship and
backup-preservation coverage. Their presence does not turn placeholder or
unimplemented screens into working features. Similarly, notification permission,
delivery, keyboard behavior and native safe areas require device checks.

All historical card settlements are generated by the existing settlement
function. Restoring at the baseline does not settle cards twice or trigger a
large automatic recurring catch-up. After the baseline, automatic recurring
payments and card settlements can legitimately change the counts and balances.

## Regeneration and validation

Run from the repository root:

```powershell
node scripts/generate-device-test-backup.cjs
```

The generator writes the backup and summary only. Application startup never
imports or seeds this file. It uses the application's category, account, budget,
recurring and transaction validators and card settlement logic, then checks the
real JSON import parser, normalization preservation, unique identities, matching
category types, parent cycles, ownership and references, five paid subscription
months, and distinct entity visuals.

It independently reconstructs every closing account balance from opening
balances and transactions. It also verifies recurring calendar projections,
budget states, transaction edit/delete effects, no duplicated baseline card
settlement, and the complete CSV round trip including all 1,657 transaction IDs.

The summary includes the file size and SHA-256 checksum. Re-running against the
same application models should produce the same JSON bytes and checksum.
