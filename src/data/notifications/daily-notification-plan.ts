import {
  NOTIFICATION_KINDS,
  type BackupDocument,
  type NotificationKind,
} from "../model/backup-document";
import { localDateKey } from "../model/recurring-record";
import {
  selectDailySpending,
  selectDailySpendingSummary,
  selectRecurringDigest,
} from "../selectors/notification-selectors";

/**
 * Days scheduled ahead. iOS keeps at most 64 pending local notifications and
 * recurring reminders use up to 48, so 3 kinds x 5 days stays under the cap.
 * Every launch, data change and background run extends the window.
 */
export const DAILY_NOTIFICATION_DAYS = 5;
export const DAILY_NOTIFICATION_PREFIX = "daily:";

export type PlannedNotification = {
  identifier: string;
  kind: NotificationKind;
  date: Date;
  title: string;
  body: string;
  /** In-app route opened when the notification is tapped. */
  url: string;
  signature: string;
};

export type NotificationText = {
  t: (key: string, options?: Record<string, unknown>) => string;
  money: (amount: number, currencyCode: string) => string;
};

function atTime(day: Date, time: string) {
  const [hours, minutes] = time.split(":").map(Number);
  return new Date(
    day.getFullYear(),
    day.getMonth(),
    day.getDate(),
    hours,
    minutes,
  );
}

function expenseReminder(
  document: BackupDocument,
  day: Date,
  { t }: NotificationText,
) {
  const count = selectDailySpending(document, [day]).get(
    localDateKey(day),
  )!.count;
  return count === 0
    ? {
        title: t("notifications.expenseReminder.title"),
        body: t("notifications.expenseReminder.body"),
        url: "/transactions/create",
      }
    : {
        title: t("notifications.expenseReminder.loggedTitle"),
        body: t("notifications.expenseReminder.loggedBody", { count }),
        url: "/transactions/create",
      };
}

function dailySummary(
  document: BackupDocument,
  day: Date,
  { t, money }: NotificationText,
) {
  const summary = selectDailySpendingSummary(document, day);
  const { today, yesterday, lastMonth } = summary;
  if (today.count === 0)
    return {
      title: t("notifications.dailySummary.emptyTitle"),
      body: t("notifications.dailySummary.emptyBody"),
      url: "/transactions/create",
    };
  const belowYesterday = yesterday.count > 0 && today.amount < yesterday.amount;
  const belowLastMonth = lastMonth.count > 0 && today.amount < lastMonth.amount;
  const title = t(
    belowYesterday && belowLastMonth
      ? "notifications.dailySummary.cheerTitle"
      : belowYesterday
        ? "notifications.dailySummary.belowYesterdayTitle"
        : belowLastMonth
          ? "notifications.dailySummary.belowLastMonthTitle"
          : "notifications.dailySummary.title",
  );
  // Amounts stay off the lock screen while the user has them hidden in-app.
  const body = document._local.amountsHidden
    ? t("notifications.dailySummary.hiddenBody")
    : t("notifications.dailySummary.body", {
        today: money(today.amount, summary.currencyCode),
        yesterday: money(yesterday.amount, summary.currencyCode),
        lastMonth: money(lastMonth.amount, summary.currencyCode),
      });
  return { title, body, url: "/reports" };
}

function recurringDigest(
  document: BackupDocument,
  day: Date,
  { t, money }: NotificationText,
) {
  const items = selectRecurringDigest(document, day);
  if (!items.length) return null;
  const hidden = document._local.amountsHidden;
  if (items.length === 1) {
    const [item] = items;
    return {
      title: t("notifications.recurringDigest.singleTitle", {
        name: item.name,
      }),
      body: hidden
        ? t("notifications.recurringDigest.singleHiddenBody")
        : t("notifications.recurringDigest.singleBody", {
            amount: money(item.amount, item.currencyCode),
          }),
      url: `/recurring/${item.id}`,
    };
  }
  const shown = items
    .slice(0, 4)
    .map((item) =>
      hidden
        ? item.name
        : `${item.name} ${money(item.amount, item.currencyCode)}`,
    );
  if (items.length > 4)
    shown.push(
      t("notifications.recurringDigest.more", { count: items.length - 4 }),
    );
  return {
    title: t("notifications.recurringDigest.title", { count: items.length }),
    body: shown.join(", "),
    url: "/recurring",
  };
}

const builders = { expenseReminder, dailySummary, recurringDigest };

/** Every enabled notification for the next days, built from current data. */
export function planDailyNotifications(
  document: BackupDocument,
  now: Date,
  text: NotificationText,
): PlannedNotification[] {
  const preferences = document._local.notifications;
  const planned: PlannedNotification[] = [];
  if (!document._local.selectedProfileId) return planned;
  for (const kind of NOTIFICATION_KINDS) {
    const preference = preferences[kind];
    if (!preference.enabled) continue;
    for (let offset = 0; offset < DAILY_NOTIFICATION_DAYS; offset++) {
      const day = new Date(
        now.getFullYear(),
        now.getMonth(),
        now.getDate() + offset,
      );
      const date = atTime(day, preference.time);
      if (date <= now) continue;
      const content = builders[kind](document, day, text);
      if (!content) continue;
      planned.push({
        identifier: `${DAILY_NOTIFICATION_PREFIX}${kind}:${localDateKey(day)}`,
        kind,
        date,
        ...content,
        signature: JSON.stringify([
          date.toISOString(),
          content.title,
          content.body,
        ]),
      });
    }
  }
  return planned.sort((a, b) => a.date.getTime() - b.date.getTime());
}
