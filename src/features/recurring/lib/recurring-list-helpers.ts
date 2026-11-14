/**
 * Pure helpers for the recurring list. Kept free of React and app imports so
 * the grouping rules can be unit tested on their own.
 */

/** Sections of the Active tab, in reading order. */
export const UPCOMING_GROUPS = ["attention", "week", "month", "later"] as const;
export type UpcomingGroup = (typeof UPCOMING_GROUPS)[number];

/** Whole calendar days from `now` to `date` (negative when in the past). */
export function calendarDayDistance(date: Date, now: Date) {
  const target = new Date(date.getFullYear(), date.getMonth(), date.getDate());
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  // Rounding absorbs the 23/25-hour days around daylight-saving changes.
  return Math.round((target.getTime() - today.getTime()) / 86_400_000);
}

/**
 * Where a schedule belongs on the Active tab:
 * - `attention`: a payment is due, or the schedule cannot run until edited.
 * - `week`: the next payment falls within the next 7 days (today included).
 * - `month`: later in the current calendar month.
 * - `later`: next month or beyond.
 */
export function upcomingGroup(
  item: { due: boolean; next: Date | null },
  now: Date,
): UpcomingGroup {
  if (item.due || !item.next) return "attention";
  if (calendarDayDistance(item.next, now) < 7) return "week";
  if (
    item.next.getFullYear() === now.getFullYear() &&
    item.next.getMonth() === now.getMonth()
  )
    return "month";
  return "later";
}

/** Splits items into the Active tab's sections, keeping their order. */
export function groupUpcoming<T extends { due: boolean; next: Date | null }>(
  items: T[],
  now: Date,
) {
  const groups = new Map<UpcomingGroup, T[]>();
  for (const item of items) {
    const group = upcomingGroup(item, now);
    groups.set(group, [...(groups.get(group) ?? []), item]);
  }
  return UPCOMING_GROUPS.filter((group) => groups.has(group)).map((group) => ({
    group,
    items: groups.get(group)!,
  }));
}

/**
 * A plain-language label for an upcoming date: "today", "tomorrow" and
 * "in N days" inside a week; the caller formats anything further out.
 */
export function relativeDay(
  date: Date,
  now: Date,
): { key: "today" | "tomorrow" | "inDays"; count: number } | null {
  const days = calendarDayDistance(date, now);
  if (days === 0) return { key: "today", count: 0 };
  if (days === 1) return { key: "tomorrow", count: 1 };
  if (days > 1 && days < 7) return { key: "inDays", count: days };
  return null;
}
