import { Link } from "expo-router";
import { useEffect, useMemo, useState, type PropsWithChildren } from "react";
import { useTranslation } from "react-i18next";
import {
  Pressable,
  useWindowDimensions,
  View,
  type ViewStyle,
} from "react-native";
import Animated, {
  Easing,
  FadeInDown,
  FadeOut,
  LinearTransition,
  ReduceMotion,
  useAnimatedProps,
  useAnimatedStyle,
  useSharedValue,
  withTiming,
} from "react-native-reanimated";
import Svg, { Circle, G, Path } from "react-native-svg";
import { useLocalData } from "@/data/local-data-provider";
import {
  selectConsumptionCategoryLinks,
  selectConsumptionDetails,
  type ConsumptionCategory,
  type ConsumptionFlow,
} from "@/data/selectors/consumption-report-selectors";
import { useAppDate } from "@/shared/lib/use-app-date";
import { useCurrencyFormat } from "@/shared/lib/use-currency-format";
import { useAppThemeColors } from "@/shared/theme/app-theme";
import { Text } from "@/shared/ui/app-text";
import { FilledIcon } from "@/shared/ui/filled-icon";
import { ReportHeading } from "./report-primitives";
import { expensePieLayout } from "./expense-pie-layout";

const DETAILS_LAYOUT = LinearTransition.duration(240)
  .easing(Easing.bezier(0.77, 0, 0.175, 1))
  .reduceMotion(ReduceMotion.System);
const DETAILS_ENTER = FadeInDown.duration(220)
  .withInitialValues({ transform: [{ translateY: 8 }] })
  .easing(Easing.bezier(0.23, 1, 0.32, 1))
  .reduceMotion(ReduceMotion.System);
const DETAILS_EXIT = FadeOut.duration(160)
  .easing(Easing.bezier(0.23, 1, 0.32, 1))
  .reduceMotion(ReduceMotion.System);

const AnimatedSvgGroup = Animated.createAnimatedComponent(G);

function useFocusOpacity(target: number) {
  const opacity = useSharedValue(target);
  useEffect(() => {
    opacity.set(
      withTiming(target, {
        duration: 190,
        easing: Easing.bezier(0.23, 1, 0.32, 1),
        reduceMotion: ReduceMotion.System,
      }),
    );
  }, [opacity, target]);
  return opacity;
}

function FadingSvgGroup({
  target,
  children,
}: PropsWithChildren<{ target: number }>) {
  const opacity = useFocusOpacity(target);
  const animatedProps = useAnimatedProps(() => ({ opacity: opacity.get() }));
  return (
    <AnimatedSvgGroup animatedProps={animatedProps}>
      {children}
    </AnimatedSvgGroup>
  );
}

function FadingLegend({
  hidden,
  style,
  children,
}: PropsWithChildren<{ hidden: boolean; style: ViewStyle }>) {
  const opacity = useFocusOpacity(hidden ? 0 : 1);
  const animatedStyle = useAnimatedStyle(() => ({ opacity: opacity.get() }));
  return (
    <Animated.View
      style={[style, animatedStyle]}
      pointerEvents={hidden ? "none" : "auto"}
      accessibilityElementsHidden={hidden}
      importantForAccessibility={hidden ? "no-hide-descendants" : "auto"}
    >
      {children}
    </Animated.View>
  );
}

