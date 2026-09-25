import type { BackupDocument } from "../model/backup-document";
import {
  categoryParent,
  createProfileMatcher,
  identity,
} from "../model/category-record";
import { financialMonth } from "../model/financial-month";
import type { JsonObject, JsonValue } from "../model/json";
import { transactionMoney } from "../model/transaction-conversion";
import {
  createRecordLookup,
  createTransactionIndex,
  transactionPeriodBounds,
  type TransactionIndexEntry,
} from "./transaction-selectors";

export type SearchType = "expense" | "income" | "transfer";
export type SearchPeriod = "all" | "cycle" | "lastCycle" | "days90" | "year";
export type SearchSort = "newest" | "oldest" | "largest" | "smallest";
export type SearchRelation =
  | "categories"
  | "accounts"
  | "labels"
  | "places"
  | "people"
  | "budgets"
  | "currencies";

export type SearchFilters = {
  query: string;
  types: SearchType[];
  period: SearchPeriod;
  categories: string[];
  accounts: string[];
  labels: string[];
  places: string[];
  people: string[];
  budgets: string[];
  currencies: string[];
  minAmount: number | null;
  maxAmount: number | null;
  withNotes: boolean;
  withReceipt: boolean;
  sort: SearchSort;
};

export const SEARCH_RELATIONS: SearchRelation[] = [
  "categories",
  "accounts",
  "labels",
  "places",
  "people",
  "budgets",
  "currencies",
];

export const DEFAULT_SEARCH_FILTERS: SearchFilters = {
  query: "",
  types: [],
  period: "all",
  categories: [],
  accounts: [],
  labels: [],
  places: [],
  people: [],
  budgets: [],
  currencies: [],
  minAmount: null,
  maxAmount: null,
  withNotes: false,
  withReceipt: false,
  sort: "newest",
};

/** Refinements beyond the typed query; sort order is a view choice, not a filter. */
export function countActiveFilters(filters: SearchFilters) {
  return (
    (filters.types.length ? 1 : 0) +
    (filters.period !== "all" ? 1 : 0) +
    SEARCH_RELATIONS.reduce(
      (count, key) => count + (filters[key].length ? 1 : 0),
      0,
    ) +
    (filters.minAmount !== null || filters.maxAmount !== null ? 1 : 0) +
    (filters.withNotes ? 1 : 0) +
    (filters.withReceipt ? 1 : 0)
  );
}

export type SearchFacetOption = {
  id: string;
  label: string;
  count: number;
  color: string | null;
  icon: string | null;
  iconPath: string | null;
  depth: number;
};
export type SearchFacets = Record<SearchRelation, SearchFacetOption[]>;

type IndexedFacts = {
  entry: TransactionIndexEntry;
  type: SearchType;
  category: string;
  /** The category and every ancestor, so a parent filter includes children. */
  categoryPath: string[];
  accounts: string[];
  labels: string[];
  place: string;
  person: string;
  budget: string;
  currencyCode: string;
  amount: number;
  /** Amount in the profile currency when the record's saved conversion allows. */
  reportingAmount: number;
  reportingCurrency: string;
  hasNotes: boolean;
  hasReceipt: boolean;
  haystack: string;
};

export type SearchContext = {
  index: TransactionIndexEntry[];
  facts: IndexedFacts[];
  facets: SearchFacets;
  profileCurrency: string;
  monthStartDay: number;
};

export type SearchTotals = {
  currencyCode: string;
  income: number;
  expense: number;
  net: number;
};
export type SearchOutcome = {
  entries: TransactionIndexEntry[];
  total: number;
  transfers: number;
  totals: SearchTotals[];
};

const string = (value: JsonValue | undefined, fallback = "") =>
  typeof value === "string" && value ? value : fallback;
const currency = (value: JsonValue | undefined) => {
  const code = string(value).toUpperCase();
  return /^[A-Z]{3}$/.test(code) ? code : "";
};

/** Case-, accent- and width-insensitive text used on both sides of a match. */
export function normalizeSearchText(value: string) {
  return value.normalize("NFKD").replace(/[̀-ͯ]/g, "").toLocaleLowerCase().trim();
}

