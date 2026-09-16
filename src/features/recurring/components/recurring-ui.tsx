import {
  BottomSafeAreaGradient,
  TopSafeAreaGradient,
} from "@/shared/ui/safe-area-gradients";
import { BlurTargetView } from "expo-blur";
import { Button } from "heroui-native";
import {
  useEffect,
  useRef,
  useState,
  type PropsWithChildren,
  type ReactNode,
} from "react";
import {
  Animated,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useAppThemeColors } from "@/shared/theme/app-theme";
import { FilledIcon } from "@/shared/ui/filled-icon";
import { GlassSegmentedControl } from "@/shared/ui/glass-segmented-control";
import { RecordIcon } from "@/shared/ui/record-icon";
import { Text } from "@/shared/ui/app-text";
import { formatCurrency } from "@/shared/lib/currency";
import { colorForeground } from "@/shared/icons/colors";

export function RecurringScrim() {
  return <BottomSafeAreaGradient />;
}
export function RecurringAction({
  label,
  busy,
  error,
  onPress,
}: {
  label: string;
  busy: boolean;
  error?: string;
  onPress: () => void;
}) {
  const insets = useSafeAreaInsets(),
    c = useAppThemeColors();
  return (
    <>
      <RecurringScrim />
      <View
        pointerEvents="box-none"
        style={{
          position: "absolute",
          left: 0,
          right: 0,
          paddingHorizontal: 12,
          bottom: Math.max(insets.bottom, 10),
          gap: 6,
          zIndex: 20,
        }}
      >
        {!!error && (
          <Text accessibilityRole="alert" className="text-sm text-danger">
            {error}
          </Text>
        )}
        <Pressable
          accessibilityRole="button"
          accessibilityState={{ busy, disabled: busy }}
          disabled={busy}
          onPress={onPress}
          style={({ pressed }) => ({
            height: 58,
            borderRadius: 29,
            flexDirection: "row",
            gap: 10,
            alignItems: "center",
            justifyContent: "center",
            backgroundColor: c.accent,
            opacity: busy ? 0.5 : pressed ? 0.72 : 1,
          })}
        >
          <FilledIcon name="save" size={24} tone="accent-foreground" />
          <Text className="font-manrope-bold text-base text-accent-foreground">
            {label}
          </Text>
        </Pressable>
      </View>
    </>
  );
}
export function RecurringEditorShell({
  title,
  value,
  options,
  busy,
  onChange,
  onBack,
  children,
  bottomOverlay,
}: PropsWithChildren<{
  title: string;
  value: number;
  options: { label: string; value: number }[];
  busy: boolean;
  onChange: (value: number) => void;
  onBack: () => void;
  bottomOverlay: ReactNode;
}>) {
  const c = useAppThemeColors(),
    insets = useSafeAreaInsets(),
    target = useRef<View | null>(null);
  const [scrollY] = useState(() => new Animated.Value(0));
  const [hidden, setHidden] = useState(false);
  useEffect(() => {
    let previous = false;
    const listener = scrollY.addListener(({ value }) => {
      const next = value >= 40;
      if (next !== previous) {
        previous = next;
        setHidden(next);
      }
    });
    return () => scrollY.removeListener(listener);
  }, [scrollY]);
  const translateY = scrollY.interpolate({
    inputRange: [0, 56],
    outputRange: [0, -56],
    extrapolate: "clamp",
  });
  const opacity = scrollY.interpolate({
    inputRange: [0, 40],
    outputRange: [1, 0],
    extrapolate: "clamp",
  });
  return (
    <View style={{ flex: 1, backgroundColor: c.background }}>
      <KeyboardAvoidingView
        behavior={Platform.OS === "ios" ? "padding" : "height"}
        style={{ flex: 1 }}
      >
        <View style={{ flex: 1 }}>
          <BlurTargetView ref={target} style={{ flex: 1 }}>
            <Animated.ScrollView
              keyboardShouldPersistTaps="handled"
              showsVerticalScrollIndicator={false}
              contentContainerStyle={{ paddingBottom: 104 + insets.bottom }}
              scrollEventThrottle={16}
              onScroll={Animated.event(
                [{ nativeEvent: { contentOffset: { y: scrollY } } }],
                { useNativeDriver: true },
              )}
            >
              <View style={{ height: 140 + insets.top }} />
              <View
                pointerEvents={busy ? "none" : "auto"}
                className="gap-5 px-4"
              >
                {children}
              </View>
            </Animated.ScrollView>
          </BlurTargetView>
          <TopSafeAreaGradient headerHidden={hidden} />
          <View
            pointerEvents={hidden ? "none" : "box-none"}
            accessibilityElementsHidden={hidden}
            importantForAccessibility={hidden ? "no-hide-descendants" : "auto"}
            style={{
              position: "absolute",
              top: insets.top,
              left: 16,
              right: 16,
              height: 56,
              overflow: "hidden",
              zIndex: 20,
            }}
          >
            <Animated.View
              style={{
                flexDirection: "row",
                alignItems: "center",
                gap: 12,
                height: 56,
                opacity,
                transform: [{ translateY }],
              }}
            >
              <Button
                isIconOnly
                variant="ghost"
                accessibilityLabel="Go back"
                isDisabled={busy}
                onPress={onBack}
              >
                <FilledIcon name="arrow-left" size={24} />
              </Button>
              <Text
                numberOfLines={1}
                className="flex-1 font-manrope-bold text-xl text-foreground"
              >
                {title}
              </Text>
            </Animated.View>
          </View>
          <Animated.View
            pointerEvents={busy ? "none" : "auto"}
            style={{
              position: "absolute",
              top: 64 + insets.top,
              left: 12,
              right: 12,
              zIndex: 20,
              transform: [{ translateY }],
            }}
          >
            <GlassSegmentedControl
              accessibilityLabel={title}
              blurTarget={target}
              minHeight={Platform.OS === "android" ? 52 : 48}
              options={options}
              value={value}
              onChange={onChange}
            />
          </Animated.View>
          {bottomOverlay}
        </View>
      </KeyboardAvoidingView>
    </View>
  );
}
export function RecurringBadge({
  item,
  small = false,
}: {
  item: { icon: string; iconPath: string | null; color: string };
  small?: boolean;
}) {
  return (
    <View
      style={{
        width: small ? 22 : 54,
        height: small ? 22 : 54,
        borderRadius: small ? 8 : 15,
        backgroundColor: item.color,
        alignItems: "center",
        justifyContent: "center",
      }}
    >
      <RecordIcon
        name={item.icon}
        pathData={item.iconPath}
        size={small ? 14 : 29}
        color={colorForeground(item.color)}
      />
    </View>
  );
}
export function MoneyLines({
  values,
  color,
  emptyCurrency = "USD",
  large = false,
}: {
  values: { amount: number; currencyCode: string }[];
  color?: string;
  emptyCurrency?: string;
  large?: boolean;
}) {
  return (
    <View className="gap-1">
      {(values.length
        ? values
        : [{ amount: 0, currencyCode: emptyCurrency }]
      ).map((v) => (
        <Text
          key={v.currencyCode}
          className={`font-manrope-bold ${large ? "text-2xl" : "text-base"} text-foreground`}
          style={color ? { color } : undefined}
        >
          {formatCurrency(v.amount, v.currencyCode)}{" "}
          <Text className="text-xs">{v.currencyCode}</Text>
        </Text>
      ))}
    </View>
  );
}
