import { selectCatalogAccountTotals } from "../database/fast-store-client";
import {
  getDocumentWindowState,
  parseRecordTimestampMs,
} from "../database/month-index";
import { financialMonth } from "../model/financial-month";
import {
  createRecordLookup,
  selectPeriodTransactionCandidates,
  transactionTimestamps,
} from "./transaction-selectors";
import { memoizeForDocument } from "./document-memo";
import { filterProjection, finishProjection } from "./cooperative";
import { ACCOUNT_ICONS } from "@/features/accounts/account-options";
import { isBrandIconName } from "@/shared/icons/brand-icon-registry";
import { selectBudgets } from "./budget-selectors";
import { selectExchangeQuote } from "./exchange-rate-selectors";
import {
  profileCurrency,
  transactionMoney,
} from "../model/transaction-conversion";
import {
  iterateRecurrings,
  iterateRecurringEvents,
} from "./recurring-selectors";
import type {
  Account,
  AccountPeriod,
  AccountTransaction,
  CreditCardBillingCycle,
} from "@/features/accounts/types";
import { dueDateInMonth } from "../model/card-payment";
import type { BudgetCategory } from "@/features/home/types";
import type { DailySpend, SpendingCategory } from "@/features/reports/types";
import { i18n } from "@/localization/i18n";
import type { AccountDraft } from "../model/account-record";
import {
  identity,
  references,
  categoryParent,
  createProfileMatcher,
} from "../model/category-record";
import {
  getSavingsAccountSummary,
  savingsDetailsToDraft,
} from "../model/savings-account";

import type { BackupDocument } from "../model/backup-document";
import type { JsonObject, JsonValue } from "../model/json";
import { readAIChat, type AIChat } from "../model/ai-chat-record";

export { selectTransaction, selectTransactions } from "./transaction-selectors";
export {
  selectBudgetCurrency,
  selectBudgetOptions,
  selectBudgets,
  type BudgetOptionRecord,
} from "./budget-selectors";
export {
  selectWidgetSnapshot,
  type WidgetAccountItem,
  type WidgetLabels,
  type WidgetProfileSnapshot,
  type WidgetSnapshot,
} from "./widget-selectors";
export {
  recurringTotals,
  selectHomeRecurringPayments,
  selectRecurringEvents,
  selectRecurringRelations,
  selectRecurringSummary,
  selectRecurrings,
} from "./recurring-selectors";
export {
  categoryDescendants,
  categoryHasChildren,
  categoryRootIdIn,
  selectCategories,
  selectCategoryRootId,
  selectCategoryMonthlyTotals,
  selectCategoryTransactions,
  selectTopLevelCategories,
} from "./category-selectors";

const colors = ["#70d2eb", "#b89cf5", "#f2c66d", "#ef8175"];

export function selectAppPreferences(document: BackupDocument) {
  const { appLanguage, mainCurrency, dateFormat, monthStartDay, weekStartDay } =
    document._local;
  return { appLanguage, mainCurrency, dateFormat, monthStartDay, weekStartDay };
}

function text(value: JsonValue | undefined, fallback = "") {
  return typeof value === "string" ? value : fallback;
}

function number(value: JsonValue | undefined, fallback = 0) {
  return typeof value === "number" && Number.isFinite(value) ? value : fallback;
}

function recordId(record: JsonObject, index: number) {
  return text(record.uuid, String(record.id ?? index));
}

function lookupName(records: JsonObject[], id: JsonValue | undefined) {
  if (id == null) return i18n.t("common.uncategorized");
  const record = records.find((item) => references(item, id));
  return record
    ? text(record.name, i18n.t("common.uncategorized"))
    : String(id);
}

function ownedAccountRecords(document: BackupDocument) {
  const profileId = document._local.selectedProfileId;
  const owner = document.users.find(
    (user) => String(user.uuid ?? user.id) === profileId,
  );
  return document.accounts.filter(
    (record) =>
      !profileId ||
      record.user == null ||
      record.user === profileId ||
      (owner?.id != null && record.user === owner.id),
  );
}

/** Mirrors `ownedAccountRecords`: unassigned records belong to every profile. */
export function selectProfileRecordCounts(
  document: BackupDocument,
  profileId: string,
) {
  const owner = document.users.find(
    (user) => String(user.uuid ?? user.id) === profileId,
  );
  const owns = (record: JsonObject) =>
    record.user == null ||
    record.user === profileId ||
    (owner?.id != null && record.user === owner.id);

  return {
    accounts: document.accounts.filter(owns).length,
    transactions: document.transactions.filter(owns).length,
  };
}

/** The profile's saved ChatGPT chats: pinned first, then most recent activity. */
export function selectAIChats(document: BackupDocument, profileId: string): AIChat[] {
  const owner = document.users.find((user) => String(user.uuid ?? user.id) === profileId);
  const aliases = new Set([profileId, ...(owner?.id != null ? [String(owner.id)] : [])]);
  return document.aiChats
    .filter((record) => record.user != null && aliases.has(String(record.user)))
    .map(readAIChat)
    .filter((chat) => chat !== null)
    .sort((a, b) => Number(b.pinned) - Number(a.pinned) || b.lastMessageAt.localeCompare(a.lastMessageAt));
}

function accountBalance(record: JsonObject, index: number) {
  return {
    id: recordId(record, index),
    balance: number(record.amount),
    currencyCode: /^[A-Z]{3}$/.test(text(record.currencyCode).toUpperCase())
      ? text(record.currencyCode).toUpperCase()
      : "USD",
    isExcluded: record.isExcluded === true,
  };
}

/** Home needs balances, not four all-history scans for each account. */
export function selectAccountBalances(document: BackupDocument) {
  return memoizeForDocument(document, "account-balances", () =>
    ownedAccountRecords(document).map(accountBalance),
  );
}

