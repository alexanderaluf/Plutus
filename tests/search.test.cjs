const fs = require("node:fs");
const path = require("node:path");
const assert = require("node:assert/strict");
const { test } = require("node:test");
const ts = require("typescript");
const sourceRoot = path.resolve(__dirname, "../src");
require.extensions[".ts"] = (module, filename) => {
  const source = ts
    .transpileModule(fs.readFileSync(filename, "utf8"), {
      compilerOptions: {
        module: ts.ModuleKind.CommonJS,
        target: ts.ScriptTarget.ES2022,
      },
    })
    .outputText.replace(
      /require\("@\/([^\"]+)"\)/g,
      (_, relative) =>
        `require(${JSON.stringify(path.join(sourceRoot, relative))})`,
    );
  module._compile(source, filename);
};

const {
  createLegacyDevelopmentBackup,
} = require("./fixtures/legacy-development-backup.ts");
const {
  normalizeBackupDocument,
} = require("../src/data/model/normalize-backup.ts");
const {
  selectSearchMatches,
} = require("../src/data/selectors/document-selectors.ts");

function documentWith(transactions) {
  const base = createLegacyDevelopmentBackup();
  return normalizeBackupDocument({
    ...base,
    accounts: [
      {
        uuid: "account-main",
        id: 1,
        name: "Everyday Card",
        currencyCode: "USD",
        amount: 0,
      },
    ],
    categories: [{ uuid: "category-food", id: 7, name: "Groceries" }],
    transactions,
  });
}

function entry(index, name, overrides = {}) {
  return {
    uuid: `tx-${index}`,
    name,
    account: "account-main",
    category: "category-food",
    amount: 10,
    currencyCode: "USD",
    type: 0,
    date: "2026-09-10T10:00:00.000Z",
    createdAt: "2026-09-10T10:00:00.000Z",
    ...overrides,
  };
}

test("an empty query does no work and returns nothing", () => {
  const document = documentWith([entry(1, "Coffee")]);

  for (const query of ["", "   "]) {
    const found = selectSearchMatches(document, query);
    assert.deepEqual(found.results, []);
    assert.equal(found.total, 0);
  }
});

test("matches on the transaction name, its category, and its account", () => {
  const document = documentWith([
    entry(1, "Flat white"),
    entry(2, "Bus ticket", { category: null }),
  ]);

  // By name.
  assert.equal(selectSearchMatches(document, "flat").total, 1);
  // By category name resolved from its id.
  assert.equal(selectSearchMatches(document, "grocer").total, 1);
  // By account name resolved from its id — both transactions share it.
  assert.equal(selectSearchMatches(document, "everyday").total, 2);
  assert.equal(selectSearchMatches(document, "nothing here").total, 0);
});

test("only the returned page is projected, while the total still counts every match", () => {
  const document = documentWith(
    Array.from({ length: 500 }, (_, index) => entry(index, "Coffee run")),
  );

  const found = selectSearchMatches(document, "coffee", 60);

  // The cap is what keeps navigation responsive on large profiles.
  assert.equal(found.results.length, 60);
  assert.equal(found.total, 500);
  assert.equal(found.results[0].title, "Coffee run");
  assert.equal(found.results[0].account, "Everyday Card");
  assert.equal(found.results[0].category, "Groceries");
});

test("searching a large profile stays linear rather than scanning accounts per record", () => {
  const accounts = Array.from({ length: 200 }, (_, index) => ({
    uuid: `account-${index}`,
    id: index + 1,
    name: `Account ${index}`,
    currencyCode: "USD",
    amount: 0,
  }));
  const document = normalizeBackupDocument({
    ...createLegacyDevelopmentBackup(),
    accounts,
    categories: [{ uuid: "category-food", id: 7, name: "Groceries" }],
    transactions: Array.from({ length: 20000 }, (_, index) =>
      entry(index, index % 2 ? "Coffee" : "Rent", {
        account: `account-${index % 200}`,
      }),
    ),
  });

  const started = Date.now();
  const found = selectSearchMatches(document, "coffee", 60);
  const elapsed = Date.now() - started;

  assert.equal(found.total, 10000);
  assert.equal(found.results.length, 60);
  // Generous bound: the point is that it no longer degrades with account count.
  assert.ok(elapsed < 2000, `search took ${elapsed}ms`);
});
