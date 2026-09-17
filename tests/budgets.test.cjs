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
const { createLegacyDevelopmentBackup: createDefaultBackup } = require("./fixtures/legacy-development-backup.ts");
const {
  normalizeBackupDocument,
} = require("../src/data/model/normalize-backup.ts");
const {
  budgetDefaults,
  saveBudget,
  addBudgetTransaction,
} = require("../src/data/model/budget-record.ts");
const {
  selectBudgets,
  budgetPeriodRange,
} = require("../src/data/selectors/budget-selectors.ts");
const {
  createJsonBackupDocument,
  createFullBackupDocument,
} = require("../src/data/backup/document-export.ts");
const { migrateLocalDatabase } = require("../src/data/database/migrations.ts");
const { DatabaseSync } = require("node:sqlite");
const now = new Date(2026, 8, 9, 13),
  stamp = now.toISOString();
function fixture() {
  const d = createDefaultBackup();
  return {
    ...d,
    users: [
      { uuid: "me", id: 1, currency: "USD" },
      { uuid: "other", id: 2, currency: "ILS" },
    ],
    _local: { ...d._local, selectedProfileId: "me" },
    budgets: [],
    accounts: [
      {
        uuid: "a",
        id: 10,
        user: "me",
        amount: 1000,
        currencyCode: "USD",
        transactions: [],
      },
      {
        uuid: "b",
        id: 11,
        user: "me",
        amount: 200,
        currencyCode: "USD",
        transactions: [],
      },
      { uuid: "foreign", user: "other", amount: 0, currencyCode: "USD" },
    ],
    categories: [
      { uuid: "food", id: 20, user: 1, name: "Food", type: 0 },
      {
        uuid: "child",
        id: 21,
        parentId: 20,
        user: 1,
        name: "Restaurant",
        type: 0,
      },
      { uuid: "grandchild", parentId: "child", type: 0, user: "me" },
      { uuid: "salary", type: 1, user: "me" },
      { uuid: "transfer", type: 2, user: "me" },
    ],
    transactions: [],
  };
}
const draft = (extra = {}) => ({
  ...budgetDefaults(),
  name: "Food",
  amount: "100",
  categories: ["food"],
  currencyCode: "USD",
  ...extra,
});
function add(d, extra = {}, id = "budget", date = stamp) {
  return saveBudget(d, draft(extra), id, date);
}
function tx(extra = {}) {
  return {
    uuid: "tx",
    name: "Lunch",
    type: 0,
    amount: 20,
    user: 1,
    category: 21,
    account: 10,
    date: new Date(2026, 8, 8, 12).toISOString(),
    ...extra,
  };
}

