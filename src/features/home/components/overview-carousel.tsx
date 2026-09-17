import { useRouter } from "expo-router";
import { LinearGradient } from "expo-linear-gradient";
import { memo, useRef, useState, type PropsWithChildren } from "react";
import { useTranslation } from "react-i18next";
import { Pressable, ScrollView, View } from "react-native";
import Animated, {
  Extrapolation,
  interpolate,
  interpolateColor,
  useAnimatedScrollHandler,
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  type SharedValue,
} from "react-native-reanimated";
import type { HomeOverview } from "@/data/selectors/document-selectors";
import { useAppLocalization } from "@/localization/localization-provider";
import { Text } from "@/shared/ui/app-text";
import { FilledIcon } from "@/shared/ui/filled-icon";
import { useAppThemeColors } from "@/shared/theme/app-theme";
import {
  OverviewCard,
  OverviewPrivacyButton,
  useOverviewCards,
} from "./overview-card";

// Match TabPage's px-5 gutter, while the swipe viewport reaches both screen edges.
const PAGE_INSET = 20;
function SlidingCard({
  children,
  index,
  width,
  offset,
  active,
  reducedMotion,
}: PropsWithChildren<{
  index: number;
  width: number;
  offset: SharedValue<number>;
  active: boolean;
  reducedMotion: boolean;
}>) {
  const { direction } = useAppLocalization();
  const style = useAnimatedStyle(() => ({
    opacity: reducedMotion
      ? 1
      : interpolate(
          offset.get() / width,
          [index - 1, index, index + 1],
          [0, 1, 0],
          Extrapolation.CLAMP,
        ),
  }));
  return (
    <Animated.View
      style={[{ width, direction, paddingHorizontal: PAGE_INSET }, style]}
      accessibilityElementsHidden={!active}
      importantForAccessibility={active ? "auto" : "no-hide-descendants"}
    >
      {children}
    </Animated.View>
  );
}
function CardDot({
  title,
  index,
  width,
  offset,
  selected,
  onPress,
  reducedMotion,
}: {
  title: string;
  index: number;
  width: number;
  offset: SharedValue<number>;
  selected: boolean;
  onPress: () => void;
  reducedMotion: boolean;
}) {
  const { accent, muted } = useAppThemeColors();
  const style = useAnimatedStyle(() => {
    const progress = reducedMotion
      ? Number(selected)
      : interpolate(
          offset.get() / Math.max(1, width),
          [index - 1, index, index + 1],
          [0, 1, 0],
          Extrapolation.CLAMP,
        );
    return {
      width: interpolate(progress, [0, 1], [7, 20]),
      opacity: interpolate(progress, [0, 1], [0.4, 1]),
      backgroundColor: interpolateColor(progress, [0, 1], [muted, accent]),
    };
  });
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityState={{ selected }}
      accessibilityLabel={title}
      className="size-11 items-center justify-center"
    >
      <Animated.View
        pointerEvents="none"
        style={style}
        className="h-[7px] rounded-full"
      />
    </Pressable>
  );
}
export const OverviewCarousel = memo(function OverviewCarousel({
  overview,
  now,
  isBalanceVisible,
  onToggleBalance,
}: {
  overview: HomeOverview;
  now: Date;
  isBalanceVisible: boolean;
  onToggleBalance: () => void;
}) {
  const { t } = useTranslation();
  const router = useRouter();
  const { background } = useAppThemeColors();
  const scroll = useRef<ScrollView>(null);
  const [{ width, initialPage }, setViewport] = useState({
    width: 0,
    initialPage: 0,
  });
  const [page, setPage] = useState(0);
  const offset = useSharedValue(0);
  const reducedMotion = useReducedMotion();
  const cards = useOverviewCards(overview, now, isBalanceVisible);
  const onScroll = useAnimatedScrollHandler((event) => {
    offset.set(event.contentOffset.x);
  });
  function selectPage(index: number) {
    setPage(index);
    scroll.current?.scrollTo({
      x: index * width,
      animated: !reducedMotion,
    });
  }
  return (
    <View className="gap-2">
      <View className="flex-row items-center justify-between">
        <Text className="font-manrope-bold text-lg text-foreground">
          {t("home.overview.title")}
        </Text>
        <View className="flex-row items-center">
          <OverviewPrivacyButton
            visible={isBalanceVisible}
            onPress={onToggleBalance}
          />
          <Pressable
            accessibilityRole="button"
            onPress={() => router.push("/insights")}
            className="min-h-11 flex-row items-center gap-1.5 ps-2"
          >
            <Text className="font-manrope-semibold text-xs text-accent">
              {t("home.overview.allInsights")}
            </Text>
            <FilledIcon name="chevron-right" size={16} tone="accent" />
          </Pressable>
        </View>
      </View>
      <View
        className="overflow-hidden"
        style={{ marginHorizontal: -PAGE_INSET, direction: "ltr" }}
        onLayout={(event) => {
          const nextWidth = event.nativeEvent.layout.width;
          if (nextWidth !== width) {
            offset.set(page * nextWidth);
            setViewport({ width: nextWidth, initialPage: page });
          }
        }}
      >
        {width > 0 && (
          <Animated.ScrollView
            key={width}
            ref={scroll}
            horizontal
            snapToInterval={width}
            snapToAlignment="start"
            decelerationRate="fast"
            disableIntervalMomentum
            directionalLockEnabled
            bounces={false}
            showsHorizontalScrollIndicator={false}
            contentOffset={{ x: initialPage * width, y: 0 }}
            style={{ direction: "ltr" }}
            contentContainerStyle={{ direction: "ltr" }}
            scrollEventThrottle={16}
            onScroll={onScroll}
            onMomentumScrollEnd={(event) =>
              setPage(
                Math.max(
                  0,
                  Math.min(
                    cards.length - 1,
                    Math.round(event.nativeEvent.contentOffset.x / width),
                  ),
                ),
              )
            }
          >
            {cards.map((card, index) => (
              <SlidingCard
                key={card.id}
                width={width}
                index={index}
                offset={offset}
                active={page === index}
                reducedMotion={reducedMotion}
              >
                <OverviewCard card={card} visible={isBalanceVisible} />
              </SlidingCard>
            ))}
          </Animated.ScrollView>
        )}
        <LinearGradient
          pointerEvents="none"
          accessible={false}
          colors={[background, "transparent"]}
          start={{ x: 0, y: 0.5 }}
          end={{ x: 1, y: 0.5 }}
          style={{
            position: "absolute",
            left: 0,
            top: 0,
            bottom: 0,
            width: PAGE_INSET,
          }}
        />
        <LinearGradient
          pointerEvents="none"
          accessible={false}
          colors={["transparent", background]}
          start={{ x: 0, y: 0.5 }}
          end={{ x: 1, y: 0.5 }}
          style={{
            position: "absolute",
            right: 0,
            top: 0,
            bottom: 0,
            width: PAGE_INSET,
          }}
        />
      </View>
      <View
        className="flex-row items-center justify-center"
        style={{ direction: "ltr" }}
      >
        {cards.map((card, index) => (
          <CardDot
            key={card.id}
            title={t("home.overview.goToCard", {
              name: card.title,
              index: index + 1,
              total: cards.length,
            })}
            index={index}
            width={width}
            offset={offset}
            selected={page === index}
            reducedMotion={reducedMotion}
            onPress={() => selectPage(index)}
          />
        ))}
      </View>
    </View>
  );
});
