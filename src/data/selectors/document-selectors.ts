import { ACCOUNT_ICONS } from "@/features/accounts/account-options";
import { selectBudgets } from "./budget-selectors";
import { selectExchangeQuote } from "./exchange-rate-selectors";
import { selectRecurrings, selectRecurringEvents } from "./recurring-selectors";
import type {
  Account,
  AccountPeriod,
  AccountTransaction,
} from "@/features/accounts/types";
import type { BudgetCategory, Transaction } from "@/features/home/types";
import type { DailySpend, SpendingCategory } from "@/features/reports/types";
import type { SearchResult } from "@/features/search/types";
import type { FilledIconName } from "@/shared/ui/filled-icon";
import { i18n } from "@/localization/i18n";
import type { AccountDraft } from "../model/account-record";
import {
  belongsToProfile,
  identity,
  references,
} from "../model/category-record";
import {
  getSavingsAccountSummary,
  savingsDetailsToDraft,
} from "../model/savings-account";

import type { BackupDocument } from "../model/backup-document";
import { formatAppDate } from "../model/onboarding";
import type { JsonObject, JsonValue } from "../model/json";

export { selectBudgets, selectBudgetCurrency } from "./budget-selectors";
export {
  recurringTotals,
  selectHomeRecurringPayments,
  selectRecurringEvents,
  selectRecurringRelations,
  selectRecurringSummary,
  selectRecurrings,
} from "./recurring-selectors";
export {
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

function transactionAmount(record: JsonObject) {
  const amount = Math.abs(number(record.amount));
  return number(record.type) === 1 ? amount : -amount;
}

function transactionAccountAmount(record: JsonObject) {
  const amount = Math.abs(number(record.accountAmount, number(record.amount)));
  return number(record.type) === 1 ? amount : -amount;
}

function categoryIcon(category: string): FilledIconName {
  const value = category.toLowerCase();
  if (value.includes("food") || value.includes("dining")) return "food";
  if (value.includes("grocer") || value.includes("shopping")) return "shopping";
  if (value.includes("coffee")) return "coffee";
  if (value.includes("transport") || value.includes("car")) return "car";
  if (value.includes("salary") || value.includes("income")) return "wallet";
  if (value.includes("housing") || value.includes("rent")) return "home";
  return "cash";
}

function transactionDate(record: JsonObject, document: BackupDocument) {
  const value = text(record.date, text(record.createdAt));
  const date = new Date(value);
  return Number.isNaN(date.getTime())
    ? i18n.t("common.unknownDate")
    : formatAppDate(date, document._local.dateFormat);
}

function relatedName(records: JsonObject[], value: JsonValue | undefined) {
  if (value == null) return "";
  const record = records.find((item) => references(item, value));
  return record ? text(record.name) : "";
}

export function selectAccounts(document: BackupDocument): Account[] {
  const profileId = document._local.selectedProfileId;
  const owner = document.users.find(
    (user) => String(user.uuid ?? user.id) === profileId,
  );
  return document.accounts
    .filter(
      (record) =>
        !profileId ||
        record.user == null ||
        record.user === profileId ||
        (owner?.id != null && record.user === owner.id),
    )
    .map((record, index) => {
      const institution = text(record.bankName, i18n.t("common.localAccount"));
      const normalized = `${text(record.name)} ${institution}`.toLowerCase();
      const kind =
        record.accountType === "card"
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
      const storedIcon = text(record.icon);
      const storedIconPath = text(record.iconPath);
      const materialIconIsValid =
        storedIcon.startsWith("material:") &&
        /^[Mm]/.test(storedIconPath) &&
        storedIconPath.length <= 20_000;

      return {
        id: recordId(record, index),
        accountNumber: text(record.accountNumber),
        ownerName: text(
          document.users.find(
            (user) => user.uuid === record.user || user.id === record.user,
          )?.name,
        ),
        ...accountActivityTotals(document, record),
        name: text(record.name, `Account ${index + 1}`),
        institution,
        kind,
        balance: number(record.amount),
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
        icon: materialIconIsValid
          ? storedIcon
          : (ACCOUNT_ICONS.find(
              (icon) =>
                !icon.name.startsWith("material:") && icon.name === record.icon,
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
        currencyCode: /^[A-Z]{3}$/.test(text(record.currencyCode).toUpperCase())
          ? text(record.currencyCode).toUpperCase()
          : "USD",
        isDefault: record.isDefault === true,
        isExcluded: record.isExcluded === true,
        cardCompany: text(record.cardCompany),
        bankName: text(record.bankName),
        linkedBankAccountId:
          typeof record.linkedBankAccountId === "string"
            ? record.linkedBankAccountId
            : null,
        linkedBankAccountName: text(
          document.accounts.find(
            (candidate) =>
              String(candidate.uuid ?? candidate.id) ===
              record.linkedBankAccountId,
          )?.name,
        ),
        paymentDay:
          typeof record.paymentDay === "number" &&
          Number.isInteger(record.paymentDay) &&
          record.paymentDay >= 1 &&
          record.paymentDay <= 31
            ? record.paymentDay
            : null,
      };
    });
}

function belongsToAccount(transaction: JsonObject, account: JsonObject) {
  return [account.uuid, account.id].some(
    (id) => id != null && transaction.account === id,
  );
}

function accountActivityTotals(document: BackupDocument, account: JsonObject) {
  const records = document.transactions.filter((item) =>
    belongsToAccount(item, account),
  );
  const now = new Date();
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1).getTime();
  const monthEnd = new Date(now.getFullYear(), now.getMonth() + 1, 1).getTime();
  const thisMonth = records.filter((item) => {
    const timestamp = new Date(text(item.date, text(item.createdAt))).getTime();
    return (
      Number.isFinite(timestamp) &&
      timestamp >= monthStart &&
      timestamp < monthEnd
    );
  });
  const total = (items: JsonObject[], type: number) =>
    items
      .filter((item) => item.type === type)
      .reduce(
        (sum, item) =>
          sum + Math.abs(number(item.accountAmount, number(item.amount))),
        0,
      );
  return {
    income: total(records, 1),
    expense: total(records, 0),
    monthlyIncome: total(thisMonth, 1),
    monthlyExpense: total(thisMonth, 0),
  };
}

export function selectAccountTransactions(
  document: BackupDocument,
  accountId: string,
): AccountTransaction[] {
  const account = selectAccounts(document).find(
    (item) => item.id === accountId,
  );
  const record = document.accounts.find(
    (item) => String(item.uuid ?? item.id) === accountId,
  );
  if (!account || !record) return [];
  return document.transactions
    .filter((item) => belongsToAccount(item, record))
    .map((item, index) => {
      const timestamp = new Date(
        text(item.date, text(item.createdAt)),
      ).getTime();
      const type =
        item.type === 1 ? "income" : item.type === 0 ? "expense" : "transfer";
      return {
        id: recordId(item, index),
        name: text(item.name, i18n.t("common.untitledTransaction")),
        category: text(
          item.categoryName,
          lookupName(document.categories, item.category),
        ),
        amount: Math.abs(number(item.amount)),
        type,
        currencyCode: /^[A-Z]{3}$/.test(text(item.currencyCode).toUpperCase())
          ? text(item.currencyCode).toUpperCase()
          : account.currencyCode,
        timestamp: Number.isFinite(timestamp) ? timestamp : null,
      } satisfies AccountTransaction;
    })
    .sort((a, b) => (b.timestamp ?? -Infinity) - (a.timestamp ?? -Infinity));
}

export function accountPeriodRange(period: AccountPeriod, anchor: Date) {
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
    bankName: account.bankName,
    linkedBankAccountId: account.linkedBankAccountId,
    savingsDetails: savingsDetailsToDraft(record?.savingsDetails),
  };
}

export function selectBankAccounts(document: BackupDocument): Account[] {
  const bankIds = new Set(
    document.accounts
      .filter((record) => record.accountType === "bank")
      .map((record) => String(record.uuid ?? record.id)),
  );
  return selectAccounts(document).filter((account) => bankIds.has(account.id));
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
  const currency = currencyCode.toUpperCase();
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const upcomingEnd = new Date(
    now.getFullYear(),
    now.getMonth(),
    now.getDate() + 30,
  );
  const accounts = selectAccounts(document).filter(
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
  function sum(values: { amount: number; currencyCode: string }[]) {
    let amount = 0;
    const unconverted = new Map<string, number>();
    const rateDates = new Set<string>();
    for (const value of values) {
      if (!Number.isFinite(value.amount) || value.amount === 0) continue;
      const code = value.currencyCode.toUpperCase();
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
  const monthly = selectTransactions(document).filter((transaction) => {
    const date = new Date(transaction.occurredAtIso);
    return (
      transaction.type !== 2 &&
      date >= monthStart &&
      date <= now &&
      (!transaction.accountId || includedAccountIds.has(transaction.accountId))
    );
  });
  // Account amounts retain the conversion used when a transaction was recorded.
  const recordedMoney = (type: number) =>
    monthly
      .filter((t) => t.type === type)
      .map((t) => ({
        amount: t.accountAmount,
        currencyCode: t.accountCurrencyCode,
      }));
  const income = recordedMoney(1),
    expense = recordedMoney(0);
  const recurrings = selectRecurrings(document, now).filter((recurring) => {
    const account = document.accounts.find((a) =>
      references(a, recurring.record.account),
    );
    return (
      !account ||
      (belongsToProfile(document, account) && account.isExcluded !== true)
    );
  });
  const upcoming = selectRecurringEvents(recurrings, today, upcomingEnd).filter(
    (event) => event.status === "pending",
  );
  const upcomingExpense = upcoming.filter((event) => event.type === 0);
  const upcomingIncome = upcoming.filter((event) => event.type === 1);
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
        amount: value.amount / now.getDate(),
      })),
    ),
    transactionCount: monthly.length,
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
  const priority = (budget: ReturnType<typeof selectBudgets>[number]) => {
    if (!budget.active) return 0;
    if (budget.transactionType !== 0) return 1;
    if (budget.remaining < 0) return 4;
    return budget.dailyAllowance < budget.dailyPlan ? 3 : 2;
  };
  return selectBudgets(document, now)
    .filter((budget) => budget.showOnHome)
    .sort(
      (a, b) =>
        priority(b) - priority(a) ||
        b.percent - a.percent ||
        a.id.localeCompare(b.id),
    );
}

