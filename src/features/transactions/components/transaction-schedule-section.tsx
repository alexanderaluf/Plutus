import { useCalendars } from "expo-localization";
import { useTranslation } from "react-i18next";
import { Keyboard, Pressable, StyleSheet, View } from "react-native";

import type { AppDateFormat } from "@/data/model/backup-document";
import { formatAppDate } from "@/data/model/onboarding";
import { useAppLocalization } from "@/localization/localization-provider";
import { colorWithAlpha, useAppThemeColors } from "@/shared/theme/app-theme";
import { Text } from "@/shared/ui/app-text";
import { DateTimePopover } from "@/shared/ui/date-time-popover";
import { FilledIcon } from "@/shared/ui/filled-icon";

import {
  formatTransactionTime,
  isTodayDate,
  isYesterdayDate,
} from "../transaction-form-helpers";

type TransactionScheduleSectionProps = {
  date: Date;
  dateFormat: AppDateFormat;
  activePickerMode: "date" | "time" | null;
  disabled?: boolean;
  onQuickPreset: (preset: "today" | "yesterday") => void;
  onOpenPicker: (mode: "date" | "time") => void;
  onDismissPicker: (mode: "date" | "time") => void;
  onUpdateDateTime: (mode: "date" | "time", value: Date) => void;
};

/**
 * Onboarding-compliant Date & Time selector:
 * Formats dates strictly via `_local.dateFormat`, localizes time, and adds
 * one-tap Today / Yesterday shortcuts ahead of the native calendar/time pickers.
 */
