import { i18n } from "@/localization/i18n";

import type { BackupDocument } from "./backup-document";
import type { JsonObject, JsonValue } from "./json";
import {
    type SavingsDetailsDraft,
    validateSavingsDetails,
} from "./savings-account";

export const ACCOUNT_TYPES = ["card", "cash", "savings", "bank"] as const;
export type AccountType = (typeof ACCOUNT_TYPES)[number];
export const CARD_COMPANIES = [
  "Visa",
  "Mastercard",
  "American Express",
  "Isracard",
  "Diners Club",
  "Discover",
  "JCB",
  "UnionPay",
  "Other",
] as const;

export interface AccountDraft {
  name: string;
  amount: string;
  creditLimit?: string;
  accountNumber: string;
  accountType: AccountType;
  currencyCode: string;
  icon: string;
  iconPath: string | null;
  color: string;
  isDefault: boolean;
  isExcluded: boolean;
  cardLastFour: string;
  cardCompany: string;
  paymentDay: number | null;
  bankName: string;
  linkedBankAccountId: string | null;
  savingsDetails: SavingsDetailsDraft;
}

export function parseAccountAmount(value: string): number {
  const input = value.trim();
  // A comma is accepted as a decimal separator, never as ambiguous grouping.
  if (!/^-?(?:\d+(?:[.,]\d{1,3})?|[.,]\d{1,3})$/.test(input)) {
    throw new Error(i18n.t("validation.account.invalidAmount"));
  }
  const amount = Number(input.replace(",", "."));
  if (
    !Number.isFinite(amount) ||
    Math.abs(amount) > Number.MAX_SAFE_INTEGER / 1000
  ) {
    throw new Error(i18n.t("validation.account.amountTooLarge"));
  }
  return amount;
}

