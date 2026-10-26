import type { BackupDocument } from "./backup-document";
import { isJsonObject, type JsonObject, type JsonValue } from "./json";

/**
 * Saved ChatGPT conversations (`aiChats`, schema 23). On-device model chats are
 * never persisted. A record belongs to one profile through `user`, so deleting
 * the profile deletes its chats. Unknown fields are preserved on every update.
 */
export type AIChatCard = { kind: string; id: string };

export type AIChatMessage = {
  role: "user" | "assistant";
  text: string;
  /** What the model sees for this turn when it differs from `text`. */
  history?: string;
  cards?: AIChatCard[];
  /** @reference → record for cards placed inline in an answer. */
  mentions?: Record<string, AIChatCard>;
};

export type AIChat = {
  id: string;
  title: string;
  pinned: boolean;
  /** The ChatGPT model used for the latest message. */
  model: string | null;
  messages: AIChatMessage[];
  createdAt: string;
  updatedAt: string;
  lastMessageAt: string;
};

export const AI_CHAT_TITLE_LENGTH = 60;

const CARD_KINDS = new Set([
  "transaction", "account", "budget", "recurring", "goal", "loan", "asset", "category", "financial_priority",
]);

/** The first words of the opening question, as a default title. */
export function aiChatTitle(text: string) {
  const title = text.replace(/\s+/g, " ").trim();
  return title.length > AI_CHAT_TITLE_LENGTH ? `${title.slice(0, AI_CHAT_TITLE_LENGTH - 1).trimEnd()}…` : title;
}

function readCard(value: JsonValue | undefined): AIChatCard | null {
  return isJsonObject(value) && typeof value.kind === "string" && CARD_KINDS.has(value.kind) &&
    typeof value.id === "string" && value.id ? { kind: value.kind, id: value.id } : null;
}

function readMessage(value: JsonValue): AIChatMessage | null {
  if (!isJsonObject(value) || (value.role !== "user" && value.role !== "assistant") || typeof value.text !== "string")
    return null;
  const cards = Array.isArray(value.cards) ? value.cards.map(readCard).filter((card) => card !== null) : [];
  const mentions = isJsonObject(value.mentions)
    ? Object.fromEntries(Object.entries(value.mentions).flatMap(([ref, card]) => {
        const read = readCard(card);
        return read && /^[A-Z]\d{1,3}$/.test(ref) ? [[ref, read]] : [];
      }))
    : undefined;
  return {
    role: value.role,
    text: value.text,
    ...(typeof value.history === "string" ? { history: value.history } : {}),
    ...(cards.length ? { cards } : {}),
    ...(mentions ? { mentions } : {}),
  };
}

/** Imported backups are untrusted: unreadable chats are skipped, never repaired in place. */
export function readAIChat(record: JsonObject): AIChat | null {
  if (typeof record.uuid !== "string" || !record.uuid || !Array.isArray(record.messages)) return null;
  const messages = record.messages.map(readMessage).filter((message) => message !== null);
  const createdAt = typeof record.createdAt === "string" ? record.createdAt : "";
  const updatedAt = typeof record.updatedAt === "string" ? record.updatedAt : createdAt;
  const firstQuestion = messages.find((message) => message.role === "user")?.text ?? "";
  return {
    id: record.uuid,
    title: typeof record.title === "string" && record.title.trim() ? record.title : aiChatTitle(firstQuestion),
    pinned: record.pinned === true,
    model: typeof record.model === "string" ? record.model : null,
    messages,
    createdAt,
    updatedAt,
    lastMessageAt: typeof record.lastMessageAt === "string" ? record.lastMessageAt : updatedAt,
  };
}

function storedMessage(message: AIChatMessage): JsonObject {
  return {
    role: message.role,
    text: message.text,
    ...(message.history !== undefined ? { history: message.history } : {}),
    ...(message.cards?.length ? { cards: message.cards } : {}),
    ...(message.mentions ? { mentions: message.mentions } : {}),
  };
}

function updateChat(document: BackupDocument, id: string, change: (record: JsonObject) => JsonObject) {
  return { ...document, aiChats: document.aiChats.map((record) => record.uuid === id ? change(record) : record) };
}

/** Creates the chat on its first message and replaces its transcript afterwards. */
export function saveAIChatMessages(
  document: BackupDocument,
  input: { id: string; user: string; model: string | null; messages: AIChatMessage[]; now: string },
): BackupDocument {
  const messages = input.messages.map(storedMessage);
  if (document.aiChats.some((record) => record.uuid === input.id))
    return updateChat(document, input.id, (record) => ({
      ...record, model: input.model, messages, updatedAt: input.now, lastMessageAt: input.now,
    }));
  const firstQuestion = input.messages.find((message) => message.role === "user")?.text ?? "";
  return {
    ...document,
    aiChats: [...document.aiChats, {
      uuid: input.id, user: input.user, provider: "chatgpt", title: aiChatTitle(firstQuestion), pinned: false,
      model: input.model, messages, createdAt: input.now, updatedAt: input.now, lastMessageAt: input.now,
    }],
  };
}

export function renameAIChat(document: BackupDocument, id: string, title: string, now: string) {
  const name = title.replace(/\s+/g, " ").trim().slice(0, 120);
  return name ? updateChat(document, id, (record) => ({ ...record, title: name, updatedAt: now })) : document;
}

export function setAIChatPinned(document: BackupDocument, id: string, pinned: boolean, now: string) {
  return updateChat(document, id, (record) => ({ ...record, pinned, updatedAt: now }));
}
