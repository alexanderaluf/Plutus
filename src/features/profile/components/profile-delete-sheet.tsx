import { Button } from "heroui-native";
import { BottomSheet } from "@/shared/ui/app-bottom-sheet";
import { useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { Platform, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { Text } from "@/shared/ui/app-text";
import { AppBottomSheetPortal } from "@/shared/ui/app-bottom-sheet-portal";
import { FilledIcon } from "@/shared/ui/filled-icon";
import { useBottomSheetInitialPositionFix } from "@/shared/ui/use-bottom-sheet-initial-position-fix";

import { useProfiles } from "../profile-provider";
import type { UserProfile } from "../types";

export function ProfileDeleteSheet({
  profile,
  onDismiss,
}: {
  profile: UserProfile;
  onDismiss: () => void;
}) {
  const { t } = useTranslation();
  const insets = useSafeAreaInsets();
  const { profiles, deleteProfile } = useProfiles();
  const [isOpen, setIsOpen] = useState(Platform.OS === "ios");
  const initialPositionFix = useBottomSheetInitialPositionFix(isOpen);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const saving = useRef(false);
  const openingFrame = useRef<number | null>(null);
  const openingScheduled = useRef(Platform.OS === "ios");
  const closing = useRef(false);

  useEffect(() => {
    return () => {
      if (openingFrame.current !== null)
        cancelAnimationFrame(openingFrame.current);
    };
  }, []);

  function openAfterLayout() {
    if (openingScheduled.current || closing.current) return;
    openingScheduled.current = true;
    // On Android, wait until the portalled content has a layout before
    // transitioning from the sheet's initial closed position.
    openingFrame.current = requestAnimationFrame(() => {
      openingFrame.current = null;
      if (!closing.current) setIsOpen(true);
    });
  }

  function closeSheet() {
    closing.current = true;
    setIsOpen(false);
  }

  async function confirmDelete() {
    if (saving.current) return;
    saving.current = true;
    setBusy(true);
    setError("");
    try {
      await deleteProfile(profile.id);
      closeSheet();
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
        if (!open && !saving.current && isOpen) closeSheet();
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
          onClose={() => {
            // Ignore the native sheet's initial closed position on Android.
            if (closing.current) onDismiss();
          }}
        >
          <View
            onLayout={openAfterLayout}
            className="gap-5"
            style={{ paddingBottom: Math.max(insets.bottom, 16) + 12 }}
          >
            <View className="items-center gap-3">
              <View className="size-14 items-center justify-center rounded-full bg-danger/10">
                <FilledIcon name="delete" size={30} tone="danger" />
              </View>
              <BottomSheet.Title className="text-center text-danger">
                {t("profile.manage.delete.title", {
                  name: profile.name,
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
                onPress={closeSheet}
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
