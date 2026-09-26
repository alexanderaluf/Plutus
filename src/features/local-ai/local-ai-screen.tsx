import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useNavigation, useRouter } from "expo-router";
import { useTranslation } from "react-i18next";
import {
  ActivityIndicator,
  BackHandler,
  Keyboard,
  Platform,
  Pressable,
  ScrollView,
  View,
} from "react-native";
import { AudioModule } from "expo-audio";
import { File } from "expo-file-system";

import { useLocalData } from "@/data/local-data-provider";
import { profileCurrency } from "@/data/model/transaction-conversion";
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
import { BottomSafeAreaGradient } from "@/shared/ui/safe-area-gradients";
import { Text } from "@/shared/ui/app-text";
import nativeAI from "../../../modules/plutus-local-ai/src/PlutusLocalAIModule";
import {
  chatSystemPrompt,
  HEALTH_TOOL_CALL,
  SNAPSHOT_TOOL_CALL,
  toolResultsPrompt,
} from "./chat-prompts";
import {
  inferPeriod,
  inferToolCalls,
  isAdviceQuestion,
  looksLikeMissingData,
  looksLikeToolRequest,
  parseToolCalls,
  stripToolJson,
  type ChatToolCall,
} from "./chat-tool-protocol";
import { runChatTools, type ChatCard } from "./chat-tools";
import {
  ChatComposer,
  KeyboardSpacer,
  useChatKeyboard,
} from "./components/chat-composer";
import { LeaveChatDialog } from "./components/leave-chat-dialog";
import { DirectionalText } from "./components/markdown-message";
import { TypewriterMarkdown } from "./components/typewriter-markdown";
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
  /** False while the model is still streaming this answer. */
  final: boolean;
  /** True until the typewriter reveal has shown the whole answer once. */
  typing: boolean;
};

type ChatPhase = "idle" | "thinking" | "reading" | "answering";

/** Recent turns replayed into a fresh engine conversation for each question. */
function transcript(messages: ChatMessage[]) {
  return messages
    .filter((message) => message.text.trim())
    .slice(-6)
    .map((message) => ({
      role: message.role === "user" ? "user" : "model",
      content: message.text.slice(0, 600),
    }));
}

