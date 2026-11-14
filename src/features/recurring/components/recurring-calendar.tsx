import { Button } from "heroui-native";
import { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { Pressable, View } from "react-native";
import { getCalendarOffset } from "@/data/model/onboarding";
import {
  localDateKey,
  recurringTotals,
  selectRecurringEvents,
  type Recurring,
  type RecurringEvent,
} from "@/data/selectors/recurring-selectors";
import { useAppDate } from "@/shared/lib/use-app-date";
import { useCurrencyFormat } from "@/shared/lib/use-currency-format";
import { useAppThemeColors } from "@/shared/theme/app-theme";
import { Text } from "@/shared/ui/app-text";
import { FilledIcon } from "@/shared/ui/filled-icon";
import { CONTINUOUS, TABULAR } from "@/shared/ui/form-ui";
import { RecurringRow, RecurringSection } from "./recurring-card";

const CELL = "14.2857%";

function DayTotals({ events }: { events: RecurringEvent[] }) {
  const c = useAppThemeColors();
  const { formatSignedCurrency } = useCurrencyFormat();
  const counted = events.filter((e) => e.status !== "skipped");
  const lines = [
    ...recurringTotals(counted.filter((e) => e.type === 1)).map((v) => ({
      ...v,
      color: c.success,
    })),
    ...recurringTotals(counted.filter((e) => e.type === 0)).map((v) => ({
      ...v,
      amount: -v.amount,
      color: c.danger,
    })),
  ];
  if (!lines.length) return null;
  return (
    <View className="shrink flex-row flex-wrap justify-end gap-x-2.5">
      {lines.map((line, index) => (
        <Text
          key={index}
          className="font-manrope-bold text-sm"
          style={{ ...TABULAR, color: line.color, writingDirection: "ltr" }}
        >
          {formatSignedCurrency(line.amount, line.currencyCode)}
        </Text>
      ))}
    </View>
  );
}

/**
 * Month grid with a coloured dot per payment, and the chosen day's payments
 * listed underneath. Tapping a recorded payment opens its transaction; any
 * other payment opens its schedule.
 */
export function RecurringCalendar({
  items,
  now,
  weekStartDay,
  onOpenRecurring,
  onOpenTransaction,
}: {
  items: Recurring[];
  now: Date;
  weekStartDay: number;
  onOpenRecurring: (id: string) => void;
  onOpenTransaction: (id: string) => void;
}) {
  const c = useAppThemeColors(),
    { t, i18n } = useTranslation();
  const { formatDayMonth } = useAppDate();
  const [month, setMonth] = useState(
    () => new Date(now.getFullYear(), now.getMonth(), 1),
  );
  const [day, setDay] = useState(() => localDateKey(now));
  const todayKey = localDateKey(now);
  const events = useMemo(
    () =>
      selectRecurringEvents(
        items,
        month,
        new Date(month.getFullYear(), month.getMonth() + 1, 1),
      ),
    [items, month],
  );
  const byDay = useMemo(() => {
    const map = new Map<string, RecurringEvent[]>();
    for (const event of events) {
      const key = localDateKey(event.date);
      map.set(key, [...(map.get(key) ?? []), event]);
    }
    return map;
  }, [events]);
  const selectedEvents = byDay.get(day) ?? [];
  const selectedDate = new Date(`${day}T12:00:00`);
  const offset = getCalendarOffset(month, weekStartDay);
  const daysInMonth = new Date(
    month.getFullYear(),
    month.getMonth() + 1,
    0,
  ).getDate();
  const shift = (amount: number) => {
    const next = new Date(month.getFullYear(), month.getMonth() + amount, 1);
    setMonth(next);
    // Land on today when returning to the current month, else the 1st.
    setDay(
      next.getFullYear() === now.getFullYear() &&
        next.getMonth() === now.getMonth()
        ? todayKey
        : localDateKey(next),
    );
  };
  const showingToday = day === todayKey;
  const statusFor = (event: RecurringEvent) =>
    event.status === "processed"
      ? { label: t("recurring.processed"), tone: "success" as const }
      : event.status === "skipped"
        ? { label: t("recurring.skipped"), tone: "muted" as const }
        : event.date <= now
          ? { label: t("recurring.overdue"), tone: "danger" as const }
          : { label: t("recurring.pending"), tone: "muted" as const };
  return (
    <>
      <View
        className="gap-1 rounded-[28px] border border-border bg-surface px-2 pb-3 pt-2"
        style={CONTINUOUS}
      >
        <View className="flex-row items-center gap-1 ps-3">
          <Text
            accessibilityRole="header"
            numberOfLines={1}
            className="flex-1 font-manrope-bold text-xl text-foreground"
          >
            {month.toLocaleDateString(i18n.resolvedLanguage, {
              month: "long",
              year: "numeric",
            })}
          </Text>
          {!showingToday && (
            <Pressable
              accessibilityRole="button"
              onPress={() => {
                setMonth(new Date(now.getFullYear(), now.getMonth(), 1));
                setDay(todayKey);
              }}
              hitSlop={6}
              className="rounded-full px-3 py-1.5"
              style={{ backgroundColor: c.surfaceSecondary }}
            >
              <Text className="font-manrope-semibold text-[13px] text-accent">
                {t("recurring.today")}
              </Text>
            </Pressable>
          )}
          <Button
            isIconOnly
            variant="ghost"
            accessibilityLabel={t("recurring.previousMonth")}
            onPress={() => shift(-1)}
          >
            <FilledIcon
              name="chevron-right"
              style={{ transform: [{ rotate: "180deg" }] }}
              tone="accent"
              size={26}
            />
          </Button>
          <Button
            isIconOnly
            variant="ghost"
            accessibilityLabel={t("recurring.nextMonth")}
            onPress={() => shift(1)}
          >
            <FilledIcon name="chevron-right" tone="accent" size={26} />
          </Button>
        </View>
        <View style={{ flexDirection: "row", flexWrap: "wrap" }}>
          {Array.from({ length: 7 }, (_, i) => (
            <View key={i} style={{ width: CELL, paddingVertical: 8 }}>
              <Text className="text-center font-manrope-semibold text-xs text-muted">
                {new Date(2026, 8, 6 + ((i + weekStartDay) % 7)).toLocaleDateString(
                  i18n.resolvedLanguage,
                  { weekday: "narrow" },
                )}
              </Text>
            </View>
          ))}
          {Array.from({ length: offset + daysInMonth }, (_, index) => {
            const date = index - offset + 1;
            if (date <= 0)
              return <View key={index} style={{ width: CELL, height: 52 }} />;
            const current = new Date(
              month.getFullYear(),
              month.getMonth(),
              date,
            );
            const key = localDateKey(current);
            const entries = (byDay.get(key) ?? []).filter(
              (e) => e.status !== "skipped",
            );
            const selected = key === day,
              today = key === todayKey;
            return (
              <Pressable
                key={index}
                accessibilityRole="button"
                accessibilityState={{ selected }}
                accessibilityLabel={`${current.toLocaleDateString(i18n.resolvedLanguage, { dateStyle: "full" })}, ${t("recurring.paymentsCount", { count: entries.length })}`}
                onPress={() => setDay(key)}
                style={{ width: CELL, height: 52, alignItems: "center" }}
              >
                <View
                  style={{
                    width: 36,
                    height: 36,
                    borderRadius: 18,
                    alignItems: "center",
                    justifyContent: "center",
                    backgroundColor: selected ? c.accent : "transparent",
                    borderWidth: today && !selected ? 1.5 : 0,
                    borderColor: c.accent,
                  }}
                >
                  <Text
                    className="font-manrope-semibold text-[15px]"
                    style={{
                      ...TABULAR,
                      color: selected
                        ? c.accentForeground
                        : today
                          ? c.accent
                          : c.foreground,
                    }}
                  >
                    {date}
                  </Text>
                </View>
                <View className="mt-1 h-1.5 flex-row gap-0.5">
                  {entries.slice(0, 3).map((e, i) => (
                    <View
                      key={i}
                      style={{
                        width: 5,
                        height: 5,
                        borderRadius: 3,
                        backgroundColor: e.recurring.color,
                      }}
                    />
                  ))}
                </View>
              </Pressable>
            );
          })}
        </View>
      </View>
      <RecurringSection
        title={`${selectedDate.toLocaleDateString(i18n.resolvedLanguage, { weekday: "long" })}, ${formatDayMonth(selectedDate)}`}
        action={<DayTotals events={selectedEvents} />}
        bare={!selectedEvents.length}
      >
        {selectedEvents.length ? (
          selectedEvents.map((event, index) => {
            const status = statusFor(event);
            return (
              <RecurringRow
                key={`${event.recurring.id}:${index}`}
                badge={event.recurring}
                title={event.recurring.name}
                subtitle={event.date.toLocaleTimeString(
                  i18n.resolvedLanguage,
                  { hour: "2-digit", minute: "2-digit" },
                )}
                subtitleIcon="clock"
                amount={event}
                caption={status.label}
                captionTone={status.tone}
                muted={event.status === "skipped"}
                onPress={() =>
                  event.transactionId
                    ? onOpenTransaction(event.transactionId)
                    : onOpenRecurring(event.recurring.id)
                }
              />
            );
          })
        ) : (
          <View
            className="items-center gap-2 rounded-[24px] border border-dashed border-border px-4 py-7"
            style={CONTINUOUS}
          >
            <FilledIcon name="event-repeat" size={28} tone="muted" />
            <Text className="text-center text-[15px] text-muted">
              {t("recurring.noDay")}
            </Text>
          </View>
        )}
      </RecurringSection>
    </>
  );
}