export function ExpensePieCard({ flow }: { flow: ConsumptionFlow }) {
  const { t, i18n } = useTranslation();
  const theme = useAppThemeColors();
  const { formatCurrency, amountsHidden } = useCurrencyFormat();
  const { fontScale } = useWindowDimensions();
  const [chartWidth, setChartWidth] = useState(0);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const selected = flow.slices.find((slice) => slice.id === selectedId) ?? null;
  const percent = (value: number) =>
    amountsHidden
      ? "••"
      : new Intl.NumberFormat(i18n.resolvedLanguage, {
          maximumFractionDigits: 1,
          style: "percent",
        }).format(value / 100);
  const layout = useMemo(
    () => expensePieLayout(flow.slices, chartWidth, fontScale),
    [flow.slices, chartWidth, fontScale],
  );
  const toggle = (id: string) =>
    setSelectedId((current) => (current === id ? null : id));

  return (
    <Animated.View
      layout={DETAILS_LAYOUT}
      collapsable={false}
      className="gap-2"
    >
      <View className="gap-3">
        <ReportHeading
          icon="chart-donut-variant"
          title={t("reports.donut.title")}
          detail={flow.currencyCode}
        />
        <Text
          selectable
          className="font-manrope-bold text-4xl text-foreground"
          style={{ fontVariant: ["tabular-nums"] }}
        >
          {formatCurrency(flow.expense, flow.currencyCode)}
        </Text>
        <Text className="font-sans text-xs text-muted">
          {t("reports.overview.expenseCount", { count: flow.expenseCount })}
        </Text>
      </View>
      <View
        onLayout={({ nativeEvent }) => setChartWidth(nativeEvent.layout.width)}
        style={{
          width: "100%",
          maxWidth: 480,
          alignSelf: "center",
          direction: "ltr",
          height: chartWidth > 0 ? layout.height : 280,
        }}
      >
        {chartWidth > 0 ? (
          <>
            <Svg
              width={chartWidth}
              height={layout.height}
              viewBox={`0 0 ${chartWidth} ${layout.height}`}
            >
              {flow.slices.length === 0 ? (
                <Circle
                  cx={layout.centerX}
                  cy={layout.centerY}
                  r={(layout.inner + layout.outer) / 2}
                  stroke={theme.surfaceTertiary}
                  strokeWidth={layout.outer - layout.inner}
                  fill="none"
                />
              ) : null}
              {layout.arcs.map(({ slice, path }) => {
                const active = selected?.id === slice.id;
                return (
                  <FadingSvgGroup
                    key={slice.id}
                    target={selected && !active ? 0.16 : 1}
                  >
                    <Path
                      d={path}
                      fill={slice.color}
                      onPress={() => toggle(slice.id)}
                      accessible={!!selected}
                      accessibilityLabel={`${slice.label}, ${formatCurrency(slice.amount, flow.currencyCode)}, ${percent(slice.share)}`}
                    />
                    {active ? (
                      <Path
                        d={path}
                        fill="none"
                        stroke={theme.foreground}
                        strokeWidth={1.5}
                        pointerEvents="none"
                      />
                    ) : null}
                  </FadingSvgGroup>
                );
              })}
              <FadingSvgGroup target={selected ? 0 : 1}>
                {layout.labels.map(({ slice, connectorPath }) => (
                  <Path
                    key={slice.id}
                    d={connectorPath}
                    fill="none"
                    stroke={theme.muted}
                    strokeWidth={1}
                    strokeOpacity={0.5}
                    strokeLinejoin="round"
                    pointerEvents="none"
                  />
                ))}
              </FadingSvgGroup>
            </Svg>
            {layout.labels.map(({ slice, x, y, width, height, right }) => (
              <FadingLegend
                key={slice.id}
                hidden={!!selected}
                style={{
                  position: "absolute",
                  start: x,
                  top: y,
                  width,
                  height,
                }}
              >
                <Pressable
                  onPress={() => toggle(slice.id)}
                  accessibilityRole="button"
                  accessibilityState={{ selected: selected?.id === slice.id }}
                  accessibilityLabel={`${slice.label}, ${formatCurrency(slice.amount, flow.currencyCode)}, ${percent(slice.share)}`}
                  accessibilityHint={t("reports.overview.sliceHint")}
                  style={({ pressed }) => ({
                    flex: 1,
                    justifyContent: "center",
                    opacity: pressed ? 0.6 : 1,
                  })}
                >
                  <Text
                    numberOfLines={2}
                    ellipsizeMode="tail"
                    className="font-manrope-semibold text-xs text-foreground"
                    style={{
                      width: "100%",
                      textAlign: right ? "left" : "right",
                      lineHeight: 16,
                    }}
                  >
                    {slice.label}
                  </Text>
                  <View
                    style={{
                      flexDirection: "row",
                      alignItems: "center",
                      justifyContent: right ? "flex-start" : "flex-end",
                      gap: 4,
                      marginTop: 4,
                    }}
                  >
                    <View
                      style={{
                        width: 5,
                        height: 5,
                        borderRadius: 3,
                        backgroundColor: slice.color,
                      }}
                    />
                    <Text
                      numberOfLines={1}
                      className="font-sans text-xs text-muted"
                      style={{ flexShrink: 1, lineHeight: 16 }}
                    >
                      {percent(slice.share)}
                    </Text>
                  </View>
                </Pressable>
              </FadingLegend>
            ))}
            <View
              pointerEvents="none"
              className="absolute items-center justify-center"
              style={{
                top: layout.centerY - layout.inner * 0.8,
                start: layout.centerX - layout.inner * 0.8,
                width: layout.inner * 1.6,
                height: layout.inner * 1.6,
              }}
            >
              <Text
                numberOfLines={1}
                adjustsFontSizeToFit
                className="font-manrope-bold text-xl text-foreground"
              >
                {selected
                  ? percent(selected.share)
                  : String(flow.categories.length)}
              </Text>
              <Text
                numberOfLines={2}
                className="mt-1 text-center font-sans text-[10px] text-muted"
              >
                {selected?.label ?? t("reports.overview.categoriesLabel")}
              </Text>
            </View>
          </>
        ) : null}
      </View>
      {flow.expenseCount === 0 ? (
        <Text className="text-center font-sans text-sm text-muted">
          {t("reports.overview.noExpenses")}
        </Text>
      ) : null}
      {selected ? (
        <Animated.View
          key={selected.id}
          entering={DETAILS_ENTER}
          exiting={DETAILS_EXIT}
          layout={DETAILS_LAYOUT}
        >
          <CategoryDetails
            flow={flow}
            slice={selected}
            onClose={() => setSelectedId(null)}
          />
        </Animated.View>
      ) : null}
    </Animated.View>
  );
}