/** Calculate the billing cycle for a credit card based on its user-configured monthly paymentDay. */
export function getCreditCardBillingCycle(
  paymentDay: number,
  anchor: Date | string = new Date(),
): CreditCardBillingCycle {
  const anchorDate =
    anchor instanceof Date && !Number.isNaN(anchor.getTime())
      ? anchor
      : typeof anchor === "string" && !Number.isNaN(new Date(anchor).getTime())
        ? new Date(anchor)
        : new Date();
  const currentDay = anchorDate.getDate();
  const currentYear = anchorDate.getFullYear();
  const currentMonth = anchorDate.getMonth();

  const thisMonthDueDay = dueDateInMonth(anchorDate, paymentDay);

  let nextPaymentYear = currentYear;
  let nextPaymentMonth = currentMonth;
  let cycleStartYear = currentYear;
  let cycleStartMonth = currentMonth;

  if (currentDay >= thisMonthDueDay) {
    nextPaymentMonth = currentMonth + 1;
    cycleStartMonth = currentMonth;
  } else {
    nextPaymentMonth = currentMonth;
    cycleStartMonth = currentMonth - 1;
  }

  const nextPaymentMonthDate = new Date(nextPaymentYear, nextPaymentMonth, 1);
  const nextPaymentDueDay = dueDateInMonth(nextPaymentMonthDate, paymentDay);
  const nextPaymentDate = new Date(
    nextPaymentMonthDate.getFullYear(),
    nextPaymentMonthDate.getMonth(),
    nextPaymentDueDay,
    12,
    0,
    0,
    0,
  );

  const cycleStartMonthDate = new Date(cycleStartYear, cycleStartMonth, 1);
  const cycleStartDueDay = dueDateInMonth(cycleStartMonthDate, paymentDay);
  const cycleStartDate = new Date(
    cycleStartMonthDate.getFullYear(),
    cycleStartMonthDate.getMonth(),
    cycleStartDueDay,
    0,
    0,
    0,
    0,
  );

  const cycleEndDate = new Date(
    nextPaymentDate.getFullYear(),
    nextPaymentDate.getMonth(),
    nextPaymentDate.getDate() - 1,
    23,
    59,
    59,
    999,
  );

  const todayMidnight = new Date(
    currentYear,
    currentMonth,
    currentDay,
    0,
    0,
    0,
    0,
  ).getTime();
  const paymentMidnight = new Date(
    nextPaymentDate.getFullYear(),
    nextPaymentDate.getMonth(),
    nextPaymentDate.getDate(),
    0,
    0,
    0,
    0,
  ).getTime();
  const daysUntilPayment = Math.max(
    0,
    Math.round((paymentMidnight - todayMidnight) / (1000 * 60 * 60 * 24)),
  );

  return {
    cycleStart: cycleStartDate,
    cycleEnd: cycleEndDate,
    nextPaymentDate,
    daysUntilPayment,
  };
}

function accountKind(record: JsonObject): Account["kind"] {
  const normalized =
    `${text(record.name)} ${text(record.bankName, i18n.t("common.localAccount"))}`.toLowerCase();
  return record.accountType === "card"
    ? "credit"
    : record.accountType === "bank"
      ? "bank"
      : record.accountType === "cash"
        ? "cash"
        : record.accountType === "savings"
          ? "savings"
          : record.type === 1
            ? "cash"
            : record.type === 2
              ? "savings"
              : normalized.includes("credit")
                ? "credit"
                : normalized.includes("saving")
                  ? "savings"
                  : "checking";
}

function accountPaymentDay(record: JsonObject) {
  return typeof record.paymentDay === "number" &&
    Number.isInteger(record.paymentDay) &&
    record.paymentDay >= 1 &&
    record.paymentDay <= 31
    ? record.paymentDay
    : null;
}

