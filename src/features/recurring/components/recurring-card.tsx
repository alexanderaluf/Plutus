import { Button } from "heroui-native";
import { Children, Fragment, type ReactNode } from "react";
import { useTranslation } from "react-i18next";
import { Pressable, StyleSheet, View } from "react-native";
import type { Recurring } from "@/data/selectors/recurring-selectors";
import { useAppDate } from "@/shared/lib/use-app-date";
import { useCurrencyFormat } from "@/shared/lib/use-currency-format";
import { colorWithAlpha, useAppThemeColors } from "@/shared/theme/app-theme";
import { Text } from "@/shared/ui/app-text";
import { FilledIcon, type FilledIconName } from "@/shared/ui/filled-icon";
import { CONTINUOUS, TABULAR } from "@/shared/ui/form-ui";
import { relativeDay } from "../lib/recurring-list-helpers";
import type { RecurringAction } from "../use-recurring-actions";
import { BusyButtonLabel, RecurringBadge } from "./recurring-ui";

const BADGE = 44;

/**
 * A signed, coloured amount. The sign and colour carry income vs expense, so
 * rows never need to spell the type out.
 */
export function RecurringAmount({
  amount,
  currencyCode,
  type,
  muted = false,
  size = "base",
}: {
  amount: number;
  currencyCode: string;
  type: number;
  muted?: boolean;
  size?: "base" | "lg" | "xl";
}) {
  const c = useAppThemeColors();
  const { formatSignedCurrency } = useCurrencyFormat();
  return (
    <Text
      numberOfLines={1}
      adjustsFontSizeToFit={size === "xl"}
      minimumFontScale={0.6}
      className={`font-manrope-bold ${
        size === "xl"
          ? "text-[34px] leading-[42px]"
          : size === "lg"
            ? "text-[17px]"
            : "text-[15px]"
      }`}
      style={{
        ...TABULAR,
        writingDirection: "ltr",
        color: muted ? c.muted : type === 1 ? c.success : c.danger,
      }}
    >
      {formatSignedCurrency(type === 1 ? amount : -amount, currencyCode)}
    </Text>
  );
}

/** "Today", "Tomorrow", "In 3 days", or the date for anything further out. */
export function useUpcomingLabel() {
  const { t } = useTranslation();
  const { formatDayMonth, formatDate } = useAppDate();
  return (date: Date, now: Date) => {
    const relative = relativeDay(date, now);
    if (relative)
      return t(`recurring.${relative.key}`, { count: relative.count });
    return date.getFullYear() === now.getFullYear()
      ? formatDayMonth(date)
      : formatDate(date);
  };
}

/** A titled group of rows: a quiet heading above one rounded surface. */
export function RecurringSection({
  title,
  count,
  action,
  bare = false,
  children,
}: {
  title?: string;
  count?: number;
  action?: ReactNode;
  /** Renders children as separate cards instead of one grouped surface. */
  bare?: boolean;
  children: ReactNode;
}) {
  const c = useAppThemeColors();
  const rows = Children.toArray(children);
  return (
    <View className="gap-2.5">
      {(title || action) && (
        <View className="min-h-9 flex-row items-center gap-2 px-1">
          {title ? (
            <Text
              accessibilityRole="header"
              className="font-manrope-bold text-[15px] text-foreground"
            >
              {title}
            </Text>
          ) : null}
          {count != null && (
            <View
              className="min-w-6 items-center rounded-full px-2 py-0.5"
              style={{ backgroundColor: c.surfaceSecondary }}
            >
              <Text
                className="font-manrope-bold text-xs text-muted"
                style={TABULAR}
              >
                {count}
              </Text>
            </View>
          )}
          <View className="flex-1" />
          {action}
        </View>
      )}
      {bare ? (
        <View className="gap-2.5">{rows}</View>
      ) : (
        <View
          className="overflow-hidden rounded-[24px] border border-border bg-surface"
          style={CONTINUOUS}
        >
          {rows.map((row, index) => (
            <Fragment key={index}>
              {index > 0 && (
                <View
                  style={{
                    height: StyleSheet.hairlineWidth,
                    backgroundColor: c.border,
                    marginStart: 16 + BADGE + 12,
                  }}
                />
              )}
              {row}
            </Fragment>
          ))}
        </View>
      )}
    </View>
  );
}

