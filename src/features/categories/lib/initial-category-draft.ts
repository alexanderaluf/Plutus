import type {
  CategoryDraft,
  CategoryType,
} from "@/data/model/category-record";
import type { Category } from "@/data/selectors/category-selectors";
import { ICON_COLORS } from "@/shared/icons/colors";

/** A new category starts with an icon that already says what kind it is. */
export const defaultCategoryIcons: Record<CategoryType, string> = {
  0: "shopping",
  1: "cash",
  2: "currency-exchange",
};

/**
 * A colour no category of this type uses yet, so a new category stands out
 * in lists and charts; a subcategory takes its parent's colour instead.
 */
export function suggestCategoryColor(
  categories: readonly Category[],
  type: CategoryType,
  parentId: string | null,
): string {
  const parent = parentId
    ? categories.find((category) => category.id === parentId)
    : undefined;
  if (parent && /^#[a-f\d]{6}$/i.test(parent.color)) return parent.color;
  const used = new Set(
    categories
      .filter((category) => category.type === type)
      .map((category) => category.color.toLowerCase()),
  );
  return ICON_COLORS.find((swatch) => !used.has(swatch)) ?? ICON_COLORS[1];
}

export function createInitialCategoryDraft(
  categories: readonly Category[],
  type: CategoryType,
  parentId: string | null,
): CategoryDraft {
  // A preset parent must exist, share the type and be a main category.
  const parent = parentId
    ? categories.find(
        (category) =>
          category.id === parentId &&
          category.type === type &&
          isMainCategory(categories, category),
      )
    : undefined;
  return {
    name: "",
    description: "",
    type,
    parentId: parent?.id ?? null,
    icon: defaultCategoryIcons[type],
    iconPath: null,
    color: suggestCategoryColor(categories, type, parent?.id ?? null),
    isDefault: false,
  };
}

/** A main category: no parent, or a parent that no longer exists. */
export function isMainCategory(
  categories: readonly Category[],
  category: Category,
): boolean {
  return (
    !category.parentId ||
    !categories.some((candidate) => candidate.id === category.parentId)
  );
}

/**
 * Possible parents of one type. Categories are two levels deep: only main
 * categories can be parents, and a category that has subcategories cannot
 * become one itself. `excluded` holds the edited category's own family.
 * `keepId` keeps an existing record's current parent listed, even if older
 * data nested it deeper, so opening and saving never moves it silently.
 */
export function parentOptions(
  categories: readonly Category[],
  type: CategoryType,
  excluded: ReadonlySet<string>,
  {
    editingId,
    keepId,
  }: { editingId?: string | null; keepId?: string | null } = {},
): Category[] {
  if (
    editingId &&
    categories.some((category) => category.parentId === editingId)
  )
    return keepId
      ? categories.filter((category) => category.id === keepId)
      : [];
  return categories.filter(
    (category) =>
      category.type === type &&
      !excluded.has(category.id) &&
      (isMainCategory(categories, category) || category.id === keepId),
  );
}