export function selectAccounts(
  document: BackupDocument,
  now = new Date(),
): Account[] {
  const dayKey = `${now.getFullYear()}-${now.getMonth()}-${now.getDate()}`;
  return memoizeForDocument(
    document,
    `accounts:${dayKey}:${i18n.resolvedLanguage ?? ""}`,
    () => {
      const users = createRecordLookup(document.users);
      const allAccounts = createRecordLookup(document.accounts);
      const localAccountLabel = i18n.t("common.localAccount");

      return ownedAccountRecords(document).map((record, index) => {
        const institution = text(record.bankName, localAccountLabel);
        const kind = accountKind(record);
        const storedIcon = text(record.icon);
        const storedIconPath = text(record.iconPath);
        const materialIconIsValid =
          storedIcon.startsWith("material:") &&
          /^[Mm]/.test(storedIconPath) &&
          storedIconPath.length <= 20_000;

        const paymentDay = accountPaymentDay(record);
        const isCredit = kind === "credit";
        const billingCycle =
          isCredit && paymentDay != null
            ? getCreditCardBillingCycle(paymentDay, now)
            : null;
        const creditLimit =
          isCredit &&
          typeof record.creditLimit === "number" &&
          Number.isFinite(record.creditLimit)
            ? record.creditLimit
            : null;
        const activity = accountActivityTotals(
          document,
          record,
          billingCycle,
          now,
        );
        // The spending frame follows this billing cycle's purchases and refunds,
        // independently of the persisted outstanding balance and payout transfers.
        const currentSpent = isCredit
          ? Math.max(0, activity.cycleExpense - activity.cycleIncome)
          : 0;
        const availableCredit =
          isCredit && creditLimit != null ? creditLimit - currentSpent : null;
        const isOverdraft =
          isCredit && creditLimit != null ? currentSpent > creditLimit : false;
        const overdraftAmount =
          isCredit && creditLimit != null
            ? Math.max(0, currentSpent - creditLimit)
            : 0;
        const creditUtilization =
          isCredit && creditLimit != null && creditLimit > 0
            ? Math.round((currentSpent / creditLimit) * 100)
            : 0;

        return {
          ...accountBalance(record, index),
          accountNumber: text(record.accountNumber),
          ownerName: text(users.get(record.user)?.name),
          ...activity,
          name: text(record.name, `Account ${index + 1}`),
          institution,
          kind,
          savingsSummary:
            kind === "savings"
              ? getSavingsAccountSummary(
                  number(record.amount),
                  record.savingsDetails,
                )
              : null,
          lastFour: text(record.cardLastFour, text(record.accountNumber)).slice(
            -4,
          ),
          icon:
            materialIconIsValid || isBrandIconName(storedIcon)
              ? storedIcon
              : (ACCOUNT_ICONS.find(
                  (icon) =>
                    !icon.name.startsWith("material:") &&
                    icon.name === record.icon,
                )?.name ??
                (kind === "cash"
                  ? "cash"
                  : kind === "credit"
                    ? "credit-card"
                    : kind === "savings"
                      ? "piggy-bank"
                      : "bank")),
          iconPath: materialIconIsValid ? storedIconPath : null,
          color: /^#[a-f\d]{6}$/i.test(text(record.color))
            ? text(record.color)
            : colors[index % colors.length],
          iconBackground: /^#[a-f\d]{6}$/i.test(text(record.color))
            ? `${text(record.color)}26`
            : ["#17343c", "#2f2942", "#3b3020", "#402523"][index % 4],
          isDefault: record.isDefault === true,
          cardCompany: text(record.cardCompany),
          bankName: text(record.bankName),
          linkedBankAccountId:
            typeof record.linkedBankAccountId === "string"
              ? record.linkedBankAccountId
              : null,
          linkedBankAccountName: text(
            allAccounts.get(record.linkedBankAccountId)?.name,
          ),
          paymentDay,
          creditLimit,
          currentSpent,
          availableCredit,
          isOverdraft,
          overdraftAmount,
          creditUtilization,
          billingCycle,
        };
      });
    },
  );
}

/**
 * Transactions grouped by their raw `account` value in one pass per committed
 * document. Map keys use SameValueZero, matching a strict
 * `transaction.account === account.uuid/id` comparison (a numeric id never matches its string form).
 */
function transactionsByAccountValue(document: BackupDocument) {
  return memoizeForDocument(document, "transactions-by-account", () => {
    const groups = new Map<JsonValue, number[]>();
    document.transactions.forEach((item, position) => {
      if (item.account == null) return;
      const group = groups.get(item.account);
      if (group) group.push(position);
      else groups.set(item.account, [position]);
    });
    return groups;
  });
}

function accountIdentityKeys(account: JsonObject): JsonValue[] {
  return [account.uuid, account.id].filter(
    (id, index, all) => id != null && all.indexOf(id) === index,
  ) as JsonValue[];
}

/** Positions, in document order, of transactions with `account === uuid/id`. */
function selectAccountPositions(document: BackupDocument, account: JsonObject) {
  const groups = transactionsByAccountValue(document);
  const keys = accountIdentityKeys(account);
  const positions = keys.flatMap((key) => groups.get(key) ?? []);
  if (keys.length > 1) positions.sort((a, b) => a - b);
  return positions;
}

function accountActivityTotals(
  document: BackupDocument,
  account: JsonObject,
  billingCycle: CreditCardBillingCycle | null = null,
  now = new Date(),
) {
  const positions = selectAccountPositions(document, account);
  const timestamps = transactionTimestamps(document);
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1).getTime();
  const monthEnd = new Date(now.getFullYear(), now.getMonth() + 1, 1).getTime();
  const cycleStart = billingCycle ? billingCycle.cycleStart.getTime() : monthStart;
  const cycleEnd = billingCycle ? billingCycle.cycleEnd.getTime() : monthEnd;

  const catalogTotals = getDocumentWindowState(document)?.isPartial
    ? selectCatalogAccountTotals(document)
    : null;

  let income = 0;
  let expense = 0;
  if (catalogTotals) {
    for (const key of accountIdentityKeys(account)) {
      const stats = catalogTotals.get(String(key));
      if (stats) {
        income += stats.income;
        expense += stats.expense;
      }
    }
  }

  let monthlyIncome = 0;
  let monthlyExpense = 0;
  let cycleIncome = 0;
  let cycleExpense = 0;

  for (let i = 0; i < positions.length; i++) {
    const position = positions[i];
    const item = document.transactions[position];
    const type = item.type;
    if (type !== 0 && type !== 1) continue;
    const amount = Math.abs(number(item.accountAmount, number(item.amount)));
    const timestamp = timestamps[position];
    const hasTs = Number.isFinite(timestamp);
    const inMonth = hasTs && timestamp >= monthStart && timestamp < monthEnd;
    const inCycle = billingCycle
      ? hasTs && timestamp >= cycleStart && timestamp <= cycleEnd
      : inMonth;

    if (type === 1) {
      if (!catalogTotals) income += amount;
      if (inMonth) monthlyIncome += amount;
      if (inCycle) cycleIncome += amount;
    } else {
      if (!catalogTotals) expense += amount;
      if (inMonth) monthlyExpense += amount;
      if (inCycle) cycleExpense += amount;
    }
  }

  return {
    income,
    expense,
    monthlyIncome,
    monthlyExpense,
    cycleIncome,
    cycleExpense,
  };
}

function findOwnedAccount(document: BackupDocument, accountId: string) {
  return ownedAccountRecords(document).find(
    (item) => String(item.uuid ?? item.id) === accountId,
  );
}

