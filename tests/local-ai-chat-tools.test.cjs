const assert = require("node:assert/strict");
const fs = require("node:fs");
const { test } = require("node:test");
const ts = require("typescript");

const filename = require.resolve("../src/features/local-ai/chat-tools.ts");
const source = ts.transpileModule(fs.readFileSync(filename, "utf8"), {
  compilerOptions: {
    module: ts.ModuleKind.CommonJS,
    target: ts.ScriptTarget.ES2022,
  },
}).outputText;
const moduleShim = { exports: {} };
new Function("require", "module", "exports", source)(
  () => ({}),
  moduleShim,
  moduleShim.exports,
);
const { parseReadTools, inferReadTools } = moduleShim.exports;

test("financial requests select only approved read tools", () => {
  assert.deepEqual(
    parseReadTools('{"tools":["largest_expenses","accounts","delete_all"]}'),
    ["largest_expenses", "accounts"],
  );
  assert.deepEqual(parseReadTools('```json\n{"tools":["budgets"]}\n```'), [
    "budgets",
  ]);
  assert.deepEqual(parseReadTools("not JSON"), []);
});

test("common expense and mixed finance questions still get cards if the model misses tool JSON", () => {
  assert.deepEqual(inferReadTools("What was my highest expense ever?"), [
    "largest_expenses",
  ]);
  assert.deepEqual(
    inferReadTools("Show recent transactions and account balances"),
    ["recent_transactions", "accounts"],
  );
});