/** Tool JSON must never flash in the bubble while an answer streams. */
function isToolRequestPrefix(text: string) {
  const start = text.trimStart();
  return start.startsWith("{") || /^```(json)?\s*(\{|$)/i.test(start);
}

function withAdviceTools(calls: ChatToolCall[]) {
  const names = new Set(calls.map((call) => call.name));
  return [
    ...(names.has("financial_health") ? [] : [HEALTH_TOOL_CALL]),
    ...calls,
    ...(names.has("financial_snapshot") ? [] : [SNAPSHOT_TOOL_CALL]),
  ];
}

const SUGGESTIONS = ["advice", "spending", "netWorth", "upcoming", "compare"] as const;

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
  const [phase, setPhase] = useState<ChatPhase>("idle");
  const busy = phase !== "idle";
  const keyboard = useChatKeyboard();
  const [composerHeight, setComposerHeight] = useState(112);
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
      void nativeAI?.cancelVoiceRecognitionAsync();
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

  const send = async (value: string) => {
    const question = value.trim();
    const model = llm.current;
    if (!model || !ready || busy || !question) return;
    setError("");
    setPhase("thinking");
    const history = transcript(messages);
    const questionId = ++messageId.current;
    const answerId = ++messageId.current;
    setMessages((current) => [
      ...current,
      {
        id: questionId,
        role: "user",
        text: question,
        cards: [],
        final: true,
        typing: false,
      },
    ]);
    setDraft("");
    const showAnswer = (text: string, final: boolean, cards: ChatCard[] = []) =>
      setMessages((current) => {
        const existing = current.find((message) => message.id === answerId);
        return [
          ...current.filter((message) => message.id !== answerId),
          {
            id: answerId,
            role: "assistant",
            text,
            cards,
            final,
            typing: existing?.typing ?? true,
          },
        ];
      });
    try {
      const now = new Date();
      const currency = profileCurrency(
        document,
        document._local.selectedProfileId ?? "",
      );
      const systemPrompt = chatSystemPrompt(now, currency);
      const advice = isAdviceQuestion(question);
      // A fresh conversation per question keeps the KV cache bounded while
      // the short transcript preserves follow-up context.
      model.resetConversation(JSON.stringify(history), systemPrompt);
      const first = await model.execute([{ type: "text", text: question }]);
      const requested = parseToolCalls(first);
      const period = inferPeriod(question);
      let calls: ChatToolCall[] = (requested ?? []).map((call) =>
        period && !call.args.period && !call.args.from && !call.args.to
          ? { ...call, args: { ...call.args, period } }
          : call,
      );
      if (!calls.length) calls = inferToolCalls(question);
      if (!calls.length && (requested !== null || looksLikeMissingData(first)))
        calls = [SNAPSHOT_TOOL_CALL];
      // Open-ended advice always reads most of the document first.
      if (advice) calls = withAdviceTools(calls);
      if (!calls.length) {
        const direct = stripToolJson(first);
        showAnswer(direct || t("localAI.emptyAnswer"), true);
        return;
      }

      const charBudget = Math.max(
        2_000,
        Math.round((engine.contextTokens - 3_300) * 2.8),
      );
      const answerWith = async (toolCalls: readonly ChatToolCall[]) => {
        setPhase("reading");
        const result = runChatTools(document, toolCalls, { charBudget, now });
        const mode = toolCalls.some((call) => call.name === "financial_health")
          ? "advice"
          : "answer";
        let streamed = "";
        const answer = await model.execute(
          [
            {
              type: "text",
              text: toolResultsPrompt(question, result.facts, mode),
            },
          ],
          (token) => {
            streamed += token;
            if (isToolRequestPrefix(streamed)) return;
            setPhase("answering");
            showAnswer(streamed, false);
          },
        );
        return { answer: answer.trim(), cards: result.cards };
      };

      let result = await answerWith(calls);
      // The model may ask for more tools or say it lacks data; retry once
      // with those tools, or with the whole-document snapshot.
      const followUp = looksLikeToolRequest(result.answer)
        ? parseToolCalls(result.answer)
        : null;
      const hasSnapshot = calls.some(
        (call) => call.name === "financial_snapshot",
      );
      if (
        followUp !== null ||
        (looksLikeMissingData(result.answer) && !hasSnapshot)
      ) {
        model.resetConversation(JSON.stringify(history), systemPrompt);
        result = await answerWith(
          followUp?.length && !hasSnapshot
            ? followUp
            : hasSnapshot
              ? [SNAPSHOT_TOOL_CALL]
              : [...calls, SNAPSHOT_TOOL_CALL],
        );
      }
      const answer = stripToolJson(result.answer);
      showAnswer(answer || t("localAI.emptyAnswer"), true, result.cards);
    } catch {
      setMessages((current) =>
        current.filter((message) => message.id !== answerId),
      );
      setError(t("localAI.generationFailed"));
    } finally {
      setPhase("idle");
    }
  };

  const finishTyping = useCallback((id: number) => {
    setMessages((current) =>
      current.map((message) =>
        message.id === id ? { ...message, typing: false } : message,
      ),
    );
  }, []);

  useEffect(() => {
    const sub = Keyboard.addListener(
      Platform.OS === "ios" ? "keyboardWillShow" : "keyboardDidShow",
      () => setTimeout(() => scroll.current?.scrollToEnd({ animated: true }), 50),
    );
    return () => sub.remove();
  }, []);

  const toggleRecording = async () => {
    try {
      if (!nativeAI) return;
      if (recording) {
        let transcript: string;
        if (Platform.OS === "android") {
          transcript = await nativeAI.stopVoiceRecognitionAsync();
        } else {
          const uri = await nativeAI.stopRecordingAsync();
          try {
            transcript = await nativeAI.transcribeRecordingAsync(
              uri,
              i18n.resolvedLanguage ?? "en",
            );
          } finally {
            try {
              new File(uri).delete();
            } catch {
              /* The temporary recording may already be gone. */
            }
          }
        }
        setRecording(false);
        await send(transcript);
        return;
      }
      const permission = await AudioModule.requestRecordingPermissionsAsync();
      if (!permission.granted) {
        setError(t("localAI.microphoneDenied"));
        return;
      }
      if (Platform.OS === "android")
        await nativeAI.startVoiceRecognitionAsync(
          i18n.resolvedLanguage ?? "en",
        );
      else await nativeAI.startRecordingAsync();
      setRecording(true);
    } catch {
      setRecording(false);
      setError(t("localAI.voiceUnavailable"));
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
          <View className="flex-1">
            <ScrollView
              ref={scroll}
              className="flex-1"
              contentContainerClassName="gap-4 px-4"
              // The header floats above the viewport; start content below it.
              contentContainerStyle={{
                paddingTop: insets.top + 8,
                paddingBottom: installed && nativeAI ? 0 : insets.bottom + 24,
              }}
              keyboardShouldPersistTaps="handled"
              keyboardDismissMode="interactive"
              onContentSizeChange={() => {
                if (messages.length > 0 || busy)
                  scroll.current?.scrollToEnd({ animated: true });
              }}
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
                    <View className="gap-3 py-4">
                      <Text className="px-3 text-center text-muted">
                        {t("localAI.chatWelcome")}
                      </Text>
                      <View className="flex-row flex-wrap justify-center gap-2">
                        {SUGGESTIONS.map((key) => (
                          <Pressable
                            key={key}
                            accessibilityRole="button"
                            disabled={!ready || busy}
                            onPress={() =>
                              void send(t(`localAI.suggestions.${key}`))
                            }
                            className="rounded-full border border-border bg-surface px-4 py-2"
                            style={{ opacity: ready ? 1 : 0.5 }}
                          >
                            <Text className="text-sm text-foreground">
                              {t(`localAI.suggestions.${key}`)}
                            </Text>
                          </Pressable>
                        ))}
                      </View>
                    </View>
                  )}
                  {messages.map((message) => (
                    <View
                      key={message.id}
                      className={`gap-2 ${message.role === "user" ? "items-end" : "items-start"}`}
                    >
                      {message.role === "user" ? (
                        <View className="max-w-[85%] rounded-3xl rounded-ee-lg bg-accent px-4 py-3">
                          <DirectionalText
                            text={message.text}
                            className="text-[15px] leading-6 text-background"
                          />
                        </View>
                      ) : (
                        <View className="w-full rounded-3xl rounded-es-lg bg-surface px-4 py-3.5">
                          <TypewriterMarkdown
                            text={message.text}
                            animate={message.typing}
                            final={message.final}
                            onDone={() => finishTyping(message.id)}
                          />
                        </View>
                      )}
                      {message.cards.length > 0 && !message.typing && (
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
                  {(phase === "thinking" || phase === "reading") && (
                    <View className="flex-row items-center gap-2 self-start rounded-full bg-surface px-4 py-2.5">
                      <ActivityIndicator size="small" />
                      <Text className="text-sm text-muted">
                        {phase === "reading"
                          ? t("localAI.readingRecords")
                          : t("localAI.thinking")}
                      </Text>
                    </View>
                  )}
                </>
              )}
              {!!(error || engine.error || engine.memoryLimited) && (
                <Text className="rounded-2xl bg-surface p-3 text-danger">
                  {error || (engine.memoryLimited
                    ? t("localAI.memoryUnavailable")
                    : engine.error)}
                </Text>
              )}
              {installed && nativeAI && (
                <KeyboardSpacer
                  keyboard={keyboard}
                  bottomInset={insets.bottom}
                  base={composerHeight + insets.bottom + 24}
                />
              )}
            </ScrollView>
            {installed && nativeAI && (
              <BottomSafeAreaGradient fadeHeight={composerHeight + 24} />
            )}
            {installed && nativeAI && (
              <ChatComposer
                keyboard={keyboard}
                bottomInset={insets.bottom}
                draft={draft}
                onChangeDraft={setDraft}
                onSend={() => void send(draft)}
                onToggleRecording={() => void toggleRecording()}
                recording={recording}
                ready={ready}
                busy={busy}
                onLayoutHeight={setComposerHeight}
              />
            )}
          </View>
          {selectedTransaction && (
            <TransactionDetailSheet
              transaction={selectedTransaction}
              onDismiss={() => setSelectedTransaction(null)}
            />
          )}
          <LeaveChatDialog
            isOpen={exitWarning}
            doNotShowAgain={doNotShowAgain}
            onDoNotShowAgainChange={setDoNotShowAgain}
            onStay={() => {
              setPendingDestination(null);
              setExitWarning(false);
            }}
            onLeave={() => void confirmExit()}
          />
        </>
      )}
    </EdgeToEdgeLayout>
  );
}