// Exclusion affects calculations; records remain visible in activity and search.
function includedTransactions(document: BackupDocument) {
  const excludedIds = new Set<JsonValue>(
    document.accounts
      .filter((account) => account.isExcluded === true)
      .flatMap((account) => [account.uuid, account.id])
      .filter((id) => id != null),
  );
  return document.transactions.filter(
    (transaction) =>
      !excludedIds.has(transaction.account) && transaction.type !== 2,
  );
}

export function selectTransactions(document: BackupDocument): Transaction[] {
  return document.transactions
    .filter((record) => belongsToProfile(document, record))
    .map((record, index) => {
      const categoryRecord = document.categories.find((item) =>
        references(item, record.category),
      );
      const accountRecord = document.accounts.find((item) =>
        references(
          item,
          record.account ?? record.fromAccount ?? record.sourceAccount,
        ),
      );
      const destinationRecord = document.accounts.find((item) =>
        references(item, record.toAccount ?? record.destinationAccount),
      );
      const category = text(
        record.categoryName,
        lookupName(document.categories, record.category),
      );
      const occurredAtIso = text(record.date, text(record.createdAt));
      const timestamp = new Date(occurredAtIso).getTime();
      const type = record.type === 1 ? 1 : record.type === 2 ? 2 : 0;
      const absoluteAmount = Math.abs(number(record.amount));
      const currencyCode = text(
        record.currencyCode,
        text(accountRecord?.currencyCode, "USD"),
      ).toUpperCase();
      const accountCurrencyCode = text(
        record.accountCurrencyCode,
        text(accountRecord?.currencyCode, currencyCode),
      ).toUpperCase();
      return {
        id: recordId(record, index),
        merchant: text(record.name, i18n.t("common.untitledTransaction")),
        description: text(record.description),
        category,
        categoryId: categoryRecord ? identity(categoryRecord) : "",
        occurredAt: transactionDate(record, document),
        occurredAtIso,
        amount: type === 1 ? absoluteAmount : -absoluteAmount,
        absoluteAmount,
        currencyCode: /^[A-Z]{3}$/.test(currencyCode) ? currencyCode : "USD",
        accountAmount: Math.abs(number(record.accountAmount, absoluteAmount)),
        accountCurrencyCode: /^[A-Z]{3}$/.test(accountCurrencyCode)
          ? accountCurrencyCode
          : "USD",
        exchangeRate:
          number(record.exchangeRate) > 0 ? number(record.exchangeRate) : null,
        exchangeRateDate: text(record.exchangeRateDate) || null,
        exchangeRateFetchedAt: text(record.exchangeRateFetchedAt) || null,
        exchangeRateSource: text(record.exchangeRateSource) || null,
        type,
        icon: text(categoryRecord?.icon, categoryIcon(category)),
        iconPath:
          /^[Mm]/.test(text(categoryRecord?.iconPath)) &&
          text(categoryRecord?.iconPath).length <= 20_000
            ? text(categoryRecord?.iconPath)
            : null,
        color: /^#[a-f\d]{6}$/i.test(text(categoryRecord?.color))
          ? text(categoryRecord?.color)
          : colors[index % colors.length],
        tone: type === 1 ? "blue" : type === 2 ? "amber" : "emerald",
        accountId: accountRecord ? identity(accountRecord) : "",
        accountName: text(
          record.accountName,
          text(accountRecord?.name, i18n.t("common.noAccount")),
        ),
        destinationAccountId: destinationRecord
          ? identity(destinationRecord)
          : "",
        destinationAccountName: text(destinationRecord?.name),
        budgetName: relatedName(document.budgets, record.budget),
        labelName: relatedName(
          document.labels,
          record.label ?? (Array.isArray(record.tags) ? record.tags[0] : null),
        ),
        loanName: relatedName(document.loans, record.loan),
        placeName: relatedName(document.places, record.place),
        personName: relatedName(
          document.peoples,
          record.person ?? record.payee,
        ),
        receiptPath:
          typeof record.receipt === "string"
            ? record.receipt
            : typeof record.image === "string"
              ? record.image
              : null,
        timestamp: Number.isFinite(timestamp) ? timestamp : -Infinity,
      } satisfies Transaction & { timestamp: number };
    })
    .sort((left, right) => right.timestamp - left.timestamp)
    .map(({ timestamp, ...transaction }) => transaction);
}

