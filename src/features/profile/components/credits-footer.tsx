import { Image, type ImageSource } from "expo-image";
import { useTranslation } from "react-i18next";
import { Alert, Linking, Pressable, StyleSheet, View } from "react-native";

import { colorWithAlpha, useAppThemeColors } from "@/shared/theme/app-theme";
import { Text } from "@/shared/ui/app-text";
import { FilledIcon } from "@/shared/ui/filled-icon";

type CreditLink = {
  accessibilityLabelKey:
    | "credits.links.alexanderAluf.accessibilityLabel"
    | "credits.links.plutus.accessibilityLabel"
    | "credits.links.projectAurora.accessibilityLabel";
  image: ImageSource;
  imageSize?: number;
  subtitleKey:
    | "credits.links.alexanderAluf.subtitle"
    | "credits.links.plutus.subtitle"
    | "credits.links.projectAurora.subtitle";
  titleKey:
    | "credits.links.alexanderAluf.title"
    | "credits.links.plutus.title"
    | "credits.links.projectAurora.title";
  url: string;
};

const developerLinks: CreditLink[] = [
  {
    accessibilityLabelKey: "credits.links.alexanderAluf.accessibilityLabel",
    image: require("../../../../assets/icons-android/alexander-aluf.jpg"),
    subtitleKey: "credits.links.alexanderAluf.subtitle",
    titleKey: "credits.links.alexanderAluf.title",
    url: "https://github.com/alexanderaluf",
  },
  {
    accessibilityLabelKey: "credits.links.plutus.accessibilityLabel",
    image: require("../../../../assets/icons-android/splash-icon-dark.png"),
    imageSize: 68,
    subtitleKey: "credits.links.plutus.subtitle",
    titleKey: "credits.links.plutus.title",
    url: "https://github.com/alexanderaluf/Plutus",
  },
];

const collaborationLink: CreditLink = {
  accessibilityLabelKey: "credits.links.projectAurora.accessibilityLabel",
  image: require("../../../../assets/icons-android/project-aurora.jpg"),
  subtitleKey: "credits.links.projectAurora.subtitle",
  titleKey: "credits.links.projectAurora.title",
  url: "https://github.com/ReWhite-io",
};

function CreditLinkRow({ link }: { link: CreditLink }) {
  const theme = useAppThemeColors();
  const { t } = useTranslation();
  const imageSize = link.imageSize ?? 44;

  async function openLink() {
    try {
      await Linking.openURL(link.url);
    } catch {
      Alert.alert(
        t("credits.openLinkError.title"),
        t("credits.openLinkError.description"),
      );
    }
  }

  return (
    <Pressable
      accessibilityHint={t("credits.openInBrowser")}
      accessibilityLabel={t(link.accessibilityLabelKey)}
      accessibilityRole="link"
      className="flex-row items-center py-2.5"
      onPress={openLink}
      style={({ pressed }) => ({ opacity: pressed ? 0.58 : 1 })}
    >
      <View
        className="overflow-hidden"
        style={{
          borderColor: colorWithAlpha(theme.foreground, 0.1),
          borderWidth: StyleSheet.hairlineWidth,
          borderRadius: imageSize > 44 ? 20 : 14,
          height: imageSize,
          width: imageSize,
        }}
      >
        <Image
          accessibilityLabel=""
          contentFit="cover"
          source={link.image}
          style={styles.image}
        />
      </View>
      <View className="ms-3.5 flex-1">
        <Text className="font-manrope-semibold text-[15px] leading-5 text-foreground">
          {t(link.titleKey)}
        </Text>
        <Text className="mt-0.5 font-sans text-[13px] leading-4 text-muted">
          {t(link.subtitleKey)}
        </Text>
      </View>
      <FilledIcon name="arrow-top-right" size={19} tone="muted" />
    </Pressable>
  );
}

export function CreditsFooter() {
  const theme = useAppThemeColors();
  const { t } = useTranslation();

  return (
    <View
      className="mt-6 pt-7"
      style={{
        borderTopColor: colorWithAlpha(theme.foreground, 0.12),
        borderTopWidth: StyleSheet.hairlineWidth,
      }}
    >
      <Text className="font-sans text-[11px] font-semibold uppercase tracking-[1.6px] text-muted">
        {t("credits.developedBy")}
      </Text>
      <Text className="mt-1.5 font-manrope-bold text-[21px] leading-7 text-foreground">
        {t("credits.links.alexanderAluf.title")}
      </Text>
      <View className="mt-5 gap-3">
        {developerLinks.map((link) => (
          <CreditLinkRow key={link.url} link={link} />
        ))}
      </View>
      <View
        className="mt-8 pt-7"
        style={{
          borderTopColor: colorWithAlpha(theme.foreground, 0.12),
          borderTopWidth: StyleSheet.hairlineWidth,
        }}
      >
        <Text className="font-sans text-[11px] font-semibold uppercase tracking-[1.6px] text-muted">
          {t("credits.inCollaborationWith")}
        </Text>
        <View className="mt-5">
          <CreditLinkRow link={collaborationLink} />
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  image: {
    height: "100%",
    width: "100%",
  },
});
