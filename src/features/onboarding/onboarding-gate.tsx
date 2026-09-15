import { useState, type PropsWithChildren } from "react";
import { Alert, View } from "react-native";
import { Button } from "heroui-native";
import { useSQLiteContext } from "expo-sqlite";
import { useTranslation } from "react-i18next";
import { clearLocalAttachmentStorage } from "@/data/attachments/attachment-store";
import { useLocalData } from "@/data/local-data-provider";
import { createDefaultBackup } from "@/data/model/default-backup";
import { getSetupStatus } from "@/data/model/onboarding";
import { Text } from "@/shared/ui/app-text";
import { OnboardingScreen } from "./onboarding-screen";
import { StorageRecoveryScreen } from "./storage-recovery-screen";

export function OnboardingGate({ children }: PropsWithChildren) {
  const database = useSQLiteContext();
  const { document, replaceDocument, updateDocument } = useLocalData();
  const { t } = useTranslation();
  const [busy, setBusy] = useState(false);
  const [leaving, setLeaving] = useState(false);
  const status = getSetupStatus(document);
  if (busy || status === "setup")
    return <OnboardingScreen onBusyChange={setBusy} />;
  if (status === "recovery")
    return (
      <StorageRecoveryScreen
        createCurrentSnapshot={() => database.serializeAsync()}
        onReset={async () => {
          await replaceDocument(createDefaultBackup());
          clearLocalAttachmentStorage();
        }}
      />
    );

  async function leaveDemo() {
    Alert.alert(
      t("onboarding.demoExitTitle"),
      t("onboarding.demoExitDescription"),
      [
        { text: t("backup.cancel"), style: "cancel" },
        {
          text: t("onboarding.demoExit"),
          style: "destructive",
          onPress: async () => {
            setLeaving(true);
            try {
              await updateDocument((current) => {
                if (current._local.dataMode !== "demo")
                  throw new Error(t("onboarding.retry"));
                return createDefaultBackup();
              });
            } catch {
              Alert.alert(t("onboarding.failed"), t("onboarding.retry"));
            } finally {
              setLeaving(false);
            }
          },
        },
      ],
    );
  }
  return (
    <View className="flex-1 bg-background">
      {children}
      {document._local.dataMode === "demo" && (
        <View className="flex-row items-center justify-between border-t border-border bg-surface-secondary px-5 pb-5 pt-2">
          <Text className="font-sans text-sm text-foreground">
            {t("onboarding.demoBadge")}
          </Text>
          <Button
            variant="ghost"
            isDisabled={leaving}
            onPress={() => {
              void leaveDemo();
            }}
          >
            <Button.Label>{t("onboarding.demoExit")}</Button.Label>
          </Button>
        </View>
      )}
    </View>
  );
}