test("budgets independently track categories and descendants without overlap duplication", () => {
  let d = add(fixture(), { categories: ["food", "child"] });
  d = add(d, { categories: ["child"], budgetMode: "Manual" }, "second");
  d.transactions = [
    tx(),
    tx({ uuid: "deep", category: "grandchild", amount: 5 }),
  ];
  const [a, b] = selectBudgets(d, now);
  assert.equal(a.tracked, 25);
  assert.equal(b.tracked, 20);
  assert.equal(
    a.breakdown.reduce((s, c) => s + c.amount, 0),
    25,
  );
});
test("manual exact selection and optional descendant roll-up", () => {
  let d = add(fixture(), { budgetMode: "Manual" });
  d.transactions = [tx()];
  assert.equal(selectBudgets(d, now)[0].tracked, 0);
  d.budgets[0].includeSubcategories = true;
  assert.equal(selectBudgets(d, now)[0].tracked, 20);
});
test("expense, income and transfer budgets are isolated", () => {
  let d = add(fixture(), { budgetType: "Overall" });
  d = add(d, { transactionType: 1, categories: ["salary"] }, "income");
  d = add(
    d,
    { transactionType: 2, categories: ["transfer"] },
    "transfer-budget",
  );
  d.transactions = [
    tx(),
    tx({ uuid: "income", type: 1, category: "salary", amount: 80 }),
    tx({ uuid: "move", type: 2, category: "transfer", amount: 30 }),
  ];
  assert.deepEqual(
    selectBudgets(d, now).map((b) => b.tracked),
    [20, 80, 30],
  );
});
test("profile, account, currency, invalid date and future date filtering", () => {
  let d = add(fixture(), { accounts: ["a"] });
  d.transactions = [
    tx(),
    tx({ uuid: "other-account", account: "b" }),
    tx({ uuid: "owner", user: 2 }),
    tx({ uuid: "no-owner", user: null, account: "foreign" }),
    tx({ uuid: "eur", currencyCode: "EUR" }),
    tx({ uuid: "invalid", date: "bad" }),
    tx({ uuid: "future", date: new Date(2026, 8, 10).toISOString() }),
    tx({ uuid: "old", date: new Date(2026, 7, 31).toISOString() }),
  ];
  const b = selectBudgets(d, now)[0];
  assert.equal(b.tracked, 20);
  assert.equal(b.excludedCurrencyCount, 1);
  assert.equal(b.transactions.length, 1);
  d.budgets[0].user = "other";
  assert.equal(selectBudgets(d, now).length, 0);
});
test("overall budgets track uncategorized records while empty category scopes do not", () => {
  let d = add(fixture(), { budgetType: "Overall" });
  d.transactions = [tx({ category: null })];
  assert.equal(selectBudgets(d, now)[0].tracked, 20);
  d.budgets[0].budgetType = "Category";
  d.budgets[0].categories = [];
  assert.equal(selectBudgets(d, now)[0].tracked, 0);
});
test("monthly day 31 clamps February and recovers March 31", () => {
  const b = draft({ cycleDay: "31" });
  let r = budgetPeriodRange(b, new Date(2026, 1, 28, 12));
  assert.equal(r.start.getDate(), 28);
  assert.equal(r.end.getMonth(), 2);
  assert.equal(r.end.getDate(), 31);
  r = budgetPeriodRange(b, new Date(2026, 2, 30));
  assert.equal(r.start.getMonth(), 1);
  assert.equal(r.start.getDate(), 28);
});
test("weekly Monday, daily and yearly ranges use local calendar boundaries", () => {
  let r = budgetPeriodRange(draft({ period: "Weekly" }), now);
  assert.equal(r.start.getDate(), 7);
  assert.equal(r.end.getDate(), 14);
  r = budgetPeriodRange(draft({ period: "Daily" }), now);
  assert.equal(r.start.getHours(), 0);
  assert.equal(r.end.getDate(), 10);
  r = budgetPeriodRange(draft({ period: "Yearly" }), now);
  assert.equal(r.start.getMonth(), 0);
  assert.equal(r.end.getFullYear(), 2027);
});
test("custom range includes the end day and excludes the next day", () => {
  const d = add(fixture(), {
    period: "Custom",
    startDate: "2026-09-01",
    endDate: "2026-09-08",
  });
  d.transactions = [
    tx(),
    tx({ uuid: "next", date: new Date(2026, 8, 9, 0).toISOString() }),
  ];
  const b = selectBudgets(d, now)[0];
  assert.equal(b.tracked, 20);
  assert.equal(b.active, false);
  assert.equal(b.daysLeft, 0);
});
test("rollover accumulates unused periods and overspending exhausts carry", () => {
  const d = add(
    fixture(),
    { rolling: true },
    "budget",
    new Date(2026, 5, 1).toISOString(),
  );
  d.transactions = [
    tx({ uuid: "june", amount: 20, date: new Date(2026, 5, 15).toISOString() }),
    tx({ uuid: "aug", amount: 250, date: new Date(2026, 7, 15).toISOString() }),
    tx(),
  ];
  const b = selectBudgets(d, now)[0];
  assert.equal(b.rollover, 30);
  assert.equal(b.limit, 130);
  assert.equal(b.remaining, 110);
  d.transactions[1].amount = 350;
  assert.equal(selectBudgets(d, now)[0].rollover, 0);
});
test("paired transfer legs count only their source, without collapsing unrelated transfers", () => {
  const d = add(fixture(), { transactionType: 2, categories: ["transfer"] });
  d.transactions = [
    tx({
      uuid: "source",
      type: 2,
      category: "transfer",
      fromAccount: "a",
      toAccount: "b",
      account: "a",
      amount: 30,
    }),
    tx({
      uuid: "destination",
      type: 2,
      category: "transfer",
      fromAccount: "a",
      toAccount: "b",
      account: "b",
      amount: 30,
    }),
    tx({ uuid: "independent", type: 2, category: "transfer", amount: 10 }),
  ];
  assert.equal(selectBudgets(d, now)[0].tracked, 40);
});
test("invalid drafts fail before mutation and duplicate category budgets are allowed", () => {
  const d = fixture();
  const before = JSON.stringify(d);
  for (const extra of [
    { amount: "NaN" },
    { amount: "0" },
    { name: " " },
    { categories: [] },
    { categories: ["salary"] },
    { accounts: ["foreign"] },
    { cycleDay: "32" },
    { period: "Custom", startDate: "2026-02-30", endDate: "2026-03-01" },
  ])
    assert.throws(() => add(d, extra));
  assert.equal(JSON.stringify(d), before);
  assert.equal(add(add(d), {}, "another").budgets.length, 2);
});
test("editing and backup round trip preserve unknown budget and root fields", () => {
  let d = add(fixture(), {
    notes: "Notes",
    rolling: true,
    showOnHome: true,
    period: "Weekly",
  });
  d.future = { keep: [1, 2] };
  d.budgets[0].foreignSetting = { keep: true };
  d = saveBudget(
    d,
    draft({
      name: "Renamed",
      rolling: true,
      showOnHome: true,
      period: "Weekly",
    }),
    "budget",
    stamp,
    true,
  );
  for (const out of [
    createJsonBackupDocument(d),
    createFullBackupDocument(d),
  ]) {
    const restored = normalizeBackupDocument(JSON.parse(JSON.stringify(out)));
    assert.deepEqual(restored.future, d.future);
    assert.deepEqual(restored.budgets[0].foreignSetting, { keep: true });
    assert.equal(restored.budgets[0].period, "Weekly");
    assert.equal(selectBudgets(restored, now)[0].showOnHome, true);
  }
});
test("new expense/income/transfer transactions atomically update balances and references", () => {
  let d = add(fixture());
  const input = {
    name: "Lunch",
    amount: "12.5",
    accountId: "a",
    categoryId: "food",
    toAccountId: "",
    date: "2026-09-09",
  };
  d = addBudgetTransaction(d, "budget", input, "new", stamp);
  assert.equal(d.accounts[0].amount, 987.5);
  assert.deepEqual(d.accounts[0].transactions, ["new"]);
  assert.equal(selectBudgets(d, now)[0].tracked, 12.5);
  d = add(d, { transactionType: 1, categories: ["salary"] }, "salary-budget");
  d = addBudgetTransaction(
    d,
    "salary-budget",
    { ...input, categoryId: "salary" },
    "income",
    stamp,
  );
  assert.equal(d.accounts[0].amount, 1000);
  d = add(
    d,
    { transactionType: 2, categories: ["transfer"] },
    "transfer-budget",
  );
  const before = JSON.stringify(d);
  assert.throws(() =>
    addBudgetTransaction(
      d,
      "transfer-budget",
      { ...input, categoryId: "transfer", toAccountId: "a" },
      "bad",
      stamp,
    ),
  );
  assert.equal(JSON.stringify(d), before);
  d = addBudgetTransaction(
    d,
    "transfer-budget",
    { ...input, categoryId: "transfer", toAccountId: "b" },
    "move",
    stamp,
  );
  assert.equal(d.accounts[0].amount, 987.5);
  assert.equal(d.accounts[1].amount, 212.5);
  assert.deepEqual(d.accounts[1].transactions, ["move"]);
  assert.equal(
    selectBudgets(d, now).find((b) => b.id === "transfer-budget").tracked,
    12.5,
  );
});
test("v13 migration preserves imported budget settings and is idempotent", async () => {
  const sql = new DatabaseSync(":memory:");
  const adapter = {
    execAsync: async (s) => sql.exec(s),
    getAllAsync: async (s, ...p) => sql.prepare(s).all(...p),
    getFirstAsync: async (s, ...p) => sql.prepare(s).get(...p),
    runAsync: async (s, ...p) => sql.prepare(s).run(...p),
    withExclusiveTransactionAsync: async (fn) => {
      sql.exec("BEGIN");
      try {
        await fn(adapter);
        sql.exec("COMMIT");
      } catch (e) {
        sql.exec("ROLLBACK");
        throw e;
      }
    },
  };
  try {
    const d = fixture();
    d._local.schemaVersion = 12;
    d.budgets = [
      {
        uuid: "legacy",
        name: "Imported",
        amount: 100,
        categories: [20],
        unknown: { a: true },
      },
    ];
    d.unknownCollection = [{ keep: true }];
    sql.exec(
      "CREATE TABLE app_document (id INTEGER PRIMARY KEY, schema_version INTEGER, document_json TEXT, updated_at TEXT); PRAGMA user_version=12;",
    );
    sql
      .prepare("INSERT INTO app_document VALUES (1,12,?,?)")
      .run(JSON.stringify(d), stamp);
    await migrateLocalDatabase(adapter);
    const migrated = JSON.parse(
      sql.prepare("SELECT document_json FROM app_document").get().document_json,
    );
    assert.equal(migrated._local.schemaVersion, 19);
    assert.equal(migrated._local.cloudProvider, null);
    assert.equal(migrated.budgets[0].period, "Monthly");
    assert.deepEqual(migrated.budgets[0].categories, [20]);
    assert.deepEqual(migrated.budgets[0].unknown, { a: true });
    assert.deepEqual(migrated.unknownCollection, d.unknownCollection);
    await migrateLocalDatabase(adapter);
    assert.deepEqual(
      JSON.parse(
        sql.prepare("SELECT document_json FROM app_document").get()
          .document_json,
      ),
      migrated,
    );
  } finally {
    sql.close();
  }
});
