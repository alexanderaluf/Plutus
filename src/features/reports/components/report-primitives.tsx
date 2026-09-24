import type { PropsWithChildren } from "react";
import { View } from "react-native";
import { Text } from "@/shared/ui/app-text";
import { FilledIcon, type FilledIconName } from "@/shared/ui/filled-icon";

export function ReportPanel({ children }: PropsWithChildren) {
  return (
    <View className="gap-5 rounded-[28px] bg-surface p-5">{children}</View>
  );
}

export function ReportHeading({
  icon,
  title,
  detail,
}: {
  icon: FilledIconName;
  title: string;
  detail?: string;
}) {
  return (
    <View className="flex-row flex-wrap items-center gap-2">
      <FilledIcon name={icon} size={19} tone="muted" />
      <Text className="flex-1 font-manrope-bold text-base text-foreground">
        {title}
      </Text>
      {detail ? (
        <Text className="font-sans text-xs text-muted">{detail}</Text>
      ) : null}
    </View>
  );
}

export function ReportMetric({
  icon,
  label,
  value,
  tone = "foreground",
}: {
  icon: FilledIconName;
  label: string;
  value: string;
  tone?: "foreground" | "success" | "danger";
}) {
  return (
    <View
      style={{ flexGrow: 1, flexBasis: "42%", minWidth: 115 }}
      className="gap-2 rounded-2xl bg-surface-secondary p-4"
    >
      <View className="flex-row items-center gap-2">
        <FilledIcon name={icon} size={17} tone={tone} />
        <Text className="flex-1 font-sans text-xs text-muted">{label}</Text>
      </View>
      <Text
        selectable
        className={`font-manrope-bold text-xl ${tone === "success" ? "text-success" : tone === "danger" ? "text-danger" : "text-foreground"}`}
        style={{ fontVariant: ["tabular-nums"] }}
      >
        {value}
      </Text>
    </View>
  );
}
