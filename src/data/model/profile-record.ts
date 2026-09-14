import { i18n } from "@/localization/i18n";

import {
  BACKUP_COLLECTION_KEYS,
  type BackupCollectionKey,
  type BackupDocument,
} from "./backup-document";
import { createDefaultBackup } from "./default-backup";
import { categoryParent, identity, references } from "./category-record";
import type { JsonObject, JsonValue } from "./json";

export type DeletedProfileData = {
  document: BackupDocument;
  attachmentPaths: string[];
};

function values(value: JsonValue | undefined) {
  return Array.isArray(value) ? value : [value];
}

function referencesAny(value: JsonValue | undefined, ids: Set<string>) {
  return values(value).some((item) => item != null && ids.has(String(item)));
}

function recordReferencesAny(
  record: JsonObject,
  fields: string[],
  ids: Set<string>,
) {
  return fields.some((field) => referencesAny(record[field], ids));
}

function collectStrings(value: unknown, result: Set<string>) {
  if (typeof value === "string") {
    result.add(value);
    return;
  }
  if (Array.isArray(value)) {
    value.forEach((item) => collectStrings(item, result));
    return;
  }
  if (value && typeof value === "object")
    Object.values(value).forEach((item) => collectStrings(item, result));
}

function withoutReferences(value: JsonValue | undefined, ids: Set<string>) {
  if (!Array.isArray(value)) return value;
  return value.filter((item) => item == null || !ids.has(String(item)));
}

