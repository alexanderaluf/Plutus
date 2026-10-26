// Run with: node --test tests/ai-chats.test.cjs
const fs = require("node:fs");
const path = require("node:path");
const assert = require("node:assert/strict");
const { test } = require("node:test");
const ts = require("typescript");

const sourceRoot = path.resolve(__dirname, "../src");
require.extensions[".ts"] = (module, filename) => {
  const code = ts
    .transpileModule(fs.readFileSync(filename, "utf8"), {
      compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
    })
    .outputText.replace(/require\("@\/([^\"]+)"\)/g, (_, relative) =>
      `require(${JSON.stringify(path.join(sourceRoot, relative))})`);
  module._compile(code, filename);
};

const { LOCAL_SCHEMA_VERSION, BACKUP_COLLECTION_KEYS } = require("../src/data/model/backup-document.ts");
const { createDefaultBackup } = require("../src/data/model/default-backup.ts");
const { normalizeBackupDocument } = require("../src/data/model/normalize-backup.ts");
const { createJsonBackupDocument } = require("../src/data/backup/document-export.ts");
const { deleteProfileData } = require("../src/data/model/profile-record.ts");
const { aiChatTitle, renameAIChat, saveAIChatMessages, setAIChatPinned } = require("../src/data/model/ai-chat-record.ts");
const { selectAIChats } = require("../src/data/selectors/document-selectors.ts");

const profiles = [
  { id: 1, uuid: "profile-a", name: "A", currency: "USD", isSelected: true },
  { id: 2, uuid: "profile-b", name: "B", currency: "EUR", isSelected: false },
];
function documentWithProfiles() {
  return { ...createDefaultBackup(), users: profiles, _local: { ...createDefaultBackup()._local, selectedProfileId: "profile-a" } };
}
const question = { role: "user", text: "How much did I   spend on groceries this month compared with last month?" };
const answer = { role: "assistant", text: "You spent $320.", cards: [{ kind: "transaction", id: "t1" }], mentions: { T1: { kind: "transaction", id: "t1" } } };

test("schema 23 adds a backed-up chat collection with empty defaults", () => {
  assert.equal(LOCAL_SCHEMA_VERSION, 23);
  assert.ok(BACKUP_COLLECTION_KEYS.includes("aiChats"));
  assert.deepEqual(createDefaultBackup().aiChats, []);
  const legacy = normalizeBackupDocument({ backupVersion: 3, users: profiles, _local: { schemaVersion: 22 } });
  assert.deepEqual(legacy.aiChats, []);
  assert.throws(() => normalizeBackupDocument({ backupVersion: 3, aiChats: "damaged" }), /aiChats/);
});

test("a chat is created on its first message and keeps its title, pin and unknown fields on later saves", () => {
  let document = saveAIChatMessages(documentWithProfiles(), { id: "chat-1", user: "profile-a", model: "gpt", messages: [question], now: "2026-10-26T10:00:00.000Z" });
  const created = document.aiChats[0];
  assert.equal(created.title, aiChatTitle(question.text));
  assert.ok(created.title.length <= 60 && !created.title.includes("  "));
  assert.equal(created.user, "profile-a");
  assert.equal(created.pinned, false);
  assert.equal(created.createdAt, "2026-10-26T10:00:00.000Z");

  document = renameAIChat(document, "chat-1", "  Groceries   check ", "2026-10-26T10:01:00.000Z");
  document = setAIChatPinned(document, "chat-1", true, "2026-10-26T10:02:00.000Z");
  document = { ...document, aiChats: [{ ...document.aiChats[0], importedExtra: { keep: true } }] };
  document = saveAIChatMessages(document, { id: "chat-1", user: "profile-a", model: "gpt-2", messages: [question, answer], now: "2026-10-26T10:05:00.000Z" });

  const saved = document.aiChats[0];
  assert.equal(document.aiChats.length, 1);
  assert.equal(saved.title, "Groceries check");
  assert.equal(saved.pinned, true);
  assert.deepEqual(saved.importedExtra, { keep: true });
  assert.equal(saved.model, "gpt-2");
  assert.equal(saved.createdAt, "2026-10-26T10:00:00.000Z");
  assert.equal(saved.lastMessageAt, "2026-10-26T10:05:00.000Z");
  assert.deepEqual(saved.messages, [question, answer]);
  assert.equal(renameAIChat(document, "chat-1", "   ", "x"), document);
});

test("the history lists the profile's readable chats, pinned first, then by latest message", () => {
  let document = documentWithProfiles();
  const save = (id, user, now) => { document = saveAIChatMessages(document, { id, user, model: null, messages: [question], now }); };
  save("old", "profile-a", "2026-10-01T00:00:00.000Z");
  save("new", "profile-a", "2026-10-20T00:00:00.000Z");
  save("pinned-old", "profile-a", "2026-09-01T00:00:00.000Z");
  save("other-profile", "profile-b", "2026-10-25T00:00:00.000Z");
  save("numeric-owner", 1, "2026-10-10T00:00:00.000Z");
  document = setAIChatPinned(document, "pinned-old", true, "2026-10-26T00:00:00.000Z");
  document.aiChats.push({ uuid: "broken", user: "profile-a", messages: "not-a-list" });
  document.aiChats.push({ uuid: "untitled", user: "profile-a", messages: [{ role: "user", text: "Budget left?" }, { role: "system", text: "x" }], createdAt: "2026-08-01T00:00:00.000Z" });

  const chats = selectAIChats(document, "profile-a");
  assert.deepEqual(chats.map((chat) => chat.id), ["pinned-old", "new", "numeric-owner", "old", "untitled"]);
  const untitled = chats.at(-1);
  assert.equal(untitled.title, "Budget left?");
  assert.deepEqual(untitled.messages, [{ role: "user", text: "Budget left?" }]);
  assert.deepEqual(selectAIChats(document, "profile-b").map((chat) => chat.id), ["other-profile"]);
});

test("JSON export and restore keep chats with their pinned state", () => {
  let document = saveAIChatMessages(documentWithProfiles(), { id: "chat-1", user: "profile-a", model: "gpt", messages: [question, answer], now: "2026-10-26T10:00:00.000Z" });
  document = setAIChatPinned(document, "chat-1", true, "2026-10-26T10:01:00.000Z");
  const exported = JSON.parse(JSON.stringify(createJsonBackupDocument(document)));
  assert.deepEqual(exported.aiChats, document.aiChats);
  const restored = normalizeBackupDocument(exported);
  const [chat] = selectAIChats(restored, "profile-a");
  assert.equal(chat.pinned, true);
  assert.deepEqual(chat.messages, [question, answer]);
});

test("deleting a profile deletes only that profile's chats", () => {
  let document = documentWithProfiles();
  document = saveAIChatMessages(document, { id: "a", user: "profile-a", model: null, messages: [question], now: "2026-10-26T00:00:00.000Z" });
  document = saveAIChatMessages(document, { id: "b", user: "profile-b", model: null, messages: [question], now: "2026-10-26T00:00:00.000Z" });
  const result = deleteProfileData(document, "profile-b");
  assert.deepEqual(result.document.aiChats.map((chat) => chat.uuid), ["a"]);
});
