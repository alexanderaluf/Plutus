import {
  EdgeToEdgeLayout,
  EdgeToEdgeScrollView,
} from "@/shared/ui/edge-to-edge-layout";
import { Text } from "@/shared/ui/app-text";
import { useRouter } from "expo-router";
import { Button } from "heroui-native";
import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { BackHandler } from "react-native";
import Animated, { Easing, FadeInDown } from "react-native-reanimated";

import { CurrencyConverterPage } from "./components/currency-converter-page";
import { DataBackupPage } from "./components/data-backup-page";
import { LanguageSettingsPage } from "./components/language-settings-page";
import { ProfileAvatar } from "./components/profile-avatar";
import { ProfileHubActions } from "./components/profile-hub-actions";
import { ProfileScreenHeader } from "./components/profile-screen-header";
import { ProfileSettingsPage } from "./components/profile-settings-page";
import { ThemeSettingsPage } from "./components/theme-settings-page";
import { useProfiles } from "./profile-provider";

type ProfilePage =
  "profile" | "settings" | "theme" | "language" | "backup" | "converter";

export function ProfileScreen() {
  const { t } = useTranslation();
  const router = useRouter();
  const { activeProfile } = useProfiles();
  const [page, setPage] = useState<ProfilePage>("profile");
  const firstName = activeProfile.name.split(" ")[0];

  useEffect(() => {
    if (page === "profile") return;

    const subscription = BackHandler.addEventListener(
      "hardwareBackPress",
      () => {
        setPage((current) =>
          current === "theme" ||
          current === "language" ||
          current === "backup" ||
          current === "converter"
            ? "settings"
            : "profile",
        );
        return true;
      },
    );

    return () => subscription.remove();
  }, [page]);

  const title =
    page === "theme"
      ? t("settings.items.theme.title")
      : page === "language"
        ? t("language.title")
        : page === "backup"
          ? t("settings.items.backup.title")
          : page === "converter"
            ? t("settings.items.converter.title")
            : page === "settings"
              ? t("settings.title")
              : t("profile.accountsTitle");

  return (
    <EdgeToEdgeLayout
      header={
        <ProfileScreenHeader
          onBack={
            page === "theme" ||
            page === "language" ||
            page === "backup" ||
            page === "converter"
              ? () => setPage("settings")
              : page === "settings"
                ? () => setPage("profile")
                : undefined
          }
          title={title}
        />
      }
    >
      {page === "settings" ? (
        <ProfileSettingsPage
          onOpenBackup={() => setPage("backup")}
          onOpenConverter={() => setPage("converter")}
          onOpenLanguage={() => setPage("language")}
          onOpenTheme={() => setPage("theme")}
        />
      ) : page === "theme" ? (
        <ThemeSettingsPage />
      ) : page === "language" ? (
        <LanguageSettingsPage />
      ) : page === "backup" ? (
        <DataBackupPage />
      ) : page === "converter" ? (
        <CurrencyConverterPage />
      ) : (
        <EdgeToEdgeScrollView
          className="flex-1"
          contentContainerClassName="px-5"
          contentContainerStyle={{ paddingTop: 40 }}
        >
          <Animated.View
            entering={FadeInDown.duration(380).easing(
              Easing.bezier(0.22, 1, 0.36, 1),
            )}
            className="items-center"
          >
            <ProfileAvatar
              // Left undefined so the avatar follows the theme accent color.
              color={activeProfile.imageUri ? "#242424" : undefined}
              dimension={84}
              imageUri={activeProfile.imageUri}
              initials={activeProfile.initials}
              size="lg"
            />
            <Text className="mt-6 font-manrope-bold text-[26px] text-foreground">
              {t("profile.greeting", { name: firstName })}
            </Text>
            <Button
              size="md"
              variant="outline"
              className="mt-5 rounded-full border-[#b8b8b8] px-6"
              onPress={() =>
                router.push({
                  pathname: "/profile/user",
                  params: { mode: "edit", profileId: activeProfile.id },
                })
              }
            >
              <Button.Label className="font-manrope-bold text-accent">
                {t("profile.manageProfile")}
              </Button.Label>
            </Button>
          </Animated.View>

          <Animated.View
            entering={FadeInDown.delay(90)
              .duration(380)
              .easing(Easing.bezier(0.22, 1, 0.36, 1))}
            className="mt-7"
          >
            <ProfileHubActions
              onAddProfile={() =>
                router.push({
                  pathname: "/profile/user",
                  params: { mode: "create" },
                })
              }
              onManageProfiles={() => router.push("/profile/manage")}
              onSettings={() => setPage("settings")}
            />
          </Animated.View>
        </EdgeToEdgeScrollView>
      )}
    </EdgeToEdgeLayout>
  );
}
