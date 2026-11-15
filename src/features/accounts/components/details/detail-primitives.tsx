import { useEffect } from "react";
import { View } from "react-native";
import Reanimated, {
  Easing,
  ReduceMotion,
  useAnimatedStyle,
  useSharedValue,
  withTiming,
} from "react-native-reanimated";

import { CONTINUOUS, TABULAR } from "@/features/reports/components/report-primitives";
import { colorWithAlpha, useAppThemeColors } from "@/shared/theme/app-theme";
import { Text } from "@/shared/ui/app-text";
import { FilledIcon, type FilledIconName } from "@/shared/ui/filled-icon";

/** Tinted icon square used by every row on the account details page. */
export function RowIcon({
  name,
  color,
}: {
  name: FilledIconName;
  color: string;
}) {
  return (
    <View
      className="size-10 shrink-0 items-center justify-center rounded-xl"
      style={{ ...CONTINUOUS, backgroundColor: colorWithAlpha(color, 0.14) }}
    >
      <FilledIcon name={name} size={20} color={color} />
    </View>
  );
}

/** Small capsule for facts and states: last digits, owner, currency, flags. */
export function InfoChip({
  label,
  icon,
  color,
}: {
  label: string;
  icon?: FilledIconName;
  /** Tints the chip for a state worth noticing (e.g. Default). */
  color?: string;
}) {
  const theme = useAppThemeColors();
  return (
    <View
      className="max-w-full flex-row items-center gap-1.5 rounded-full border px-2.5 py-1"
      style={{
        borderColor: color ? colorWithAlpha(color, 0.3) : theme.border,
        backgroundColor: color
          ? colorWithAlpha(color, theme.isDark ? 0.14 : 0.08)
          : theme.surface,
      }}
    >
      {icon ? (
        <FilledIcon name={icon} size={13} color={color ?? theme.muted} />
      ) : null}
      <Text
        numberOfLines={1}
        className="shrink font-manrope-semibold text-[12px] leading-[16px]"
        style={{ ...TABULAR, color: color ?? theme.muted }}
      >
        {label}
      </Text>
    </View>
  );
}

/** Pill on the reading-end of a card header: a count or a short status. */
export function CountPill({ label, color }: { label: string; color?: string }) {
  const theme = useAppThemeColors();
  return (
    <View
      className="shrink-0 rounded-full px-2.5 py-1"
      style={{
        backgroundColor: color
          ? colorWithAlpha(color, 0.14)
          : theme.surfaceSecondary,
      }}
    >
      <Text
        numberOfLines={1}
        className="font-manrope-bold text-[12px] leading-[16px]"
        style={{ ...TABULAR, color: color ?? theme.muted }}
      >
        {label}
      </Text>
    </View>
  );
}

/** A label on the start edge and its value on the end edge. */
export function DetailLine({ label, value }: { label: string; value: string }) {
  return (
    <View className="flex-row items-center justify-between gap-4">
      <Text
        numberOfLines={1}
        className="min-w-0 shrink font-sans text-[14px] leading-[20px] text-muted"
      >
        {label}
      </Text>
      <Text
        numberOfLines={1}
        className="shrink-0 font-manrope-semibold text-[14px] leading-[20px] text-foreground"
        style={TABULAR}
      >
        {value}
      </Text>
    </View>
  );
}

/** A share bar that grows from empty when the page opens. */
export function AnimatedMeter({
  fraction,
  color,
  accessibilityLabel,
}: {
  fraction: number;
  color: string;
  accessibilityLabel?: string;
}) {
  const theme = useAppThemeColors();
  const clamped = Math.min(1, Math.max(0, fraction));
  const progress = useSharedValue(0);
  useEffect(() => {
    progress.set(
      withTiming(clamped, {
        duration: 900,
        easing: Easing.out(Easing.cubic),
        reduceMotion: ReduceMotion.System,
      }),
    );
  }, [clamped, progress]);
  const fillStyle = useAnimatedStyle(() => ({
    width: `${progress.get() * 100}%`,
  }));
  return (
    <View
      accessibilityRole="progressbar"
      accessibilityLabel={accessibilityLabel}
      accessibilityValue={{ min: 0, max: 100, now: Math.round(clamped * 100) }}
      className="h-2 w-full overflow-hidden rounded-full"
      style={{ backgroundColor: theme.surfaceSecondary }}
    >
      <Reanimated.View
        className="h-full rounded-full"
        style={[{ backgroundColor: color }, fillStyle]}
      />
    </View>
  );
}
