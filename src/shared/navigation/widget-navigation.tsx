import * as Linking from "expo-linking";
import { useRouter } from "expo-router";
import { useEffect, useRef } from "react";
import { AppState } from "react-native";

import {
  consumeWidgetPendingProfileId,
  subscribeWidgetProfileChanges,
} from "@/data/widgets/widget-sync";
import { useProfiles } from "@/features/profile/profile-provider";

/**
 * Synchronizes profile selection and deep-link actions initiated from the
 * Android and iOS home-screen widgets with the canonical profile state.
 */
export function WidgetNavigation() {
  const router = useRouter();
  const { profiles, activeProfileId, selectProfile } = useProfiles();
  const stateRef = useRef({ profiles, activeProfileId, selectProfile });
  stateRef.current = { profiles, activeProfileId, selectProfile };

  useEffect(() => {
    let cancelled = false;

    const applyProfileSwitch = async (candidateProfileId: string | null | undefined) => {
      if (cancelled || !candidateProfileId) return;
      const {
        profiles: currentProfiles,
        activeProfileId: currentActiveId,
        selectProfile: select,
      } = stateRef.current;
      if (candidateProfileId === currentActiveId) return;
      if (!currentProfiles.some((item) => item.id === candidateProfileId)) return;
      await select(candidateProfileId).catch(() => undefined);
    };

    const syncPendingFromWidget = async () => {
      const pendingId = await consumeWidgetPendingProfileId();
      await applyProfileSwitch(pendingId);
    };

    const handleDeepLink = async (url: string | null) => {
      if (!url || cancelled) return;
      try {
        const parsed = Linking.parse(url);
        const rawProfileId = parsed.queryParams?.profileId;
        const profileId =
          typeof rawProfileId === "string"
            ? rawProfileId
            : Array.isArray(rawProfileId)
              ? rawProfileId[0]
              : null;
        if (profileId) {
          await applyProfileSwitch(profileId);
        }
        if (parsed.path === "widget-action") {
          router.replace("/");
        }
      } catch {
        // Ignore malformed external URLs.
      }
    };

    void syncPendingFromWidget();
    void Linking.getInitialURL()
      .then(handleDeepLink)
      .catch(() => undefined);

    const unsubscribeWidgetEvent = subscribeWidgetProfileChanges((profileId) => {
      void applyProfileSwitch(profileId);
    });

    const appStateSubscription = AppState.addEventListener("change", (nextState) => {
      if (nextState === "active") {
        void syncPendingFromWidget();
      }
    });

    const urlSubscription = Linking.addEventListener("url", ({ url }) => {
      void handleDeepLink(url);
    });

    return () => {
      cancelled = true;
      unsubscribeWidgetEvent();
      appStateSubscription.remove();
      urlSubscription.remove();
    };
  }, [router]);

  return null;
}

