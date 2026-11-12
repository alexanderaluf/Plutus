import PlutusWidgetModule from "../../../modules/plutus-widget/src/PlutusWidgetModule";
import type { BackupDocument } from "../model/backup-document";
import { selectWidgetSnapshot } from "../selectors/widget-selectors";

let widgetQueue = Promise.resolve();

/**
 * Projects the canonical BackupDocument into a read-only widget snapshot and
 * pushes it to the native iOS WidgetKit and Android AppWidgetManager bridge.
 */
export function syncHomeWidget(document: BackupDocument, now = new Date()) {
  widgetQueue = widgetQueue
    .catch(() => undefined)
    .then(async () => {
      if (!PlutusWidgetModule) return;
      const snapshot = selectWidgetSnapshot(document, now);
      await PlutusWidgetModule.setWidgetSnapshotAsync(JSON.stringify(snapshot));
    });
  return widgetQueue;
}

/**
 * Reads and clears any pending profile selection made directly from a home
 * screen widget while the app was in the background or closed.
 */
export async function consumeWidgetPendingProfileId(): Promise<string | null> {
  if (!PlutusWidgetModule) return null;
  try {
    return await PlutusWidgetModule.consumePendingProfileIdAsync();
  } catch {
    return null;
  }
}

/**
 * Subscribes to live profile-switch events emitted by the native widget while
 * the application process is active.
 */
export function subscribeWidgetProfileChanges(
  onProfileSelected: (profileId: string) => void,
) {
  if (!PlutusWidgetModule) return () => undefined;
  const subscription = PlutusWidgetModule.addListener(
    "onWidgetProfileChanged",
    (event) => {
      if (typeof event?.profileId === "string" && event.profileId) {
        onProfileSelected(event.profileId);
      }
    },
  );
  return () => {
    subscription.remove();
  };
}
