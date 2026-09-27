import { i18n } from "@/localization/i18n";

import type { BackupDocument } from "./backup-document";
import type { JsonObject, JsonValue } from "./json";

export type CategoryType = 0 | 1 | 2;
export type CategoryDraft = {
  name: string;
  description: string;
  type: CategoryType;
  parentId: string | null;
  icon: string;
  iconPath: string | null;
  color: string;
  isDefault: boolean;
};

export function identity(record: JsonObject) {
  return String(record.uuid ?? record.id ?? "");
}

export function references(record: JsonObject, value: JsonValue | undefined) {
  return (
    value != null &&
    [record.uuid, record.id].some(
      (id) => id != null && String(id) === String(value),
    )
  );
}

export function categoryParent(record: JsonObject) {
  return record.parentId !== undefined
    ? record.parentId
    : (record.parent ?? record.parentCategory ?? null);
}

export function categoryProfileId(document: BackupDocument) {
  const selected = document.users.find((record) =>
    references(record, document._local.selectedProfileId),
  );
  const marked = document.users.find(
    (record) => record.isSelected === true && typeof record.uuid === "string",
  );
  const owner = selected ?? marked ?? document.users[0];
  return owner ? identity(owner) : document._local.selectedProfileId;
}

export function belongsToProfile(
  document: BackupDocument,
  record: JsonObject,
  profileId = categoryProfileId(document),
) {
  if (!profileId || record.user == null) return true;
  const owner = document.users.find((user) => references(user, profileId));
  return owner
    ? references(owner, record.user)
    : String(record.user) === profileId;
}

/** Compile owner aliases once for a large read-only projection. */
export function createProfileMatcher(document: BackupDocument) {
  const profileId = categoryProfileId(document);
  const owner = document.users.find((user) => references(user, profileId));
  const aliases = new Set(
    (owner ? [owner.uuid, owner.id] : [profileId])
      .filter((id) => id != null)
      .map(String),
  );
  return (record: JsonObject) =>
    !profileId || record.user == null || aliases.has(String(record.user));
}

export function normalizeCategoryRecord(record: JsonObject): JsonObject {
  return {
    description: "",
    icon: "shopping",
    iconPath: null,
    color: "#70d2eb",
    isDefault: false,
    ...record,
    parentId: categoryParent(record),
  };
}

// Traversal tolerates malformed imported cycles without losing imported fields.
export function categoryFamily(records: JsonObject[], id: string): Set<string> {
  const family = new Set([id]);
  let changed = true;
  while (changed) {
    changed = false;
    for (const record of records) {
      const parent = records.find((candidate) =>
        references(candidate, categoryParent(record)),
      );
      if (
        parent &&
        family.has(identity(parent)) &&
        !family.has(identity(record))
      ) {
        family.add(identity(record));
        changed = true;
      }
    }
  }
  return family;
}

function withParent(record: JsonObject, parentId: string | null): JsonObject {
  return {
    ...record,
    parentId,
    ...(Object.hasOwn(record, "parent") ? { parent: parentId } : {}),
    ...(Object.hasOwn(record, "parentCategory")
      ? { parentCategory: parentId }
      : {}),
  };
}

