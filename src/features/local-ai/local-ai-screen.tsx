import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useNavigation, useRouter } from "expo-router";
import { useTranslation } from "react-i18next";
import {
  ActivityIndicator,
  BackHandler,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  TextInput,
  View,
} from "react-native";
import { AudioModule } from "expo-audio";
import { File } from "expo-file-system";

import { useLocalData } from "@/data/local-data-provider";
import { selectAccounts } from "@/data/selectors/document-selectors";
import { selectBudgets } from "@/data/selectors/budget-selectors";
import {
  createTransactionIndex,
  createTransactionProjector,
} from "@/data/selectors/transaction-selectors";
import { AccountCard } from "@/features/accounts/components/account-card";
import { BudgetOverviewCard } from "@/features/home/components/budget-card";
import { TransactionRow } from "@/features/home/components/transaction-list";
import type { Transaction } from "@/features/home/types";
import { TransactionDetailSheet } from "@/features/transactions/transaction-detail-sheet";
import { EdgeToEdgeLayout } from "@/shared/ui/edge-to-edge-layout";
import { FilledIcon } from "@/shared/ui/filled-icon";
import { Text } from "@/shared/ui/app-text";
import nativeAI from "../../../modules/plutus-local-ai/src/PlutusLocalAIModule";
import {
  inferReadTools,
  parseReadTools,
  runReadTools,
  type ChatCard,
} from "./chat-tools";
import { checkLocalAICompatibility } from "./model-compatibility";
import {
  LOCAL_AI_MODEL,
  type LocalAICompatibility,
} from "./model-compatibility-policy";
import { useLocalAIEngine } from "./use-local-ai-engine";
import { useModelDownload } from "./use-model-download";

type ChatMessage = {
  id: number;
  role: "user" | "assistant";
  text: string;
  cards: ChatCard[];
};

function ChatCards({
  cards,
  onTransaction,
  onNavigate,
}: {
  cards: ChatCard[];
  onTransaction: (transaction: Transaction) => void;
  onNavigate: (target: { kind: "account" | "budget"; id: string }) => void;
}) {
  const { document } = useLocalData();
  const { i18n } = useTranslation();
  const transactionIndex = useMemo(
    () => createTransactionIndex(document),
    [document],
  );
  const project = useMemo(
    () => createTransactionProjector(document, i18n.resolvedLanguage),
    [document, i18n.resolvedLanguage],
  );
  const accounts = useMemo(() => selectAccounts(document), [document]);
  const budgets = useMemo(() => selectBudgets(document), [document]);
  return (
    <View className="gap-2">
      {cards.map((card) => {
        if (card.kind === "transaction") {
          const entry = transactionIndex.find((item) => item.id === card.id);
          if (!entry) return null;
          return (
            <View
              key={`transaction-${card.id}`}
              className="rounded-2xl border border-border bg-surface px-3"
            >
              <TransactionRow
                transaction={project(entry)}
                showBorder={false}
                onPress={onTransaction}
              />
            </View>
          );
        }
        if (card.kind === "account") {
          const account = accounts.find((item) => item.id === card.id);
          return account ? (
            <Pressable
              key={`account-${card.id}`}
              accessibilityRole="button"
              onPress={() => onNavigate({ kind: "account", id: card.id })}
            >
              <AccountCard account={account} />
            </Pressable>
          ) : null;
        }
        const budget = budgets.find((item) => item.id === card.id);
        return budget ? (
          <BudgetOverviewCard
            key={`budget-${card.id}`}
            budget={budget}
            expanded={false}
            onToggle={() => onNavigate({ kind: "budget", id: card.id })}
            onOpen={() => onNavigate({ kind: "budget", id: card.id })}
          />
        ) : null;
      })}
    </View>
  );
}

