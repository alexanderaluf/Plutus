import { Component, useState, type PropsWithChildren } from "react";
import { Alert, Pressable, Text, View } from "react-native";
import { Directory, File, Paths } from "expo-file-system";
import * as Sharing from "expo-sharing";
import { zipSync } from "fflate";
import { getRecoveryDirectory } from "@/data/database/safe-startup";
import { resetLocalInstallation } from "@/data/database/reset-local-installation";
import { getAttachmentsDirectory } from "@/data/attachments/attachment-store";

/** Deliberately independent of hydration, feature providers, and theme state. */
type StorageRecoveryScreenProps = {
  createCurrentSnapshot?: () => Promise<Uint8Array>;
  onReset: () => Promise<void>;
  onRetry?: () => void;
};

async function createRecoveryArchive(
  createCurrentSnapshot?: () => Promise<Uint8Array>,
) {
  const files: Record<string, Uint8Array> = {};
  const recovery = getRecoveryDirectory();
  if (recovery.exists)
    for (const item of recovery.list()) {
      if (item instanceof File && item.name.endsWith(".sqlite"))
        files[item.name] = await item.bytes();
    }
  if (createCurrentSnapshot) {
    files["current.sqlite"] = await createCurrentSnapshot();
  }
  if (!Object.keys(files).length)
    throw new Error(
      "No recovery snapshot is available. Keep this installation; do not clear app storage.",
    );
  const attachments = getAttachmentsDirectory();
  if (attachments.exists)
    for (const item of attachments.list()) {
      if (item instanceof File)
        files[`attachments/${item.name}`] = await item.bytes();
    }
  const archive = new File(Paths.cache, `plutus-recovery-${Date.now()}.zip`);
  archive.create({ overwrite: true });
  archive.write(zipSync(files, { level: 0 }));
  return archive;
}

function isPickerCancellation(error: unknown) {
  return error instanceof Error && /cancel/i.test(error.message);
}

export function StorageRecoveryScreen({
  createCurrentSnapshot,
  onReset,
  onRetry,
}: StorageRecoveryScreenProps) {
  const [busyAction, setBusyAction] = useState<
    "save" | "share" | "reset" | null
  >(null);

  async function saveRecovery() {
    if (busyAction) return;
    setBusyAction("save");
    try {
      const archive = await createRecoveryArchive(createCurrentSnapshot);
      const directory = await Directory.pickDirectoryAsync();
      const destination = new File(directory, archive.name);
      await archive.copy(destination, { overwrite: true });
      Alert.alert("Recovery copy saved", `Saved as ${archive.name}.`);
    } catch (error) {
      if (!isPickerCancellation(error))
        Alert.alert(
          "Recovery export",
          error instanceof Error
            ? error.message
            : "Could not export recovery data.",
        );
    } finally {
      setBusyAction(null);
    }
  }

  async function shareRecovery() {
    if (busyAction) return;
    setBusyAction("share");
    try {
      const archive = await createRecoveryArchive(createCurrentSnapshot);
      if (!(await Sharing.isAvailableAsync()))
        throw new Error("File sharing is not available on this device.");
      await Sharing.shareAsync(archive.uri, {
        mimeType: "application/zip",
        dialogTitle: "Share recovery copy",
      });
    } catch (error) {
      Alert.alert(
        "Recovery export",
        error instanceof Error
          ? error.message
          : "Could not export recovery data.",
      );
    } finally {
      setBusyAction(null);
    }
  }

  function confirmReset() {
    if (busyAction) return;
    Alert.alert(
      "Erase local data and start over?",
      "This permanently removes every profile, transaction, attachment, and local recovery snapshot. Save a recovery copy first if possible.",
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Erase everything",
          style: "destructive",
          onPress: async () => {
            setBusyAction("reset");
            try {
              await onReset();
            } catch (error) {
              Alert.alert(
                "Could not reset local data",
                error instanceof Error
                  ? error.message
                  : "Keep this installation and try again.",
              );
              setBusyAction(null);
            }
          },
        },
      ],
    );
  }

  const busy = busyAction !== null;
  return (
    <View
      style={{
        flex: 1,
        justifyContent: "center",
        padding: 28,
        gap: 24,
        backgroundColor: "#141b19",
      }}
    >
      <Text
        accessibilityRole="header"
        style={{ color: "#ffffff", fontSize: 28 }}
      >
        Your data needs recovery
      </Text>
      <Text style={{ color: "#d0d8d3", fontSize: 17, lineHeight: 26 }}>
        Plutus could not open your saved data safely. Nothing has been reset.
        Keep the app installed and save a recovery copy before seeking help. A
        future compatible update can retry the migration.
      </Text>
      <Text
        style={{
          color: "#d0d8d3",
          fontSize: 16,
          lineHeight: 25,
          writingDirection: "rtl",
        }}
      >
        לא ניתן לפתוח את הנתונים בבטחה. הנתונים לא אופסו. שמרו עותק לשחזור ואל
        תמחקו את האפליקציה או את האחסון שלה.
      </Text>
      <Pressable
        accessibilityRole="button"
        disabled={busy}
        onPress={() => {
          void saveRecovery();
        }}
        style={{ padding: 20, backgroundColor: "#b5dfc8", borderRadius: 30 }}
      >
        <Text style={{ color: "#13251c", textAlign: "center", fontSize: 17 }}>
          {busyAction === "save"
            ? "Saving…"
            : "Save recovery copy / שמירת עותק"}
        </Text>
      </Pressable>
      <Pressable
        accessibilityRole="button"
        disabled={busy}
        onPress={() => {
          void shareRecovery();
        }}
        style={{ padding: 18 }}
      >
        <Text style={{ color: "#ffffff", textAlign: "center" }}>
          {busyAction === "share" ? "Sharing…" : "Share recovery copy"}
        </Text>
      </Pressable>
      {onRetry && (
        <Pressable
          accessibilityRole="button"
          disabled={busy}
          onPress={onRetry}
          style={{ padding: 18 }}
        >
          <Text style={{ color: "#ffffff", textAlign: "center" }}>
            Try again / נסו שוב
          </Text>
        </Pressable>
      )}
      <Pressable
        accessibilityRole="button"
        disabled={busy}
        onPress={confirmReset}
        style={{ padding: 18 }}
      >
        <Text style={{ color: "#ffb4ab", textAlign: "center" }}>
          {busyAction === "reset"
            ? "Erasing local data…"
            : "Restore defaults and start onboarding"}
        </Text>
      </Pressable>
    </View>
  );
}

export class StorageBoundary extends Component<
  PropsWithChildren,
  { failed: boolean; attempt: number }
> {
  state = { failed: false, attempt: 0 };
  static getDerivedStateFromError() {
    return { failed: true };
  }
  render() {
    if (this.state.failed)
      return (
        <StorageRecoveryScreen
          onReset={async () => {
            await resetLocalInstallation();
            this.setState((state) => ({
              failed: false,
              attempt: state.attempt + 1,
            }));
          }}
          onRetry={() =>
            this.setState((state) => ({
              failed: false,
              attempt: state.attempt + 1,
            }))
          }
        />
      );
    return (
      <View key={this.state.attempt} style={{ flex: 1 }}>
        {this.props.children}
      </View>
    );
  }
}