export function saveCategory(
  document: BackupDocument,
  draft: CategoryDraft,
  id: string,
  profileId: string,
  now: string,
  editing = false,
): BackupDocument {
  const existing = document.categories.find(
    (record) => identity(record) === id,
  );
  if (!id || (editing && !existing))
    throw new Error(i18n.t("validation.category.missingReopen"));
  if (existing && !belongsToProfile(document, existing, profileId))
    throw new Error(i18n.t("validation.category.wrongProfile"));
  if (!draft.name.trim() || draft.name.trim().length > 100)
    throw new Error(i18n.t("validation.category.name"));
  if (draft.description.length > 500)
    throw new Error(i18n.t("validation.category.description"));
  if (![0, 1, 2].includes(draft.type))
    throw new Error(i18n.t("validation.category.type"));
  if (!/^#[a-f\d]{6}$/i.test(draft.color))
    throw new Error(i18n.t("validation.category.color"));
  if (
    !draft.icon ||
    (draft.iconPath &&
      (!/^[Mm]/.test(draft.iconPath) || draft.iconPath.length > 20_000))
  )
    throw new Error(i18n.t("validation.category.icon"));
  const family = categoryFamily(document.categories, id);
  const parent = draft.parentId
    ? document.categories.find((record) => identity(record) === draft.parentId)
    : null;
  if (
    draft.parentId &&
    (!parent ||
      !belongsToProfile(document, parent, profileId) ||
      Number(parent.type ?? 0) !== draft.type)
  )
    throw new Error(i18n.t("validation.category.parent"));
  if (parent && family.has(identity(parent)))
    throw new Error(i18n.t("validation.category.parentCycle"));
  if (existing && Number(existing.type ?? 0) !== draft.type) {
    const linked = [
      ...document.transactions,
      ...document.templates,
      ...document.recurrings,
    ].some((record) => references(existing, record.category));
    if (linked || family.size > 1)
      throw new Error(i18n.t("validation.category.typeLocked"));
  }
  const owner = existing?.user ?? (existing ? null : profileId);
  if (parent && owner == null && parent.user != null)
    throw new Error(i18n.t("validation.category.sharedParent"));
  const record = withParent(
    {
      ...existing,
      uuid: existing?.uuid ?? id,
      user: owner,
      type: draft.type,
      icon: draft.icon,
      iconPath: draft.iconPath,
      color: draft.color,
      isDefault: draft.isDefault,
      name: draft.name.trim(),
      description: draft.description.trim(),
      createdAt: existing?.createdAt ?? now,
      updatedAt: now,
    },
    draft.parentId,
  );
  let categories = document.categories.map((item) => {
    if (identity(item) === id) return record;
    if (
      draft.isDefault &&
      Number(item.type ?? 0) === draft.type &&
      belongsToProfile(document, item, profileId)
    )
      return { ...item, isDefault: false, updatedAt: now };
    return item;
  });
  if (!existing) categories = [...categories, record];
  // Keep cached display names in sync for existing activity/search views.
  const rename = (items: JsonObject[]) =>
    items.map((item) =>
      existing && references(existing, item.category)
        ? { ...item, categoryName: record.name, updatedAt: now }
        : item,
    );
  return {
    ...document,
    categories,
    transactions: rename(document.transactions),
    templates: rename(document.templates),
    recurrings: rename(document.recurrings),
  };
}

export function deleteCategory(
  document: BackupDocument,
  id: string,
  now: string,
): BackupDocument {
  const category = document.categories.find(
    (record) => identity(record) === id,
  );
  if (!category) throw new Error(i18n.t("validation.category.missing"));
  if (!belongsToProfile(document, category))
    throw new Error(i18n.t("validation.category.wrongProfile"));
  const detach = (records: JsonObject[]) =>
    records.map((record) =>
      references(category, record.category)
        ? {
            ...record,
            category: null,
            categoryName: "Uncategorized",
            updatedAt: now,
          }
        : record,
    );
  return {
    ...document,
    categories: document.categories
      .filter((record) => identity(record) !== id)
      .map((record) =>
        references(category, categoryParent(record))
          ? { ...withParent(record, null), updatedAt: now }
          : record,
      ),
    transactions: detach(document.transactions),
    templates: detach(document.templates),
    recurrings: detach(document.recurrings),
    budgets: document.budgets.map((record) =>
      Array.isArray(record.categories) &&
      record.categories.some((value) => references(category, value))
        ? {
            ...record,
            categories: record.categories.filter(
              (value) => !references(category, value),
            ),
            updatedAt: now,
          }
        : record,
    ),
  };
}
