# Application Data Map & Entity Specification

> **Target Audience**: Developers, Data Architects, and On-Device Local AI Engine (**Plutus**)  
> **Canonical Source**: SQLite row `app_document` (`id = 1`) hydrated as `BackupDocument`  
> **Schema Version**: `LOCAL_SCHEMA_VERSION = 20` (Backup Version 3)  
> **Offline Architecture**: 100% Local-First, Zero Backend, Zero Telemetry, Sandboxed Attachments

---

## Table of Contents

1. [Architectural Overview & Data Principles](#1-architectural-overview--data-principles)
2. [Global Settings & App Metadata (`_local`)](#2-global-settings--app-metadata-_local)
3. [User Profiles (`users`)](#3-user-profiles-users)
4. [Accounts (`accounts`) & Specialized Sub-Types](#4-accounts-accounts--specialized-sub-types)
   - [Common Account Schema](#41-common-account-schema)
   - [Bank Accounts (`bank`)](#42-bank-accounts-bank)
   - [Card Accounts (`card`) & Automated Billing](#43-card-accounts-card--automated-billing)
   - [Cash Accounts (`cash`)](#44-cash-accounts-cash)
   - [Savings Accounts (`savings`) & Product Contracts](#45-savings-accounts-savings--product-contracts)
5. [Categories (`categories`) & Hierarchy](#5-categories-categories--hierarchy)
6. [Transactions (`transactions`) & Currency Model](#6-transactions-transactions--currency-model)
   - [Transaction Core Schema](#61-transaction-core-schema)
   - [Multi-Currency Conversion & Snapshots](#62-multi-currency-conversion--snapshots)
   - [Card Settlement Transfers](#63-card-settlement-transfers)
   - [Receipts & Binary Attachments](#64-receipts--binary-attachments)
7. [Budgets (`budgets`) & Consumption Tracking](#7-budgets-budgets--consumption-tracking)
8. [Recurring Schedules (`recurrings`) & Subscriptions](#8-recurring-schedules-recurrings--subscriptions)
9. [Transaction Templates (`templates`)](#9-transaction-templates-templates)
10. [Contextual Metadata Collections](#10-contextual-metadata-collections)
    - [Labels & Tags (`labels`)](#101-labels--tags-labels)
    - [Places (`places`)](#102-places-places)
    - [People & Contacts (`peoples`)](#103-people--contacts-peoples)
    - [Loans & Debts (`loans`)](#104-loans--debts-loans)
    - [Assets & Valuables (`assets`)](#105-assets--valuables-assets)
    - [Financial Goals (`goals`)](#106-financial-goals-goals)
    - [Bill Splitters & Participants (`billSplitters`, `billParticipants`)](#107-bill-splitters--participants-billsplitters-billparticipants)
11. [Currency Exchange Rates (`exchangeRates`)](#11-currency-exchange-rates-exchangerates)
12. [Local AI ("Plutus") Protocol & On-Device Tool Map](#12-local-ai-plutus-protocol--on-device-tool-map)
13. [Derived Metrics, Analytics & Financial Health Rules](#13-derived-metrics-analytics--financial-health-rules)
14. [Data Lifecycle, Cascading Rules & Backup Formats](#14-data-lifecycle-cascading-rules--backup-formats)

---

## 1. Architectural Overview & Data Principles

The application operates as a **Local-First, Zero-Backend** personal finance system designed for mobile devices. All financial data is private, persists strictly on the device, and functions without any active internet connection.

```
+---------------------------------------------------------------------------------+
|                                Mobile Device                                    |
|                                                                                 |
|  +---------------------------------------------------------------------------+  |
|  |                           React Native UI Layer                           |  |
|  |  (Screens: Home, Accounts, Budgets, Categories, Recurring, Reports, AI)    |  |
|  +---------------------------------------------------------------------------+  |
|                                       │                                         |
|                                       ▼                                         |
|  +---------------------------------------------------------------------------+  |
|  |               LocalDataProvider & Document Selectors (React)               |  |
|  |  - Normalizes, validates, queues, and commits mutations                   |  |
|  |  - Derives aggregated read-only views for UI & Local AI                   |  |
|  +---------------------------------------------------------------------------+  |
|                         │                                 │                     |
|                         ▼                                 ▼                     |
|  +-------------------------------------+   +---------------------------------+  |
|  |     SQLite (WAL Mode) Database      |   | Sandboxed File System Storage   |  |
|  |         `budget-manager.db`         |   | `.../Documents/attachments/`    |  |
|  |                                     |   |                                 |  |
|  |  Table: `app_document`              |   | - Receipt photos (JPEG/PNG)     |  |
|  |  Row: `id = 1` -> `BackupDocument`  |   | - Scanned invoices/PDFs         |  |
|  |  (Single JSON source of truth)      |   | - Validated by SHA/Path         |  |
|  +-------------------------------------+   +---------------------------------+  |
|                         ▲                                                       |
|                         │ Read-Only Context                                     |
|  +---------------------------------------------------------------------------+  |
|  |                On-Device Local AI Engine (Gemma 4 E2B LiteRT)             |  |
|  |  - Runs 100% locally via ExecuTorch / LiteRT C++ native module            |  |
|  |  - Reads records via 66 sandboxed read-only tools (packs per question)   |  |
|  |  - Can only PREPARE change proposals; the user confirms every write     |  |
|  |  - Never accesses disk, network, or raw SQL directly                     |  |
|  +---------------------------------------------------------------------------+  |
+---------------------------------------------------------------------------------+
```

### Core Integrity Guarantees

1. **Single Source of Truth**: Persistent data is stored as a single versioned `BackupDocument` JSON object inside SQLite table `app_document` (`id = 1`).
2. **Deterministic Identifiers**: Persisted entities use stable UUIDv4 strings (or legacy numerical/string IDs) in `uuid` or `id`. Array indices are never IDs.
3. **Monetary Precision**: Money is stored as IEEE 754 finite numbers (never pre-formatted strings). Valid ranges enforce `|amount| <= Number.MAX_SAFE_INTEGER / 1000` (~9 trillion).
4. **Time Standards**: Timestamps are stored in ISO-8601 UTC strings (e.g., `2026-09-26T13:50:00.000Z`). Calendar dates without time use `YYYY-MM-DD`.
5. **Preservation of Foreign Schemas**: Unknown fields and collections from imported backups (e.g. Paisa v3 schemas) are preserved verbatim during round-trips.

---

## 2. Global Settings & App Metadata (`_local`)

Application preferences, security toggles, and metadata reside under the `_local` key of the `BackupDocument`.

| Field                       | Data Type              | Permitted Values / Constraints                                                                             | Description                                                                                      |
| :-------------------------- | :--------------------- | :--------------------------------------------------------------------------------------------------------- | :----------------------------------------------------------------------------------------------- |
| `schemaVersion`             | `integer`              | `20` (Current)                                                                                             | Monotonically incremented schema migration guard.                                                |
| `defaultCategoriesRevision` | `integer`              | `1`                                                                                                        | Tracks whether system category seeds have been applied.                                          |
| `exportedAt`                | `string \| null`       | ISO-8601 timestamp                                                                                         | Timestamp when the document was last exported.                                                   |
| `selectedProfileId`         | `string \| null`       | UUID string                                                                                                | Currently active user profile ID.                                                                |
| `appLanguage`               | `string`               | `"en" \| "he" \| "ru"`                                                                                     | UI language. Controls text direction (LTR vs RTL).                                               |
| `themeMode`                 | `string`               | `"system" \| "light" \| "dark"`                                                                            | Color scheme preference.                                                                         |
| `accentColor`               | `string`               | `"cyan" \| "blue" \| "violet" \| "rose" \| "coral" \| "amber" \| "green" \| "lime"`                        | Primary accent brand color across buttons, indicators, and charts.                               |
| `mainCurrency`              | `string`               | ISO 4217 3-letter code (e.g. `"USD"`)                                                                      | Default global fallback currency.                                                                |
| `dateFormat`                | `string`               | `"DD/MM/YY" \| "DD/MM/YYYY" \| "MM/DD/YY" \| "MM/DD/YYYY" \| "YYYY/MM/DD" \| "YYYY-MM-DD" \| "DD.MM.YYYY"` | Display formatting pattern for calendar dates.                                                   |
| `monthStartDay`             | `integer`              | `1` to `31`                                                                                                | Starting day of personal financial/salary month (e.g., `15` calculates cycle from 15th to 14th). |
| `weekStartDay`              | `integer`              | `0` (Sunday) to `6` (Saturday)                                                                             | Anchor day for weekly budget cycles and calendar offsets.                                        |
| `amountsHidden`             | `boolean`              | `true \| false`                                                                                            | Privacy veil toggle: hides/masks all monetary values across screens.                             |
| `aiExitWarningDismissed`    | `boolean`              | `true \| false`                                                                                            | UI preference: suppresses confirmation dialog when leaving local AI chat.                        |
| `onboardingCompletedAt`     | `string \| null`       | ISO-8601 timestamp                                                                                         | Timestamp when initial user setup was completed.                                                 |
| `dataMode`                  | `string`               | `"fresh" \| "demo" \| "restored"`                                                                          | Tracks origin of document data.                                                                  |
| `cloudProvider`             | `null`                 | `null` (Reserved)                                                                                          | Reserved for future optional cloud backup; must remain `null`.                                   |
| `attachments`               | `AttachmentManifest[]` | Array of manifests                                                                                         | Registry of all physical binary files stored on disk.                                            |

### `AttachmentManifest` Object Structure

```typescript
interface AttachmentManifest {
  id: string; // UUID identifying the attachment
  fileName: string; // Original or generated filename (e.g., "receipt_1727340000.jpg")
  mimeType: string; // MIME type (e.g., "image/jpeg", "image/png", "application/pdf")
  relativePath: string; // Relative sandbox path (e.g., "attachments/uuid.jpg")
  size: number; // Size in bytes
}
```

---

## 3. User Profiles (`users`)

The app supports multiple isolated user profiles (e.g., "Personal", "Business", "Family"). Every financial transaction, account, and budget belongs to a specific profile.

| Field            | Data Type          | Constraints                            | Description                                       |
| :--------------- | :----------------- | :------------------------------------- | :------------------------------------------------ |
| `uuid`           | `string`           | Unique UUIDv4                          | Primary unique identifier.                        |
| `id`             | `string \| number` | Optional                               | Legacy compatibility identifier.                  |
| `name`           | `string`           | 1–100 characters                       | Profile display name (e.g., "Alexander").         |
| `currency`       | `string`           | ISO 4217 3-letter code (e.g., `"USD"`) | Base reporting currency for this profile.         |
| `currencyName`   | `string`           | e.g., `"US Dollar"`                    | Full display name of profile currency.            |
| `currencySymbol` | `string`           | e.g., `"$"`, `"₪"`, `"€"`              | Currency prefix or suffix symbol.                 |
| `isSelected`     | `boolean`          | `true \| false`                        | Denotes whether this profile is currently active. |
| `createdAt`      | `string`           | ISO-8601 timestamp                     | Profile creation date.                            |
| `updatedAt`      | `string`           | ISO-8601 timestamp                     | Profile last updated timestamp.                   |

---

## 4. Accounts (`accounts`) & Specialized Sub-Types

Accounts represent stores of value. The application models **4 distinct account categories**: `bank`, `card`, `cash`, and `savings`. Each category possesses unique fields, validation rules, and automated ledger actions.

### 4.1 Common Account Schema

Every account record contains the following foundational fields:

| Field           | Data Type        | Constraints                                       | Description                                                    |
| :-------------- | :--------------- | :------------------------------------------------ | :------------------------------------------------------------- |
| `uuid`          | `string`         | Unique UUIDv4                                     | Account unique identifier.                                     |
| `name`          | `string`         | 1–100 characters                                  | Account title (e.g., "Checking Account").                      |
| `amount`        | `number`         | Finite number                                     | Current ledger balance. Negative for card debts or overdrafts. |
| `accountType`   | `string`         | `"bank" \| "card" \| "cash" \| "savings"`         | Account category.                                              |
| `type`          | `integer`        | `0` (card), `1` (cash), `2` (savings), `3` (bank) | Numeric type code matching `accountType`.                      |
| `currencyCode`  | `string`         | ISO 4217 3-letter code (e.g., `"EUR"`)            | Currency in which the balance is maintained.                   |
| `accountNumber` | `string`         | Arbitrary string                                  | IBAN, account number, or notes.                                |
| `icon`          | `string`         | Non-empty string                                  | Icon key or `"material:<name>"` identifier.                    |
| `iconPath`      | `string \| null` | SVG Path (length <= 20,000)                       | SVG vector path data if using Material vector icon.            |
| `color`         | `string`         | Hex format `^#[a-f0-9]{6}$`                       | Visual display color theme.                                    |
| `isDefault`     | `boolean`        | `true \| false`                                   | If true, automatically preselected in transaction forms.       |
| `isExcluded`    | `boolean`        | `true \| false`                                   | If true, excluded from Net Worth and Reports calculations.     |
| `user`          | `string`         | Profile UUID                                      | Owning profile identifier.                                     |
| `createdAt`     | `string`         | ISO-8601 timestamp                                | Record creation timestamp.                                     |
| `updatedAt`     | `string`         | ISO-8601 timestamp                                | Last modification timestamp.                                   |
| `transactions`  | `string[]`       | Array of UUIDs                                    | Denormalized list of transaction IDs attached to this account. |

---

### 4.2 Bank Accounts (`bank`)

Bank accounts represent checking, deposit, or operational accounts held at a banking institution. They serve as the primary source of funds for settling credit card balances.

- **Additional Bank Fields**:
  - `bankName` (`string`, mandatory): Name of the bank (e.g., `"Bank of America"`, `"Chase"`, `"Leumi"`).

---

### 4.3 Card Accounts (`card`) & Automated Billing

Credit and charge card accounts accumulate negative balances as expenses are charged. They integrate with an automated settlement engine (`settleDueCardPayments`).

- **Additional Card Fields**:
  - `cardLastFour` (`string`, mandatory): Exactly 4 numeric digits (`^\d{4}$`).
  - `cardCompany` (`string`, mandatory): Recognized issuer:
    - `"Visa"`, `"Mastercard"`, `"American Express"`, `"Isracard"`, `"Diners Club"`, `"Discover"`, `"JCB"`, `"UnionPay"`, `"Other"`.
  - `paymentDay` (`integer`, mandatory): Day of month (`1` to `31`) when monthly statement balance is charged.
  - `creditLimit` (`number | null`): Spending limit. Used to calculate credit utilization % in health reports.
  - `linkedBankAccountId` (`string`, mandatory): UUID of a `bank` account owned by the same user from which card payments are debited.
  - `lastPaymentPeriod` (`string | null`): Tracks settlement in `YYYY-MM` format (e.g., `"2026-09"`) to prevent double-charging.

#### Automated Settlement Logic

On app startup, foregrounding, or document mutations:

1. The engine checks if `today >= paymentDay` for month `M`.
2. If `card.amount < 0` and `lastPaymentPeriod < M`:
   - Calculates total outstanding card debt.
   - Converts debt amount to the linked bank account's currency using saved exchange rates.
   - Deducts `bankAmount` from `linkedBankAccountId`.
   - Resets `card.amount` to `0` (or remaining un-settled balance).
   - Generates two linked type `2` (Transfer) transactions:
     - Debit from Bank: `uuid = "card-payment:<cardId>:<period>:bank"`
     - Credit to Card: `uuid = "card-payment:<cardId>:<period>:card"`
   - Updates `card.lastPaymentPeriod = M`.

---

### 4.4 Cash Accounts (`cash`)

Represents physical paper money, coins, wallets, or petty cash envelopes.

- **Fields**: Uses standard common fields. No external institution or settlement link is required.

---

### 4.5 Savings Accounts (`savings`) & Product Contracts

Savings accounts model wealth accumulation vehicles ranging from simple piggy banks to complex retirement accounts and investment portfolios.

- **Additional Savings Fields**:
  - `savingsDetails` (`SavingsDetailsDraft | null`): Embedded specification object.

#### `SavingsDetails` Object Specification

If `isDetailed == false`, it represents a simple savings account holding principal. If `isDetailed == true`, it stores full product parameters:

| Field                         | Data Type        | Options / Constraints                                                   | Description                                                    |
| :---------------------------- | :--------------- | :---------------------------------------------------------------------- | :------------------------------------------------------------- |
| `isDetailed`                  | `boolean`        | `true \| false`                                                         | Toggles detailed financial product mode.                       |
| `productType`                 | `string`         | 14 Standard Types _(see below)_                                         | Legal or commercial product structure.                         |
| `providerName`                | `string`         | Non-empty text                                                          | Fund manager, broker, or bank (e.g., `"Vanguard"`).            |
| `contributionMode`            | `string`         | `"lump_sum" \| "recurring" \| "employer" \| "mixed"`                    | Deposit frequency and source.                                  |
| `contributedPrincipal`        | `number`         | `>= 0`                                                                  | Total baseline principal invested out of pocket.               |
| `monthlyContribution`         | `number`         | `>= 0`                                                                  | Scheduled personal monthly deposit amount.                     |
| `employerMonthlyContribution` | `number`         | `>= 0`                                                                  | Scheduled employer matching deposit amount.                    |
| `expectedAnnualReturnRate`    | `number`         | `0` to `100` (%)                                                        | Projected annual return / interest rate.                       |
| `startDate`                   | `string \| null` | `YYYY-MM-DD`                                                            | Date when account or deposit was opened.                       |
| `maturityDate`                | `string \| null` | `YYYY-MM-DD` (`>= startDate`)                                           | Term completion or lockup expiration date.                     |
| `liquidity`                   | `string`         | `"flexible" \| "notice" \| "locked" \| "retirement"`                    | Withdrawal access rules.                                       |
| `withdrawalNoticeDays`        | `number`         | `0` to `36500`                                                          | Required notice period (mandatory if liquidity is `"notice"`). |
| `annualManagementFeeRate`     | `number`         | `0` to `100` (%)                                                        | Annual AUM fee deducted from balance.                          |
| `contributionFeeRate`         | `number`         | `0` to `100` (%)                                                        | Upfront load fee on new deposits.                              |
| `performanceFeeRate`          | `number`         | `0` to `100` (%)                                                        | Incentive fee on accrued earnings.                             |
| `earlyWithdrawalFeeRate`      | `number`         | `0` to `100` (%)                                                        | Penalty fee assessed if liquidated before maturity.            |
| `taxJurisdiction`             | `string`         | Text (e.g., `"US-IRS"`, `"Israel"`)                                     | Applicable tax authority.                                      |
| `taxTreatment`                | `string`         | `"tax_exempt" \| "flat" \| "progressive" \| "tax_deferred" \| "custom"` | Tax assessment schedule.                                       |
| `taxBasis`                    | `string`         | `"earnings" \| "withdrawal"`                                            | Taxable base: capital gains only vs full balance.              |
| `estimatedTaxRate`            | `number`         | `0` to `100` (%)                                                        | Projected marginal or capital gains tax rate.                  |
| `taxFreeAllowance`            | `number`         | `>= 0`                                                                  | Annual or lifetime tax exemption bucket.                       |
| `notes`                       | `string`         | Arbitrary text                                                          | Policy terms, beneficiary info, contract rules.                |

#### Permitted `productType` Values

1. `fixed_deposit`: Fixed-term certificate of deposit (CD, GIC, Israeli Pakam).
2. `notice_savings`: Cash savings requiring advance notice before withdrawal.
3. `regular_savings`: Flexible standard high-yield savings account (HYSA).
4. `investment_account`: Market-linked brokerage, ETF portfolio, or mutual fund.
5. `provident_fund`: Israeli Kupat Gemel or long-term investment provident scheme.
6. `education_fund`: Israeli Keren Hishtalmut or tax-advantaged medium-term fund.
7. `pension`: Pension fund or retirement annuity contract.
8. `employer_retirement`: Workplace retirement plan: 401(k), 403(b), superannuation.
9. `tax_advantaged`: Roth IRA, Traditional IRA, ISA, TFSA, PEA.
10. `government_bond`: Treasury bill, Series I bond, government savings certificate.
11. `child_education`: 529 College Savings Plan, Junior ISA, RESP.
12. `health_savings`: Health Savings Account (HSA) or FSA.
13. `annuity_insurance`: Insurance-wrapped endowment or executive insurance policy.
14. `other`: Custom savings or wealth product.

#### Mathematical Withdrawal Estimation

The app computes net realizable liquidation value via `estimateSavingsWithdrawal(balance, details)`:
$$\text{Principal} = \min(\text{contributedPrincipal}, \text{balance})$$
$$\text{Earnings} = \max(\text{balance} - \text{Principal}, 0)$$
$$\text{PerformanceFee} = \text{Earnings} \times \text{performanceFeeRate}$$
$$\text{EarlyWithdrawalFee} = \text{balance} \times \text{earlyWithdrawalFeeRate}$$
$$\text{TaxableAmount} = \max((\text{taxBasis} == \text{"withdrawal"} ? \text{balance} : \text{Earnings}) - \text{taxFreeAllowance}, 0)$$
$$\text{EstimatedTax} = \text{taxTreatment} == \text{"tax\_exempt"} ? 0 : \text{TaxableAmount} \times \text{estimatedTaxRate}$$
$$\text{NetWithdrawal} = \max(\text{balance} - \text{PerformanceFee} - \text{EarlyWithdrawalFee} - \text{EstimatedTax}, 0)$$

---

## 5. Categories (`categories`) & Hierarchy

Categories classify transactions into functional groups. Categories form an arbitrary depth directed tree (parent-child relationships).

| Field          | Data Type          | Constraints                                 | Description                                                          |
| :------------- | :----------------- | :------------------------------------------ | :------------------------------------------------------------------- |
| `uuid` / `id`  | `string \| number` | Unique identifier                           | Category identifier.                                                 |
| `name`         | `string`           | 1–100 characters                            | Name (e.g., `"Groceries"`).                                          |
| `description`  | `string`           | 0–500 characters                            | Detailed explanation.                                                |
| `type`         | `integer`          | `0` (Expense), `1` (Income), `2` (Transfer) | Financial transaction direction.                                     |
| `parentId`     | `string \| null`   | Category UUID                               | Parent category ID. Must match the same `type`. Cycles prohibited.   |
| `icon`         | `string`           | Non-empty string                            | Icon identifier or `"material:<name>"`.                              |
| `iconPath`     | `string \| null`   | SVG path string                             | Material vector icon path.                                           |
| `color`        | `string`           | Hex format `^#[a-f0-9]{6}$`                 | Visual display color.                                                |
| `isDefault`    | `boolean`          | `true \| false`                             | Default selected category for this type.                             |
| `user`         | `string \| null`   | Profile UUID or `null`                      | `null` means shared across all profiles; otherwise profile-specific. |
| `createdAt`    | `string`           | ISO-8601 timestamp                          | Creation timestamp.                                                  |
| `updatedAt`    | `string`           | ISO-8601 timestamp                          | Last modification timestamp.                                         |
| `transactions` | `string[]`         | Array of UUIDs                              | Denormalized transaction IDs referencing this category.              |

---

## 6. Transactions (`transactions`) & Currency Model

Transactions are the atomic ledger entries recording money movement.

### 6.1 Transaction Core Schema

| Field                 | Data Type        | Constraints                                 | Description                                                         |
| :-------------------- | :--------------- | :------------------------------------------ | :------------------------------------------------------------------ |
| `uuid`                | `string`         | Unique UUIDv4                               | Transaction identifier.                                             |
| `name`                | `string`         | 1–100 characters                            | Title/merchant/payee (e.g., `"Whole Foods"`).                       |
| `description`         | `string`         | Arbitrary string                            | Memo, itemization, or notes.                                        |
| `type`                | `integer`        | `0` (Expense), `1` (Income), `2` (Transfer) | Financial flow type.                                                |
| `amount`              | `number`         | `> 0` and `<= 1e12`                         | Nominal transaction amount in `currencyCode`.                       |
| `currencyCode`        | `string`         | ISO 4217 3-letter code                      | Transaction currency.                                               |
| `account`             | `string`         | Account UUID                                | Source account debited (for Expense/Transfer) or credited (Income). |
| `accountName`         | `string`         | Cached display string                       | Denormalized name of source account.                                |
| `accountAmount`       | `number`         | `> 0`                                       | Amount debited/credited in the source account's native currency.    |
| `accountCurrencyCode` | `string`         | ISO 4217 3-letter code                      | Currency of the source account.                                     |
| `fromAccount`         | `string \| null` | Account UUID                                | Origin account (for Transfers only).                                |
| `toAccount`           | `string \| null` | Account UUID                                | Target destination account (for Transfers only).                    |
| `category`            | `string \| null` | Category UUID                               | Assigned category (only subcategories or leaf nodes allowed).       |
| `categoryName`        | `string`         | Cached display string                       | Denormalized category name.                                         |
| `budget`              | `string \| null` | Budget UUID                                 | Optional budget tracking assignment.                                |
| `label`               | `string \| null` | Label UUID                                  | Primary label/tag.                                                  |
| `tags`                | `string[]`       | Array of strings                            | Tag list (usually includes `label`).                                |
| `place`               | `string \| null` | Place UUID                                  | Location/store where transaction occurred.                          |
| `person` / `payee`    | `string \| null` | Person UUID                                 | Contact or recipient involved.                                      |
| `loan`                | `string \| null` | Loan UUID                                   | Associated loan record.                                             |
| `date` / `occurredAt` | `string`         | ISO-8601 timestamp                          | Actual historical or real-world transaction timestamp.              |
| `user`                | `string`         | Profile UUID                                | Owning profile identifier.                                          |
| `createdAt`           | `string`         | ISO-8601 timestamp                          | Creation timestamp.                                                 |
| `updatedAt`           | `string`         | ISO-8601 timestamp                          | Last modification timestamp.                                        |

---

### 6.2 Multi-Currency Conversion & Snapshots

When a transaction's `currencyCode` differs from the source account or profile currency, conversion rates are captured immutably at creation time.

- **Fields**:
  - `exchangeRate` (`number | null`): Conversion factor applied.
  - `exchangeRateDate` (`string | null`): Rate publication date (`YYYY-MM-DD`).
  - `exchangeRateFetchedAt` (`string | null`): Rate network retrieval timestamp.
  - `exchangeRateSource` (`string | null`): Quote provider (e.g., `"open.er-api.com"`).
  - `profileCurrencyCode` (`string | null`): Profile's main currency at the time.
  - `profileAmount` (`number | null`): Converted value in the profile currency.
  - `conversionSnapshot` (`ExchangeRateSnapshot | null`): Complete rate table snapshot frozen at transaction creation. Contains:
    ```typescript
    interface ExchangeRateSnapshot {
      base: string; // Base currency (e.g., "USD")
      date: string; // Rate table date (YYYY-MM-DD)
      fetchedAt: string; // Fetch timestamp
      rates: Record<string, number>; // Complete dictionary of quotes { "EUR": 0.92, ... }
    }
    ```
  - `conversionCapturedAt` (`string | null`): Timestamp when the snapshot was permanently sealed.

---

### 6.3 Card Settlement Transfers

Transactions generated by the credit card engine contain:

- `cardPaymentPeriod`: Billing period string (e.g., `"2026-09"`).
- `paymentDueAt`: ISO-8601 timestamp of due date.
- `cardPaymentAllocations`: Array of allocations itemizing which specific historical card purchases were settled:
  ```typescript
  interface CardPaymentAllocation {
    transactionId: string; // UUID of the paid card transaction
    cardAmount: number; // Nominal debt settled
    bankAmount: number; // Repriced cost debited from bank
    rateDate: string | null; // Exchange rate timestamp
    conversionSnapshot: object | null;
  }
  ```

---

### 6.4 Receipts & Binary Attachments

Users can photograph physical receipts or attach invoices.

- `receipt` / `image` (`string | null`): Relative filesystem path (e.g., `"attachments/uuid.jpg"`).
- `receiptAttachmentId` (`string | null`): ID matching an entry in `_local.attachments`.

---

## 7. Budgets (`budgets`) & Consumption Tracking

Budgets define spending caps over specific recurrence periods to prevent overspending.

| Field                     | Data Type        | Permitted Values / Constraints                             | Description                                                                                    |
| :------------------------ | :--------------- | :--------------------------------------------------------- | :--------------------------------------------------------------------------------------------- |
| `uuid`                    | `string`         | Unique UUIDv4                                              | Budget identifier.                                                                             |
| `name`                    | `string`         | 1–100 characters                                           | Name (e.g., `"Dining Out"`).                                                                   |
| `amount`                  | `number`         | `> 0` and `<= 1e12`                                        | Budgeted spending limit.                                                                       |
| `currencyCode`            | `string`         | ISO 4217 3-letter code                                     | Budget currency.                                                                               |
| `transactionType`         | `integer`        | `0` (Expense), `1` (Income), `2` (Transfer)                | Direction tracked (typically `0`).                                                             |
| `budgetMode`              | `string`         | `"Automatic" \| "Manual"`                                  | Automatic dynamically aggregates matching transactions; Manual relies on manual assignment.    |
| `budgetType`              | `string`         | `"Category" \| "Overall"`                                  | `"Category"` filters by category list; `"Overall"` tracks all transactions across the profile. |
| `period`                  | `string`         | `"Daily" \| "Weekly" \| "Monthly" \| "Yearly" \| "Custom"` | Recurrence frequency.                                                                          |
| `categories`              | `string[]`       | Array of Category UUIDs                                    | Filter: categories included in this budget.                                                    |
| `accounts`                | `string[]`       | Array of Account UUIDs                                     | Filter: accounts included (empty means all accounts).                                          |
| `includeSubcategories`    | `boolean`        | `true \| false`                                            | If true, automatically includes child categories.                                              |
| `rolling`                 | `boolean`        | `true \| false`                                            | Rollover feature: unspent funds carry over into the next cycle.                                |
| `showOnHome`              | `boolean`        | `true \| false`                                            | Pin budget card to the main home dashboard.                                                    |
| `cycleDay`                | `integer`        | `1` to `31` (Default: `1`)                                 | Anchor day of month for monthly/yearly cycles.                                                 |
| `startDate`               | `string`         | `YYYY-MM-DD`                                               | Start date (mandatory for `"Custom"` period).                                                  |
| `endDate`                 | `string`         | `YYYY-MM-DD` (`>= startDate`)                              | End date (mandatory for `"Custom"` period).                                                    |
| `color`                   | `string`         | Hex format `^#[a-f0-9]{6}$`                                | Visual theme color.                                                                            |
| `icon`                    | `string`         | Non-empty string                                           | Icon identifier.                                                                               |
| `iconPath`                | `string \| null` | SVG path string                                            | Material vector icon path.                                                                     |
| `notes`                   | `string`         | Arbitrary text                                             | Budget purpose or constraints.                                                                 |
| `user`                    | `string`         | Profile UUID                                               | Owning profile identifier.                                                                     |
| `createdAt` / `updatedAt` | `string`         | ISO-8601 timestamps                                        | Audit timestamps.                                                                              |

---

## 8. Recurring Schedules (`recurrings`) & Subscriptions

Recurring rules model predictable repeating income or expenses (e.g., Netflix, Gym, Salary, Rent).

| Field              | Data Type           | Constraints                                                                                    | Description                                                                                       |
| :----------------- | :------------------ | :--------------------------------------------------------------------------------------------- | :------------------------------------------------------------------------------------------------ |
| `uuid`             | `string`            | Unique UUIDv4                                                                                  | Schedule identifier.                                                                              |
| `name`             | `string`            | 1–100 characters                                                                               | Name (e.g., `"iCloud Storage"`).                                                                  |
| `amount`           | `number`            | `> 0` and `<= 1e12`                                                                            | Scheduled nominal payment amount.                                                                 |
| `currencyCode`     | `string`            | ISO 4217 3-letter code                                                                         | Currency code.                                                                                    |
| `type`             | `integer`           | `0` (Expense) or `1` (Income)                                                                  | Transaction direction.                                                                            |
| `period`           | `string`            | `"Daily" \| "Weekly" \| "Fortnightly" \| "Monthly" \| "Quarterly" \| "Biannually" \| "Yearly"` | Frequency interval.                                                                               |
| `startAt`          | `string`            | ISO-8601 timestamp                                                                             | First scheduled payment date/time.                                                                |
| `endAt`            | `string \| null`    | ISO-8601 or `null`                                                                             | Optional expiration date.                                                                         |
| `scheduleStart`    | `string`            | `YYYY-MM-DDTHH:mm`                                                                             | Wall-clock anchor time used to project next occurrences.                                          |
| `automatic`        | `boolean`           | `true \| false`                                                                                | If true, automatically generates posted transactions when due; if false, prompts user to approve. |
| `account`          | `string`            | Account UUID                                                                                   | Default account debited or credited.                                                              |
| `category`         | `string`            | Category UUID                                                                                  | Category assigned to generated transactions.                                                      |
| `budget`           | `string \| null`    | Budget UUID                                                                                    | Optional linked budget.                                                                           |
| `label`            | `string \| null`    | Label UUID                                                                                     | Optional linked label.                                                                            |
| `place`            | `string \| null`    | Place UUID                                                                                     | Optional merchant/location.                                                                       |
| `person`           | `string \| null`    | Person UUID                                                                                    | Optional payee.                                                                                   |
| `description`      | `string`            | Arbitrary string                                                                               | Memo for created transactions.                                                                    |
| `reminderDays`     | `integer \| null`   | `null, 0, 1, 2, 7`                                                                             | Lead time for local notifications before payment date.                                            |
| `archived`         | `boolean`           | `true \| false`                                                                                | Soft-deletion flag. Archived schedules cease firing.                                              |
| `nextIndex`        | `integer`           | `>= 0`                                                                                         | Sequence index of the next pending occurrence.                                                    |
| `scheduleRevision` | `integer`           | `>= 0`                                                                                         | Increments whenever start time or frequency changes.                                              |
| `occurrences`      | `OccurrenceEntry[]` | Array of logs                                                                                  | Historical audit log of all completed/skipped occurrences.                                        |
| `user`             | `string`            | Profile UUID                                                                                   | Owning profile identifier.                                                                        |

### `OccurrenceEntry` Schema

```typescript
interface OccurrenceEntry {
  key: string; // Composite key: "recurring:<id>:<revision>:<index>"
  scheduledAt: string; // Projected ISO-8601 due date
  status: "processed" | "skipped"; // Processing outcome
  recordedAt: string; // Actual execution timestamp
  transactionId: string | null; // UUID of resulting transaction (if processed)
  amount: number; // Realized amount
  currencyCode: string; // Realized currency
  type: number; // 0 or 1
}
```

---

## 9. Transaction Templates (`templates`)

Templates allow rapid one-tap recording of recurring manual transactions (e.g., "Morning Latte").

| Field                                   | Data Type        | Description                                      |
| :-------------------------------------- | :--------------- | :----------------------------------------------- |
| `uuid`                                  | `string`         | Template unique UUIDv4.                          |
| `name`                                  | `string`         | Template display title.                          |
| `amount`                                | `number`         | Preset nominal amount.                           |
| `type`                                  | `0 \| 1 \| 2`    | Preset transaction type.                         |
| `currencyCode`                          | `string`         | Preset currency.                                 |
| `account`                               | `string`         | Preset source account UUID.                      |
| `category`                              | `string \| null` | Preset category UUID.                            |
| `toAccount`                             | `string \| null` | Preset destination account UUID (for transfers). |
| `budget` / `label` / `place` / `person` | `string \| null` | Preset metadata links.                           |
| `description`                           | `string`         | Preset description text.                         |
| `user`                                  | `string`         | Owning profile UUID.                             |

---

## 10. Contextual Metadata Collections

The application contains additional relational collections to enrich transactions with multi-dimensional context.

### 10.1 Labels & Tags (`labels`)

- User-defined arbitrary tags (e.g., `#TaxDeductible`, `#Vacation2026`).
- **Fields**: `uuid`, `name`, `color` (hex), `icon`, `user`, `createdAt`, `updatedAt`.

### 10.2 Places (`places`)

- Physical stores, chains, or locations where transactions take place (e.g., `"IKEA Brooklyn"`).
- **Fields**: `uuid`, `name`, `description`, `address`, `icon`, `color`, `user`, `createdAt`, `updatedAt`.

### 10.3 People & Contacts (`peoples`)

- Individuals, roommates, contractors, or payees (e.g., `"Landlord John"`).
- **Fields**: `uuid`, `name`, `description`, `phone`, `email`, `icon`, `color`, `user`, `createdAt`, `updatedAt`.

### 10.4 Loans & Debts (`loans`)

- Formal or personal money lent to or borrowed from contacts.
- **Fields**: `uuid`, `name`, `amount`, `interestRate`, `dueDate`, `person`, `user`, `notes`, `createdAt`, `updatedAt`.

### 10.5 Assets & Valuables (`assets`)

- Capital assets not tracked in standard bank accounts (e.g., Real Estate, Vehicles, Gold, Crypto cold storage).
- **Fields**: `uuid`, `name`, `amount` / `value`, `category`, `acquisitionDate`, `user`, `notes`, `createdAt`, `updatedAt`.

### 10.6 Financial Goals (`goals`)

- Target savings objectives (e.g., `"Emergency Fund $10,000"`).
- **Fields**: `uuid`, `name`, `targetAmount`, `currentAmount`, `targetDate`, `user`, `createdAt`, `updatedAt`.

### 10.7 Bill Splitters & Participants (`billSplitters`, `billParticipants`)

- Preserved shared bill expense structures:
  - `billSplitters`: Overall bill header (`name`, `totalAmount`, `date`, `user`).
  - `billParticipants`: Individual member allocations (`splitterId`, `personId`, `shareAmount`, `paidAmount`).

---

## 11. Currency Exchange Rates (`exchangeRates`)

Cached daily exchange rate matrices downloaded from public rate endpoints (e.g. Open Exchange Rates / ER-API) to support offline conversion.

| Field       | Data Type                | Description                                                          |
| :---------- | :----------------------- | :------------------------------------------------------------------- |
| `base`      | `string`                 | Base currency code (e.g., `"USD"`).                                  |
| `date`      | `string`                 | Quote date (`YYYY-MM-DD`).                                           |
| `fetchedAt` | `string \| null`         | Fetch timestamp.                                                     |
| `source`    | `string`                 | Rate provider identifier (`"open.er-api.com"`).                      |
| `rates`     | `Record<string, number>` | Dictionary of exchange quotes mapping 3-letter codes to multipliers. |

---

## 12. Local AI ("Plutus") Protocol & On-Device Tool Map

The application integrates an on-device Large Language Model (**Plutus**, powered by **Gemma 4 E2B LiteRT-LM**). The model executes completely on the mobile device's NPU/GPU via a native C++ module (`modules/plutus-local-ai`), operating 100% offline without remote servers, network calls, or external telemetry.

---

### 12.1 Hardware Requirements & Compatibility Policy

The local AI engine evaluates hardware capability before allowing model download and execution:

- **Model Architecture**: Gemma 4 E2B (LiteRT-LM / MediaPipe / ExecuTorch binary weights).
- **Weight Footprint**: ~2.58 GB (`sizeBytes: 2,588,147,712`).
- **Minimum Device RAM**: 8.0 GB (`8,000,000,000` bytes).
- **Minimum Free Storage**: ~6.2 GB (`2 * sizeBytes + 1,000,000,000` bytes) for safe staging, temporary decompression, and scratch buffers.
- **Supported ABIs**: 64-bit platforms (`arm64-v8a`, `aarch64`, `x86_64`). 32-bit platforms and desktop simulators are explicitly blocked.
- **Expo Go Restriction**: Requires custom native C++ Nitro runtime modules; cannot run in standard Expo Go.

---

### 12.2 Sandboxing, Security & Read-Only Invariants

To protect personal financial data and eliminate hallucination-driven data loss:

1. **Proposal-Only Mutation Access**: The model has exactly one mutation-related tool, `prepare_change`, and it **cannot execute anything**. `prepare_change` returns a reviewable `ChangeProposal` (before/after values, side effects, warnings) computed by dry-running the app's own domain functions on a private copy. Only the user's tap on the in-chat review card runs `ProposalStore.execute`, which re-validates against the current document, rejects stale proposals, commits through `LocalDataProvider.updateDocument`, and feeds the real `MutationResult` back to the model. See `docs/local-ai-architecture.md` §5.
2. **Selector Abstraction**: The model never sees raw SQLite tables, file system paths, or SQL queries. All queries pass through type-safe TypeScript selectors (`ToolContext`).
3. **Multi-Turn Rolling Session**: The runtime injects the last 6 conversation turns into a transient memory context per question. Chat history and pending proposals are held in component memory and are **never persisted** to SQLite; closing the chat or restarting the app discards unconfirmed proposals.
4. **Prompt Budgeting & Truncation Guard**: Plain-text tool facts are budgeted (`charBudget`, typically 6,000–8,000 characters) to avoid exceeding on-device KV cache limits. Overflowing content is gracefully terminated with `"(truncated to fit the on-device context)"`.
5. **No Network Leakage**: Inputs, voice recordings, transcripts, tool results, and generated responses remain on the device. Voice is transcribed by the local Gemma model from a temporary 16 kHz mono WAV in the app cache, which is deleted after use.
6. **Evidence Contract**: Every data-dependent answer is built from an `EvidenceBundle` (facts with provenance, warnings, missing data, assumptions). Period boundaries, totals, forecasts and rankings are computed by code; the model only explains them.

---

### 12.3 Two-Step Execution Pipeline & Fallback Engine

```
User Question (typed, or voice → local Gemma transcription)
      │
      ▼
[Step 0: Routing] resolveIntent() — language, intent, 1–3 tool packs, period, mutation intent
      │   broad advice → mandatory financial_advice_context (no planning step)
      │   create/update/delete/archive wording → mutation branch (prepare_change only)
      ▼
[Step 1: Planning]
Gemma 4 E2B receives chatSystemPrompt(context, packs) with only the selected packs' tools
Model responds with JSON: {"tool_calls":[{"name":"<tool>","args":{...}}]}
      │
      ├── (Valid JSON) ──────────> sanitizeToolArgs(args, tool) — per-tool keys, enums, clamps
      │                                   │
      └── (Plain Text / Misses JSON) ───> intent mandatory calls, then inferToolCalls() [EN, HE, RU]
                                          │
                                          ▼
[Step 2: Execution in ToolContext]
- Resolves date ranges (resolvePeriod)
- Queries SQLite BackupDocument via selectors
- Performs multi-currency conversions & group aggregations
- Produces plain-text TOOL_RESULTS + Interactive Chat Cards
                                          │
                                          ▼
[Step 3: Synthesis & Streaming]
Model receives toolResultsPrompt(question, facts)
Streams formatted Markdown answer (Typewriter animation)
Renders interactive tappable cards below the bubble
```

#### Multilingual Keyword Fallback (`inferToolCalls`)

If the small on-device model fails to emit structured JSON and outputs conversational text instead, an intelligent heuristic regex parser extracts intent across **English, Hebrew, and Russian**:

- "How much did I spend on groceries?" -> `search_transactions` + `spending_summary`
- "איך לשפר את המצב הכלכלי?" -> `financial_advice_context` (mandatory multi-area bundle)
- "Сколько у меня на счету?" -> `accounts`
- "מה הנט וורת שלי?" -> `net_worth`

---

### 12.4 Tool Specifications

The catalog now has **66 read-only tools** in 10 packs plus `prepare_change`
(`src/features/local-ai/tools/tool-catalog.ts`). The full list, pack rules and
evidence contract are in `docs/local-ai-architecture.md` §1–4. The original 15
tools below keep their behaviour and output format; additions include
`financial_priorities`, `financial_advice_context`, `transaction_details`,
`merchant_analysis`, `spending_trend`, `unusual_transactions`,
`duplicate_transaction_candidates`, `income_analysis`, `account_details`,
`liquidity_analysis`, `credit_position`, `card_payment_forecast`, `cash_runway`,
`budget_forecast`, `budget_recommendations`, `upcoming_obligations`,
`subscription_analysis`, `savings_projection`, `savings_withdrawal_estimate`,
`goal_feasibility`, `debt_payoff_scenario`, `wealth_allocation`,
`bill_split_status`, `category_details`, `people_summary`, `currency_convert`,
`fx_transaction_analysis`, `data_quality_audit`, `analysis_coverage`,
`affordability_check`, `scenario_simulation` and `cash_flow_forecast`.

`financial_health` additionally reports each score pillar (savings, budgets,
fixed costs, balance sheet) with points, raw value and band.

#### Tool 1: `financial_snapshot`

- **Signature**: `financial_snapshot()`
- **Purpose**: Primary global context tool. Provides a dense, prioritized digest of the entire financial document. Ideal when a question touches multiple domains or when other tools fail to provide sufficient context.
- **Arguments**: None (`{}`).
- **Data Queried from Local Database**:
  - Global metadata: `_local.mainCurrency`, `_local.monthStartDay`, current device time.
  - Accounts: All non-excluded accounts via `selectAccountBalances` and `selectAccounts`.
  - Cash Flow: 12-month historical ledgers from `searchContext.facts`.
  - Categories: Top 8 categories for `this_month` and `last_month`.
  - Budgets: All active budgets via `selectBudgets`.
  - Subscriptions: Active schedules and 30-day upcoming occurrences via `selectRecurrings`.
  - Exchange Rates: Base currency quotes and portfolio rates from `selectExchangeRates`.
  - Holdings: Summary of `goals`, `loans`, and `assets`.
  - Transactions: Most recent transactions streamed newest-first until the prompt budget is full.
- **Transformations & Output Format**:
  Combines multi-section summaries into a dense plain-text block:
  ```text
  [financial_snapshot] today 2026-09-26, profile currency USD, financial month starts on day 1
  assets 15,200.00 USD, debts 1,200.00 USD, net worth 14,000.00 USD
  [accounts] name | type | balance | details
  Chase Checking | bank | 5,200.00 USD | default; this month income 5,000.00 USD, expenses 1,200.00 USD
  Amex Gold | card | -1,200.00 USD | limit 10,000.00 USD, spent this cycle 1,200.00 USD, available 8,800.00 USD; cycle 2026-09-01..2026-09-30
  [cash_flow] last_12_months ...
  [spending_summary] expense by category, this_month; total 1,200.00 USD ...
  [budgets] Dining Out | on_track | 320.00 / 500.00 USD (64%) | 180.00 USD | 2026-09-01..2026-09-30, 4 days left | 45.00 USD
  [recurring] Netflix | expense | 15.49 USD | Monthly | 2026-10-05 | Chase Checking | Entertainment
  [exchange_rates] base USD, saved 2026-09-26 ...
  [goals] ... [loans] ... [assets] ...
  [transactions] newest first: date | type | amount | name | category | account | note
  2026-09-25 | expense | 42.50 USD | Trader Joe's | Groceries | Chase Checking | Weekly food
  (older transactions omitted; use search_transactions for them)
  ```
- **Interactive UI Cards**: None directly (preserves card slots for specific tools).

---

#### Tool 2: `financial_health`

- **Signature**: `financial_health()`
- **Purpose**: Generates an authoritative financial review, health score, savings rate, spending pace, emergency fund coverage, and rule-based insights.
- **Arguments**: None (`{}`).
- **Data Queried from Local Database**:
  - `selectProfileReport(document, currency, now)`:
    - 6-month historical ledgers (monthly income, expenses, net savings).
    - Current financial month progress (start date, end date, % cycle elapsed).
    - Liquid cash reserves in non-credit, non-excluded accounts.
    - Total credit card debt vs. total credit limits.
    - Recurring fixed monthly commitments.
    - Active budget status counts (total, over, at-risk, on-track).
    - Top spending categories and month-over-month percentage changes.
    - 16 rule-based health insights (`ReportInsight`).
- **Transformations & Output Format**:
  Computes health score (0–100), health band, emergency fund months, and projected month-end spend:
  ```text
  [financial_health] USD; this financial month 2026-09-01..2026-09-30, 87% elapsed
  health score 82/100 (strong)
  this month: income 5,000.00 USD, expenses 2,400.00 USD, savings rate 52% (+4 points vs last month)
  forecast month-end expenses 2,758.62 USD; expenses vs last month -8%
  6-month averages: income 4,800.00 USD, expenses 2,600.00 USD, net 2,200.00 USD
  months with a deficit: 0 of 6
  emergency fund: 14,200.00 USD in cash-like accounts covers 5.5 months of average expenses
  net worth 28,400.00 USD (assets 31,000.00 USD, debts 2,600.00 USD)
  credit cards: 1,200.00 USD used of 10,000.00 USD limit (12% utilization)
  recurring expenses 350.00 USD/month = 7% of income
  budgets: 4 total, 0 over, 1 at risk, 3 on track
  top categories this month (share, change vs last month):
  - Groceries: 650.00 USD (27%, -5%)
  - Rent: 1,200.00 USD (50%, 0%)
  findings (severity: finding - suggested action):
  - good: Strong savings - Keep contributing to savings or investments
  - warning: Budget at risk: Dining Out - Pace spending over the remaining 4 days
  ```
- **Interactive UI Cards**: None.

---

#### Tool 3: `search_transactions`

- **Signature**: `search_transactions(args)`
- **Purpose**: Performs structured search across transactions matching text, merchant, category, account, type, amount, date range, and sort order.
- **Arguments (`ChatToolArgs`)**:
  - `query` (`string`): Search tokens matched against transaction name, memo, category, and account.
  - `category` (`string`): Filter by category name or parent category.
  - `account` (`string`): Filter by account display name.
  - `type` (`"expense" | "income" | "transfer" | "all"`, default: `"all"`).
  - `period` (`string`): Named period or date span (`"this_month"`, `"last_30_days"`, `"2026-08"`, etc.).
  - `minAmount` (`number`): Lower bound for transaction amount.
  - `maxAmount` (`number`): Upper bound for transaction amount.
  - `sort` (`"newest" | "oldest" | "largest" | "smallest"`, default: `"newest"`).
  - `limit` (`number`, default: `15`, max: `50`): Maximum entries to return.
- **Data Queried from Local Database**:
  - Scans `searchContext.facts` (pre-indexed transactions for active profile).
  - Matches tokens against `fact.haystack` (case-insensitive substring token match).
- **Transformations & Output Format**:
  Sorts matches, calculates totals by currency, and formats pipe-delimited rows:
  ```text
  [search_transactions] 2026-09-01..2026-09-26; filters {"category":"Groceries","type":"expense"}; sort newest; 4 matches
  matched totals USD: expenses 342.10 USD, income 0.00 USD
  date | type | amount | name | category | account | note
  2026-09-24 | expense | 84.20 USD | Whole Foods | Groceries | Chase Checking | Dinner ingredients
  2026-09-18 | expense | 125.40 USD | Costco | Groceries | Amex Gold | Bulk supplies
  2026-09-10 | expense | 62.50 USD | Trader Joe's | Groceries | Chase Checking | Weekly run
  2026-09-03 | expense | 70.00 USD | Supermarket | Groceries | Chase Checking | Organic produce
  ```
- **Interactive UI Cards**: Up to 6 interactive `transaction` cards (`{ kind: "transaction", id }`). Tapping opens the native transaction detail sheet.

---

#### Tool 4: `largest_expenses`

- **Signature**: `largest_expenses(args)`
- **Purpose**: Retrieves the largest individual spending transactions in a given period.
- **Arguments (`ChatToolArgs`)**:
  - `period` (`string`, optional): Range filter (e.g. `"this_month"`, `"this_year"`).
  - `limit` (`number`, default: `5`, max: `50`): Number of transactions.
- **Data Queried from Local Database**:
  - Filters `searchContext.facts` for `type === "expense"`.
  - Excludes transfers and accounts marked `isExcluded`.
  - Sorts descending by `fact.reportingAmount`.
- **Transformations & Output Format**:
  ```text
  [largest_expenses] this_month; filters {"type":"expense"}; sort largest; 5 matches
  matched totals USD: expenses 1,845.00 USD, income 0.00 USD
  date | type | amount | name | category | account | note
  2026-09-01 | expense | 1,200.00 USD | Landlord | Rent | Chase Checking | Monthly rent
  2026-09-14 | expense | 320.00 USD | Apple Store | Electronics | Amex Gold | Magic Keyboard
  2026-09-08 | expense | 145.00 USD | Michelin Bistro | Food | Amex Gold | Anniversary dinner
  2026-09-18 | expense | 125.40 USD | Costco | Groceries | Amex Gold | Bulk supplies
  2026-09-22 | expense | 54.60 USD | Shell Gas | Car | Chase Checking | Fuel
  ```
- **Interactive UI Cards**: Up to 6 interactive `transaction` cards.

---

#### Tool 5: `recent_transactions`

- **Signature**: `recent_transactions(args)`
- **Purpose**: Retrieves the most recently recorded transactions across all categories and accounts.
- **Arguments (`ChatToolArgs`)**:
  - `limit` (`number`, default: `8`, max: `50`): Number of newest records.
- **Data Queried from Local Database**:
  - Reads `searchContext.facts` newest first (`sort: "newest"`).
- **Transformations & Output Format**:
  ```text
  [recent_transactions] all time; filters {"type":"all"}; sort newest; 8 matches
  date | type | amount | name | category | account | note
  2026-09-26 | expense | 4.50 USD | Starbucks | Food | Chase Checking | Morning latte
  2026-09-25 | expense | 42.50 USD | Trader Joe's | Groceries | Chase Checking | Weekly food
  2026-09-24 | income | 2,500.00 USD | Acme Corp | Salary | Chase Checking | Bi-weekly paycheck
  2026-09-22 | transfer | 500.00 USD | Transfer to Savings | Transfer | Chase Checking | Monthly savings
  ```
- **Interactive UI Cards**: Up to 6 interactive `transaction` cards.

---

#### Tool 6: `spending_summary`

- **Signature**: `spending_summary(args)`
- **Purpose**: Aggregates income or expense totals grouped across any analytical dimension.
- **Arguments (`ChatToolArgs`)**:
  - `type` (`"expense" | "income"`, default: `"expense"`).
  - `period` (`string`, default: `"this_month"`).
  - `groupBy` (`SummaryGroup`, default: `"category"`): Grouping dimension:
    - `"category"`: By assigned category name.
    - `"account"`: By source account name.
    - `"merchant"`: By merchant/payee title.
    - `"month"`: By `YYYY-MM`.
    - `"week"`: By `week of YYYY-MM-DD`.
    - `"day"`: By `YYYY-MM-DD`.
    - `"weekday"`: By day of week (`Sun`, `Mon`, `Tue`, `Wed`, `Thu`, `Fri`, `Sat`).
    - `"label"`: By attached label/tag.
    - `"place"`: By physical location.
    - `"person"`: By associated person.
  - `limit` (`number`, default: `15`).
- **Data Queried from Local Database**:
  - `searchContext.facts` within date range. Ignores transfers and excluded accounts.
- **Transformations & Output Format**:
  Accumulates sums and counts per group, calculates percentage shares, and sorts descending:
  ```text
  [spending_summary] expense by category, this_month; total 2,400.00 USD
  category | amount | share | transactions
  Rent | 1,200.00 USD | 50% | 1
  Groceries | 650.00 USD | 27% | 6
  Dining Out | 320.00 USD | 13% | 7
  Utilities | 150.00 USD | 6% | 2
  Transportation | 80.00 USD | 3% | 5
  ```
- **Interactive UI Cards**: None.

---

#### Tool 7: `cash_flow`

- **Signature**: `cash_flow(args)`
- **Purpose**: Computes total income, expenses, net savings, savings rate %, and average daily spending over a specified period.
- **Arguments (`ChatToolArgs`)**:
  - `period` (`string`, default: `"this_month"`).
- **Data Queried from Local Database**:
  - `searchContext.facts` within period.
- **Transformations & Output Format**:
  Sums income and expenses per currency; computes `net = income - expense` and `savingsRate = (net / income) * 100`. If period > 40 days, renders a month-by-month table:
  ```text
  [cash_flow] this_month
  USD: income 5,000.00 USD, expenses 2,400.00 USD, net 2,600.00 USD, savings rate 52%, 24 transactions
  average daily spending 92.31 USD over 26 days
  ```
  _(Multi-month format if period is `"this_year"` or `"last_12_months"`)_:
  ```text
  month | income | expenses | net (USD)
  2026-06 | 4,800.00 | 2,500.00 | 2,300.00
  2026-07 | 4,800.00 | 2,750.00 | 2,050.00
  2026-08 | 5,000.00 | 2,600.00 | 2,400.00
  2026-09 | 5,000.00 | 2,400.00 | 2,600.00
  ```
- **Interactive UI Cards**: None.

---

#### Tool 8: `compare_periods`

- **Signature**: `compare_periods(args)`
- **Purpose**: Compares spending side-by-side between two distinct periods, broken down by category.
- **Arguments (`ChatToolArgs`)**:
  - `period` (`string`, default: `"this_month"`): Primary Period A.
  - `periodB` (`string`, default: `"last_month"`): Comparison Period B.
  - `type` (`"expense" | "income"`, default: `"expense"`).
- **Data Queried from Local Database**:
  - Aggregates facts for Period A and Period B in profile currency.
- **Transformations & Output Format**:
  Computes differences `A - B`, percentage changes, and sorts top 12 categories by largest absolute shift:
  ```text
  [compare_periods] expense in USD: A this_month = 2,400.00, B last_month = 2,600.00, change A-B -200.00 (-8%)
  category | A | B | change
  Groceries | 650.00 | 780.00 | -130.00
  Dining Out | 320.00 | 450.00 | -130.00
  Electronics | 320.00 | 0.00 | 320.00
  Utilities | 150.00 | 180.00 | -30.00
  Rent | 1,200.00 | 1,200.00 | 0.00
  ```
- **Interactive UI Cards**: None.

---

#### Tool 9: `accounts`

- **Signature**: `accounts()`
- **Purpose**: Inspects every account with current balances, credit limits, available credit, card billing cycles, and current month cash flow.
- **Arguments**: None (`{}`).
- **Data Queried from Local Database**:
  - `selectAccounts(document, now)`: All accounts belonging to the active profile.
- **Transformations & Output Format**:
  Inspects credit limits, calculated billing cycle boundaries, and month-to-date inflows/outflows:
  ```text
  [accounts] name | type | balance | details
  Chase Checking | bank | 5,450.00 USD | default; this month income 5,000.00 USD, expenses 1,200.00 USD
  Amex Gold | card | -1,200.00 USD | limit 10,000.00 USD, spent this cycle 1,200.00 USD, available 8,800.00 USD; cycle 2026-09-01..2026-09-30; this month income 0.00 USD, expenses 1,200.00 USD
  Wallet Cash | cash | 185.00 USD | this month income 0.00 USD, expenses 45.00 USD
  Vanguard S&P 500 | savings | 15,200.00 USD | this month income 500.00 USD, expenses 0.00 USD
  ```
- **Interactive UI Cards**: Up to 6 interactive `account` cards (`{ kind: "account", id }`) rendering native cards with balances and color themes.

---

#### Tool 10: `net_worth`

- **Signature**: `net_worth(args)`
- **Purpose**: Calculates total assets, debts, and net worth today or at the close of any past period.
- **Arguments (`ChatToolArgs`)**:
  - `period` (`string`, optional): When provided, reconstructs historical balances at the end of that period.
- **Data Queried from Local Database**:
  - Current account balances for non-excluded accounts.
  - If a past period is specified: walks the transaction log in reverse from `now` back to `period.end`, undoing transactions to calculate exact historical point-in-time balances.
  - Saved exchange quotes into profile currency.
- **Transformations & Output Format**:
  Sums positive balances into assets, negative balances into debts; converts with saved rates; separates currencies lacking a saved rate:
  ```text
  [net_worth] as of 2026-09-26 (now), converted to USD at latest saved rates
  account | balance
  Chase Checking | 5,450.00 USD
  Amex Gold | -1,200.00 USD
  Wallet Cash | 185.00 USD
  Vanguard S&P 500 | 15,200.00 USD
  assets 20,835.00 USD, debts 1,200.00 USD, net worth 19,635.00 USD
  ```
- **Interactive UI Cards**: None.

---

#### Tool 11: `budgets`

- **Signature**: `budgets()`
- **Purpose**: Lists all spending budgets, consumed amounts, remaining limits, percentage spent, and remaining daily allowances.
- **Arguments**: None (`{}`).
- **Data Queried from Local Database**:
  - `selectBudgets(document, now)`: All budgets in active profile.
- **Transformations & Output Format**:
  Evaluates status (`on_track`, `at_risk`, `over_budget`), remaining days in cycle, and `dailyAllowance = remaining / daysLeft`:
  ```text
  [budgets] name | status | spent / limit | remaining | period | daily allowance
  Dining Out | on_track | 320.00 / 500.00 USD (64%) | 180.00 USD | 2026-09-01..2026-09-30, 4 days left | 45.00 USD
  Groceries | at_risk | 650.00 / 700.00 USD (93%) | 50.00 USD | 2026-09-01..2026-09-30, 4 days left | 12.50 USD
  Shopping | over_budget, OVER BUDGET | 350.00 / 300.00 USD (117%) | -50.00 USD | 2026-09-01..2026-09-30, 4 days left | 0.00 USD
  ```
- **Interactive UI Cards**: Up to 6 interactive `budget` cards (`{ kind: "budget", id }`) displaying live progress bars and warning states.

---

#### Tool 12: `recurring`

- **Signature**: `recurring(args)`
- **Purpose**: Lists recurring commitments (subscriptions, rent, salaries) and upcoming scheduled payments.
- **Arguments (`ChatToolArgs`)**:
  - `days` (`number`, default: `30`, max: `366`): Lookahead horizon in days.
- **Data Queried from Local Database**:
  - `selectRecurrings(document, now)`: Active, unarchived recurring rules.
  - `selectRecurringEvents(...)`: Pending occurrences projected over the next $N$ days.
- **Transformations & Output Format**:
  Annualizes frequencies (Daily 365, Weekly 52, Monthly 12, etc.) to derive monthly averages, and lists upcoming payment dates:
  ```text
  [recurring] name | type | amount | period | next date | account | category
  Netflix | expense | 15.49 USD | Monthly | 2026-10-05 | Chase Checking | Entertainment
  Gym Membership | expense | 45.00 USD | Monthly | 2026-10-01 (due) | Chase Checking | Health
  Salary | income | 2,500.00 USD | Fortnightly | 2026-10-08 | Chase Checking | Salary
  monthly average USD: expenses 60.49 USD, income 5,416.67 USD
  upcoming in next 30 days: 3
  2026-10-01 | Gym Membership | expense 45.00 USD
  2026-10-05 | Netflix | expense 15.49 USD
  2026-10-08 | Salary | income 2,500.00 USD
  ```
- **Interactive UI Cards**: None.

---

#### Tool 13: `categories`

- **Signature**: `categories()`
- **Purpose**: Returns the complete hierarchical category tree with spending in the current financial month vs. previous month.
- **Arguments**: None (`{}`).
- **Data Queried from Local Database**:
  - `selectCategories(document)`: All categories (parent and subcategories).
  - Facts within current financial month and previous financial month.
- **Transformations & Output Format**:
  Folds subcategory expenditures into parent category totals:
  ```text
  [categories] name | type | parent | this month | last month (USD)
  Groceries | expense | - | 650.00 | 780.00
  Dining Out | expense | - | 320.00 | 450.00
  Coffee Shops | expense | Dining Out | 65.00 | 85.00
  Fast Food | expense | Dining Out | 45.00 | 60.00
  Salary | income | - | 5,000.00 | 4,800.00
  ```
- **Interactive UI Cards**: None.

---

#### Tool 14: `exchange_rates`

- **Signature**: `exchange_rates()`
- **Purpose**: Returns cached daily exchange rates relative to the profile base currency.
- **Arguments**: None (`{}`).
- **Data Queried from Local Database**:
  - `selectExchangeRates(document, currency)`: Base rate table.
  - All currency codes active across accounts and recent transactions.
- **Transformations & Output Format**:
  Computes direct (`1 CUR = X BASE`) and inverse (`1 BASE = Y CUR`) multipliers:
  ```text
  [exchange_rates] base USD, saved 2026-09-26
  1 EUR = 1.0850 USD; 1 USD = 0.9217 EUR
  1 ILS = 0.2710 USD; 1 USD = 3.6900 ILS
  1 GBP = 1.3020 USD; 1 USD = 0.7680 GBP
  Each transaction also keeps the rate saved when it was recorded.
  ```
- **Interactive UI Cards**: None.

---

#### Tool 15: `goals_loans_assets`

- **Signature**: `goals_loans_assets()`
- **Purpose**: Summarizes non-account financial assets, debts/loans, and long-term savings goals.
- **Arguments**: None (`{}`).
- **Data Queried from Local Database**:
  - `goals`, `loans`, and `assets` collections filtered by the profile matcher.
- **Transformations & Output Format**:
  Extracts human-readable scalar fields (omits internal UUIDs, vectors, and blobs):
  ```text
  [goals]
  name Emergency Fund, targetAmount 15000, currentAmount 14200, targetDate 2026-12-31
  name New Car, targetAmount 8000, currentAmount 2400, targetDate 2027-06-30
  [loans]
  name Loan to Bob, amount 500, interestRate 0, person Bob, dueDate 2026-11-01
  [assets]
  name Honda Civic 2021, value 18500, category Vehicle, acquisitionDate 2022-04-15
  ```
- **Interactive UI Cards**: None.

---

### 12.5 Interactive Chat Cards Protocol

When tools return interactive entities (`cards`), the chat interface renders them directly beneath the AI assistant's text bubble.

```typescript
export type ChatCard =
  | { kind: "transaction"; id: string }
  | { kind: "account"; id: string }
  | { kind: "budget"; id: string }
  | { kind: "recurring"; id: string }
  | { kind: "goal"; id: string }
  | { kind: "loan"; id: string }
  | { kind: "asset"; id: string }
  | { kind: "category"; id: string }
  | { kind: "financial_priority"; id: string }
  | { kind: "change_proposal"; proposalId: string };
```

Cards render from live selectors by id, never from model-written values.

1. **Transaction Card (`kind: "transaction"`)**:
   - Rendered by: `TransactionRow`.
   - Data displayed: Date, merchant name, category icon/color, formatted nominal amount, and converted profile amount.
   - User Action: Tapping opens the full `TransactionDetailSheet` modal to view receipt attachments, edit fields, or duplicate the transaction.
2. **Account Card (`kind: "account"`)**:
   - Rendered by: `AccountCard`.
   - Data displayed: Account name, type badge (bank, card, cash, savings), current balance, currency symbol, credit utilization gauge.
   - User Action: Tapping navigates to `/accounts/[id]`.
3. **Budget Card (`kind: "budget"`)**:
   - Rendered by: `BudgetOverviewCard`.
   - Data displayed: Budget name, spent amount, limit amount, progress bar, days remaining.
   - User Action: Tapping expands the card in place; "open" navigates to `/budgets/[id]`.
4. **Recurring Card (`kind: "recurring"`)**: `RecurringCard` with working process/skip actions.
5. **Goal / Loan / Asset / Category Cards**: compact live summaries (goal progress bar, loan amount and due date, asset value, category type).
6. **Priority Card (`kind: "financial_priority"`)**: localized title, severity color and measured impact from `selectFinancialPriorities`.
7. **Change Proposal Card (`kind: "change_proposal"`)**: `ChangeProposalCard` — before/after values, side effects, warnings, inline editing with real pickers, Cancel and Confirm (destructive styling and a second native confirmation for account deletion). After a confirmed change the chat shows the saved record as a live card.

---

### 12.6 Data Visibility Boundaries: What the Local AI Can vs Cannot See

```
+-----------------------------------------------------------------------------------+
|                           LOCAL AI VISIBILITY MATRIX                              |
+-------------------------------------------------+---------------------------------+
|                   ALLOWED                       |            SHIELDED             |
|                  (Visible)                      |           (Invisible)           |
+-------------------------------------------------+---------------------------------+
| - Nominal & converted transaction amounts       | - Raw SQLite table paths & SQL  |
| - Dates, merchant names & transaction notes     | - Physical disk paths of images |
| - Assigned categories and category trees        | - Raw receipt photo binary data |
| - Account balances, credit limits & card cycles | - Unassigned profile data       |
| - Budget limits, spent amounts & statuses       | - User contact PII / phone nums |
| - Recurring frequencies & upcoming bill dates   | - Encryption keys / device IDs  |
| - Public currency exchange rates                | - Deleted / detached records    |
| - Goals, loans & asset valuations               | - Remote network APIs           |
| - Contact names (never phone / email)           | - Voice audio after transcription |
+-------------------------------------------------+---------------------------------+
```

---

## 13. Derived Metrics, Analytics & Financial Health Rules

The application computes sophisticated analytics on the fly via `report-selectors.ts` without modifying stored data:

### 13.1 Financial Health Score (0–100)

Computed from 5 weighted pillars:

1. **Savings Rate (30 pts)**: Optimal >= 20% of income; penalized if negative (deficit spending).
2. **Budget Discipline (25 pts)**: Ratio of on-track budgets vs overspent/at-risk budgets.
3. **Credit Utilization (20 pts)**: Ratio of credit card debt to total credit limit. Ideal < 30%; critical > 75%.
4. **Emergency Fund (15 pts)**: Cash reserves divided by 6-month average monthly expenses. Ideal >= 3 to 6 months.
5. **Fixed Cost Load (10 pts)**: Recurring commitments divided by monthly income. Ideal < 40%.

- **Health Bands**: `strong` (>= 75 pts), `steady` (50–74 pts), `attention` (< 50 pts).

### 13.2 Rule-Based Insight Triggers (`ReportInsightId`)

The system evaluates financial health rules and emits translatable insight codes:

- `overspending`: Current month expenses exceed income.
- `budgetsOver`: One or more budgets have surpassed 100% consumption.
- `creditHigh`: Card utilization exceeds 50% of available credit limit.
- `lowSavings`: Savings rate is under 5% of monthly income.
- `concentration`: Single category represents over 40% of total monthly expenses.
- `categorySpike`: Category spending increased by > 30% compared to prior month.
- `recurringHeavy`: Subscriptions and fixed commitments exceed 50% of monthly income.
- `creditModerate`: Card utilization is between 30% and 50%.
- `pace`: Daily spending pace projects that monthly expenses will exceed income by cycle end.
- `negativeNetWorth`: Total debts exceed total assets.
- `budgetsAtRisk`: Budget consumption pace indicates it will be breached before cycle end.
- `strongSavings`: Savings rate exceeds 30%.
- `budgetsOnTrack`: All active budgets are comfortably within limits.
- `expensesDown`: Total spending is at least 10% lower than prior month.
- `maintain`: Healthy cash flow with stable metrics across all pillars.

---

## 14. Data Lifecycle, Cascading Rules & Backup Formats

### 14.1 Cascading Deletion & Referential Cleanup

Because records are stored in a normalized relational structure inside JSON, mutating or deleting an entity triggers transactional referential cleanup:

```
[Delete Profile]
       │
       ├──> Deletes all owned Accounts
       │          │
       │          └──> Deletes all associated Transactions & Templates
       │                     │
       │                     └──> Deletes associated disk attachments (receipt images)
       │
       ├──> Deletes all owned Categories (and their recursive child categories)
       ├──> Deletes all owned Budgets & Recurring schedules
       └──> Switches active profile to next available profile
```

- **Account Deletion**:
  - Deletes all transactions where `account == accountId` or `toAccount == accountId`.
  - Clears `linkedBankAccountId` on any card linked to this account.
  - Clears account references from `budgets.accounts`.
- **Category Deletion**:
  - Detaches category from transactions, setting `category = null` and `categoryName = "Uncategorized"`.
  - Re-parents any child categories to `null` (preventing orphan deletion).
  - Removes category from `budgets.categories`.

### 14.2 Backup & Export Specifications

| Format             | File Structure                                            | Attachment Handling                                                | Restore Behavior                                                                        |
| :----------------- | :-------------------------------------------------------- | :----------------------------------------------------------------- | :-------------------------------------------------------------------------------------- |
| **ZIP** (`.zip`)   | Contains `backup.json` and `attachments/*.*`              | Full physical file archive. Every file in manifest must exist.     | Replaces entire database and extracts attachments to sandbox via staged 2-phase commit. |
| **JSON** (`.json`) | Single standalone `backup.json`                           | Media references are stripped. `_local.attachments` is emptied.    | Restores all structured data, preserving unknown fields. Media remains cleared.         |
| **CSV** (`.csv`)   | Spreadsheet tabular format with headers and quoted fields | Receipts omitted. Unrecognized fields preserved in `extra` column. | Merges transactions by `uuid`. Non-transaction collections remain untouched.            |
