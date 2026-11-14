import { BlurView } from "expo-blur";
import type { RefObject } from "react";
import {
  Platform,
  Pressable,
  StyleSheet,
  View,
  type ViewInstance,
} from "react-native";
import { useTranslation } from "react-i18next";

import { formatAppDate } from "@/data/model/onboarding";
import type { AppDateFormat } from "@/data/model/backup-document";
import { Text } from "@/shared/ui/app-text";
import { FilledIcon } from "@/shared/ui/filled-icon";
import { colorWithAlpha, useAppThemeColors } from "@/shared/theme/app-theme";

type Props = {
  start: Date;
  end: Date;
  isCurrent: boolean;
  dateFormat: AppDateFormat;
  onPrevious: () => void;
  onNext: () => void;
  /**
   * The content this picker floats over. Android can only blur a
   * `BlurTargetView` that is not an ancestor of the picker; iOS needs none.
   */
  blurTarget?: RefObject<ViewInstance | null>;
};

export function TransactionMonthSelector({
  start,
  end,
  isCurrent,
  dateFormat,
  onPrevious,
  onNext,
  blurTarget,
}: Props) {
  const { i18n, t } = useTranslation();
  const colors = useAppThemeColors();
  const lastDay = new Date(
    end.getFullYear(),
    end.getMonth(),
    end.getDate() - 1,
  );
  const label = isCurrent
    ? t("home.monthSelector.thisMonth")
    : start.toLocaleDateString(i18n.resolvedLanguage, {
        month: "long",
        ...(start.getFullYear() !== new Date().getFullYear()
          ? { year: "numeric" }
          : {}),
      });
  const range = `${formatAppDate(start, dateFormat)} – ${formatAppDate(lastDay, dateFormat)}`;

  return (
    <View
      style={[
        styles.container,
        {
          backgroundColor: colorWithAlpha(colors.surface, 0.78),
          borderColor: colors.border,
        },
      ]}
    >
      {/* Same frosted glass as the bottom navigation. */}
      {Platform.OS === "ios" || blurTarget ? (
        <BlurView
          blurMethod={
            Platform.OS === "android" ? "dimezisBlurViewSdk31Plus" : undefined
          }
          blurReductionFactor={3}
          blurTarget={blurTarget}
          intensity={36}
          pointerEvents="none"
          style={StyleSheet.absoluteFill}
          tint={colors.isDark ? "dark" : "light"}
        />
      ) : null}
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={t("home.monthSelector.previousMonth")}
        onPress={onPrevious}
        style={({ pressed }) => [
          styles.arrow,
          {
            backgroundColor: colors.surfaceSecondary,
            opacity: pressed ? 0.6 : 1,
          },
        ]}
      >
        <FilledIcon name="arrow-left" size={20} />
      </Pressable>
      <View
        style={styles.label}
        accessible
        accessibilityLabel={`${label}, ${range}`}
        accessibilityLiveRegion="polite"
      >
        <Text
          className="font-manrope-semibold text-sm text-foreground"
          style={styles.center}
        >
          {label}
        </Text>
        <Text
          className="mt-0.5 font-sans text-[10px] text-muted"
          style={styles.center}
        >
          {range}
        </Text>
      </View>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={t("home.monthSelector.nextMonth")}
        accessibilityState={{ disabled: isCurrent }}
        disabled={isCurrent}
        onPress={onNext}
        style={({ pressed }) => [
          styles.arrow,
          {
            backgroundColor: colors.surfaceSecondary,
            opacity: isCurrent ? 0.3 : pressed ? 0.6 : 1,
          },
        ]}
      >
        <FilledIcon
          name="arrow-left"
          size={20}
          style={{ transform: [{ rotate: "180deg" }] }}
        />
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flexDirection: "row",
    alignItems: "center",
    borderWidth: 1,
    borderRadius: 999,
    marginTop: 8,
    overflow: "hidden",
    paddingHorizontal: 5,
    paddingVertical: 5,
  },
  arrow: {
    height: 44,
    width: 44,
    borderRadius: 999,
    alignItems: "center",
    justifyContent: "center",
  },
  label: { flex: 1, paddingVertical: 4 },
  center: { textAlign: "center" },
});
