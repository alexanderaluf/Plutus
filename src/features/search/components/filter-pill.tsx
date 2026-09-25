import type { ReactNode } from "react";
import { Pressable, View } from "react-native";

import { useAppThemeColors } from "@/shared/theme/app-theme";
import { Text } from "@/shared/ui/app-text";
import { FilledIcon } from "@/shared/ui/filled-icon";

type FilterPillProps = {
  label: string;
  selected?: boolean;
  leading?: ReactNode;
  trailingCount?: number;
  removable?: boolean;
  /** Tighter height and padding; text and icon sizes are unchanged. */
  compact?: boolean;
  accessibilityLabel?: string;
  onPress: () => void;
};

/** One pill style for quick filters, sheet options and removable active filters. */
export function FilterPill({
  label,
  selected = false,
  leading,
  trailingCount,
  removable = false,
  compact = false,
  accessibilityLabel,
  onPress,
}: FilterPillProps) {
  const theme = useAppThemeColors();
  const foreground = selected ? theme.accentForeground : theme.foreground;

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel ?? label}
      accessibilityState={{ selected }}
      hitSlop={compact ? 6 : 4}
      onPress={onPress}
      className={`flex-row items-center rounded-full ${
        compact
          ? `min-h-8 gap-1.5 ${leading ? "ps-1" : "ps-3"} pe-3`
          : "min-h-10 gap-1.5 px-3.5"
      } ${selected ? "bg-accent" : "border border-border bg-surface"}`}
      style={({ pressed }) => ({ opacity: pressed ? 0.7 : 1 })}
    >
      {leading}
      <Text
        numberOfLines={1}
        className="font-manrope-semibold text-[13px]"
        style={{ color: foreground, maxWidth: 180 }}
      >
        {label}
      </Text>
      {trailingCount !== undefined ? (
        <Text
          className="font-manrope-semibold text-[11px]"
          style={{ color: selected ? theme.accentForeground : theme.muted }}
        >
          {trailingCount}
        </Text>
      ) : null}
      {removable ? (
        <View className="-me-1 ms-0.5">
          <FilledIcon color={foreground} name="close" size={15} />
        </View>
      ) : null}
    </Pressable>
  );
}
