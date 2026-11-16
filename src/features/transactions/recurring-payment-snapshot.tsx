import { Pressable, View } from "react-native";
import { useTranslation } from "react-i18next";
import type { selectRecurringTransactionSnapshot } from "@/data/selectors/recurring-selectors";
import { useCurrencyFormat } from "@/shared/lib/use-currency-format";
import { useAppDate } from "@/shared/lib/use-app-date";
import { colorWithAlpha, useAppThemeColors } from "@/shared/theme/app-theme";
import { Text } from "@/shared/ui/app-text";
import { FilledIcon, type FilledIconName } from "@/shared/ui/filled-icon";

type RecurringTransactionSnapshot = NonNullable<
  ReturnType<typeof selectRecurringTransactionSnapshot>
>;

/** Layout direction of the sheet, which may differ from the native one. */
export type SheetDirection = {
  row: "row" | "row-reverse";
  start: "left" | "right";
  end: "left" | "right";
  writingDirection: "ltr" | "rtl";
};

const TABULAR = { fontVariant: ["tabular-nums" as const] };
const CONTINUOUS = { borderCurve: "continuous" as const };
const DAY_MS = 86_400_000;
const WARNING = "#f59e0b";
/** Width of the step rail; text never shares this column. */
const RAIL = 28;

function validTime(value: string | null) {
  const time = value ? new Date(value).getTime() : NaN;
  return Number.isFinite(time) ? time : null;
}

type Step = {
  key: string;
  icon: FilledIconName;
  color: string;
  /** One wrapping line, e.g. "Due · Fri 12 Sep, 08:00". */
  title: string;
  /** Large figure on its own line; wraps rather than shrinking. */
  value?: string;
  /** Read left-to-right even in RTL (amounts, rates). */
  valueIsNumeric?: boolean;
  note?: string;
  badge?: { label: string; color: string };
};

/**
 * A scheduled payment told as it happened, top to bottom: it fell due, was
 * converted when the currency differs, and was recorded — on time or late.
 * Every line spans the full width and wraps, so long translations and large
 * amounts never collide with anything.
 */
