import { BottomSheet, Button } from "heroui-native";
import { useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { Text } from "@/shared/ui/app-text";
import { AppBottomSheetPortal } from "@/shared/ui/app-bottom-sheet-portal";
import { FilledIcon } from "@/shared/ui/filled-icon";
import { useBottomSheetInitialPositionFix } from "@/shared/ui/use-bottom-sheet-initial-position-fix";

import { useProfiles } from "../profile-provider";
import type { UserProfile } from "../types";

export function ProfileDeleteSheet({
  profile,
  isOpen,
  onDismiss,
}: {
  profile: UserProfile | null;
  isOpen: boolean;
  onDismiss: () => void;
}) {
  const { t } = useTranslation();
  const insets = useSafeAreaInsets();
  const { profiles, deleteProfile } = useProfiles();
  const initialPositionFix = useBottomSheetInitialPositionFix(isOpen);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const saving = useRef(false);

  async function confirmDelete() {
    if (!profile || saving.current) return;
    saving.current = true;
    setBusy(true);
    setError("");
    try {
      await deleteProfile(profile.id);
      onDismiss();
    } catch {
      saving.current = false;
      setBusy(false);
      setError(t("profile.manage.delete.error"));
    }
  }

  return (
    <BottomSheet
      isOpen={isOpen}
      onOpenChange={(open) => {
        if (!open && !saving.current) onDismiss();
      }}
    >
      <AppBottomSheetPortal
        isOpen={isOpen}
        unstable_accessibilityContainerViewIsModal
      >
        <BottomSheet.Overlay isCloseOnPress={!busy} />
        <BottomSheet.Content
          containerStyle={initialPositionFix.containerStyle}
          onChange={initialPositionFix.onChange}
          topInset={insets.top}
          bottomInset={insets.bottom}
          enablePanDownToClose={!busy}
          enableHandlePanningGesture={!busy}
          enableContentPanningGesture={!busy}
          contentContainerClassName="px-5 pb-0 pt-2"
          backgroundClassName="rounded-t-[28px] bg-surface"
          handleIndicatorClassName="w-10 bg-muted/40"
        >
          <View
            className="gap-5"
            style={{ paddingBottom: Math.max(insets.bottom, 16) + 12 }}
          >
            <View className="items-center gap-3">
              <View className="size-14 items-center justify-center rounded-full bg-danger/10">
                <FilledIcon name="delete" size={30} tone="danger" />
              </View>
              <BottomSheet.Title className="text-center text-danger">
                {t("profile.manage.delete.title", {
                  name: profile?.name ?? "",
                })}
              </BottomSheet.Title>
            </View>
            <BottomSheet.Description className="font-sans text-base leading-6">
              {t("profile.manage.delete.description")}
            </BottomSheet.Description>
            {profiles.length === 1 && (
              <Text className="font-sans text-sm leading-5 text-muted">
                {t("profile.manage.delete.lastProfile")}
              </Text>
            )}
            {!!error && (
              <Text accessibilityRole="alert" className="text-danger">
                {error}
              </Text>
            )}
            <View className="flex-row gap-3">
              <Button
                variant="tertiary"
                className="flex-1"
                isDisabled={busy}
                onPress={onDismiss}
              >
                <Button.Label>{t("profile.manage.delete.cancel")}</Button.Label>
              </Button>
              <Button
                variant="danger"
                className="flex-1"
                isDisabled={busy}
                accessibilityState={{ busy }}
                onPress={confirmDelete}
              >
                <Button.Label>
                  {busy
                    ? t("profile.manage.delete.deleting")
                    : t("profile.manage.delete.confirm")}
                </Button.Label>
              </Button>
            </View>
          </View>
        </BottomSheet.Content>
      </AppBottomSheetPortal>
    </BottomSheet>
  );
}
