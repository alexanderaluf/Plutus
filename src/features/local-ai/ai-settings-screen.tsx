import { useState } from "react";
import { useTranslation } from "react-i18next";
import { ActivityIndicator, Pressable, View } from "react-native";
import { useLocalData } from "@/data/local-data-provider";
import { ProfileScreenHeader } from "@/features/profile/components/profile-screen-header";
import { AppAlert } from "@/shared/ui/app-alert";
import { Text } from "@/shared/ui/app-text";
import { EdgeToEdgeLayout, EdgeToEdgeScrollView } from "@/shared/ui/edge-to-edge-layout";
import { FilledIcon } from "@/shared/ui/filled-icon";
import { GeminiLogo } from "@/shared/ui/gemini-logo";
import { ChatGPTConnectionCard } from "./components/chatgpt-connection-card";
import { checkLocalAICompatibility } from "./model-compatibility";
import { LOCAL_AI_MODELS, type LocalAIModelKey } from "./model-compatibility-policy";
import { useModelDownload } from "./use-model-download";
import { useChatGPT } from "./use-chatgpt";
import nativeAI from "../../../modules/plutus-local-ai/src/PlutusLocalAIModule";

export function AISettingsScreen() {
  const { t } = useTranslation();
  const { document, updateDocument } = useLocalData();
  const selected = document._local.aiModelKey;
  const download = useModelDownload(selected);
  const chatgpt = useChatGPT();
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");
  async function run(action: () => Promise<void>) {
    if (pending) return;
    setPending(true); setError("");
    try { await action(); } catch (cause) { setError(String(cause)); }
    finally { setPending(false); }
  }
  async function install(key: LocalAIModelKey) {
    if (!nativeAI) throw new Error(t("localAI.runtimeUnavailable"));
    const result = await checkLocalAICompatibility(key);
    if (result.isExpoGo) throw new Error(t("localAI.expoGoUnavailable"));
    if (result.reasons.length) throw new Error(result.reasons.map((reason) => t(`localAI.reasons.${reason}`)).join(" "));
    await download.start(key);
  }
  const remove = (key: LocalAIModelKey) => AppAlert.alert(t("localAI.deleteModel"), t("localAI.deleteModelConfirm"), [
    { text: t("localAI.cancel"), style: "cancel" },
    { text: t("localAI.deleteModel"), style: "destructive", onPress: () => void run(async () => {
      await download.remove(key);
      const other = key === "E2B" ? "E4B" : "E2B";
      if (selected === key && download.states[other]?.status === "installed") {
        await updateDocument((current) => ({ ...current, _local: { ...current._local, aiModelKey: other } }));
      }
    }) },
  ]);
  return (
    <EdgeToEdgeLayout header={<ProfileScreenHeader title={t("localAI.settings.title")} />}>
      <EdgeToEdgeScrollView className="flex-1" contentContainerClassName="gap-5 px-4 pt-4" contentContainerStyle={{ paddingBottom: 32 }}>
        <Text className="px-1 leading-6 text-muted">{t("localAI.settings.description")}</Text>
        <ChatGPTConnectionCard settings busy={pending} />
        <View className="gap-3">
          <Text className="px-1 font-manrope-bold text-lg text-foreground">{t("localAI.settings.localModels")}</Text>
          <Text className="px-1 text-sm leading-5 text-muted">{t("localAI.settings.localDescription")}</Text>
          {(Object.keys(LOCAL_AI_MODELS) as LocalAIModelKey[]).map((key) => {
            const model = LOCAL_AI_MODELS[key];
            const state = download.states[key];
            const installed = state?.status === "installed";
            const transferring = state && ["downloading", "paused", "verifying"].includes(state.status);
            const chosen = installed && selected === key && !chatgpt.selectedModel;
            const progress = Math.min(100, Math.round((state?.received ?? 0) / (state?.total || 1) * 100));
            return (
              <View key={key} className="gap-3 rounded-3xl border border-border bg-surface p-4">
                <View className="flex-row items-center gap-3">
                  <View className="size-11 items-center justify-center rounded-2xl bg-accent/10"><GeminiLogo size={26} /></View>
                  <View className="flex-1 gap-1">
                    <Text className="font-manrope-bold text-base text-foreground">{model.name}</Text>
                    <Text className="text-sm text-muted">{(model.sizeBytes / 1_000_000_000).toFixed(1)} GB · {t(chosen ? "localAI.selectedModel" : installed ? "localAI.modelInstalled" : "localAI.modelAvailable")}</Text>
                  </View>
                  {chosen && <FilledIcon name="check" size={22} tone="accent" />}
                </View>
                <Text className="text-sm leading-5 text-muted">{t(key === "E2B" ? "localAI.e2bPower" : "localAI.e4bPower")}</Text>
                {!state && nativeAI && <ActivityIndicator />}
                {transferring && <>
                  <Text className="text-sm text-muted">{t(state.status === "verifying" ? "localAI.verifying" : state.status === "paused" ? "localAI.downloadPaused" : "localAI.downloading")} {progress}%</Text>
                  <View className="h-1 overflow-hidden rounded-full bg-border"><View className="h-1 bg-accent" style={{ width: `${progress}%` }} /></View>
                  <Text className="text-sm text-muted">{t("localAI.backgroundDownload")}</Text>
                </>}
                {!!state?.error && <Text className="text-sm text-danger">{state.error}</Text>}
                {installed ? <View className="flex-row gap-3">
                  <Pressable accessibilityRole="button" disabled={pending || chosen} onPress={() => void run(async () => {
                    await updateDocument((current) => ({ ...current, _local: { ...current._local, aiModelKey: key } }));
                    await chatgpt.selectModel(null);
                  })} className="min-h-12 flex-1 items-center justify-center rounded-2xl bg-accent px-3" style={{ opacity: chosen ? 0.5 : 1 }}>
                    <Text className="font-manrope-bold text-background">{t(chosen ? "localAI.selectedModel" : "localAI.settings.useModel")}</Text>
                  </Pressable>
                  <Pressable accessibilityRole="button" disabled={pending} onPress={() => remove(key)} className="min-h-12 items-center justify-center rounded-2xl bg-danger/10 px-4">
                    <Text className="font-manrope-semibold text-danger">{t("localAI.deleteModel")}</Text>
                  </Pressable>
                </View> : transferring ? <Pressable accessibilityRole="button" disabled={pending} onPress={() => remove(key)} className="min-h-12 items-center justify-center rounded-2xl bg-surface-secondary">
                  <Text className="font-manrope-semibold text-danger">{t("localAI.settings.cancelDownload")}</Text>
                </Pressable> : <Pressable accessibilityRole="button" disabled={pending || !nativeAI || !state} onPress={() => void run(() => install(key))}
                  className="min-h-12 items-center justify-center rounded-2xl bg-accent px-4">
                  <Text className="font-manrope-bold text-background">{t(state?.status === "failed" ? "localAI.retryDownload" : "localAI.download")}</Text>
                </Pressable>}
              </View>
            );
          })}
        </View>
        {!!(error || download.error) && <Text accessibilityRole="alert" className="text-sm text-danger">{error || download.error}</Text>}
      </EdgeToEdgeScrollView>
    </EdgeToEdgeLayout>
  );
}
