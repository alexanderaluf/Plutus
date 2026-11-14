const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const Module = require("node:module");
const { test } = require("node:test");
const ts = require("typescript");
const crypto = require("node:crypto");

function load(file, stubs = {}) {
  const filename = path.resolve(__dirname, "../src/features/local-ai", file);
  const mod = new Module(filename, module);
  mod.filename = filename;
  mod.paths = module.paths;
  mod.require = (name) => name in stubs ? stubs[name] : require(name);
  mod._compile(ts.transpileModule(fs.readFileSync(filename, "utf8"), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText, filename);
  return mod.exports;
}
const protocol = load("chatgpt-protocol.ts");
const { ChatGPTStream, parseAuthorizationCallback, authorizationUrl, hasPlanPermission, parseModelCatalog, responseBody } = protocol;
const scope = "openid profile email offline_access resource.invoke chatgpt.tokens.use.direct";

test("OAuth requests plan permission with a stable host and reuses issued registrations", () => {
  const input = { host: "urn:uuid:host", redirectUri: "http://127.0.0.1:1234/auth/callback", state: "state", nonce: "nonce", challenge: "challenge" };
  const fresh = new URL(authorizationUrl(input));
  assert.equal(fresh.origin, "https://auth.openai.com");
  assert.equal(fresh.searchParams.get("client_id"), "dynamic_agent_client");
  assert.equal(fresh.searchParams.get("agent_name_hint"), "Plutus");
  assert.equal(fresh.searchParams.get("scope"), scope);
  assert.equal(fresh.searchParams.get("code_challenge_method"), "S256");
  const returning = new URL(authorizationUrl({ ...input, clientId: "issued" }));
  assert.equal(returning.searchParams.get("client_id"), "issued");
  assert.equal(returning.searchParams.get("ext_agent_host_id"), input.host);
  assert.equal(returning.searchParams.has("agent_name_hint"), false);
  assert.equal(returning.searchParams.has("prompt"), false);
  const hinted = new URL(authorizationUrl({ ...input, clientId: "issued", idTokenHint: "old-id", loginHint: "person@example.test" }));
  assert.equal(hinted.searchParams.get("id_token_hint"), "old-id");
  assert.equal(hinted.searchParams.get("login_hint"), "person@example.test");
  assert.equal(fresh.searchParams.has("id_token_hint"), false);
});

test("OAuth rejects wrong origin, path, state, duplicate state, missing issued ID and client substitution", () => {
  const callback = "http://127.0.0.1:1234/auth/callback";
  for (const url of [
    `${callback}?code=x&state=wrong&client_id=issued`,
    `${callback}?code=x&state=s&state=s&client_id=issued`,
    `${callback}?code=x&state=s`, `${callback}?code=x&state=s&client_id=dynamic_agent_client`,
    "http://localhost:1234/auth/callback?code=x&state=s&client_id=issued",
    "http://127.0.0.1:1234/other?code=x&state=s&client_id=issued",
  ]) assert.throws(() => parseAuthorizationCallback(url, callback, "s"));
  assert.throws(() => parseAuthorizationCallback(`${callback}?code=x&state=s&client_id=other`, callback, "s", "issued"));
  assert.throws(() => parseAuthorizationCallback(`${callback}?error=access_denied&state=s`, callback, "s"), /declined/);
  assert.throws(() => parseAuthorizationCallback(`${callback}?error=invalid_request&state=s`, callback, "s"), /signin:invalid_request/);
  assert.deepEqual(parseAuthorizationCallback(`${callback}?code=x&state=s`, callback, "s", "issued"), { code: "x", clientId: "issued" });
});

test("identity-only sign-in cannot authorize inference and account catalog order is retained", () => {
  assert.equal(hasPlanPermission("openid email"), false);
  assert.equal(hasPlanPermission("resource.invoke chatgpt.tokens.use.direct.fake"), false);
  assert.equal(hasPlanPermission(scope), true);
  assert.deepEqual(parseModelCatalog({ models: [
    { slug: "b", display_name: "B", visibility: "list" }, { slug: "hidden", display_name: "Hidden", visibility: "hide" },
    null, { slug: "a", display_name: "A", visibility: "list" },
  ] }), [{ slug: "b", display_name: "B" }, { slug: "a", display_name: "A" }]);
});

test("Responses requests disable storage and omit unsupported fields", () => {
  assert.deepEqual(responseBody("selected", "instructions", [{ role: "model", content: "old" }], "hello"), {
    model: "selected", instructions: "instructions", store: false, stream: true,
    input: [{ role: "assistant", content: "old" }, { role: "user", content: "hello" }],
  });
});

test("SSE handles every chunk split, CRLF, Unicode and requires completed nonempty output", () => {
  const wire = ': comment\r\n\r\ndata: {"type":"response.output_text.delta","delta":"שלום"}\r\n\r\ndata: {"type":"response.output_text.delta","delta":" world"}\n\ndata: {"type":"response.completed"}\n\ndata: [DONE]\n\n';
  for (let index = 0; index < wire.length; index++) {
    const parser = new ChatGPTStream(); parser.push(wire.slice(0, index)); parser.push(wire.slice(index));
    assert.equal(parser.finish(), "שלום world");
  }
  for (const wire of [
    'data: {"type":"response.output_text.delta","delta":"partial"}\n\n',
    'data: {"type":"response.completed"}\n\n',
    'data: {"type":"response.failed","response":{"error":{"code":"subscription_sharing_usage_limit_exceeded"}}}\n\n',
    'data: {"type":"response.incomplete"}\n\n',
  ]) assert.throws(() => { const parser = new ChatGPTStream(); parser.push(wire); parser.finish(); });
});

function harness(stored = null, options = {}) {
  let storage = stored;
  let callback;
  let resolveCallback;
  let rejectCallback;
  let random = 0;
  const calls = [];
  const starts = [];
  const identityChecks = [];
  const native = {
    readChatGPTVaultAsync: async () => storage,
    writeChatGPTVaultAsync: async (value) => { storage = value; },
    chatGPTRandomAsync: async () => `random-${++random}`,
    chatGPTDigestAsync: async (value) => crypto.createHash("sha256").update(value).digest("base64url"),
    startChatGPTCallbackAsync: async (...args) => {
      starts.push(args);
      callback = new Promise((resolve, reject) => { resolveCallback = resolve; rejectCallback = reject; });
      return "http://127.0.0.1:1234/auth/callback";
    },
    waitChatGPTCallbackAsync: async () => callback,
    cancelChatGPTCallbackAsync: async () => { rejectCallback?.(new Error("cancelled")); },
    verifyChatGPTIdentityAsync: async (...args) => { identityChecks.push(args); if (options.badIdentity) throw new Error("bad signature"); return { subject: "person", email: "person@example.test" }; },
  };
  const catalog = { models: [{ slug: "available", display_name: "Available", visibility: "list" }] };
  let fetcher = async (url, init) => {
    if (url.endsWith("/token")) return Response.json({ access_token: "access", refresh_token: "refresh", id_token: "signed-id", expires_in: 3600, scope: options.scope ?? scope, token_type: "Bearer" });
    if (url.endsWith("jwks.json")) return Response.json({ keys: [] });
    if (url.endsWith("/models")) return Response.json(catalog);
    if (url.endsWith("/revoke")) return new Response("");
    if (url.endsWith("/responses")) return new Response('data: {"type":"response.output_text.delta","delta":"hello"}\n\ndata: {"type":"response.completed"}\n\n');
    throw new Error("Unexpected URL");
  };
  const service = load("chatgpt-service.ts", {
    expo: { uuid: { v4: () => "unique-installation" } },
    "expo/fetch": { fetch: async (url, init) => { calls.push({ url, init }); return fetcher(url, init); } },
    "react-native": { Linking: { openURL: async (url) => {
      const auth = new URL(url); calls.push({ url, authorization: true });
      resolveCallback(`${auth.searchParams.get("redirect_uri")}?state=${auth.searchParams.get("state")}&code=one-time&client_id=${auth.searchParams.get("client_id") === "dynamic_agent_client" ? "issued" : auth.searchParams.get("client_id")}`);
    } } },
    "../../../modules/plutus-local-ai/src/PlutusLocalAIModule": native,
    "./chatgpt-protocol": protocol,
  });
  return { service, calls, starts, identityChecks, storage: () => JSON.parse(storage), setFetch: (next) => { fetcher = next; } };
}

test("connection validates identity, persists issued credentials, selects a discovered model and retains registration after disconnect", async () => {
  const h = harness();
  assert.equal(await h.service.connectChatGPT(), true);
  const state = h.service.getChatGPTSnapshot();
  assert.equal(state.connected, true); assert.equal(state.planEnabled, true); assert.equal(state.selectedModel, "available");
  assert.equal(h.identityChecks.length, 1);
  assert.equal(h.identityChecks[0][2], "issued");
  assert.equal(h.identityChecks[0][3], "random-2");
  const token = h.calls.find((call) => call.url.endsWith("/token"));
  assert.equal(new URLSearchParams(token.init.body).get("client_id"), "issued");
  assert.equal(new URLSearchParams(token.init.body).get("redirect_uri"), "http://127.0.0.1:1234/auth/callback");
  const host = h.storage().host;
  const model = h.service.createChatGPTModel("available");
  model.resetConversation("[]", "instructions");
  assert.equal(await model.execute([{ type: "text", text: "question" }]), "hello");
  await assert.rejects(model.execute([{ type: "audio", path: "private.wav" }]), /unsupported/);
  assert.equal(await h.service.disconnectChatGPT(), true);
  assert.equal(h.service.getChatGPTSnapshot().connected, false);
  assert.equal(h.storage().host, host);
  assert.deepEqual(h.storage().registrations, [{ clientId: "issued", subject: "person", email: "person@example.test" }]);
  assert.equal(await h.service.connectChatGPT("issued"), false);
  assert.equal(new URL(h.calls.filter((call) => call.authorization).at(-1).url).searchParams.get("client_id"), "issued");
});

test("declined plan permission retains identity but performs no inference or model discovery", async () => {
  const h = harness(null, { scope: "openid email" });
  await h.service.connectChatGPT();
  assert.equal(h.service.getChatGPTSnapshot().connected, true);
  assert.equal(h.service.getChatGPTSnapshot().planEnabled, false);
  await assert.rejects(h.service.createChatGPTModel("model").execute([{ type: "text", text: "secret" }]), /permission/);
  assert.equal(h.calls.some((call) => /\/(models|responses)$/.test(call.url)), false);
});

test("failed identity verification never activates the connection; corrupt vaults never get overwritten", async () => {
  const h = harness(null, { badIdentity: true });
  await assert.rejects(h.service.connectChatGPT());
  assert.equal(h.service.getChatGPTSnapshot().connected, false);
  assert.equal(h.storage().registrations[0].accessToken, undefined);
  const corrupt = harness('{"version":99}');
  await corrupt.service.initializeChatGPT();
  assert.equal(corrupt.service.getChatGPTSnapshot().error, "storage");
  assert.deepEqual(corrupt.storage(), { version: 99 });
});

test("refreshes are serialized, rotate credentials atomically, and preserve temporary failures", async () => {
  const h = harness();
  await h.service.connectChatGPT();
  const vault = h.storage(); vault.registrations[0].expiresAt = 0;
  const resumed = harness(JSON.stringify(vault));
  await resumed.service.initializeChatGPT();
  let refreshCount = 0;
  resumed.setFetch(async (url) => {
    if (url.endsWith("/token")) { refreshCount++; await new Promise((resolve) => setImmediate(resolve)); return Response.json({ access_token: "rotated-access", refresh_token: "rotated-refresh", expires_in: 3600 }); }
    return new Response('data: {"type":"response.output_text.delta","delta":"ok"}\n\ndata: {"type":"response.completed"}\n\n');
  });
  await Promise.all([1, 2].map(() => resumed.service.createChatGPTModel("available").execute([{ type: "text", text: "hello" }])));
  assert.equal(refreshCount, 1);
  assert.equal(resumed.storage().registrations[0].refreshToken, "rotated-refresh");
  const failing = harness(JSON.stringify(vault));
  await failing.service.initializeChatGPT();
  failing.setFetch(async () => new Response("temporary", { status: 503 }));
  await assert.rejects(failing.service.createChatGPTModel("available").execute([{ type: "text", text: "hello" }]));
  assert.equal(failing.storage().registrations[0].refreshToken, "refresh");
});

test("usage limits stop requests without changing billing; offline disconnect clears credentials and reports unconfirmed revocation", async () => {
  const h = harness();
  await h.service.connectChatGPT();
  h.setFetch(async () => Response.json({ error: { code: "subscription_sharing_usage_limit_exceeded" } }, { status: 429 }));
  await assert.rejects(h.service.createChatGPTModel("available").execute([{ type: "text", text: "hello" }]), /usage_limit_exceeded/);
  assert.equal(h.service.getChatGPTSnapshot().error, "subscription_sharing_usage_limit_exceeded");
  const inferenceCalls = h.calls.filter((call) => call.url.endsWith("/responses"));
  assert.equal(inferenceCalls.length, 1);
  assert.equal(await h.service.disconnectChatGPT(), false);
  assert.equal(h.storage().registrations[0].refreshToken, undefined);
  assert.equal(h.service.getChatGPTSnapshot().selectedModel, null);
});

test("disconnect waits for rotation and revokes the newest refresh token without resurrecting credentials", async () => {
  const first = harness(); await first.service.connectChatGPT();
  const vault = first.storage(); vault.registrations[0].expiresAt = 0;
  const h = harness(JSON.stringify(vault)); await h.service.initializeChatGPT();
  let finishRefresh;
  const pendingRefresh = new Promise((resolve) => { finishRefresh = resolve; });
  let revoked;
  h.setFetch(async (url, init) => {
    if (url.endsWith("/token")) return pendingRefresh;
    if (url.endsWith("/revoke")) { revoked = new URLSearchParams(init.body).get("token"); return new Response(""); }
    return Response.json({ models: [] });
  });
  const loading = h.service.loadChatGPTModels();
  await new Promise((resolve) => setImmediate(resolve));
  const disconnecting = h.service.disconnectChatGPT();
  assert.equal(h.service.getChatGPTSnapshot().disconnecting, true);
  finishRefresh(Response.json({ access_token: "new-access", refresh_token: "new-refresh", expires_in: 3600 }));
  await Promise.all([loading, disconnecting]);
  assert.equal(revoked, "new-refresh");
  assert.equal(h.storage().registrations[0].accessToken, undefined);
  assert.equal(h.service.getChatGPTSnapshot().connected, false);
});

test("terminal refresh failures clear only unusable credentials and retain the host/client registration", async () => {
  const first = harness(); await first.service.connectChatGPT();
  const vault = first.storage(); vault.registrations[0].expiresAt = 0;
  const h = harness(JSON.stringify(vault)); await h.service.initializeChatGPT();
  h.setFetch(async () => Response.json({ error: "invalid_grant" }, { status: 400 }));
  await assert.rejects(h.service.createChatGPTModel("available").execute([{ type: "text", text: "hello" }]), /invalid_grant/);
  assert.equal(h.storage().host, vault.host);
  assert.equal(h.storage().registrations[0].clientId, "issued");
  assert.equal(h.storage().registrations[0].accessToken, undefined);
  assert.equal(h.service.getChatGPTSnapshot().connected, false);
  assert.equal(h.service.getChatGPTSnapshot().selectedModel, null);
});

test("sign-in failures keep OpenAI's code and the browser page returns to the app", async () => {
  const page = { url: "plutus://chatgpt-callback", title: "Returning", message: "Tap", action: "Open" };
  const h = harness();
  h.setFetch(async (url) => url.endsWith("/token") ? Response.json({ error: "invalid_client" }, { status: 400 }) : Response.json({}));
  await assert.rejects(h.service.connectChatGPT(undefined, page), /invalid_client/);
  assert.deepEqual(h.starts[0], ["random-1", ...Object.values(page)]);
  assert.equal(h.service.getChatGPTSnapshot().error, "invalid_client");
  const admission = harness();
  admission.setFetch(async (url) => url.endsWith("/token") ? Response.json({ detail: "Direct routing unavailable" }, { status: 503 }) : Response.json({}));
  await assert.rejects(admission.service.connectChatGPT());
  assert.equal(admission.service.getChatGPTSnapshot().error, "http_503");
});

test("only connectivity failures use the connection message; other codes are shown", () => {
  const { chatGPTMessageKey, chatGPTErrorMessage } = load("use-chatgpt.ts", {
    "expo-linking": { createURL: (path) => `plutus://${path}` }, react: {}, "react-i18next": {}, "react-native": { Linking: {} },
    "@/shared/ui/app-alert": { AppAlert: {} }, "./chatgpt-service": {}, "./chatgpt-protocol": protocol,
  });
  assert.equal(chatGPTMessageKey("network"), "network");
  assert.equal(chatGPTMessageKey("signin:invalid_request"), "signin");
  assert.equal(chatGPTMessageKey("timeout"), "signin");
  assert.equal(chatGPTMessageKey("http_503"), "service");
  assert.equal(chatGPTMessageKey("unexpected"), "service");
  assert.equal(chatGPTMessageKey("invalid_grant"), "unauthorized");
  const t = (key, values) => `${key}|${values.code}`;
  assert.equal(chatGPTErrorMessage(t, "signin:invalid_request"), "localAI.chatgpt.errors.signin|invalid_request");
});
