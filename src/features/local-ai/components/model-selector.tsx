import { useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { Platform, Pressable, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import type { LocalAIDownloadState } from "../../../../modules/plutus-local-ai/src/PlutusLocalAI.types";
import { colorWithAlpha, useAppThemeColors } from "@/shared/theme/app-theme";
import { BottomSheet, BottomSheetScrollView } from "@/shared/ui/app-bottom-sheet";
import { AppBottomSheetPortal } from "@/shared/ui/app-bottom-sheet-portal";
import { Text } from "@/shared/ui/app-text";
import { FilledIcon } from "@/shared/ui/filled-icon";
import { useBottomSheetInitialPositionFix } from "@/shared/ui/use-bottom-sheet-initial-position-fix";

import { LOCAL_AI_MODELS, type LocalAIModelKey } from "../model-compatibility-policy";

const KEYS: LocalAIModelKey[] = ["E2B", "E4B"];

export function ModelSelector({
  selected, states, busy, error, onClose, onSelect, onDownload, onDelete,
}: {
  selected: LocalAIModelKey;
  states: Partial<Record<LocalAIModelKey, LocalAIDownloadState>>;
  busy: boolean;
  error: string;
  onClose: () => void;
  onSelect: (key: LocalAIModelKey) => Promise<void>;
  onDownload: (key: LocalAIModelKey) => Promise<void>;
  onDelete: (key: LocalAIModelKey) => Promise<void>;
}) {
  const { t } = useTranslation();
  const colors = useAppThemeColors();
  const insets = useSafeAreaInsets();
  const [isOpen, setIsOpen] = useState(Platform.OS === "ios");
  const initialPositionFix = useBottomSheetInitialPositionFix(isOpen);
  const opened = useRef(Platform.OS === "ios");
  const openingFrame = useRef<number | null>(null);
  const [info, setInfo] = useState<LocalAIModelKey | null>(null);
  const [deleting, setDeleting] = useState<LocalAIModelKey | null>(null);
  const [pending, setPending] = useState(false);
  const [operationError, setOperationError] = useState("");

  useEffect(() => () => {
    if (openingFrame.current !== null) cancelAnimationFrame(openingFrame.current);
  }, []);

  function openAfterLayout() {
    if (opened.current || openingFrame.current !== null) return;
    openingFrame.current = requestAnimationFrame(() => {
      openingFrame.current = null;
      opened.current = true;
      setIsOpen(true);
    });
  }

  function close() {
    if (pending) return;
    setIsOpen(false);
    onClose();
  }

  async function run(action: () => Promise<void>, closeAfter = false) {
    setPending(true);
    setOperationError("");
    try {
      await action();
      if (closeAfter) {
        setIsOpen(false);
        onClose();
      }
    } catch (cause) {
      setOperationError(String(cause));
    } finally {
      setPending(false);
    }
  }

  const title = deleting
    ? t("localAI.deleteModel")
    : info ? LOCAL_AI_MODELS[info].name : t("localAI.selectModel");

  return (
    <BottomSheet isOpen={isOpen} onOpenChange={(open) => {
      if (!open && opened.current && isOpen) close();
    }}>
      <AppBottomSheetPortal isOpen={isOpen} unstable_accessibilityContainerViewIsModal>
        <BottomSheet.Overlay />
        <BottomSheet.Content
          containerStyle={initialPositionFix.containerStyle}
          onChange={initialPositionFix.onChange}
          snapPoints={[info ? "72%" : deleting ? "52%" : "58%"]}
          enableDynamicSizing={false}
          enableOverDrag={false}
          topInset={insets.top}
          bottomInset={insets.bottom}
          contentContainerClassName="h-full px-0 pb-0 pt-2"
          backgroundClassName="rounded-t-[28px] bg-surface"
          handleIndicatorClassName="w-10 bg-muted/40"
        >
          <View onLayout={openAfterLayout} className="flex-1">
            <View className="flex-row items-center gap-3 border-b border-border px-5 pb-4 pt-2">
              {(info || deleting) && (
                <Pressable accessibilityRole="button" accessibilityLabel={t("common.back")}
                  onPress={() => { if (deleting) setDeleting(null); else setInfo(null); setOperationError(""); }}
                  className="size-10 items-center justify-center rounded-full bg-surface-secondary">
                  <FilledIcon name="arrow-left" size={20} />
                </Pressable>
              )}
              <BottomSheet.Title>{title}</BottomSheet.Title>
              <View className="flex-1" />
              <Pressable accessibilityRole="button" accessibilityLabel={t("localAI.cancel")}
                onPress={close} className="size-10 items-center justify-center rounded-full bg-surface-secondary">
                <FilledIcon name="close" size={20} />
              </Pressable>
            </View>
            <BottomSheetScrollView keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}
              contentContainerStyle={{ paddingHorizontal: 20, paddingTop: 20, paddingBottom: Math.max(insets.bottom, 16) + 24 }}>
              {deleting ? (
                <View className="gap-5">
                  <View className="items-center gap-3 rounded-3xl bg-surface-secondary px-5 py-7">
                    <View className="size-14 items-center justify-center rounded-2xl bg-danger/10">
                      <FilledIcon name="delete" size={28} tone="danger" />
                    </View>
                    <Text className="text-center font-manrope-bold text-lg text-foreground">{LOCAL_AI_MODELS[deleting].name}</Text>
                    <Text className="text-center leading-6 text-muted">{t("localAI.deleteModelConfirm")}</Text>
                  </View>
                  <Pressable accessibilityRole="button" disabled={pending}
                    onPress={() => void run(async () => { await onDelete(deleting); setDeleting(null); setInfo(null); })}
                    className="min-h-12 items-center justify-center rounded-2xl bg-danger px-4">
                    <Text className="font-manrope-bold text-background">{t("localAI.deleteModel")}</Text>
                  </Pressable>
                  <Pressable accessibilityRole="button" onPress={() => setDeleting(null)}
                    className="min-h-12 items-center justify-center rounded-2xl bg-surface-secondary px-4">
                    <Text className="font-manrope-semibold text-foreground">{t("localAI.cancel")}</Text>
                  </Pressable>
                </View>
              ) : info ? (
                <View className="gap-5">
                  <View className="gap-3 rounded-3xl bg-surface-secondary p-5">
                    <View className="flex-row items-center gap-3">
                      <View className="size-12 items-center justify-center rounded-2xl"
                        style={{ backgroundColor: colorWithAlpha(colors.accent, 0.13) }}>
                        <FilledIcon name="smart-toy" size={24} color={colors.accent} />
                      </View>
                      <View className="flex-1">
                        <Text className="font-manrope-bold text-lg text-foreground">{LOCAL_AI_MODELS[info].name}</Text>
                        <Text className="text-sm text-muted">{t(states[info]?.status === "installed" ? "localAI.modelInstalled" : "localAI.modelAvailable")}</Text>
                      </View>
                    </View>
                    <Text className="leading-6 text-foreground">{t(info === "E2B" ? "localAI.e2bPower" : "localAI.e4bPower")}</Text>
                  </View>
                  <View className="gap-2 px-1">
                    <Text className="font-manrope-bold text-foreground">{t("localAI.modelInfo")}</Text>
                    <Text className="leading-6 text-muted">{t("localAI.modelDetails")}</Text>
                  </View>
                  {states[info]?.status === "installed" && (
                    <Pressable accessibilityRole="button" disabled={pending || busy} onPress={() => setDeleting(info)}
                      className="min-h-12 flex-row items-center justify-center gap-2 rounded-2xl border border-border px-4">
                      <FilledIcon name="delete" size={18} tone="muted" />
                      <Text className="font-manrope-semibold text-muted">{t("localAI.manageModel")}</Text>
                    </Pressable>
                  )}
                </View>
              ) : (
                <View className="gap-4">
                  <Text className="px-1 leading-5 text-muted">{t("localAI.chooseModelHint")}</Text>
                  {KEYS.map((key) => {
                    const model = LOCAL_AI_MODELS[key];
                    const state = states[key];
                    const installed = state?.status === "installed";
                    const active = state?.status === "downloading" || state?.status === "paused" || state?.status === "verifying";
                    const selectedInstalled = selected === key && installed;
                    const progress = Math.round(((state?.received ?? 0) / (state?.total || 1)) * 100);
                    return (
                      <View key={key} className="overflow-hidden rounded-3xl border bg-surface-secondary"
                        style={{ borderColor: selectedInstalled ? colors.accent : colors.border }}>
                        <View className="flex-row items-center gap-2 p-4">
                          <Pressable accessibilityRole="button"
                            accessibilityLabel={`${model.name}, ${t(installed ? "localAI.modelInstalled" : "localAI.modelAvailable")}`}
                            accessibilityState={{ selected: selectedInstalled, disabled: !installed || busy || pending }}
                            disabled={!installed || busy || pending}
                            onPress={() => void run(() => onSelect(key), true)}
                            className="min-h-14 flex-1 flex-row items-center gap-3">
                            <View className="size-11 items-center justify-center rounded-2xl"
                              style={{ backgroundColor: colorWithAlpha(colors.accent, 0.12) }}>
                              <FilledIcon name="smart-toy" size={22} color={colors.accent} />
                            </View>
                            <View className="flex-1 gap-0.5">
                              <Text className="font-manrope-bold text-[16px] text-foreground">{model.name}</Text>
                              <Text className="text-[13px] text-muted">
                                {selectedInstalled ? t("localAI.selectedModel") : installed ? t("localAI.modelInstalled") : active ? `${t("localAI.downloading")} ${progress}%` : t("localAI.modelAvailable")}
                              </Text>
                            </View>
                            {selectedInstalled && <FilledIcon name="check" size={22} color={colors.accent} />}
                          </Pressable>
                          <Pressable accessibilityRole="button" accessibilityLabel={`${t("localAI.modelInfo")}: ${model.name}`}
                            onPress={() => setInfo(key)} className="size-10 items-center justify-center rounded-full bg-surface">
                            <Text className="font-manrope-bold text-lg" style={{ color: colors.accent }}>ⓘ</Text>
                          </Pressable>
                        </View>
                        {!installed && !active && (
                          <Pressable accessibilityRole="button" disabled={pending} onPress={() => void run(() => onDownload(key))}
                            className="min-h-12 items-center justify-center border-t border-border bg-surface px-4">
                            <Text className="font-manrope-bold" style={{ color: colors.accent }}>
                              {t(state?.status === "failed" ? "localAI.retryDownload" : "localAI.download")}
                            </Text>
                          </Pressable>
                        )}
                        {active && <View className="h-1 bg-border"><View className="h-1 bg-accent" style={{ width: `${progress}%` }} /></View>}
                      </View>
                    );
                  })}
                </View>
              )}
              {!!(operationError || error) && <Text className="pt-4 text-sm text-danger">{operationError || error}</Text>}
            </BottomSheetScrollView>
          </View>
        </BottomSheet.Content>
      </AppBottomSheetPortal>
    </BottomSheet>
  );
}