export function selectAccountTransactionCount(
  document: BackupDocument,
  accountId: string,
) {
  const account = findOwnedAccount(document, accountId);
  if (!account) return 0;
  const catalogTotals = getDocumentWindowState(document)?.isPartial
    ? selectCatalogAccountTotals(document)
    : null;
  if (catalogTotals) {
    let count = 0;
    for (const key of accountIdentityKeys(account)) {
      count += catalogTotals.get(String(key))?.count ?? 0;
    }
    return count;
  }
  return selectAccountPositions(document, account).length;
}

export function selectAccountTransactions(
  document: BackupDocument,
  accountId: string,
  period?: { period: AccountPeriod; anchor: Date },
): AccountTransaction[] {
  const periodKey = period
    ? `${period.period}:${period.anchor.getFullYear()}-${period.anchor.getMonth()}-${period.anchor.getDate()}`
    : "all";
  return memoizeForDocument(
    document,
    `account-tx:${accountId}:${periodKey}:${i18n.resolvedLanguage ?? ""}`,
    () => {
      const record = findOwnedAccount(document, accountId);
      if (!record) return [];
      const account = accountBalance(record, 0);
      const paymentDay =
        accountKind(record) === "credit" ? accountPaymentDay(record) : null;
      const range = period
        ? accountPeriodRange(period.period, period.anchor, paymentDay)
        : null;
      const rangeStart = range ? range.start.getTime() : -Infinity;
      const rangeEnd = range ? range.end.getTime() : Infinity;
      const categories = createRecordLookup(document.categories);
      const untitledLabel = i18n.t("common.untitledTransaction");
      const uncategorizedLabel = i18n.t("common.uncategorized");
      const results: AccountTransaction[] = [];
      const positions = selectAccountPositions(document, record);
      const timestamps = transactionTimestamps(document);

      for (let i = 0; i < positions.length; i++) {
        const position = positions[i];
        const item = document.transactions[position];
        const timestamp = timestamps[position];
        if (range) {
          if (
            !Number.isFinite(timestamp) ||
            timestamp < rangeStart ||
            timestamp >= rangeEnd
          ) {
            continue;
          }
        }
        const categoryRecord = categories.get(item.category);
        const category = text(
          item.categoryName,
          categoryRecord
            ? text(categoryRecord.name, uncategorizedLabel)
            : item.category == null
              ? uncategorizedLabel
              : String(item.category),
        );
        const type =
          item.type === 1 ? "income" : item.type === 0 ? "expense" : "transfer";
        const code = text(item.currencyCode).toUpperCase();
        results.push({
          id: recordId(item, results.length),
          name: text(item.name, untitledLabel),
          category,
          amount: Math.abs(number(item.amount)),
          type,
          currencyCode: /^[A-Z]{3}$/.test(code) ? code : account.currencyCode,
          timestamp: Number.isFinite(timestamp) ? timestamp : null,
        });
      }

      return results.sort(
        (a, b) => (b.timestamp ?? -Infinity) - (a.timestamp ?? -Infinity),
      );
    },
  );
}

export function accountPeriodRange(
  period: AccountPeriod,
  anchor: Date,
  paymentDay: number | null = null,
) {
  if (
    period === "Monthly" &&
    paymentDay != null &&
    Number.isInteger(paymentDay) &&
    paymentDay >= 1 &&
    paymentDay <= 31
  ) {
    const cycle = getCreditCardBillingCycle(paymentDay, anchor);
    const end = new Date(cycle.nextPaymentDate);
    end.setHours(0, 0, 0, 0);
    return { start: cycle.cycleStart, end };
  }
  const start = new Date(
    anchor.getFullYear(),
    anchor.getMonth(),
    anchor.getDate(),
  );
  if (period === "Weekly")
    start.setDate(start.getDate() - ((start.getDay() + 6) % 7));
  if (period === "Monthly") start.setDate(1);
  if (period === "Yearly") start.setMonth(0, 1);
  const end = new Date(start);
  if (period === "Yearly") end.setFullYear(end.getFullYear() + 1);
  else if (period === "Monthly") end.setMonth(end.getMonth() + 1);
  else end.setDate(end.getDate() + (period === "Weekly" ? 7 : 1));
  return { start, end };
}

export function shiftAccountPeriodAnchor(
  period: AccountPeriod,
  anchor: Date,
  direction: number,
  paymentDay: number | null = null,
) {
  const { start } = accountPeriodRange(period, anchor, paymentDay);
  const next = new Date(start);
  if (period === "Monthly") {
    // Starting at day 1 avoids skipping February when the payout day is 29–31.
    next.setDate(1);
    next.setMonth(next.getMonth() + direction);
    if (
      paymentDay != null &&
      Number.isInteger(paymentDay) &&
      paymentDay >= 1 &&
      paymentDay <= 31
    )
      next.setDate(dueDateInMonth(next, paymentDay));
  } else if (period === "Yearly")
    next.setFullYear(next.getFullYear() + direction);
  else next.setDate(next.getDate() + direction * (period === "Weekly" ? 7 : 1));
  return next;
}

export function filterAccountTransactions(
  transactions: AccountTransaction[],
  period: AccountPeriod,
  anchor: Date,
) {
  const { start, end } = accountPeriodRange(period, anchor);
  return transactions.filter(
    (item) =>
      item.timestamp != null &&
      item.timestamp >= start.getTime() &&
      item.timestamp < end.getTime(),
  );
}

