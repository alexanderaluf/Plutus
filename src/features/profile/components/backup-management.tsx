import { Button } from "heroui-native";
import type { TFunction } from "i18next";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { Alert, Pressable, View } from "react-native";

import { Text } from "@/shared/ui/app-text";

import {
    commitStagedAttachments,
    discardStagedAttachments,
    stageAttachments,
} from "@/data/attachments/attachment-store";
import {
  pickAndImportBackup,
  saveBackup,
  shareBackup,
  type BackupFormat,
  type ImportedBackup,
} from "@/data/backup/backup-service";
import { useLocalData } from "@/data/local-data-provider";
import { BACKUP_COLLECTION_KEYS } from "@/data/model/backup-document";
import { cloneBackupDocument } from "@/data/model/normalize-backup";
import { FilledIcon, type FilledIconName } from "@/shared/ui/filled-icon";

type FormatOptionProps = {
  format: BackupFormat;
  icon: FilledIconName;
  label: string;
  description: string;
  isDisabled: boolean;
  isSelected: boolean;
  onSelect: (format: BackupFormat) => void;
};

function FormatOption({
  format,
  icon,
  label,
  description,
  isDisabled,
  isSelected,
  onSelect,
}: FormatOptionProps) {
  return (
    <Pressable
      accessibilityRole="radio"
      accessibilityState={{ checked: isSelected, disabled: isDisabled }}
      disabled={isDisabled}
      className={`min-h-[82px] flex-row items-center rounded-lg border px-4 py-3 ${
        isSelected
          ? "border-accent bg-accent/10"
          : "border-border bg-surface-secondary"
      }`}
      onPress={() => onSelect(format)}
      style={({ pressed }) => ({ opacity: pressed ? 0.72 : 1 })}
    >
      <FilledIcon name={icon} size={21} tone="accent" />
      <View className="ms-3 flex-1 items-start">
        <Text className="font-manrope-semibold text-sm text-foreground">
          {label}
        </Text>
        <Text className="mt-0.5 font-sans text-[11px] text-muted">
          {description}
        </Text>
      </View>
      <View
        className={`size-5 items-center justify-center rounded-full border ${
          isSelected ? "border-accent bg-accent" : "border-muted"
        }`}
      >
        {isSelected ? (
          <FilledIcon name="check" size={14} tone="accent-foreground" />
        ) : null}
      </View>
    </Pressable>
  );
}

function confirmRestore(imported: ImportedBackup, t: TFunction) {
  return new Promise<boolean>((resolve) => {
    if (imported.format === "csv") {
      resolve(true);
      return;
    }

    Alert.alert(
      t("backup.restoreTitle"),
      t("backup.restoreDescription"),
      [
        {
          text: t("backup.cancel"),
          style: "cancel",
          onPress: () => resolve(false),
        },
        {
          text: t("backup.restore"),
          style: "destructive",
          onPress: () => resolve(true),
        },
      ],
      { cancelable: true, onDismiss: () => resolve(false) },
    );
  });
}

