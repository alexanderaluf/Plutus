import { createContext, use, useState, type ReactNode } from "react";
import {
  ScrollView,
  StyleSheet,
  View,
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

const ContentInsetsContext = createContext<EdgeInsets | null>(null);

export function useEdgeToEdgeContentInsets() {
  const safeInsets = useSafeAreaInsets();
  return use(ContentInsetsContext) ?? safeInsets;
}

/** Fixed controls stay safe; the scrolling viewport reaches every phone edge. */
export function EdgeToEdgeLayout({
  children,
  header,
  footer,
  bottomFade = true,
}: {
  children: ReactNode | ((contentInsets: EdgeInsets) => ReactNode);
  header?: ReactNode;
  footer?: ReactNode;
  bottomFade?: boolean;
}) {
  const safeInsets = useSafeAreaInsets();
  const { background } = useAppThemeColors();
  const [headerHeight, setHeaderHeight] = useState(header ? 56 : 0);
  const [footerHeight, setFooterHeight] = useState(footer ? 64 : 0);
  const contentInsets = {
    ...safeInsets,
    top: safeInsets.top + (header ? headerHeight : 0),
    bottom: safeInsets.bottom + (footer ? footerHeight : 0),
  };

  return (
    <ContentInsetsContext value={contentInsets}>
      <View style={{ flex: 1, backgroundColor: background }}>
        {typeof children === "function" ? children(contentInsets) : children}
        <TopSafeAreaGradient />
        {bottomFade && <BottomSafeAreaGradient fadeHeight={128} />}
        {header && (
          <View
            onLayout={({ nativeEvent }) =>
              setHeaderHeight(nativeEvent.layout.height)
            }
            style={{
              position: "absolute",
              top: safeInsets.top,
              left: safeInsets.left,
              right: safeInsets.right,
              zIndex: 20,
            }}
          >
            {header}
          </View>
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
    </ContentInsetsContext>
  );
}

/** Apply safety to content padding, never to the viewport or an opaque safe-area band. */
export function EdgeToEdgeScrollView({
  contentContainerStyle,
  ...props
}: ScrollViewProps) {
  const insets = useEdgeToEdgeContentInsets();
  const contentStyle = StyleSheet.flatten(contentContainerStyle) ?? {};
  return (
    <ScrollView
      {...props}
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
