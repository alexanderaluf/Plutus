import * as BackgroundTask from "expo-background-task";
import * as TaskManager from "expo-task-manager";
import { openDatabaseAsync } from "expo-sqlite";
import { mutateDocument, readDocument } from "../database/document-repository";
import { initializeLocalDatabase } from "../database/safe-startup";
import { settleDueCardPayments } from "../model/card-payment";
import { reconcileRecurring } from "./recurring-service";
import { syncRecurringReminders } from "./recurring-reminders";
import { syncDailyNotifications } from "../notifications/daily-notifications";
import { i18n } from "@/localization/i18n";

const TASK = "plutus-recurring-payments-v1";
// Headless entry point: no React provider or feature component opens this connection.
if (!TaskManager.isTaskDefined(TASK))
  TaskManager.defineTask(TASK, async () => {
    const database = await openDatabaseAsync("budget-manager.db", {
      useNewConnection: true,
    });
    try {
      await initializeLocalDatabase(database);
      const result = await reconcileRecurring(
        {
          read: () => readDocument(database),
          update: async (updater) => {
            await mutateDocument(database, (current) =>
              settleDueCardPayments(updater(current)),
            );
          },
        },
        { limit: 100 },
      );
      const latest = await readDocument(database);
      // Headless runs have no LocalizationProvider; match the app's language.
      if (i18n.language !== latest._local.appLanguage)
        await i18n.changeLanguage(latest._local.appLanguage);
      await syncRecurringReminders(latest);
      // Keeps the daily notification window filled when the app stays closed.
      await syncDailyNotifications(latest).catch(() => undefined);
      return result.error
        ? BackgroundTask.BackgroundTaskResult.Failed
        : BackgroundTask.BackgroundTaskResult.Success;
    } catch {
      return BackgroundTask.BackgroundTaskResult.Failed;
    } finally {
      await database.closeAsync().catch(() => undefined);
    }
  });

export async function registerRecurringBackgroundTask() {
  if (!(await TaskManager.isAvailableAsync())) return false;
  if (
    (await BackgroundTask.getStatusAsync()) !==
    BackgroundTask.BackgroundTaskStatus.Available
  )
    return false;
  if (!(await TaskManager.isTaskRegisteredAsync(TASK)))
    await BackgroundTask.registerTaskAsync(TASK, { minimumInterval: 60 });
  return true;
}
