import type { BackupDocument } from "../model/backup-document";
import {
  belongsToProfile,
  identity,
  references,
} from "../model/category-record";
import {
  convertCurrency,
  storeExchangeRates,
  type ExchangeRateSnapshot,
} from "../model/exchange-rate";
import type { JsonObject } from "../model/json";
import {
  completeOccurrence,
  nextOccurrence,
  occurrenceKey,
  recurringCurrency,
  recurringOwner,
} from "../model/recurring-record";
import {
  createTransactionDraft,
  saveTransaction,
} from "../model/transaction-record";
import { selectExchangeRates } from "../selectors/exchange-rate-selectors";
import { getExchangeRates } from "../exchange-rates/exchange-rate-service";

export type RecurringStore = {
  read: () => Promise<BackupDocument>;
  update: (
    updater: (current: BackupDocument) => BackupDocument,
  ) => Promise<void>;
};
export function dueAutomaticRecurrings(document: BackupDocument, now: Date) {
  return document.recurrings.filter(
    (r) =>
      r.automatic === true &&
      r.archived !== true &&
      nextOccurrence(r) &&
      nextOccurrence(r)! <= now,
  );
}
function paymentCurrencies(document: BackupDocument, record: JsonObject) {
  const owner = recurringOwner(document, record);
  if (!owner)
    throw new Error("Choose a profile and account for this recurring payment.");
  const account = document.accounts.find((a) => references(a, record.account));
  if (!account || !belongsToProfile(document, account, owner))
    throw new Error(
      "The payment account is no longer available. Edit the recurring payment.",
    );
  return {
    owner,
    original: String(record.currencyCode ?? recurringCurrency(document, owner)),
    main: recurringCurrency(document, owner),
    account: String(account.currencyCode ?? "USD"),
  };
}
export function recordRecurringPayment(
  document: BackupDocument,
  id: string,
  expectedKey: string,
  expectedRecord: string,
  now: Date,
  automatic: boolean,
  snapshot?: ExchangeRateSnapshot,
): BackupDocument {
  const record = document.recurrings.find((r) => identity(r) === id);
  if (
    !record ||
    record.archived === true ||
    (automatic && record.automatic !== true) ||
    occurrenceKey(record) !== expectedKey
  )
    return document;
  // A rate lookup must never commit against an edited/restored schedule.
  if (JSON.stringify(record) !== expectedRecord)
    throw new Error("This recurring payment changed. Please try again.");
  const scheduled = nextOccurrence(record);
  if (!scheduled || scheduled > now)
    throw new Error("This payment is not due yet.");
  const currencies = paymentCurrencies(document, record);
  const crossCurrency =
    currencies.original !== currencies.main ||
    currencies.original !== currencies.account;
  if (
    crossCurrency &&
    (!snapshot ||
      snapshot.base !== currencies.original ||
      snapshot.fetchedAt.slice(0, 10) !== now.toISOString().slice(0, 10))
  )
    throw new Error(
      "A current exchange rate is needed. The payment remains pending.",
    );
  const mainRate =
    currencies.original === currencies.main
      ? 1
      : snapshot?.rates[currencies.main];
  const accountRate =
    currencies.original === currencies.account
      ? 1
      : snapshot?.rates[currencies.account];
  if (!mainRate || !accountRate)
    throw new Error(
      "An exchange rate for this currency is unavailable. The payment remains pending.",
    );
  const originalAmount = Number(record.amount);
  const draft = {
    ...createTransactionDraft(record.type === 1 ? 1 : 0),
    name: String(record.name ?? ""),
    amount: String(convertCurrency(originalAmount, mainRate, currencies.main)),
    currencyCode: currencies.main,
    accountCurrencyCode: currencies.account,
    conversionSnapshot: snapshot ?? null,
    exchangeRate: accountRate / mainRate,
    exchangeRateDate: snapshot?.date ?? null,
    exchangeRateFetchedAt: snapshot?.fetchedAt ?? null,
    exchangeRateSource: snapshot?.source ?? null,
    accountId: String(record.account ?? ""),
    categoryId: String(record.category ?? ""),
    budgetId: String(record.budget ?? ""),
    labelId: String(record.label ?? ""),
    placeId: String(record.place ?? ""),
    personId: String(record.person ?? ""),
    description: String(record.description ?? ""),
    occurredAt: scheduled.toISOString(),
  };
  let next = snapshot ? storeExchangeRates(document, snapshot) : document;
  if (next.transactions.some((t) => identity(t) === expectedKey))
    throw new Error(
      "This payment is already recorded. Review its history before continuing.",
    );
  next = saveTransaction(
    next,
    draft,
    expectedKey,
    currencies.owner,
    now.toISOString(),
  );
  // Convert directly from the subscription amount for the account too. Rounding
  // the intermediate profile amount must not introduce a second rounding error.
  const accountAmount = convertCurrency(
    originalAmount,
    accountRate,
    currencies.account,
  );
  const saved = next.transactions.find((t) => identity(t) === expectedKey)!;
  const correction =
    (accountAmount - Number(saved.accountAmount)) *
    (record.type === 1 ? 1 : -1);
  if (correction)
    next = {
      ...next,
      accounts: next.accounts.map((account) => {
        if (!references(account, record.account)) return account;
        const balance =
          Math.round((Number(account.amount) + correction) * 1e8) / 1e8;
        if (!Number.isFinite(balance))
          throw new Error("The account balance is invalid.");
        return { ...account, amount: balance };
      }),
    };
  next = {
    ...next,
    transactions: next.transactions.map((t) =>
      identity(t) === expectedKey
        ? {
            ...t,
            accountAmount,
            recurring: id,
            recurringOccurrenceKey: expectedKey,
            scheduledAt: scheduled.toISOString(),
            processedAt: now.toISOString(),
            originalAmount,
            originalCurrencyCode: currencies.original,
            originalExchangeRate: mainRate,
            originalExchangeRateDate: crossCurrency ? snapshot!.date : null,
            originalExchangeRateFetchedAt: crossCurrency
              ? snapshot!.fetchedAt
              : null,
            originalExchangeRateSource: crossCurrency ? snapshot!.source : null,
          }
        : t,
    ),
  };
  return completeOccurrence(
    next,
    record,
    "processed",
    now.toISOString(),
    expectedKey,
  );
}
export async function processRecurring(
  store: RecurringStore,
  id: string,
  expectedKey: string,
  options: {
    automatic?: boolean;
    profileId?: string;
    now?: Date;
    fetchRates?: typeof getExchangeRates;
  } = {},
) {
  const now = options.now ?? new Date();
  const document = await store.read();
  const record = document.recurrings.find((r) => identity(r) === id);
  if (!record || occurrenceKey(record) !== expectedKey) return;
  if (
    record.archived === true ||
    (options.automatic && record.automatic !== true)
  )
    return;
  const due = nextOccurrence(record);
  if (!due || due > now) throw new Error("This payment is not due yet.");
  if (
    options.profileId &&
    !belongsToProfile(document, record, options.profileId)
  )
    throw new Error("This payment belongs to another profile.");
  const currencies = paymentCurrencies(document, record);
  let snapshot: ExchangeRateSnapshot | undefined;
  if (options.profileId && currencies.owner !== options.profileId)
    throw new Error("This payment belongs to another profile.");
  if (
    currencies.original !== currencies.main ||
    currencies.original !== currencies.account
  ) {
    const cached = selectExchangeRates(document, currencies.original);
    snapshot =
      cached?.fetchedAt.slice(0, 10) === now.toISOString().slice(0, 10)
        ? cached
        : await (options.fetchRates ?? getExchangeRates)(currencies.original);
  }
  await store.update((current) => {
    const currentRecord = current.recurrings.find((r) => identity(r) === id);
    if (
      currentRecord &&
      JSON.stringify(paymentCurrencies(current, currentRecord)) !==
        JSON.stringify(currencies)
    )
      throw new Error(
        "The profile or account currency changed. Please try again.",
      );
    return recordRecurringPayment(
      current,
      id,
      expectedKey,
      JSON.stringify(record),
      now,
      options.automatic === true,
      snapshot,
    );
  });
}
/** Bound each run to keep the OS worker responsive; the persisted cursor resumes next run. */
export async function reconcileRecurring(
  store: RecurringStore,
  options: {
    now?: Date;
    fetchRates?: typeof getExchangeRates;
    limit?: number;
  } = {},
) {
  const now = options.now ?? new Date(),
    blocked = new Set<string>();
  let error = "";
  for (let processed = 0; processed < (options.limit ?? 200); processed++) {
    const document = await store.read();
    const record = dueAutomaticRecurrings(document, now).find(
      (r) => !blocked.has(identity(r)),
    );
    if (!record) break;
    try {
      await processRecurring(store, identity(record), occurrenceKey(record), {
        ...options,
        now,
        automatic: true,
      });
    } catch (reason) {
      blocked.add(identity(record));
      error =
        reason instanceof Error
          ? reason.message
          : "A recurring payment could not be saved.";
    }
  }
  return {
    error,
    remaining: dueAutomaticRecurrings(await store.read(), now).length,
  };
}
