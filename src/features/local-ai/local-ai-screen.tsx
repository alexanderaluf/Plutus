import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { usePreventRemove, useRouter } from "expo-router";
import { uuid } from "expo";
import { useTranslation } from "react-i18next";
import {
  ActivityIndicator,
  AppState,
  BackHandler,
  Keyboard,
  Platform,
  Pressable,
  ScrollView,
  View,
  type ScrollViewInstance,
  type TextInputInstance,
} from "react-native";

import { useLocalData } from "@/data/local-data-provider";
import {
  renameAIChat,
  saveAIChatMessages,
  setAIChatPinned,
  type AIChat,
  type AIChatMessage,
} from "@/data/model/ai-chat-record";
import { selectAIChats } from "@/data/selectors/document-selectors";
import { profileCurrency } from "@/data/model/transaction-conversion";
import type { Transaction } from "@/features/home/types";
import { useProfiles } from "@/features/profile/profile-provider";
import { TransactionDetailSheet } from "@/features/transactions/transaction-detail-sheet";
import { EdgeToEdgeLayout } from "@/shared/ui/edge-to-edge-layout";
import { FilledIcon } from "@/shared/ui/filled-icon";
import { BottomSafeAreaGradient } from "@/shared/ui/safe-area-gradients";
import { Text } from "@/shared/ui/app-text";
import nativeAI from "../../../modules/plutus-local-ai/src/PlutusLocalAIModule";
import {
  explainMutationResult,
  mutationHistoryEntry,
  runChatTurn,
  type ChatPhase,
  type HistoryTurn,
  type Translate,
} from "./chat-controller";
import type { PromptContext } from "./chat-prompts";
import { ChangeProposalCard } from "./components/change-proposal-card";
import { ChatCards } from "./components/chat-cards";
import {
  ChatEntityCard,
  entityLabel,
  useEntityData,
} from "./components/chat-entity-cards";
import { CommandSheet } from "./components/command-sheet";
import {
  MentionContext,
  type MentionResolver,
} from "./components/mention-context";
import {
  ThinkingIndicator,
  type ThinkingStage,
} from "./components/thinking-indicator";
import type { ChatCommand } from "./commands";
import type { ChatToolCall } from "./chat-tool-protocol";
import {
  ChatComposer,
  KeyboardSpacer,
  useChatKeyboard,
} from "./components/chat-composer";
import { LeaveChatDialog } from "./components/leave-chat-dialog";
import { ChatHistorySheet } from "./components/chat-history-sheet";
import { ModelSelector } from "./components/model-selector";
import { ChatGPTConnectionCard } from "./components/chatgpt-connection-card";
import { createChatGPTModel, chatGPTErrorCode } from "./chatgpt-service";
import { useChatGPT, chatGPTErrorMessage } from "./use-chatgpt";
import { DirectionalText } from "./components/markdown-message";
import { TypewriterMarkdown } from "./components/typewriter-markdown";
import type { EvidenceAudit } from "./evidence";
import { checkLocalAICompatibility } from "./model-compatibility";
import {
  LOCAL_AI_MODELS,
  type LocalAIModelKey,
  type LocalAICompatibility,
} from "./model-compatibility-policy";
import type {
  ChangeFields,
  MutableEntityType,
  MutationResult,
} from "./mutations/change-types";
import { ProposalStore } from "./mutations/proposal-store";
import type { ChatCard } from "./tools/tool-context";
import { useLocalAIEngine } from "./use-local-ai-engine";
import { useModelDownload } from "./use-model-download";
import { useVoiceInput } from "./voice/use-voice-input";
import { VOICE_LIMITS } from "./voice/voice-audio";

type ChatMessage = {
  id: number;
  role: "user" | "assistant";
  text: string;
  cards: ChatCard[];
  /** False while the model is still streaming this answer. */
  final: boolean;
  /** True until the typewriter reveal has shown the whole answer once. */
  typing: boolean;
  /** What the model sees for this turn when it differs from the text. */
  history?: string;
  audit?: EvidenceAudit;
  /** @reference → record, for cards the answer places inline. */
  mentions?: Record<string, ChatCard>;
};

const MENTION_USE = /@([ATBRGLSCP]\d{1,3})\b/;

/**
 * One assistant answer. Records the model mentions with @references render
 * inline at that point of the text; a tap opens the record in the app.
 */
