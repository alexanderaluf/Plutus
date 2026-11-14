import type { BackupDocument } from "../model/backup-document";
import {
  belongsToProfile,
  categoryFamily,
  categoryParent,
  categoryProfileId,
  identity,
  references,
  createProfileMatcher,
  type CategoryDraft,
  type CategoryType,
} from "../model/category-record";
import type { JsonObject, JsonValue } from "../model/json";
import { parseRecordTimestampMs } from "../database/month-index";
import { memoizeForDocument } from "./document-memo";
import {
  createRecordLookup,
  selectPeriodTransactionCandidates,
} from "./transaction-selectors";
import { finishProjection } from "./cooperative";
import { transactionMoney } from "../model/transaction-conversion";

export type Category = CategoryDraft & { id: string };
export type CategoryTotal = { count: number; amounts: Record<string, number> };
const string = (value: JsonValue | undefined, fallback = "") =>
  typeof value === "string" ? value : fallback;

export function selectCategories(document: BackupDocument): Category[] {
  return memoizeForDocument(document, "categories", () => {
    const records = document.categories.filter(
      (record) => belongsToProfile(document, record) && identity(record),
    );
    const byId = createRecordLookup(records);
    return records.map((record) => {
      const parent = byId.get(categoryParent(record));
      return {
        id: identity(record),
        name: string(record.name, "Untitled category"),
        description: string(record.description),
        type: (record.type === 1 ? 1 : record.type === 2 ? 2 : 0) as CategoryType,
        parentId:
          parent && identity(parent) !== identity(record)
            ? identity(parent)
            : null,
        icon: string(record.icon, "shopping"),
        iconPath:
          /^[Mm]/.test(string(record.iconPath)) &&
          string(record.iconPath).length <= 20_000
            ? string(record.iconPath)
            : null,
        color: /^#[a-f\d]{6}$/i.test(string(record.color))
          ? string(record.color)
          : "#70d2eb",
        isDefault: record.isDefault === true,
      };
    });
  });
}

export function selectTopLevelCategories(document: BackupDocument): Category[] {
  return memoizeForDocument(document, "top-level-categories", () =>
    selectCategories(document).filter((category) => category.parentId === null),
  );
}

export function selectCategoryRootId(
  document: BackupDocument,
  categoryId: string,
): string {
  return categoryRootIdIn(selectCategories(document), categoryId);
}

const rootAncestorsCache = new WeakMap<readonly Category[], Map<string, string>>();
const parentIdsCache = new WeakMap<readonly Category[], Set<string>>();

/** Root ancestor of a category inside an already-selected list. */
export function categoryRootIdIn(
  categories: readonly Category[],
  categoryId: string,
): string {
  let rootMap = rootAncestorsCache.get(categories);
  if (!rootMap) {
    rootMap = new Map<string, string>();
    const byId = new Map<string, Category>();
    for (const category of categories) byId.set(category.id, category);
    for (const category of categories) {
      let current: Category | undefined = category;
      const visited = new Set<string>();
      while (current.parentId && !visited.has(current.id)) {
        visited.add(current.id);
        const parent = byId.get(current.parentId);
        if (!parent) break;
        current = parent;
      }
      rootMap.set(category.id, current.id);
    }
    rootAncestorsCache.set(categories, rootMap);
  }
  return rootMap.get(categoryId) ?? "";
}

export function categoryHasChildren(
  categories: readonly Category[],
  categoryId: string,
): boolean {
  let parentIds = parentIdsCache.get(categories);
  if (!parentIds) {
    parentIds = new Set<string>();
    for (const category of categories) {
      if (category.parentId) parentIds.add(category.parentId);
    }
    parentIdsCache.set(categories, parentIds);
  }
  return parentIds.has(categoryId);
}

/**
 * Every descendant of `parentId` in tree order (each child is followed by its
 * own children). Parents are included so any level can be selected.
 */
export function categoryDescendants(
  categories: readonly Category[],
  parentId: string,
): (Category & { depth: number })[] {
  const children = new Map<string, Category[]>();
  for (const category of categories)
    if (category.parentId)
      children.set(category.parentId, [
        ...(children.get(category.parentId) ?? []),
        category,
      ]);
  const result: (Category & { depth: number })[] = [];
  const visited = new Set<string>([parentId]);
  const walk = (id: string, depth: number) => {
    for (const child of children.get(id) ?? []) {
      if (visited.has(child.id)) continue;
      visited.add(child.id);
      result.push({ ...child, depth });
      walk(child.id, depth + 1);
    }
  };
  walk(parentId, 1);
  return result;
}

function transactionContext(document: BackupDocument) {
  const accounts = new Map<string, JsonObject>();
  const categories = new Map<string, JsonObject>();
  for (const [records, map] of [
    [document.accounts, accounts],
    [document.categories, categories],
  ] as const) {
    for (const record of records)
      for (const key of [record.uuid, record.id])
        if (key != null) map.set(String(key), record);
  }
  const owner = document.users.find((record) =>
    references(record, categoryProfileId(document)),
  );
  const fallback = string(owner?.currency, "USD").toUpperCase();
  return {
    accounts,
    categories,
    fallback: /^[A-Z]{3}$/.test(fallback) ? fallback : "USD",
    belongs: createProfileMatcher(document),
  };
}

