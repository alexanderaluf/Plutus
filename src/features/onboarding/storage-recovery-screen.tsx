import { Component, useState, type PropsWithChildren } from "react";
import { Alert, Pressable, Text, View } from "react-native";
import { File, Paths } from "expo-file-system";
import * as Sharing from "expo-sharing";
import { zipSync } from "fflate";
import { getRecoveryDirectory } from "@/data/database/safe-startup";
import { getAttachmentsDirectory } from "@/data/attachments/attachment-store";

/** Deliberately independent of hydration, feature providers, and theme state. */
export function StorageRecoveryScreen({ onRetry }: { onRetry?: () => void }) {
  const [busy, setBusy] = useState(false);
  async function exportRecovery() {
    if (busy) return;
    setBusy(true);
    try {
      const files: Record<string, Uint8Array> = {};
      const recovery = getRecoveryDirectory();
      if (recovery.exists)
        for (const item of recovery.list()) {
          if (item instanceof File && item.name.endsWith(".sqlite"))
            files[item.name] = await item.bytes();
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
      const archive = new File(
        Paths.cache,
        `plutus-recovery-${Date.now()}.zip`,
      );
      archive.create();
      archive.write(zipSync(files, { level: 0 }));
      if (!(await Sharing.isAvailableAsync()))
        throw new Error("File sharing is not available on this device.");
      await Sharing.shareAsync(archive.uri, {
        mimeType: "application/zip",
        dialogTitle: "Save recovery copy",
      });
    } catch (error) {
      Alert.alert(
        "Recovery export",
        error instanceof Error
          ? error.message
          : "Could not export recovery data.",
      );
    } finally {
      setBusy(false);
    }
  }
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
          void exportRecovery();
        }}
        style={{ padding: 20, backgroundColor: "#b5dfc8", borderRadius: 30 }}
      >
        <Text style={{ color: "#13251c", textAlign: "center", fontSize: 17 }}>
          {busy ? "Saving…" : "Save recovery copy / שמירת עותק"}
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
