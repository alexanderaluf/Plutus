import { useEffect, type ReactNode } from "react";
import { useTranslation } from "react-i18next";
import { Pressable, View } from "react-native";
import Animated, {
  ReduceMotion,
  useAnimatedStyle,
  useSharedValue,
  withSequence,
  withTiming,
} from "react-native-reanimated";

import { useAppThemeColors } from "@/shared/theme/app-theme";
import { Text } from "@/shared/ui/app-text";
import { FilledIcon, type FilledIconName } from "@/shared/ui/filled-icon";

import { PIN_LENGTH } from "../app-lock-policy";

/** Filled dots for the digits entered so far; shakes when `errorKey` changes. */
export function PinDots({
  filled,
  errorKey,
}: {
  filled: number;
  errorKey: number;
}) {
  const c = useAppThemeColors();
  const offset = useSharedValue(0);
  useEffect(() => {
    if (!errorKey) return;
    const step = (x: number) =>
      withTiming(x, { duration: 55, reduceMotion: ReduceMotion.System });
    offset.set(withSequence(step(-10), step(10), step(-7), step(7), step(0)));
  }, [errorKey, offset]);
  const shake = useAnimatedStyle(() => ({
    transform: [{ translateX: offset.get() }],
  }));

  return (
    <Animated.View
      accessibilityLabel={`${filled}/${PIN_LENGTH}`}
      className="flex-row justify-center gap-4"
      style={shake}
    >
      {Array.from({ length: PIN_LENGTH }, (_, index) => (
        <View
          key={index}
          className="size-4 rounded-full border-2"
          style={{
            borderColor: errorKey && filled === 0 ? c.danger : c.accent,
            backgroundColor: index < filled ? c.accent : "transparent",
          }}
        />
      ))}
    </Animated.View>
  );
}

type KeypadAction = {
  icon: FilledIconName;
  label: string;
  onPress: () => void;
};

function Key({
  label,
  accessibilityLabel,
  disabled,
  onPress,
  children,
}: {
  label?: string;
  accessibilityLabel: string;
  disabled?: boolean;
  onPress: () => void;
  children?: ReactNode;
}) {
  return (
    <Pressable
      accessibilityLabel={accessibilityLabel}
      accessibilityRole="button"
      disabled={disabled}
      onPress={onPress}
      className="size-[74px] items-center justify-center rounded-full bg-surface"
      style={({ pressed }) => ({
        opacity: disabled ? 0.4 : pressed ? 0.6 : 1,
        transform: [{ scale: pressed ? 0.94 : 1 }],
      })}
    >
      {label ? (
        <Text
          allowFontScaling={false}
          className="font-manrope-semibold text-[28px] text-foreground"
          style={{ writingDirection: "ltr" }}
        >
          {label}
        </Text>
      ) : (
        children
      )}
    </Pressable>
  );
}

/** Phone-style keypad; digit order stays left-to-right in every language. */
export function PinKeypad({
  disabled,
  extraAction,
  onDigit,
  onDelete,
}: {
  disabled?: boolean;
  /** Bottom-left key, such as biometric or device unlock. */
  extraAction?: KeypadAction;
  onDigit: (digit: string) => void;
  onDelete: () => void;
}) {
  const { t } = useTranslation();
  const rows = [
    ["1", "2", "3"],
    ["4", "5", "6"],
    ["7", "8", "9"],
  ];

  return (
    <View className="items-center gap-4" style={{ direction: "ltr" }}>
      {rows.map((row) => (
        <View key={row[0]} className="flex-row gap-6">
          {row.map((digit) => (
            <Key
              key={digit}
              label={digit}
              accessibilityLabel={digit}
              disabled={disabled}
              onPress={() => onDigit(digit)}
            />
          ))}
        </View>
      ))}
      <View className="flex-row gap-6">
        {extraAction ? (
          <Key
            accessibilityLabel={extraAction.label}
            onPress={extraAction.onPress}
          >
            <FilledIcon name={extraAction.icon} size={30} tone="accent" />
          </Key>
        ) : (
          <View className="size-[74px]" />
        )}
        <Key
          label="0"
          accessibilityLabel="0"
          disabled={disabled}
          onPress={() => onDigit("0")}
        />
        <Key
          accessibilityLabel={t("security.pin.delete")}
          disabled={disabled}
          onPress={onDelete}
        >
          <FilledIcon name="backspace" size={26} tone="muted" />
        </Key>
      </View>
    </View>
  );
}
