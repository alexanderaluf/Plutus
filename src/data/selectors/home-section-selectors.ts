import type { BackupDocument } from "../model/backup-document";
import type { Budget } from "./budget-selectors";
import {
  budgetPeriodRange,
  iterateBudgets,
  selectBudgetCurrency,
} from "./budget-selectors";
import { budgetDraft } from "../model/budget-record";
import { belongsToProfile } from "../model/category-record";
import type { JsonObject } from "../model/json";
import { iterateCategoryMonthlyTotals } from "./category-selectors";
import { sortProjection } from "./cooperative";
import type { Category, CategoryTotal } from "./category-selectors";
import {
  selectCategories,
  selectCategoryMonthlyTotals,
  selectHomeRecurringPayments,
  selectTrackedBudgets,
  compareTrackedBudgets,
} from "./document-selectors";
import type { RecurringEvent } from "./recurring-selectors";
import { iterateHomeRecurringPayments } from "./recurring-selectors";
import {
  transactionPeriodBounds,
  type TransactionIndexEntry,
} from "./transaction-selectors";

export type HomeSection =
  "transactions" | "categories" | "budgets" | "recurring";
export type HomeCategoryRow = {
  kind: "category";
  id: string;
  category: Category;
  depth: number;
  last: boolean;
};
export type HomeRow =
  | { kind: "transaction"; id: string; entry: TransactionIndexEntry }
  | HomeCategoryRow
  | { kind: "budget"; id: string; budget: Budget }
  | { kind: "recurring"; id: string; event: RecurringEvent };

/** Flatten the hierarchy so even a large family is windowed one row at a time. */
export function createHomeCategoryRows(
  categories: Category[],
): HomeCategoryRow[] {
  const ids = new Set(categories.map((category) => category.id));
  const children = new Map<string, Category[]>();
  const roots: Category[] = [];
  for (const category of categories) {
    if (!category.parentId || !ids.has(category.parentId)) roots.push(category);
    else {
      const siblings = children.get(category.parentId) ?? [];
      siblings.push(category);
      children.set(category.parentId, siblings);
    }
  }
  const rows: HomeCategoryRow[] = [];
  const visited = new Set<string>();
  // The second pass also retains imported orphan/cyclic categories exactly once.
  for (const root of [...roots, ...categories]) {
    if (visited.has(root.id)) continue;
    const stack = [{ category: root, depth: 0 }];
    while (stack.length) {
      const { category, depth } = stack.pop()!;
      if (visited.has(category.id)) continue;
      visited.add(category.id);
      rows.push({
        kind: "category",
        id: category.id,
        category,
        depth,
        last: false,
      });
      const descendants = children.get(category.id) ?? [];
      for (let i = descendants.length - 1; i >= 0; i--)
        stack.push({ category: descendants[i], depth: depth + 1 });
    }
    rows[rows.length - 1].last = true;
  }
  return rows;
}

export type HomeSectionData =
  | {
      section: "categories";
      rows: HomeCategoryRow[];
      totals: Map<string, CategoryTotal>;
    }
  | { section: "budgets"; rows: Extract<HomeRow, { kind: "budget" }>[] }
  | ({
      section: "recurring";
      rows: Extract<HomeRow, { kind: "recurring" }>[];
    } & ReturnType<typeof selectHomeRecurringPayments>);

