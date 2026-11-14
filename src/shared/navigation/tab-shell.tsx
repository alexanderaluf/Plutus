import { AppAlert } from "@/shared/ui/app-alert";
import { BlurTargetView } from "expo-blur";
import { usePathname, useRouter } from "expo-router";
import {
  TabList,
  Tabs,
  TabSlot,
  TabTrigger,
  useTabTrigger,
  type TabSlotProps,
} from "expo-router/ui";
import { useRef } from "react";
import { useTranslation } from "react-i18next";
import { StyleSheet, View, type ViewInstance } from "react-native";
import { Screen } from "react-native-screens";

import { BottomNavigation } from "./bottom-navigation";
import { getTabFromPathname, navigationItems } from "./navigation-config";
import { ProjectionPrewarm } from "./projection-prewarm";
import { TabActionProvider, useTabActionRegistry } from "./tab-actions";
import type { TabId } from "./types";
import { useAppThemeColors } from "@/shared/theme/app-theme";

/**
 * Visited tabs stay mounted, so switching back is instant: no remount, no
 * recomputed projections, no replayed entrance animations, and scroll/filter
 * state is preserved. Hidden tabs are frozen, so a save re-renders only the
 * visible tab; a frozen tab catches up once, from shared per-document caches,
 * when it is shown again.
 */
const renderTab: NonNullable<TabSlotProps["renderFn"]> = (
  descriptor,
  { isFocused, loaded, detachInactiveScreens },
) => {
  // Lazy: a tab is mounted on its first visit, then kept.
  if (!loaded && !isFocused) return null;
  return (
    <Screen
      key={descriptor.route.key}
      enabled={detachInactiveScreens}
      activityState={isFocused ? 2 : 0}
      freezeOnBlur
      style={[styles.screen, isFocused ? styles.focused : styles.unfocused]}
    >
      {descriptor.render()}
    </Screen>
  );
};

export function TabShell() {
  return (
    <Tabs options={{ backBehavior: "initialRoute" }}>
      {/* Declares the tab routes; the visible bar is BottomNavigation. */}
      <TabList style={styles.hidden}>
        {navigationItems.map((item) => (
          <TabTrigger key={item.id} name={item.id} href={item.href} />
        ))}
      </TabList>
      <TabShellContent />
    </Tabs>
  );
}

function TabShellContent() {
  const { t } = useTranslation();
  const blurTargetRef = useRef<ViewInstance | null>(null);
  const theme = useAppThemeColors();
  const pathname = usePathname();
  const router = useRouter();
  const activeItem = getTabFromPathname(pathname);
  const tabActions = useTabActionRegistry();
  const { switchTab } = useTabTrigger({ name: activeItem });

  function handleTabChange(tabId: TabId) {
    if (tabId !== activeItem) switchTab(tabId, {});
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
            <TabSlot renderFn={renderTab} />
          </TabActionProvider>
        </BlurTargetView>

        <BottomNavigation
          activeItem={activeItem}
          blurTarget={blurTargetRef}
          onActionPress={handleActionPress}
          onChange={handleTabChange}
        />
      </View>
      <ProjectionPrewarm activeTab={activeItem} />
    </View>
  );
}

const styles = StyleSheet.create({
  hidden: { display: "none" },
  screen: { flex: 1, position: "relative", height: "100%" },
  focused: { zIndex: 1, display: "flex", flexShrink: 0, flexGrow: 1 },
  unfocused: { zIndex: -1, display: "none", flexShrink: 1, flexGrow: 0 },
});
