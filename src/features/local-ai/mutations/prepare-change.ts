import {
  addAccountToDocument,
  CARD_COMPANIES,
  deleteAccountFromDocument,
  updateAccountInDocument,
  type AccountDraft,
} from "@/data/model/account-record";
import type { BackupDocument } from "@/data/model/backup-document";
import {
  budgetDefaults,
  budgetDraft,
  saveBudget,
  type BudgetDraft,
} from "@/data/model/budget-record";
import {
  categoryParent,
  deleteCategory,
  identity,
  references,
  saveCategory,
  type CategoryDraft,
} from "@/data/model/category-record";
import type { JsonObject, JsonValue } from "@/data/model/json";
import { cloneBackupDocument } from "@/data/model/normalize-backup";
import {
  recurringDefaults,
  saveRecurring,
  type RecurringDraft,
} from "@/data/model/recurring-record";
import { createDefaultSavingsDetails } from "@/data/model/savings-account";
import {
  createTransactionDraft,
  deleteTransaction,
  saveTransaction,
  saveTransactionTemplate,
  transactionDraftFromRecord,
  type TransactionDraft,
} from "@/data/model/transaction-record";
import { selectBudgets } from "@/data/selectors/budget-selectors";
import { selectCategories } from "@/data/selectors/category-selectors";
import { selectAccountDraft, selectAccounts } from "@/data/selectors/document-selectors";
import { selectRecurrings } from "@/data/selectors/recurring-selectors";
import { selectExchangeRates } from "@/data/selectors/exchange-rate-selectors";
import { normalizeSearchText } from "@/data/selectors/search-selectors";

import { ToolContext, type ProfileRecordKey } from "../tools/tool-context";
import type {
  ChangeFields,
  ChangeFieldValue,
  ChangeProposal,
  ChangedField,
  EditableField,
  MutableEntityType,
  PrepareChangeArgs,
  PrepareChangeResult,
  RecordVisual,
  SideEffect,
} from "./change-types";
import {
  field,
  fieldText,
  localDay,
  parseAccountType,
  parseAmount,
  parseBoolean,
  parseBudgetPeriod,
  parseCurrency,
  parseList,
  parseRecurringPeriod,
  parseTransactionType,
  parseWhen,
} from "./field-parsers";

/** Proposals are only valid for a short review window. */
export const PROPOSAL_TTL_MS = 15 * 60_000;

/** The trusted recipe a confirmed proposal runs; never exposed to the model. */
export type ChangePlan = {
  collection: ProfileRecordKey;
  targetId: string;
  apply: (current: BackupDocument, now: string) => BackupDocument;
  /** Hash of the records this plan depends on, for stale detection. */
  fingerprint: (document: BackupDocument) => string;
};

type Failure = Extract<PrepareChangeResult, { ok: false }>;

type HandlerResult =
  | Failure
  | {
      ok: true;
      plan: ChangePlan;
      entityName: string;
      editableFields: EditableField[];
      warnings: string[];
      strongConfirmation?: boolean;
    };

type Handler = (scope: Scope, request: PrepareChangeArgs) => HandlerResult;

type Scope = {
  document: BackupDocument;
  context: ToolContext;
  profileId: string;
  now: Date;
  newId: () => string;
};

class ChangeError extends Error {
  constructor(readonly failure: Failure) {
    super(failure.message);
  }
}

function fail(
  code: Failure["code"],
  message: string,
  extra: Pick<Failure, "candidates" | "missingFields"> = {},
): never {
  throw new ChangeError({ ok: false, code, message, ...extra });
}

/** FNV-1a; enough to notice that a record changed between review and confirm. */
export function hashText(text: string) {
  let hash = 0x811c9dc5;
  for (let index = 0; index < text.length; index++) {
    hash ^= text.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193);
  }
  return (hash >>> 0).toString(16).padStart(8, "0");
}

function stable(value: JsonValue | undefined): string {
  if (Array.isArray(value)) return `[${value.map(stable).join(",")}]`;
  if (value && typeof value === "object")
    return `{${Object.keys(value)
      .filter((key) => key !== "updatedAt")
      .sort()
      .map((key) => `${key}:${stable(value[key])}`)
      .join(",")}}`;
  return JSON.stringify(value ?? null);
}

/** Fingerprints records by collection and id; a missing record hashes too. */
function fingerprintOf(refs: [ProfileRecordKey, string][], extra: (document: BackupDocument) => string = () => "") {
  return (document: BackupDocument) =>
    hashText(
      refs
        .map(([key, id]) => {
          const record = document[key].find((item) => identity(item) === id);
          return `${key}/${id}=${record ? stable(record) : "missing"}`;
        })
        .join("|") +
        `|profile=${document._local.selectedProfileId ?? ""}|` +
        extra(document),
    );
}

/** Identity-only fingerprint for records a plan merely references. */
function referenceFingerprint(refs: [ProfileRecordKey, string][]) {
  return (document: BackupDocument) =>
    refs
      .map(([key, id]) => {
        const record = document[key].find((item) => identity(item) === id);
        return record
          ? `${key}/${id}:${String(record.currencyCode ?? "")}:${String(record.type ?? "")}:${String(record.user ?? "")}`
          : `${key}/${id}:missing`;
      })
      .join("|");
}

function resolve(
  scope: Scope,
  key: ProfileRecordKey,
  reference: string | undefined,
  kind: string,
  filter: (record: JsonObject) => boolean = () => true,
): JsonObject | null {
  if (!reference) return null;
  const match = scope.context.findEntity(key, reference);
  const record = match.record && filter(match.record) ? match.record : null;
  if (record) return record;
  const candidates = (match.record ? [match.record] : match.candidates).filter(filter);
  if (candidates.length === 1) return candidates[0];
  if (candidates.length > 1)
    fail("AMBIGUOUS_ENTITY", `Several ${kind}s match "${reference}". Which one?`, {
      candidates: candidates.slice(0, 8).map((item) => ({ id: identity(item), name: String(item.name ?? identity(item)) })),
    });
  fail("ENTITY_NOT_FOUND", `No ${kind} named "${reference}" was found.`);
}

function isLeafCategory(document: BackupDocument, category: JsonObject) {
  return !document.categories.some((candidate) => references(category, categoryParent(candidate)));
}

function nameOf(scope: Scope, key: ProfileRecordKey, id: JsonValue | undefined) {
  if (id == null || id === "") return null;
  const record = scope.document[key].find((item) => references(item, id));
  return record ? String(record.name ?? identity(record)) : String(id);
}

function when(value: JsonValue | undefined) {
  if (typeof value !== "string") return null;
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) return value;
  return `${localDay(date)} ${String(date.getHours()).padStart(2, "0")}:${String(date.getMinutes()).padStart(2, "0")}`;
}

function scalar(value: JsonValue | undefined): ChangeFieldValue {
  if (value == null) return null;
  if (typeof value === "string" || typeof value === "number" || typeof value === "boolean") return value;
  if (Array.isArray(value)) return value.map(String);
  return null;
}

const TYPE_NAMES = ["expense", "income", "transfer"] as const;

