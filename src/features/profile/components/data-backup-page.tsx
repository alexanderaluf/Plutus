import { EdgeToEdgeScrollView } from "@/shared/ui/edge-to-edge-layout";
import { useTranslation } from "react-i18next";
import { View } from "react-native";

import { Text } from "@/shared/ui/app-text";

import { BackupManagement } from "./backup-management";

export function DataBackupPage() {
  const { t } = useTranslation();

  return (
    <EdgeToEdgeScrollView
      className="flex-1"
      contentContainerClassName="gap-5 px-4 pt-4"
      contentContainerStyle={{ paddingBottom: 32 }}
      contentInsetAdjustmentBehavior="never"
      showsVerticalScrollIndicator={false}
    >
      <View className="gap-1">
        <Text className="font-manrope-bold text-lg text-foreground">
          {t("backup.exportSection")}
        </Text>
        <Text className="font-sans text-sm leading-5 text-muted">
          {t("backup.pageDescription")}
        </Text>
      </View>
      <BackupManagement />
    </EdgeToEdgeScrollView>
  );
}
