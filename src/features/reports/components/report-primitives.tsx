import { colorWithAlpha, useAppThemeColors } from "@/shared/theme/app-theme";
import { Text } from "@/shared/ui/app-text";
import { FilledIcon, type FilledIconName } from "@/shared/ui/filled-icon";
import type { PropsWithChildren, ReactNode } from "react";
import { View } from "react-native";

// These mirror the Home overview and Accounts net-worth cards so every tab
// reads as one system: bordered surface, accent icon badge, tabular figures.
export const TABULAR = { fontVariant: ["tabular-nums" as const] };
export const CONTINUOUS = { borderCurve: "continuous" as const };

export function ReportCard({ children }: PropsWithChildren) {
  return (
    <View
      className="gap-4 overflow-hidden rounded-[28px] border border-border bg-surface p-5"
      style={CONTINUOUS}
    >
      {children}
    </View>
  );
}

export function ReportPill({ label }: { label: string }) {
  return (
    <View className="shrink-0 rounded-full border border-border/70 bg-surface-secondary/80 px-2.5 py-1">
      <Text
        className="font-manrope-semibold text-[11px] leading-[14px] tracking-[0.4px] text-muted"
        style={TABULAR}
      >
        {label}
      </Text>
    </View>
  );
}

export function ReportCardHeader({
  icon,
  title,
  trailing,
}: {
  icon: FilledIconName;
  title: string;
  trailing?: ReactNode;
}) {
  const theme = useAppThemeColors();
  return (
    <View className="flex-row items-center gap-2.5">
      <View
        className="size-9 shrink-0 items-center justify-center rounded-xl"
        style={{
          backgroundColor: colorWithAlpha(theme.accent, 0.14),
          borderCurve: "continuous",
        }}
      >
        <FilledIcon name={icon} size={18} tone="accent" />
      </View>
      <Text
        accessibilityRole="header"
        numberOfLines={1}
        className="min-w-0 flex-1 font-manrope-semibold text-[15px] leading-[20px] text-foreground"
      >
        {title}
      </Text>
      {trailing}
    </View>
  );
}

/** Two-part bar: the green share against the red share of the same total. */
export function RatioBar({
  primary,
  secondary,
}: {
  primary: number;
  secondary: number;
}) {
  const theme = useAppThemeColors();
  const total = Math.max(0, primary) + Math.max(0, secondary);
  if (total <= 0) return null;

  return (
    <View
      accessible={false}
      className="h-1.5 w-full flex-row gap-1 overflow-hidden rounded-full bg-surface-secondary"
    >
      {primary > 0 ? (
        <View
          style={{
            backgroundColor: theme.success,
            borderRadius: 999,
            flex: Math.max(primary / total, 0.04),
            height: "100%",
          }}
        />
      ) : null}
      {secondary > 0 ? (
        <View
          style={{
            backgroundColor: theme.danger,
            borderRadius: 999,
            flex: Math.max(secondary / total, 0.04),
            height: "100%",
          }}
        />
      ) : null}
    </View>
  );
}

export function FigureTile({
  dotColor,
  label,
  value,
  toneClass = "text-foreground",
}: {
  dotColor?: string;
  label: string;
  value: string;
  toneClass?: string;
}) {
  return (
    <View
      className="min-w-0 flex-1 gap-1.5 rounded-2xl border border-border/60 bg-surface-secondary/65 px-3.5 py-3"
      style={CONTINUOUS}
    >
      <View className="flex-row items-center gap-1.5">
        {dotColor ? (
          <View
            style={{
              backgroundColor: dotColor,
              borderRadius: 999,
              height: 6,
              width: 6,
            }}
          />
        ) : null}
        <Text
          numberOfLines={1}
          className="min-w-0 flex-1 font-manrope-medium text-[11px] leading-[15px] text-muted"
        >
          {label}
        </Text>
      </View>
      <Text
        adjustsFontSizeToFit
        minimumFontScale={0.72}
        numberOfLines={1}
        selectable
        className={`font-manrope-bold text-[17px] leading-[22px] ${toneClass}`}
        style={TABULAR}
      >
        {value}
      </Text>
    </View>
  );
}

/** A thin share-of-total bar that starts from the reading direction's edge. */
export function ShareBar({ share, color }: { share: number; color: string }) {
  return (
    <View
      accessible={false}
      className="h-1.5 w-full overflow-hidden rounded-full bg-surface-secondary"
    >
      <View
        style={{
          backgroundColor: color,
          borderRadius: 999,
          height: "100%",
          // A sliver keeps tiny shares visible; nothing at all means zero.
          width: share > 0 ? `${Math.min(100, Math.max(share, 2))}%` : 0,
        }}
      />
    </View>
  );
}

export function ReportEmptyState({
  icon,
  message,
}: {
  icon: FilledIconName;
  message: string;
}) {
  return (
    <View
      className="items-center gap-2.5 rounded-[24px] border border-border bg-surface px-6 py-8"
      style={CONTINUOUS}
    >
      <View
        className="size-11 items-center justify-center rounded-2xl bg-surface-secondary"
        style={CONTINUOUS}
      >
        <FilledIcon name={icon} size={20} tone="muted" />
      </View>
      <Text className="text-center font-sans text-[14px] leading-[20px] text-muted">
        {message}
      </Text>
    </View>
  );
}
