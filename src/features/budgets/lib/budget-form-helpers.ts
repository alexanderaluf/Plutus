import type { BackupDocument } from "@/data/model/backup-document";
import type { BudgetDraft } from "@/data/model/budget-record";
import {
  categoryDescendants,
  type Category,
} from "@/data/selectors/category-selectors";
import { rankRootCategories } from "@/features/transactions/transaction-form-helpers";

/**
 * Categories of one type in tree order — each main category followed by its
 * subcategories — with the most used main categories first.
 */
export function budgetCategoryOptions(
  document: BackupDocument,
  categories: readonly Category[],
  type: 0 | 1 | 2,
): (Category & { depth: number })[] {
  const ofType = categories.filter((category) => category.type === type);
  const seen = new Set<string>();
  const result: (Category & { depth: number })[] = [];
  for (const root of rankRootCategories(document, ofType, type)) {
    for (const category of [
      { ...root, depth: 0 },
      // Descendant depth already counts from 1 for direct subcategories.
      ...categoryDescendants(ofType, root.id),
    ]) {
      if (seen.has(category.id)) continue;
      seen.add(category.id);
      result.push(category);
    }
  }
  // Categories whose parent is missing or cycles still appear, once each.
  for (const category of ofType)
    if (!seen.has(category.id)) {
      seen.add(category.id);
      result.push({ ...category, depth: 0 });
    }
  return result;
}

/**
 * The name a budget gets when left empty: what it tracks. Shown as the name
 * placeholder so it is never a surprise; limited to a saved name's length.
 */
export function fallbackBudgetName({
  budgetType,
  categoryNames,
  overallName,
}: {
  budgetType: BudgetDraft["budgetType"];
  categoryNames: string[];
  overallName: string;
}): string {
  const name =
    budgetType === "Overall"
      ? overallName
      : categoryNames
          .map((value) => value.trim())
          .filter(Boolean)
          .join(", ");
  return name.slice(0, 100).trim();
}

/**
 * With exactly one category tracked, the budget can wear that category's
 * icon and colour, so it is recognisable next to its category everywhere.
 */
export function categoryAppearance(
  budgetType: BudgetDraft["budgetType"],
  selected: readonly Category[],
): Pick<BudgetDraft, "icon" | "iconPath" | "color"> | null {
  if (budgetType !== "Category" || selected.length !== 1) return null;
  const [category] = selected;
  return {
    icon: category.icon,
    iconPath: category.iconPath,
    color: /^#[a-f\d]{6}$/i.test(category.color) ? category.color : "#5c6bc0",
  };
}
