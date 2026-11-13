import { useTranslation } from "react-i18next";
import { Pressable, View } from "react-native";

import { Text } from "@/shared/ui/app-text";
import { FilledIcon, type FilledIconName } from "@/shared/ui/filled-icon";

type HomeSectionHeaderProps = {
  title: string;
  count: number;
  subtitle?: string;
  actionLabel: string;
  actionIcon?: FilledIconName;
  onActionPress: () => void;
};

export function HomeSectionHeader({
  title,
  count,
  subtitle,
  actionLabel,
  actionIcon,
  onActionPress,
}: HomeSectionHeaderProps) {
  const { i18n } = useTranslation();

  return (
    <View className="mb-3 flex-row items-center justify-between gap-3">
      <View className="min-w-0 flex-1 gap-0.5">
        <View className="flex-row items-center gap-2">
          <Text
            numberOfLines={1}
            className="min-w-0 shrink font-manrope-bold text-[19px] leading-[24px] tracking-[-0.2px] text-foreground"
          >
            {title}
          </Text>
          <View className="shrink-0 rounded-full border border-border/70 bg-surface px-2.5 py-0.5">
            <Text
              className="font-manrope-semibold text-[11px] leading-[15px] text-muted"
              style={{ fontVariant: ["tabular-nums"] }}
            >
              {count.toLocaleString(i18n.resolvedLanguage)}
            </Text>
          </View>
        </View>
        {subtitle ? (
          <Text
            numberOfLines={1}
            className="font-sans text-[13px] leading-[18px] text-muted"
          >
            {subtitle}
          </Text>
        ) : null}
      </View>

      <Pressable
        accessibilityRole="button"
        hitSlop={6}
        onPress={onActionPress}
        className="min-h-9 shrink-0 flex-row items-center gap-1.5 rounded-full border border-border bg-surface px-3 py-1.5"
        style={({ pressed }) => ({ opacity: pressed ? 0.68 : 1 })}
      >
        {actionIcon ? (
          <FilledIcon name={actionIcon} size={14} tone="accent" />
        ) : null}
        <Text className="font-manrope-semibold text-[12px] leading-[16px] text-accent">
          {actionLabel}
        </Text>
        <FilledIcon name="chevron-right" size={14} tone="accent" />
      </Pressable>
    </View>
  );
}

/**
 * The only control above the categories, budgets and recurring lists: a
 * labelled link to the full management screen, aligned to the reading end.
 */
export function HomeSectionAction({
  label,
  onPress,
}: {
  label: string;
  onPress: () => void;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      hitSlop={6}
      onPress={onPress}
      className="mb-3 min-h-9 flex-row items-center gap-1.5 self-end rounded-full border border-border bg-surface px-3 py-1.5"
      style={({ pressed }) => ({ opacity: pressed ? 0.68 : 1 })}
    >
      <Text className="font-manrope-semibold text-[12px] leading-[16px] text-accent">
        {label}
      </Text>
      <FilledIcon name="chevron-right" size={14} tone="accent" />
    </Pressable>
  );
}
