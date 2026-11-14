import { useRouter, type Href } from "expo-router";
import { useEffect } from "react";

import { loadNotifications } from "@/data/recurring/recurring-reminders";

/**
 * Opens the screen a tapped notification points to (its `data.url`), both
 * while running and when the tap launched the app.
 */
export function NotificationNavigation() {
  const router = useRouter();

  useEffect(() => {
    let cancelled = false;
    let subscription: { remove: () => void } | null = null;
    void loadNotifications()
      .then(async (Notifications) => {
        if (!Notifications || cancelled) return;
        const open = (
          response: Awaited<
            ReturnType<typeof Notifications.getLastNotificationResponseAsync>
          >,
        ) => {
          const url = response?.notification.request.content.data?.url;
          if (typeof url === "string" && url.startsWith("/"))
            router.push(url as Href);
        };
        const launch = await Notifications.getLastNotificationResponseAsync();
        if (cancelled) return;
        if (launch) {
          open(launch);
          await Notifications.clearLastNotificationResponseAsync();
        }
        subscription =
          Notifications.addNotificationResponseReceivedListener(open);
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
      subscription?.remove();
    };
  }, [router]);

  return null;
}
