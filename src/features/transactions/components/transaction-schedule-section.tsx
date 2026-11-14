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
              backgroundColor: isToday ? theme.accent : theme.surfaceSecondary,
              opacity: pressed ? 0.72 : 1,
            },
          ]}
        >
          <Text
            numberOfLines={1}
            style={[
              styles.pillText,
              { color: isToday ? theme.accentForeground : theme.foreground },
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
              backgroundColor: isYesterday ? theme.accent : theme.surfaceSecondary,
              opacity: pressed ? 0.72 : 1,
            },
          ]}
        >
          <Text
            numberOfLines={1}
            style={[
              styles.pillText,
              { color: isYesterday ? theme.accentForeground : theme.foreground },
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
              backgroundColor: isCustomDate ? theme.accent : theme.surfaceSecondary,
              opacity: pressed ? 0.72 : 1,
            },
          ]}
        >
          <FilledIcon
            color={isCustomDate ? theme.accentForeground : theme.muted}
            name="calendar"
            size={15}
          />
          <Text
            numberOfLines={1}
            style={[
              styles.calendarText,
              { color: isCustomDate ? theme.accentForeground : theme.foreground },
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
          <FilledIcon name="clock" size={18} tone="muted" />
          <Text className="font-manrope-semibold text-[15px] text-foreground">
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
    padding: 14,
  },
  presetPill: {
    minHeight: 44,
    paddingHorizontal: 15,
    borderRadius: 14,
    borderCurve: "continuous",
    alignItems: "center",
    justifyContent: "center",
  },
  calendarPill: {
    flexGrow: 1,
    minWidth: 112,
    minHeight: 44,
    paddingHorizontal: 12,
    borderRadius: 14,
    borderCurve: "continuous",
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
  },
  pillText: {
    fontFamily: "Huninn_400Regular",
    fontSize: 14,
    lineHeight: 19,
  },
  calendarText: {
    fontFamily: "Huninn_400Regular",
    fontSize: 14,
    lineHeight: 19,
    fontVariant: ["tabular-nums"],
  },
  divider: {
    height: StyleSheet.hairlineWidth,
    marginHorizontal: 14,
  },
  timeRow: {
    minHeight: 52,
    paddingHorizontal: 16,
    paddingVertical: 10,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  timeValue: {
    fontFamily: "Huninn_400Regular",
    fontSize: 16,
    lineHeight: 21,
    fontVariant: ["tabular-nums"],
  },
});