export function* iterateHomeSection(
  document: BackupDocument,
  now: Date,
  section: Exclude<HomeSection, "transactions">,
  transactionIndex?: TransactionIndexEntry[],
): Generator<void, HomeSectionData, unknown> {
  if (section === "categories") {
    const categories = selectCategories(document);
    const transactions = [];
    if (transactionIndex) {
      const bounds = transactionPeriodBounds(
        transactionIndex,
        new Date(now.getFullYear(), now.getMonth(), 1),
        new Date(now.getFullYear(), now.getMonth() + 1, 1),
      );
      for (let index = bounds.first; index < bounds.last; index++) {
        if (index % 64 === 0) yield;
        transactions.push(transactionIndex[index].record);
      }
    }
    return {
      section,
      rows: createHomeCategoryRows(categories),
      totals: yield* iterateCategoryMonthlyTotals(
        document,
        now,
        categories,
        transactionIndex ? transactions : document.transactions,
      ),
    };
  }
  if (section === "budgets") {
    // Binary date bounds discard irrelevant old history before projecting
    // money/relationships. Rolling budgets retain their creation-cycle data.
    let earliest = Infinity;
    const currency = selectBudgetCurrency(document);
    for (const record of document.budgets) {
      yield;
      if (
        record.showOnHome !== true ||
        record.isArchived === true ||
        !belongsToProfile(document, record)
      )
        continue;
      const draft = budgetDraft(record, currency);
      const range = budgetPeriodRange(draft, now);
      earliest = Math.min(earliest, range.start.getTime());
      const created = new Date(String(record.createdAt ?? ""));
      if (
        draft.rolling &&
        draft.period !== "Custom" &&
        Number.isFinite(created.getTime()) &&
        created < range.start
      )
        earliest = Math.min(
          earliest,
          budgetPeriodRange(draft, created).start.getTime(),
        );
    }
    const transactions: JsonObject[] = [];
    if (transactionIndex && Number.isFinite(earliest)) {
      const bounds = transactionPeriodBounds(
        transactionIndex,
        new Date(earliest),
        new Date(now.getTime() + 1),
      );
      for (let position = bounds.first; position < bounds.last; position++) {
        if (position % 64 === 0) yield;
        transactions.push(transactionIndex[position].record);
      }
    }
    const budgets = yield* sortProjection(
      yield* iterateBudgets(document, now, {
        homeOnly: true,
        ...(transactionIndex ? { transactions } : {}),
      }),
      compareTrackedBudgets,
    );
    return {
      section,
      rows: budgets.map((budget) => ({
        kind: "budget",
        id: budget.id,
        budget,
      })),
    };
  }
  yield;
  const payments = yield* iterateHomeRecurringPayments(document, now);
  return {
    section,
    ...payments,
    rows: payments.pending.map((event) => ({
      kind: "recurring",
      id: `${event.recurring.id}:${event.date.toISOString()}`,
      event,
    })),
  };
}

/** Derived cache belongs to one immutable document/date, never the record store. */
export function createHomeSectionLoader(
  document: BackupDocument,
  now: Date,
  transactionIndex?: TransactionIndexEntry[],
) {
  const cache = new Map<HomeSection, HomeSectionData>();
  return (section: Exclude<HomeSection, "transactions">): HomeSectionData => {
    const cached = cache.get(section);
    if (cached) return cached;
    let result: HomeSectionData;
    if (section === "categories") {
      const categories = selectCategories(document);
      const bounds =
        transactionIndex &&
        transactionPeriodBounds(
          transactionIndex,
          new Date(now.getFullYear(), now.getMonth(), 1),
          new Date(now.getFullYear(), now.getMonth() + 1, 1),
        );
      const transactions =
        transactionIndex && bounds
          ? transactionIndex
              .slice(bounds.first, bounds.last)
              .map((entry) => entry.record)
          : document.transactions;
      result = {
        section,
        rows: createHomeCategoryRows(categories),
        totals: selectCategoryMonthlyTotals(
          document,
          now,
          categories,
          transactions,
        ),
      };
    } else if (section === "budgets") {
      result = {
        section,
        rows: selectTrackedBudgets(document, now).map((budget) => ({
          kind: "budget",
          id: budget.id,
          budget,
        })),
      };
    } else {
      const payments = selectHomeRecurringPayments(document, now);
      result = {
        section,
        ...payments,
        rows: payments.pending.map((event) => ({
          kind: "recurring",
          id: `${event.recurring.id}:${event.date.toISOString()}`,
          event,
        })),
      };
    }
    cache.set(section, result);
    return result;
  };
}
