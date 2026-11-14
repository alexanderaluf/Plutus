import {
  recurringDefaults,
  type RecurringDraft,
} from "@/data/model/recurring-record";

type AccountLike = { id: string; isDefault: boolean };
type CategoryLook = {
  icon: string;
  iconPath: string | null;
  color: string;
};

/**
 * A new schedule starts from the profile: its currency, and its default
 * account (or the only account) already chosen as the payer.
 */
export function createInitialRecurringDraft(
  accounts: readonly AccountLike[],
  profileCurrency: string,
  now = new Date(),
): RecurringDraft {
  const account =
    accounts.find((item) => item.isDefault) ??
    (accounts.length === 1 ? accounts[0] : undefined);
  return {
    ...recurringDefaults(now),
    currencyCode: profileCurrency.toUpperCase(),
    account: account?.id ?? "",
  };
}

/**
 * Choosing a category lends the schedule that category's icon and colour,
 * until the person picks their own, so it is recognisable in every list.
 */
export function withCategoryLook(
  draft: RecurringDraft,
  category: CategoryLook | undefined,
  lookChosen: boolean,
): RecurringDraft {
  if (lookChosen || !category) return draft;
  return {
    ...draft,
    icon: category.icon,
    iconPath: category.iconPath,
    color: /^#[a-f\d]{6}$/i.test(category.color) ? category.color : draft.color,
  };
}

/** The reminder choices, in the order they are offered. */
export const REMINDER_OPTIONS = [null, 0, 1, 2, 7] as const;
