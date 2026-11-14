import { uuid } from "expo";
import { fetch } from "expo/fetch";
import { Linking } from "react-native";
import nativeAI from "../../../modules/plutus-local-ai/src/PlutusLocalAIModule";
import type { ChatModel, HistoryTurn } from "./chat-controller";
import {
  authorizationUrl, CHATGPT_RESOURCE, ChatGPTError, ChatGPTStream, hasPlanPermission,
  parseAuthorizationCallback, parseModelCatalog, responseBody, type ChatGPTModel,
} from "./chatgpt-protocol";

type Registration = {
  clientId: string; subject?: string; email?: string;
  accessToken?: string; refreshToken?: string; idToken?: string; expiresAt?: number; scope?: string;
};
type Vault = {
  version: 1; host: string; registrations: Registration[]; activeClientId: string | null;
  model: string | null; welcomed: boolean;
};
export type ChatGPTSnapshot = {
  hydrated: boolean; connected: boolean; planEnabled: boolean; connecting: boolean; disconnecting: boolean; loadingModels: boolean;
  email: string; selectedModel: string | null; models: ChatGPTModel[]; error: string;
  accounts: { clientId: string; label: string }[]; activeClientId: string | null;
};
let snapshot: ChatGPTSnapshot = {
  hydrated: false, connected: false, planEnabled: false, connecting: false, disconnecting: false, loadingModels: false,
  email: "", selectedModel: null, models: [], error: "", accounts: [], activeClientId: null,
};
// Only a cache of the protected native credential vault. Financial records stay in SQLite.
let vault: Vault;
let initialization: Promise<void> | undefined;
let refresh: Promise<string> | null = null;
let catalog: Promise<void> | null = null;
let writeQueue: Promise<void> = Promise.resolve();
let generation = 0;
const listeners = new Set<() => void>();
const requests = new Set<AbortController>();
export const getChatGPTSnapshot = () => snapshot;
export function subscribeChatGPT(listener: () => void) { listeners.add(listener); return () => { listeners.delete(listener); }; }
function active() { return vault?.registrations.find((item) => item.clientId === vault.activeClientId); }
function publish(extra: Partial<ChatGPTSnapshot> = {}) {
  const account = active();
  snapshot = {
    ...snapshot, connected: !!account?.accessToken, planEnabled: !!account?.accessToken && hasPlanPermission(account.scope ?? ""),
    email: account?.email ?? "", selectedModel: vault?.model ?? null, activeClientId: vault?.activeClientId ?? null,
    accounts: vault?.registrations.map((item, index) => ({ clientId: item.clientId, label: `${item.email || "ChatGPT"} · ${index + 1}` })) ?? [],
    ...extra,
  };
  for (const listener of listeners) listener();
}
function native() { if (!nativeAI) throw new ChatGPTError("runtime"); return nativeAI; }
function save(update: Vault | ((current: Vault) => Vault)) {
  const action = writeQueue.then(async () => {
    const next = typeof update === "function" ? update(vault) : update;
    try { await native().writeChatGPTVaultAsync(JSON.stringify(next)); }
    catch { throw new ChatGPTError("storage"); }
    vault = next;
    publish();
  });
  writeQueue = action.catch(() => undefined);
  return action;
}
export function initializeChatGPT() {
  if (initialization) return initialization;
  initialization = (async () => {
    try {
      const stored = await native().readChatGPTVaultAsync();
      if (stored) {
        const parsed = JSON.parse(stored) as Vault;
        if (parsed.version !== 1 || !parsed.host || !Array.isArray(parsed.registrations)) throw new ChatGPTError("storage");
        vault = parsed;
      } else await save({ version: 1, host: `urn:uuid:${uuid.v4()}`, registrations: [], activeClientId: null, model: null, welcomed: false });
      publish({ hydrated: true, error: "" });
    } catch { publish({ hydrated: true, error: "storage" }); }
  })();
  return initialization;
}
export function chatGPTErrorCode(error: unknown) { return error instanceof ChatGPTError ? error.code : "unexpected"; }