export function LocalAIScreen() {
  const { t, i18n } = useTranslation();
  const router = useRouter();
  const navigation = useNavigation();
  const { document, updateDocument } = useLocalData();
  const [compatibility, setCompatibility] =
    useState<LocalAICompatibility | null>(null);
  const download = useModelDownload();
  const installed = download.installed;
  const engine = useLocalAIEngine(installed);
  const { ready } = engine;
  const llm = engine.engine;
  const [busy, setBusy] = useState(false);
  const [recording, setRecording] = useState(false);
  const [draft, setDraft] = useState("");
  const [error, setError] = useState("");
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [selectedTransaction, setSelectedTransaction] =
    useState<Transaction | null>(null);
  const [exitWarning, setExitWarning] = useState(false);
  const [doNotShowAgain, setDoNotShowAgain] = useState(false);
  const [pendingDestination, setPendingDestination] = useState<{
    kind: "account" | "budget";
    id: string;
  } | null>(null);
  const allowExit = useRef(false);
  const messageId = useRef(0);
  const scroll = useRef<ScrollView>(null);

  useEffect(() => {
    let active = true;
    void checkLocalAICompatibility().then((result) => {
      if (active) setCompatibility(result);
    });
    return () => {
      active = false;
      void nativeAI?.stopRecordingAndDeleteAsync();
    };
  }, []);

  const incompatibilityReasons =
    compatibility?.reasons.filter(
      // A running or finished download has already consumed the free space.
      (reason) =>
        !(installed || download.active) ||
        (reason !== "storage-low" && reason !== "storage-unknown"),
    ) ?? [];

  const requestExit = useCallback(() => {
    if (document._local.aiExitWarningDismissed || allowExit.current) {
      router.back();
      return;
    }
    setExitWarning(true);
  }, [document._local.aiExitWarningDismissed, router]);
  const navigateFromCard = (target: {
    kind: "account" | "budget";
    id: string;
  }) => {
    if (document._local.aiExitWarningDismissed) {
      setMessages([]);
      engine.release();
      allowExit.current = true;
      router.replace({
        pathname:
          target.kind === "account" ? "/accounts/[id]" : "/budgets/[id]",
        params: { id: target.id },
      });
      return;
    }
    setPendingDestination(target);
    setExitWarning(true);
  };
  useEffect(() => {
    const sub = BackHandler.addEventListener("hardwareBackPress", () => {
      requestExit();
      return true;
    });
    return () => sub.remove();
  }, [requestExit]);
  useEffect(() => {
    const sub = navigation.addListener("beforeRemove", (event) => {
      if (allowExit.current || document._local.aiExitWarningDismissed) return;
      event.preventDefault();
      setExitWarning(true);
    });
    return sub;
  }, [navigation, document._local.aiExitWarningDismissed]);

  const confirmExit = async () => {
    if (doNotShowAgain) {
      try {
        await updateDocument((current) => ({
          ...current,
          _local: { ...current._local, aiExitWarningDismissed: true },
        }));
      } catch (cause) {
        setError(String(cause));
        return;
      }
    }
    allowExit.current = true;
    setMessages([]);
    setExitWarning(false);
    engine.release();
    await nativeAI?.stopRecordingAndDeleteAsync().catch(() => undefined);
    if (pendingDestination)
      router.replace({
        pathname:
          pendingDestination.kind === "account"
            ? "/accounts/[id]"
            : "/budgets/[id]",
        params: { id: pendingDestination.id },
      });
    else router.back();
  };

  const send = async (value: string, voice = false) => {
    if (!llm.current || !ready || busy || (!voice && !value.trim())) return;
    setError("");
    setBusy(true);
    setMessages((current) => [
      ...current,
      {
        id: ++messageId.current,
        role: "user",
        text: voice ? t("localAI.voiceMessage") : value.trim(),
        cards: [],
      },
    ]);
    setDraft("");
    try {
      const first = voice
        ? await llm.current.execute([
            { type: "text", text: "Answer the user's spoken question." },
            { type: "audio", path: value },
          ])
        : await llm.current.execute([{ type: "text", text: value.trim() }]);
      const tools = [
        ...new Set([
          ...parseReadTools(first),
          ...(!voice ? inferReadTools(value) : []),
        ]),
      ];
      let answer = first;
      let cards: ChatCard[] = [];
      if (tools.length) {
        const result = runReadTools(
          document,
          tools,
          i18n.resolvedLanguage ?? "en",
        );
        cards = result.cards;
        answer = await llm.current.execute([
          {
            type: "text",
            text: `TOOL_RESULTS ${JSON.stringify(result.facts)}. Answer the user's latest question briefly. The app will display these records as tappable cards.`,
          },
        ]);
      }
      setMessages((current) => [
        ...current,
        {
          id: ++messageId.current,
          role: "assistant",
          text: answer.trim() || t("localAI.emptyAnswer"),
          cards,
        },
      ]);
    } catch (cause) {
      setError(String(cause));
    } finally {
      if (voice)
        try {
          new File(value).delete();
        } catch {
          /* cache already gone */
        }
      setBusy(false);
    }
  };

  const toggleRecording = async () => {
    try {
      if (!nativeAI) return;
      if (recording) {
        const uri = await nativeAI.stopRecordingAsync();
        setRecording(false);
        await send(uri, true);
        return;
      }
      const permission = await AudioModule.requestRecordingPermissionsAsync();
      if (!permission.granted) {
        setError(t("localAI.microphoneDenied"));
        return;
      }
      await nativeAI.startRecordingAsync();
      setRecording(true);
    } catch (cause) {
      setRecording(false);
      setError(String(cause));
    }
  };

  return (
    <EdgeToEdgeLayout
      header={
        <View className="flex-row items-center gap-3 px-4 py-2">
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={t("common.back")}
            onPress={requestExit}
          >
            <FilledIcon name="arrow-left" size={24} />
          </Pressable>
          <Text className="font-manrope-bold text-xl text-foreground">
            {t("localAI.title")}
          </Text>
        </View>
      }
      bottomFade={!installed}
    >
      {(insets) => (
        <>
          <KeyboardAvoidingView
            className="flex-1"
            behavior={Platform.OS === "ios" ? "padding" : undefined}
          >
            <ScrollView
              ref={scroll}
              className="flex-1"
              contentContainerClassName="gap-4 px-4"
              // The header floats above the viewport; start content below it.
              contentContainerStyle={{
                paddingTop: insets.top + 8,
                paddingBottom: installed ? 24 : insets.bottom + 24,
              }}
              onContentSizeChange={() =>
                scroll.current?.scrollToEnd({ animated: true })
              }
            >
              <View className="rounded-3xl bg-surface p-4">
                <Text className="font-manrope-semibold text-base text-foreground">
                  {t("localAI.privacyTitle")}
                </Text>
                <Text className="mt-1 font-sans text-sm leading-5 text-muted">
                  {t("localAI.privacyDescription")}
                </Text>
              </View>
              {compatibility === null ? (
                <ActivityIndicator />
              ) : incompatibilityReasons.length > 0 ? (
                <View className="rounded-3xl bg-surface p-5">
                  <Text className="font-manrope-semibold text-foreground">
                    {t("localAI.deviceUnsupported")}
                  </Text>
                  {incompatibilityReasons.map((reason) => (
                    <Text key={reason} className="mt-2 text-muted">
                      {t(`localAI.reasons.${reason}`)}
                    </Text>
                  ))}
                </View>
              ) : !nativeAI || compatibility.isExpoGo ? (
                <View className="rounded-3xl bg-surface p-5">
                  <Text className="font-manrope-semibold text-foreground">
                    {t("localAI.deviceSupported")}
                  </Text>
                  <Text className="mt-2 text-muted">
                    {t("localAI.expoGoUnavailable")}
                  </Text>
                </View>
              ) : !installed ? (
                <View className="gap-3 rounded-3xl bg-surface p-5">
                  <Text className="font-manrope-semibold text-foreground">
                    {t("localAI.deviceSupported")}
                  </Text>
                  <Text className="text-muted">
                    {t("localAI.modelRequirements", {
                      size: (LOCAL_AI_MODEL.sizeBytes / 1_000_000_000).toFixed(
                        1,
                      ),
                    })}
                  </Text>
                  <Pressable
                    accessibilityRole="button"
                    disabled={!download.state || download.active}
                    onPress={() => void download.start()}
                    className="items-center rounded-2xl bg-accent p-3"
                  >
                    <Text className="font-manrope-bold text-background">
                      {download.state?.status === "downloading"
                        ? `${t("localAI.downloading")} ${Math.round(download.progress * 100)}%`
                        : download.state?.status === "paused"
                          ? `${t("localAI.downloadPaused")} ${Math.round(download.progress * 100)}%`
                          : download.state?.status === "verifying"
                            ? t("localAI.verifying")
                            : download.state?.status === "failed"
                              ? t("localAI.retryDownload")
                              : t("localAI.download")}
                    </Text>
                  </Pressable>
                  {download.active && (
                    <Text className="text-sm text-muted">
                      {t("localAI.backgroundDownload")}
                    </Text>
                  )}
                  {!!download.error && (
                    <Text className="text-sm text-danger">
                      {download.error}
                    </Text>
                  )}
                </View>
              ) : (
                <>
                  {engine.status === "loading" && (
                    <ActivityIndicator
                      accessibilityLabel={t("localAI.loadingModel")}
                    />
                  )}
                  {engine.status === "failed" && (
                    <Pressable
                      accessibilityRole="button"
                      onPress={engine.retry}
                      className="items-center rounded-2xl bg-surface p-3"
                    >
                      <Text className="text-foreground">
                        {t("localAI.retry")}
                      </Text>
                    </Pressable>
                  )}
                  {messages.length === 0 && (
                    <Text className="px-3 py-6 text-center text-muted">
                      {t("localAI.chatWelcome")}
                    </Text>
                  )}
                  {messages.map((message) => (
                    <View
                      key={message.id}
                      className={`gap-2 ${message.role === "user" ? "items-end" : "items-start"}`}
                    >
                      <View
                        className={`max-w-[92%] rounded-3xl p-4 ${message.role === "user" ? "bg-accent" : "bg-surface"}`}
                      >
                        <Text
                          className={
                            message.role === "user"
                              ? "text-background"
                              : "text-foreground"
                          }
                        >
                          {message.text}
                        </Text>
                      </View>
                      {message.cards.length > 0 && (
                        <View className="w-full">
                          <ChatCards
                            cards={message.cards}
                            onTransaction={setSelectedTransaction}
                            onNavigate={navigateFromCard}
                          />
                        </View>
                      )}
                    </View>
                  ))}
                  {busy && <ActivityIndicator />}
                </>
              )}
              {!!(error || engine.error) && (
                <Text className="rounded-2xl bg-surface p-3 text-danger">
                  {error || engine.error}
                </Text>
              )}
            </ScrollView>
            {installed && nativeAI && (
              <View
                className="flex-row items-end gap-2 border-t border-border bg-background px-3 pt-2"
                style={{ paddingBottom: insets.bottom + 8 }}
              >
                <TextInput
                  accessibilityLabel={t("localAI.messagePlaceholder")}
                  placeholder={t("localAI.messagePlaceholder")}
                  value={draft}
                  onChangeText={setDraft}
                  multiline
                  editable={ready && !busy && !recording}
                  className="max-h-28 min-h-11 flex-1 rounded-2xl bg-surface px-4 py-2 text-foreground"
                  placeholderTextColor="#888"
                />
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel={
                    recording
                      ? t("localAI.stopRecording")
                      : t("localAI.recordVoice")
                  }
                  onPress={() => void toggleRecording()}
                  disabled={!ready || busy}
                  className="size-11 items-center justify-center rounded-full bg-surface"
                >
                  <FilledIcon name="mic" size={22} />
                </Pressable>
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel={t("localAI.send")}
                  onPress={() => void send(draft)}
                  disabled={!ready || busy || !draft.trim()}
                  className="size-11 items-center justify-center rounded-full bg-accent"
                >
                  <FilledIcon name="send" size={22} />
                </Pressable>
              </View>
            )}
          </KeyboardAvoidingView>
          {selectedTransaction && (
            <TransactionDetailSheet
              transaction={selectedTransaction}
              onDismiss={() => setSelectedTransaction(null)}
            />
          )}
          {exitWarning && (
            <View className="absolute inset-0 items-center justify-center bg-black/60 px-6">
              <View className="w-full gap-4 rounded-3xl bg-surface p-6">
                <Text className="font-manrope-bold text-lg text-foreground">
                  {t("localAI.exitTitle")}
                </Text>
                <Text className="text-muted">
                  {t("localAI.exitDescription")}
                </Text>
                <Pressable
                  accessibilityRole="checkbox"
                  accessibilityState={{ checked: doNotShowAgain }}
                  onPress={() => setDoNotShowAgain((value) => !value)}
                >
                  <Text className="text-foreground">
                    {doNotShowAgain ? "☑" : "☐"} {t("localAI.doNotShowAgain")}
                  </Text>
                </Pressable>
                <View className="flex-row justify-end gap-5">
                  <Pressable
                    onPress={() => {
                      setPendingDestination(null);
                      setExitWarning(false);
                    }}
                  >
                    <Text className="text-foreground">{t("localAI.stay")}</Text>
                  </Pressable>
                  <Pressable onPress={() => void confirmExit()}>
                    <Text className="font-manrope-bold text-accent">
                      {t("localAI.leave")}
                    </Text>
                  </Pressable>
                </View>
              </View>
            </View>
          )}
        </>
      )}
    </EdgeToEdgeLayout>
  );
}
