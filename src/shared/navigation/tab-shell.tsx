import { BlurTargetView } from "expo-blur";
import { Slot, usePathname, useRouter } from "expo-router";
import { useRef } from "react";
import { useTranslation } from "react-i18next";
import { Alert, View } from "react-native";

import { BottomNavigation } from "./bottom-navigation";
import { getTabFromPathname, navigationItems } from "./navigation-config";
import type { TabId } from "./types";
import { useAppThemeColors } from "@/shared/theme/app-theme";

export function TabShell() {
  const { t } = useTranslation();
  const blurTargetRef = useRef<View | null>(null);
  const theme = useAppThemeColors();
  const pathname = usePathname();
  const router = useRouter();
  const activeItem = getTabFromPathname(pathname);

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
    const action =
      tabId === "reports"
        ? t("navigation.actions.filterReports")
        : t("navigation.actions.searchTransactions");
    Alert.alert(action, t("navigation.actions.unavailable", { action }));
  }

  return (
    <View style={{ flex: 1, backgroundColor: theme.background }}>
      <View style={{ flex: 1 }}>
        <BlurTargetView ref={blurTargetRef} style={{ flex: 1 }}>
          <Slot />
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