export function selectSearchResults(document: BackupDocument): SearchResult[] {
  return document.transactions.map((record, index) => {
    const category = text(
      record.categoryName,
      lookupName(document.categories, record.category),
    );
    const account = text(
      record.accountName,
      lookupName(document.accounts, record.account),
    );
    const accountRecord = document.accounts.find((item) =>
      references(item, record.account),
    );
    const currencyCode = text(
      record.currencyCode,
      text(accountRecord?.currencyCode, "USD"),
    ).toUpperCase();
    return {
      id: recordId(record, index),
      title: text(record.name, i18n.t("common.untitledTransaction")),
      category,
      account,
      date: transactionDate(record, document),
      amount: transactionAmount(record),
      currencyCode: /^[A-Z]{3}$/.test(currencyCode) ? currencyCode : "USD",
      icon: categoryIcon(category),
    };
  });
}

export function selectMonthlySummary(document: BackupDocument) {
  const values = includedTransactions(document).map(transactionAccountAmount);
  const income = values.filter((value) => value > 0).reduce((a, b) => a + b, 0);
  const spent = Math.abs(
    values.filter((value) => value < 0).reduce((a, b) => a + b, 0),
  );
  const savingsRate =
    income > 0 ? Math.max(Math.round(((income - spent) / income) * 100), 0) : 0;
  return { income, spent, savingsRate };
}