function AssistantMessage({
  message,
  data,
  onTransaction,
  onDone,
}: {
  message: ChatMessage;
  data: ReturnType<typeof useEntityData>;
  onTransaction: (transaction: Transaction) => void;
  onDone: () => void;
}) {
  const router = useRouter();
  const mentions = message.mentions;
  const resolver = useMemo<MentionResolver | null>(() => {
    if (!mentions) return null;
    return {
      card: (ref) => {
        const card = mentions[ref];
        return card && card.kind !== "change_proposal" ? (
          <ChatEntityCard
            card={card}
            data={data}
            onTransaction={onTransaction}
          />
        ) : null;
      },
      label: (ref) => {
        const card = mentions[ref];
        return card && card.kind !== "change_proposal"
          ? entityLabel(card, data)
          : null;
      },
      press: (ref) => {
        const card = mentions[ref];
        if (!card || card.kind === "change_proposal") return;
        if (card.kind === "transaction") {
          const transaction = data.transaction(card.id);
          if (transaction) onTransaction(transaction);
          return;
        }
        const route = {
          account: "/accounts/[id]",
          budget: "/budgets/[id]",
          category: "/categories/[id]",
          recurring: "/recurring/[id]",
        } as const;
        if (card.kind in route)
          router.push({
            pathname: route[card.kind as keyof typeof route],
            params: { id: card.id },
          });
      },
    };
  }, [mentions, data, onTransaction, router]);
  return (
    <View className="w-full rounded-3xl rounded-es-lg bg-surface px-4 py-3.5">
      <MentionContext.Provider value={resolver}>
        <TypewriterMarkdown
          text={message.text}
          animate={message.typing}
          final={message.final}
          onDone={onDone}
        />
      </MentionContext.Provider>
    </View>
  );
}

/**
 * Recent turns replayed into a fresh conversation for each question. The
 * on-device model has a small context window; ChatGPT receives the earlier
 * questions and answers of the chat within a larger budget.
 */
function transcript(messages: ChatMessage[], cloud: boolean): HistoryTurn[] {
  const limit = cloud
    ? { messages: 40, chars: 4_000, total: 32_000 }
    : { messages: 6, chars: 600, total: Infinity };
  const turns: HistoryTurn[] = [];
  let total = 0;
  for (const message of [...messages].reverse()) {
    const content = (message.history ?? message.text).trim().slice(0, limit.chars);
    if (!content) continue;
    if (turns.length === limit.messages || total + content.length > limit.total) break;
    total += content.length;
    turns.unshift({ role: message.role === "user" ? "user" : "model", content });
  }
  return turns;
}

/** Saved form of a chat message; pending change proposals are not persisted. */
function storedMessage(message: ChatMessage): AIChatMessage {
  const records = message.cards.filter((card) => card.kind !== "change_proposal");
  const mentions = message.mentions && Object.fromEntries(
    Object.entries(message.mentions).filter(([, card]) => card.kind !== "change_proposal"),
  );
  return {
    role: message.role,
    text: message.text,
    ...(message.history !== undefined ? { history: message.history } : {}),
    ...(records.length ? { cards: records as AIChatMessage["cards"] } : {}),
    ...(mentions ? { mentions: mentions as AIChatMessage["mentions"] } : {}),
  };
}

const SUGGESTIONS = [
  "advice",
  "spending",
  "upcoming",
  "afford",
  "addExpense",
] as const;

const RESULT_CARD: Partial<
  Record<
    MutableEntityType,
    Exclude<ChatCard["kind"], "change_proposal" | "financial_priority">
  >
> = {
  transaction: "transaction",
  budget: "budget",
  account: "account",
  recurring: "recurring",
  goal: "goal",
  loan: "loan",
  asset: "asset",
  category: "category",
};

/** Development-only: flags numbers the answer used that no tool supplied. */
const AUDIT_ANSWERS = typeof __DEV__ !== "undefined" && __DEV__;

export function LocalAIScreen() {
  const { document } = useLocalData();
  const { activeProfile } = useProfiles();
  const chatgpt = useChatGPT();
  // Account/provider/profile changes remount transient chat state, so an offline
  // transcript is never replayed to a remote provider after a connection change.
  const session = [activeProfile?.id, document._local.aiModelKey, chatgpt.activeClientId, chatgpt.selectedModel].join(":");
  return <LocalAIChatScreen key={session} />;
}

