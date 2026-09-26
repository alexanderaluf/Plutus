import type { BackupDocument } from "@/data/model/backup-document";

import {
  chatSystemPrompt,
  mutationResultPrompt,
  plannerPrompt,
  PLANNER_SCHEMA,
  SNAPSHOT_TOOL_CALL,
  toolResultsPrompt,
  type PromptContext,
} from "./chat-prompts";
import {
  inferToolCalls,
  looksLikeMissingData,
  looksLikeToolRequest,
  parseToolCalls,
  stripToolJson,
  type ChatToolCall,
} from "./chat-tool-protocol";
import { runChatTools } from "./chat-tools";
import { auditAnswerNumbers, type EvidenceAudit, type EvidenceBundle } from "./evidence";
import { resolveIntent, type IntentResolution } from "./intent-router";
import type {
  ChangeFields,
  ChangeOperation,
  MutableEntityType,
  MutationResult,
  PrepareChangeArgs,
} from "./mutations/change-types";
import type { ProposalStore } from "./mutations/proposal-store";
import type { ChatCard } from "./tools/tool-context";

/** The slice of the LiteRT-LM instance the chat needs; tests pass a fake. */
export interface ChatModel {
  resetConversation(historyJson?: string, systemPrompt?: string): void;
  execute(
    parts: { type: "text" | "audio" | "image"; text?: string; path?: string }[],
    onToken?: (token: string, done: boolean) => void,
    options?: { maxOutputTokens?: number; responseSchema?: string },
  ): Promise<string>;
}

export type HistoryTurn = { role: "user" | "model"; content: string };

export type ChatPhase = "idle" | "thinking" | "reading" | "answering";

export type Translate = (key: string, values?: Record<string, string | number>) => string;

export type ChatTurnInput = {
  model: ChatModel;
  document: BackupDocument;
  question: string;
  history: HistoryTurn[];
  prompt: PromptContext;
  contextTokens: number;
  proposals: ProposalStore;
  t: Translate;
  /** Constrained JSON for the planner; turned off after the first failure. */
  structuredOutput?: { enabled: boolean };
  onPhase?: (phase: ChatPhase) => void;
  onToken?: (text: string) => void;
  /** Development builds attach an evidence audit to each answer. */
  audit?: boolean;
  /**
   * Tools chosen by the app (e.g. from the command menu). Skips planning so
   * a menu action always runs exactly the capability the user picked.
   */
  forcedCalls?: ChatToolCall[];
};

export type ChatTurnResult =
  | {
      kind: "answer";
      text: string;
      cards: ChatCard[];
      /** @reference → record for cards placed inline in the answer text. */
      mentions?: Record<string, ChatCard>;
      evidence?: EvidenceBundle;
      audit?: EvidenceAudit;
      route: IntentResolution;
    }
  | { kind: "proposal"; text: string; proposalId: string; cards: ChatCard[]; route: IntentResolution }
  | { kind: "clarification"; text: string; cards: ChatCard[]; route: IntentResolution };