export function selectAccountDraft(
  document: BackupDocument,
  id: string,
): AccountDraft | null {
  const account = selectAccounts(document).find((item) => item.id === id);
  const record = document.accounts.find(
    (item) => String(item.uuid ?? item.id) === id,
  );
  if (!account) return null;
  return {
    name: account.name,
    amount: String(account.balance),
    accountNumber: account.accountNumber,
    accountType:
      account.kind === "cash"
        ? "cash"
        : account.kind === "savings"
          ? "savings"
          : account.kind === "bank" || account.kind === "checking"
            ? "bank"
            : "card",
    currencyCode: account.currencyCode,
    icon: account.icon,
    iconPath: account.iconPath,
    color: account.color,
    isDefault: account.isDefault,
    isExcluded: account.isExcluded,
    cardLastFour: account.lastFour,
    cardCompany: account.cardCompany,
    paymentDay: account.paymentDay,
    creditLimit:
      typeof record?.creditLimit === "number" &&
      Number.isFinite(record.creditLimit)
        ? String(record.creditLimit)
        : "",
    bankName: account.bankName,
    linkedBankAccountId: account.linkedBankAccountId,
    savingsDetails: savingsDetailsToDraft(record?.savingsDetails),
  };
}

export function selectBankAccounts(document: BackupDocument): Account[] {
  return memoizeForDocument(document, "bank-accounts", () => {
    const bankIds = new Set<string>();
    for (const record of document.accounts) {
      if (record.accountType === "bank") {
        bankIds.add(String(record.uuid ?? record.id));
      }
    }
    if (bankIds.size === 0) return [];
    return selectAccounts(document).filter((account) => bankIds.has(account.id));
  });
}

export function selectAccountTotals(accounts: Account[]) {
  const included = accounts.filter((account) => !account.isExcluded);
  const assets = included.reduce(
    (total, account) => total + Math.max(account.balance, 0),
    0,
  );
  const liabilities = included.reduce(
    (total, account) => total + Math.abs(Math.min(account.balance, 0)),
    0,
  );
  return {
    assets,
    liabilities,
    netWorth: assets - liabilities,
    monthlyChangePercent: 0,
  };
}

export function selectAccountTotalsByCurrency(accounts: Account[]) {
  return [...new Set(accounts.map((account) => account.currencyCode))].map(
    (currencyCode) => ({
      currencyCode,
      ...selectAccountTotals(
        accounts.filter((account) => account.currencyCode === currencyCode),
      ),
    }),
  );
}

/** Home projections only use device records and saved currency quotes. */
export function selectHomeOverview(
  document: BackupDocument,
  currencyCode: string,
  now = new Date(),
) {
  return memoizeForDocument(
    document,
    `home-overview:${currencyCode.toUpperCase()}:${now.getTime()}`,
    () => finishProjection(iterateHomeOverview(document, currencyCode, now)),
  );
}

export function* iterateHomeOverview(
  document: BackupDocument,
  currencyCode: string,
  now: Date,
  transactions?: Iterable<JsonObject>,
) {
  const belongs = createProfileMatcher(document);
  const currency = currencyCode.toUpperCase();
  const { start: monthStart, end: monthEnd } = financialMonth(
    now,
    document._local.monthStartDay,
  );
  const monthStartMs = monthStart.getTime();
  const nowMs = now.getTime();
  const sourceTransactions =
    transactions ??
    selectPeriodTransactionCandidates(document, monthStart, monthEnd);
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const upcomingEnd = new Date(
    now.getFullYear(),
    now.getMonth(),
    now.getDate() + 30,
  );
  const accounts = selectAccountBalances(document).filter(
    (account) => !account.isExcluded,
  );
  const includedAccountIds = new Set(accounts.map((account) => account.id));
  const rates = new Map<string, { rate: number; date: string } | null>();
  function quote(code: string) {
    if (!rates.has(code)) {
      const direct = selectExchangeQuote(document, code, currency, now);
      const inverse = direct
        ? null
        : selectExchangeQuote(document, currency, code, now);
      rates.set(
        code,
        direct ??
          (inverse ? { rate: 1 / inverse.rate, date: inverse.date } : null),
      );
    }
    return rates.get(code) ?? null;
  }
  function sum(
    values: { amount: number; currencyCode: string; date?: string | null }[],
  ) {
    let amount = 0;
    const unconverted = new Map<string, number>();
    const rateDates = new Set<string>();
    for (const value of values) {
      if (!Number.isFinite(value.amount) || value.amount === 0) continue;
      const code = value.currencyCode.toUpperCase();
      if (value.date) rateDates.add(value.date);
      if (code === currency) amount += value.amount;
      else {
        const rate = quote(code);
        if (rate && Number.isFinite(value.amount * rate.rate)) {
          amount += value.amount * rate.rate;
          rateDates.add(rate.date);
        } else {
          unconverted.set(code, (unconverted.get(code) ?? 0) + value.amount);
        }
      }
    }
    return {
      amount,
      currencyCode: currency,
      unconverted: [...unconverted].map(([currencyCode, amount]) => ({
        currencyCode,
        amount,
      })),
      rateDate: [...rateDates].sort()[0] ?? null,
    };
  }
  const accountRecords = createRecordLookup(document.accounts);
  const income: {
    amount: number;
    currencyCode: string;
    date?: string | null;
  }[] = [];
  const expense: typeof income = [];
  let transactionCount = 0;
  let position = 0;
  for (const record of sourceTransactions) {
    if (position++ % 64 === 0) yield;
    if (!belongs(record) || record.type === 2) continue;
    const timestamp = parseRecordTimestampMs(record);
    if (!Number.isFinite(timestamp) || timestamp < monthStartMs || timestamp > nowMs)
      continue;
    const account = accountRecords.get(
      record.account ?? record.fromAccount ?? record.sourceAccount,
    );
    if (account && !includedAccountIds.has(identity(account)))
      continue;
    transactionCount++;
    const code = text(
      record.accountCurrencyCode,
      text(account?.currencyCode, text(record.currencyCode, "USD")),
    ).toUpperCase();
    const amount = Math.abs(
      number(record.accountAmount, Math.abs(number(record.amount))),
    );
    const currencyCode = /^[A-Z]{3}$/.test(code) ? code : "USD";
    const totals = record.type === 1 ? income : expense;
    totals.push(transactionMoney(record, currency) ?? { amount, currencyCode });
  }
  const money = (totals: Map<string, number>) =>
    [...totals].map(([currencyCode, amount]) => ({ currencyCode, amount }));
  const recurrings = yield* filterProjection(
    yield* iterateRecurrings(document, now),
    (recurring) => {
      const account = accountRecords.get(recurring.record.account);
      return !account || (belongs(account) && account.isExcluded !== true);
    },
  );
  const upcoming = yield* filterProjection(
    yield* iterateRecurringEvents(recurrings, today, upcomingEnd),
    (event) => event.status === "pending",
  );
  const upcomingExpenseTotals = new Map<string, number>();
  const upcomingIncomeTotals = new Map<string, number>();
  for (let index = 0; index < upcoming.length; index++) {
    if (index % 64 === 0) yield;
    const event = upcoming[index];
    const totals =
      event.type === 1 ? upcomingIncomeTotals : upcomingExpenseTotals;
    if (Number.isFinite(event.amount))
      totals.set(
        event.currencyCode,
        (totals.get(event.currencyCode) ?? 0) + event.amount,
      );
  }
  const upcomingExpense = money(upcomingExpenseTotals),
    upcomingIncome = money(upcomingIncomeTotals);
  const next = upcoming[0];
  return {
    currencyCode: currency,
    accountCount: accounts.length,
    balance: sum(
      accounts.map((a) => ({
        amount: a.balance,
        currencyCode: a.currencyCode,
      })),
    ),
    assets: sum(
      accounts.map((a) => ({
        amount: Math.max(0, a.balance),
        currencyCode: a.currencyCode,
      })),
    ),
    debt: sum(
      accounts.map((a) => ({
        amount: Math.abs(Math.min(0, a.balance)),
        currencyCode: a.currencyCode,
      })),
    ),
    income: sum(income),
    expense: sum(expense),
    net: sum([
      ...income,
      ...expense.map((value) => ({ ...value, amount: -value.amount })),
    ]),
    dailyExpense: sum(
      expense.map((value) => ({
        ...value,
        amount:
          value.amount /
          (1 +
            Math.round(
              (Date.UTC(now.getFullYear(), now.getMonth(), now.getDate()) -
                Date.UTC(
                  monthStart.getFullYear(),
                  monthStart.getMonth(),
                  monthStart.getDate(),
                )) /
                86_400_000,
            )),
      })),
    ),
    transactionCount,
    upcomingExpense: sum(upcomingExpense),
    upcomingIncome: sum(upcomingIncome),
    upcomingNet: sum([
      ...upcomingIncome,
      ...upcomingExpense.map((value) => ({ ...value, amount: -value.amount })),
    ]),
    upcomingCount: upcoming.length,
    overdueCount: recurrings.filter(
      (r) => !r.archived && r.valid && r.next && r.next < today,
    ).length,
    next: next ? { name: next.recurring.name, date: next.date } : null,
  };
}

