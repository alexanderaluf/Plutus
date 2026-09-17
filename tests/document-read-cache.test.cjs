const fs = require("node:fs"),
  path = require("node:path");
const assert = require("node:assert/strict");
const { test } = require("node:test");
const ts = require("typescript");
const root = path.resolve(__dirname, "../src");
require.extensions[".ts"] = (module, filename) =>
  module._compile(
    ts
      .transpileModule(fs.readFileSync(filename, "utf8"), {
        compilerOptions: {
          module: ts.ModuleKind.CommonJS,
          target: ts.ScriptTarget.ES2022,
        },
      })
      .outputText.replace(
        /require\("@\/([^\"]+)"\)/g,
        (_, relative) =>
          `require(${JSON.stringify(path.join(root, relative))})`,
      ),
    filename,
  );
const { createDefaultBackup } = require("../src/data/model/default-backup.ts");
const {
  parseStoredDocument,
} = require("../src/data/model/normalize-backup.ts");
const recovery = "Data recovery required";
function harness() {
  const document = createDefaultBackup();
  document.users = [{ uuid: "me", currency: "USD" }];
  document._local.selectedProfileId = "me";
  let json = JSON.stringify(document),
    guard = { had_profile: 1 },
    parses = 0,
    reads = 0;
  const database = {
    async getFirstAsync(sql) {
      reads++;
      return sql.includes("app_storage_identity")
        ? guard
        : json === null
          ? null
          : { document_json: json };
    },
  };
  const filename =
    require.resolve("../src/data/database/document-repository.ts");
  const source = ts.transpileModule(fs.readFileSync(filename, "utf8"), {
    compilerOptions: { module: ts.ModuleKind.CommonJS },
  }).outputText;
  const module = { exports: {} };
  new Function("require", "module", "exports", source)(
    (name) =>
      name === "../model/normalize-backup"
        ? {
            parseStoredDocument(value) {
              parses++;
              return parseStoredDocument(value);
            },
          }
        : name === "./migrations"
          ? { STORAGE_RECOVERY_MESSAGE: recovery }
          : {},
    module,
    module.exports,
  );
  const read = module.exports.createDocumentReader(database);
  return {
    read,
    document,
    counts: () => ({ parses, reads }),
    json: (value) => {
      json = value;
    },
    guard: (value) => {
      guard = value;
    },
  };
}

test("foreground reader always checks SQLite and identity, but parses unchanged records only once", async () => {
  const h = harness();
  const first = await h.read();
  for (let i = 0; i < 10; i++) assert.equal(await h.read(), first);
  assert.deepEqual(h.counts(), { reads: 22, parses: 1 });
  h.json(
    JSON.stringify({
      ...h.document,
      transactions: [{ uuid: "background-write", amount: 25 }],
      importedUnknown: { keep: true },
    }),
  );
  const changed = await h.read();
  assert.notEqual(changed, first);
  assert.equal(changed.transactions[0].uuid, "background-write");
  assert.deepEqual(changed.importedUnknown, { keep: true });
  assert.equal(h.counts().parses, 2);
});

test("cached reader never substitutes cached/default data for missing rows, guards or damaged JSON", async () => {
  for (const damage of [
    (h) => h.json(null),
    (h) => h.guard(null),
    (h) => h.json("{broken"),
    (h) => h.json(JSON.stringify({ ...h.document, transactions: "damaged" })),
    (h) =>
      h.json(
        JSON.stringify({
          ...h.document,
          _local: { ...h.document._local, schemaVersion: 99999 },
        }),
      ),
    (h) => h.json(JSON.stringify({ ...h.document, users: [] })),
  ]) {
    const h = harness();
    await h.read();
    damage(h);
    await assert.rejects(h.read());
  }
});

test("independent identity guard is rechecked even when cached JSON is unchanged", async () => {
  const h = harness();
  h.json(JSON.stringify({ ...h.document, users: [] }));
  h.guard({ had_profile: 0 });
  await h.read();
  h.guard({ had_profile: 1 });
  await assert.rejects(h.read(), new RegExp(recovery));
  assert.equal(h.counts().parses, 1);
});
