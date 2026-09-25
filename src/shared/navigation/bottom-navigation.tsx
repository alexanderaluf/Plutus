import { BottomSafeAreaGradient } from "@/shared/ui/safe-area-gradients";
import { BlurView } from "expo-blur";
import { useEffect, useRef, useState, type RefObject } from "react";
import { useTranslation } from "react-i18next";
import { Pressable, StyleSheet, View } from "react-native";
import Animated, {
  Easing,
  runOnJS,
  useAnimatedStyle,
  useSharedValue,
  withTiming,
} from "react-native-reanimated";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { Text } from "@/shared/ui/app-text";
import { FilledIcon, type FilledIconName } from "@/shared/ui/filled-icon";
import { colorWithAlpha, useAppThemeColors } from "@/shared/theme/app-theme";
import {
  SlidingIndicator,
  useIndicatorFrames,
} from "@/shared/ui/sliding-indicator";

import { navigationItems } from "./navigation-config";
import type { TabId } from "./types";

type BottomNavigationProps = {
  activeItem: TabId;
  blurTarget: RefObject<View | null>;
  onChange: (item: TabId) => void;
  onActionPress: (item: TabId) => void;
};

const actionIcons = {
  home: "plus-thick",
  accounts: "credit-card-plus",
  reports: "filter",
  search: "magnify",
} satisfies Record<TabId, FilledIconName>;

export function BottomNavigation({
  activeItem,
  blurTarget,
  onChange,
  onActionPress,
}: BottomNavigationProps) {
  const { t } = useTranslation();
  const insets = useSafeAreaInsets();
  const colors = useAppThemeColors();
  const { frames: tabFrames, onItemLayout } = useIndicatorFrames<TabId>();
  const actionOpacity = useSharedValue(1);
  const actionTranslateY = useSharedValue(0);
  const [displayedActionItem, setDisplayedActionItem] =
    useState<TabId>(activeItem);
  const targetActionItem = useRef(activeItem);
  const actionIcon = actionIcons[displayedActionItem];
  const tabLabels: Record<TabId, string> = {
    home: t("navigation.tabs.home"),
    accounts: t("navigation.tabs.accounts"),
    reports: t("navigation.tabs.reports"),
    search: t("navigation.tabs.search"),
  };
  const actionLabels: Record<TabId, string> = {
    home: t("navigation.actions.addTransaction"),
    accounts: t("navigation.actions.addAccount"),
    reports: t("navigation.actions.filterReports"),
    search: t("navigation.actions.openSearch"),
  };

  useEffect(() => {
    if (activeItem === displayedActionItem) return;

    targetActionItem.current = activeItem;
    actionTranslateY.value = withTiming(12, {
      duration: 150,
      easing: Easing.in(Easing.cubic),
    });
    actionOpacity.value = withTiming(
      0,
      { duration: 120, easing: Easing.in(Easing.quad) },
      (finished) => {
        if (finished) runOnJS(showNextActionIcon)();
      },
    );
  }, [activeItem, actionOpacity, actionTranslateY, displayedActionItem]);

  function showNextActionIcon() {
    setDisplayedActionItem(targetActionItem.current);
    actionTranslateY.value = -12;

    requestAnimationFrame(() => {
      actionTranslateY.value = withTiming(0, {
        duration: 220,
        easing: Easing.out(Easing.cubic),
      });
      actionOpacity.value = withTiming(1, {
        duration: 190,
        easing: Easing.out(Easing.quad),
      });
    });
  }

  const actionIconStyle = useAnimatedStyle(() => ({
    opacity: actionOpacity.value,
    transform: [{ translateY: actionTranslateY.value }],
  }));

  return (
    <>
      <BottomSafeAreaGradient fadeHeight={128} />

      <View style={[styles.dock, { bottom: Math.max(insets.bottom, 10) }]}>
        <View
          style={[
            styles.navigationPill,
            {
              backgroundColor: colorWithAlpha(colors.surface, 0.78),
              borderColor: colors.border,
            },
          ]}
        >
          <BlurView
            blurMethod="dimezisBlurViewSdk31Plus"
            blurReductionFactor={3}
            blurTarget={blurTarget}
            intensity={36}
            pointerEvents="none"
            style={StyleSheet.absoluteFill}
            tint={colors.isDark ? "dark" : "light"}
          />

          <View accessibilityRole="tablist" style={styles.tabsTrack}>
            <SlidingIndicator
              frame={tabFrames[activeItem]}
              style={[
                styles.activeIndicator,
                { backgroundColor: colorWithAlpha(colors.foreground, 0.14) },
              ]}
            />

            {navigationItems.map((item) => {
              const isActive = item.id === activeItem;

              return (
                <Pressable
                  key={item.id}
                  accessibilityLabel={tabLabels[item.id]}
                  accessibilityRole="tab"
                  accessibilityState={{ selected: isActive }}
                  hitSlop={4}
                  onLayout={(event) => onItemLayout(item.id, event)}
                  onPress={() => onChange(item.id)}
                  style={({ pressed }) => [
                    styles.tab,
                    pressed && styles.pressed,
                  ]}
                >
                  <FilledIcon
                    color={isActive ? colors.accent : colors.foreground}
                    name={item.icon}
                    size={24}
                    weight={
                      item.id === "reports" || item.id === "search" ? 600 : 400
                    }
                  />
                  <Text
                    allowFontScaling={false}
                    className="font-manrope-bold"
                    numberOfLines={1}
                    style={[
                      styles.label,
                      { color: isActive ? colors.accent : colors.foreground },
                    ]}
                  >
                    {tabLabels[item.id]}
                  </Text>
                </Pressable>
              );
            })}
          </View>
        </View>

        <Pressable
          accessibilityLabel={actionLabels[activeItem]}
          accessibilityRole="button"
          onPress={() => onActionPress(activeItem)}
          style={({ pressed }) => [
            styles.actionButton,
            { backgroundColor: colors.accent },
            pressed && styles.pressed,
          ]}
        >
          <Animated.View style={[styles.actionIcon, actionIconStyle]}>
            <FilledIcon
              color={colors.accentForeground}
              name={actionIcon}
              size={29}
              weight={
                displayedActionItem === "home" ||
                displayedActionItem === "search"
                  ? 600
                  : 400
              }
            />
          </Animated.View>
        </Pressable>
      </View>
    </>
  );
}

const styles = StyleSheet.create({
  dock: {
    alignItems: "center",
    flexDirection: "row",
    gap: 8,
    left: 0,
    paddingHorizontal: 12,
    position: "absolute",
    right: 0,
    zIndex: 20,
  },
  navigationPill: {
    alignItems: "stretch",
    backgroundColor: "transparent",
    borderRadius: 30,
    borderWidth: 1,
    flex: 1,
    flexDirection: "row",
    height: 58,
    overflow: "hidden",
  },
  tabsTrack: {
    flex: 1,
    flexDirection: "row",
    margin: 3,
  },
  tab: {
    alignItems: "center",
    borderRadius: 26,
    flex: 1,
    gap: 1,
    justifyContent: "center",
    minWidth: 0,
  },
  activeIndicator: {
    borderRadius: 26,
  },
  label: {
    fontSize: 10.5,
    lineHeight: 14,
    textAlign: "center",
    width: "100%",
  },
  actionButton: {
    alignItems: "center",
    borderRadius: 29,
    height: 58,
    justifyContent: "center",
    overflow: "hidden",
    width: 58,
  },
  actionIcon: {
    alignItems: "center",
    justifyContent: "center",
  },
  pressed: { opacity: 0.72 },
});
