import {
  createContext,
  use,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ComponentType,
  type ReactNode,
  type Ref,
} from "react";
import {
  Animated,
  StyleSheet,
  View,
  type FlatListProps,
  type NativeScrollEvent,
  type NativeSyntheticEvent,
  type ScrollViewInstance,
  type ScrollViewProps,
} from "react-native";
import {
  useSafeAreaInsets,
  type EdgeInsets,
} from "react-native-safe-area-context";

import { useAppThemeColors } from "@/shared/theme/app-theme";
import {
  BottomSafeAreaGradient,
  TopSafeAreaGradient,
} from "./safe-area-gradients";

/** Matches the tab pages: the header is fully faded after this much scroll. */
const HEADER_FADE_DISTANCE = 40;

type ScrollEvent = NativeSyntheticEvent<NativeScrollEvent>;

const ContentInsetsContext = createContext<EdgeInsets | null>(null);
const HeaderScrollContext = createContext<Animated.Value | null>(null);

export function useEdgeToEdgeContentInsets() {
  const safeInsets = useSafeAreaInsets();
  return use(ContentInsetsContext) ?? safeInsets;
}

/**
 * Connects a page's main scroller to the collapsing header. Pass the result
 * to an `Animated` ScrollView/FlatList `onScroll` with `scrollEventThrottle`.
 * Mounting a new scroller (another sub-page or list) brings the header back.
 */
export function useEdgeToEdgeScroll(listener?: (event: ScrollEvent) => void) {
  const scrollY = use(HeaderScrollContext);
  const latestListener = useRef(listener);
  useEffect(() => {
    latestListener.current = listener;
  });
  useEffect(() => {
    scrollY?.setValue(0);
  }, [scrollY]);
  // Stable identity, so the native scroll binding is never recreated.
  const forward = useCallback(
    (event: ScrollEvent) => latestListener.current?.(event),
    [],
  );
  return useMemo(
    () =>
      scrollY
        ? // Animated.event only stores `forward` and calls it on scroll
          // events, never during render, so the ref is not read while rendering.
          // eslint-disable-next-line react-hooks/refs
          Animated.event([{ nativeEvent: { contentOffset: { y: scrollY } } }], {
            useNativeDriver: true,
            listener: forward,
          })
        : forward,
    [scrollY, forward],
  );
}

/**
 * Fixed controls stay safe; the scrolling viewport reaches every phone edge.
 * Like the tab pages, the header slides up and fades away while scrolling.
 * `headerDock` holds controls that must stay reachable (filters, period
 * pickers): they follow the header up and then stay pinned below the top edge.
 */