/** Diagnostics only: error codes, statuses and request IDs, never tokens or account data. */
function logFailure(step: string, error: unknown) {
  const detail = error instanceof ChatGPTError
    ? [error.code, error.status && `status=${error.status}`, error.requestId && `request=${error.requestId}`].filter(Boolean).join(" ")
    : `unexpected ${error instanceof Error ? `${error.name}: ${error.message}` : String(error)}`.replace(/\?\S*/g, "?…").slice(0, 300);
  console.warn(`[ChatGPT] ${step} failed: ${detail}`);
}

/** OAuth errors are strings, Responses errors carry `error.code`, admission errors only `detail`. */
async function failure(response: Response) {
  const body = await response.json().catch(() => null) as { error?: { code?: string | null } | string } | null;
  const code = typeof body?.error === "string" ? body.error : body?.error?.code;
  return new ChatGPTError(code || (response.status === 401 ? "unauthorized" : `http_${response.status}`), response.status, response.headers.get("x-request-id"));
}

async function request(url: string, init: RequestInit = {}) {
  const controller = new AbortController();
  requests.add(controller);
  const timer = setTimeout(() => controller.abort(), 60_000);
  try {
    const response = await fetch(url, { ...init, signal: controller.signal });
    if (!response.ok) throw await failure(response);
    return response;
  } catch (error) {
    if (error instanceof ChatGPTError) throw error;
    throw new ChatGPTError("network");
  } finally { clearTimeout(timer); requests.delete(controller); }
}
async function tokenRequest(values: Record<string, string>) {
  const response = await request("https://auth.openai.com/api/accounts/oauth/token", {
    method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ ...values, resource: CHATGPT_RESOURCE }).toString(),
  });
  return await response.json() as { access_token?: string; refresh_token?: string; id_token?: string; expires_in?: number; scope?: string; token_type?: string };
}
function tokenFields(tokens: Awaited<ReturnType<typeof tokenRequest>>, previous?: Registration) {
  if (!tokens.access_token || (tokens.token_type ?? "Bearer").toLowerCase() !== "bearer" || !Number.isFinite(tokens.expires_in) || tokens.expires_in! <= 0)
    throw new ChatGPTError("identity");
  return { accessToken: tokens.access_token, refreshToken: tokens.refresh_token ?? previous?.refreshToken,
    idToken: tokens.id_token ?? previous?.idToken, expiresAt: Date.now() + tokens.expires_in! * 1000, scope: tokens.scope ?? previous?.scope ?? "" };
}

/** The browser page after sign-in; it opens `url`, the app's own deep link. */
export type ChatGPTReturnPage = { url: string; title: string; message: string; action: string };