/** Tool JSON must never flash in the bubble while an answer streams. */
export function isToolRequestPrefix(text: string) {
  const start = text.trimStart();
  return start.startsWith("{") || /^```(json)?\s*(\{|$)/i.test(start);
}

function charBudget(contextTokens: number) {
  return Math.max(2_000, Math.round((contextTokens - 3_300) * 2.8));
}

async function plan(input: ChatTurnInput, route: IntentResolution) {
  const { model } = input;
  const schema = input.structuredOutput?.enabled ? PLANNER_SCHEMA : undefined;
  const prompt = [{ type: "text" as const, text: plannerPrompt(input.question, route.packs) }];
  if (schema) {
    try {
      return await model.execute(prompt, undefined, { responseSchema: schema, maxOutputTokens: 320 });
    } catch {
      // Constrained decoding is unavailable on this engine; plan freely.
      input.structuredOutput!.enabled = false;
      model.resetConversation(
        JSON.stringify(input.history),
        chatSystemPrompt(input.prompt, route.packs),
      );
    }
  }
  return model.execute(prompt, undefined, { maxOutputTokens: 320 });
}

function withPeriod(calls: ChatToolCall[], period: string | undefined) {
  return calls.map((call) =>
    period && !call.args.period && !call.args.from && !call.args.to && call.name !== "prepare_change"
      ? { ...call, args: { ...call.args, period } }
      : call,
  );
}

function merge(calls: ChatToolCall[], extra: ChatToolCall[]) {
  const result = [...calls];
  for (const call of extra) if (!result.some((item) => item.name === call.name)) result.push(call);
  return result.slice(0, 5);
}

/** The plain-text part of a planner reply that asked a question instead. */
function clarificationFrom(output: string) {
  const text = stripToolJson(output).trim();
  return text && text.length <= 300 && /[?？]\s*$/.test(text) ? text : null;
}

async function answerWithTools(
  input: ChatTurnInput,
  route: IntentResolution,
  calls: ChatToolCall[],
): Promise<ChatTurnResult> {
  const { model } = input;
  const budget = charBudget(input.contextTokens);
  const run = async (toolCalls: ChatToolCall[]) => {
    input.onPhase?.("reading");
    const result = runChatTools(input.document, toolCalls, {
      charBudget: budget,
      now: input.prompt.now,
      question: input.question,
    });
    const mode = toolCalls.some(
      (call) => call.name === "financial_advice_context" || call.name === "financial_health",
    )
      ? "advice"
      : "answer";
    model.resetConversation(JSON.stringify(input.history), chatSystemPrompt(input.prompt));
    let streamed = "";
    const answer = await model.execute(
      [{ type: "text", text: toolResultsPrompt(input.question, result.facts, mode) }],
      (token) => {
        streamed += token;
        if (isToolRequestPrefix(streamed)) return;
        input.onPhase?.("answering");
        input.onToken?.(streamed);
      },
    );
    return { answer: answer.trim(), result };
  };
  let { answer, result } = await run(calls);
  // The model may ask for more tools or say it lacks data; retry once with
  // those tools, or with the whole-document snapshot.
  const followUp = looksLikeToolRequest(answer) ? parseToolCalls(answer) : null;
  const hasSnapshot = calls.some((call) => call.name === "financial_snapshot");
  if (followUp !== null || (looksLikeMissingData(answer) && !hasSnapshot)) {
    const retry = followUp?.length && !hasSnapshot
      ? merge(followUp.filter((call) => call.name !== "prepare_change"), [])
      : hasSnapshot
        ? [SNAPSHOT_TOOL_CALL]
        : [...calls, SNAPSHOT_TOOL_CALL];
    ({ answer, result } = await run(retry.length ? retry : [SNAPSHOT_TOOL_CALL]));
  }
  const text =
    cleanMentions(stripQuestionEcho(stripToolJson(answer), input.question), result.mentions) ||
    input.t("localAI.emptyAnswer");
  return {
    kind: "answer",
    text,
    cards: result.cards,
    mentions: result.mentions,
    evidence: result.evidence,
    ...(input.audit ? { audit: auditAnswerNumbers(text, result.evidence) } : {}),
    route,
  };
}

// ---------------------------------------------------------------------------
// Mutation branch

const STOPWORDS = new Set(
  "a an the my me i to for of on at in from with and please can you could would want like need lets let's this that it one new add create record log make set up open start track change edit update modify rename fix correct delete remove erase archive pause is was be by as into transaction transactions expense income budget budgets recurring subscription payment category account goal loan asset template label tag place person contact yesterday today yesterday's today's duplicate spent paid bought got received per month monthly weekly yearly את של על עם אל לי זה זאת את ה ב ל מ תוסיף הוסף צור תיצור רשום תרשום תמחק מחק תשנה שנה עדכן תעדכן הוצאה הכנסה תקציב מנוי קטגוריה חשבון יעד אתמול היום הוצאתי שילמתי קניתי в на за с и мой моя мои это удали добавь создай запиши измени поменяй расход доход бюджет подписку категорию счет цель вчера сегодня потратил заплатил купил"
    .split(/\s+/),
);

function capitalize(text: string) {
  return text ? text.charAt(0).toUpperCase() + text.slice(1) : text;
}

/**
 * Deterministic fallback when the model does not produce prepare_change.
 * It extracts only what the words clearly say; everything else is left for
 * the review card or a clarification question.
 */
export function extractChangeRequest(
  question: string,
  operation: ChangeOperation,
  entityType: MutableEntityType,
): PrepareChangeArgs | null {
  const fields: ChangeFields = {};
  const quoted = question.match(/["“”'«»]([^"“”'«»]{2,60})["“”'«»]/)?.[1];
  const fromTo = question.match(/(?:from|מ-?|с)\s*(\d[\d,.]*)\s*(?:to|ל-?|на|до)\s*(\d[\d,.]*)/i);
  const amounts = [...question.matchAll(/(\d[\d,]*(?:\.\d+)?)\s*(k\b)?/gi)]
    .map((match) => Number(match[1].replace(/,/g, "")) * (match[2] ? 1000 : 1))
    .filter((value) => Number.isFinite(value) && !(value >= 1990 && value <= 2100));
  const currency = question.match(/\b(ILS|NIS|USD|EUR|GBP|RUB)\b|₪|€|\$|£/i)?.[0];
  if (currency) fields.currency = currency;
  if (/(yesterday|אתמול|вчера)/i.test(question) && operation === "create") fields.date = "yesterday";
  if (/(income|salary|got paid|received|הכנסה|משכורת|קיבלתי|доход|зарплат|получил)/i.test(question) && entityType === "transaction" && operation === "create")
    fields.type = "income";
  const words = question
    .replace(/['’]s\b/gi, "")
    .replace(/["“”'«»]/g, " ")
    .replace(/(\d[\d,]*(?:\.\d+)?)\s*(k\b)?/gi, " ")
    .replace(/\b(ILS|NIS|USD|EUR|GBP|RUB)\b|₪|€|\$|£/gi, " ")
    .split(/[\s,.!?;:]+/)
    .filter((word) => word && !STOPWORDS.has(word.toLowerCase()));
  const phrase = quoted ?? words.join(" ").trim();
  let entityId: string | undefined;
  if (operation === "create") {
    if (amounts[0] !== undefined) fields[entityType === "goal" ? "targetAmount" : "amount"] = amounts[0];
    if (phrase) {
      fields.name = capitalize(phrase);
      if (entityType === "budget" || entityType === "transaction" || entityType === "recurring") fields.category = phrase;
    }
    if (entityType === "recurring" && /(week|שבוע|недел)/i.test(question)) fields.period = "Weekly";
    if (entityType === "recurring" && /(year|annual|שנה|год)/i.test(question)) fields.period = "Yearly";
  } else {
    entityId = [
      /(yesterday|אתמול|вчера)/i.test(question) ? "yesterday" : /(today|היום|сегодня)/i.test(question) ? "today" : "",
      phrase,
    ]
      .filter(Boolean)
      .join(" ")
      .trim();
    if (operation === "update") {
      if (fromTo) {
        fields.currentAmount = Number(fromTo[1].replace(/,/g, ""));
        fields.amount = Number(fromTo[2].replace(/,/g, ""));
      } else if (amounts.length === 1) fields.amount = amounts[0];
    }
    if (!entityId && fields.currentAmount === undefined) return null;
    if (!entityId && fields.currentAmount !== undefined) entityId = String(fields.currentAmount);
  }
  if (operation === "create" && !Object.keys(fields).length) return null;
  if (operation === "update" && !Object.keys(fields).some((key) => key !== "currentAmount")) return null;
  return {
    operation,
    entityType,
    ...(entityId ? { entityId } : {}),
    userProvidedFields: fields,
  };
}

function candidateCards(entityType: MutableEntityType, ids: string[]): ChatCard[] {
  const kind =
    entityType === "transaction"
      ? "transaction"
      : entityType === "account"
        ? "account"
        : entityType === "budget"
          ? "budget"
          : entityType === "recurring"
            ? "recurring"
            : entityType === "goal"
              ? "goal"
              : entityType === "loan"
                ? "loan"
                : entityType === "asset"
                  ? "asset"
                  : entityType === "category"
                    ? "category"
                    : null;
  return kind ? ids.slice(0, 6).map((id) => ({ kind, id }) as ChatCard) : [];
}

async function mutationTurn(input: ChatTurnInput, route: IntentResolution): Promise<ChatTurnResult> {
  const { model, t } = input;
  input.onPhase?.("thinking");
  model.resetConversation(JSON.stringify(input.history), chatSystemPrompt(input.prompt, ["mutation"]));
  let first = "";
  try {
    first = await plan(input, route);
  } catch {
    first = "";
  }
  const requested = (parseToolCalls(first) ?? []).find((call) => call.name === "prepare_change" && call.change);
  let change = requested?.change ?? null;
  if (!change) {
    const question = clarificationFrom(first);
    change = extractChangeRequest(input.question, route.mutationIntent!, route.mutationEntity ?? "transaction");
    if (!change)
      return {
        kind: "clarification",
        text: question ?? t("localAI.proposal.needDetails"),
        cards: [],
        route,
      };
  }
  // The words decide the operation: a model cannot turn "show" into "delete".
  if (route.mutationIntent && change.operation !== route.mutationIntent && !(route.mutationIntent === "update" && change.operation === "archive"))
    change = { ...change, operation: route.mutationIntent };
  input.onPhase?.("reading");
  const result = input.proposals.prepare(input.document, change);
  if (result.ok)
    return {
      kind: "proposal",
      text: t("localAI.proposal.intro", {
        action: t(`localAI.proposal.operations.${result.proposal.operation}`),
        entity: t(`localAI.proposal.entities.${result.proposal.entityType}`),
      }),
      proposalId: result.proposal.proposalId,
      cards: [{ kind: "change_proposal", proposalId: result.proposal.proposalId }],
      route,
    };
  if (result.code === "AMBIGUOUS_ENTITY" && result.candidates?.length)
    return {
      kind: "clarification",
      text: `${t("localAI.proposal.ambiguous")}\n\n${result.candidates.map((item, index) => `${index + 1}. ${item.name}`).join("\n")}`,
      cards: candidateCards(change.entityType, result.candidates.map((item) => item.id)),
      route,
    };
  return {
    kind: "clarification",
    text: t("localAI.proposal.failed", { reason: result.message }),
    cards: [],
    route,
  };
}

const MENTION_TOKEN = /@([ATBRGLSCP]\d{1,3})\b/g;

/** Removes @references the model invented; only real records may be shown. */
export function cleanMentions(text: string, mentions: Record<string, ChatCard>) {
  return text
    .replace(MENTION_TOKEN, (token, ref: string) => (mentions[ref] ? token : ""))
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function words(text: string) {
  return new Set(
    text
      .toLowerCase()
      .replace(/[^\p{L}\p{N}\s]/gu, " ")
      .split(/\s+/)
      .filter((word) => word.length > 2),
  );
}

/**
 * Small models often open by restating the question ("You asked how much…").
 * A first line that is mostly the question's own words is dropped.
 */
export function stripQuestionEcho(answer: string, question: string) {
  const trimmed = answer.trimStart();
  const firstBreak = trimmed.search(/\n/);
  const first = firstBreak === -1 ? trimmed : trimmed.slice(0, firstBreak);
  if (firstBreak === -1 || /\d/.test(first.replace(/#/g, ""))) return trimmed;
  const asked = words(question);
  const said = words(first.replace(/^#+\s*/, "").replace(/^(you asked|question|q)\s*[:：-]?\s*/i, ""));
  if (!asked.size || !said.size) return trimmed;
  let shared = 0;
  for (const word of said) if (asked.has(word)) shared++;
  const echo = /^(you asked|question\s*:|q\s*:)/i.test(first) || (shared / said.size >= 0.7 && shared >= 2);
  return echo ? trimmed.slice(firstBreak + 1).trimStart() : trimmed;
}

/**
 * One chat turn: route the question, plan tools (or use the mandatory
 * bundle), run trusted tools, and let the model explain only the evidence.
 * Mutation requests end in a reviewable proposal, never a write.
 */
export async function runChatTurn(input: ChatTurnInput): Promise<ChatTurnResult> {
  const { model } = input;
  const route = resolveIntent(input.question);
  input.onPhase?.("thinking");
  if (input.forcedCalls?.length) return answerWithTools(input, route, input.forcedCalls);
  if (route.intent === "mutation") return mutationTurn(input, route);

  if (!route.needsUserData) {
    model.resetConversation(JSON.stringify(input.history), chatSystemPrompt(input.prompt));
    let streamed = "";
    const answer = await model.execute([{ type: "text", text: input.question }], (token) => {
      streamed += token;
      if (isToolRequestPrefix(streamed)) return;
      input.onPhase?.("answering");
      input.onToken?.(streamed);
    });
    const requested = parseToolCalls(answer);
    // A general question that still asked for data is answered with data.
    if (!requested?.length)
      return { kind: "answer", text: stripToolJson(answer) || input.t("localAI.emptyAnswer"), cards: [], route };
    return answerWithTools(input, route, withPeriod(requested, route.requestedPeriod));
  }

  // Broad advice never depends on the model picking the right tool.
  const bundle = route.mandatoryCalls.some((call) => call.name === "financial_advice_context");
  let calls: ChatToolCall[] = [];
  if (!bundle) {
    model.resetConversation(JSON.stringify(input.history), chatSystemPrompt(input.prompt, route.packs));
    let first = "";
    try {
      first = await plan(input, route);
    } catch {
      first = "";
    }
    const requested = parseToolCalls(first);
    if (requested === null && !looksLikeMissingData(first)) {
      const question = clarificationFrom(first);
      if (question && route.needsClarification) return { kind: "clarification", text: question, cards: [], route };
    }
    calls = withPeriod(
      (requested ?? []).filter((call) => call.name !== "prepare_change"),
      route.requestedPeriod,
    );
  }
  calls = merge(route.mandatoryCalls, calls);
  if (!calls.length) calls = inferToolCalls(input.question);
  if (!calls.length) calls = [SNAPSHOT_TOOL_CALL];
  return answerWithTools(input, route, calls);
}

/**
 * Feeds the real outcome of a proposal back to the model so it explains what
 * actually happened. Falls back to fixed copy if generation fails.
 */
export async function explainMutationResult(options: {
  model: ChatModel | null;
  history: HistoryTurn[];
  prompt: PromptContext;
  result: MutationResult;
  question: string;
  t: Translate;
}): Promise<string> {
  const { result, t } = options;
  const fallback = t(`localAI.proposal.results.${result.status}`, {
    name: result.entityName ?? "",
  });
  if (!options.model) return fallback;
  try {
    options.model.resetConversation(JSON.stringify(options.history), chatSystemPrompt(options.prompt));
    const text = await options.model.execute(
      [{ type: "text", text: mutationResultPrompt(result, options.question) }],
      undefined,
      { maxOutputTokens: 160 },
    );
    const clean = stripToolJson(text).trim();
    // A completed change must be described as completed, never guessed.
    return clean || fallback;
  } catch {
    return fallback;
  }
}

/** History entry recorded for every proposal outcome. */
export function mutationHistoryEntry(result: MutationResult): HistoryTurn {
  return {
    role: "model",
    content: `MUTATION_RESULT ${JSON.stringify({
      status: result.status,
      operation: result.operation,
      entityType: result.entityType,
      entityName: result.entityName,
      final: result.final ?? undefined,
    })}`.slice(0, 600),
  };
}

