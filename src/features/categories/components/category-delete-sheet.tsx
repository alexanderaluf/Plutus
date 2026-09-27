import { WarningFill } from "@material-symbols-svg/react-native/rounded/icons/warning";
import { Button } from "heroui-native";
import { BottomSheet } from "@/shared/ui/app-bottom-sheet";
import { useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { Platform, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useLocalData } from "@/data/local-data-provider";
import { deleteCategory } from "@/data/model/category-record";
import type { Category } from "@/data/selectors/category-selectors";
import { selectCategories } from "@/data/selectors/document-selectors";
import { Text } from "@/shared/ui/app-text";
import { AppBottomSheetPortal } from "@/shared/ui/app-bottom-sheet-portal";
import { useBottomSheetInitialPositionFix } from "@/shared/ui/use-bottom-sheet-initial-position-fix";

export function CategoryDeleteSheet({
  category,
  onDismiss,
  onDeleted,
}: {
  category: Category;
  onDismiss: () => void;
  onDeleted: (id: string) => void;
}) {
  const { t } = useTranslation();
  const insets = useSafeAreaInsets();
  const { document, updateDocument } = useLocalData();
  const [isOpen, setIsOpen] = useState(Platform.OS === "ios");
  const initialPositionFix = useBottomSheetInitialPositionFix(isOpen);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const saving = useRef(false);
  const deleted = useRef(false);
  const openingFrame = useRef<number | null>(null);
  const openingScheduled = useRef(Platform.OS === "ios");
  const closing = useRef(false);
  const [children] = useState(() =>
    selectCategories(document).filter((item) => item.parentId === category.id),
  );
  useEffect(() => {
    return () => {
      if (openingFrame.current !== null)
        cancelAnimationFrame(openingFrame.current);
    };
  }, []);
  function openAfterLayout() {
    if (openingScheduled.current || closing.current) return;
    openingScheduled.current = true;
    // HeroUI's portal mounts asynchronously. Its sheet starts at index -1 and
    // opens only when the mounted content observes false -> true. Wait for the
    // native content layout, rather than opening in the parent's mount effect.
    openingFrame.current = requestAnimationFrame(() => {
      openingFrame.current = null;
      if (!closing.current) setIsOpen(true);
    });
  }
  function closeSheet() {
    closing.current = true;
    setIsOpen(false);
  }
  async function confirm() {
    if (saving.current) return;
    saving.current = true;
    setBusy(true);
    setError("");
    try {
      await updateDocument((current) =>
        deleteCategory(current, category.id, new Date().toISOString()),
      );
      deleted.current = true;
      closeSheet();
    } catch (reason) {
      saving.current = false;
      setBusy(false);
      setError(
        reason instanceof Error ? reason.message : t("categories.delete.error"),
      );
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
            // Ignore the native sheet's initial closed position during mount.
            if (!closing.current) return;
            if (deleted.current) onDeleted(category.id);
            else if (!saving.current) onDismiss();
          }}
        >
          <View
            onLayout={openAfterLayout}
            className="gap-5"
            style={{ paddingBottom: Math.max(insets.bottom, 16) + 12 }}
          >
            <View className="items-center gap-3">
              <View className="size-14 items-center justify-center rounded-full bg-danger/10">
                <WarningFill size={30} color="#ef666d" />
              </View>
              <BottomSheet.Title className="text-center text-danger">
                {category.parentId
                  ? t("categories.delete.subcategoryTitle")
                  : t("categories.delete.parentTitle")}
              </BottomSheet.Title>
            </View>
            <BottomSheet.Description className="font-sans text-base leading-6">
              {t("categories.delete.description", { name: category.name })}
            </BottomSheet.Description>
            {children.length > 0 && (
              <View className="gap-2 rounded-2xl bg-danger/10 p-4">
                <Text className="font-manrope-semibold text-sm text-foreground">
                  {t("categories.delete.childrenHeading")}
                </Text>
                {children.slice(0, 4).map((child) => (
                  <Text key={child.id} className="font-sans text-sm text-muted">
                    • {child.name}
                  </Text>
                ))}
                {children.length > 4 && (
                  <Text className="font-sans text-sm text-muted">
                    {t("categories.delete.more", {
                      count: children.length - 4,
                    })}
                  </Text>
                )}
              </View>
            )}
            {!category.parentId && (
              <Text className="font-sans text-sm leading-5 text-muted">
                {t("categories.delete.subcategoryHelp")}
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
                <Button.Label>{t("categories.delete.cancel")}</Button.Label>
              </Button>
              <Button
                variant="danger"
                className="flex-1"
                isDisabled={busy}
                accessibilityState={{ busy }}
                onPress={confirm}
              >
                <Button.Label>
                  {busy
                    ? t("categories.delete.deleting")
                    : t("categories.delete.confirm")}
                </Button.Label>
              </Button>
            </View>
          </View>
        </BottomSheet.Content>
      </AppBottomSheetPortal>
    </BottomSheet>
  );
}