/** Human-facing projection of a stored record for the before/after view. */
function display(
  scope: Scope,
  entityType: MutableEntityType,
  record: JsonObject | undefined,
  document: BackupDocument,
): Record<string, ChangeFieldValue> | null {
  if (!record) return null;
  const view = { ...scope, document };
  const categoryNames = (values: JsonValue | undefined) =>
    Array.isArray(values) ? values.map((id) => nameOf(view, "categories", id) ?? "?") : [];
  switch (entityType) {
    case "transaction":
      return {
        name: scalar(record.name),
        type: TYPE_NAMES[Number(record.type) === 1 ? 1 : Number(record.type) === 2 ? 2 : 0],
        amount: scalar(record.amount),
        currency: scalar(record.currencyCode),
        date: when(record.date ?? record.createdAt),
        account: nameOf(view, "accounts", record.account),
        ...(Number(record.type) === 2 ? { toAccount: nameOf(view, "accounts", record.toAccount) } : {}),
        category: nameOf(view, "categories", record.category),
        description: scalar(record.description) || null,
        label: nameOf(view, "labels", record.label),
        place: nameOf(view, "places", record.place),
        person: nameOf(view, "peoples", record.person ?? record.payee),
        budget: nameOf(view, "budgets", record.budget),
      };
    case "budget":
      return {
        name: scalar(record.name),
        amount: scalar(record.amount),
        currency: scalar(record.currencyCode),
        period: scalar(record.period),
        budgetType: scalar(record.budgetType),
        categories: record.budgetType === "Overall" ? null : categoryNames(record.categories),
        accounts: Array.isArray(record.accounts) && record.accounts.length
          ? record.accounts.map((id) => nameOf(view, "accounts", id) ?? "?")
          : null,
        rolling: record.rolling === true,
        showOnHome: record.showOnHome === true,
        ...(record.isArchived === true ? { archived: true } : {}),
      };
    case "recurring":
      return {
        name: scalar(record.name),
        type: record.type === 1 ? "income" : "expense",
        amount: scalar(record.amount),
        currency: scalar(record.currencyCode),
        period: scalar(record.period),
        startAt: when(record.startAt),
        endAt: when(record.endAt),
        account: nameOf(view, "accounts", record.account),
        category: nameOf(view, "categories", record.category),
        automatic: record.automatic === true,
        archived: record.archived === true,
      };
    case "category":
      return {
        name: scalar(record.name),
        type: TYPE_NAMES[Number(record.type) === 1 ? 1 : Number(record.type) === 2 ? 2 : 0],
        parent: nameOf(view, "categories", categoryParent(record)),
        description: scalar(record.description) || null,
        color: scalar(record.color),
      };
    case "account":
      return {
        name: scalar(record.name),
        accountType: scalar(record.accountType),
        balance: scalar(record.amount),
        currency: scalar(record.currencyCode),
        ...(record.accountType === "bank" ? { bankName: scalar(record.bankName) } : {}),
        ...(record.accountType === "card"
          ? {
              cardCompany: scalar(record.cardCompany),
              cardLastFour: scalar(record.cardLastFour),
              paymentDay: scalar(record.paymentDay),
              creditLimit: scalar(record.creditLimit),
              linkedBank: nameOf(view, "accounts", record.linkedBankAccountId),
            }
          : {}),
        isDefault: record.isDefault === true,
        isExcluded: record.isExcluded === true,
      };
    case "template":
      return {
        name: scalar(record.name),
        type: TYPE_NAMES[Number(record.type) === 1 ? 1 : Number(record.type) === 2 ? 2 : 0],
        amount: scalar(record.amount),
        currency: scalar(record.currencyCode),
        account: nameOf(view, "accounts", record.account),
        category: nameOf(view, "categories", record.category),
      };
    default: {
      const result: Record<string, ChangeFieldValue> = {};
      for (const [key, value] of Object.entries(record)) {
        if (/^(uuid|id|user|createdAt|updatedAt|icon|iconPath|color|transactions|phone|email|_.*)$/i.test(key)) continue;
        if (key === "person") {
          result.person = nameOf(view, "peoples", value);
          continue;
        }
        const plain = scalar(value);
        if (plain !== null && (typeof plain !== "string" || plain.length <= 120)) result[key] = plain;
      }
      if (record.phone != null && entityType === "person") result.phone = "(stored)";
      return result;
    }
  }
}

const SIDE_EFFECT_COLLECTIONS: ProfileRecordKey[] = [
  "accounts",
  "transactions",
  "categories",
  "budgets",
  "recurrings",
  "templates",
  "goals",
  "loans",
  "assets",
  "labels",
  "places",
  "peoples",
  "billSplitters",
];

/**
 * Side effects are read from the difference between the current document and
 * the dry-run result, so the preview shows exactly what the domain code will
 * do (balance updates, cascades, detached references).
 */
function sideEffects(
  before: BackupDocument,
  after: BackupDocument,
  target: { collection: ProfileRecordKey; id: string },
): SideEffect[] {
  const effects: SideEffect[] = [];
  for (const key of SIDE_EFFECT_COLLECTIONS) {
    const previous = new Map(before[key].map((record) => [identity(record), record]));
    const next = new Map(after[key].map((record) => [identity(record), record]));
    const removed: string[] = [];
    const added: string[] = [];
    const changed: string[] = [];
    for (const [id, record] of previous) {
      if (key === target.collection && id === target.id) continue;
      const updated = next.get(id);
      if (!updated) removed.push(id);
      else if (stable(updated) !== stable(record)) {
        if (key === "accounts" && Number(updated.amount) !== Number(record.amount)) {
          effects.push({
            kind: "account_balance",
            description: `${String(record.name ?? "Account")} balance changes from ${Number(record.amount).toFixed(2)} to ${Number(updated.amount).toFixed(2)} ${String(record.currencyCode ?? "")}`,
            affectedEntityIds: [id],
            params: {
              name: String(record.name ?? "Account"),
              before: Number(record.amount).toFixed(2),
              after: Number(updated.amount).toFixed(2),
              currency: String(record.currencyCode ?? ""),
            },
          });
          continue;
        }
        // Denormalized id lists (account.transactions) are bookkeeping only.
        const { transactions: _a, updatedAt: _b, ...left } = record;
        const { transactions: _c, updatedAt: _d, ...right } = updated;
        if (stable(left) !== stable(right)) changed.push(id);
      }
    }
    for (const id of next.keys())
      if (!previous.has(id) && !(key === target.collection && id === target.id)) added.push(id);
    const push = (kind: string, ids: string[], verb: string) => {
      if (ids.length)
        effects.push({
          kind,
          description: `${ids.length} ${key} ${verb}`,
          affectedEntityIds: ids.slice(0, 50),
          params: { count: ids.length, collection: key },
        });
    };
    push("records_deleted", removed, "deleted");
    push("records_updated", changed, "updated");
    push("records_created", added, "created");
  }
  const removedAttachments = before._local.attachments.length - after._local.attachments.length;
  if (removedAttachments > 0)
    effects.push({
      kind: "attachments_removed",
      description: `${removedAttachments} receipt attachment reference removed`,
      affectedEntityIds: [],
      params: { count: removedAttachments },
    });
  return effects;
}

function changed(
  before: Record<string, ChangeFieldValue> | null,
  after: Record<string, ChangeFieldValue> | null,
): ChangedField[] {
  const keys = new Set([...Object.keys(before ?? {}), ...Object.keys(after ?? {})]);
  const result: ChangedField[] = [];
  for (const key of keys) {
    const left = before?.[key] ?? null;
    const right = after?.[key] ?? null;
    if (JSON.stringify(left) !== JSON.stringify(right)) result.push({ field: key, before: left, after: right });
  }
  return result;
}

// ---------------------------------------------------------------------------
// Transactions

