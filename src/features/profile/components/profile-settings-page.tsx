import { useTranslation } from "react-i18next";
import { Alert, Pressable, ScrollView, View } from "react-native";
import Animated, {
  Easing,
  FadeInDown,
  ReduceMotion,
} from "react-native-reanimated";

import { Text } from "@/shared/ui/app-text";
import { FilledIcon, type FilledIconName } from "@/shared/ui/filled-icon";

import { CreditsFooter } from "./credits-footer";

type SettingsItem = {
  id: string;
  description: string;
  icon: FilledIconName;
  iconBackground: string;
  title: string;
  badge?: string;
};

type ProfileSettingsPageProps = {
  onOpenBackup: () => void;
  onOpenConverter: () => void;
  onOpenLanguage: () => void;
  onOpenTheme: () => void;
};

function SettingsRow({
  item,
  onPress,
}: {
  item: SettingsItem;
  onPress?: () => void;
}) {
  const { t } = useTranslation();

  function handlePress() {
    if (onPress) {
      onPress();
      return;
    }
    Alert.alert(item.title, t("settings.unavailableMessage"));
  }

  return (
    <Pressable
      accessibilityHint={item.description}
      accessibilityRole="button"
      className="min-h-[92px] flex-row items-center bg-surface px-4 py-4"
      onPress={handlePress}
      style={({ pressed }) => ({ opacity: pressed ? 0.72 : 1 })}
    >
      <View
        className="size-[48px] items-center justify-center rounded-[14px]"
        style={{ backgroundColor: item.iconBackground }}
      >
        <FilledIcon color="#090909" name={item.icon} size={27} />
      </View>

      <View className="ms-4 flex-1 justify-center">
        <View className="flex-row items-center gap-2">
          <Text className="font-manrope-semibold text-[17px] leading-6 text-foreground">
            {item.title}
          </Text>
          {item.badge ? (
            <View className="rounded-full bg-accent/10 px-2 py-0.5">
              <Text className="font-manrope-semibold text-[11px] text-accent">
                {item.badge}
              </Text>
            </View>
          ) : null}
        </View>
        <Text className="mt-0.5 font-sans text-sm leading-5 text-muted">
          {item.description}
        </Text>
      </View>
    </Pressable>
  );
}

function SettingsGroup({
  items,
  onOpenBackup,
  onOpenConverter,
  onOpenLanguage,
  onOpenTheme,
}: {
  items: SettingsItem[];
  onOpenBackup?: () => void;
  onOpenConverter?: () => void;
  onOpenLanguage?: () => void;
  onOpenTheme?: () => void;
}) {
  return (
    <View className="gap-0.5 overflow-hidden rounded-[28px] bg-background">
      {items.map((item) => (
        <SettingsRow
          item={item}
          key={item.id}
          onPress={
            item.id === "theme"
              ? onOpenTheme
              : item.id === "language"
                ? onOpenLanguage
                : item.id === "backup"
                  ? onOpenBackup
                : item.id === "converter"
                  ? onOpenConverter
                  : undefined
          }
        />
      ))}
    </View>
  );
}

function createRevealAnimation(delay: number) {
  return FadeInDown.duration(420)
    .delay(delay)
    .easing(Easing.bezier(0.22, 1, 0.36, 1))
    .reduceMotion(ReduceMotion.System);
}

export function ProfileSettingsPage({
  onOpenBackup,
  onOpenConverter,
  onOpenLanguage,
  onOpenTheme,
}: ProfileSettingsPageProps) {
  const { t } = useTranslation();
  const primarySettings: SettingsItem[] = [
    {
      id: "theme",
      title: t("settings.items.theme.title"),
      description: t("settings.items.theme.description"),
      icon: "tune",
      iconBackground: "#f187ae",
    },
    {
      id: "language",
      title: t("settings.items.language.title"),
      description: t("settings.items.language.description"),
      icon: "translate",
      iconBackground: "#77c8bd",
    },
    {
      id: "formats",
      title: t("settings.items.formats.title"),
      description: t("settings.items.formats.description"),
      icon: "format-paint",
      iconBackground: "#ffc975",
    },
    {
      id: "backup",
      title: t("settings.items.backup.title"),
      description: t("settings.items.backup.description"),
      icon: "backup",
      iconBackground: "#79bced",
    },
    {
      id: "security",
      title: t("settings.items.security.title"),
      description: t("settings.items.security.description"),
      icon: "notifications-active",
      iconBackground: "#9bd59b",
    },
    {
      id: "money",
      title: t("settings.items.money.title"),
      description: t("settings.items.money.description"),
      icon: "wallet",
      iconBackground: "#ca79da",
    },
    {
      id: "support",
      title: t("settings.items.support.title"),
      description: t("settings.items.support.description"),
      icon: "help",
      iconBackground: "#74c8c5",
    },
    {
      id: "labs",
      title: t("settings.items.labs.title"),
      description: t("settings.items.labs.description"),
      icon: "experiment",
      iconBackground: "#929ce3",
    },
  ];
  const toolSettings: SettingsItem[] = [
    {
      id: "converter",
      title: t("settings.items.converter.title"),
      description: t("settings.items.converter.description"),
      icon: "swap-horizontal",
      iconBackground: "#65c8d9",
    },
    {
      id: "receipts",
      title: t("settings.items.receipts.title"),
      description: t("settings.items.receipts.description"),
      icon: "photo-library",
      iconBackground: "#dbe971",
    },
    {
      id: "net-worth",
      title: t("settings.items.netWorth.title"),
      description: t("settings.items.netWorth.description"),
      icon: "trending-up",
      iconBackground: "#ff9c87",
    },
    {
      id: "achievements",
      title: t("settings.items.achievements.title"),
      description: t("settings.items.achievements.description"),
      icon: "trophy",
      iconBackground: "#a88ce0",
      badge: t("common.beta"),
    },
  ];

  return (
    <ScrollView
      className="flex-1"
      contentContainerClassName="gap-4 px-4 pt-3"
      contentContainerStyle={{ paddingBottom: 28 }}
      contentInsetAdjustmentBehavior="never"
      showsVerticalScrollIndicator={false}
    >
      <Animated.View entering={createRevealAnimation(45)}>
        <SettingsGroup
          items={primarySettings}
          onOpenBackup={onOpenBackup}
          onOpenLanguage={onOpenLanguage}
          onOpenTheme={onOpenTheme}
        />
      </Animated.View>
      <Animated.View entering={createRevealAnimation(130)}>
        <SettingsGroup items={toolSettings} onOpenConverter={onOpenConverter} />
      </Animated.View>
      <Animated.View entering={createRevealAnimation(205)}>
        <CreditsFooter />
      </Animated.View>
    </ScrollView>
  );
}
