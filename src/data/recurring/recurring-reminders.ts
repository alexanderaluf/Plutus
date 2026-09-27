import { isRunningInExpoGo } from 'expo';
import { Platform } from "react-native";
import { i18n } from "@/localization/i18n";
import type { BackupDocument } from "../model/backup-document";
import { identity } from "../model/category-record";
import { nextOccurrence, occurrenceKey } from "../model/recurring-record";

const CHANNEL = "recurring-reminders";
type NotificationsModule = typeof import('expo-notifications');
let notificationModule: Promise<NotificationsModule> | null = null;

async function loadNotifications() {
  // Importing the package's barrel also initializes its push-token listener.
  // Expo Go must never evaluate that module, even for local-only reminders.
  if (isRunningInExpoGo() || Platform.OS === 'web') return null;
  if (!notificationModule) notificationModule = import('expo-notifications').then(Notifications => {
    Notifications.setNotificationHandler({
      handleNotification: async () => ({ shouldShowBanner: true, shouldShowList: true, shouldPlaySound: false, shouldSetBadge: false }),
    });
    return Notifications;
  }).catch(error => { notificationModule = null; throw error; });
  return notificationModule;
}
async function channel(Notifications: NotificationsModule) {
  if (Platform.OS === "android")
    await Notifications.setNotificationChannelAsync(CHANNEL, {
      name: i18n.t("recurring.reminder"),
      importance: Notifications.AndroidImportance.DEFAULT,
    });
}
export async function requestRecurringReminderPermission() {
  const Notifications = await loadNotifications();
  if (!Notifications) throw new Error(i18n.t('recurring.reminderNativeBuild'));
  await channel(Notifications);
  const current = await Notifications.getPermissionsAsync();
  const result = current.granted
    ? current
    : await Notifications.requestPermissionsAsync();
  if (
    !result.granted &&
    result.ios?.status !== Notifications.IosAuthorizationStatus.PROVISIONAL
  )
    throw new Error(i18n.t("recurring.reminderPermission"));
}

// Coordination only; the document and OS schedule remain the sources of truth.
let queue = Promise.resolve();
export function syncRecurringReminders(
  document: BackupDocument,
  now = new Date(),
) {
  queue = queue
    .catch(() => undefined)
    .then(async () => {
      const Notifications = await loadNotifications();
      if (!Notifications) return;
      const desired = document.recurrings
        .flatMap((record) => {
          const due = nextOccurrence(record);
          if (
            record.archived === true ||
            !due ||
            typeof record.reminderDays !== "number" ||
            ![0, 1, 2, 7].includes(record.reminderDays)
          )
            return [];
          const date = new Date(due);
          date.setDate(date.getDate() - record.reminderDays);
          if (date <= now) return [];
          const identifier = `reminder:${occurrenceKey(record)}`;
          const signature = JSON.stringify([
            date.toISOString(),
            record.name,
            record.amount,
            record.currencyCode,
          ]);
          return [
            {
              identifier,
              signature,
              date,
              name: String(record.name ?? ""),
              id: identity(record),
            },
          ];
        })
        .sort((a, b) => a.date.getTime() - b.date.getTime())
        .slice(0, 48);
      const existing = (
        await Notifications.getAllScheduledNotificationsAsync()
      ).filter((n) => n.identifier.startsWith("reminder:recurring:"));
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
      const permission = await Notifications.getPermissionsAsync();
      if (
        !permission.granted &&
        permission.ios?.status !==
          Notifications.IosAuthorizationStatus.PROVISIONAL
      )
        throw new Error(i18n.t("recurring.reminderPermission"));
      await channel(Notifications);
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
            title: request.name,
            body: i18n.t("recurring.reminderBody"),
            data: { recurringId: request.id, signature: request.signature },
          },
          trigger: {
            type: Notifications.SchedulableTriggerInputTypes.DATE,
            date: request.date,
            channelId: CHANNEL,
          },
        });
      }
    });
  return queue;
}
