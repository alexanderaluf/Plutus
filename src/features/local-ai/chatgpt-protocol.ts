export const CHATGPT_SCOPE = "openid profile email offline_access resource.invoke chatgpt.tokens.use.direct";
export const CHATGPT_RESOURCE = "https://api.openai.com/v1";
export const CHATGPT_USAGE_URL = "https://chatgpt.com/settings/usage";
export const CHATGPT_CONNECTIONS_URL = "https://chatgpt.com/settings/security";
/** Deep link the sign-in page opens to hand control back; navigation ignores it. */
export const CHATGPT_RETURN_PATH = "chatgpt-callback";

export type ChatGPTModel = { slug: string; display_name: string };

export class ChatGPTError extends Error {
  constructor(public code: string, public status = 0, public requestId: string | null = null) {
    super(code);
    this.name = "ChatGPTError";
  }
}

export function hasPlanPermission(scope: string) {
  const granted = new Set(scope.split(/\s+/));
  return granted.has("chatgpt.tokens.use.direct") && granted.has("resource.invoke");
}

export function authorizationUrl(input: {
  host: string; clientId?: string; redirectUri: string; state: string; nonce: string; challenge: string;
  idTokenHint?: string; loginHint?: string;
}) {
  const url = new URL("https://auth.openai.com/api/accounts/authorize");
  // Reauthorization reuses the issued client and identifies the account with the documented hints.
  const params = {
    client_id: input.clientId ?? "dynamic_agent_client",
    ...(!input.clientId ? { agent_name_hint: "Plutus" } : {
      ...(input.idTokenHint ? { id_token_hint: input.idTokenHint } : {}),
      ...(input.loginHint ? { login_hint: input.loginHint } : {}),
    }),
    ext_agent_host_id: input.host, response_type: "code", redirect_uri: input.redirectUri,
    scope: CHATGPT_SCOPE, resource: CHATGPT_RESOURCE, state: input.state,
    nonce: input.nonce, code_challenge_method: "S256", code_challenge: input.challenge,
  };
  for (const [key, value] of Object.entries(params)) url.searchParams.set(key, value);
  return url.toString();
}

export function parseAuthorizationCallback(callback: string, redirectUri: string, state: string, savedClientId?: string) {
  const url = new URL(callback);
  const redirect = new URL(redirectUri);
  if (url.origin !== redirect.origin || url.pathname !== redirect.pathname ||
      url.searchParams.getAll("state").length !== 1 || url.searchParams.get("state") !== state)
    throw new ChatGPTError("identity");
  if (url.searchParams.has("error")) {
    const error = url.searchParams.get("error") ?? "";
    throw new ChatGPTError(error === "access_denied" ? "declined" : `signin:${error.replace(/[^\w.-]/g, "").slice(0, 60)}`);
  }
  const code = url.searchParams.get("code");
  const returnedClientId = url.searchParams.get("client_id");
  const clientId = returnedClientId ?? savedClientId;
  if (!code || !clientId || clientId === "dynamic_agent_client" ||
      (savedClientId && returnedClientId && returnedClientId !== savedClientId)) throw new ChatGPTError("identity");
  return { code, clientId };
}

export function parseModelCatalog(value: unknown): ChatGPTModel[] {
  if (!value || typeof value !== "object" || !Array.isArray((value as { models?: unknown }).models))
    throw new ChatGPTError("models");
  return (value as { models: unknown[] }).models.flatMap((item) => {
    if (!item || typeof item !== "object") return [];
    const model = item as Record<string, unknown>;
    return model.visibility === "list" && typeof model.slug === "string" && model.slug && typeof model.display_name === "string"
      ? [{ slug: model.slug, display_name: model.display_name }] : [];
  });
}

export function responseBody(model: string, instructions: string, history: { role: string; content: string }[], text: string) {
  return {
    model, instructions, store: false, stream: true,
    input: [...history.map((turn) => ({ role: turn.role === "model" ? "assistant" : "user", content: turn.content })),
      { role: "user", content: text }],
  };
}

/** Incremental SSE decoding, including CRLF and chunks split inside JSON/UTF-8. */
export class ChatGPTStream {
  private buffer = "";
  text = "";
  completed = false;
  constructor(private onText?: (delta: string) => void) {}
  push(chunk: string) {
    this.buffer += chunk;
    let boundary: RegExpExecArray | null;
    while ((boundary = /\r?\n\r?\n/.exec(this.buffer))) {
      const block = this.buffer.slice(0, boundary.index);
      this.buffer = this.buffer.slice(boundary.index + boundary[0].length);
      const data = block.split(/\r?\n/).filter((line) => line.startsWith("data:"))
        .map((line) => line.slice(5).trimStart()).join("\n");
      if (!data || data === "[DONE]") continue;
      const event = JSON.parse(data) as { type?: string; delta?: string; code?: string; response?: { error?: { code?: string } } };
      if (event.type === "response.output_text.delta" && typeof event.delta === "string") {
        this.text += event.delta;
        this.onText?.(event.delta);
      } else if (event.type === "response.completed") this.completed = true;
      else if (event.type === "response.failed" || event.type === "response.incomplete" || event.type === "error")
        throw new ChatGPTError(event.response?.error?.code ?? event.code ?? "inference");
    }
  }
  finish() {
    if (this.buffer.trim()) this.push("\n\n");
    if (!this.completed || !this.text.trim()) throw new ChatGPTError("incomplete");
    return this.text;
  }
}
