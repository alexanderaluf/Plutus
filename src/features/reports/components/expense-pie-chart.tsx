import type { ConsumptionFlow } from "@/data/selectors/consumption-report-selectors";
import { useCurrencyFormat } from "@/shared/lib/use-currency-format";
import { useAppThemeColors } from "@/shared/theme/app-theme";
import { Text } from "@/shared/ui/app-text";
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
    ReduceMotion,
    useAnimatedProps,
    useAnimatedStyle,
    useSharedValue,
    withTiming,
} from "react-native-reanimated";
import Svg, { Circle, G, Path } from "react-native-svg";
import { expensePieLayout } from "./expense-pie-layout";

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

/**
 * The donut itself. It measures its own width, so it must stay a direct,
 * unpadded child of the page column: any wrapper padding shrinks the ring.
 * Selection is owned by the parent so the category list can drive it too.
 */
export function ExpensePieChart({
  flow,
  selectedId,
  onToggle,
}: {
  flow: ConsumptionFlow;
  selectedId: string | null;
  onToggle: (id: string) => void;
}) {
  const { t, i18n } = useTranslation();
  const theme = useAppThemeColors();
  const { formatCurrency, amountsHidden } = useCurrencyFormat();
  const { fontScale } = useWindowDimensions();
  const [chartWidth, setChartWidth] = useState(0);
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
  const toggle = onToggle;

  return (
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
  );
}
