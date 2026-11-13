import type { TFunction } from "i18next";

import type { BackupDocument } from "@/data/model/backup-document";
import {
  belongsToProfile,
  createProfileMatcher,
  identity,
} from "@/data/model/category-record";
import type { JsonObject } from "@/data/model/json";
import {
  createTransactionDraft,
  type TransactionDraft,
  type TransactionType,
} from "@/data/model/transaction-record";
import type { Budget } from "@/data/selectors/budget-selectors";
import {
  categoryRootIdIn,
  type Category,
} from "@/data/selectors/category-selectors";
import type { selectAccounts } from "@/data/selectors/document-selectors";
import type { FilledIconName } from "@/shared/ui/filled-icon";

import type { TransactionOption } from "./components/transaction-selection-section";

export type Account = ReturnType<typeof selectAccounts>[number];

export type TransactionThemeTokens = {
  accent: string;
  danger: string;
  success: string;
};

/** Maps each transaction mode to its semantic accent color. */
export function getTransactionTypeTone(
  type: TransactionType,
  theme: TransactionThemeTokens,
): string {
  if (type === 1) return theme.success;
  if (type === 2) return theme.accent;
  return theme.danger;
}

/** Semantic symbol + glyph paired with each transaction mode. */
export function getTransactionTypeVisual(type: TransactionType): {
  symbol: string;
  icon: FilledIconName;
} {
  if (type === 1) return { symbol: "+", icon: "arrow-bottom-left" };
  if (type === 2) return { symbol: "⇄", icon: "swap-horizontal" };
  return { symbol: "−", icon: "arrow-top-right" };
}

export function isSameCalendarDay(a: Date, b: Date): boolean {
  return (
    a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate()
  );
}

export function isTodayDate(date: Date, now = new Date()): boolean {
  return isSameCalendarDay(date, now);
}

export function isYesterdayDate(date: Date, now = new Date()): boolean {
  const yesterday = new Date(now);
  yesterday.setDate(yesterday.getDate() - 1);
  return isSameCalendarDay(date, yesterday);
}

/**
 * Updates only the calendar day to Today or Yesterday while preserving time.
 * Clamps Today to `now` so `maximumDate` invariants remain unbroken.
 */
export function applyQuickDatePreset(
  current: Date,
  preset: "today" | "yesterday",
  now = new Date(),
): Date {
  const target = new Date(now);
  if (preset === "yesterday") target.setDate(target.getDate() - 1);
  const next = new Date(current);
  next.setFullYear(target.getFullYear(), target.getMonth(), target.getDate());
  if (next.getTime() > now.getTime()) return new Date(now);
  return next;
}

export function parseTransactionAmount(amountText: string): number {
  const trimmed = amountText.trim();
  if (!trimmed) return Number.NaN;
  return Number(trimmed.replace(",", "."));
}

/**
 * Applies a source-account selection update, clearing stale FX quote snapshots
 * and resetting an incompatible Transfer destination account when currency changes.
 */
export function resolveAccountSelectionUpdate(
  current: TransactionDraft,
  account: Account | undefined,
  accounts: readonly Account[],
): TransactionDraft {
  const currencyCode = account?.currencyCode ?? current.currencyCode;
  const currentDestination = accounts.find(
    (item) => item.id === current.destinationAccountId,
  );
  const shouldClearDestination =
    current.destinationAccountId === (account?.id ?? "") ||
    (current.type === 2 &&
      Boolean(account) &&
      Boolean(currentDestination) &&
      currentDestination!.currencyCode !== account!.currencyCode);

  return {
    ...current,
    accountId: account?.id ?? "",
    currencyCode,
    accountCurrencyCode: currencyCode,
    exchangeRate: null,
    exchangeRateDate: null,
    exchangeRateFetchedAt: null,
    exchangeRateSource: null,
    conversionSnapshot: null,
    destinationAccountId: shouldClearDestination
      ? ""
      : current.destinationAccountId,
  };
}