function searchTokens(query: string) {
  return normalizeSearchText(query).split(/\s+/).filter(Boolean);
}

/**
 * Relation names and ancestry are resolved once per document. Each keystroke
 * then filters flat facts instead of re-walking every collection.
 */
export function createSearchContext(
  document: BackupDocument,
  profileCurrency: string,
): SearchContext {
  const target = currency(profileCurrency) || "USD";
  const belongs = createProfileMatcher(document);
  const index = createTransactionIndex(document);
  const categories = createRecordLookup(document.categories);
  const accounts = createRecordLookup(document.accounts);
  const labels = createRecordLookup(document.labels);
  const places = createRecordLookup(document.places);
  const peoples = createRecordLookup(document.peoples);
  const budgets = createRecordLookup(document.budgets);
  const loans = createRecordLookup(document.loans);

  const paths = new Map<string, string[]>();
  const categoryPath = (record: JsonObject) => {
    const key = identity(record);
    const cached = paths.get(key);
    if (cached) return cached;
    const path: string[] = [];
    const seen = new Set<string>();
    // Imported hierarchies may cycle; stop at the first repeated ancestor.
    for (
      let current: JsonObject | undefined = record;
      current && !seen.has(identity(current));
      current = categories.get(categoryParent(current))
    ) {
      seen.add(identity(current));
      path.push(identity(current));
    }
    paths.set(key, path);
    return path;
  };
  const nameOf = (record: JsonObject | undefined) => string(record?.name);

  const facts: IndexedFacts[] = [];
  const counts = Object.fromEntries(
    SEARCH_RELATIONS.map((key) => [key, new Map<string, number>()]),
  ) as Record<SearchRelation, Map<string, number>>;
  const bump = (key: SearchRelation, id: string) => {
    if (id) counts[key].set(id, (counts[key].get(id) ?? 0) + 1);
  };

  for (const entry of index) {
    const { record } = entry;
    const categoryRecord = categories.get(record.category);
    const source = accounts.get(
      record.account ?? record.fromAccount ?? record.sourceAccount,
    );
    const destination = accounts.get(
      record.toAccount ?? record.destinationAccount,
    );
    const labelRecords = [
      record.label,
      ...(Array.isArray(record.tags) ? record.tags : []),
    ]
      .map((value) => labels.get(value))
      .filter((value): value is JsonObject => value !== undefined);
    const place = places.get(record.place);
    const person = peoples.get(record.person ?? record.payee);
    const budget = budgets.get(record.budget);
    const loan = loans.get(record.loan);
    const path = categoryRecord ? categoryPath(categoryRecord) : [];
    const code =
      currency(record.currencyCode) ||
      currency(record.accountCurrencyCode) ||
      currency(source?.currencyCode) ||
      target;
    const amount = Math.abs(
      typeof record.amount === "number" && Number.isFinite(record.amount)
        ? record.amount
        : 0,
    );
    const money = transactionMoney({ ...record, currencyCode: code }, target);
    const type: SearchType =
      record.type === 1 ? "income" : record.type === 2 ? "transfer" : "expense";
    const accountIds = [source, destination]
      .filter((value): value is JsonObject => value !== undefined)
      .map(identity);
    const labelIds = [...new Set(labelRecords.map(identity))];
    const description = string(record.description);
    const text = [
      string(record.name),
      description,
      string(record.categoryName),
      ...path.map((id) => nameOf(categories.get(id))),
      string(record.accountName),
      nameOf(source),
      nameOf(destination),
      ...labelRecords.map(nameOf),
      nameOf(place),
      nameOf(person),
      nameOf(budget),
      nameOf(loan),
      code,
      String(amount),
      amount.toFixed(2),
    ];

    facts.push({
      entry,
      type,
      category: categoryRecord
        ? identity(categoryRecord)
        : record.category == null
          ? ""
          : String(record.category),
      categoryPath: path,
      accounts: accountIds,
      labels: labelIds,
      place: place ? identity(place) : "",
      person: person ? identity(person) : "",
      budget: budget ? identity(budget) : "",
      currencyCode: code,
      amount,
      reportingAmount: money?.amount ?? amount,
      reportingCurrency: money?.currencyCode ?? code,
      hasNotes: description.trim().length > 0,
      hasReceipt: [record.receipt, record.image].some(
        (value) => typeof value === "string" && value.length > 0,
      ),
      haystack: normalizeSearchText(text.filter(Boolean).join("\n")),
    });

    for (const id of path) bump("categories", id);
    for (const id of accountIds) bump("accounts", id);
    for (const id of labelIds) bump("labels", id);
    bump("places", place ? identity(place) : "");
    bump("people", person ? identity(person) : "");
    bump("budgets", budget ? identity(budget) : "");
    bump("currencies", code);
  }

  const option = (
    record: JsonObject,
    count: number,
    depth = 0,
  ): SearchFacetOption => ({
    id: identity(record),
    label: string(record.name, identity(record)),
    count,
    color: /^#[a-f\d]{6}$/i.test(string(record.color))
      ? string(record.color)
      : null,
    icon: string(record.icon) || null,
    iconPath:
      /^[Mm]/.test(string(record.iconPath)) &&
      string(record.iconPath).length <= 20_000
        ? string(record.iconPath)
        : null,
    depth,
  });
  const byLabel = (a: SearchFacetOption, b: SearchFacetOption) =>
    b.count - a.count || a.label.localeCompare(b.label);
  const facetFor = (key: SearchRelation, records: JsonObject[]) => {
    const seen = new Set<string>();
    const options: SearchFacetOption[] = [];
    for (const record of records) {
      const id = identity(record);
      const count = counts[key].get(id);
      if (!count || seen.has(id) || !belongs(record)) continue;
      seen.add(id);
      options.push(option(record, count));
    }
    return options.sort(byLabel);
  };

  // Categories list as a tree: each parent followed by its used children.
  const usedCategories = document.categories.filter((record) =>
    counts.categories.has(identity(record)),
  );
  const childrenOf = new Map<string, JsonObject[]>();
  const roots: JsonObject[] = [];
  for (const record of usedCategories) {
    const parent = categories.get(categoryParent(record));
    const parentId = parent ? identity(parent) : "";
    if (
      !parent ||
      !counts.categories.has(parentId) ||
      parentId === identity(record)
    ) {
      roots.push(record);
      continue;
    }
    childrenOf.set(parentId, [...(childrenOf.get(parentId) ?? []), record]);
  }
  const categoryOptions: SearchFacetOption[] = [];
  const visited = new Set<string>();
  const ranked = (records: JsonObject[]) =>
    records
      .map((record) =>
        option(record, counts.categories.get(identity(record)) ?? 0),
      )
      .sort(byLabel)
      .map((ranked) =>
        records.find((record) => identity(record) === ranked.id)!,
      );
  const visit = (record: JsonObject, depth: number) => {
    const id = identity(record);
    if (visited.has(id)) return;
    visited.add(id);
    categoryOptions.push(option(record, counts.categories.get(id) ?? 0, depth));
    for (const child of ranked(childrenOf.get(id) ?? []))
      visit(child, depth + 1);
  };
  for (const root of ranked(roots)) visit(root, 0);
  // Cyclic imports never reach a root; list them flat rather than hiding them.
  for (const record of usedCategories) visit(record, 0);

  return {
    index,
    facts,
    profileCurrency: target,
    monthStartDay: document._local.monthStartDay,
    facets: {
      categories: categoryOptions,
      accounts: facetFor("accounts", document.accounts),
      labels: facetFor("labels", document.labels),
      places: facetFor("places", document.places),
      people: facetFor("people", document.peoples),
      budgets: facetFor("budgets", document.budgets),
      currencies: [...counts.currencies]
        .map(([code, count]) => ({
          id: code,
          label: code,
          count,
          color: null,
          icon: null,
          iconPath: null,
          depth: 0,
        }))
        .sort(byLabel),
    },
  };
}

