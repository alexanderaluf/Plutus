import { Button, Checkbox, Dialog } from "heroui-native";
import { useTranslation } from "react-i18next";
import { Pressable, View } from "react-native";

import { useAppThemeColors } from "@/shared/theme/app-theme";
import { Text } from "@/shared/ui/app-text";
import { FilledIcon } from "@/shared/ui/filled-icon";

/**
 * Leaving the chat frees the model and deletes the conversation. The dialog
 * says so plainly and gives both choices full-width, easy-to-hit buttons.
 */
export function LeaveChatDialog({
  isOpen,
  doNotShowAgain,
  onDoNotShowAgainChange,
  onStay,
  onLeave,
}: {
  isOpen: boolean;
  doNotShowAgain: boolean;
  onDoNotShowAgainChange: (value: boolean) => void;
  onStay: () => void;
  onLeave: () => void;
}) {
  const { t } = useTranslation();
  const { danger } = useAppThemeColors();
  return (
    <Dialog isOpen={isOpen} onOpenChange={(open) => !open && onStay()}>
      <Dialog.Portal>
        <Dialog.Overlay />
        <Dialog.Content className="gap-5 border border-border bg-overlay">
          <View className="items-center gap-3">
            <View className="size-14 items-center justify-center rounded-full bg-danger/15">
              <FilledIcon name="delete" size={28} color={danger} />
            </View>
            <View className="items-center gap-1.5">
              <Dialog.Title className="text-center font-manrope-bold">
                {t("localAI.exitTitle")}
              </Dialog.Title>
              <Dialog.Description className="text-center">
                {t("localAI.exitDescription")}
              </Dialog.Description>
            </View>
          </View>

          <Pressable
            accessibilityRole="checkbox"
            accessibilityState={{ checked: doNotShowAgain }}
            onPress={() => onDoNotShowAgainChange(!doNotShowAgain)}
            className="flex-row items-center gap-3 rounded-2xl border border-border bg-surface-secondary px-4 py-3.5"
          >
            <Checkbox
              // The unchecked fill matches the dialog surface; outline it.
              className={doNotShowAgain ? undefined : "border-2 border-muted"}
              isSelected={doNotShowAgain}
              onSelectedChange={onDoNotShowAgainChange}
              accessibilityLabel={t("localAI.doNotShowAgain")}
            />
            <View className="flex-1 gap-0.5">
              <Text className="font-manrope-semibold text-foreground">
                {t("localAI.doNotShowAgain")}
              </Text>
              <Text className="text-sm text-muted">
                {t("localAI.doNotShowAgainHint")}
              </Text>
            </View>
          </Pressable>

          <View className="gap-2.5">
            <Button variant="danger" size="lg" onPress={onLeave}>
              <Button.Label>{t("localAI.leave")}</Button.Label>
            </Button>
            <Button variant="tertiary" size="lg" onPress={onStay}>
              <Button.Label>{t("localAI.stay")}</Button.Label>
            </Button>
          </View>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog>
  );
}