/** One schedule or payment inside a grouped section. */
export function RecurringRow({
  badge,
  title,
  subtitle,
  subtitleIcon,
  amount,
  caption,
  captionTone = "muted",
  muted = false,
  accessibilityLabel,
  onPress,
}: {
  badge: { icon: string; iconPath: string | null; color: string };
  title: string;
  subtitle: string;
  subtitleIcon?: FilledIconName;
  amount: { amount: number; currencyCode: string; type: number };
  caption?: string;
  captionTone?: "muted" | "accent" | "success" | "danger";
  muted?: boolean;
  accessibilityLabel?: string;
  onPress: () => void;
}) {
  const c = useAppThemeColors();
  const captionColor = {
    muted: c.muted,
    accent: c.accent,
    success: c.success,
    danger: c.danger,
  }[captionTone];
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel}
      onPress={onPress}
      style={({ pressed }) => ({
        flexDirection: "row",
        alignItems: "center",
        gap: 12,
        paddingHorizontal: 16,
        paddingVertical: 13,
        minHeight: 70,
        backgroundColor: pressed ? c.surfaceSecondary : "transparent",
      })}
    >
      <RecurringBadge item={badge} size={BADGE} muted={muted} />
      <View className="min-w-0 flex-1 gap-1">
        <Text
          numberOfLines={1}
          className="font-manrope-semibold text-base"
          style={{ color: muted ? c.muted : c.foreground }}
        >
          {title}
        </Text>
        <View className="flex-row items-center gap-1">
          {subtitleIcon && (
            <FilledIcon name={subtitleIcon} size={14} tone="muted" />
          )}
          <Text numberOfLines={1} className="shrink text-[13px] text-muted">
            {subtitle}
          </Text>
        </View>
      </View>
      <View className="max-w-[45%] items-end gap-1">
        <RecurringAmount {...amount} muted={muted} />
        {caption ? (
          <Text
            numberOfLines={1}
            className="font-manrope-semibold text-[13px]"
            style={{ color: captionColor }}
          >
            {caption}
          </Text>
        ) : null}
      </View>
    </Pressable>
  );
}

/** Frequency, plus "Auto" when payments record themselves. */
export function useScheduleSubtitle() {
  const { t } = useTranslation();
  return (item: Recurring) => {
    const period = t(`recurring.periods.${item.period}`, {
      defaultValue: String(item.period),
    });
    return item.automatic ? `${period} · ${t("recurring.auto")}` : period;
  };
}

/**
 * A schedule that needs a decision. It stands apart from the grouped list and
 * carries its own Skip / Process buttons, sized for a thumb.
 */
export function RecurringDueCard({
  item,
  now,
  dueCount,
  busyAction,
  disabled,
  onOpen,
  onProcess,
  onSkip,
}: {
  item: Recurring;
  now: Date;
  /** Unrecorded occurrences up to now for this schedule. */
  dueCount: number;
  /** The action running for this card; it shows the spinner. */
  busyAction: RecurringAction | null;
  /** True while any recurring occurrence is being written. */
  disabled: boolean;
  onOpen: () => void;
  onProcess: () => void;
  onSkip: () => void;
}) {
  const c = useAppThemeColors(),
    { t } = useTranslation();
  const { formatDayMonth, formatDate } = useAppDate();
  // A due card without a next date is an imported schedule that must be
  // edited before it can run; it gets a quieter, explanatory treatment.
  const configurable = item.due && !!item.next;
  const tone = configurable ? c.danger : c.accent;
  const dueDate = item.next
    ? item.next.getFullYear() === now.getFullYear()
      ? formatDayMonth(item.next)
      : formatDate(item.next)
    : "";
  return (
    <View
      className="gap-3 rounded-[24px] p-3"
      style={{
        ...CONTINUOUS,
        borderWidth: 1,
        borderColor: colorWithAlpha(tone, 0.32),
        backgroundColor: colorWithAlpha(tone, c.isDark ? 0.1 : 0.06),
      }}
    >
      <Pressable
        accessibilityRole="button"
        onPress={onOpen}
        style={({ pressed }) => ({
          opacity: pressed ? 0.7 : 1,
          flexDirection: "row",
          alignItems: "center",
          gap: 12,
          paddingHorizontal: 4,
          paddingTop: 4,
        })}
      >
        <RecurringBadge item={item} size={BADGE} />
        <View className="min-w-0 flex-1 gap-1">
          <Text
            numberOfLines={1}
            className="font-manrope-semibold text-base text-foreground"
          >
            {item.name}
          </Text>
          <View className="flex-row items-center gap-1">
            <FilledIcon
              name={configurable ? "clock" : "pencil"}
              size={14}
              tone={configurable ? "danger" : "accent"}
            />
            <Text
              numberOfLines={2}
              className="shrink font-manrope-semibold text-[13px]"
              style={{ color: tone }}
            >
              {configurable
                ? dueCount > 1
                  ? `${t("recurring.dueSince", { date: dueDate })} · ${t("recurring.waiting", { count: dueCount })}`
                  : t("recurring.dueSince", { date: dueDate })
                : t("recurring.unsupported")}
            </Text>
          </View>
        </View>
        <RecurringAmount
          amount={item.amount}
          currencyCode={item.currencyCode}
          type={item.type}
        />
      </Pressable>
      {configurable && (
        <View className="flex-row gap-2">
          <Button
            variant="secondary"
            className="flex-1"
            isDisabled={disabled}
            accessibilityState={{ busy: busyAction === "skip" }}
            onPress={onSkip}
          >
            <BusyButtonLabel
              label={t("recurring.skip")}
              busy={busyAction === "skip"}
              spinnerColor={c.accent}
            />
          </Button>
          <Button
            variant="primary"
            className="flex-[2]"
            isDisabled={disabled}
            accessibilityState={{ busy: busyAction === "process" }}
            onPress={onProcess}
          >
            <BusyButtonLabel
              label={t("recurring.process")}
              busy={busyAction === "process"}
              spinnerColor={c.accentForeground}
            />
          </Button>
        </View>
      )}
    </View>
  );
}