export function validateAccountDraft(draft: AccountDraft) {
  if (!draft.name.trim())
    throw new Error(i18n.t("validation.account.name"));
  if (!ACCOUNT_TYPES.includes(draft.accountType))
    throw new Error(i18n.t("validation.account.type"));
  const amount = parseAccountAmount(draft.amount);
  if (!/^[A-Z]{3}$/.test(draft.currencyCode))
    throw new Error(i18n.t("validation.account.currency"));
  if (!/^#[a-f\d]{6}$/i.test(draft.color))
    throw new Error(i18n.t("validation.account.color"));
  if (!draft.icon.trim())
    throw new Error(i18n.t("validation.account.icon"));
  if (
    draft.icon.startsWith("material:") &&
    (typeof draft.iconPath !== "string" ||
      !/^[Mm]/.test(draft.iconPath) ||
      draft.iconPath.length > 20_000)
  )
    throw new Error(i18n.t("validation.account.materialIcon"));
  if (draft.accountType === "card") {
    if (!/^\d{4}$/.test(draft.cardLastFour))
      throw new Error(i18n.t("validation.account.cardLastFour"));
    if (!CARD_COMPANIES.some((company) => company === draft.cardCompany))
      throw new Error(i18n.t("validation.account.cardCompany"));
    if (
      !Number.isInteger(draft.paymentDay) ||
      draft.paymentDay! < 1 ||
      draft.paymentDay! > 31
    )
      throw new Error(i18n.t("validation.account.paymentDay"));
    if (draft.creditLimit && draft.creditLimit.trim()) {
      const limit = parseAccountAmount(draft.creditLimit);
      if (limit < 0) {
        throw new Error(i18n.t("validation.account.invalidCreditLimit"));
      }
    }
  }
  if (draft.accountType === "bank" && !draft.bankName.trim())
    throw new Error(i18n.t("validation.account.bankName"));
  if (draft.accountType === "savings")
    validateSavingsDetails(draft.savingsDetails, amount);
  return amount;
}

/** Add and change defaults in the same provider transaction, using its latest document. */
export function addAccountToDocument(
  current: BackupDocument,
  draft: AccountDraft,
  profileId: string,
  uuid: string,
  now: string,
): BackupDocument {
  const amount = validateAccountDraft(draft);
  const owner = current.users.find(
    (user) => String(user.uuid ?? user.id) === profileId,
  );
  if (!owner)
    throw new Error(i18n.t("validation.account.profile"));
  if (
    current.accounts.some(
      (account) => String(account.uuid ?? account.id) === uuid,
    )
  )
    throw new Error(i18n.t("validation.account.alreadySaved"));
  let linkedBankAccount: JsonObject | undefined;
  if (draft.accountType === "card") {
    linkedBankAccount = current.accounts.find(
      (account) =>
        String(account.uuid ?? account.id) === draft.linkedBankAccountId &&
        account.accountType === "bank",
    );
    if (!linkedBankAccount)
      throw new Error(i18n.t("validation.account.linkedBank"));
    if (
      linkedBankAccount.user !== owner.uuid &&
      linkedBankAccount.user !== owner.id
    )
      throw new Error(i18n.t("validation.account.linkedBankProfile"));
  }
  const record: JsonObject = {
    uuid,
    name: draft.name.trim(),
    amount,
    accountNumber: draft.accountNumber.trim(),
    accountType: draft.accountType,
    type: ACCOUNT_TYPES.indexOf(draft.accountType),
    currencyCode: draft.currencyCode,
    icon: draft.icon,
    iconPath: draft.icon.startsWith("material:") ? draft.iconPath : null,
    color: draft.color.toLowerCase(),
    isDefault: draft.isDefault,
    isExcluded: draft.isExcluded,
    user: owner.uuid ?? owner.id,
    createdAt: now,
    updatedAt: now,
    transactions: [],
    cardLastFour: draft.accountType === "card" ? draft.cardLastFour : null,
    cardCompany: draft.accountType === "card" ? draft.cardCompany : null,
    paymentDay: draft.accountType === "card" ? draft.paymentDay : null,
    creditLimit:
      draft.accountType === "card" && draft.creditLimit?.trim()
        ? parseAccountAmount(draft.creditLimit)
        : null,
    bankName: draft.accountType === "bank" ? draft.bankName.trim() : null,
    linkedBankAccountId:
      draft.accountType === "card"
        ? String(linkedBankAccount!.uuid ?? linkedBankAccount!.id)
        : null,
    savingsDetails:
      draft.accountType === "savings"
        ? validateSavingsDetails(draft.savingsDetails, amount)
        : null,
    lastPaymentPeriod: null,
  };
  return {
    ...current,
    accounts: [
      ...current.accounts.map((account) =>
        draft.isDefault &&
        ((owner.uuid != null && account.user === owner.uuid) ||
          (owner.id != null && account.user === owner.id)) &&
        account.isDefault === true
          ? { ...account, isDefault: false, updatedAt: now }
          : account,
      ),
      record,
    ],
  };
}

/** Optional additions preserve all legacy fields, including unknown imported values. */
export function normalizeAccountRecord(record: JsonObject): JsonObject {
  return {
    accountType: null,
    cardLastFour: null,
    cardCompany: null,
    paymentDay: null,
    creditLimit: null,
    bankName: null,
    linkedBankAccountId: null,
    savingsDetails: null,
    lastPaymentPeriod: null,
    iconPath: null,
    ...record,
  };
}

function editableAccount(document: BackupDocument, id: string) {
  const account = document.accounts.find(
    (item) => String(item.uuid ?? item.id) === id,
  );
  if (!account) throw new Error(i18n.t("validation.account.missing"));
  const profileId = document._local.selectedProfileId;
  const owner = document.users.find(
    (user) => String(user.uuid ?? user.id) === profileId,
  );
  if (
    profileId &&
    account.user != null &&
    account.user !== profileId &&
    account.user !== owner?.id
  )
    throw new Error(i18n.t("validation.account.wrongProfile"));
  return account;
}

export function updateAccountInDocument(
  current: BackupDocument,
  draft: AccountDraft,
  id: string,
  now: string,
): BackupDocument {
  const previous = editableAccount(current, id);
  const ids: JsonValue[] = [previous.uuid, previous.id].filter(
    (value) => value != null,
  );
  const related = (record: JsonObject) => ids.includes(record.account);
  const linkedCards = current.accounts.filter(
    (account) =>
      account.accountType === "card" &&
      ids.includes(account.linkedBankAccountId),
  );
  if (linkedCards.length && draft.accountType !== "bank")
    throw new Error(i18n.t("validation.account.linkedCards"));
  const owner = current.users.find(
    (user) => user.uuid === previous.user || user.id === previous.user,
  );
  const next = addAccountToDocument(
    {
      ...current,
      accounts: current.accounts.filter((item) => item !== previous),
    },
    draft,
    String(owner?.uuid ?? owner?.id ?? current._local.selectedProfileId),
    id,
    now,
  );
  const updated = next.accounts.at(-1)!;
  if (draft.accountType === "card" && previous.accountType === "card") {
    updated.lastPaymentPeriod = previous.lastPaymentPeriod ?? null;
  }
  return {
    ...next,
    accounts: current.accounts.map((item) =>
      item === previous
        ? {
            ...previous,
            ...updated,
            uuid: previous.uuid ?? updated.uuid,
            user: previous.user ?? updated.user,
            createdAt: previous.createdAt ?? updated.createdAt,
            transactions: previous.transactions ?? [],
          }
        : next.accounts.find(
            (candidate) =>
              String(candidate.uuid ?? candidate.id) ===
              String(item.uuid ?? item.id),
          )!,
    ),
    transactions: current.transactions.map((item) => {
      if (!related(item)) return item;
      // Legacy transactions inherit the account currency. Freeze that original
      // currency before changing the account; history is never converted.
      const currencyChanged = draft.currencyCode !== previous.currencyCode;
      return {
        ...item,
        ...(currencyChanged && item.currencyCode == null
          ? { currencyCode: previous.currencyCode ?? "USD" }
          : {}),
        ...("accountName" in item ? { accountName: draft.name.trim() } : {}),
        updatedAt: now,
      };
    }),
  };
}

/** Remove the account, its transactions and their denormalized references atomically. */
export function deleteAccountFromDocument(
  current: BackupDocument,
  id: string,
  now: string,
): BackupDocument {
  const account = editableAccount(current, id);
  const accountIds = new Set<JsonValue>(
    [account.uuid, account.id].filter((value) => value != null),
  );
  const removed = current.transactions.filter((item) =>
    accountIds.has(item.account),
  );
  const transactionIds = new Set<JsonValue>(
    removed
      .flatMap((item) => [item.uuid, item.id])
      .filter((value) => value != null),
  );
  const accountKeys = new Set([
    "account",
    "accountId",
    "fromAccount",
    "toAccount",
    "sourceAccount",
    "destinationAccount",
    "parentAccount",
    "linkedBankAccountId",
  ]);
  const transactionKeys = new Set(["transaction", "transactionId"]);
  function clean(value: JsonValue, key?: string): JsonValue {
    if (key && accountKeys.has(key) && accountIds.has(value)) return null;
    if (key && transactionKeys.has(key) && transactionIds.has(value))
      return null;
    if (Array.isArray(value)) {
      const ids =
        key === "accounts"
          ? accountIds
          : key === "transactions"
            ? transactionIds
            : null;
      return value.filter((item) => !ids?.has(item)).map((item) => clean(item));
    }
    if (value && typeof value === "object")
      return Object.fromEntries(
        Object.entries(value).map(([childKey, child]) => [
          childKey,
          clean(child, childKey),
        ]),
      );
    return value;
  }
  const next: BackupDocument = {
    ...current,
    accounts: current.accounts.filter((item) => item !== account),
    transactions: current.transactions.filter(
      (item) => !removed.includes(item),
    ),
  };
  // Process records, not metadata or arbitrary top-level fields.
  for (const key of Object.keys(next)) {
    const collection = next[key];
    if (!Array.isArray(collection)) continue;
    next[key] = collection.map((item) => {
      const cleaned = clean(item);
      return cleaned &&
        !Array.isArray(cleaned) &&
        typeof cleaned === "object" &&
        JSON.stringify(cleaned) !== JSON.stringify(item)
        ? { ...cleaned, updatedAt: now }
        : cleaned;
    });
  }
  return next;
}