export type HomeOverview = ReturnType<typeof selectHomeOverview>;
export type HomeMoney = HomeOverview["balance"];

/** Active expense budgets that are over budget or below their daily plan come first. */
export function selectTrackedBudgets(
  document: BackupDocument,
  now = new Date(),
) {
  return selectBudgets(document, now, { homeOnly: true })
    .filter((budget) => budget.showOnHome)
    .sort(compareTrackedBudgets);
}

export function compareTrackedBudgets(
  a: ReturnType<typeof selectBudgets>[number],
  b: ReturnType<typeof selectBudgets>[number],
) {
  const priority = (budget: ReturnType<typeof selectBudgets>[number]) => {
    if (!budget.active) return 0;
    if (budget.transactionType !== 0) return 1;
    if (budget.remaining < 0) return 4;
    return budget.dailyAllowance < budget.dailyPlan ? 3 : 2;
  };
  return (
    priority(b) - priority(a) ||
    b.percent - a.percent ||
    a.id.localeCompare(b.id)
  );
}

// Exclusion affects calculations; records remain visible in activity and search.
function selectIncludedPredicate(document: BackupDocument) {
  return memoizeForDocument(document, "included-tx-predicate", () => {
    const belongs = createProfileMatcher(document);
    const excludedIds = new Set<JsonValue>(
      document.accounts
        .filter((account) => account.isExcluded === true)
        .flatMap((account) => [account.uuid, account.id])
        .filter((id) => id != null),
    );
    const reportCurrency = profileCurrency(
      document,
      document._local.selectedProfileId ?? "",
    );
    const isIncluded = (transaction: JsonObject) =>
      transaction.type !== 2 &&
      !excludedIds.has(transaction.account) &&
      belongs(transaction);
    return { isIncluded, reportCurrency };
  });
}

function reportingAmountFor(currency: string, transaction: JsonObject) {
  const money = transactionMoney(transaction, currency);
  // Legacy records with no historical rate keep their existing calculation.
  return (
    money?.amount ??
    Math.abs(number(transaction.accountAmount, number(transaction.amount)))
  );
}

/** Income and expense totals for an arbitrary window, in the profile currency. */
export function selectMonthlyLedger(
  document: BackupDocument,
  start: Date,
  end: Date,
  now = new Date(),
) {
  const startMs = start.getTime();
  const endMs = end.getTime();
  const nowMs = now.getTime();
  return memoizeForDocument(
    document,
    `monthly-ledger:${startMs}:${endMs}:${nowMs}`,
    () => {
      if (startMs >= endMs || nowMs < startMs) {
        return { income: 0, expense: 0 };
      }
      const { isIncluded, reportCurrency } = selectIncludedPredicate(document);
      let income = 0;
      let expense = 0;
      for (const record of selectPeriodTransactionCandidates(
        document,
        start,
        end,
      )) {
        if (!isIncluded(record)) continue;
        const ts = parseRecordTimestampMs(record);
        if (!Number.isFinite(ts) || ts < startMs || ts >= endMs || ts > nowMs)
          continue;
        const amount = reportingAmountFor(reportCurrency, record);
        if (number(record.type) === 1) income += amount;
        else expense += amount;
      }
      return { income, expense };
    },
  );
}

