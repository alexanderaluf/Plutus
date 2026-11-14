/**
 * Pure helpers for the categories overview: tree shape, ordering and the
 * month summary. Free of React so the rules can be unit tested.
 */

type Node = { id: string; name: string; parentId: string | null };
type Total = { count: number; amounts: Record<string, number> };

export type CategorySort = "original" | "name" | "amount";

/**
 * Splits one type's categories into top-level rows and their children.
 * Categories caught in an imported parent cycle stay reachable as top-level
 * rows so they can be opened and repaired.
 */
export function buildCategoryTree<T extends Node>(categories: T[]) {
  const byId = new Map(categories.map((category) => [category.id, category]));
  const roots = categories.filter((category) => {
    const visited = new Set([category.id]);
    let parent = category.parentId ? byId.get(category.parentId) : undefined;
    if (!parent) return true;
    while (parent) {
      if (visited.has(parent.id)) return true;
      visited.add(parent.id);
      parent = parent.parentId ? byId.get(parent.parentId) : undefined;
    }
    return false;
  });
  const rootIds = new Set(roots.map((root) => root.id));
  const children = new Map<string, T[]>();
  for (const category of categories) {
    if (rootIds.has(category.id) || !category.parentId) continue;
    children.set(category.parentId, [
      ...(children.get(category.parentId) ?? []),
      category,
    ]);
  }
  return { roots, children };
}

/** A single comparable size for a total, across its currencies. */
function magnitude(total: Total | undefined) {
  return Object.values(total?.amounts ?? {}).reduce(
    (sum, amount) => sum + Math.abs(amount),
    0,
  );
}

export function sortCategories<T extends Node>(
  categories: T[],
  sort: CategorySort,
  totals: Map<string, Total>,
) {
  if (sort === "original") return categories;
  return [...categories].sort((a, b) =>
    sort === "name"
      ? a.name.localeCompare(b.name)
      : magnitude(totals.get(b.id)) - magnitude(totals.get(a.id)) ||
        a.name.localeCompare(b.name),
  );
}

/**
 * The month's total for one type. Top-level totals already include their
 * children, so only top-level rows are added up to avoid counting twice.
 */
export function summarizeMonth(
  roots: Node[],
  totals: Map<string, Total>,
) {
  const amounts: Record<string, number> = {};
  let count = 0;
  for (const root of roots) {
    const total = totals.get(root.id);
    if (!total) continue;
    count += total.count;
    for (const [currency, amount] of Object.entries(total.amounts))
      amounts[currency] = (amounts[currency] ?? 0) + amount;
  }
  const currencies = Object.keys(amounts).sort();
  return {
    count,
    amounts: currencies.map((currencyCode) => ({
      currencyCode,
      amount: amounts[currencyCode],
    })),
    /**
     * A category's share of the month, 0–1. Shares only make sense when every
     * amount is in one currency; with several, this returns null.
     */
    share(total: Total | undefined) {
      if (currencies.length !== 1 || !total) return null;
      const all = Math.abs(amounts[currencies[0]]);
      const own = Math.abs(total.amounts[currencies[0]] ?? 0);
      return all > 0 ? Math.min(1, own / all) : null;
    },
  };
}