export async function connectChatGPT(clientId?: string, page?: ChatGPTReturnPage) {
  await initializeChatGPT();
  if (!vault) throw new ChatGPTError("storage");
  if (snapshot.connecting || snapshot.disconnecting) return false;
  const run = ++generation;
  publish({ connecting: true, error: "" });
  const previous = vault.registrations.find((item) => item.clientId === clientId);
  let step = "prepare";
  try {
    const api = native();
    const [state, nonce, verifier] = await Promise.all([api.chatGPTRandomAsync(), api.chatGPTRandomAsync(), api.chatGPTRandomAsync()]);
    const challenge = await api.chatGPTDigestAsync(verifier);
    if (run !== generation) throw new ChatGPTError("cancelled");
    const redirectUri = await api.startChatGPTCallbackAsync(state, page?.url ?? "", page?.title ?? "", page?.message ?? "", page?.action ?? "");
    // Install the waiter before opening the system browser, including fast returning sign-ins.
    const callback = api.waitChatGPTCallbackAsync().catch(() => {
      throw new ChatGPTError(run === generation ? "timeout" : "cancelled");
    });
    const url = authorizationUrl({ host: vault.host, clientId, state, nonce, challenge, redirectUri,
      idTokenHint: previous?.idToken, loginHint: previous?.email });
    step = "browser";
    const [returned] = await Promise.all([callback, Linking.openURL(url).catch(async () => {
      await api.cancelChatGPTCallbackAsync(); throw new ChatGPTError("signin:browser");
    })]);
    if (run !== generation) throw new ChatGPTError("cancelled");
    step = "callback";
    const grant = parseAuthorizationCallback(returned, redirectUri, state, clientId);
    // Keep issued registration even if the single-use code exchange fails.
    if (!vault.registrations.some((item) => item.clientId === grant.clientId))
      await save((current) => ({ ...current, registrations: [...current.registrations, { clientId: grant.clientId }] }));
    step = "token";
    const tokens = await tokenRequest({ grant_type: "authorization_code", client_id: grant.clientId,
      code: grant.code, code_verifier: verifier, redirect_uri: redirectUri });
    if (!tokens.id_token) throw new ChatGPTError("identity");
    step = "identity";
    const jwks = await (await request("https://auth.openai.com/.well-known/jwks.json")).text();
    const identity = await api.verifyChatGPTIdentityAsync(tokens.id_token, jwks, grant.clientId, nonce)
      .catch(() => { throw new ChatGPTError("identity"); });
    if (previous?.subject && previous.subject !== identity.subject) throw new ChatGPTError("identity");
    if (run !== generation) throw new ChatGPTError("cancelled");
    step = "save";
    const connection: Registration = { clientId: grant.clientId, ...identity, ...tokenFields(tokens) };
    const welcome = !vault.welcomed && hasPlanPermission(connection.scope ?? "");
    await save((current) => ({ ...current, activeClientId: grant.clientId, model: null, welcomed: current.welcomed || welcome,
      registrations: current.registrations.map((item) => item.clientId === grant.clientId ? connection : item) }));
    publish({ models: [] });
    if (hasPlanPermission(connection.scope ?? "")) {
      await loadChatGPTModels();
      if (snapshot.models[0] && run === generation) await save((current) => ({ ...current, model: snapshot.models[0].slug }));
    }
    return welcome;
  } catch (error) {
    logFailure(`sign-in (${step})`, error);
    if (run === generation) publish({ error: chatGPTErrorCode(error) });
    throw error;
  } finally {
    await native().cancelChatGPTCallbackAsync();
    publish({ connecting: false });
  }
}
export async function cancelChatGPTSignIn() {
  generation++;
  await native().cancelChatGPTCallbackAsync();
}

const TERMINAL = new Set(["invalid_grant", "invalid_refresh_token", "token_expired", "refresh_token_expired", "refresh_token_invalidated", "refresh_token_reused"]);
async function accessToken() {
  if (snapshot.disconnecting) throw new ChatGPTError("cancelled");
  const account = active();
  if (!account?.accessToken || !hasPlanPermission(account.scope ?? "")) throw new ChatGPTError("permission");
  if ((account.expiresAt ?? 0) > Date.now() + 60_000) return account.accessToken;
  if (refresh) return refresh;
  const run = generation;
  refresh = (async () => {
    if (!account.refreshToken) throw new ChatGPTError("unauthorized");
    try {
      const tokens = await tokenRequest({ grant_type: "refresh_token", client_id: account.clientId, refresh_token: account.refreshToken });
      if (run !== generation) throw new ChatGPTError("cancelled");
      const next = { ...account, ...tokenFields(tokens, account) };
      await save((current) => ({ ...current, registrations: current.registrations.map((item) => item.clientId === next.clientId ? next : item) }));
      if (!hasPlanPermission(next.scope ?? "")) throw new ChatGPTError("permission");
      return next.accessToken;
    } catch (error) {
      if (run === generation && error instanceof ChatGPTError && TERMINAL.has(error.code)) {
        await save((current) => ({ ...current, model: null, registrations: current.registrations.map((item) => item.clientId === account.clientId
          ? { clientId: item.clientId, subject: item.subject, email: item.email } : item) }));
      }
      throw error;
    }
  })().finally(() => { refresh = null; });
  return refresh;
}