function LocalAIChatScreen() {
  const { t, i18n } = useTranslation();
  const router = useRouter();
  const { document, updateDocument, removeRecord } = useLocalData();
  const [compatibility, setCompatibility] =
    useState<LocalAICompatibility | null>(null);
  const modelKey: LocalAIModelKey = document._local.aiModelKey;
  const model = LOCAL_AI_MODELS[modelKey];
  const download = useModelDownload(modelKey);
  const installed = download.installed;
  const chatgpt = useChatGPT();
  const cloudSelected = !!chatgpt.selectedModel;
  const engine = useLocalAIEngine(installed && chatgpt.hydrated && !cloudSelected, modelKey);
  const cloudModel = useMemo(() => chatgpt.selectedModel ? createChatGPTModel(chatgpt.selectedModel, chatgpt.activeClientId) : null, [chatgpt.selectedModel, chatgpt.activeClientId]);
  const ready = cloudSelected ? chatgpt.planEnabled && chatgpt.models.some((item) => item.slug === chatgpt.selectedModel) : engine.ready;
  const contextTokens = cloudSelected ? 8192 : engine.contextTokens;
  useEffect(() => {
    const subscription = AppState.addEventListener("change", (state) => { if (state !== "active") cloudModel?.cancel(); });
    return () => { subscription.remove(); cloudModel?.cancel(); };
  }, [cloudModel]);
  const { activeProfile } = useProfiles();
  const [phase, setPhase] = useState<ChatPhase>("idle");
  const keyboard = useChatKeyboard();
  const [composerHeight, setComposerHeight] = useState(112);
  const [draft, setDraft] = useState("");
  const [error, setError] = useState("");
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const messagesRef = useRef(messages);
  useEffect(() => {
    messagesRef.current = messages;
  }, [messages]);
  const [selectedTransaction, setSelectedTransaction] =
    useState<Transaction | null>(null);
  const [exitWarning, setExitWarning] = useState(false);
  const [doNotShowAgain, setDoNotShowAgain] = useState(false);
  const [commandSheet, setCommandSheet] = useState<{ query: string } | null>(
    null,
  );
  const [modelSelectorOpen, setModelSelectorOpen] = useState(false);
  const [historyOpen, setHistoryOpen] = useState(false);
  // ChatGPT chats are saved from their first message. `saved` is the transcript
  // last written, so opening or re-rendering a chat never rewrites or reorders it.
  const chat = useRef<{ id: string | null; saved: string }>({ id: null, saved: "" });
  const [chatId, setChatId] = useState<string | null>(null);
  const profileId = activeProfile?.id ?? "";
  const savedChats = useMemo(
    () => (cloudSelected && profileId ? selectAIChats(document, profileId) : []),
    [document, profileId, cloudSelected],
  );
  useEffect(() => {
    const id = chat.current.id;
    if (!cloudSelected || !id || !profileId || !messages.length || messages.some((message) => !message.final)) return;
    const stored = messages.map(storedMessage);
    const signature = JSON.stringify(stored);
    if (signature === chat.current.saved) return;
    chat.current.saved = signature;
    const model = chatgpt.selectedModel;
    updateDocument((current) =>
      saveAIChatMessages(current, { id, user: profileId, model, messages: stored, now: new Date().toISOString() }),
    ).catch(() => {
      if (chat.current.id === id) chat.current.saved = "";
      setError(t("localAI.history.saveFailed"));
    });
  }, [messages, cloudSelected, profileId, chatgpt.selectedModel, updateDocument, t]);
  const composerInput = useRef<TextInputInstance>(null);
  const entityData = useEntityData();
  // Auto-scroll follows a streaming answer only while the user is at the end.
  const following = useRef(true);
  const userScrolling = useRef(false);
  const allowExit = useRef(false);
  const messageId = useRef(0);
  const scroll = useRef<ScrollViewInstance>(null);
  // Proposals live only in memory for this chat; an app restart drops them.
  const [proposals] = useState(() => new ProposalStore(() => uuid.v4()));
  // Bumped when the store changes so cards re-read its status.
  const [, setProposalVersion] = useState(0);
  const [proposalState, setProposalState] = useState<
    Record<string, { busy?: boolean; error?: string; result?: MutationResult }>
  >({});
  const structuredOutput = useRef({ enabled: false });
  const translate = t as unknown as Translate;
  const voiceLanguage = i18n.resolvedLanguage ?? "en";
  const sendRef = useRef<(value: string) => Promise<void>>(
    async () => undefined,
  );
  const voice = useVoiceInput({
    model: engine.engine,
    language: voiceLanguage,
    onTranscript: (text) => void sendRef.current(text),
    onError: (code) =>
      setError(
        t(`localAI.voiceErrors.${code}` as "localAI.voiceErrors.AUDIO_EMPTY", {
          defaultValue: t("localAI.voiceUnavailable"),
        }),
      ),
  });
  const busy = phase !== "idle" || voice.busy;

  useEffect(() => {
    let active = true;
    void checkLocalAICompatibility(modelKey).then((result) => {
      if (active) setCompatibility(result);
    });
    return () => {
      active = false;
    };
  }, [modelKey]);
  useEffect(() => () => proposals.clear(), [proposals]);

  const incompatibilityReasons =
    compatibility?.reasons.filter(
      // A running or finished download has already consumed the free space.
      (reason) =>
        !(installed || download.active) ||
        (reason !== "storage-low" && reason !== "storage-unknown"),
    ) ?? [];

  // ChatGPT chats are saved, so only an on-device chat is lost by leaving.
  const warnOnExit = !document._local.aiExitWarningDismissed && !cloudSelected;
  const requestExit = useCallback(() => {
    if (!warnOnExit || allowExit.current) {
      router.back();
      return;
    }
    setExitWarning(true);
  }, [warnOnExit, router]);
  useEffect(() => {
    const sub = BackHandler.addEventListener("hardwareBackPress", () => {
      requestExit();
      return true;
    });
    return () => sub.remove();
  }, [requestExit]);
  // confirmExit lifts the prevention with disableExitPrevention().
  const disableExitPrevention = usePreventRemove(warnOnExit, () => setExitWarning(true));

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
    proposals.clear();
    setExitWarning(false);
    await voice.cancel();
    cloudModel?.cancel();
    engine.release();
    disableExitPrevention();
    router.back();
  };

  const promptContext = (): PromptContext => ({
    now: new Date(),
    currency: profileCurrency(
      document,
      document._local.selectedProfileId ?? "",
    ),
    monthStartDay: document._local.monthStartDay,
    appLanguage: document._local.appLanguage,
    profileName: activeProfile?.name,
  });

  const append = (message: Omit<ChatMessage, "id">) => {
    const id = ++messageId.current;
    setMessages((current) => [...current, { ...message, id }]);
    return id;
  };

  const send = async (value: string, forcedCalls?: ChatToolCall[]) => {
    const question = value.trim();
    const model = cloudSelected ? cloudModel : engine.engine.current;
    if (!model || !ready || phase !== "idle" || !question) return;
    setError("");
    setPhase("thinking");
    following.current = true;
    setTimeout(() => scroll.current?.scrollToEnd({ animated: true }), 50);
    const history = transcript(messagesRef.current, cloudSelected);
    if (cloudSelected && !chat.current.id) {
      chat.current = { id: uuid.v4(), saved: "" };
      setChatId(chat.current.id);
    }
    append({
      role: "user",
      text: question,
      cards: [],
      final: true,
      typing: false,
    });
    if (!document._local.aiFirstChatAt)
      // Only a UI preference; failure to save just shows the intro again.
      void updateDocument((current) =>
        current._local.aiFirstChatAt
          ? current
          : {
              ...current,
              _local: {
                ...current._local,
                aiFirstChatAt: new Date().toISOString(),
              },
            },
      ).catch(() => undefined);
    const answerId = ++messageId.current;
    setDraft("");
    const showAnswer = (
      text: string,
      final: boolean,
      extra: Partial<ChatMessage> = {},
    ) =>
      setMessages((current) => {
        const existing = current.find((message) => message.id === answerId);
        return [
          ...current.filter((message) => message.id !== answerId),
          {
            id: answerId,
            role: "assistant",
            text,
            cards: [],
            final,
            typing: existing?.typing ?? true,
            ...extra,
          },
        ];
      });
    try {
      const result = await runChatTurn({
        model,
        document,
        question,
        history,
        prompt: promptContext(),
        contextTokens,
        proposals,
        t: translate,
        structuredOutput: structuredOutput.current,
        audit: AUDIT_ANSWERS,
        forcedCalls,
        onPhase: setPhase,
        onToken: (text) => showAnswer(text, false),
      });
      if (result.kind === "proposal") {
        const proposal = proposals.get(result.proposalId);
        showAnswer(result.text, true, {
          cards: result.cards,
          history: `${result.text} [PROPOSAL pending review: ${proposal?.operation} ${proposal?.entityType} "${proposal?.entityName}"]`,
        });
      } else if (result.kind === "clarification") {
        showAnswer(result.text, true, {
          cards: result.cards,
          history: result.cards.length
            ? `${result.text} (candidate ids: ${result.cards.map((card) => ("id" in card ? card.id : "")).join(", ")})`
            : undefined,
        });
      } else
        showAnswer(result.text, true, {
          cards: result.cards,
          audit: result.audit,
          mentions: result.mentions ?? {},
        });
    } catch (cause) {
      setMessages((current) =>
        current.filter((message) => message.id !== answerId),
      );
      setError(cloudSelected ? chatGPTErrorMessage(t, chatGPTErrorCode(cause)) : t("localAI.generationFailed"));
    } finally {
      setPhase("idle");
    }
  };
  useEffect(() => {
    sendRef.current = send;
  });

  /** Only this handler — the user's tap — can execute a proposal. */
  const decide = async (proposalId: string, confirm: boolean) => {
    const proposal = proposals.get(proposalId);
    if (!proposal) return;
    setProposalState((current) => ({
      ...current,
      [proposalId]: { busy: true },
    }));
    const result = confirm
      ? await proposals.execute(proposalId, updateDocument)
      : proposals.cancel(proposalId);
    setProposalState((current) => ({ ...current, [proposalId]: { result } }));
    setProposalVersion((value) => value + 1);
    const history = [
      ...transcript(messagesRef.current, cloudSelected),
      mutationHistoryEntry(result),
    ];
    const model = cloudSelected ? cloudModel : engine.engine.current;
    const card =
      result.status === "completed" &&
      proposal.operation !== "delete" &&
      proposal.entityId
        ? RESULT_CARD[proposal.entityType]
        : undefined;
    let text: string = t(`localAI.proposal.results.${result.status}`, {
      name: proposal.entityName,
    });
    // The model explains the real outcome once the app has decided it.
    if (result.status !== "cancelled" && model && ready && phase === "idle") {
      setPhase("thinking");
      try {
        text = await explainMutationResult({
          model,
          history,
          prompt: promptContext(),
          result,
          question:
            messagesRef.current
              .filter((message) => message.role === "user")
              .at(-1)?.text ?? "",
          t: translate,
        });
      } finally {
        setPhase("idle");
      }
    }
    append({
      role: "assistant",
      text,
      cards:
        card && proposal.entityId
          ? [{ kind: card, id: proposal.entityId } as ChatCard]
          : [],
      final: true,
      typing: true,
      history: mutationHistoryEntry(result).content,
    });
  };

  const revise = (proposalId: string, patch: ChangeFields) => {
    const result = proposals.revise(document, proposalId, patch);
    if (!result.ok) {
      setProposalState((current) => ({
        ...current,
        [proposalId]: { error: result.message },
      }));
      return;
    }
    const next = result.proposal.proposalId;
    setMessages((current) =>
      current.map((message) => ({
        ...message,
        cards: message.cards.map((card) =>
          card.kind === "change_proposal" && card.proposalId === proposalId
            ? { kind: "change_proposal", proposalId: next }
            : card,
        ),
      })),
    );
    setProposalVersion((value) => value + 1);
  };

  const renderProposal = (proposalId: string) => {
    const proposal = proposals.get(proposalId);
    if (!proposal) return null;
    const state = proposalState[proposalId] ?? {};
    return (
      <ChangeProposalCard
        key={proposalId}
        proposal={proposal}
        status={proposals.status(proposalId) ?? "expired"}
        result={state.result}
        busy={!!state.busy || phase !== "idle"}
        error={state.error}
        onConfirm={() => void decide(proposalId, true)}
        onCancel={() => void decide(proposalId, false)}
        onRevise={(patch) => revise(proposalId, patch)}
      />
    );
  };

  /** "/" menu: run a capability directly, or prefill a sentence to finish. */
  const runCommand = (command: ChatCommand) => {
    if (command.template) {
      setDraft(
        t(
          `localAI.commands.templates.${command.id}` as "localAI.commands.templates.addExpense",
        ),
      );
      setTimeout(() => composerInput.current?.focus(), 350);
      return;
    }
    if (command.calls)
      void send(
        t(
          `localAI.commands.items.${command.id}` as "localAI.commands.items.netWorth",
        ),
        command.calls,
      );
  };

  const selectModel = async (key: LocalAIModelKey) => {
    if (key === modelKey && !cloudSelected) return;
    await voice.cancel();
    // Release the old LiteRT instance before persisting the new selection.
    // The engine hook also serializes any load still in flight.
    engine.release();
    try {
      await updateDocument((current) => ({
        ...current,
        _local: { ...current._local, aiModelKey: key },
      }));
      await chatgpt.selectModel(null);
      // Keep an offline conversation from being sent to a remote provider later.
      await newChat();
    } catch (cause) {
      engine.retry();
      throw cause;
    }
  };

  const selectChatGPT = async (slug: string) => {
    if (busy) return;
    await voice.cancel();
    await chatgpt.selectModel(slug);
    engine.release();
    await newChat();
  };

  const startModelDownload = async (key: LocalAIModelKey) => {
    if (!nativeAI) throw new Error(t("localAI.runtimeUnavailable"));
    const result = await checkLocalAICompatibility(key);
    if (result.isExpoGo) throw new Error(t("localAI.expoGoUnavailable"));
    if (result.reasons.length)
      throw new Error(
        result.reasons
          .map((reason) => t(`localAI.reasons.${reason}`))
          .join(" "),
      );
    await download.start(key);
  };

  const deleteModel = async (key: LocalAIModelKey) => {
    if (key === modelKey) {
      await selectModel(key === "E2B" ? "E4B" : "E2B");
    }
    await download.remove(key);
  };

  const newChat = async () => {
    if (busy) return;
    await voice.cancel();
    chat.current = { id: null, saved: "" };
    setChatId(null);
    setMessages([]);
    messagesRef.current = [];
    setDraft("");
    setError("");
    setProposalState({});
    proposals.clear();
    structuredOutput.current = { enabled: false };
    following.current = true;
    scroll.current?.scrollTo({ y: 0, animated: false });
  };

  /** Continues a saved chat; its earlier turns become ChatGPT's context again. */
  const openChat = async (saved: AIChat) => {
    if (busy) return;
    setHistoryOpen(false);
    if (saved.id === chat.current.id) return;
    await newChat();
    const restored: ChatMessage[] = saved.messages.map((message) => ({
      id: ++messageId.current,
      role: message.role,
      text: message.text,
      cards: (message.cards ?? []) as ChatCard[],
      final: true,
      typing: false,
      ...(message.history !== undefined ? { history: message.history } : {}),
      ...(message.mentions ? { mentions: message.mentions as Record<string, ChatCard> } : {}),
    }));
    chat.current = { id: saved.id, saved: JSON.stringify(restored.map(storedMessage)) };
    setChatId(saved.id);
    setMessages(restored);
    messagesRef.current = restored;
    setTimeout(() => scroll.current?.scrollToEnd({ animated: false }), 80);
  };

  const deleteChat = async (saved: AIChat) => {
    await removeRecord("aiChats", saved.id);
    if (chat.current.id === saved.id) await newChat();
  };

  const renameChat = (saved: AIChat, title: string) =>
    updateDocument((current) => renameAIChat(current, saved.id, title, new Date().toISOString()));

  const togglePinnedChat = (saved: AIChat) =>
    updateDocument((current) => setAIChatPinned(current, saved.id, !saved.pinned, new Date().toISOString()));

  const thinkingStage: ThinkingStage | null =
    voice.state.type === "transcribing" ||
    voice.state.type === "validating_audio" ||
    voice.state.type === "finalizing"
      ? "transcribing"
      : phase === "thinking"
        ? "thinking"
        : phase === "reading"
          ? "reading"
          : phase === "answering" &&
              !messages.some(
                (message) =>
                  message.role === "assistant" &&
                  !message.final &&
                  message.text,
              )
            ? "answering"
            : null;

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
      () =>
        setTimeout(() => scroll.current?.scrollToEnd({ animated: true }), 50),
    );
    return () => sub.remove();
  }, []);

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
          <View className="flex-1" />
          {cloudSelected && (
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={t("localAI.history.title")}
              disabled={busy}
              onPress={() => {
                Keyboard.dismiss();
                setHistoryOpen(true);
              }}
              className="size-10 items-center justify-center rounded-full bg-surface-secondary"
              style={{ opacity: busy ? 0.45 : 1 }}
            >
              <FilledIcon name="history" size={22} />
            </Pressable>
          )}
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={t("localAI.newChat")}
            disabled={busy}
            onPress={() => void newChat()}
            className="size-10 items-center justify-center rounded-full bg-surface-secondary"
            style={{ opacity: busy ? 0.45 : 1 }}
          >
            <FilledIcon name="new-chat" size={22} />
          </Pressable>
        </View>
      }
      bottomFade={!nativeAI}
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
                paddingBottom: nativeAI ? 0 : insets.bottom + 24,
              }}
              keyboardShouldPersistTaps="handled"
              keyboardDismissMode="interactive"
              scrollEventThrottle={32}
              // Touching the list pauses following so the user can read.
              onTouchStart={() => {
                if (busy || messages.some((message) => message.typing))
                  following.current = false;
              }}
              onScrollBeginDrag={() => {
                userScrolling.current = true;
                following.current = false;
              }}
              onMomentumScrollEnd={() => {
                userScrolling.current = false;
              }}
              onScroll={({ nativeEvent }) => {
                if (!userScrolling.current) return;
                const distance =
                  nativeEvent.contentSize.height -
                  (nativeEvent.contentOffset.y +
                    nativeEvent.layoutMeasurement.height);
                // Scrolling back to the end resumes following the answer.
                following.current = distance < 56;
              }}
              onContentSizeChange={() => {
                if (following.current && (messages.length > 0 || busy))
                  scroll.current?.scrollToEnd({ animated: false });
              }}
            >
              {/* Introduces the private model only until the first chat message. */}
              {!cloudSelected && !document._local.aiFirstChatAt && (
                <View className="rounded-3xl bg-surface p-4">
                  <Text className="font-manrope-semibold text-base text-foreground">
                    {t("localAI.privacyTitle")}
                  </Text>
                  <Text className="mt-1 font-sans text-sm leading-5 text-muted">
                    {t("localAI.privacyDescription")}
                  </Text>
                </View>
              )}
              {chatgpt.hydrated && !cloudSelected && (!chatgpt.connected || !installed) && (
                <View className="gap-3">
                  {!Object.values(download.states).some((state) => state?.status === "installed") && (
                    <View className="gap-1 px-1">
                      <Text className="font-manrope-bold text-lg text-foreground">{t("localAI.settings.choose")}</Text>
                      <Text className="leading-5 text-muted">{t("localAI.settings.chooseDescription")}</Text>
                    </View>
                  )}
                  <ChatGPTConnectionCard busy={busy} onSelect={selectChatGPT} />
                </View>
              )}
              {!chatgpt.hydrated || (!cloudSelected && compatibility === null) ? (
                <ActivityIndicator />
              ) : !cloudSelected && incompatibilityReasons.length > 0 ? (
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
              ) : !cloudSelected && (!nativeAI || compatibility?.isExpoGo) ? (
                <View className="rounded-3xl bg-surface p-5">
                  <Text className="font-manrope-semibold text-foreground">
                    {t("localAI.deviceSupported")}
                  </Text>
                  <Text className="mt-2 text-muted">
                    {t("localAI.expoGoUnavailable")}
                  </Text>
                </View>
              ) : !cloudSelected && !installed ? (
                <View className="gap-3 rounded-3xl bg-surface p-5">
                  <Text className="font-manrope-semibold text-foreground">
                    {t("localAI.deviceSupported")}
                  </Text>
                  <Text className="text-muted">
                    {t("localAI.modelRequirements", {
                      size: (model.sizeBytes / 1_000_000_000).toFixed(1),
                    })}
                  </Text>
                  <Pressable
                    accessibilityRole="button"
                    disabled={!download.state || download.active}
                    onPress={() =>
                      void startModelDownload(modelKey).catch((cause) =>
                        setError(String(cause)),
                      )
                    }
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
                  {!cloudSelected && engine.status === "loading" && (
                    <ActivityIndicator
                      accessibilityLabel={t("localAI.loadingModel")}
                    />
                  )}
                  {!cloudSelected && engine.status === "failed" && (
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
                        <AssistantMessage
                          message={message}
                          data={entityData}
                          onTransaction={setSelectedTransaction}
                          onDone={() => finishTyping(message.id)}
                        />
                      )}
                      {AUDIT_ANSWERS && !!message.audit?.unsupported.length && (
                        <Text className="px-2 text-[11px] text-muted">
                          {`dev audit: ${message.audit.unsupported.length} number(s) not in the evidence: ${message.audit.unsupported.slice(0, 5).join(", ")}`}
                        </Text>
                      )}
                      {message.cards.length > 0 &&
                        !message.typing &&
                        // Answers show their records inline; the list below is
                        // only a fallback when the answer mentioned none.
                        (!message.mentions ||
                          !MENTION_USE.test(message.text)) && (
                          <View className="w-full gap-2">
                            {message.mentions && (
                              <Text className="px-1 pt-1 text-[12px] font-manrope-semibold uppercase tracking-widest text-muted">
                                {t("localAI.relatedRecords")}
                              </Text>
                            )}
                            <ChatCards
                              cards={
                                message.mentions
                                  ? message.cards.slice(0, 4)
                                  : message.cards
                              }
                              data={entityData}
                              onTransaction={setSelectedTransaction}
                              renderProposal={renderProposal}
                            />
                          </View>
                        )}
                    </View>
                  ))}
                  {thinkingStage && <ThinkingIndicator stage={thinkingStage} />}
                </>
              )}
              {!!(error || engine.error || engine.memoryLimited) && (
                <Text className="rounded-2xl bg-surface p-3 text-danger">
                  {error ||
                    (engine.memoryLimited
                      ? t("localAI.memoryUnavailable")
                      : engine.error)}
                </Text>
              )}
              {cloudSelected && !!chatgpt.errorMessage && <Text accessibilityRole="alert" className="rounded-2xl bg-surface p-3 text-danger">{chatgpt.errorMessage}</Text>}
              {cloudSelected && /usage_limit_exceeded/.test(chatgpt.error) && <Pressable accessibilityRole="link" onPress={chatgpt.manageUsage} className="min-h-12 items-center justify-center rounded-2xl bg-accent">
                <Text className="font-manrope-bold text-background">{t("localAI.chatgpt.manageUsage")}</Text>
              </Pressable>}
              {!!nativeAI && (
                <KeyboardSpacer
                  keyboard={keyboard}
                  bottomInset={insets.bottom}
                  base={composerHeight + insets.bottom + 24}
                />
              )}
            </ScrollView>
            {!!nativeAI && (
              <BottomSafeAreaGradient fadeHeight={composerHeight + 24} />
            )}
            {!!nativeAI && (
              <ChatComposer
                keyboard={keyboard}
                bottomInset={insets.bottom}
                draft={draft}
                onChangeDraft={setDraft}
                onSend={() => void send(draft)}
                onOpenCommands={() => {
                  Keyboard.dismiss();
                  setCommandSheet({ query: "" });
                }}
                modelName={cloudSelected ? chatgpt.models.find((item) => item.slug === chatgpt.selectedModel)?.display_name ?? chatgpt.selectedModel ?? "" : model.name}
                provider={cloudSelected ? "chatgpt" : "gemma"}
                onOpenModels={() => {
                  Keyboard.dismiss();
                  setModelSelectorOpen(true);
                }}
                inputRef={composerInput}
                voice={voice.state}
                levels={voice.levels}
                maxSeconds={VOICE_LIMITS.maxDurationMs / 1000}
                voiceAvailable={!cloudSelected && engine.audioCapable}
                onStartRecording={() => {
                  setError("");
                  void voice.start();
                }}
                onStopRecording={() => void voice.stop()}
                onCancelRecording={() => void voice.cancel()}
                ready={ready}
                busy={busy}
                onLayoutHeight={setComposerHeight}
              />
            )}
          </View>
          {commandSheet && (
            <CommandSheet
              initialQuery={commandSheet.query}
              onSelect={runCommand}
              onDismiss={() => setCommandSheet(null)}
            />
          )}
          {modelSelectorOpen && (
            <ModelSelector
              selected={modelKey}
              states={download.states}
              busy={busy}
              error={download.error || error}
              onClose={() => setModelSelectorOpen(false)}
              onSelect={selectModel}
              onSelectChatGPT={selectChatGPT}
              onDownload={startModelDownload}
              onDelete={deleteModel}
            />
          )}
          {cloudSelected && (
            <ChatHistorySheet
              open={historyOpen}
              chats={savedChats}
              activeId={chatId}
              onClose={() => setHistoryOpen(false)}
              onOpenChat={(saved) => void openChat(saved)}
              onNewChat={() => {
                setHistoryOpen(false);
                void newChat();
              }}
              onRename={renameChat}
              onTogglePin={togglePinnedChat}
              onDelete={deleteChat}
            />
          )}
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
            onStay={() => setExitWarning(false)}
            onLeave={() => void confirmExit()}
          />
        </>
      )}
    </EdgeToEdgeLayout>
  );
}