function findTransaction(scope: Scope, reference: string | undefined, fields: ChangeFields) {
  if (!reference) fail("ENTITY_NOT_FOUND", "Which transaction should change?", { missingFields: ["entityId"] });
  const facts = scope.context.search.facts;
  const byId = facts.find((fact) => fact.entry.id === reference);
  if (byId) return byId;
  const now = scope.now;
  const tokens = normalizeSearchText(reference).split(/\s+/).filter(Boolean);
  let matches = facts;
  const words: string[] = [];
  for (const token of tokens) {
    if (/^\d{4}-\d{2}-\d{2}$/.test(token)) {
      matches = matches.filter((fact) => localDay(new Date(fact.entry.timestamp)) === token);
    } else if (/^(today|yesterday|היום|אתמול|сегодня|вчера)$/.test(token)) {
      const day = parseWhen(token, now)!;
      matches = matches.filter((fact) => localDay(new Date(fact.entry.timestamp)) === localDay(day));
    } else if (/^\d+([.,]\d+)?$/.test(token)) {
      const amount = Number(token.replace(",", "."));
      matches = matches.filter((fact) => Math.abs(fact.amount - amount) < 0.005 || Math.abs(fact.reportingAmount - amount) < 0.005);
    } else words.push(token);
  }
  matches = matches.filter((fact) => words.every((word) => fact.haystack.includes(word)));
  // An exact name beats partial matches ("Coffee" vs "Northline Coffee").
  const exact = matches.filter((fact) => normalizeSearchText(String(fact.entry.record.name ?? "")) === words.join(" "));
  if (words.length && exact.length) matches = exact;
  // "the 340 one" may be passed as a separate field.
  const hintAmount = parseAmount(field(fields, "currentAmount", "oldAmount", "matchAmount"));
  if (hintAmount !== undefined && matches.length > 1)
    matches = matches.filter((fact) => Math.abs(fact.amount - hintAmount) < 0.005);
  if (matches.length === 1) return matches[0];
  if (!matches.length) fail("ENTITY_NOT_FOUND", `No transaction matches "${reference}".`);
  fail("AMBIGUOUS_ENTITY", `${matches.length} transactions match "${reference}". Which one?`, {
    candidates: matches.slice(0, 8).map((fact) => ({ id: fact.entry.id, name: String(fact.entry.record.name ?? fact.entry.id) })),
  });
}

function applyTransactionFields(scope: Scope, draft: TransactionDraft, fields: ChangeFields, warnings: string[], creating: boolean) {
  const type = parseTransactionType(field(fields, "type", "transactionType", "kind"));
  if (type !== undefined) draft.type = type;
  const name = fieldText(fields, "name", "title", "merchant", "payee");
  if (name) draft.name = name.slice(0, 100);
  const amount = parseAmount(field(fields, "amount", "newAmount", "value", "price"));
  if (amount !== undefined) draft.amount = String(amount);
  const date = parseWhen(fieldText(fields, "date", "occurredAt", "when", "time"), scope.now);
  if (date) draft.occurredAt = date.toISOString();
  const description = fieldText(fields, "description", "note", "notes", "memo");
  if (description !== undefined) draft.description = description.slice(0, 500);
  const accountRef = fieldText(fields, "account", "accountId", "fromAccount", "source");
  if (accountRef) draft.accountId = identity(resolve(scope, "accounts", accountRef, "account")!);
  const destinationRef = fieldText(fields, "toAccount", "destinationAccount", "destination", "to");
  if (destinationRef) {
    draft.destinationAccountId = identity(resolve(scope, "accounts", destinationRef, "account")!);
    if (type === undefined) draft.type = 2;
  }
  const categoryRef = fieldText(fields, "category", "categoryId");
  if (categoryRef) {
    const match = scope.context.findEntity("categories", categoryRef);
    const candidates = (match.record ? [match.record] : match.candidates).filter(
      (item) => type === undefined || Number(item.type ?? 0) === draft.type,
    );
    const leaves = candidates.filter((item) => isLeafCategory(scope.document, item));
    const category = leaves.length === 1 ? leaves[0] : null;
    if (category) {
      draft.categoryId = identity(category);
      // A category of another direction implies the direction ("Salary").
      if (type === undefined) draft.type = Number(category.type ?? 0) === 1 ? 1 : Number(category.type ?? 0) === 2 ? 2 : 0;
    } else if (candidates.length === 1 && !isLeafCategory(scope.document, candidates[0]))
      warnings.push(`"${String(candidates[0].name)}" has subcategories; choose one of them below.`);
    else if (candidates.length > 1) warnings.push(`Several categories match "${categoryRef}"; choose one below.`);
    else warnings.push(`No category named "${categoryRef}"; choose one below.`);
  }
  for (const [key, collection, kind, draftKey] of [
    ["label", "labels", "label", "labelId"],
    ["place", "places", "place", "placeId"],
    ["person", "peoples", "person", "personId"],
    ["budget", "budgets", "budget", "budgetId"],
    ["loan", "loans", "loan", "loanId"],
  ] as const) {
    const reference = fieldText(fields, key, `${key}Id`);
    if (!reference) continue;
    try {
      draft[draftKey] = identity(resolve(scope, collection, reference, kind)!);
    } catch (error) {
      if (!(error instanceof ChangeError)) throw error;
      warnings.push(error.failure.message);
    }
  }
  if (creating && !draft.accountId) {
    const accounts = scope.context.records("accounts");
    const preferred = accounts.find((account) => account.isDefault === true) ?? (accounts.length === 1 ? accounts[0] : undefined);
    if (!preferred) fail("MUTATION_VALIDATION_FAILED", "Which account should this transaction use?", { missingFields: ["account"] });
    draft.accountId = identity(preferred);
    warnings.push(`Uses your ${preferred.isDefault === true ? "default" : "only"} account "${String(preferred.name)}"; change it below if needed.`);
  }
  // Currency: foreign amounts are converted with saved rates only (offline).
  const account = scope.document.accounts.find((item) => references(item, draft.accountId));
  const accountCurrency = String(account?.currencyCode ?? "USD").toUpperCase();
  draft.accountCurrencyCode = accountCurrency;
  const currency = parseCurrency(field(fields, "currency", "currencyCode"));
  if (currency) draft.currencyCode = currency;
  if (!draft.currencyCode || draft.type === 2) draft.currencyCode = accountCurrency;
  if (draft.currencyCode !== accountCurrency && (currency || creating)) {
    const snapshot = selectExchangeRates(scope.document, draft.currencyCode);
    const rate = snapshot?.rates[accountCurrency];
    if (!snapshot || !rate)
      fail(
        "MUTATION_VALIDATION_FAILED",
        `There is no saved ${draft.currencyCode} to ${accountCurrency} exchange rate on this device. Add this transaction in the app while online, or use ${accountCurrency}.`,
      );
    draft.exchangeRate = rate;
    draft.exchangeRateDate = snapshot.date;
    draft.exchangeRateFetchedAt = snapshot.fetchedAt;
    draft.exchangeRateSource = snapshot.source;
    draft.conversionSnapshot = snapshot;
    warnings.push(`Converted with the saved ${draft.currencyCode} rate from ${snapshot.date}.`);
  }
}

function transactionEditable(draft: TransactionDraft): EditableField[] {
  return [
    { field: "name", kind: "text", value: draft.name, required: true },
    { field: "amount", kind: "amount", value: draft.amount, required: true },
    { field: "type", kind: "choice", value: TYPE_NAMES[draft.type], options: TYPE_NAMES },
    { field: "date", kind: "date", value: draft.occurredAt },
    { field: "account", kind: "account", value: draft.accountId, required: true },
    ...(draft.type === 2
      ? [{ field: "toAccount", kind: "account" as const, value: draft.destinationAccountId, required: true }]
      : [{ field: "category", kind: "category" as const, value: draft.categoryId, categoryType: draft.type }]),
    { field: "description", kind: "text", value: draft.description },
  ];
}

