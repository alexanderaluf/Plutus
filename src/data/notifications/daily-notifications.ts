import { Linking, Platform } from "react-native";

import { i18n } from "@/localization/i18n";
import { formatCurrency } from "@/shared/lib/currency";
import {
  NOTIFICATION_KINDS,
  type BackupDocument,
  type NotificationKind,
} from "../model/backup-document";
import { loadNotifications } from "../recurring/recurring-reminders";
import {
  DAILY_NOTIFICATION_PREFIX,
  planDailyNotifications,
  type NotificationText,
} from "./daily-notification-plan";

// The plan builds keys from its kinds; every key exists in the en catalog.
const translate = i18n.t.bind(i18n) as unknown as NotificationText["t"];

type NotificationsModule = NonNullable<
  Awaited<ReturnType<typeof loadNotifications>>
>;

// One Android channel per kind, so each can be silenced in system settings.
const CHANNELS: Record<NotificationKind, string> = {
  expenseReminder: "daily-expense-reminder",
  dailySummary: "daily-spending-summary",
  recurringDigest: "daily-recurring-digest",
};

async function ensureChannels(Notifications: NotificationsModule) {
  if (Platform.OS !== "android") return;
  for (const kind of NOTIFICATION_KINDS)
    await Notifications.setNotificationChannelAsync(CHANNELS[kind], {
      name: i18n.t(`notifications.${kind}.channel`),
      description: i18n.t(`notifications.${kind}.description`),
      importance: Notifications.AndroidImportance.DEFAULT,
      // Spending details stay hidden on a secure lock screen.
      lockscreenVisibility: Notifications.AndroidNotificationVisibility.PRIVATE,
      enableVibrate: true,
      showBadge: false,
    });
}

function isAllowed(
  Notifications: NotificationsModule,
  permission: Awaited<ReturnType<NotificationsModule["getPermissionsAsync"]>>,
) {
  return (
    permission.granted ||
    permission.ios?.status === Notifications.IosAuthorizationStatus.PROVISIONAL
  );
}

/** Asks once; returns false when the system setting blocks notifications. */
export async function requestNotificationPermission() {
  const Notifications = await loadNotifications();
  if (!Notifications) return false;
  await ensureChannels(Notifications);
  const current = await Notifications.getPermissionsAsync();
  if (isAllowed(Notifications, current)) return true;
  if (!current.canAskAgain) return false;
  return isAllowed(
    Notifications,
    await Notifications.requestPermissionsAsync(),
  );
}

export async function notificationsAvailable() {
  return (await loadNotifications()) !== null;
}

export function openNotificationSettings() {
  return Linking.openSettings();
}

// Coordination only; `_local.notifications` and the OS schedule are the truth.
let queue = Promise.resolve();

/**
 * Replaces the scheduled daily notifications with the current plan. Content
 * is rebuilt on every data change, so summaries reflect the latest records.
 */
export function syncDailyNotifications(
  document: BackupDocument,
  now = new Date(),
) {
  queue = queue
    .catch(() => undefined)
    .then(async () => {
      const Notifications = await loadNotifications();
      if (!Notifications) return;
      const desired = planDailyNotifications(document, now, {
        t: translate,
        money: (amount, currencyCode) => formatCurrency(amount, currencyCode),
      });
      const existing = (
        await Notifications.getAllScheduledNotificationsAsync()
      ).filter((n) => n.identifier.startsWith(DAILY_NOTIFICATION_PREFIX));
      for (const request of existing)
        if (
          !desired.some(
            (n) =>
              n.identifier === request.identifier &&
              n.signature === request.content.data?.signature,
          )
        )
          await Notifications.cancelScheduledNotificationAsync(
            request.identifier,
          );
      if (!desired.length) return;
      // Settings asks for permission; a background sync never prompts.
      if (!isAllowed(Notifications, await Notifications.getPermissionsAsync()))
        return;
      await ensureChannels(Notifications);
      for (const request of desired) {
        if (
          existing.some(
            (n) =>
              n.identifier === request.identifier &&
              n.content.data?.signature === request.signature,
          )
        )
          continue;
        await Notifications.scheduleNotificationAsync({
          identifier: request.identifier,
          content: {
            title: request.title,
            body: request.body,
            sound: false,
            data: {
              kind: request.kind,
              signature: request.signature,
              url: request.url,
            },
          },
          trigger: {
            type: Notifications.SchedulableTriggerInputTypes.DATE,
            date: request.date,
            channelId: CHANNELS[request.kind],
          },
        });
      }
    });
  return queue;
}
