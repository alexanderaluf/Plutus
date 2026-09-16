import type { Budget } from "@/data/selectors/budget-selectors";
import { useAppLocalization } from "@/localization/localization-provider";
import { colorForeground } from "@/shared/icons/colors";
import { formatCurrency } from "@/shared/lib/currency";
import { useAppThemeColors } from "@/shared/theme/app-theme";
import { Text } from "@/shared/ui/app-text";
import { FilledIcon, type FilledIconName } from "@/shared/ui/filled-icon";
import { RecordIcon } from "@/shared/ui/record-icon";
import { useRouter } from "expo-router";
import { Button, Switch as HeroSwitch } from "heroui-native";
import type { PropsWithChildren, ReactNode } from "react";
import { useTranslation } from "react-i18next";
import {
    Pressable,
    TextInput,
    View,
    type TextInputProps,
} from "react-native";
import Svg, { Circle, Line, Polyline, Text as SvgText } from "react-native-svg";

export { BudgetSheet } from "./budget-sheet";

export function useBudgetLabels() {
  const { t } = useTranslation();
  return {
    types: [
      t("budgets.common.types.expense"),
      t("budgets.common.types.income"),
      t("budgets.common.types.transfer"),
    ] as const,
    tracked: [
      t("budgets.common.tracked.spent"),
      t("budgets.common.tracked.earned"),
      t("budgets.common.tracked.transferred"),
    ] as const,
    modes: {
      Automatic: t("budgets.common.modes.automatic"),
      Manual: t("budgets.common.modes.manual"),
    },
    scopes: {
      Category: t("budgets.common.scopes.category"),
      Overall: t("budgets.common.scopes.overall"),
    },
    periods: {
      Daily: t("budgets.common.periods.daily"),
      Weekly: t("budgets.common.periods.weekly"),
      Monthly: t("budgets.common.periods.monthly"),
      Yearly: t("budgets.common.periods.yearly"),
      Custom: t("budgets.common.periods.custom"),
    },
  };
}
export function BudgetHeader({
  title,
  children,
  disabled = false,
  horizontalPadding = 12,
}: PropsWithChildren<{
  title: string;
  disabled?: boolean;
  horizontalPadding?: number;
}>) {
  const router = useRouter();
  const { t } = useTranslation();
  return (
    <View
      className="flex-row items-center gap-2 py-2"
      style={{ paddingHorizontal: horizontalPadding }}
    >
      <Button
        variant="ghost"
        isIconOnly
        isDisabled={disabled}
        accessibilityLabel={t("budgets.common.back")}
        onPress={() =>
          router.canGoBack() ? router.back() : router.replace("/")
        }
      >
        <FilledIcon name="arrow-left" size={26} />
      </Button>
      <Text
        accessibilityRole="header"
        className="flex-1 font-manrope-bold text-2xl text-foreground"
      >
        {title}
      </Text>
      {children}
    </View>
  );
}
export function BudgetPanel({ children }: PropsWithChildren) {
  return (
    <View className="gap-4 rounded-[28px] border border-border bg-surface p-5">
      {children}
    </View>
  );
}
export function BudgetField(props: TextInputProps) {
  const c = useAppThemeColors();
  const { direction } = useAppLocalization();
  return (
    <TextInput
      placeholderTextColor={c.muted}
      {...props}
      style={[
        {
          minHeight: 58,
          borderRadius: 16,
          paddingHorizontal: 16,
          paddingVertical: 14,
          backgroundColor: c.surface,
          color: c.foreground,
          fontFamily: "Huninn_400Regular",
          fontSize: 17,
          borderWidth: 1,
          borderColor: c.border,
          direction,
          textAlign: "auto",
          writingDirection: direction,
        },
        props.style,
      ]}
    />
  );
}
export function BudgetOption({
  title,
  description,
  selected,
  onPress,
  icon,
  children,
}: {
  title: string;
  description?: string;
  selected?: boolean;
  onPress: () => void;
  icon?: FilledIconName;
  children?: ReactNode;
}) {
  const c = useAppThemeColors();
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ selected }}
      onPress={onPress}
      style={({ pressed }) => ({
        opacity: pressed ? 0.7 : 1,
        borderWidth: 2,
        borderColor: selected ? c.accent : "transparent",
        backgroundColor: c.surface,
        borderRadius: 24,
        padding: 16,
        flexDirection: "row",
        alignItems: "center",
        gap: 14,
      })}
    >
      {icon && <FilledIcon name={icon} size={25} tone="accent" />}
      {children}
      <View style={{ flex: 1 }}>
        <Text
          className="font-manrope-semibold text-lg"
          style={{ color: selected ? c.accent : c.foreground }}
        >
          {title}
        </Text>
        {description ? (
          <Text className="mt-1 font-sans text-sm leading-6 text-muted">
            {description}
          </Text>
        ) : null}
      </View>
      {selected !== undefined && (
        <View
          style={{
            width: 24,
            height: 24,
            borderRadius: 12,
            borderWidth: 2,
            borderColor: selected ? c.accent : c.muted,
            backgroundColor: selected ? c.accent : "transparent",
            alignItems: "center",
            justifyContent: "center",
          }}
        >
          {selected && (
            <FilledIcon name="check" size={17} tone="accent-foreground" />
          )}
        </View>
      )}
    </Pressable>
  );
}
export function BudgetToggle({
  title,
  description,
  value,
  onChange,
  disabled = false,
}: {
  title: string;
  description: string;
  value: boolean;
  onChange: (value: boolean) => void;
  disabled?: boolean;
}) {
  return (
    <Pressable
      accessibilityRole="switch"
      accessibilityLabel={title}
      accessibilityState={{ checked: value, disabled }}
      disabled={disabled}
      onPress={() => onChange(!value)}
      className="flex-row items-center gap-3 py-3"
    >
      <View className="flex-1">
        <Text className="font-manrope-semibold text-lg text-foreground">
          {title}
        </Text>
        <Text className="mt-1 font-sans text-sm leading-5 text-muted">
          {description}
        </Text>
      </View>
      <View
        pointerEvents="none"
        accessibilityElementsHidden
        importantForAccessibility="no-hide-descendants"
      >
        <HeroSwitch
          isSelected={value}
          isDisabled={disabled}
          style={{ width: 60, height: 28 }}
        >
          <HeroSwitch.Thumb style={{ width: 36, height: 24 }} />
        </HeroSwitch>
      </View>
    </Pressable>
  );
}
export function BudgetBadge({
  budget,
}: {
  budget: { icon: string; iconPath: string | null; color: string };
}) {
  return (
    <View
      style={{
        backgroundColor: budget.color,
        width: 54,
        height: 54,
        borderRadius: 16,
        alignItems: "center",
        justifyContent: "center",
      }}
    >
      <RecordIcon
        name={budget.icon}
        pathData={budget.iconPath}
        color={colorForeground(budget.color)}
        size={29}
      />
    </View>
  );
}
export function BudgetProgress({
  percent,
  color,
}: {
  percent: number;
  color: string;
}) {
  const c = useAppThemeColors();
  return (
    <View
      accessibilityRole="progressbar"
      accessibilityValue={{
        min: 0,
        max: 100,
        now: Math.min(100, Math.round(percent)),
      }}
      style={{
        height: 8,
        backgroundColor: c.border,
        borderRadius: 8,
        overflow: "hidden",
      }}
    >
      <View
        style={{
          height: 8,
          width: `${Math.min(100, Math.max(0, percent))}%`,
          backgroundColor: color,
          borderRadius: 8,
        }}
      />
    </View>
  );
}
export function BudgetSummary({
  budget,
  compact = false,
}: {
  budget: Budget;
  compact?: boolean;
}) {
  const { t } = useTranslation();
  const labels = useBudgetLabels();
  const b = budget;
  const money = (v: number) =>
    `${v < 0 ? "−" : ""}${formatCurrency(v, b.currencyCode)}`;
  return (
    <BudgetPanel>
      <View className="flex-row items-center gap-3">
        <BudgetBadge budget={b} />
        <View className="flex-1 gap-1">
          <Text className="font-manrope-bold text-xl text-foreground">
            {b.name}
          </Text>
          <Text
            className="font-manrope-medium text-xs"
            style={{ color: b.color }}
          >
            {labels.periods[b.period]} · {labels.scopes[b.budgetType]} ·{" "}
            {labels.modes[b.budgetMode]}
          </Text>
        </View>
        <Text style={{ color: b.color }} className="font-manrope-bold">
          {Math.round(b.percent)}%
        </Text>
      </View>
      {!compact && (
        <View className="flex-row justify-between gap-3">
          <Text className="text-muted">
            {t("budgets.common.typeBudget", {
              type: labels.types[b.transactionType],
            })}
          </Text>
          <Text className="text-foreground">
            {b.transactionType === 1
              ? b.percent >= 100
                ? t("budgets.summary.goalReached")
                : t("budgets.summary.inProgress")
              : b.remaining < 0
                ? t("budgets.summary.overBudget")
                : t("budgets.summary.withinBudget")}
          </Text>
        </View>
      )}
      <View className="flex-row justify-between gap-3">
        <View>
          <Text className="mb-1 text-muted">
            {labels.tracked[b.transactionType]}
          </Text>
          <Text className="font-manrope-semibold text-xl text-foreground">
            {money(b.tracked)}
          </Text>
        </View>
        <View>
          <Text className="mb-1 text-muted">
            {b.transactionType === 1
              ? t("budgets.summary.goal")
              : t("budgets.summary.budget")}
          </Text>
          <Text className="font-manrope-semibold text-xl text-foreground">
            {money(b.limit)}
          </Text>
        </View>
      </View>
      <BudgetProgress percent={b.percent} color={b.color} />
      {!compact && (
        <>
          <Text className="text-muted">
            {b.remaining < 0
              ? t("budgets.summary.aboveTarget")
              : t("budgets.summary.remaining")}{" "}
            <Text className="font-manrope-semibold text-foreground">
              {money(Math.abs(b.remaining))}
            </Text>
          </Text>
          <Text className="text-sm leading-6" style={{ color: b.color }}>
            {!b.active
              ? t("budgets.summary.outsideRange")
              : b.transactionType === 1
                ? t("budgets.summary.dailyIncome", {
                    amount: money(b.dailyAllowance),
                    count: b.daysLeft,
                  })
                : t("budgets.summary.dailyExpense", {
                    action:
                      b.transactionType === 2
                        ? t("budgets.summary.transfer")
                        : t("budgets.summary.spend"),
                    amount: money(b.dailyAllowance),
                    count: b.daysLeft,
                  })}
          </Text>
          {b.rollover > 0 && (
            <Text className="text-sm text-muted">
              {t("budgets.summary.rollover", { amount: money(b.rollover) })}
            </Text>
          )}
        </>
      )}
    </BudgetPanel>
  );
}
export function BudgetRing({
  percent,
  color,
}: {
  percent: number;
  color: string;
}) {
  const c = useAppThemeColors();
  const { t } = useTranslation();
  const length = 2 * Math.PI * 62;
  return (
    <View
      style={{
        width: 154,
        height: 154,
        alignItems: "center",
        justifyContent: "center",
      }}
    >
      <Svg width={154} height={154} style={{ position: "absolute" }}>
        <Circle
          cx={77}
          cy={77}
          r={62}
          stroke={c.border}
          strokeWidth={19}
          fill="none"
        />
        <Circle
          cx={77}
          cy={77}
          r={62}
          stroke={color}
          strokeWidth={19}
          fill="none"
          strokeDasharray={`${(length * Math.min(100, percent)) / 100} ${length}`}
          rotation={-90}
          origin="77,77"
        />
      </Svg>
      <Text className="font-manrope-bold text-3xl text-foreground">
        {Math.round(percent)}%
      </Text>
      <Text className="text-muted">{t("budgets.summary.tracked")}</Text>
    </View>
  );
}
export function BudgetChart({ budget: b }: { budget: Budget }) {
  const c = useAppThemeColors();
  const { t, i18n } = useTranslation();
  const labels = useBudgetLabels();
  const max = Math.max(b.limit, b.tracked, 1) * 1.2;
  const x = (time: number) =>
    48 +
    ((time - b.range.start.getTime()) /
      (b.range.end.getTime() - b.range.start.getTime())) *
      270;
  const y = (amount: number) => 196 - (amount / max) * 158;
  return (
    <BudgetPanel>
      <Text
        className="font-manrope-semibold text-lg"
        style={{ color: b.color }}
      >
        {t("budgets.summary.progress")}
      </Text>
      <View
        accessible
        accessibilityLabel={t("budgets.summary.chartAccessibility", {
          tracked: labels.tracked[b.transactionType].toLocaleLowerCase(
            i18n.resolvedLanguage,
          ),
          amount: formatCurrency(b.tracked, b.currencyCode),
          target: formatCurrency(b.limit, b.currencyCode),
        })}
      >
        <Svg width="100%" height={240} viewBox="0 0 340 240">
          {[0, 0.25, 0.5, 0.75, 1].map((f) => (
            <ViewlessGrid
              key={f}
              y={y(max * f)}
              label={new Intl.NumberFormat(undefined, {
                notation: "compact",
                maximumFractionDigits: 1,
              }).format(max * f)}
              color={c.muted}
              border={c.border}
            />
          ))}
          <Line
            x1={48}
            y1={y(b.limit)}
            x2={318}
            y2={y(b.limit)}
            stroke="#ef666d"
            strokeDasharray="6 4"
          />
          <SvgText
            x={316}
            y={y(b.limit) - 7}
            textAnchor="end"
            fill="#ef666d"
            fontSize={10}
          >
            {t("budgets.summary.target")}
          </SvgText>
          <Line
            x1={48}
            y1={196}
            x2={318}
            y2={y(b.limit)}
            stroke={c.muted}
            strokeDasharray="6 4"
          />
          <Polyline
            points={b.points
              .map((p) => `${x(p.timestamp)},${y(p.amount)}`)
              .join(" ")}
            fill="none"
            stroke={b.color}
            strokeWidth={3}
          />
          {[0, 0.5, 1].map((f) => (
            <SvgText
              key={f}
              x={48 + 270 * f}
              y={222}
              fill={c.muted}
              fontSize={10}
              textAnchor={f === 0 ? "start" : f === 1 ? "end" : "middle"}
            >
              {new Date(
                b.range.start.getTime() +
                  (b.range.end.getTime() - b.range.start.getTime() - 1) * f,
              ).toLocaleDateString(i18n.resolvedLanguage, {
                month: "short",
                day: "numeric",
              })}
            </SvgText>
          ))}
        </Svg>
      </View>
      <Text className="text-xs text-muted">
        <Text style={{ color: b.color }}>
          ━ {labels.types[b.transactionType]}
        </Text>{" "}
        ┄ {t("budgets.summary.idealPace")}{" "}
        <Text style={{ color: "#ef666d" }}>
          ┄ {t("budgets.summary.target")}
        </Text>
      </Text>
    </BudgetPanel>
  );
}
function ViewlessGrid({
  y,
  label,
  color,
  border,
}: {
  y: number;
  label: string;
  color: string;
  border: string;
}) {
  return (
    <>
      <Line x1={48} x2={318} y1={y} y2={y} stroke={border} />
      <SvgText x={40} y={y + 4} textAnchor="end" fill={color} fontSize={10}>
        {label}
      </SvgText>
    </>
  );
}
