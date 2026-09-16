import {
  EdgeToEdgeLayout,
  EdgeToEdgeScrollView,
} from "@/shared/ui/edge-to-edge-layout";
import { useLocalSearchParams, useRouter } from "expo-router";
import { Button, Input } from "heroui-native";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import {
  Alert,
  Keyboard,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  View,
} from "react-native";
import { useAppThemeColors } from "@/shared/theme/app-theme";

import { Text } from "@/shared/ui/app-text";
import { FilledIcon } from "@/shared/ui/filled-icon";

import { CurrencySelectorSheet } from "./components/currency-selector-sheet";
import { ProfilePhotoPicker } from "./components/profile-photo-picker";
import { ProfileScreenHeader } from "./components/profile-screen-header";
import { currencies } from "./data/currencies-data";
import { getProfileInitials } from "./lib/profile-utils";
import { useProfiles } from "./profile-provider";

export function UserEditorScreen() {
  const { t, i18n } = useTranslation();
  const router = useRouter();
  const theme = useAppThemeColors();
  const { mode, profileId } = useLocalSearchParams<{
    mode?: "create" | "edit";
    profileId?: string;
  }>();
  const { profiles, createProfile, updateProfile } = useProfiles();
  const profile = profiles.find((item) => item.id === profileId);
  const isEditing = mode !== "create" && Boolean(profile);
  const defaultCurrency =
    currencies.find(
      (currency) => currency.code === profile?.currencyCode.toUpperCase(),
    ) ??
    (profile
      ? {
          code: profile.currencyCode,
          name: profile.currencyName,
          symbol: profile.currencySymbol,
        }
      : undefined);
  const [name, setName] = useState(profile?.name ?? "");
  const [imageUri, setImageUri] = useState(profile?.imageUri);
  const [currency, setCurrency] = useState(defaultCurrency);
  const [isCurrencyOpen, setIsCurrencyOpen] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const canSubmit = name.trim().length > 0 && currency != null;

  async function handleSubmit() {
    if (!canSubmit || !currency || isSaving) return;

    const values = {
      name: name.trim(),
      email:
        profile?.email ??
        `${name
          .trim()
          .toLocaleLowerCase(i18n.resolvedLanguage ?? i18n.language)
          .replace(/\s+/g, ".")}@local.profile`,
      role: profile?.role ?? "Personal",
      imageUri,
      currencyCode: currency.code,
      currencyName: currency.name,
      currencySymbol: currency.symbol,
    };

    setIsSaving(true);
    try {
      if (isEditing && profile) {
        await updateProfile(profile.id, values);
      } else {
        await createProfile(values);
      }
      router.back();
    } catch {
      Alert.alert(
        t("profile.editor.saveErrorTitle"),
        t("profile.editor.saveError"),
      );
    } finally {
      setIsSaving(false);
    }
  }

  return (
    <View style={{ flex: 1, backgroundColor: theme.background }}>
      <KeyboardAvoidingView
        behavior={Platform.OS === "ios" ? "padding" : undefined}
        style={{ flex: 1 }}
      >
        <EdgeToEdgeLayout
          header={<ProfileScreenHeader title={t("profile.editor.title")} />}
          footer={
            <View className="px-5 pb-2 pt-3">
              <Button
                isDisabled={!canSubmit || isSaving}
                size="lg"
                className="h-[50px] rounded-full bg-accent"
                onPress={handleSubmit}
              >
                <Button.Label className="font-manrope-bold text-base text-accent-foreground">
                  {isSaving
                    ? t("profile.editor.saving")
                    : isEditing
                      ? t("profile.editor.update")
                      : t("profile.editor.add")}
                </Button.Label>
              </Button>
            </View>
          }
        >
          <EdgeToEdgeScrollView
            className="flex-1"
            contentContainerClassName="gap-8 px-5 pb-8 pt-6"
            keyboardShouldPersistTaps="handled"
            showsVerticalScrollIndicator={false}
          >
            <ProfilePhotoPicker
              color={profile?.color ?? "#242424"}
              imageUri={imageUri}
              initials={getProfileInitials(name) || "U"}
              onChange={setImageUri}
            />

            <View className="gap-3">
              <Text className="font-manrope-medium text-[15px] text-foreground">
                {t("profile.editor.nameQuestion")}
              </Text>
              <View className="relative justify-center">
                <FilledIcon
                  tone="muted"
                  name="account"
                  size={20}
                  style={{
                    position: "absolute",
                    start: 18,
                    zIndex: 2,
                  }}
                />
                <Input
                  autoCapitalize="words"
                  className="h-[52px] border border-border bg-transparent ps-14 text-left font-manrope-semibold text-base"
                  placeholder={t("profile.editor.namePlaceholder")}
                  value={name}
                  onChangeText={setName}
                />
              </View>
            </View>

            <View className="gap-3">
              <Text className="font-manrope-semibold text-base text-accent">
                {t("profile.editor.currency")}
              </Text>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel={
                  currency
                    ? t("profile.editor.mainCurrencyAccessibility", {
                        name: currency.name,
                        code: currency.code,
                      })
                    : t("profile.editor.chooseMainCurrency")
                }
                accessibilityState={{
                  expanded: isCurrencyOpen,
                  disabled: isSaving,
                }}
                disabled={isSaving}
                className="min-h-[64px] flex-row items-center rounded-2xl border border-border px-4"
                onPress={() => {
                  Keyboard.dismiss();
                  setIsCurrencyOpen(true);
                }}
              >
                {currency ? (
                  <View className="size-9.5 items-center justify-center rounded-full bg-accent">
                    <Text
                      numberOfLines={1}
                      adjustsFontSizeToFit
                      className="px-1 font-manrope-bold text-base text-accent-foreground"
                    >
                      {currency.symbol}
                    </Text>
                  </View>
                ) : null}
                <View className={`${currency ? "ms-4" : "ms-1"} flex-1`}>
                  <Text className="font-manrope-semibold text-base text-foreground">
                    {currency?.name ?? t("profile.editor.currency")}
                  </Text>
                  <Text className="mt-0.5 font-sans text-sm leading-5 text-muted">
                    {currency?.code ??
                      t("profile.editor.chooseCurrencyDescription")}
                  </Text>
                </View>
                <FilledIcon name="chevron-right" size={24} tone="muted" />
              </Pressable>
              <Text className="font-sans text-sm leading-5 text-muted">
                {t(
                  isEditing
                    ? "profile.editor.savedOnDeviceEdit"
                    : "profile.editor.savedOnDeviceCreate",
                )}
              </Text>
            </View>
          </EdgeToEdgeScrollView>
        </EdgeToEdgeLayout>
      </KeyboardAvoidingView>

      <CurrencySelectorSheet
        currencies={currencies}
        isOpen={isCurrencyOpen}
        selectedCode={currency?.code ?? ""}
        onOpenChange={setIsCurrencyOpen}
        onSelect={setCurrency}
      />
    </View>
  );
}
