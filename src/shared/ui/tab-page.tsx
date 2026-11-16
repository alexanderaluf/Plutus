import {
  Children,
  isValidElement,
  type PropsWithChildren,
  type ReactNode,
} from "react";
import { Animated as NativeAnimated, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import Animated, {
  Easing,
  LinearTransition,
  ReduceMotion,
} from "react-native-reanimated";
import {
  CollapsingHeader,
  CollapsingHeaderSpacer,
  useCollapsingHeader,
} from "@/shared/ui/collapsing-header";
import {
  entranceAnimation,
  listEntranceDelay,
} from "@/shared/ui/entrance-motion";

export function TabPage({
  children,
  contentBottomInset = 106,
  header,
  headerHeight = 56,
  animateLayout = false,
  entryKey,
}: PropsWithChildren<{
  contentBottomInset?: number;
  header?: ReactNode;
  headerHeight?: number;
  animateLayout?: boolean;
  /**
   * When set, sections enter one after another, top to bottom; a new value
   * replays the entrance (see `useTabEntryKey`).
   */
  entryKey?: number;
}>) {
  const sections = Children.toArray(children);
  const insets = useSafeAreaInsets();
  const { headerHidden, onScroll, scrollY } = useCollapsingHeader();

  return (
    <View style={{ flex: 1 }}>
      <NativeAnimated.ScrollView
        className="flex-1"
        contentContainerClassName="gap-7 px-5"
        contentContainerStyle={{
          paddingBottom: contentBottomInset + insets.bottom,
          paddingTop: header ? 0 : insets.top,
        }}
        contentInsetAdjustmentBehavior="never"
        keyboardShouldPersistTaps="handled"
        onScroll={header ? onScroll : undefined}
        scrollEventThrottle={16}
        showsVerticalScrollIndicator={false}
      >
        {header ? <CollapsingHeaderSpacer height={headerHeight} /> : null}
        {sections.map((section, index) => {
          const key =
            isValidElement(section) && section.key != null
              ? section.key
              : `section-${index}`;
          const entering =
            entryKey === undefined
              ? undefined
              : index === 0
                ? entranceAnimation()
                : entranceAnimation(listEntranceDelay(index - 1));
          return animateLayout || entering ? (
            <Animated.View
              layout={
                animateLayout
                  ? LinearTransition.duration(180)
                      .easing(Easing.bezier(0.77, 0, 0.175, 1))
                      .reduceMotion(ReduceMotion.System)
                  : undefined
              }
              entering={entering}
              key={entryKey === undefined ? key : `${key}:${entryKey}`}
            >
              {section}
            </Animated.View>
          ) : (
            <View key={key}>{section}</View>
          );
        })}
      </NativeAnimated.ScrollView>
      {header ? (
        <CollapsingHeader
          height={headerHeight}
          horizontalInset={20}
          headerHidden={headerHidden}
          scrollY={scrollY}
        >
          {header}
        </CollapsingHeader>
      ) : null}
    </View>
  );
}