export function RecurringPaymentSnapshot({
  snapshot,
  direction,
  schedule,
  onOpenSchedule,
}: {
  snapshot: RecurringTransactionSnapshot | null;
  direction: SheetDirection;
  /** The schedule this payment came from, when it still exists. */
  schedule?: { name: string; period: string } | null;
  onOpenSchedule?: () => void;
}) {
  const { formatCurrency } = useCurrencyFormat();
  const { formatDate } = useAppDate();
  const { t, i18n } = useTranslation();
  const theme = useAppThemeColors();
  if (!snapshot) return null;
  const { row, start, writingDirection } = direction;

  const moment = (time: number) => {
    const date = new Date(time);
    return `${date.toLocaleDateString(i18n.resolvedLanguage, {
      weekday: "short",
    })} ${formatDate(date)}, ${date.toLocaleTimeString(
      i18n.resolvedLanguage,
      { timeStyle: "short" },
    )}`;
  };
  const titled = (label: string, time: number | null) =>
    time === null ? label : `${label} · ${moment(time)}`;

  const scheduled = validTime(snapshot.scheduledAt);
  const recorded = validTime(snapshot.recordedAt);
  const daysLate =
    scheduled !== null && recorded !== null
      ? Math.floor((recorded - scheduled) / DAY_MS)
      : null;
  const onTime = daysLate === null || daysLate < 1;
  const converted =
    snapshot.originalCurrency !== snapshot.currency ||
    snapshot.originalAmount !== snapshot.amount;
  const rateTime = validTime(snapshot.rateDate);
  const rateDate =
    rateTime !== null ? formatDate(new Date(rateTime)) : snapshot.rateDate;

  const steps: Step[] = [
    {
      key: "due",
      icon: "calendar",
      color: theme.muted,
      title: titled(t("recurring.snapshot.due"), scheduled),
      // Same currency: the amount is shown once, where it was recorded.
      value: converted
        ? formatCurrency(snapshot.originalAmount, snapshot.originalCurrency)
        : undefined,
      valueIsNumeric: true,
    },
    ...(converted && snapshot.rate !== null
      ? [
          {
            key: "rate",
            icon: "currency-exchange" as const,
            color: theme.accent,
            title: t("recurring.rate"),
            value: `1 ${snapshot.originalCurrency} = ${Number(
              snapshot.rate.toFixed(4),
            )} ${snapshot.currency}`,
            valueIsNumeric: true,
            note: rateDate
              ? t("recurring.snapshot.rateOf", { date: rateDate })
              : undefined,
          },
        ]
      : []),
    {
      key: "recorded",
      icon: "check",
      color: onTime ? theme.success : WARNING,
      title: titled(t("recurring.snapshot.recorded"), recorded),
      value: formatCurrency(snapshot.amount, snapshot.currency),
      valueIsNumeric: true,
      badge:
        daysLate === null
          ? undefined
          : {
              label: onTime
                ? t("recurring.snapshot.onTime")
                : t("recurring.snapshot.late", { count: daysLate }),
              color: onTime ? theme.success : WARNING,
            },
    },
  ];

  const header = (
    <>
      <View
        className="size-10 shrink-0 items-center justify-center rounded-xl"
        style={{
          ...CONTINUOUS,
          backgroundColor: colorWithAlpha(theme.accent, 0.16),
        }}
      >
        <FilledIcon name="event-repeat" size={20} tone="accent" />
      </View>
      <View className="min-w-0 flex-1 gap-0.5">
        <Text
          className="font-manrope-semibold text-[16px] leading-[22px] text-foreground"
          style={{ textAlign: start, writingDirection }}
        >
          {schedule?.name || t("recurring.snapshot.heading")}
        </Text>
        {schedule?.period ? (
          <Text
            className="font-sans text-[13px] leading-[18px] text-muted"
            style={{ textAlign: start, writingDirection }}
          >
            {t(`recurring.periods.${schedule.period}`, {
              defaultValue: schedule.period,
            })}
          </Text>
        ) : null}
      </View>
      {onOpenSchedule ? (
        <FilledIcon name="chevron-right" size={18} tone="muted" />
      ) : null}
    </>
  );

  return (
    <View className="gap-4">
      {onOpenSchedule ? (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={schedule?.name || t("recurring.snapshot.heading")}
          onPress={onOpenSchedule}
          className="items-center gap-3"
          style={({ pressed }) => ({
            flexDirection: row,
            opacity: pressed ? 0.6 : 1,
          })}
        >
          {header}
        </Pressable>
      ) : (
        <View className="items-center gap-3" style={{ flexDirection: row }}>
          {header}
        </View>
      )}

      <View>
        {steps.map((step, index) => {
          const last = index === steps.length - 1;
          return (
            <View
              key={step.key}
              accessible
              className="gap-3"
              style={{ flexDirection: row }}
            >
              {/* Rail: the step's marker and the line to the next step. */}
              <View className="items-center" style={{ width: RAIL }}>
                <View
                  className="size-7 items-center justify-center rounded-full"
                  style={{ backgroundColor: colorWithAlpha(step.color, 0.16) }}
                >
                  <FilledIcon name={step.icon} size={15} color={step.color} />
                </View>
                {!last ? (
                  <View
                    className="my-1 w-0.5 flex-1 rounded-full"
                    style={{ backgroundColor: theme.border }}
                  />
                ) : null}
              </View>

              <View
                className="min-w-0 flex-1 gap-1"
                style={{ paddingBottom: last ? 0 : 18, paddingTop: 4 }}
              >
                <Text
                  className="font-sans text-[13px] leading-[18px] text-muted"
                  style={{ textAlign: start, writingDirection }}
                >
                  {step.title}
                </Text>
                {step.value || step.badge ? (
                  <View
                    className="flex-wrap items-center gap-x-2 gap-y-1"
                    style={{ flexDirection: row }}
                  >
                    {step.value ? (
                      <Text
                        selectable
                        className="shrink font-manrope-bold text-[18px] leading-[24px] text-foreground"
                        style={{
                          ...TABULAR,
                          textAlign: start,
                          writingDirection: step.valueIsNumeric
                            ? "ltr"
                            : writingDirection,
                        }}
                      >
                        {step.value}
                      </Text>
                    ) : null}
                    {step.badge ? (
                      <View
                        className="rounded-full px-2.5 py-0.5"
                        style={{
                          backgroundColor: colorWithAlpha(
                            step.badge.color,
                            0.16,
                          ),
                        }}
                      >
                        <Text
                          className="font-manrope-bold text-[12px] leading-[17px]"
                          style={{
                            color: step.badge.color,
                            writingDirection,
                          }}
                        >
                          {step.badge.label}
                        </Text>
                      </View>
                    ) : null}
                  </View>
                ) : null}
                {step.note ? (
                  <Text
                    className="font-sans text-[12px] leading-[17px] text-muted"
                    style={{ textAlign: start, writingDirection }}
                  >
                    {step.note}
                  </Text>
                ) : null}
              </View>
            </View>
          );
        })}
      </View>
    </View>
  );
}
