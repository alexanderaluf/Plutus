import { useState } from "react";
import { useTranslation } from "react-i18next";
import { Pressable, View } from "react-native";
import type { selectRecurringSummary } from "@/data/selectors/recurring-selectors";
import { useCurrencyFormat } from "@/shared/lib/use-currency-format";
import { colorWithAlpha, useAppThemeColors } from "@/shared/theme/app-theme";
import { Text } from "@/shared/ui/app-text";
import { FilledIcon, type FilledIconName } from "@/shared/ui/filled-icon";
import { CONTINUOUS, FormDivider, TABULAR } from "@/shared/ui/form-ui";

type Summary = ReturnType<typeof selectRecurringSummary>;
type Money = { amount: number; currencyCode: string };
type Unit = "month" | "year";

function Amounts({
  values,
  signed = false,
  color,
  className,
}: {
  values: Money[];
  signed?: boolean;
  color: string;
  className: string;
}) {
  const { formatCurrency, formatSignedCurrency } = useCurrencyFormat();
  return (
    <View className="min-w-0 gap-0.5">
      {values.map((value) => (
        <Text
          key={value.currencyCode}
          numberOfLines={1}
          adjustsFontSizeToFit
          minimumFontScale={0.6}
          className={className}
          style={{ ...TABULAR, color, writingDirection: "ltr" }}
        >
          {signed
            ? formatSignedCurrency(value.amount, value.currencyCode)
            : formatCurrency(value.amount, value.currencyCode)}
        </Text>
      ))}
    </View>
  );
}

function UnitToggle({
  value,
  onChange,
}: {
  value: Unit;
  onChange: (value: Unit) => void;
}) {
  const c = useAppThemeColors(),
    { t } = useTranslation();
  const options: [Unit, string][] = [
    ["month", t("recurring.periods.Monthly")],
    ["year", t("recurring.periods.Yearly")],
  ];
  return (
    <View
      accessibilityRole="tablist"
      className="flex-row rounded-full p-1"
      style={{ backgroundColor: c.surfaceSecondary }}
    >
      {options.map(([option, label]) => {
        const selected = option === value;
        return (
          <Pressable
            key={option}
            accessibilityRole="tab"
            accessibilityState={{ selected }}
            onPress={() => onChange(option)}
            hitSlop={6}
            className="rounded-full px-3 py-1.5"
            style={{ backgroundColor: selected ? c.accent : "transparent" }}
          >
            <Text
              className="font-manrope-semibold text-xs"
              style={{ color: selected ? c.accentForeground : c.muted }}
            >
              {label}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}

function Tile({
  label,
  icon,
  color,
  values,
}: {
  label: string;
  icon: FilledIconName;
  color: string;
  values: Money[];
}) {
  const c = useAppThemeColors();
  return (
    <View
      className="min-w-0 flex-1 gap-2 rounded-[18px] p-3"
      style={{
        ...CONTINUOUS,
        backgroundColor: colorWithAlpha(color, c.isDark ? 0.14 : 0.09),
      }}
    >
      <View className="flex-row items-center gap-1.5">
        <FilledIcon name={icon} size={16} color={color} />
        <Text
          numberOfLines={1}
          className="shrink font-manrope-semibold text-[13px]"
          style={{ color }}
        >
          {label}
        </Text>
      </View>
      <Amounts
        values={values}
        color={c.foreground}
        className="font-manrope-bold text-[17px]"
      />
    </View>
  );
}

/**
 * The page's one summary. It answers, in reading order: what do my schedules
 * add up to (net, then its income and expense parts), and how much is still
 * to pay this month. Month and year are one switch instead of two blocks of
 * the same numbers.
 */
export function RecurringOverview({
  summary,
  fallbackCurrency,
}: {
  summary: Summary;
  fallbackCurrency: string;
}) {
  const c = useAppThemeColors(),
    { t } = useTranslation();
  const [unit, setUnit] = useState<Unit>("month");
  const income = unit === "month" ? summary.income : summary.yearlyIncome;
  const expense = unit === "month" ? summary.expense : summary.yearlyExpense;
  const net = unit === "month" ? summary.monthlyNet : summary.yearlyNet;
  const both = income.length > 0 && expense.length > 0;
  // With only one kind of schedule the net would just repeat that total, so
  // the headline shows the total itself and the split tiles are left out.
  const headline = both
    ? {
        label: t("recurring.net"),
        values: net,
        signed: true,
        color: net.every((v) => v.amount >= 0) ? c.success : c.danger,
      }
    : income.length
      ? {
          label: t("recurring.income"),
          values: income,
          signed: false,
          color: c.success,
        }
      : {
          label: t("recurring.expense"),
          values: expense.length
            ? expense
            : [{ amount: 0, currencyCode: fallbackCurrency }],
          signed: false,
          color: c.foreground,
        };
  const hasExpenses = summary.expense.length > 0;
  return (
    <View
      className="gap-4 rounded-[28px] border border-border bg-surface p-4"
      style={CONTINUOUS}
    >
      <View className="gap-1">
        <View className="flex-row items-center gap-2">
          <Text
            numberOfLines={1}
            className="flex-1 font-manrope-semibold text-[15px] text-muted"
          >
            {headline.label}
          </Text>
          <UnitToggle value={unit} onChange={setUnit} />
        </View>
        <Amounts
          values={headline.values}
          signed={headline.signed}
          color={headline.color}
          className="font-manrope-bold text-[34px] leading-[42px]"
        />
        <Text className="text-[13px] text-muted">
          {t(unit === "month" ? "recurring.perMonth" : "recurring.perYear")}
        </Text>
      </View>
      {both && (
        <View className="flex-row gap-2">
          <Tile
            label={t("recurring.income")}
            icon="trending-up"
            color={c.success}
            values={income}
          />
          <Tile
            label={t("recurring.expense")}
            icon="trending-down"
            color={c.danger}
            values={expense}
          />
        </View>
      )}
      {hasExpenses && (
        <>
          <FormDivider />
          {summary.dueCount > 0 ? (
            <View className="flex-row items-center gap-3">
              <View
                className="size-9 items-center justify-center rounded-xl"
                style={{
                  ...CONTINUOUS,
                  backgroundColor: colorWithAlpha(c.accent, 0.14),
                }}
              >
                <FilledIcon name="calendar" size={18} tone="accent" />
              </View>
              <View className="min-w-0 flex-1 gap-0.5">
                <Text className="font-manrope-semibold text-[15px] text-foreground">
                  {t("recurring.dueMonth")}
                </Text>
                <Text className="text-[13px] text-muted">
                  {t("recurring.paymentsLeft", { count: summary.dueCount })}
                </Text>
              </View>
              <Amounts
                values={summary.due}
                color={c.foreground}
                className="font-manrope-bold text-[17px]"
              />
            </View>
          ) : (
            <View className="flex-row items-center gap-3">
              <View
                className="size-9 items-center justify-center rounded-xl"
                style={{
                  ...CONTINUOUS,
                  backgroundColor: colorWithAlpha(c.success, 0.14),
                }}
              >
                <FilledIcon name="check" size={18} tone="success" />
              </View>
              <Text className="flex-1 font-manrope-semibold text-[15px] text-foreground">
                {t("recurring.allPaidMonth")}
              </Text>
            </View>
          )}
        </>
      )}
    </View>
  );
}