export function BackupManagement() {
  const { t, i18n } = useTranslation();
  const { document, replaceDocument } = useLocalData();
  const [selectedFormat, setSelectedFormat] =
    useState<BackupFormat>("zip");
  const [busyAction, setBusyAction] = useState<
    "save" | "share" | "restore" | null
  >(null);
  const isBusy = busyAction !== null;
  const recordCount = BACKUP_COLLECTION_KEYS.reduce(
    (total, collection) => total + document[collection].length,
    0,
  );
  const numberFormatter = new Intl.NumberFormat(
    i18n.resolvedLanguage ?? i18n.language,
  );

  async function handleExport(destination: "save" | "share") {
    try {
      setBusyAction(destination);
      if (destination === "save") {
        const saved = await saveBackup(document, selectedFormat);
        if (saved) {
          Alert.alert(t("backup.savedTitle"), t("backup.savedDescription"));
        }
      } else {
        await shareBackup(document, selectedFormat);
      }
    } catch (error) {
      Alert.alert(
        t("backup.exportFailed"),
        getErrorMessage(error, t("backup.unexpectedError")),
      );
    } finally {
      setBusyAction(null);
    }
  }

  async function handleImport() {
    try {
      setBusyAction("restore");
      const imported = await pickAndImportBackup(document);
      if (!imported || !(await confirmRestore(imported, t))) return;

      if (imported.format !== "csv") {
        const previousDocument = cloneBackupDocument(document);
        stageAttachments(imported.attachments ?? []);
        try {
          await replaceDocument(imported.document);
          commitStagedAttachments();
        } catch (error) {
          discardStagedAttachments();
          await replaceDocument(previousDocument);
          throw error;
        }
      } else {
        await replaceDocument(imported.document);
      }
      Alert.alert(
        t("backup.importComplete"),
        imported.format === "csv"
          ? t("backup.csvImportComplete")
          : t("backup.restoreComplete"),
      );
    } catch (error) {
      Alert.alert(
        t("backup.importFailed"),
        getErrorMessage(error, t("backup.unexpectedError")),
      );
    } finally {
      setBusyAction(null);
    }
  }

  return (
    <View className="gap-4">
      <View className="flex-row items-center justify-between rounded-lg border border-border bg-surface-secondary px-4 py-3">
        <Text className="font-sans text-[11px] text-muted">
          {t("backup.localRecords", {
            count: recordCount,
            formattedCount: numberFormatter.format(recordCount),
          })}
        </Text>
        <Text className="font-sans text-[11px] text-muted">
          {t("backup.attachments", {
            count: document._local.attachments.length,
            formattedCount: numberFormatter.format(
              document._local.attachments.length,
            ),
          })}
        </Text>
      </View>

      <View accessibilityRole="radiogroup" className="gap-2">
        <FormatOption
          description={t("backup.actions.exportZipDescription")}
          format="zip"
          icon="folder-zip"
          isDisabled={isBusy}
          isSelected={selectedFormat === "zip"}
          label={t("backup.formats.zip")}
          onSelect={setSelectedFormat}
        />
        <FormatOption
          description={t("backup.actions.exportJsonDescription")}
          format="json"
          icon="code-json"
          isDisabled={isBusy}
          isSelected={selectedFormat === "json"}
          label={t("backup.formats.json")}
          onSelect={setSelectedFormat}
        />
        <FormatOption
          description={t("backup.actions.exportCsvDescription")}
          format="csv"
          icon="file-delimited"
          isDisabled={isBusy}
          isSelected={selectedFormat === "csv"}
          label={t("backup.formats.csv")}
          onSelect={setSelectedFormat}
        />
      </View>

      <View className="flex-row gap-3">
        <Button
          className="flex-1"
          isDisabled={isBusy}
          onPress={() => void handleExport("save")}
          variant="primary"
        >
          <FilledIcon name="save" size={19} tone="accent-foreground" />
          <Button.Label>
            {busyAction === "save"
              ? t("backup.actions.saving")
              : t("backup.actions.save")}
          </Button.Label>
        </Button>
        <Button
          className="flex-1"
          isDisabled={isBusy}
          onPress={() => void handleExport("share")}
          variant="secondary"
        >
          <FilledIcon name="arrow-top-right" size={19} />
          <Button.Label>
            {busyAction === "share"
              ? t("backup.actions.sharing")
              : t("backup.actions.share")}
          </Button.Label>
        </Button>
      </View>

      <View className="h-px bg-border" />

      <View className="gap-2">
        <Text className="font-manrope-bold text-base text-foreground">
          {t("backup.restoreSection")}
        </Text>
        <Text className="font-sans text-xs leading-5 text-muted">
          {t("backup.actions.importDescription")}
        </Text>
        <Button
          isDisabled={isBusy}
          onPress={() => void handleImport()}
          variant="outline"
        >
          <FilledIcon name="database-import" size={20} tone="accent" />
          <Button.Label>
            {busyAction === "restore"
              ? t("backup.actions.restoring")
              : t("backup.actions.import")}
          </Button.Label>
        </Button>
      </View>
    </View>
  );
}

function getErrorMessage(error: unknown, fallback: string) {
  return error instanceof Error ? error.message : fallback;
}