export function searchPeriodRange(
  period: SearchPeriod,
  now: Date,
  monthStartDay: number,
) {
  switch (period) {
    case "cycle":
      return financialMonth(now, monthStartDay, 0);
    case "lastCycle":
      return financialMonth(now, monthStartDay, -1);
    case "days90": {
      const start = new Date(
        now.getFullYear(),
        now.getMonth(),
        now.getDate() - 89,
      );
      const end = new Date(
        now.getFullYear(),
        now.getMonth(),
        now.getDate() + 1,
      );
      return { start, end };
    }
    case "year":
      return {
        start: new Date(now.getFullYear(), 0, 1),
        end: new Date(now.getFullYear() + 1, 0, 1),
      };
    default:
      return null;
  }
}

/** Every token must appear somewhere, so "coffee visa" narrows rather than widens. */
export function searchTransactions(
  context: SearchContext,
  filters: SearchFilters,
  now = new Date(),
): SearchOutcome {
  const tokens = searchTokens(filters.query);
  const range = searchPeriodRange(filters.period, now, context.monthStartDay);
  // Facts share the index order (newest first), so a period is one slice.
  const bounds = range
    ? transactionPeriodBounds(context.index, range.start, range.end)
    : { first: 0, last: context.facts.length };
  const sets = Object.fromEntries(
    SEARCH_RELATIONS.map((key) => [key, new Set(filters[key])]),
  ) as Record<SearchRelation, Set<string>>;
  const types = new Set(filters.types);
  const min = filters.minAmount;
  const max = filters.maxAmount;

  const matches: IndexedFacts[] = [];
  for (let position = bounds.first; position < bounds.last; position++) {
    const fact = context.facts[position];
    if (types.size && !types.has(fact.type)) continue;
    if (
      sets.categories.size &&
      !fact.categoryPath.some((id) => sets.categories.has(id)) &&
      !sets.categories.has(fact.category)
    )
      continue;
    if (
      sets.accounts.size &&
      !fact.accounts.some((id) => sets.accounts.has(id))
    )
      continue;
    if (sets.labels.size && !fact.labels.some((id) => sets.labels.has(id)))
      continue;
    if (sets.places.size && !sets.places.has(fact.place)) continue;
    if (sets.people.size && !sets.people.has(fact.person)) continue;
    if (sets.budgets.size && !sets.budgets.has(fact.budget)) continue;
    if (sets.currencies.size && !sets.currencies.has(fact.currencyCode))
      continue;
    if (min !== null && fact.amount < min) continue;
    if (max !== null && fact.amount > max) continue;
    if (filters.withNotes && !fact.hasNotes) continue;
    if (filters.withReceipt && !fact.hasReceipt) continue;
    if (
      tokens.length &&
      !tokens.every((token) => fact.haystack.includes(token))
    )
      continue;
    matches.push(fact);
  }

  if (filters.sort === "oldest") matches.reverse();
  else if (filters.sort === "largest" || filters.sort === "smallest") {
    const direction = filters.sort === "largest" ? -1 : 1;
    // Array.prototype.sort is stable, so equal amounts keep newest-first order.
    matches.sort((a, b) => direction * (a.reportingAmount - b.reportingAmount));
  }

  const totals = new Map<string, SearchTotals>();
  let transfers = 0;
  for (const fact of matches) {
    if (fact.type === "transfer") {
      transfers++;
      continue;
    }
    const bucket = totals.get(fact.reportingCurrency) ?? {
      currencyCode: fact.reportingCurrency,
      income: 0,
      expense: 0,
      net: 0,
    };
    if (fact.type === "income") bucket.income += fact.reportingAmount;
    else bucket.expense += fact.reportingAmount;
    bucket.net = bucket.income - bucket.expense;
    totals.set(fact.reportingCurrency, bucket);
  }

  return {
    entries: matches.map((fact) => fact.entry),
    total: matches.length,
    transfers,
    // Unconverted currencies stay separate; the profile currency leads.
    totals: [...totals.values()].sort((a, b) =>
      a.currencyCode === context.profileCurrency
        ? -1
        : b.currencyCode === context.profileCurrency
          ? 1
          : a.currencyCode.localeCompare(b.currencyCode),
    ),
  };
}
