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
  FadeInDown,
  ReduceMotion,
} from "react-native-reanimated";
import {
  CollapsingHeader,
  CollapsingHeaderSpacer,
  useCollapsingHeader,
} from "@/shared/ui/collapsing-header";

const INITIAL_DELAY = 45;
const STAGGER_DELAY = 85;
const REVEAL_DURATION = 420;

export function TabPage({
  children,
  contentBottomInset = 106,
  header,
  headerHeight = 56,
}: PropsWithChildren<{
  contentBottomInset?: number;
  header?: ReactNode;
  headerHeight?: number;
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
        {sections.map((section, index) => (
          <Animated.View
            key={
              isValidElement(section) && section.key != null
                ? section.key
                : `section-${index}`
            }
            entering={FadeInDown.duration(REVEAL_DURATION)
              .delay(INITIAL_DELAY + index * STAGGER_DELAY)
              .easing(Easing.bezier(0.22, 1, 0.36, 1))
              .reduceMotion(ReduceMotion.System)}
          >
            {section}
          </Animated.View>
        ))}
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
