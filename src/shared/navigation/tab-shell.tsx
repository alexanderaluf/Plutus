import { AppAlert } from "@/shared/ui/app-alert";
import { BlurTargetView } from "expo-blur";
import { Slot, usePathname, useRouter } from "expo-router";
import { useRef } from "react";
import { useTranslation } from "react-i18next";
import { View, type ViewInstance } from "react-native";

import { BottomNavigation } from "./bottom-navigation";
import { getTabFromPathname, navigationItems } from "./navigation-config";
import { TabActionProvider, useTabActionRegistry } from "./tab-actions";
import type { TabId } from "./types";
import { useAppThemeColors } from "@/shared/theme/app-theme";

export function TabShell() {
  const { t } = useTranslation();
  const blurTargetRef = useRef<ViewInstance | null>(null);
  const theme = useAppThemeColors();
  const pathname = usePathname();
  const router = useRouter();
  const activeItem = getTabFromPathname(pathname);
  const tabActions = useTabActionRegistry();

  function handleTabChange(tabId: TabId) {
    const destination = navigationItems.find((item) => item.id === tabId);

    if (destination && tabId !== activeItem) {
      router.replace(destination.href);
    }
  }

  function handleActionPress(tabId: TabId) {
    if (tabId === "home") {
      router.push("/transactions/create");
      return;
    }
    if (tabId === "accounts") {
      router.push("/accounts/create");
      return;
    }
    const screenAction = tabActions.get(tabId);
    if (screenAction) {
      screenAction();
      return;
    }
    const action =
      tabId === "reports"
        ? t("navigation.actions.reviewPeriod")
        : t("navigation.actions.searchTransactions");
    AppAlert.alert(action, t("navigation.actions.unavailable", { action }));
  }

  return (
    <View style={{ flex: 1, backgroundColor: theme.background }}>
      <View style={{ flex: 1 }}>
        <BlurTargetView ref={blurTargetRef} style={{ flex: 1 }}>
          <TabActionProvider registry={tabActions}>
            <Slot />
          </TabActionProvider>
        </BlurTargetView>

        <BottomNavigation
          activeItem={activeItem}
          blurTarget={blurTargetRef}
          onActionPress={handleActionPress}
          onChange={handleTabChange}
        />
      </View>
    </View>
  );
}
