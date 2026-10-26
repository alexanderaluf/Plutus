import { ActivityIndicator, Pressable, View } from "react-native";
import { useTranslation } from "react-i18next";
import { useState } from "react";
import { Text } from "@/shared/ui/app-text";
import { FilledIcon } from "@/shared/ui/filled-icon";
import { ChatGPTLogo } from "@/shared/ui/chatgpt-logo";
import { useAppThemeColors } from "@/shared/theme/app-theme";
import { useChatGPT } from "../use-chatgpt";

export function ChatGPTConnectionCard({ busy = false, settings = false, compact = false, onSelect }: {
  busy?: boolean; settings?: boolean; compact?: boolean; onSelect?: (slug: string) => Promise<void>;
}) {
  const { t } = useTranslation();
  const colors = useAppThemeColors();
  const chatgpt = useChatGPT();
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");
  async function select(slug: string) {
    setPending(true); setError("");
    try { await (onSelect ? onSelect(slug) : chatgpt.selectModel(slug)); }
    catch { setError(t("localAI.chatgpt.errors.storage")); }
    finally { setPending(false); }
  }
  const disabled = busy || pending || chatgpt.connecting || chatgpt.disconnecting || !chatgpt.hydrated;
  return (
    <View className="gap-3 rounded-3xl border border-border bg-surface-secondary p-4">
      <View className="flex-row items-center gap-3">
        <View className="size-11 items-center justify-center rounded-2xl bg-foreground/10">
          <ChatGPTLogo size={26} />
        </View>
        <View className="flex-1 gap-1">
          <Text className="font-manrope-bold text-lg text-foreground">ChatGPT</Text>
          <Text className="text-sm text-muted">{chatgpt.connected ? chatgpt.email || t("localAI.chatgpt.connected") : t("localAI.chatgpt.description")}</Text>
        </View>
      </View>
      {!compact && <>
        <Text className="text-sm leading-5 text-muted">{t(chatgpt.planEnabled ? "localAI.chatgpt.planEnabled" : "localAI.chatgpt.eligibility")}</Text>
        <Text className="text-sm leading-5 text-muted">{t("localAI.chatgpt.privacy")}</Text>
      </>}
      {!chatgpt.connected || !chatgpt.planEnabled ? (
        <Pressable accessibilityRole="button" disabled={disabled}
          onPress={() => chatgpt.connect(chatgpt.activeClientId ?? chatgpt.accounts[0]?.clientId)}
          className="min-h-12 flex-row items-center justify-center gap-3 rounded-2xl bg-foreground px-4" style={{ opacity: disabled ? 0.5 : 1 }}>
          <ChatGPTLogo size={21} color={colors.background} />
          <Text className="font-manrope-bold text-background">{t(chatgpt.connecting ? "localAI.chatgpt.connecting" : "localAI.chatgpt.continue")}</Text>
        </Pressable>
      ) : null}
      {chatgpt.connecting && (
        <Pressable accessibilityRole="button" onPress={() => void chatgpt.cancel().catch(() => undefined)} className="min-h-11 items-center justify-center">
          <Text className="font-manrope-semibold text-accent">{t("localAI.cancel")}</Text>
        </Pressable>
      )}
      {chatgpt.planEnabled && (
        <>
          {chatgpt.loadingModels && <ActivityIndicator accessibilityLabel={t("localAI.chatgpt.loadingModels")} />}
          {chatgpt.models.map((model) => (
            <Pressable key={model.slug} accessibilityRole="radio"
              accessibilityState={{ checked: chatgpt.selectedModel === model.slug, disabled }} disabled={disabled}
              onPress={() => void select(model.slug)} className="min-h-14 flex-row items-center gap-3 rounded-2xl bg-surface px-4 py-3">
              <Text className="flex-1 font-manrope-semibold text-foreground">{model.display_name}</Text>
              {chatgpt.selectedModel === model.slug && <FilledIcon name="check" size={20} tone="accent" />}
            </Pressable>
          ))}
          {!chatgpt.loadingModels && (
            <Pressable accessibilityRole="button" disabled={disabled} onPress={() => void chatgpt.refreshModels()} className="min-h-11 items-center justify-center">
              <Text className="font-manrope-semibold text-accent">{t("localAI.chatgpt.refreshModels")}</Text>
            </Pressable>
          )}
          <Pressable accessibilityRole="link" onPress={chatgpt.manageUsage} className="min-h-11 items-center justify-center rounded-2xl bg-surface px-3">
            <Text className="font-manrope-semibold text-accent">{t("localAI.chatgpt.manageUsage")}</Text>
          </Pressable>
        </>
      )}
      {settings && chatgpt.accounts.length > 0 && !chatgpt.connecting && (
        <View className="gap-2">
          {chatgpt.accounts.map((account) => (
            <Pressable key={account.clientId} accessibilityRole="button" disabled={disabled}
              onPress={() => chatgpt.connect(account.clientId)} className="min-h-11 justify-center rounded-2xl bg-surface px-4">
              <Text className="text-sm text-foreground">{t("localAI.chatgpt.reconnect")} · {account.label}</Text>
            </Pressable>
          ))}
          <Pressable accessibilityRole="button" disabled={disabled} onPress={() => chatgpt.connect()} className="min-h-11 items-center justify-center">
            <Text className="font-manrope-semibold text-accent">{t("localAI.chatgpt.otherAccount")}</Text>
          </Pressable>
        </View>
      )}
      {settings && chatgpt.connected && (
        <Pressable accessibilityRole="button" disabled={disabled} onPress={chatgpt.disconnect} className="min-h-12 items-center justify-center rounded-2xl border border-danger/40 px-4">
          <Text className="font-manrope-semibold text-danger">{t("localAI.chatgpt.disconnect")}</Text>
        </Pressable>
      )}
      {!!(chatgpt.errorMessage || error) && <Text accessibilityRole="alert" className="text-sm leading-5 text-danger">{error || chatgpt.errorMessage}</Text>}
      {/usage_limit_exceeded/.test(chatgpt.error) && <Pressable accessibilityRole="link" onPress={chatgpt.manageUsage} className="min-h-12 items-center justify-center rounded-2xl bg-accent">
        <Text className="font-manrope-bold text-background">{t("localAI.chatgpt.manageUsage")}</Text>
      </Pressable>}
    </View>
  );
}
