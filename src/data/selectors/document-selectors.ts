import { financialMonth } from "../model/financial-month";
import { createRecordLookup } from "./transaction-selectors";
import { filterProjection, finishProjection } from "./cooperative";
import { ACCOUNT_ICONS } from "@/features/accounts/account-options";
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
import type { SearchResult } from "@/features/search/types";
import type { FilledIconName } from "@/shared/ui/filled-icon";
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
import { formatAppDate } from "../model/onboarding";
import type { JsonObject, JsonValue } from "../model/json";

export { selectTransactions } from "./transaction-selectors";
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
  return ownedAccountRecords(document).map(accountBalance);
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
  return ownedAccountRecords(document).map((record, index) => {
    const institution = text(record.bankName, i18n.t("common.localAccount"));
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
    const activity = accountActivityTotals(document, record, billingCycle, now);
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
      ownerName: text(
        document.users.find(
          (user) => user.uuid === record.user || user.id === record.user,
        )?.name,
      ),
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
      lastFour: text(record.cardLastFour, text(record.accountNumber)).slice(-4),
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
      isDefault: record.isDefault === true,
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
}

function belongsToAccount(transaction: JsonObject, account: JsonObject) {
  return [account.uuid, account.id].some(
    (id) => id != null && transaction.account === id,
  );
}

function accountActivityTotals(
  document: BackupDocument,
  account: JsonObject,
  billingCycle: CreditCardBillingCycle | null = null,
  now = new Date(),
) {
  const records = document.transactions.filter((item) =>
    belongsToAccount(item, account),
  );
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
  const thisCycle = billingCycle
    ? records.filter((item) => {
        const timestamp = new Date(
          text(item.date, text(item.createdAt)),
        ).getTime();
        return (
          Number.isFinite(timestamp) &&
          timestamp >= billingCycle.cycleStart.getTime() &&
          timestamp <= billingCycle.cycleEnd.getTime()
        );
      })
    : thisMonth;

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
    cycleIncome: total(thisCycle, 1),
    cycleExpense: total(thisCycle, 0),
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
  return account
    ? document.transactions.reduce(
        (count, item) => count + Number(belongsToAccount(item, account)),
        0,
      )
    : 0;
}

export function selectAccountTransactions(
  document: BackupDocument,
  accountId: string,
  period?: { period: AccountPeriod; anchor: Date },
): AccountTransaction[] {
  const record = findOwnedAccount(document, accountId);
  if (!record) return [];
  const account = accountBalance(record, 0);
  const paymentDay =
    accountKind(record) === "credit" ? accountPaymentDay(record) : null;
  const range = period
    ? accountPeriodRange(period.period, period.anchor, paymentDay)
    : null;
  return document.transactions
    .filter((item) => {
      if (!belongsToAccount(item, record)) return false;
      if (!range) return true;
      const timestamp = new Date(
        text(item.date, text(item.createdAt)),
      ).getTime();
      return (
        timestamp >= range.start.getTime() && timestamp < range.end.getTime()
      );
    })
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
  return finishProjection(iterateHomeOverview(document, currencyCode, now));
}

export function* iterateHomeOverview(
  document: BackupDocument,
  currencyCode: string,
  now: Date,
  transactions: Iterable<JsonObject> = document.transactions,
) {
  const belongs = createProfileMatcher(document);
  const currency = currencyCode.toUpperCase();
  const { start: monthStart } = financialMonth(
    now,
    document._local.monthStartDay,
  );
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
  for (const record of transactions) {
    if (position++ % 64 === 0) yield;
    const date = new Date(text(record.date, text(record.createdAt)));
    const account = accountRecords.get(
      record.account ?? record.fromAccount ?? record.sourceAccount,
    );
    if (!(
      belongs(record) &&
      record.type !== 2 &&
      date >= monthStart &&
      date <= now &&
      (!account || includedAccountIds.has(identity(account)))
    ))
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
function includedTransactions(document: BackupDocument) {
  const belongs = createProfileMatcher(document);
  const excludedIds = new Set<JsonValue>(
    document.accounts
      .filter((account) => account.isExcluded === true)
      .flatMap((account) => [account.uuid, account.id])
      .filter((id) => id != null),
  );
  return document.transactions
    .filter(
      (transaction) =>
        !excludedIds.has(transaction.account) && transaction.type !== 2,
    )
    .filter(belongs);
}

/**
 * Searching projects only the records it returns. The previous approach built a
 * view model for every transaction (with a linear account/category lookup each)
 * before the screen could paint, which froze navigation on large profiles.
 */
export function selectSearchMatches(
  document: BackupDocument,
  query: string,
  limit = 60,
): { results: SearchResult[]; total: number } {
  const needle = query.trim().toLocaleLowerCase();
  if (!needle) return { results: [], total: 0 };

  // Built once per search instead of once per transaction.
  const names = (records: JsonObject[]) => {
    const byId = new Map<string, string>();
    for (const record of records) {
      const name = text(record.name);
      for (const key of [record.uuid, record.id])
        if (key != null) byId.set(String(key), name);
    }
    return byId;
  };
  const categoryNames = names(document.categories);
  const accountNames = names(document.accounts);
  const accountsById = new Map<string, JsonObject>();
  for (const record of document.accounts)
    for (const key of [record.uuid, record.id])
      if (key != null) accountsById.set(String(key), record);

  const results: SearchResult[] = [];
  let total = 0;

  for (let index = 0; index < document.transactions.length; index++) {
    const record = document.transactions[index];
    const category = text(
      record.categoryName,
      record.category == null
        ? i18n.t("common.uncategorized")
        : (categoryNames.get(String(record.category)) ??
          String(record.category)),
    );
    const account = text(
      record.accountName,
      record.account == null
        ? i18n.t("common.uncategorized")
        : (accountNames.get(String(record.account)) ?? String(record.account)),
    );
    const title = text(record.name, i18n.t("common.untitledTransaction"));
    const matches = [title, category, account].some((value) =>
      value.toLocaleLowerCase().includes(needle),
    );
    if (!matches) continue;

    total++;
    if (results.length >= limit) continue;

    const accountRecord =
      record.account == null
        ? undefined
        : accountsById.get(String(record.account));
    const currencyCode = text(
      record.currencyCode,
      text(accountRecord?.currencyCode, "USD"),
    ).toUpperCase();
    results.push({
      id: recordId(record, index),
      title,
      category,
      account,
      date: transactionDate(record, document),
      amount: transactionAmount(record),
      currencyCode: /^[A-Z]{3}$/.test(currencyCode) ? currencyCode : "USD",
      icon: categoryIcon(category),
    });
  }

  return { results, total };
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

function reportingAmount(document: BackupDocument, transaction: JsonObject) {
  const currency = profileCurrency(
    document,
    document._local.selectedProfileId ?? "",
  );
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
  let income = 0;
  let expense = 0;
  for (const record of includedTransactions(document)) {
    const date = new Date(text(record.date, text(record.createdAt)));
    if (!Number.isFinite(date.getTime())) continue;
    if (date < start || date >= end || date > now) continue;
    const amount = reportingAmount(document, record);
    if (number(record.type) === 1) income += amount;
    else expense += amount;
  }
  return { income, expense };
}

/** Flat per-transaction facts for a window, used for counts and extremes. */
export function selectPeriodTransactions(
  document: BackupDocument,
  start: Date,
  end: Date,
  now = new Date(),
) {
  const entries: {
    id: string;
    label: string;
    amount: number;
    isIncome: boolean;
    day: string;
  }[] = [];
  for (const record of includedTransactions(document)) {
    const date = new Date(text(record.date, text(record.createdAt)));
    if (!Number.isFinite(date.getTime())) continue;
    if (date < start || date >= end || date > now) continue;
    entries.push({
      id: text(record.uuid, String(record.id ?? entries.length)),
      label: text(
        record.name,
        text(
          record.categoryName,
          lookupName(document.categories, record.category),
        ),
      ),
      amount: reportingAmount(document, record),
      isIncome: number(record.type) === 1,
      day: date.toISOString().slice(0, 10),
    });
  }
  return entries;
}

/** Top spending categories for an arbitrary window, ranked by amount. */
export function selectCategorySpendingBetween(
  document: BackupDocument,
  start: Date,
  end: Date,
  now = new Date(),
): SpendingCategory[] {
  const totals = new Map<string, number>();
  for (const transaction of includedTransactions(document)) {
    if (number(transaction.type) === 1) continue;
    const date = new Date(text(transaction.date, text(transaction.createdAt)));
    if (!Number.isFinite(date.getTime())) continue;
    if (date < start || date >= end || date > now) continue;
    const category = text(
      transaction.categoryName,
      lookupName(document.categories, transaction.category),
    );
    totals.set(
      category,
      (totals.get(category) ?? 0) + reportingAmount(document, transaction),
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

  type Bucket = { label: string; amount: number; color: string; children: Set<string> };
  const buckets = new Map<string, Bucket>();
  for (const transaction of includedTransactions(document)) {
    if (number(transaction.type) === 1) continue;
    const date = new Date(text(transaction.date, text(transaction.createdAt)));
    if (!Number.isFinite(date.getTime())) continue;
    if (date < start || date >= end || date > now) continue;

    const record = categories.get(transaction.category);
    const root = record ? rootOf(record) : null;
    const key = root
      ? identity(root)
      : `unfiled:${text(transaction.categoryName, i18n.t("common.uncategorized"))}`;
    const bucket = buckets.get(key) ?? {
      label: root
        ? text(root.name, i18n.t("common.uncategorized"))
        : text(transaction.categoryName, i18n.t("common.uncategorized")),
      amount: 0,
      color: /^#[a-f\d]{6}$/i.test(text(root?.color)) ? text(root?.color) : "",
      children: new Set<string>(),
    };
    bucket.amount += reportingAmount(document, transaction);
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
}

export function selectMonthlySummary(
  document: BackupDocument,
  now = new Date(),
) {
  const { start, end } = financialMonth(now, document._local.monthStartDay);
  const values = includedTransactions(document)
    .filter((record) => {
      const date = new Date(text(record.date, text(record.createdAt)));
      return date >= start && date < end && date <= now;
    })
    .map(
      (record) =>
        reportingAmount(document, record) * (record.type === 1 ? 1 : -1),
    );
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
  now = new Date(),
): SpendingCategory[] {
  const { start, end } = financialMonth(now, document._local.monthStartDay);
  const totals = new Map<string, number>();
  for (const transaction of includedTransactions(document)) {
    if (number(transaction.type) === 1) continue;
    const date = new Date(text(transaction.date, text(transaction.createdAt)));
    if (
      date < start ||
      date >= end ||
      date > now ||
      !Number.isFinite(date.getTime())
    )
      continue;
    const category = text(
      transaction.categoryName,
      lookupName(document.categories, transaction.category),
    );
    totals.set(
      category,
      (totals.get(category) ?? 0) + reportingAmount(document, transaction),
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

export function selectDailySpending(
  document: BackupDocument,
  now = new Date(),
): DailySpend[] {
  const dayTotals = new Map<string, number>();
  for (const transaction of includedTransactions(document)) {
    if (number(transaction.type) === 1) continue;
    const date = new Date(text(transaction.date, text(transaction.createdAt)));
    if (Number.isNaN(date.getTime())) continue;
    const key = date.toISOString().slice(0, 10);
    dayTotals.set(
      key,
      (dayTotals.get(key) ?? 0) + reportingAmount(document, transaction),
    );
  }

  return Array.from({ length: 7 }, (_, offset) => {
    const date = new Date(now);
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
