import { Button, Dialog } from "heroui-native";
import { useTranslation } from "react-i18next";
import { ScrollView, View } from "react-native";

import { Text } from "@/shared/ui/app-text";

import { FilledIcon, type FilledIconName } from "@/shared/ui/filled-icon";
import { useLocalData } from "@/data/local-data-provider";

import { BackupManagement } from "./backup-management";

type ProfileSettingsDialogProps = {
  isOpen: boolean;
  onOpenChange: (isOpen: boolean) => void;
};

export function ProfileSettingsDialog({
  isOpen,
  onOpenChange,
}: ProfileSettingsDialogProps) {
  const { t } = useTranslation();
  const { document } = useLocalData();
  const settings = [
    {
      label: t("theme.appearance"),
      value: t(`theme.modes.${document._local.themeMode}`),
      icon: "weather-night",
    },
    {
      label: t("settings.dialog.defaultCurrency"),
      value: "USD",
      icon: "currency-usd",
    },
    {
      label: t("settings.dialog.notifications"),
      value: t("settings.dialog.enabled"),
      icon: "bell",
    },
  ] satisfies Array<{ label: string; value: string; icon: FilledIconName }>;

  return (
    <Dialog isOpen={isOpen} onOpenChange={onOpenChange}>
      <Dialog.Portal>
        <Dialog.Overlay />
        <Dialog.Content className="max-h-[85%] gap-5 border border-border bg-overlay">
          <Dialog.Close variant="ghost">
            <FilledIcon name="close" size={19} />
          </Dialog.Close>
          <View className="gap-1.5 pe-8">
            <Dialog.Title className="font-manrope-bold">
              {t("settings.title")}
            </Dialog.Title>
            <Dialog.Description>
              {t("settings.dialog.description")}
            </Dialog.Description>
          </View>

          <ScrollView showsVerticalScrollIndicator={false}>
            <View className="gap-5 pb-1">
              <View className="overflow-hidden rounded-lg border border-border bg-surface-secondary">
                {settings.map((setting, index) => {
                  return (
                    <View
                      key={setting.label}
                      className={`flex-row items-center px-4 py-4 ${
                        index < settings.length - 1
                          ? "border-b border-border"
                          : ""
                      }`}
                    >
                      <FilledIcon
                        name={setting.icon}
                        size={20}
                        tone="accent"
                      />
                      <Text className="ms-3 flex-1 font-manrope-semibold text-sm text-foreground">
                        {setting.label}
                      </Text>
                      <Text className="font-sans text-xs text-muted">
                        {setting.value}
                      </Text>
                    </View>
                  );
                })}
              </View>

              <View className="gap-2">
                <Text className="font-manrope-bold text-sm text-foreground">
                  {t("settings.items.backup.title")}
                </Text>
                <Text className="font-sans text-xs leading-4 text-muted">
                  {t("settings.dialog.backupDescription")}
                </Text>
                <BackupManagement />
              </View>
            </View>
          </ScrollView>

          <Button onPress={() => onOpenChange(false)}>
            <Button.Label>{t("settings.dialog.done")}</Button.Label>
          </Button>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog>
  );
}
