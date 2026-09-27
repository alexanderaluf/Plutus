# Reports data map

Reports reads the hydrated `BackupDocument` from `useLocalData()`. The document is
stored in SQLite's `app_document` row 1; this screen makes no writes or network
requests. This inventory describes the local schema and selectors, not an
inspection of a connected phone's private records.

| Data | Available facts | Report use |
| --- | --- | --- |
| `_local`, `users` | Selected profile and ID aliases, profile currency, month start day, language/date format, amount privacy | Profile scope, salary-cycle boundaries, formatting |
| `transactions` | Stable ID, date/createdAt, type (expense/income/transfer), amount, original/account currency and amount, immutable conversion snapshot, account/category/budget/recurring relationships, name, description, tags, place/person | Actual income, expenses, net flow, daily spending, category shares, selected-category transactions |
| `categories` | ID aliases, parent aliases, name, icon/path, color, type, owner | Parent slices, nested-category breakdown; tolerate missing categories and parent cycles |
| `accounts` | Current balance, currency, kind, exclusion flag, icon/color; card limit/payment day; savings details | Current money location and negative balances, grouped by currency; never presented as historical balances |
| `budgets` | Amount/currency, tracking rules, independent periods/cycle day, carry, category/account filters | Available for budget screens; overlapping limits are not summed into consumption |
| `recurrings` | Schedule, amount/currency, type, account/category, occurrences, next index, archive state | Available commitments; actual posted transactions alone count as consumption |
| `exchangeRates` | Saved quotes and timestamps | Available locally; actual reporting uses immutable transaction conversions, not changing quotes |
| `assets`, `goals`, `loans` | Preserved imported JSON records; transaction loan relationships | No universal valuation contract; do not invent an asset/debt total |
| `billSplitters`, `billParticipants` | Preserved imported bill relationships | Do not double-count these as posted expenses |
| `labels`, `places`, `peoples` | Transaction metadata/relationships | Available context, not separate financial activity |
| `images`, `_local.attachments` | Media metadata and private relative paths | Not financial metrics |
| `templates`, `achievements` | Preserved templates and achievement metadata | Not actual activity |
| Unknown imported fields/collections | Preserved unchanged | Read-only report leaves them intact |

## Calculation boundaries

- Use `financialMonth(now, monthStartDay, offset)`: inclusive start, exclusive end.
  Day 15 means the 15th through the following 14th; short months clamp safely.
- Exclude transfers, excluded accounts, other profiles and future transactions.
- Convert with each transaction's saved conversion. Missing conversions remain
  separate currency reports rather than being added as if they were equivalent.
- Parent category totals include every expense, including unnamed/deleted categories.
  A small-slice remainder retains its member categories and transactions for drilldown.
- Daily buckets use device-local dates, including across daylight-saving changes.
- Account balances are current snapshots, separately labeled and grouped by their
  own currency, even while viewing a historical spending cycle.
- Show facts and short labels only: no health scores, recommendations or forecasts.