const transactionHandler: Handler = (scope, request) => {
  const fields = request.userProvidedFields ?? {};
  const warnings: string[] = [];
  if (request.operation === "archive") fail("UNSUPPORTED_OPERATION", "Transactions cannot be archived; they can be edited or deleted.");
  if (request.operation === "create") {
    const draft = createTransactionDraft(parseTransactionType(field(fields, "type")) ?? 0);
    draft.occurredAt = scope.now.toISOString();
    applyTransactionFields(scope, draft, fields, warnings, true);
    const id = scope.newId();
    const refs: [ProfileRecordKey, string][] = [["accounts", draft.accountId]];
    if (draft.destinationAccountId) refs.push(["accounts", draft.destinationAccountId]);
    if (draft.categoryId) refs.push(["categories", draft.categoryId]);
    return {
      ok: true,
      entityName: draft.name || "transaction",
      editableFields: transactionEditable(draft),
      warnings,
      plan: {
        collection: "transactions",
        targetId: id,
        apply: (current, now) => saveTransaction(current, draft, id, scope.profileId, now, false),
        fingerprint: fingerprintOf([["transactions", id]], referenceFingerprint(refs)),
      },
    };
  }
  const fact = findTransaction(scope, request.entityId, fields);
  const id = fact.entry.id;
  const name = String(fact.entry.record.name ?? "transaction");
  if (scope.context.isCardPayment(fact))
    warnings.push("This transfer was created automatically by a card payment; changing it can make the card and bank balances disagree.");
  if (request.operation === "delete")
    return {
      ok: true,
      entityName: name,
      editableFields: [],
      warnings,
      plan: {
        collection: "transactions",
        targetId: id,
        apply: (current, now) => deleteTransaction(current, id, scope.profileId, now),
        fingerprint: fingerprintOf([["transactions", id]]),
      },
    };
  const draft = transactionDraftFromRecord(scope.document, id);
  if (!draft) fail("ENTITY_NOT_FOUND", "That transaction no longer exists.");
  // The lookup hint is not a new value.
  const { currentAmount: _a, oldAmount: _b, matchAmount: _c, ...updates } = fields;
  applyTransactionFields(scope, draft, updates, warnings, false);
  return {
    ok: true,
    entityName: name,
    editableFields: transactionEditable(draft),
    warnings,
    plan: {
      collection: "transactions",
      targetId: id,
      apply: (current, now) => saveTransaction(current, draft, id, scope.profileId, now, true),
      fingerprint: fingerprintOf([["transactions", id]]),
    },
  };
};

// ---------------------------------------------------------------------------
// Budgets

function resolveCategories(scope: Scope, names: string[], type: number) {
  const ids: string[] = [];
  for (const name of names) {
    const record = resolve(scope, "categories", name, "category", (item) => Number(item.type ?? 0) === type);
    if (record) ids.push(identity(record));
  }
  return ids;
}