export function selectBudgetCategories(
  document: BackupDocument,
): BudgetCategory[] {
  return selectBudgets(document)
    .filter((b) => b.showOnHome)
    .map((b) => ({
      id: b.id,
      label: b.name,
      spent: b.tracked,
      limit: b.limit,
      color: b.color,
    }));
}

export function selectSpendingCategories(
  document: BackupDocument,
): SpendingCategory[] {
  const totals = new Map<string, number>();
  for (const transaction of includedTransactions(document)) {
    if (number(transaction.type) === 1) continue;
    const category = text(
      transaction.categoryName,
      lookupName(document.categories, transaction.category),
    );
    totals.set(
      category,
      (totals.get(category) ?? 0) +
        Math.abs(number(transaction.accountAmount, number(transaction.amount))),
    );
  }
  const total = [...totals.values()].reduce((sum, value) => sum + value, 0);
  return [...totals.entries()]
    .sort(([, left], [, right]) => right - left)
    .slice(0, 5)
    .map(([label, amount], index) => ({
      id: label.toLowerCase().replace(/\W+/g, "-"),
      label,
      amount,
      percentage: total > 0 ? Math.round((amount / total) * 100) : 0,
      color: colors[index % colors.length],
    }));
}

export function selectDailySpending(document: BackupDocument): DailySpend[] {
  const dayTotals = new Map<string, number>();
  for (const transaction of includedTransactions(document)) {
    if (number(transaction.type) === 1) continue;
    const date = new Date(text(transaction.createdAt));
    if (Number.isNaN(date.getTime())) continue;
    const key = date.toISOString().slice(0, 10);
    dayTotals.set(
      key,
      (dayTotals.get(key) ?? 0) +
        Math.abs(number(transaction.accountAmount, number(transaction.amount))),
    );
  }

  return Array.from({ length: 7 }, (_, offset) => {
    const date = new Date();
    date.setDate(date.getDate() - (6 - offset));
    const key = date.toISOString().slice(0, 10);
    return {
      day: date.toLocaleDateString(i18n.resolvedLanguage, {
        weekday: "narrow",
      }),
      amount: dayTotals.get(key) ?? 0,
    };
  });
}