export function EdgeToEdgeLayout({
  children,
  header,
  headerDock,
  footer,
  bottomFade = true,
}: {
  children: ReactNode | ((contentInsets: EdgeInsets) => ReactNode);
  header?: ReactNode;
  headerDock?: ReactNode;
  footer?: ReactNode;
  bottomFade?: boolean;
}) {
  const safeInsets = useSafeAreaInsets();
  const { background } = useAppThemeColors();
  const [headerHeight, setHeaderHeight] = useState(header ? 56 : 0);
  const [dockHeight, setDockHeight] = useState(0);
  const [footerHeight, setFooterHeight] = useState(footer ? 64 : 0);
  const [scrollY] = useState(() => new Animated.Value(0));
  const [headerHidden, setHeaderHidden] = useState(false);
  const contentInsets = {
    ...safeInsets,
    top:
      safeInsets.top +
      (header ? headerHeight : 0) +
      (headerDock ? dockHeight : 0),
    bottom: safeInsets.bottom + (footer ? footerHeight : 0),
  };
  const travel = Math.max(1, header ? headerHeight : 0);

  useEffect(() => {
    let previous: boolean | undefined;
    const listener = scrollY.addListener(({ value }) => {
      const hidden = value >= HEADER_FADE_DISTANCE;
      if (hidden === previous) return;
      previous = hidden;
      setHeaderHidden(hidden);
    });
    return () => scrollY.removeListener(listener);
  }, [scrollY]);

  const { translateY, opacity } = useMemo(
    () => ({
      translateY: scrollY.interpolate({
        inputRange: [0, travel],
        outputRange: [0, -travel],
        extrapolate: "clamp",
      }),
      opacity: scrollY.interpolate({
        inputRange: [0, Math.min(HEADER_FADE_DISTANCE, travel)],
        outputRange: [1, 0],
        extrapolate: "clamp",
      }),
    }),
    [scrollY, travel],
  );
  const isHidden = !!header && headerHidden;

  return (
    <ContentInsetsContext value={contentInsets}>
      <HeaderScrollContext value={header ? scrollY : null}>
        <View style={{ flex: 1, backgroundColor: background }}>
          {typeof children === "function" ? children(contentInsets) : children}
          {/* A pinned dock keeps the taller fade so rows pass under it softly. */}
          <TopSafeAreaGradient headerHidden={isHidden && !headerDock} />
          {bottomFade && <BottomSafeAreaGradient fadeHeight={128} />}
          {header && (
            <View
              collapsable={false}
              pointerEvents={isHidden ? "none" : "box-none"}
              accessibilityElementsHidden={isHidden}
              importantForAccessibility={
                isHidden ? "no-hide-descendants" : "auto"
              }
              style={{
                position: "absolute",
                top: safeInsets.top,
                left: safeInsets.left,
                right: safeInsets.right,
                zIndex: 20,
                // Keeps the sliding header out of the status bar area.
                overflow: "hidden",
              }}
            >
              <Animated.View
                onLayout={({ nativeEvent }) =>
                  setHeaderHeight(nativeEvent.layout.height)
                }
                style={{ opacity, transform: [{ translateY }] }}
              >
                {header}
              </Animated.View>
            </View>
          )}
          {headerDock && (
            <Animated.View
              onLayout={({ nativeEvent }) =>
                setDockHeight(nativeEvent.layout.height)
              }
              style={{
                position: "absolute",
                top: safeInsets.top + (header ? headerHeight : 0),
                left: safeInsets.left,
                right: safeInsets.right,
                zIndex: 20,
                transform: [{ translateY }],
              }}
            >
              {headerDock}
            </Animated.View>
          )}
          {footer && (
            <View
              onLayout={({ nativeEvent }) =>
                setFooterHeight(nativeEvent.layout.height)
              }
              style={{
                position: "absolute",
                bottom: safeInsets.bottom,
                left: safeInsets.left,
                right: safeInsets.right,
                zIndex: 20,
              }}
            >
              {footer}
            </View>
          )}
        </View>
      </HeaderScrollContext>
    </ContentInsetsContext>
  );
}

/** Apply safety to content padding, never to the viewport or an opaque safe-area band. */
export function EdgeToEdgeScrollView({
  contentContainerStyle,
  onScroll,
  ref,
  ...props
}: ScrollViewProps & { ref?: Ref<ScrollViewInstance> }) {
  const insets = useEdgeToEdgeContentInsets();
  const onHeaderScroll = useEdgeToEdgeScroll(onScroll ?? undefined);
  const contentStyle = StyleSheet.flatten(contentContainerStyle) ?? {};
  return (
    <Animated.ScrollView
      scrollEventThrottle={16}
      {...props}
      ref={ref as never}
      onScroll={onHeaderScroll}
      contentInsetAdjustmentBehavior="never"
      automaticallyAdjustContentInsets={false}
      contentContainerStyle={[
        contentContainerStyle,
        {
          paddingTop:
            insets.top +
            (typeof contentStyle.paddingTop === "number"
              ? contentStyle.paddingTop
              : 24),
          paddingBottom:
            insets.bottom +
            (typeof contentStyle.paddingBottom === "number"
              ? contentStyle.paddingBottom
              : 32),
        },
      ]}
    />
  );
}

/**
 * A page list that drives the collapsing header. Unlike EdgeToEdgeScrollView
 * it leaves padding to the caller, which usually reads the content insets.
 */
export function EdgeToEdgeFlatList<Item>({
  onScroll,
  ...props
}: FlatListProps<Item>) {
  const onHeaderScroll = useEdgeToEdgeScroll(onScroll ?? undefined);
  const List = Animated.FlatList as unknown as ComponentType<
    FlatListProps<Item>
  >;
  return <List scrollEventThrottle={16} {...props} onScroll={onHeaderScroll} />;
}

/** A plain page scroller (caller-owned padding) that drives the header. */
export function EdgeToEdgeHeaderScrollView({
  onScroll,
  ref,
  ...props
}: ScrollViewProps & { ref?: Ref<ScrollViewInstance> }) {
  const onHeaderScroll = useEdgeToEdgeScroll(onScroll ?? undefined);
  return (
    <Animated.ScrollView
      scrollEventThrottle={16}
      {...props}
      ref={ref as never}
      onScroll={onHeaderScroll}
    />
  );
}