function applyBudgetFields(scope: Scope, draft: BudgetDraft, fields: ChangeFields, creating: boolean) {
  const name = fieldText(fields, "name", "title");
  if (name) draft.name = name.slice(0, 100);
  const amount = parseAmount(field(fields, "amount", "limit", "newAmount"));
  if (amount !== undefined) draft.amount = String(amount);
  const period = parseBudgetPeriod(field(fields, "period", "frequency"));
  if (period) draft.period = period;
  const type = parseTransactionType(field(fields, "transactionType"));
  if (type !== undefined) draft.transactionType = type;
  const categories = parseList(field(fields, "categories", "category"));
  if (categories.length) {
    draft.categories = resolveCategories(scope, categories, draft.transactionType);
    draft.budgetType = "Category";
  } else if (creating && !draft.categories.length) draft.budgetType = "Overall";
  const budgetType = fieldText(fields, "budgetType");
  if (budgetType && /overall|all/i.test(budgetType)) {
    draft.budgetType = "Overall";
    draft.categories = [];
  }
  const accounts = parseList(field(fields, "accounts", "account"));
  if (accounts.length) draft.accounts = accounts.map((ref) => identity(resolve(scope, "accounts", ref, "account")!));
  const currency = parseCurrency(field(fields, "currency", "currencyCode"));
  if (currency) draft.currencyCode = currency;
  for (const key of ["rolling", "showOnHome", "includeSubcategories"] as const) {
    const flag = parseBoolean(field(fields, key));
    if (flag !== undefined) draft[key] = flag;
  }
  const cycleDay = parseAmount(field(fields, "cycleDay"));
  if (cycleDay !== undefined) draft.cycleDay = String(Math.round(cycleDay));
  for (const key of ["startDate", "endDate"] as const) {
    const date = parseWhen(fieldText(fields, key), scope.now);
    if (date) draft[key] = localDay(date);
  }
  const notes = fieldText(fields, "notes", "description");
  if (notes !== undefined) draft.notes = notes.slice(0, 500);
  const color = fieldText(fields, "color");
  if (color && /^#[a-f\d]{6}$/i.test(color)) draft.color = color;
}

function budgetEditable(draft: BudgetDraft): EditableField[] {
  return [
    { field: "name", kind: "text", value: draft.name, required: true },
    { field: "amount", kind: "amount", value: draft.amount, required: true },
    { field: "period", kind: "choice", value: draft.period, options: ["Daily", "Weekly", "Monthly", "Yearly"] },
    ...(draft.budgetType === "Category"
      ? [{ field: "category", kind: "category" as const, value: draft.categories[0] ?? "", categoryType: draft.transactionType }]
      : []),
    { field: "showOnHome", kind: "toggle", value: draft.showOnHome },
  ];
}

const budgetHandler: Handler = (scope, request) => {
  const fields = request.userProvidedFields ?? {};
  if (request.operation === "create") {
    const draft = { ...budgetDefaults(), currencyCode: scope.context.currency };
    applyBudgetFields(scope, draft, fields, true);
    const id = scope.newId();
    return {
      ok: true,
      entityName: draft.name || "budget",
      editableFields: budgetEditable(draft),
      warnings: [],
      plan: {
        collection: "budgets",
        targetId: id,
        apply: (current, now) => saveBudget(current, draft, id, now, false),
        fingerprint: fingerprintOf([["budgets", id]], referenceFingerprint(draft.categories.map((c) => ["categories", c]))),
      },
    };
  }
  const record = resolve(scope, "budgets", request.entityId, "budget");
  if (!record) fail("ENTITY_NOT_FOUND", "Which budget?", { missingFields: ["entityId"] });
  const id = identity(record);
  const name = String(record.name ?? "budget");
  const fingerprint = fingerprintOf([["budgets", id]]);
  if (request.operation === "delete") {
    const linked = scope.context.records("transactions").filter((item) => references(record, item.budget)).length;
    return {
      ok: true,
      entityName: name,
      editableFields: [],
      warnings: linked ? [`${linked} transactions are assigned to this budget; they are kept.`] : [],
      plan: {
        collection: "budgets",
        targetId: id,
        apply: (current) => ({ ...current, budgets: current.budgets.filter((item) => identity(item) !== id) }),
        fingerprint,
      },
    };
  }
  if (request.operation === "archive")
    return {
      ok: true,
      entityName: name,
      editableFields: [],
      warnings: [],
      plan: {
        collection: "budgets",
        targetId: id,
        apply: (current, now) => ({
          ...current,
          budgets: current.budgets.map((item) => (identity(item) === id ? { ...item, isArchived: true, updatedAt: now } : item)),
        }),
        fingerprint,
      },
    };
  const draft = budgetDraft(record, scope.context.currency);
  applyBudgetFields(scope, draft, fields, false);
  return {
    ok: true,
    entityName: name,
    editableFields: budgetEditable(draft),
    warnings: [],
    plan: {
      collection: "budgets",
      targetId: id,
      apply: (current, now) => saveBudget(current, draft, id, now, true),
      fingerprint,
    },
  };
};

// ---------------------------------------------------------------------------
// Recurring schedules

function applyRecurringFields(scope: Scope, draft: RecurringDraft, fields: ChangeFields, creating: boolean, warnings: string[]) {
  const name = fieldText(fields, "name", "title");
  if (name) draft.name = name.slice(0, 100);
  const amount = parseAmount(field(fields, "amount", "newAmount"));
  if (amount !== undefined) draft.amount = String(amount);
  const type = parseTransactionType(field(fields, "type"));
  if (type === 0 || type === 1) draft.type = type;
  const period = parseRecurringPeriod(field(fields, "period", "frequency"));
  if (period) draft.period = period;
  const start = parseWhen(fieldText(fields, "startAt", "startDate", "date", "nextDate"), scope.now);
  if (start) draft.startAt = start.toISOString();
  const end = parseWhen(fieldText(fields, "endAt", "endDate"), scope.now);
  if (end) draft.endAt = end.toISOString();
  const automatic = parseBoolean(field(fields, "automatic", "auto"));
  if (automatic !== undefined) draft.automatic = automatic;
  const description = fieldText(fields, "description", "note");
  if (description !== undefined) draft.description = description.slice(0, 500);
  const accountRef = fieldText(fields, "account");
  if (accountRef) draft.account = identity(resolve(scope, "accounts", accountRef, "account")!);
  if (creating && !draft.account) {
    const accounts = scope.context.records("accounts");
    const preferred = accounts.find((account) => account.isDefault === true) ?? (accounts.length === 1 ? accounts[0] : undefined);
    if (!preferred) fail("MUTATION_VALIDATION_FAILED", "Which account should this recurring payment use?", { missingFields: ["account"] });
    draft.account = identity(preferred);
  }
  const categoryRef = fieldText(fields, "category");
  if (categoryRef) {
    const match = scope.context.findEntity("categories", categoryRef);
    const leaves = (match.record ? [match.record] : match.candidates).filter(
      (item) => Number(item.type ?? 0) === draft.type && isLeafCategory(scope.document, item),
    );
    if (leaves.length === 1) draft.category = identity(leaves[0]);
    else warnings.push(`Choose a category for "${categoryRef}" below.`);
  }
  const currency = parseCurrency(field(fields, "currency", "currencyCode"));
  const account = scope.document.accounts.find((item) => references(item, draft.account));
  if (currency) draft.currencyCode = currency;
  else if (creating) draft.currencyCode = String(account?.currencyCode ?? scope.context.currency).toUpperCase();
  const reminder = parseAmount(field(fields, "reminderDays"));
  if (reminder !== undefined) draft.reminderDays = [0, 1, 2, 7].includes(reminder) ? reminder : null;
}

function recurringEditable(draft: RecurringDraft): EditableField[] {
  return [
    { field: "name", kind: "text", value: draft.name, required: true },
    { field: "amount", kind: "amount", value: draft.amount, required: true },
    { field: "type", kind: "choice", value: draft.type === 1 ? "income" : "expense", options: ["expense", "income"] },
    { field: "period", kind: "choice", value: draft.period, options: ["Weekly", "Fortnightly", "Monthly", "Quarterly", "Yearly"] },
    { field: "startAt", kind: "date", value: draft.startAt },
    { field: "account", kind: "account", value: draft.account, required: true },
    { field: "category", kind: "category", value: draft.category, categoryType: draft.type },
    { field: "automatic", kind: "toggle", value: draft.automatic },
  ];
}

const recurringHandler: Handler = (scope, request) => {
  const fields = request.userProvidedFields ?? {};
  const warnings: string[] = [];
  if (request.operation === "create") {
    const draft = recurringDefaults(scope.now);
    applyRecurringFields(scope, draft, fields, true, warnings);
    const id = scope.newId();
    return {
      ok: true,
      entityName: draft.name || "recurring payment",
      editableFields: recurringEditable(draft),
      warnings,
      plan: {
        collection: "recurrings",
        targetId: id,
        apply: (current, now) => saveRecurring(current, draft, id, scope.profileId, now, false),
        fingerprint: fingerprintOf([["recurrings", id]], referenceFingerprint([["accounts", draft.account]])),
      },
    };
  }
  const record = resolve(scope, "recurrings", request.entityId, "recurring payment");
  if (!record) fail("ENTITY_NOT_FOUND", "Which recurring payment?", { missingFields: ["entityId"] });
  const id = identity(record);
  const name = String(record.name ?? "recurring payment");
  const fingerprint = fingerprintOf([["recurrings", id]]);
  if (request.operation === "delete")
    return {
      ok: true,
      entityName: name,
      editableFields: [],
      warnings: ["Past transactions it created are kept."],
      plan: {
        collection: "recurrings",
        targetId: id,
        apply: (current) => ({ ...current, recurrings: current.recurrings.filter((item) => identity(item) !== id) }),
        fingerprint,
      },
    };
  if (request.operation === "archive") {
    if (record.archived === true) fail("MUTATION_VALIDATION_FAILED", `"${name}" is already archived.`);
    return {
      ok: true,
      entityName: name,
      editableFields: [],
      warnings: ["It will stop creating payments until restored."],
      plan: {
        collection: "recurrings",
        targetId: id,
        apply: (current, now) => ({
          ...current,
          recurrings: current.recurrings.map((item) => (identity(item) === id ? { ...item, archived: true, updatedAt: now } : item)),
        }),
        fingerprint,
      },
    };
  }
  const item = scope.context.recurringsView().find((entry) => entry.id === id);
  if (!item) fail("ENTITY_NOT_FOUND", "That recurring payment is not available in this profile.");
  const draft: RecurringDraft = { ...item.draft };
  applyRecurringFields(scope, draft, fields, false, warnings);
  const restore = parseBoolean(field(fields, "archived"));
  return {
    ok: true,
    entityName: name,
    editableFields: recurringEditable(draft),
    warnings,
    plan: {
      collection: "recurrings",
      targetId: id,
      apply: (current, now) => {
        const saved = saveRecurring(current, draft, id, scope.profileId, now, true);
        return restore === undefined
          ? saved
          : { ...saved, recurrings: saved.recurrings.map((entry) => (identity(entry) === id ? { ...entry, archived: restore } : entry)) };
      },
      fingerprint,
    },
  };
};

// ---------------------------------------------------------------------------
// Categories

const categoryHandler: Handler = (scope, request) => {
  const fields = request.userProvidedFields ?? {};
  if (request.operation === "archive") fail("UNSUPPORTED_OPERATION", "Categories cannot be archived.");
  const existing = request.operation === "create" ? null : resolve(scope, "categories", request.entityId, "category");
  if (request.operation !== "create" && !existing) fail("ENTITY_NOT_FOUND", "Which category?", { missingFields: ["entityId"] });
  if (request.operation === "delete") {
    const id = identity(existing!);
    return {
      ok: true,
      entityName: String(existing!.name ?? "category"),
      editableFields: [],
      warnings: [],
      plan: {
        collection: "categories",
        targetId: id,
        apply: (current, now) => deleteCategory(current, id, now),
        fingerprint: fingerprintOf([["categories", id]]),
      },
    };
  }
  const parentRef = fieldText(fields, "parent", "parentId", "parentCategory");
  const parent = parentRef ? resolve(scope, "categories", parentRef, "category") : null;
  const type =
    parseTransactionType(field(fields, "type")) ??
    (parent ? (Number(parent.type ?? 0) as 0 | 1 | 2) : existing ? (Number(existing.type ?? 0) as 0 | 1 | 2) : 0);
  const draft: CategoryDraft = {
    name: fieldText(fields, "name") ?? String(existing?.name ?? ""),
    description: fieldText(fields, "description") ?? String(existing?.description ?? ""),
    type,
    parentId: parent ? identity(parent) : existing ? ((categoryParent(existing) as string | null) ?? null) : null,
    icon: String(existing?.icon ?? parent?.icon ?? "shopping"),
    iconPath: typeof (existing?.iconPath ?? parent?.iconPath) === "string" ? String(existing?.iconPath ?? parent?.iconPath) : null,
    color: fieldText(fields, "color") ?? String(existing?.color ?? parent?.color ?? "#70d2eb"),
    isDefault: parseBoolean(field(fields, "isDefault")) ?? existing?.isDefault === true,
  };
  if (draft.icon.startsWith("material:") && !draft.iconPath) draft.icon = "shopping";
  const id = existing ? identity(existing) : scope.newId();
  return {
    ok: true,
    entityName: draft.name || "category",
    editableFields: [
      { field: "name", kind: "text", value: draft.name, required: true },
      { field: "type", kind: "choice", value: TYPE_NAMES[draft.type], options: TYPE_NAMES },
    ],
    warnings: [],
    plan: {
      collection: "categories",
      targetId: id,
      apply: (current, now) => saveCategory(current, draft, id, scope.profileId, now, !!existing),
      fingerprint: fingerprintOf([["categories", id]], referenceFingerprint(draft.parentId ? [["categories", draft.parentId]] : [])),
    },
  };
};

// ---------------------------------------------------------------------------
// Accounts

const ACCOUNT_ICONS: Record<string, string> = { bank: "bank", cash: "cash", savings: "piggy-bank", card: "credit-card" };

const accountHandler: Handler = (scope, request) => {
  const fields = request.userProvidedFields ?? {};
  if (request.operation === "archive") fail("UNSUPPORTED_OPERATION", "Accounts cannot be archived; you can exclude them from totals instead.");
  const existing = request.operation === "create" ? null : resolve(scope, "accounts", request.entityId, "account");
  if (request.operation !== "create" && !existing) fail("ENTITY_NOT_FOUND", "Which account?", { missingFields: ["entityId"] });
  if (request.operation === "delete") {
    const id = identity(existing!);
    const count = scope.context.records("transactions").filter((item) => references(existing!, item.account)).length;
    return {
      ok: true,
      entityName: String(existing!.name ?? "account"),
      editableFields: [],
      warnings: [`Deleting this account also deletes its ${count} transactions. This cannot be undone.`],
      strongConfirmation: true,
      plan: {
        collection: "accounts",
        targetId: id,
        apply: (current, now) => deleteAccountFromDocument(current, id, now),
        fingerprint: fingerprintOf([["accounts", id]], (document) => String(document.transactions.length)),
      },
    };
  }
  const warnings: string[] = [];
  const base: AccountDraft = existing
    ? selectAccountDraft(scope.document, identity(existing)) ?? fail("ENTITY_NOT_FOUND", "That account is not available.")
    : {
        name: "",
        amount: "0",
        creditLimit: "",
        accountNumber: "",
        accountType: "bank",
        currencyCode: scope.context.currency,
        icon: "bank",
        iconPath: null,
        color: "#5c6bc0",
        isDefault: false,
        isExcluded: false,
        cardLastFour: "",
        cardCompany: "Other",
        paymentDay: null,
        bankName: "",
        linkedBankAccountId: null,
        savingsDetails: createDefaultSavingsDetails(),
      };
  const draft: AccountDraft = { ...base };
  const name = fieldText(fields, "name");
  if (name) draft.name = name.slice(0, 100);
  const type = parseAccountType(field(fields, "accountType", "type", "kind"));
  if (type) {
    draft.accountType = type;
    if (!existing) draft.icon = ACCOUNT_ICONS[type];
  }
  const balance = field(fields, "balance", "amount", "initialBalance");
  if (balance !== undefined) {
    const amount = typeof balance === "number" ? balance : Number(String(balance).replace(/[^\d.-]/g, ""));
    if (Number.isFinite(amount)) {
      draft.amount = String(amount);
      if (existing) warnings.push("This sets the stored balance directly, without creating a transaction.");
    }
  }
  const currency = parseCurrency(field(fields, "currency", "currencyCode"));
  if (currency) draft.currencyCode = currency;
  const bankName = fieldText(fields, "bankName", "bank", "institution");
  if (bankName) draft.bankName = bankName;
  if (draft.accountType === "bank" && !draft.bankName) draft.bankName = draft.name;
  const lastFour = fieldText(fields, "cardLastFour", "lastFour", "last4");
  if (lastFour) draft.cardLastFour = lastFour.replace(/\D/g, "").slice(-4);
  const company = fieldText(fields, "cardCompany", "company", "issuer");
  if (company) draft.cardCompany = CARD_COMPANIES.find((item) => item.toLowerCase() === company.toLowerCase()) ?? "Other";
  const paymentDay = parseAmount(field(fields, "paymentDay"));
  if (paymentDay !== undefined) draft.paymentDay = Math.round(paymentDay);
  const limit = parseAmount(field(fields, "creditLimit", "limit"));
  if (limit !== undefined) draft.creditLimit = String(limit);
  const linked = fieldText(fields, "linkedBank", "linkedBankAccountId", "bankAccount");
  if (linked) draft.linkedBankAccountId = identity(resolve(scope, "accounts", linked, "bank account", (item) => item.accountType === "bank")!);
  if (draft.accountType === "card" && !draft.linkedBankAccountId) {
    const banks = scope.context.records("accounts").filter((item) => item.accountType === "bank");
    if (banks.length === 1) draft.linkedBankAccountId = identity(banks[0]);
  }
  for (const key of ["isDefault", "isExcluded"] as const) {
    const flag = parseBoolean(field(fields, key));
    if (flag !== undefined) draft[key] = flag;
  }
  const accountNumber = fieldText(fields, "accountNumber");
  if (accountNumber !== undefined) draft.accountNumber = accountNumber;
  const id = existing ? identity(existing) : scope.newId();
  return {
    ok: true,
    entityName: draft.name || "account",
    editableFields: [
      { field: "name", kind: "text", value: draft.name, required: true },
      { field: "balance", kind: "amount", value: draft.amount },
      { field: "accountType", kind: "choice", value: draft.accountType, options: ["bank", "cash", "savings", "card"] },
    ],
    warnings,
    plan: {
      collection: "accounts",
      targetId: id,
      apply: (current, now) =>
        existing
          ? updateAccountInDocument(current, draft, id, now)
          : addAccountToDocument(current, draft, scope.profileId, id, now),
      fingerprint: fingerprintOf([["accounts", id]]),
    },
  };
};

// ---------------------------------------------------------------------------
// Templates

const templateHandler: Handler = (scope, request) => {
  const fields = request.userProvidedFields ?? {};
  if (request.operation === "create") {
    const warnings: string[] = [];
    const draft = createTransactionDraft(parseTransactionType(field(fields, "type")) ?? 0);
    applyTransactionFields(scope, draft, fields, warnings, true);
    const id = scope.newId();
    return {
      ok: true,
      entityName: draft.name || "template",
      editableFields: transactionEditable(draft).filter((item) => item.field !== "date"),
      warnings,
      plan: {
        collection: "templates",
        targetId: id,
        apply: (current, now) => saveTransactionTemplate(current, draft, id, scope.profileId, now),
        fingerprint: fingerprintOf([["templates", id]], referenceFingerprint([["accounts", draft.accountId]])),
      },
    };
  }
  if (request.operation !== "delete") fail("UNSUPPORTED_OPERATION", "Templates can be created or deleted here; edit them in the app.");
  const record = resolve(scope, "templates", request.entityId, "template")!;
  const id = identity(record);
  return {
    ok: true,
    entityName: String(record.name ?? "template"),
    editableFields: [],
    warnings: [],
    plan: {
      collection: "templates",
      targetId: id,
      apply: (current) => ({ ...current, templates: current.templates.filter((item) => identity(item) !== id) }),
      fingerprint: fingerprintOf([["templates", id]]),
    },
  };
};

// ---------------------------------------------------------------------------
// Simple collections without dedicated domain services

type SimpleSpec = {
  collection: ProfileRecordKey;
  kind: string;
  /** Builds validated values from the request. */
  values: (scope: Scope, fields: ChangeFields, existing: JsonObject | null) => JsonObject;
  /** Reference keys in transactions/templates/recurrings cleared on delete. */
  detach?: { key: string; alsoTags?: boolean; alias?: string };
  editable: (record: JsonObject) => EditableField[];
};

function requireName(fields: ChangeFields, existing: JsonObject | null, kind: string) {
  const name = fieldText(fields, "name", "title") ?? (existing ? String(existing.name ?? "") : "");
  if (!name.trim() || name.trim().length > 100) fail("MUTATION_VALIDATION_FAILED", `Enter a ${kind} name of up to 100 characters.`, { missingFields: ["name"] });
  return name.trim();
}

function positive(fields: ChangeFields, keys: string[], label: string, existing: JsonValue | undefined, required: boolean, allowZero = false) {
  const parsed = parseAmount(field(fields, ...keys));
  const value = parsed ?? (typeof existing === "number" ? existing : undefined);
  if (value === undefined) {
    if (required) fail("MUTATION_VALIDATION_FAILED", `Enter the ${label}.`, { missingFields: [keys[0]] });
    return undefined;
  }
  if (!Number.isFinite(value) || (allowZero ? value < 0 : value <= 0) || value > 1e12)
    fail("MUTATION_VALIDATION_FAILED", `Enter a valid ${label}.`);
  return value;
}

function optionalDate(scope: Scope, fields: ChangeFields, keys: string[], existing: JsonValue | undefined) {
  const text = fieldText(fields, ...keys);
  if (text === undefined) return existing ?? null;
  if (!text) return null;
  const date = parseWhen(text, scope.now);
  if (!date) fail("MUTATION_VALIDATION_FAILED", `"${text}" is not a valid date.`);
  return localDay(date);
}

const SIMPLE_SPECS: Partial<Record<MutableEntityType, SimpleSpec>> = {
  goal: {
    collection: "goals",
    kind: "goal",
    values: (scope, fields, existing) => ({
      name: requireName(fields, existing, "goal"),
      targetAmount: positive(fields, ["targetAmount", "target", "amount"], "target amount", existing?.targetAmount, !existing)!,
      currentAmount: positive(fields, ["currentAmount", "saved", "current"], "saved amount", existing?.currentAmount ?? 0, false, true) ?? 0,
      targetDate: optionalDate(scope, fields, ["targetDate", "date", "deadline"], existing?.targetDate),
      currencyCode: parseCurrency(field(fields, "currency")) ?? String(existing?.currencyCode ?? scope.context.currency),
    }),
    editable: (record) => [
      { field: "name", kind: "text", value: String(record.name ?? ""), required: true },
      { field: "targetAmount", kind: "amount", value: Number(record.targetAmount ?? 0), required: true },
      { field: "currentAmount", kind: "amount", value: Number(record.currentAmount ?? 0) },
      { field: "targetDate", kind: "date", value: (record.targetDate as string | null) ?? null },
    ],
  },
  loan: {
    collection: "loans",
    kind: "loan",
    detach: { key: "loan" },
    values: (scope, fields, existing) => {
      const rate = parseAmount(field(fields, "interestRate", "rate"));
      if (rate !== undefined && rate > 100) fail("MUTATION_VALIDATION_FAILED", "Interest must be between 0 and 100%.");
      const personRef = fieldText(fields, "person", "lender", "borrower");
      return {
        name: requireName(fields, existing, "loan"),
        amount: positive(fields, ["amount", "principal"], "loan amount", existing?.amount, !existing)!,
        interestRate: rate ?? (existing?.interestRate as number | null) ?? null,
        dueDate: optionalDate(scope, fields, ["dueDate", "date"], existing?.dueDate),
        person: personRef ? identity(resolve(scope, "peoples", personRef, "person")!) : (existing?.person ?? null),
        notes: fieldText(fields, "notes", "description") ?? String(existing?.notes ?? ""),
        currencyCode: parseCurrency(field(fields, "currency")) ?? String(existing?.currencyCode ?? scope.context.currency),
      };
    },
    editable: (record) => [
      { field: "name", kind: "text", value: String(record.name ?? ""), required: true },
      { field: "amount", kind: "amount", value: Number(record.amount ?? 0), required: true },
      { field: "dueDate", kind: "date", value: (record.dueDate as string | null) ?? null },
    ],
  },
  asset: {
    collection: "assets",
    kind: "asset",
    values: (scope, fields, existing) => {
      const value = positive(fields, ["value", "amount", "worth"], "value", existing?.value ?? existing?.amount, !existing, true)!;
      return {
        name: requireName(fields, existing, "asset"),
        value,
        amount: value,
        category: fieldText(fields, "category", "kind") ?? String(existing?.category ?? ""),
        acquisitionDate: optionalDate(scope, fields, ["acquisitionDate", "date"], existing?.acquisitionDate),
        notes: fieldText(fields, "notes", "description") ?? String(existing?.notes ?? ""),
        currencyCode: parseCurrency(field(fields, "currency")) ?? String(existing?.currencyCode ?? scope.context.currency),
      };
    },
    editable: (record) => [
      { field: "name", kind: "text", value: String(record.name ?? ""), required: true },
      { field: "value", kind: "amount", value: Number(record.value ?? record.amount ?? 0), required: true },
    ],
  },
  label: {
    collection: "labels",
    kind: "label",
    detach: { key: "label", alsoTags: true },
    values: (_scope, fields, existing) => {
      const color = fieldText(fields, "color");
      return {
        name: requireName(fields, existing, "label"),
        color: color && /^#[a-f\d]{6}$/i.test(color) ? color : String(existing?.color ?? "#70d2eb"),
      };
    },
    editable: (record) => [{ field: "name", kind: "text", value: String(record.name ?? ""), required: true }],
  },
  place: {
    collection: "places",
    kind: "place",
    detach: { key: "place" },
    values: (_scope, fields, existing) => ({
      name: requireName(fields, existing, "place"),
      description: fieldText(fields, "description") ?? String(existing?.description ?? ""),
      address: fieldText(fields, "address") ?? String(existing?.address ?? ""),
    }),
    editable: (record) => [{ field: "name", kind: "text", value: String(record.name ?? ""), required: true }],
  },
  person: {
    collection: "peoples",
    kind: "person",
    detach: { key: "person", alias: "payee" },
    values: (_scope, fields, existing) => ({
      name: requireName(fields, existing, "person"),
      description: fieldText(fields, "description") ?? String(existing?.description ?? ""),
      ...(fieldText(fields, "phone") !== undefined ? { phone: fieldText(fields, "phone")! } : {}),
      ...(fieldText(fields, "email") !== undefined ? { email: fieldText(fields, "email")! } : {}),
    }),
    editable: (record) => [{ field: "name", kind: "text", value: String(record.name ?? ""), required: true }],
  },
  bill_splitter: {
    collection: "billSplitters",
    kind: "shared bill",
    values: (scope, fields, existing) => ({
      name: requireName(fields, existing, "shared bill"),
      totalAmount: positive(fields, ["totalAmount", "amount", "total"], "total amount", existing?.totalAmount, !existing)!,
      date: optionalDate(scope, fields, ["date"], existing?.date) ?? localDay(scope.now),
    }),
    editable: (record) => [
      { field: "name", kind: "text", value: String(record.name ?? ""), required: true },
      { field: "totalAmount", kind: "amount", value: Number(record.totalAmount ?? 0), required: true },
    ],
  },
};

function simpleHandler(entityType: MutableEntityType): Handler {
  return (scope, request) => {
    const spec = SIMPLE_SPECS[entityType]!;
    const fields = request.userProvidedFields ?? {};
    if (request.operation === "archive") fail("UNSUPPORTED_OPERATION", `A ${spec.kind} cannot be archived.`);
    const existing = request.operation === "create" ? null : resolve(scope, spec.collection, request.entityId, spec.kind);
    if (request.operation !== "create" && !existing) fail("ENTITY_NOT_FOUND", `Which ${spec.kind}?`, { missingFields: ["entityId"] });
    const id = existing ? identity(existing) : scope.newId();
    const fingerprint = fingerprintOf([[spec.collection, id]]);
    if (request.operation === "delete") {
      const detach = spec.detach;
      return {
        ok: true,
        entityName: String(existing!.name ?? spec.kind),
        editableFields: [],
        warnings: [],
        plan: {
          collection: spec.collection,
          targetId: id,
          apply: (current, now) => {
            const target = current[spec.collection].find((item) => identity(item) === id);
            if (!target) throw new Error(`This ${spec.kind} no longer exists.`);
            const clean = (records: JsonObject[]) =>
              detach
                ? records.map((record) => {
                    const linked =
                      references(target, record[detach.key]) ||
                      (detach.alias ? references(target, record[detach.alias]) : false) ||
                      (detach.alsoTags && Array.isArray(record.tags) && record.tags.some((tag) => references(target, tag)));
                    if (!linked) return record;
                    return {
                      ...record,
                      [detach.key]: null,
                      ...(detach.alias ? { [detach.alias]: null } : {}),
                      ...(detach.alsoTags && Array.isArray(record.tags)
                        ? { tags: record.tags.filter((tag) => !references(target, tag)) }
                        : {}),
                      updatedAt: now,
                    };
                  })
                : records;
            return {
              ...current,
              [spec.collection]: current[spec.collection].filter((item) => identity(item) !== id),
              transactions: clean(current.transactions),
              templates: clean(current.templates),
              recurrings: clean(current.recurrings),
              ...(entityType === "bill_splitter"
                ? {
                    billParticipants: current.billParticipants.filter(
                      (participant) => !references(target, participant.splitterId ?? participant.billSplitter ?? participant.splitter),
                    ),
                  }
                : {}),
            };
          },
          fingerprint,
        },
      };
    }
    const values = spec.values(scope, fields, existing);
    const preview = { ...(existing ?? {}), ...values };
    return {
      ok: true,
      entityName: String(values.name ?? spec.kind),
      editableFields: spec.editable(preview),
      warnings: [],
      plan: {
        collection: spec.collection,
        targetId: id,
        apply: (current, now) => {
          const previous = current[spec.collection].find((item) => identity(item) === id);
          if (existing && !previous) throw new Error(`This ${spec.kind} no longer exists.`);
          if (!existing && previous) throw new Error(`This ${spec.kind} was already saved.`);
          const record: JsonObject = {
            ...(previous ?? {}),
            ...values,
            uuid: previous?.uuid ?? id,
            user: previous?.user ?? scope.profileId,
            createdAt: previous?.createdAt ?? now,
            updatedAt: now,
          };
          return {
            ...current,
            [spec.collection]: previous
              ? current[spec.collection].map((item) => (identity(item) === id ? record : item))
              : [...current[spec.collection], record],
          };
        },
        fingerprint,
      },
    };
  };
}

const HANDLERS: Record<MutableEntityType, Handler> = {
  transaction: transactionHandler,
  budget: budgetHandler,
  recurring: recurringHandler,
  category: categoryHandler,
  account: accountHandler,
  template: templateHandler,
  goal: simpleHandler("goal"),
  loan: simpleHandler("loan"),
  asset: simpleHandler("asset"),
  label: simpleHandler("label"),
  place: simpleHandler("place"),
  person: simpleHandler("person"),
  bill_splitter: simpleHandler("bill_splitter"),
};

/** Icon and color exactly as the app's own selectors resolve them. */
function visualFrom(item: { icon: string; iconPath: string | null; color: string } | undefined): RecordVisual | null {
  return item ? { icon: item.icon, iconPath: item.iconPath, color: item.color } : null;
}

function accountVisual(document: BackupDocument, id: JsonValue | undefined) {
  if (id == null || id === "") return null;
  return visualFrom(selectAccounts(document).find((account) => account.id === String(id)));
}

function categoryVisual(document: BackupDocument, id: JsonValue | undefined) {
  if (id == null || id === "") return null;
  const record = document.categories.find((item) => references(item, id));
  return record ? visualFrom(selectCategories(document).find((category) => category.id === identity(record))) : null;
}

function recordVisual(document: BackupDocument, entityType: MutableEntityType, record: JsonObject): RecordVisual | null {
  const id = identity(record);
  switch (entityType) {
    case "transaction":
    case "template":
      return categoryVisual(document, record.category) ?? accountVisual(document, record.account);
    case "account":
      return accountVisual(document, id);
    case "category":
      return categoryVisual(document, id);
    case "budget":
      return visualFrom(selectBudgets(document).find((budget) => budget.id === id));
    case "recurring":
      return visualFrom(selectRecurrings(document).find((item) => item.id === id));
    default:
      return null;
  }
}

/** Visuals for fields that point at other records. */
function linkedVisuals(document: BackupDocument, record: JsonObject) {
  const result: Record<string, RecordVisual> = {};
  const add = (field: string, visual: RecordVisual | null) => {
    if (visual) result[field] = visual;
  };
  add("account", accountVisual(document, record.account));
  add("toAccount", accountVisual(document, record.toAccount));
  add("linkedBank", accountVisual(document, record.linkedBankAccountId));
  add("category", categoryVisual(document, record.category));
  add("parent", categoryVisual(document, categoryParent(record)));
  if (Array.isArray(record.categories) && record.categories.length)
    add("categories", categoryVisual(document, record.categories[0]));
  return result;
}

/**
 * Builds a reviewable proposal. The domain function runs on a private clone
 * to validate and preview; the stored document is never touched here.
 */
export function prepareChange(
  document: BackupDocument,
  request: PrepareChangeArgs,
  options: { now: Date; newId: () => string; proposalId?: string },
): { result: PrepareChangeResult; plan?: ChangePlan } {
  const context = new ToolContext(document, options.now);
  const scope: Scope = {
    document,
    context,
    profileId: context.profileId,
    now: options.now,
    newId: options.newId,
  };
  try {
    if (!scope.profileId) fail("MUTATION_VALIDATION_FAILED", "Choose a profile first.");
    const handled = HANDLERS[request.entityType](scope, request);
    if (!handled.ok) return { result: handled };
    const { plan } = handled;
    let next: BackupDocument;
    try {
      next = plan.apply(cloneBackupDocument(document), options.now.toISOString());
    } catch (error) {
      return {
        result: {
          ok: false,
          code: "MUTATION_VALIDATION_FAILED",
          message: error instanceof Error ? error.message : "This change is not valid.",
        },
      };
    }
    const find = (doc: BackupDocument) => doc[plan.collection].find((item) => identity(item) === plan.targetId);
    const shown = find(next) ?? find(document);
    const visualDocument = find(next) ? next : document;
    const before = display(scope, request.entityType, find(document), document);
    const after = display(scope, request.entityType, find(next), next);
    const destructive = request.operation === "delete";
    const proposal: ChangeProposal = {
      proposalId: options.proposalId ?? options.newId(),
      operation: request.operation,
      entityType: request.entityType,
      entityId: plan.targetId,
      entityName: handled.entityName,
      profileId: scope.profileId,
      before,
      after,
      changedFields: changed(before, after),
      sideEffects: sideEffects(document, next, { collection: plan.collection, id: plan.targetId }),
      warnings: handled.warnings,
      destructive,
      strongConfirmation: handled.strongConfirmation === true,
      editableFields: request.operation === "delete" || request.operation === "archive" ? [] : handled.editableFields,
      visual: shown ? recordVisual(visualDocument, request.entityType, shown) : null,
      fieldVisuals: shown ? linkedVisuals(visualDocument, shown) : {},
      request,
      currentStateFingerprint: plan.fingerprint(document),
      createdAt: options.now.toISOString(),
      expiresAt: new Date(options.now.getTime() + PROPOSAL_TTL_MS).toISOString(),
    };
    if (request.operation === "update" && !proposal.changedFields.length)
      return {
        result: {
          ok: false,
          code: "MUTATION_VALIDATION_FAILED",
          message: `Nothing would change for "${handled.entityName}". What should be different?`,
        },
      };
    return { result: { ok: true, proposal }, plan };
  } catch (error) {
    if (error instanceof ChangeError) return { result: error.failure };
    return {
      result: {
        ok: false,
        code: "MUTATION_VALIDATION_FAILED",
        message: error instanceof Error ? error.message : "This change is not valid.",
      },
    };
  }
}

/** Final stored values of the changed record, for the completed result. */
export function describeRecord(
  document: BackupDocument,
  entityType: MutableEntityType,
  collection: ProfileRecordKey,
  id: string,
  now: Date,
) {
  const context = new ToolContext(document, now);
  const scope: Scope = { document, context, profileId: context.profileId, now, newId: () => "" };
  return display(scope, entityType, document[collection].find((item) => identity(item) === id), document);
}