export function deleteProfileData(
  current: BackupDocument,
  profileId: string,
): DeletedProfileData {
  const profile = current.users.find((user) => references(user, profileId));
  if (!profile) throw new Error(i18n.t("profile.manage.delete.missing"));

  if (current.users.length === 1)
    return {
      document: createDefaultBackup(),
      attachmentPaths: current._local.attachments.map(
        (attachment) => attachment.relativePath,
      ),
    };

  const ownedByProfile = (record: JsonObject) =>
    record.user != null && references(profile, record.user);
  const directlyDeleted = new Map<BackupCollectionKey, Set<string>>();
  for (const key of BACKUP_COLLECTION_KEYS)
    directlyDeleted.set(
      key,
      new Set(
        current[key]
          .filter((record) => key === "users" ? references(record, profileId) : ownedByProfile(record))
          .map(identity)
          .filter(Boolean),
      ),
    );

  const deletedAccounts = directlyDeleted.get("accounts")!;
  const deletedCategories = directlyDeleted.get("categories")!;
  let foundCategoryChild = true;
  while (foundCategoryChild) {
    foundCategoryChild = false;
    for (const category of current.categories) {
      const id = identity(category);
      if (
        id &&
        !deletedCategories.has(id) &&
        referencesAny(categoryParent(category), deletedCategories)
      ) {
        deletedCategories.add(id);
        foundCategoryChild = true;
      }
    }
  }

  const deletedBudgets = directlyDeleted.get("budgets")!;
  for (const budget of current.budgets)
    if (
      recordReferencesAny(budget, ["accounts"], deletedAccounts) ||
      recordReferencesAny(budget, ["category", "categories"], deletedCategories)
    )
      deletedBudgets.add(identity(budget));

  const deletedTransactions = directlyDeleted.get("transactions")!;
  const deletedTemplates = directlyDeleted.get("templates")!;
  const deletedRecurrings = directlyDeleted.get("recurrings")!;
  const activityFields = [
    "account",
    "fromAccount",
    "toAccount",
    "destinationAccount",
  ];
  for (const record of current.transactions)
    if (
      recordReferencesAny(record, activityFields, deletedAccounts) ||
      recordReferencesAny(record, ["category"], deletedCategories) ||
      recordReferencesAny(record, ["budget"], deletedBudgets)
    )
      deletedTransactions.add(identity(record));
  for (const record of current.templates)
    if (
      recordReferencesAny(record, activityFields, deletedAccounts) ||
      recordReferencesAny(record, ["category"], deletedCategories) ||
      recordReferencesAny(record, ["budget"], deletedBudgets)
    )
      deletedTemplates.add(identity(record));
  for (const record of current.recurrings)
    if (
      recordReferencesAny(record, activityFields, deletedAccounts) ||
      recordReferencesAny(record, ["category"], deletedCategories) ||
      recordReferencesAny(record, ["budget"], deletedBudgets)
    )
      deletedRecurrings.add(identity(record));

  const deletedSplitters = directlyDeleted.get("billSplitters")!;
  const deletedParticipants = directlyDeleted.get("billParticipants")!;
  for (const participant of current.billParticipants)
    if (
      recordReferencesAny(
        participant,
        ["billSplitter", "billSplitterId", "splitter"],
        deletedSplitters,
      )
    )
      deletedParticipants.add(identity(participant));

  const deletedImages = directlyDeleted.get("images")!;
  for (const image of current.images)
    if (
      recordReferencesAny(
        image,
        ["transaction", "transactionId"],
        deletedTransactions,
      )
    )
      deletedImages.add(identity(image));

  const deletedByCollection = new Map(directlyDeleted);
  deletedByCollection.set("categories", deletedCategories);
  deletedByCollection.set("budgets", deletedBudgets);
  deletedByCollection.set("transactions", deletedTransactions);
  deletedByCollection.set("templates", deletedTemplates);
  deletedByCollection.set("recurrings", deletedRecurrings);
  deletedByCollection.set("billParticipants", deletedParticipants);
  deletedByCollection.set("images", deletedImages);

  const isDeleted = (key: BackupCollectionKey, record: JsonObject) =>
    (key === "users" ? references(record, profileId) : ownedByProfile(record)) ||
    deletedByCollection.get(key)!.has(identity(record));

  const next = { ...current } as BackupDocument;
  for (const key of BACKUP_COLLECTION_KEYS) {
    next[key] = current[key].filter((record) => !isDeleted(key, record));
  }

  next.accounts = next.accounts.map((account) => ({
    ...account,
    ...(Array.isArray(account.transactions)
      ? {
          transactions: withoutReferences(
            account.transactions,
            deletedTransactions,
          ),
        }
      : {}),
    ...(referencesAny(account.linkedBankAccountId, deletedAccounts)
      ? { linkedBankAccountId: null }
      : {}),
  }));
  next.categories = next.categories.map((category) => ({
    ...category,
    ...(Array.isArray(category.transactions)
      ? {
          transactions: withoutReferences(
            category.transactions,
            deletedTransactions,
          ),
        }
      : {}),
  }));

  const previouslySelected =
    current.users.find((user) =>
      references(user, current._local.selectedProfileId),
    ) ??
    current.users.find((user) => user.isSelected === true) ??
    current.users[0];
  const selectedWasDeleted = references(previouslySelected, profileId);
  const selectedProfile = selectedWasDeleted
    ? next.users[0]
    : (next.users.find((user) =>
        references(user, identity(previouslySelected)),
      ) ?? next.users[0]);
  const selectedProfileId = identity(selectedProfile);
  next.users = next.users.map((user) => ({
    ...user,
    isSelected: identity(user) === selectedProfileId,
  }));
  next._local = {
    ...current._local,
    selectedProfileId,
  };

  const removedStrings = new Set<string>();
  collectStrings(profile, removedStrings);
  for (const key of BACKUP_COLLECTION_KEYS) {
    current[key]
      .filter((record) => isDeleted(key, record))
      .forEach((record) => collectStrings(record, removedStrings));
  }
  const retainedStrings = new Set<string>();
  collectStrings(
    { ...next, _local: { ...next._local, attachments: [] } },
    retainedStrings,
  );
  const removedAttachments = current._local.attachments.filter(
    (attachment) =>
      (removedStrings.has(attachment.id) ||
        removedStrings.has(attachment.relativePath)) &&
      !retainedStrings.has(attachment.id) &&
      !retainedStrings.has(attachment.relativePath),
  );
  next._local.attachments = current._local.attachments.filter(
    (attachment) => !removedAttachments.includes(attachment),
  );

  return {
    document: next,
    attachmentPaths: removedAttachments.map(
      (attachment) => attachment.relativePath,
    ),
  };
}