/** Flat per-transaction facts for a window, used for counts and extremes. */
export function selectPeriodTransactions(
  document: BackupDocument,
  start: Date,
  end: Date,
  now = new Date(),
) {
  const startMs = start.getTime();
  const endMs = end.getTime();
  const nowMs = now.getTime();
  return memoizeForDocument(
    document,
    `period-tx:${startMs}:${endMs}:${nowMs}:${i18n.resolvedLanguage ?? ""}`,
    () => {
      if (startMs >= endMs || nowMs < startMs) return [];
      const { isIncluded, reportCurrency } = selectIncludedPredicate(document);
      const categories = createRecordLookup(document.categories);
      const uncategorized = i18n.t("common.uncategorized");
      const entries: {
        id: string;
        label: string;
        amount: number;
        isIncome: boolean;
        day: string;
      }[] = [];
      for (const record of selectPeriodTransactionCandidates(
        document,
        start,
        end,
      )) {
        if (!isIncluded(record)) continue;
        const ts = parseRecordTimestampMs(record);
        if (!Number.isFinite(ts) || ts < startMs || ts >= endMs || ts > nowMs)
          continue;
        const catRecord = categories.get(record.category);
        const catLabel = catRecord
          ? text(catRecord.name, uncategorized)
          : record.category == null
            ? uncategorized
            : String(record.category);
        entries.push({
          id: text(record.uuid, String(record.id ?? entries.length)),
          label: text(record.name, text(record.categoryName, catLabel)),
          amount: reportingAmountFor(reportCurrency, record),
          isIncome: number(record.type) === 1,
          day: new Date(ts).toISOString().slice(0, 10),
        });
      }
      return entries;
    },
  );
}

/** Top spending categories for an arbitrary window, ranked by amount. */
export function selectCategorySpendingBetween(
  document: BackupDocument,
  start: Date,
  end: Date,
  now = new Date(),
): SpendingCategory[] {
  const startMs = start.getTime();
  const endMs = end.getTime();
  const nowMs = now.getTime();
  return memoizeForDocument(
    document,
    `category-spending:${startMs}:${endMs}:${nowMs}:${i18n.resolvedLanguage ?? ""}`,
    () => {
      if (startMs >= endMs || nowMs < startMs) return [];
      const { isIncluded, reportCurrency } = selectIncludedPredicate(document);
      const categories = createRecordLookup(document.categories);
      const uncategorized = i18n.t("common.uncategorized");
      const totals = new Map<string, number>();
      for (const transaction of selectPeriodTransactionCandidates(
        document,
        start,
        end,
      )) {
        if (number(transaction.type) === 1 || !isIncluded(transaction))
          continue;
        const ts = parseRecordTimestampMs(transaction);
        if (!Number.isFinite(ts) || ts < startMs || ts >= endMs || ts > nowMs)
          continue;
        const catRecord = categories.get(transaction.category);
        const fallbackCat = catRecord
          ? text(catRecord.name, uncategorized)
          : transaction.category == null
            ? uncategorized
            : String(transaction.category);
        const category = text(transaction.categoryName, fallbackCat);
        totals.set(
          category,
          (totals.get(category) ?? 0) +
            reportingAmountFor(reportCurrency, transaction),
        );
      }
      const total = [...totals.values()].reduce((sum, value) => sum + value, 0);
      return [...totals.entries()]
        .sort(([, left], [, right]) => right - left)
        .map(([label, amount], index) => ({
          id: label.toLowerCase().replace(/\W+/g, "-"),
          label,
          amount,
          percentage: total > 0 ? Math.round((amount / total) * 100) : 0,
          color: colors[index % colors.length],
        }));
    },
  );
}

/**
 * Slice colors for the donut. Categories keep their own color when they have a
 * distinct one; this palette fills in for the duplicates so no two neighbouring
 * slices are indistinguishable.
 */
const donutColors = [
  "#70d2eb",
  "#b89cf5",
  "#f2c66d",
  "#ef8175",
  "#7ee0b8",
  "#f09ac8",
  "#8fa8f5",
  "#e0b184",
];

export type ParentCategorySpending = {
  id: string;
  label: string;
  amount: number;
  percentage: number;
  color: string;
  /** How many distinct child categories rolled up into this slice. */
  childCount: number;
};

/**
 * Expenses for a window rolled up to each category's top-most ancestor, so the
 * donut answers "where does my money go" at the level the user files things
 * under rather than splitting one parent across a dozen leaves.
 */