export function loadChatGPTModels(): Promise<void> {
  if (catalog) return catalog;
  const run = generation;
  publish({ loadingModels: true, error: "" });
  catalog = (async () => {
    try {
      const token = await accessToken();
      const models = parseModelCatalog(await (await request(`${CHATGPT_RESOURCE}/models`, { headers: { Authorization: `Bearer ${token}` } })).json());
      if (run !== generation) return;
      publish({ models, error: models.length ? "" : "models" });
      if (vault.model && !models.some((item) => item.slug === vault.model)) await save((current) => ({ ...current, model: null }));
    } catch (error) {
      logFailure("models", error);
      if (run === generation) publish({ error: chatGPTErrorCode(error) });
    } finally { publish({ loadingModels: false }); catalog = null; }
  })();
  return catalog;
}
export async function selectChatGPTModel(model: string | null) {
  if (!model && !vault && !snapshot.selectedModel) return;
  if (!vault || snapshot.connecting || snapshot.disconnecting) throw new ChatGPTError("storage");
  if (model && (!snapshot.planEnabled || !snapshot.models.some((item) => item.slug === model))) throw new ChatGPTError("models");
  await save((current) => ({ ...current, model }));
}

export async function disconnectChatGPT(): Promise<boolean> {
  if (snapshot.connecting || snapshot.disconnecting) throw new ChatGPTError("signin");
  publish({ disconnecting: true });
  // Settle an in-flight rotating refresh before revoking its newest token.
  await refresh?.catch(() => undefined);
  generation++;
  for (const controller of requests) controller.abort();
  const account = active();
  let revoked = !account?.refreshToken;
  if (account?.refreshToken) {
    try {
      await request("https://auth.openai.com/api/accounts/oauth/revoke", { method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams({ token: account.refreshToken, token_type_hint: "refresh_token", client_id: account.clientId }).toString() });
      revoked = true;
    } catch { revoked = false; }
  }
  try {
    await save((current) => ({ ...current, activeClientId: null, model: null, registrations: current.registrations.map((item) => item.clientId === account?.clientId
      ? { clientId: item.clientId, subject: item.subject, email: item.email } : item) }));
    publish({ models: [], error: "" });
    return revoked;
  } finally { publish({ disconnecting: false }); }
}

/** The same local tools and explicit mutation review are used for both providers. */
export function createChatGPTModel(model: string, clientId?: string | null): ChatModel & { cancel(): void } {
  let instructions = "";
  let history: HistoryTurn[] = [];
  let controller: AbortController | null = null;
  return {
    isRequestError: () => true,
    resetConversation(historyJson = "[]", systemPrompt = "") {
      instructions = systemPrompt.replace("the private on-device financial assistant", "the financial assistant");
      history = JSON.parse(historyJson) as HistoryTurn[];
    },
    cancel() { controller?.abort(); },
    async execute(parts, onToken) {
      if (clientId && vault.activeClientId !== clientId) throw new ChatGPTError("cancelled");
      if (parts.some((part) => part.type !== "text")) throw new ChatGPTError("unsupported");
      const run = generation;
      const token = await accessToken();
      controller = new AbortController();
      const current = controller;
      requests.add(current);
      const timeout = setTimeout(() => current.abort(), 120_000);
      const text = parts.map((part) => part.text ?? "").join("\n");
      try {
        const response = await fetch(`${CHATGPT_RESOURCE}/responses`, { method: "POST", signal: current.signal,
          headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json", Accept: "text/event-stream" },
          body: JSON.stringify(responseBody(model, instructions, history, text)) });
        if (!response.ok) throw await failure(response);
        const reader = response.body?.getReader();
        if (!reader) throw new ChatGPTError("incomplete");
        const parser = new ChatGPTStream((delta) => onToken?.(delta, false));
        const decoder = new TextDecoder();
        try {
          while (true) {
            const chunk = await reader.read();
            if (run !== generation || current.signal.aborted) throw new ChatGPTError("cancelled");
            if (chunk.done) break;
            parser.push(decoder.decode(chunk.value, { stream: true }));
          }
          parser.push(decoder.decode());
          const output = parser.finish();
          history.push({ role: "user", content: text }, { role: "model", content: output });
          onToken?.("", true);
          return output;
        } finally { await reader.cancel().catch(() => undefined); }
      } catch (error) {
        logFailure("response", error);
        publish({ error: chatGPTErrorCode(error) });
        throw error;
      } finally { clearTimeout(timeout); requests.delete(current); controller = null; }
    },
  };
}