export function resolveInitialTransactionDraft({
  sourceDraft,
  isCopy,
  presetBudget,
  accounts,
  defaultAccount,
  paramType,
  activeProfileCurrencyCode,
}: {
  sourceDraft: TransactionDraft | null;
  isCopy: boolean;
  presetBudget: Budget | null | undefined;
  accounts: readonly Account[];
  defaultAccount: Account | undefined;
  paramType?: string;
  activeProfileCurrencyCode: string;
}): TransactionDraft {
  if (sourceDraft) {
    return isCopy
      ? {
          ...sourceDraft,
          conversionSnapshot: null,
          receiptPath: null,
          receiptAttachmentId: null,
        }
      : sourceDraft;
  }
  if (presetBudget) {
    const eligibleAccounts = accounts.filter(
      (account) =>
        account.currencyCode === presetBudget.currencyCode &&
        (!presetBudget.accounts.length ||
          presetBudget.accounts.includes(account.id)),
    );
    const account =
      eligibleAccounts.find((candidate) => candidate.isDefault) ??
      eligibleAccounts[0];

    return {
      ...createTransactionDraft(),
      type: presetBudget.transactionType,
      budgetId: presetBudget.id,
      accountId: account?.id ?? "",
      currencyCode: presetBudget.currencyCode,
      accountCurrencyCode: account?.currencyCode ?? presetBudget.currencyCode,
    };
  }
  const fallbackCurrency =
    defaultAccount?.currencyCode ?? activeProfileCurrencyCode.toUpperCase();
  return {
    ...createTransactionDraft(),
    type:
      paramType === "income" || paramType === "1"
        ? 1
        : paramType === "transfer" || paramType === "2"
          ? 2
          : 0,
    accountId: defaultAccount?.id ?? "",
    currencyCode: fallbackCurrency,
    accountCurrencyCode: fallbackCurrency,
  };
}

/** Defaults to 24-hour time when no device preference (`null`/`undefined`) is set. */
export function resolveUses24HourClock(
  uses24hourClock?: boolean | null,
): boolean {
  return uses24hourClock !== false;
}

export function formatTransactionTime(
  value: Date,
  locale?: string,
  uses24hourClock?: boolean | null,
): string {
  const use24Hour = resolveUses24HourClock(uses24hourClock);
  return value.toLocaleTimeString(
    locale,
    use24Hour
      ? { hour: "2-digit", minute: "2-digit", hourCycle: "h23" }
      : { hour: "2-digit", minute: "2-digit", hour12: true },
  );
}

export function localizeBudgetPeriod(period: string, t: TFunction): string {
  switch (period.toLowerCase()) {
    case "daily":
      return t("transactions.common.periods.daily");
    case "weekly":
      return t("transactions.common.periods.weekly");
    case "monthly":
      return t("transactions.common.periods.monthly");
    case "yearly":
      return t("transactions.common.periods.yearly");
    case "custom":
      return t("transactions.common.periods.custom");
    default:
      return period;
  }
}

export function recordOptions(
  records: JsonObject[],
  profileId: string,
  document: BackupDocument,
  fallbackIcon: string,
  fallbackColor: string,
  fallbackName: string,
): TransactionOption[] {
  return records
    .filter(
      (record) =>
        identity(record) && belongsToProfile(document, record, profileId),
    )
    .map((record) => ({
      id: identity(record),
      name: typeof record.name === "string" ? record.name : fallbackName,
      description:
        typeof record.description === "string" ? record.description : "",
      icon: typeof record.icon === "string" ? record.icon : fallbackIcon,
      iconPath: typeof record.iconPath === "string" ? record.iconPath : null,
      color:
        typeof record.color === "string" && /^#[a-f\d]{6}$/i.test(record.color)
          ? record.color
          : fallbackColor,
    }));
}