export function selectParentCategorySpendingBetween(
  document: BackupDocument,
  start: Date,
  end: Date,
  now = new Date(),
): ParentCategorySpending[] {
  const startMs = start.getTime();
  const endMs = end.getTime();
  const nowMs = now.getTime();
  return memoizeForDocument(
    document,
    `parent-cat-spending:${startMs}:${endMs}:${nowMs}:${i18n.resolvedLanguage ?? ""}`,
    () => {
      if (startMs >= endMs || nowMs < startMs) return [];
      const { isIncluded, reportCurrency } = selectIncludedPredicate(document);
      const categories = createRecordLookup(document.categories);
      const roots = new Map<string, JsonObject>();
      // Imported data can contain parent cycles, so every walk is depth-guarded.
      const rootOf = (record: JsonObject): JsonObject => {
        const cached = roots.get(identity(record));
        if (cached) return cached;
        let current = record;
        const seen = new Set([identity(record)]);
        for (;;) {
          const parent = categories.get(categoryParent(current) ?? undefined);
          if (!parent || seen.has(identity(parent))) break;
          seen.add(identity(parent));
          current = parent;
        }
        for (const id of seen) roots.set(id, current);
        return current;
      };

      const uncategorized = i18n.t("common.uncategorized");
      type Bucket = {
        label: string;
        amount: number;
        color: string;
        children: Set<string>;
      };
      const buckets = new Map<string, Bucket>();
      for (const transaction of selectPeriodTransactionCandidates(
        document,
        start,
        end,
      )) {
        if (number(transaction.type) === 1 || !isIncluded(transaction))
          continue;
        const ts = parseRecordTimestampMs(transaction);
        if (!Number.isFinite(ts) || ts < startMs || ts >= endMs || ts > nowMs)
          continue;

        const record = categories.get(transaction.category);
        const root = record ? rootOf(record) : null;
        const key = root
          ? identity(root)
          : `unfiled:${text(transaction.categoryName, uncategorized)}`;
        const bucket = buckets.get(key) ?? {
          label: root
            ? text(root.name, uncategorized)
            : text(transaction.categoryName, uncategorized),
          amount: 0,
          color: /^#[a-f\d]{6}$/i.test(text(root?.color))
            ? text(root?.color)
            : "",
          children: new Set<string>(),
        };
        bucket.amount += reportingAmountFor(reportCurrency, transaction);
        if (record && root && identity(record) !== identity(root))
          bucket.children.add(identity(record));
        buckets.set(key, bucket);
      }

      const total = [...buckets.values()].reduce(
        (sum, bucket) => sum + bucket.amount,
        0,
      );
      const used = new Set<string>();
      return [...buckets.entries()]
        .sort(([, left], [, right]) => right.amount - left.amount)
        .map(([id, bucket], index) => {
          const own = bucket.color.toLowerCase();
          const color =
            own && !used.has(own) ? own : donutColors[index % donutColors.length];
          used.add(color.toLowerCase());
          return {
            id,
            label: bucket.label,
            amount: bucket.amount,
            percentage: total > 0 ? (bucket.amount / total) * 100 : 0,
            color,
            childCount: bucket.children.size,
          };
        });
    },
  );
}

export function selectMonthlySummary(
  document: BackupDocument,
  now = new Date(),
) {
  return memoizeForDocument(document, `monthly-summary:${now.getTime()}`, () => {
    const { start, end } = financialMonth(now, document._local.monthStartDay);
    const ledger = selectMonthlyLedger(document, start, end, now);
    const income = ledger.income;
    const spent = ledger.expense;
    const savingsRate =
      income > 0 ? Math.max(Math.round(((income - spent) / income) * 100), 0) : 0;
    return { income, spent, savingsRate };
  });
}

export function selectBudgetCategories(
  document: BackupDocument,
): BudgetCategory[] {
  return memoizeForDocument(document, "budget-categories", () =>
    selectBudgets(document)
      .filter((b) => b.showOnHome)
      .map((b) => ({
        id: b.id,
        label: b.name,
        spent: b.tracked,
        limit: b.limit,
        color: b.color,
      })),
  );
}

export function selectSpendingCategories(
  document: BackupDocument,
  now = new Date(),
): SpendingCategory[] {
  return memoizeForDocument(
    document,
    `spending-categories:${now.getTime()}:${i18n.resolvedLanguage ?? ""}`,
    () => {
      const { start, end } = financialMonth(now, document._local.monthStartDay);
      return selectCategorySpendingBetween(document, start, end, now).slice(0, 5);
    },
  );
}

export function selectDailySpending(
  document: BackupDocument,
  now = new Date(),
): DailySpend[] {
  const dayKey = `${now.getFullYear()}-${now.getMonth()}-${now.getDate()}`;
  const language = i18n.resolvedLanguage;
  return memoizeForDocument(
    document,
    `daily-spending:${dayKey}:${language ?? ""}`,
    () => {
      const targetDays = Array.from({ length: 7 }, (_, offset) => {
        const date = new Date(now);
        date.setDate(date.getDate() - (6 - offset));
        return {
          key: date.toISOString().slice(0, 10),
          label: date.toLocaleDateString(language, { weekday: "narrow" }),
        };
      });
      const targetKeySet = new Set(targetDays.map((item) => item.key));
      const sliceStart = new Date(
        Date.parse(`${targetDays[0].key}T00:00:00.000Z`),
      );
      const sliceEnd = new Date(
        Date.parse(`${targetDays[targetDays.length - 1].key}T00:00:00.000Z`) +
          86_400_000,
      );
      const sliceStartMs = sliceStart.getTime();
      const sliceEndMs = sliceEnd.getTime();

      const { isIncluded, reportCurrency } = selectIncludedPredicate(document);
      const dayTotals = new Map<string, number>();
      for (const transaction of selectPeriodTransactionCandidates(
        document,
        sliceStart,
        sliceEnd,
      )) {
        if (number(transaction.type) === 1 || !isIncluded(transaction))
          continue;
        const ts = parseRecordTimestampMs(transaction);
        if (!Number.isFinite(ts) || ts < sliceStartMs || ts >= sliceEndMs)
          continue;
        const key = new Date(ts).toISOString().slice(0, 10);
        if (!targetKeySet.has(key)) continue;
        dayTotals.set(
          key,
          (dayTotals.get(key) ?? 0) +
            reportingAmountFor(reportCurrency, transaction),
        );
      }

      return targetDays.map((item) => ({
        day: item.label,
        amount: dayTotals.get(item.key) ?? 0,
      }));
    },
  );
}