function transactionValues(
  document: BackupDocument,
  record: JsonObject,
  context: ReturnType<typeof transactionContext>,
) {
  const account = context.accounts.get(String(record.account));
  if (
    !context.belongs(record) ||
    (record.user == null && account && !context.belongs(account))
  )
    return null;
  const accountAmount = record.accountAmount ?? record.amount;
  if (typeof accountAmount !== "number" || !Number.isFinite(accountAmount))
    return null;
  const category = context.categories.get(String(record.category));
  if (!category || !context.belongs(category)) return null;
  const code = string(
    record.accountCurrencyCode,
    string(
      record.currencyCode,
      string(account?.currencyCode, context.fallback),
    ),
  ).toUpperCase();
  const date = parseRecordTimestampMs(record);
  const captured = transactionMoney(record, context.fallback);
  return {
    categoryId: identity(category),
    currencyCode:
      captured?.currencyCode ??
      (/^[A-Z]{3}$/.test(code) ? code : context.fallback),
    amount: captured?.amount ?? Math.abs(accountAmount),
    timestamp: Number.isFinite(date) ? date : null,
    type:
      record.type === 1
        ? (1 as const)
        : record.type === 2
          ? (2 as const)
          : (0 as const),
  };
}

// Only aggregate values are projected for the overview; no transaction view models or sorting.
export function selectCategoryMonthlyTotals(
  document: BackupDocument,
  anchor = new Date(),
  categories = selectCategories(document),
  transactions?: readonly JsonObject[],
): Map<string, CategoryTotal> {
  const start = new Date(anchor.getFullYear(), anchor.getMonth(), 1);
  const end = new Date(anchor.getFullYear(), anchor.getMonth() + 1, 1);
  const sourceTransactions =
    transactions ?? selectPeriodTransactionCandidates(document, start, end);
  if (!transactions && categories === selectCategories(document)) {
    return memoizeForDocument(
      document,
      `category-monthly-totals:${anchor.getFullYear()}-${anchor.getMonth()}`,
      () =>
        finishProjection(
          iterateCategoryMonthlyTotals(
            document,
            anchor,
            categories,
            sourceTransactions,
          ),
        ),
    );
  }
  return finishProjection(
    iterateCategoryMonthlyTotals(
      document,
      anchor,
      categories,
      sourceTransactions,
    ),
  );
}

export function* iterateCategoryMonthlyTotals(
  document: BackupDocument,
  anchor: Date,
  categories: Category[],
  transactions: readonly JsonObject[],
) {
  const byId = new Map(categories.map((category) => [category.id, category]));
  const totals = new Map(
    categories.map((category) => [
      category.id,
      { count: 0, amounts: {} } as CategoryTotal,
    ]),
  );
  const context = transactionContext(document);
  const start = new Date(anchor.getFullYear(), anchor.getMonth(), 1).getTime();
  const end = new Date(
    anchor.getFullYear(),
    anchor.getMonth() + 1,
    1,
  ).getTime();
  let position = 0;
  for (const record of transactions) {
    if (position++ % 64 === 0) yield;
    const values = transactionValues(document, record, context);
    if (
      !values ||
      values.timestamp == null ||
      values.timestamp < start ||
      values.timestamp >= end
    )
      continue;
    let category = byId.get(values.categoryId);
    const visited = new Set<string>();
    while (category && !visited.has(category.id)) {
      if (visited.size > 0 && visited.size % 64 === 0) yield;
      visited.add(category.id);
      if (category.type === values.type) {
        const total = totals.get(category.id)!;
        total.count++;
        total.amounts[values.currencyCode] =
          (total.amounts[values.currencyCode] ?? 0) + values.amount;
      }
      category = category.parentId ? byId.get(category.parentId) : undefined;
    }
  }
  return totals;
}

// Called only by the category detail route, after navigation.
export function selectCategoryTransactions(
  document: BackupDocument,
  categoryId: string,
) {
  return memoizeForDocument(document, `category-tx:${categoryId}`, () => {
    const category = selectCategories(document).find(
      (item) => item.id === categoryId,
    );
    if (!category) return [];
    const family = categoryFamily(document.categories, categoryId);
    const context = transactionContext(document);
    const results = [];
    for (let index = 0; index < document.transactions.length; index++) {
      const record = document.transactions[index];
      const values = transactionValues(document, record, context);
      if (
        !values ||
        !family.has(values.categoryId) ||
        values.type !== category.type
      )
        continue;
      results.push({
        ...values,
        id: identity(record) || `display-${index}`,
        name: string(record.name, "Untitled transaction"),
        categoryName: string(
          context.categories.get(String(record.category))?.name,
          "Uncategorized",
        ),
        accountName: string(
          context.accounts.get(String(record.account))?.name,
          "No account",
        ),
      });
    }
    return results.sort(
      (a, b) => (b.timestamp ?? -Infinity) - (a.timestamp ?? -Infinity),
    );
  });
}
