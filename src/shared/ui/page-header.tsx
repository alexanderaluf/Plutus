import type { ReactNode } from "react";
import { View } from "react-native";

import { Text } from "@/shared/ui/app-text";

type PageHeaderProps = {
  eyebrow: string;
  title: string;
  description: string;
  action?: ReactNode;
};

export function PageHeader({
  eyebrow,
  title,
  description,
  action,
}: PageHeaderProps) {
  return (
    <View className="flex-row items-start justify-between gap-4 pt-3">
      <View className="flex-1">
        <Text className="font-manrope-medium text-xs uppercase tracking-widest text-accent">
          {eyebrow}
        </Text>
        <Text className="mt-1 font-manrope-bold text-2xl text-foreground">
          {title}
        </Text>
        <Text className="mt-1 font-sans text-sm leading-5 text-muted">
          {description}
        </Text>
      </View>
      {action}
    </View>
  );
}