export function mapTransactionSaveError(
  reason: unknown,
  t: TFunction,
): string {
  if (!(reason instanceof Error)) return t("transactions.form.saveError");
  switch (reason.message) {
    case "This transaction has an invalid amount.":
      return t("transactions.form.validation.invalidAmount");
    case "Enter a transaction name (up to 100 characters).":
      return t("transactions.form.validation.name");
    case "Enter an amount greater than zero and no more than one trillion.":
      return t("transactions.form.validation.amount");
    case "Choose a valid transaction type.":
      return t("transactions.form.validation.type");
    case "Choose a valid date and time.":
      return t("transactions.form.validation.dateTime");
    case "Choose an account in this profile.":
      return t("transactions.form.validation.account");
    case "Choose a different destination account.":
      return t("transactions.form.validation.destinationAccount");
    case "Transfer accounts must use the same currency.":
      return t("transactions.form.validation.transferCurrency");
    case "Choose the transaction currency again to load its current exchange rate.":
      return t("transactions.form.validation.exchangeRate");
    case "Choose a category for this transaction type.":
      return t("transactions.form.validation.category");
    case "This transaction no longer exists.":
      return t("transactions.form.validation.missing");
    case "This transaction has already been saved.":
      return t("transactions.form.validation.alreadySaved");
    case "This transaction belongs to another profile.":
      return t("transactions.form.validation.wrongProfile");
    case "This account has an invalid balance. Edit the account before saving a transaction.":
      return t("transactions.form.validation.invalidAccountBalance");
    case "This template has already been saved.":
      return t("transactions.form.validation.templateAlreadySaved");
    default: {
      const relationMatch =
        /^Choose a valid (budget|label|loan|place|person) in this profile\.$/.exec(
          reason.message,
        );
      if (relationMatch) {
        const matched = relationMatch[1] as
          | "budget"
          | "label"
          | "loan"
          | "place"
          | "person";
        const key = matched === "person" ? "payee" : matched;
        return t("transactions.form.validation.relation", {
          relation: t(`transactions.common.fields.${key}` as const),
        });
      }
      return reason.message;
    }
  }
}

/**
 * Top-level categories for a type, most used first. Usage counts this
 * profile's own transactions and folds subcategories into their root, so the
 * categories a person actually reaches for sit at their thumb. Ties keep the
 * user's own category order.
 */
export function rankRootCategories(
  document: BackupDocument,
  categories: readonly Category[],
  type: TransactionType,
): Category[] {
  const belongs = createProfileMatcher(document);
  const ids = new Set(categories.map((category) => category.id));
  const usage = new Map<string, number>();
  for (const record of document.transactions) {
    if (!belongs(record) || record.type !== type) continue;
    const categoryId = String(record.category ?? "");
    if (!ids.has(categoryId)) continue;
    const rootId = categoryRootIdIn(categories, categoryId);
    usage.set(rootId, (usage.get(rootId) ?? 0) + 1);
  }
  return categories
    .map((category, index) => ({ category, index }))
    .filter(
      ({ category }) => category.type === type && category.parentId === null,
    )
    .sort(
      (a, b) =>
        (usage.get(b.category.id) ?? 0) - (usage.get(a.category.id) ?? 0) ||
        a.index - b.index,
    )
    .map(({ category }) => category);
}

/** The profile's default account leads the picker; the rest keep their order. */
export function orderAccountsForPicker<T extends { isDefault: boolean }>(
  accounts: readonly T[],
): T[] {
  return [
    ...accounts.filter((account) => account.isDefault),
    ...accounts.filter((account) => !account.isDefault),
  ];
}

/**
 * The name a transaction gets when the user leaves it empty: its category, or
 * the route of a transfer. Shown as the name placeholder, so it is never a
 * surprise, and it lets amount + category be a complete entry.
 */
export function fallbackTransactionName({
  type,
  categoryName,
  fromName,
  toName,
  arrow = "→",
}: {
  type: TransactionType;
  categoryName?: string | null;
  fromName?: string | null;
  toName?: string | null;
  arrow?: string;
}): string {
  // Saved names are limited to 100 characters.
  const name =
    type === 2
      ? fromName && toName
        ? `${fromName} ${arrow} ${toName}`
        : ""
      : (categoryName?.trim() ?? "");
  return name.slice(0, 100).trim();
}

/** True when a save attempt would pass the record's own validation rules. */
export function isTransactionDraftReady({
  draft,
  name,
  hasAccount,
  hasDestination,
  rateLoading,
}: {
  draft: TransactionDraft;
  name: string;
  hasAccount: boolean;
  hasDestination: boolean;
  rateLoading: boolean;
}): boolean {
  const amount = parseTransactionAmount(draft.amount);
  return (
    Number.isFinite(amount) &&
    amount > 0 &&
    amount <= 1e12 &&
    name.trim().length > 0 &&
    name.trim().length <= 100 &&
    hasAccount &&
    (draft.type !== 2 || hasDestination) &&
    !rateLoading
  );
}