function CategoryDetails({
  flow,
  slice,
  onClose,
}: {
  flow: ConsumptionFlow;
  slice: ConsumptionCategory;
  onClose: () => void;
}) {
  const { t } = useTranslation();
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
  return (
    <View
      className="gap-4 border-t border-border pt-5"
      accessibilityLiveRegion="polite"
    >
      <View className="flex-row items-start gap-3">
        <View
          style={{
            backgroundColor: slice.color,
            width: 4,
            alignSelf: "stretch",
            borderRadius: 2,
          }}
        />
        <View className="min-w-0 flex-1 gap-1">
          <Text className="font-manrope-bold text-lg text-foreground">
            {slice.label}
          </Text>
          <Text
            selectable
            className="font-manrope-bold text-2xl text-foreground"
          >
            {formatCurrency(slice.amount, flow.currencyCode)}
          </Text>
          <Text className="font-sans text-xs text-muted">
            {t("reports.overview.expenseCount", {
              count: details.entries.length,
            })}
          </Text>
        </View>
        <Pressable
          onPress={onClose}
          accessibilityRole="button"
          accessibilityLabel={t("reports.overview.closeDetails")}
          style={({ pressed }) => ({
            opacity: pressed ? 0.6 : 1,
            minWidth: 44,
            minHeight: 44,
            alignItems: "center",
            justifyContent: "center",
          })}
        >
          <FilledIcon name="close" size={20} tone="muted" />
        </Pressable>
      </View>
      <View className="gap-1">
        {details.entries.slice(0, 3).map((entry) => (
          <View key={entry.id} className="flex-row items-center gap-3 py-2">
            <FilledIcon name="arrow-top-right" size={16} tone="muted" />
            <View className="min-w-0 flex-1 gap-1">
              <Text
                numberOfLines={1}
                className="font-manrope-semibold text-sm text-foreground"
              >
                {entry.name}
              </Text>
              <Text numberOfLines={1} className="font-sans text-xs text-muted">
                {formatDayMonth(entry.date)} · {entry.account}
              </Text>
            </View>
            <Text
              selectable
              className="font-manrope-bold text-sm text-foreground"
              style={{ maxWidth: "45%" }}
            >
              {formatCurrency(entry.amount, flow.currencyCode)}
            </Text>
          </View>
        ))}
      </View>
      {links.map((category) => (
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
            className="min-h-12 flex-row items-center justify-between gap-3 border-t border-border py-3"
            style={({ pressed }) => ({ opacity: pressed ? 0.6 : 1 })}
          >
            <View className="flex-1 flex-row items-center gap-2">
              <FilledIcon name="chart-donut-variant" size={18} tone="accent" />
              <Text className="flex-1 font-manrope-semibold text-sm text-accent">
                {links.length === 1
                  ? t("reports.overview.viewCategory")
                  : category.label}
              </Text>
            </View>
            <FilledIcon name="chevron-right" size={20} tone="accent" />
          </Pressable>
        </Link>
      ))}
    </View>
  );
}