export function TransactionScheduleSection({
  date,
  dateFormat,
  activePickerMode,
  disabled = false,
  onQuickPreset,
  onOpenPicker,
  onDismissPicker,
  onUpdateDateTime,
}: TransactionScheduleSectionProps) {
  const { t, i18n } = useTranslation();
  const calendars = useCalendars();
  const { direction } = useAppLocalization();
  const theme = useAppThemeColors();

  const formattedDate = formatAppDate(date, dateFormat);
  const formattedTime = formatTransactionTime(
    date,
    i18n.resolvedLanguage,
    calendars[0]?.uses24hourClock,
  );
  const isToday = isTodayDate(date);
  const isYesterday = isYesterdayDate(date);
  const isCustomDate = !isToday && !isYesterday;

  return (
    <View
      style={[
        styles.card,
        {
          backgroundColor: theme.surface,
          borderColor: theme.border,
          direction,
        },
      ]}
    >
      {/* Quick Date Bar */}
      <View style={styles.dayRow}>
        <Pressable
          accessibilityLabel={t("search.results.today")}
          accessibilityRole="radio"
          accessibilityState={{ checked: isToday, disabled }}
          disabled={disabled}
          onPress={() => {
            Keyboard.dismiss();
            onQuickPreset("today");
          }}
          style={({ pressed }) => [
            styles.presetPill,
            {
              backgroundColor: isToday
                ? colorWithAlpha(theme.accent, theme.isDark ? 0.22 : 0.13)
                : theme.surfaceSecondary,
              borderColor: isToday
                ? theme.accent
                : colorWithAlpha(theme.border, 0.75),
              borderWidth: isToday ? 1.5 : 1,
              opacity: pressed ? 0.72 : 1,
            },
          ]}
        >
          <Text
            numberOfLines={1}
            style={[
              styles.pillText,
              { color: isToday ? theme.accent : theme.foreground },
            ]}
          >
            {t("search.results.today")}
          </Text>
        </Pressable>

        <Pressable
          accessibilityLabel={t("search.results.yesterday")}
          accessibilityRole="radio"
          accessibilityState={{ checked: isYesterday, disabled }}
          disabled={disabled}
          onPress={() => {
            Keyboard.dismiss();
            onQuickPreset("yesterday");
          }}
          style={({ pressed }) => [
            styles.presetPill,
            {
              backgroundColor: isYesterday
                ? colorWithAlpha(theme.accent, theme.isDark ? 0.22 : 0.13)
                : theme.surfaceSecondary,
              borderColor: isYesterday
                ? theme.accent
                : colorWithAlpha(theme.border, 0.75),
              borderWidth: isYesterday ? 1.5 : 1,
              opacity: pressed ? 0.72 : 1,
            },
          ]}
        >
          <Text
            numberOfLines={1}
            style={[
              styles.pillText,
              { color: isYesterday ? theme.accent : theme.foreground },
            ]}
          >
            {t("search.results.yesterday")}
          </Text>
        </Pressable>

        <Pressable
          accessibilityLabel={t("transactions.form.changeDate", {
            date: formattedDate,
          })}
          accessibilityRole="button"
          accessibilityState={{ disabled }}
          disabled={disabled}
          onPress={() => {
            Keyboard.dismiss();
            onOpenPicker("date");
          }}
          style={({ pressed }) => [
            styles.calendarPill,
            {
              backgroundColor: isCustomDate
                ? colorWithAlpha(theme.accent, theme.isDark ? 0.22 : 0.13)
                : theme.surfaceSecondary,
              borderColor: isCustomDate
                ? theme.accent
                : colorWithAlpha(theme.border, 0.75),
              borderWidth: isCustomDate ? 1.5 : 1,
              opacity: pressed ? 0.72 : 1,
            },
          ]}
        >
          <FilledIcon
            color={isCustomDate ? theme.accent : theme.muted}
            name="calendar"
            size={15}
          />
          <Text
            numberOfLines={1}
            style={[
              styles.calendarText,
              { color: isCustomDate ? theme.accent : theme.foreground },
            ]}
          >
            {formattedDate}
          </Text>
          <DateTimePopover
            accentColor={theme.accent}
            isDark={theme.isDark}
            isPresented={activePickerMode === "date"}
            maximumDate={new Date()}
            mode="date"
            title={t("transactions.form.date")}
            value={date}
            onDismiss={() => onDismissPicker("date")}
            onValueChange={(value) => onUpdateDateTime("date", value)}
          />
        </Pressable>
      </View>

      <View
        style={[
          styles.divider,
          { backgroundColor: colorWithAlpha(theme.border, 0.75) },
        ]}
      />

      {/* Localized Time Row */}
      <Pressable
        accessibilityLabel={t("transactions.form.changeTime", {
          time: formattedTime,
        })}
        accessibilityRole="button"
        accessibilityState={{ disabled }}
        disabled={disabled}
        onPress={() => {
          Keyboard.dismiss();
          onOpenPicker("time");
        }}
        style={({ pressed }) => [
          styles.timeRow,
          { opacity: pressed ? 0.68 : 1 },
        ]}
      >
        <View className="flex-row items-center gap-2.5">
          <FilledIcon name="clock" size={17} tone="muted" />
          <Text className="font-manrope-medium text-sm text-muted">
            {t("transactions.form.time")}
          </Text>
        </View>

        <View className="flex-row items-center gap-1.5">
          <Text style={[styles.timeValue, { color: theme.foreground }]}>
            {formattedTime}
          </Text>
          <FilledIcon name="chevron-right" size={16} tone="muted" />
        </View>

        <DateTimePopover
          accentColor={theme.accent}
          isDark={theme.isDark}
          isPresented={activePickerMode === "time"}
          maximumDate={new Date()}
          mode="time"
          title={t("transactions.form.time")}
          value={date}
          onDismiss={() => onDismissPicker("time")}
          onValueChange={(value) => onUpdateDateTime("time", value)}
        />
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    borderRadius: 24,
    borderCurve: "continuous",
    borderWidth: 1,
    overflow: "hidden",
  },
  dayRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    alignItems: "center",
    gap: 8,
    padding: 12,
  },
  presetPill: {
    minHeight: 42,
    paddingHorizontal: 13,
    borderRadius: 16,
    borderCurve: "continuous",
    alignItems: "center",
    justifyContent: "center",
  },
  calendarPill: {
    flexGrow: 1,
    minWidth: 112,
    minHeight: 42,
    paddingHorizontal: 11,
    borderRadius: 16,
    borderCurve: "continuous",
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
  },
  pillText: {
    fontFamily: "Huninn_400Regular",
    fontSize: 13.5,
    lineHeight: 18,
  },
  calendarText: {
    fontFamily: "Huninn_400Regular",
    fontSize: 13.5,
    lineHeight: 18,
    fontVariant: ["tabular-nums"],
  },
  divider: {
    height: StyleSheet.hairlineWidth,
    marginHorizontal: 14,
  },
  timeRow: {
    minHeight: 48,
    paddingHorizontal: 14,
    paddingVertical: 10,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  timeValue: {
    fontFamily: "Huninn_400Regular",
    fontSize: 15,
    lineHeight: 20,
    fontVariant: ["tabular-nums"],
  },
});
