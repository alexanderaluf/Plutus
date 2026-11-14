import { useLocalData } from "@/data/local-data-provider";
import {
  selectConsumptionCategoryLinks,
  selectConsumptionDetails,
  selectConsumptionSliceIcons,
  type ConsumptionCategory,
  type ConsumptionFlow,
} from "@/data/selectors/consumption-report-selectors";
import { colorForeground } from "@/shared/icons/colors";
import { useAppDate } from "@/shared/lib/use-app-date";
import {
  useAmountVisibility,
  useCurrencyFormat,
} from "@/shared/lib/use-currency-format";
import { colorWithAlpha, useAppThemeColors } from "@/shared/theme/app-theme";
import { Text } from "@/shared/ui/app-text";
import { FilledIcon } from "@/shared/ui/filled-icon";
import { RecordIcon } from "@/shared/ui/record-icon";
import { Link } from "expo-router";
import { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { Pressable, StyleSheet, View } from "react-native";
import Animated, {
  Easing,
  FadeInDown,
  LayoutAnimationConfig,
  LinearTransition,
  ReduceMotion,
} from "react-native-reanimated";
import { ExpensePieChart } from "./expense-pie-chart";
import {
  CONTINUOUS,
  ReportEmptyState,
  ReportPill,
  ShareBar,
  TABULAR,
} from "./report-primitives";

const PANEL_LAYOUT = LinearTransition.duration(240)
  .easing(Easing.bezier(0.77, 0, 0.175, 1))
  .reduceMotion(ReduceMotion.System);
const PANEL_ENTER = FadeInDown.duration(220)
  .withInitialValues({ transform: [{ translateY: 8 }] })
  .easing(Easing.bezier(0.23, 1, 0.32, 1))
  .reduceMotion(ReduceMotion.System);

type SliceIcon = { icon: string; iconPath: string | null };

function SliceBadge({
  slice,
  icon,
}: {
  slice: ConsumptionCategory;
  icon: SliceIcon | undefined;
}) {
  return (
    <View
      className="size-11 shrink-0 items-center justify-center rounded-2xl"
      style={{ backgroundColor: slice.color, borderCurve: "continuous" }}
    >
      <RecordIcon
        color={colorForeground(slice.color)}
        name={icon?.icon ?? "help"}
        pathData={icon?.iconPath}
        size={21}
      />
    </View>
  );
}

/**
 * The page hero: the period's total spending, the donut, and one panel below
 * it that is either the category list or the selected category's expenses.
 * A slice and its list row share one selection, so both open the same panel.
 */
export function SpendingBreakdown({ flow }: { flow: ConsumptionFlow }) {
  const { t, i18n } = useTranslation();
  const theme = useAppThemeColors();
  const { document } = useLocalData();
  const { formatCurrency, amountsHidden } = useCurrencyFormat();
  const { toggle: toggleAmounts } = useAmountVisibility();
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const selected = flow.slices.find((slice) => slice.id === selectedId) ?? null;
  const icons = useMemo(
    () => selectConsumptionSliceIcons(document, flow.slices),
    [document, flow.slices],
  );
  const percent = (value: number) =>
    amountsHidden
      ? "••"
      : new Intl.NumberFormat(i18n.resolvedLanguage, {
          maximumFractionDigits: 1,
          style: "percent",
        }).format(value / 100);
  const money = (value: number) => formatCurrency(value, flow.currencyCode);
  const toggle = (id: string) =>
    setSelectedId((current) => (current === id ? null : id));

  return (
    <Animated.View layout={PANEL_LAYOUT} collapsable={false} className="gap-3">
      <View className="gap-3">
        <View className="flex-row items-center gap-2.5">
          <View
            className="size-9 shrink-0 items-center justify-center rounded-xl"
            style={{
              backgroundColor: colorWithAlpha(theme.accent, 0.14),
              borderCurve: "continuous",
            }}
          >
            <FilledIcon name="chart-donut-variant" size={18} tone="accent" />
          </View>
          <Text
            accessibilityRole="header"
            numberOfLines={1}
            className="min-w-0 flex-1 font-manrope-semibold text-[15px] leading-[20px] text-foreground"
          >
            {t("reports.donut.title")}
          </Text>
          <ReportPill label={flow.currencyCode} />
          <Pressable
            onPress={() => void toggleAmounts()}
            hitSlop={6}
            accessibilityRole="button"
            accessibilityLabel={t(
              amountsHidden
                ? "home.overview.showAmounts"
                : "home.overview.hideAmounts",
            )}
            className="size-9 items-center justify-center rounded-full border border-border/80 bg-surface"
            style={({ pressed }) => ({ opacity: pressed ? 0.68 : 1 })}
          >
            <FilledIcon
              name={amountsHidden ? "eye-off" : "eye"}
              size={17}
              tone="muted"
            />
          </Pressable>
        </View>
        <View className="gap-2">
          <Text
            adjustsFontSizeToFit
            minimumFontScale={0.62}
            numberOfLines={1}
            selectable={!amountsHidden}
            className="font-manrope-bold text-[38px] leading-[44px] tracking-[-0.6px] text-foreground"
            style={TABULAR}
          >
            {money(flow.expense)}
          </Text>
          <View className="flex-row flex-wrap gap-2">
            <ReportPill
              label={t("reports.overview.expenseCount", {
                count: flow.expenseCount,
              })}
            />
            <ReportPill
              label={t("reports.overview.categoryCount", {
                count: flow.categories.length,
              })}
            />
          </View>
        </View>
      </View>

      <ExpensePieChart flow={flow} selectedId={selectedId} onToggle={toggle} />

      {/* The page already staggers this section in; only later swaps animate. */}
      <LayoutAnimationConfig skipEntering>
        {flow.slices.length === 0 ? (
          <ReportEmptyState
            icon="chart-donut-variant"
            message={t("reports.overview.noSpending")}
          />
        ) : selected ? (
          <Animated.View
            key={selected.id}
            entering={PANEL_ENTER}
            layout={PANEL_LAYOUT}
          >
            <CategoryDetails
              flow={flow}
              slice={selected}
              icon={icons.get(selected.id)}
              share={percent(selected.share)}
              onClose={() => setSelectedId(null)}
            />
          </Animated.View>
        ) : (
          <Animated.View
            key="categories"
            entering={PANEL_ENTER}
            layout={PANEL_LAYOUT}
            className="gap-3"
          >
            <Text className="text-center font-sans text-[12px] leading-[16px] text-muted">
              {t("reports.overview.tapHint")}
            </Text>
            <View
              className="overflow-hidden rounded-[24px] border border-border bg-surface"
              style={CONTINUOUS}
            >
              {flow.slices.map((slice, index) => (
                <View key={slice.id}>
                  {index > 0 ? (
                    <View
                      style={{
                        height: StyleSheet.hairlineWidth,
                        backgroundColor: theme.border,
                        marginStart: 72,
                        marginEnd: 16,
                      }}
                    />
                  ) : null}
                  <Pressable
                    onPress={() => toggle(slice.id)}
                    accessibilityRole="button"
                    accessibilityLabel={`${slice.label}, ${money(slice.amount)}, ${percent(slice.share)}`}
                    accessibilityHint={t("reports.overview.sliceHint")}
                    className="flex-row items-center gap-3 px-4 py-3.5"
                    style={({ pressed }) => ({ opacity: pressed ? 0.68 : 1 })}
                  >
                    <SliceBadge slice={slice} icon={icons.get(slice.id)} />
                    <View className="min-w-0 flex-1 gap-2">
                      <Text
                        numberOfLines={1}
                        className="font-manrope-bold text-[15px] leading-[20px] text-foreground"
                      >
                        {slice.label}
                      </Text>
                      <ShareBar share={slice.share} color={slice.color} />
                    </View>
                    <View className="ms-1 max-w-[38%] shrink-0 items-end gap-0.5">
                      <Text
                        adjustsFontSizeToFit
                        minimumFontScale={0.78}
                        numberOfLines={1}
                        className="text-right font-manrope-bold text-[15px] leading-[20px] text-foreground"
                        style={TABULAR}
                      >
                        {money(slice.amount)}
                      </Text>
                      <Text
                        numberOfLines={1}
                        className="text-right font-sans text-[12px] leading-[16px] text-muted"
                        style={TABULAR}
                      >
                        {percent(slice.share)}
                      </Text>
                    </View>
                    <FilledIcon name="chevron-right" size={18} tone="muted" />
                  </Pressable>
                </View>
              ))}
            </View>
          </Animated.View>
        )}
      </LayoutAnimationConfig>
    </Animated.View>
  );
}

function CategoryDetails({
  flow,
  slice,
  icon,
  share,
  onClose,
}: {
  flow: ConsumptionFlow;
  slice: ConsumptionCategory;
  icon: SliceIcon | undefined;
  share: string;
  onClose: () => void;
}) {
  const { t } = useTranslation();
  const theme = useAppThemeColors();
  const { document } = useLocalData();
  const { formatCurrency } = useCurrencyFormat();
  const { formatDayMonth } = useAppDate();
  const details = useMemo(
    () => selectConsumptionDetails(flow, slice),
    [flow, slice],
  );
  const links = useMemo(
    () => selectConsumptionCategoryLinks(document, slice),
    [document, slice],
  );
  const latest = details.entries.slice(0, 3);
  const remaining = details.entries.length - latest.length;

  return (
    <View
      className="overflow-hidden rounded-[24px] border border-border bg-surface"
      style={CONTINUOUS}
      accessibilityLiveRegion="polite"
    >
      <View className="gap-3 p-4">
        <View className="flex-row items-center gap-3">
          <SliceBadge slice={slice} icon={icon} />
          <View className="min-w-0 flex-1 gap-0.5">
            <Text
              accessibilityRole="header"
              numberOfLines={1}
              className="font-manrope-bold text-[15px] leading-[20px] text-foreground"
            >
              {slice.label}
            </Text>
            <Text
              numberOfLines={1}
              className="font-sans text-[12px] leading-[16px] text-muted"
            >
              {t("reports.overview.shareOfSpending", { percent: share })}
            </Text>
          </View>
          <Pressable
            onPress={onClose}
            hitSlop={6}
            accessibilityRole="button"
            accessibilityLabel={t("reports.overview.closeDetails")}
            className="size-9 shrink-0 items-center justify-center rounded-full border border-border/80 bg-surface-secondary/75"
            style={({ pressed }) => ({ opacity: pressed ? 0.68 : 1 })}
          >
            <FilledIcon name="close" size={17} tone="muted" />
          </Pressable>
        </View>
        <View className="flex-row flex-wrap items-end justify-between gap-2">
          <Text
            adjustsFontSizeToFit
            minimumFontScale={0.7}
            numberOfLines={1}
            selectable
            className="min-w-0 shrink font-manrope-bold text-[26px] leading-[32px] tracking-[-0.4px] text-foreground"
            style={TABULAR}
          >
            {formatCurrency(slice.amount, flow.currencyCode)}
          </Text>
          <ReportPill
            label={t("reports.overview.expenseCount", {
              count: details.entries.length,
            })}
          />
        </View>
      </View>

      <View className="border-t border-border/70 px-4 pb-1 pt-3">
        <Text className="font-manrope-semibold text-[11px] leading-[15px] tracking-[0.4px] text-muted">
          {t("reports.overview.latestExpenses")}
        </Text>
        {latest.map((entry, index) => (
          <View
            key={entry.id}
            className="flex-row items-center gap-3 py-3"
            style={{
              borderBottomWidth:
                index < latest.length - 1 ? StyleSheet.hairlineWidth : 0,
              borderBottomColor: theme.border,
            }}
          >
            <View className="min-w-0 flex-1 gap-0.5">
              <Text
                numberOfLines={1}
                className="font-manrope-semibold text-[14px] leading-[19px] text-foreground"
              >
                {entry.name}
              </Text>
              <Text
                numberOfLines={1}
                className="font-sans text-[12px] leading-[16px] text-muted"
              >
                {formatDayMonth(entry.date)} · {entry.account}
              </Text>
            </View>
            <Text
              adjustsFontSizeToFit
              minimumFontScale={0.78}
              numberOfLines={1}
              selectable
              className="max-w-[42%] shrink-0 text-right font-manrope-bold text-[14px] leading-[19px] text-foreground"
              style={TABULAR}
            >
              {formatCurrency(entry.amount, flow.currencyCode)}
            </Text>
          </View>
        ))}
        {remaining > 0 ? (
          <Text className="pb-3 font-sans text-[12px] leading-[16px] text-muted">
            {t("reports.overview.moreTransactions", { count: remaining })}
          </Text>
        ) : null}
      </View>

      {links.length > 1 ? (
        <View className="border-t border-border/70 px-4 pt-3">
          <Text className="font-manrope-semibold text-[11px] leading-[15px] tracking-[0.4px] text-muted">
            {t("reports.overview.includedCategories")}
          </Text>
        </View>
      ) : null}
      {links.map((category, index) => (
        <Link
          key={category.id}
          href={{ pathname: "/categories/[id]", params: { id: category.id } }}
          asChild
        >
          <Pressable
            accessibilityRole="link"
            accessibilityLabel={t("reports.overview.openCategory", {
              category: category.label,
            })}
            className={`min-h-12 flex-row items-center justify-between gap-3 px-4 py-3 ${
              links.length === 1 || index > 0 ? "border-t border-border/70" : ""
            }`}
            style={({ pressed }) => ({ opacity: pressed ? 0.68 : 1 })}
          >
            <Text
              numberOfLines={1}
              className="min-w-0 flex-1 font-manrope-semibold text-[14px] leading-[19px] text-accent"
            >
              {links.length === 1
                ? t("reports.overview.viewCategory")
                : category.label}
            </Text>
            <FilledIcon name="chevron-right" size={18} tone="accent" />
          </Pressable>
        </Link>
      ))}
    </View>
  );
}
