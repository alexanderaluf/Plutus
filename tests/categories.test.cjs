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
  saveCategory,
  deleteCategory,
  categoryFamily,
} = require("../src/data/model/category-record.ts");
const {
  selectCategories,
  selectCategoryRootId,
  selectCategoryMonthlyTotals,
  selectCategoryTransactions,
  selectTopLevelCategories,
} = require("../src/data/selectors/category-selectors.ts");
const {
  createJsonBackupDocument,
  createFullBackupDocument,
} = require("../src/data/backup/document-export.ts");
const { migrateLocalDatabase } = require("../src/data/database/migrations.ts");
const { DatabaseSync } = require("node:sqlite");
const now = "2026-09-09T12:00:00.000Z";
const draft = (extra = {}) => ({
  name: "Food",
  description: "Eating out",
  type: 0,
  parentId: null,
  icon: "food",
  iconPath: null,
  color: "#ef5350",
  isDefault: false,
  ...extra,
});
function fixture() {
  const document = createDefaultBackup();
  document.categories = [];
  document.transactions = [];
  return document;
}
function add(document, id, extra = {}) {
  return saveCategory(document, draft(extra), id, "alex-personal", now);
}
function tree() {
  return add(
    add(add(fixture(), "food"), "restaurant", {
      name: "Restaurant",
      parentId: "food",
    }),
    "lunch",
    { name: "Lunch", parentId: "restaurant" },
  );
}

test("transaction category grid exposes roots and highlights a selected descendant's root", () => {
  const document = add(tree(), "other", { name: "Other" });

  assert.deepEqual(
    selectTopLevelCategories(document).map((category) => category.id),
    ["food", "other"],
  );
  assert.equal(selectCategoryRootId(document, "lunch"), "food");
  assert.equal(selectCategoryRootId(document, "restaurant"), "food");
  assert.equal(selectCategoryRootId(document, "other"), "other");
  assert.equal(selectCategoryRootId(document, "missing"), "");
});

test("create, rename, reparent, defaults and unknown data survive backup round trips", () => {
  let document = tree();
  document.customCollection = [{ opaque: true }];
  document.categories[1].unknown = { preserved: true };
  document.transactions = [
    {
      uuid: "tx",
      category: "restaurant",
      categoryName: "Restaurant",
      amount: 12,
      type: 0,
    },
  ];
  document = saveCategory(
    document,
    draft({ name: "Dinner", parentId: "food", isDefault: true }),
    "restaurant",
    "alex-personal",
    now,
    true,
  );
  document = add(document, "other", { isDefault: true });
  assert.equal(
    document.categories.find((item) => item.uuid === "restaurant").isDefault,
    false,
  );
  assert.equal(document.transactions[0].categoryName, "Dinner");
  assert.deepEqual(document.categories[1].unknown, { preserved: true });
  assert.equal(document.categories[1].createdAt, now);
  for (const exportDocument of [
    createJsonBackupDocument,
    createFullBackupDocument,
  ]) {
    const restored = normalizeBackupDocument(
      JSON.parse(JSON.stringify(exportDocument(document))),
    );
    assert.deepEqual(restored.categories, document.categories);
    assert.deepEqual(restored.customCollection, document.customCollection);
    assert.equal(restored._local.cloudProvider, null);
  }
});

test("parents reject self, descendants, missing IDs, incompatible types and profiles", () => {
  const document = tree();
  for (const parentId of ["food", "lunch", "missing"])
    assert.throws(() =>
      saveCategory(
        document,
        draft({ parentId }),
        "food",
        "alex-personal",
        now,
        true,
      ),
    );
  document.categories.push({ uuid: "income", name: "Salary", type: 1 });
  document.categories.push({
    uuid: "foreign",
    name: "Private",
    type: 0,
    user: "alex-household",
  });
  assert.throws(
    () => add(document, "new", { parentId: "income" }),
    /same transaction type/,
  );
  assert.throws(
    () => add(document, "new", { parentId: "foreign" }),
    /same transaction type/,
  );
  assert.throws(
    () =>
      saveCategory(
        document,
        draft({ type: 1 }),
        "food",
        "alex-personal",
        now,
        true,
      ),
    /keep its transaction type/,
  );
  assert.throws(
    () => saveCategory(document, draft(), "gone", "alex-personal", now, true),
    /no longer exists/,
  );
  assert.throws(() => add(document, "bad", { name: " " }), /category name/);
  assert.throws(() => add(document, "bad", { color: "red" }), /valid color/);
  const moved = saveCategory(
    document,
    draft({ parentId: null }),
    "restaurant",
    "alex-personal",
    now,
    true,
  );
  assert.equal(moved.categories[1].parentId, null);
  assert.deepEqual([...categoryFamily(moved.categories, "food")], ["food"]);
});

test("monthly aggregation includes descendants once, separates currencies and excludes other months/profiles/types", () => {
  const document = tree();
  document.categories[0].id = 10;
  document.categories[1].parentId = 10;
  document.transactions = [
    {
      uuid: "parent",
      category: 10,
      amount: 5,
      type: 0,
      date: new Date(2026, 8, 1).toISOString(),
      currencyCode: "USD",
    },
    {
      uuid: "child",
      category: "restaurant",
      amount: -20,
      type: 0,
      createdAt: now,
      currencyCode: "USD",
    },
    {
      uuid: "grandchild",
      category: "lunch",
      amount: 30,
      type: 0,
      createdAt: now,
      currencyCode: "ILS",
    },
    {
      uuid: "last-month",
      category: "food",
      amount: 99,
      type: 0,
      createdAt: new Date(2026, 7, 31, 23, 59).toISOString(),
    },
    {
      uuid: "next-month",
      category: "food",
      amount: 99,
      type: 0,
      createdAt: new Date(2026, 9, 1).toISOString(),
    },
    {
      uuid: "foreign",
      category: "food",
      amount: 99,
      type: 0,
      createdAt: now,
      user: "alex-household",
    },
    {
      uuid: "bad-date",
      category: "food",
      amount: 99,
      type: 0,
      createdAt: "invalid",
    },
    {
      uuid: "wrong-type",
      category: "food",
      amount: 99,
      type: 1,
      createdAt: now,
    },
  ];
  const totals = selectCategoryMonthlyTotals(document, new Date(2026, 8, 9));
  assert.deepEqual(totals.get("food"), {
    count: 3,
    amounts: { USD: 25, ILS: 30 },
  });
  assert.deepEqual(totals.get("restaurant"), {
    count: 2,
    amounts: { USD: 20, ILS: 30 },
  });
  assert.equal(selectCategoryTransactions(document, "restaurant").length, 2);
  assert.equal(
    selectCategoryTransactions(document, "food").some(
      (item) => item.id === "foreign",
    ),
    false,
  );
  assert.equal(
    selectCategoryMonthlyTotals(document, new Date(2026, 9, 1)).get("food")
      .count,
    1,
  );
});

test("income and transfer summaries count only their matching transactions", () => {
  const document = add(add(fixture(), "salary", { type: 1 }), "transfer", {
    type: 2,
  });
  document.transactions = [
    {
      uuid: "salary-tx",
      category: "salary",
      type: 1,
      amount: 100,
      createdAt: now,
      account: "account-checking",
    },
    {
      uuid: "transfer-tx",
      category: "transfer",
      type: 2,
      amount: 40,
      createdAt: now,
      account: "account-checking",
    },
  ];
  const totals = selectCategoryMonthlyTotals(document, new Date(now));
  assert.deepEqual(totals.get("salary"), { count: 1, amounts: { USD: 100 } });
  assert.deepEqual(totals.get("transfer"), { count: 1, amounts: { USD: 40 } });
  assert.equal(selectCategoryTransactions(document, "transfer")[0].type, 2);
});

test("imported backups without a local selection use the active profile instead of mixing records", () => {
  const document = tree();
  document._local.selectedProfileId = null;
  document.categories.push({
    uuid: "foreign",
    user: "alex-household",
    type: 0,
    name: "Private",
  });
  assert.equal(
    selectCategories(document).some((item) => item.id === "foreign"),
    false,
  );
  document.transactions = [
    {
      uuid: "foreign-account",
      account: "foreign-account",
      category: "food",
      amount: 42,
      type: 0,
      createdAt: now,
    },
  ];
  document.accounts.push({
    uuid: "foreign-account",
    user: "alex-household",
    currencyCode: "ILS",
  });
  assert.equal(
    selectCategoryMonthlyTotals(document, new Date(now)).get("food").count,
    0,
  );
});

test("delete preserves transaction amounts and unrelated data, detaches references, and promotes children", () => {
  const document = tree();
  document.categories[0].id = 12;
  document.transactions = [
    { uuid: "tx", category: 12, amount: 25, type: 0, custom: true },
  ];
  document.templates = [{ uuid: "template", category: "food" }];
  document.recurrings = [{ uuid: "recurring", category: 12 }];
  document.budgets = [
    { uuid: "budget", categories: [12, "lunch"], amount: 500 },
  ];
  const deleted = deleteCategory(document, "food", now);
  assert.equal(deleted.transactions[0].category, null);
  assert.equal(deleted.transactions[0].amount, 25);
  assert.equal(deleted.transactions[0].custom, true);
  assert.equal(
    deleted.categories.find((item) => item.uuid === "restaurant").parentId,
    null,
  );
  assert.equal(
    deleted.categories.find((item) => item.uuid === "lunch").parentId,
    "restaurant",
  );
  assert.equal(deleted.templates[0].category, null);
  assert.equal(deleted.recurrings[0].category, null);
  assert.deepEqual(deleted.budgets[0].categories, ["lunch"]);
  assert.deepEqual(deleted.accounts, document.accounts);
  assert.equal(document.transactions[0].category, 12);
});

test("numeric import relationships, orphan parents and cycles remain readable", () => {
  const document = normalizeBackupDocument({
    ...fixture(),
    categories: [
      { id: 1, uuid: "a", name: "A", type: 0, parent: 2, custom: [1] },
      { id: 2, uuid: "b", name: "B", type: 0, parent: 1 },
      { id: 3, uuid: "c", name: "C", type: 0, parent: 999 },
    ],
  });
  assert.deepEqual([...categoryFamily(document.categories, "a")].sort(), [
    "a",
    "b",
  ]);
  assert.equal(selectCategories(document)[0].parentId, "b");
  assert.equal(selectCategories(document)[2].parentId, null);
  const repaired = saveCategory(
    document,
    draft(),
    "a",
    "alex-personal",
    now,
    true,
  );
  assert.equal(repaired.categories[0].parent, null);
  assert.deepEqual(repaired.categories[0].custom, [1]);
  const viewModel = selectCategories(repaired)[0];
  const savedViewModel = saveCategory(
    repaired,
    viewModel,
    "a",
    "alex-personal",
    now,
    true,
  );
  assert.equal(savedViewModel.categories[0].id, 1);
});

test("v7-to-v13 migration preserves imported category data and survives SQLite reopen", async () => {
  const os = require("node:os");
  const directory = fs.mkdtempSync(
    path.join(os.tmpdir(), "budget-categories-"),
  );
  const filename = path.join(directory, "categories.db");
  let sqlite = new DatabaseSync(filename);
  const adapter = {
    execAsync: async (sql) => sqlite.exec(sql),
    getAllAsync: async (sql, ...params) => sqlite.prepare(sql).all(...params),
    getFirstAsync: async (sql, ...params) => sqlite.prepare(sql).get(...params),
    runAsync: async (sql, ...params) => sqlite.prepare(sql).run(...params),
    withExclusiveTransactionAsync: async (work) => {
      sqlite.exec("BEGIN");
      try {
        await work(adapter);
        sqlite.exec("COMMIT");
      } catch (error) {
        sqlite.exec("ROLLBACK");
        throw error;
      }
    },
  };
  try {
    sqlite.exec(
      "CREATE TABLE app_document (id INTEGER PRIMARY KEY, schema_version INTEGER NOT NULL, document_json TEXT NOT NULL, updated_at TEXT NOT NULL); PRAGMA user_version = 7;",
    );
    const document = fixture();
    document._local.schemaVersion = 7;
    document.categories = [
      {
        uuid: "imported",
        name: "Imported food",
        type: 0,
        custom: { keep: true },
      },
    ];
    document.extra = ["preserved"];
    sqlite
      .prepare("INSERT INTO app_document VALUES (1, 7, ?, ?)")
      .run(JSON.stringify(document), now);
    await migrateLocalDatabase(adapter);
    sqlite.close();
    sqlite = new DatabaseSync(filename);
    const restored = JSON.parse(
      sqlite.prepare("SELECT document_json FROM app_document").get()
        .document_json,
    );
    assert.equal(sqlite.prepare("PRAGMA user_version").get().user_version, 20);
    assert.equal(restored._local.schemaVersion, 20);
    assert.equal(restored.categories.length, 1);
    assert.equal(restored.categories[0].parentId, null);
    assert.deepEqual(restored.categories[0].custom, { keep: true });
    assert.deepEqual(restored.extra, ["preserved"]);
  } finally {
    sqlite.close();
    assert.equal(
      path.dirname(path.resolve(directory)),
      path.resolve(os.tmpdir()),
    );
    assert.ok(path.basename(directory).startsWith("budget-categories-"));
    fs.rmSync(directory, { recursive: true, force: true });
  }
});

test("upgrades preserve legacy categories and their transaction and budget relationships", async () => {
  const os = require("node:os");
  const directory = fs.mkdtempSync(
    path.join(os.tmpdir(), "budget-categories-refresh-"),
  );
  const filename = path.join(directory, "categories.db");
  let sqlite = new DatabaseSync(filename);
  const adapter = {
    execAsync: async (sql) => sqlite.exec(sql),
    getAllAsync: async (sql, ...params) => sqlite.prepare(sql).all(...params),
    getFirstAsync: async (sql, ...params) => sqlite.prepare(sql).get(...params),
    runAsync: async (sql, ...params) => sqlite.prepare(sql).run(...params),
    withExclusiveTransactionAsync: async (work) => {
      sqlite.exec("BEGIN");
      try {
        await work(adapter);
        sqlite.exec("COMMIT");
      } catch (error) {
        sqlite.exec("ROLLBACK");
        throw error;
      }
    },
  };
  try {
    sqlite.exec(
      "CREATE TABLE app_document (id INTEGER PRIMARY KEY, schema_version INTEGER NOT NULL, document_json TEXT NOT NULL, updated_at TEXT NOT NULL); PRAGMA user_version = 6;",
    );
    const document = createDefaultBackup();
    document._local.schemaVersion = 6;
    // Simulate a pre-v9 install: legacy default categories, no user edits.
    document.categories = [
      { id: 1, uuid: "category-groceries", name: "Groceries", type: 0 },
      { id: 2, uuid: "category-housing", name: "Housing", type: 0 },
      { id: 3, uuid: "category-dining", name: "Dining", type: 0 },
      { id: 4, uuid: "category-coffee", name: "Coffee", type: 0 },
      { id: 5, uuid: "category-income", name: "Income", type: 1 },
      { id: 6, uuid: "category-goals", name: "Savings goals", type: 0 },
    ];
    document.budgets = [
      {
        uuid: "budget-lifestyle",
        name: "Lifestyle",
        amount: 1400,
        categories: ["category-dining", "category-coffee"],
      },
    ];
    document.transactions = [
      {
        uuid: "tx-salary",
        account: "account-checking",
        amount: 3125,
        type: 1,
        category: "category-income",
        categoryName: "Income",
        createdAt: now,
      },
      {
        uuid: "tx-coffee",
        account: "account-checking",
        amount: 6.75,
        type: 0,
        category: "category-coffee",
        categoryName: "Coffee",
        createdAt: now,
      },
    ];
    sqlite
      .prepare("INSERT INTO app_document VALUES (1, 6, ?, ?)")
      .run(JSON.stringify(document), now);
    await migrateLocalDatabase(adapter);
    sqlite.close();
    sqlite = new DatabaseSync(filename);
    const restored = JSON.parse(
      sqlite.prepare("SELECT document_json FROM app_document").get()
        .document_json,
    );
    assert.deepEqual(restored.categories.map(c => c.uuid), document.categories.map(c => c.uuid));
    assert.deepEqual(restored.budgets[0].categories, ["category-dining", "category-coffee"]);
    assert.equal(restored.transactions[0].category, "category-income");
    assert.equal(restored.transactions[1].category, "category-coffee");
  } finally {
    sqlite.close();
    assert.equal(
      path.dirname(path.resolve(directory)),
      path.resolve(os.tmpdir()),
    );
    assert.ok(
      path.basename(directory).startsWith("budget-categories-refresh-"),
    );
    fs.rmSync(directory, { recursive: true, force: true });
  }
});

test("upgrades preserve a legacy Project Aurora category and its transaction references", async () => {
  const os = require("node:os");
  const directory = fs.mkdtempSync(
    path.join(os.tmpdir(), "budget-categories-aurora-"),
  );
  const filename = path.join(directory, "categories.db");
  let sqlite = new DatabaseSync(filename);
  const adapter = {
    execAsync: async (sql) => sqlite.exec(sql),
    getAllAsync: async (sql, ...params) => sqlite.prepare(sql).all(...params),
    getFirstAsync: async (sql, ...params) => sqlite.prepare(sql).get(...params),
    runAsync: async (sql, ...params) => sqlite.prepare(sql).run(...params),
    withExclusiveTransactionAsync: async (work) => {
      sqlite.exec("BEGIN");
      try {
        await work(adapter);
        sqlite.exec("COMMIT");
      } catch (error) {
        sqlite.exec("ROLLBACK");
        throw error;
      }
    },
  };
  try {
    sqlite.exec(
      "CREATE TABLE app_document (id INTEGER PRIMARY KEY, schema_version INTEGER NOT NULL, document_json TEXT NOT NULL, updated_at TEXT NOT NULL); PRAGMA user_version = 9;",
    );
    const document = createDefaultBackup();
    document._local.schemaVersion = 9;
    // Simulate a v9 install: the previous 19-category default set, still with Project Aurora.
    document.categories = [
      ...document.categories,
      {
        id: 18,
        uuid: "category-project-aurora",
        name: "Project Aurora",
        type: 1,
        icon: "material:corporate_fare",
        iconPath: null,
        color: "#d32f2f",
      },
    ];
    document.transactions = [
      {
        uuid: "tx-aurora",
        account: "account-checking",
        amount: 500,
        type: 1,
        category: "category-project-aurora",
        categoryName: "Project Aurora",
        createdAt: now,
      },
    ];
    sqlite
      .prepare("INSERT INTO app_document VALUES (1, 9, ?, ?)")
      .run(JSON.stringify(document), now);
    await migrateLocalDatabase(adapter);
    sqlite.close();
    sqlite = new DatabaseSync(filename);
    const restored = JSON.parse(
      sqlite.prepare("SELECT document_json FROM app_document").get()
        .document_json,
    );
    assert.equal(restored.categories.length, 19);
    assert.ok(
      restored.categories.some(
        (category) => category.uuid === "category-project-aurora",
      ),
    );
    const auroraTx = restored.transactions.find((t) => t.uuid === "tx-aurora");
    assert.equal(auroraTx.category, "category-project-aurora");
    assert.equal(auroraTx.categoryName, "Project Aurora");
  } finally {
    sqlite.close();
    assert.equal(
      path.dirname(path.resolve(directory)),
      path.resolve(os.tmpdir()),
    );
    assert.ok(path.basename(directory).startsWith("budget-categories-aurora-"));
    fs.rmSync(directory, { recursive: true, force: true });
  }
});

test("partially migrated databases preserve legacy and custom categories", async () => {
  const os = require("node:os");
  const directory = fs.mkdtempSync(
    path.join(os.tmpdir(), "budget-categories-stuck-"),
  );
  const filename = path.join(directory, "categories.db");
  let sqlite = new DatabaseSync(filename);
  const adapter = {
    execAsync: async (sql) => sqlite.exec(sql),
    getAllAsync: async (sql, ...params) => sqlite.prepare(sql).all(...params),
    getFirstAsync: async (sql, ...params) => sqlite.prepare(sql).get(...params),
    runAsync: async (sql, ...params) => sqlite.prepare(sql).run(...params),
    withExclusiveTransactionAsync: async (work) => {
      sqlite.exec("BEGIN");
      try {
        await work(adapter);
        sqlite.exec("COMMIT");
      } catch (error) {
        sqlite.exec("ROLLBACK");
        throw error;
      }
    },
  };
  try {
    // No `currentVersion < N` block will run because user_version is already current.
    sqlite.exec(
      "CREATE TABLE app_document (id INTEGER PRIMARY KEY, schema_version INTEGER NOT NULL, document_json TEXT NOT NULL, updated_at TEXT NOT NULL); PRAGMA user_version = 16;",
    );
    const document = createDefaultBackup();
    document._local.schemaVersion = 16;
    document._local.defaultCategoriesRevision = 0;
    document.categories = [
      { id: 1, uuid: "category-groceries", name: "Groceries", type: 0 },
      { id: 2, uuid: "category-housing", name: "Housing", type: 0 },
      { id: 3, uuid: "category-dining", name: "Dining", type: 0 },
      { id: 4, uuid: "category-coffee", name: "Coffee", type: 0 },
      { id: 5, uuid: "category-income", name: "Income", type: 1 },
      { id: 6, uuid: "category-goals", name: "Savings goals", type: 0 },
      { uuid: "my-custom-category", name: "My custom category", type: 0 },
    ];
    document.transactions = [
      {
        uuid: "tx-salary",
        account: "account-checking",
        amount: 3125,
        type: 1,
        category: "category-income",
        categoryName: "Income",
        createdAt: now,
      },
    ];
    sqlite
      .prepare("INSERT INTO app_document VALUES (1, 12, ?, ?)")
      .run(JSON.stringify(document), now);
    await migrateLocalDatabase(adapter);
    sqlite.close();
    sqlite = new DatabaseSync(filename);
    const restored = JSON.parse(
      sqlite.prepare("SELECT document_json FROM app_document").get()
        .document_json,
    );
    assert.equal(sqlite.prepare("PRAGMA user_version").get().user_version, 20);
    assert.equal(restored.categories.length, 7);
    assert.equal(restored._local.defaultCategoriesRevision, 0);
    assert.ok(
      restored.categories.some(
        (category) => category.uuid === "category-dining",
      ),
    );
    assert.ok(
      restored.categories.some(
        (category) => category.uuid === "my-custom-category",
      ),
    );
    const salaryTx = restored.transactions.find((t) => t.uuid === "tx-salary");
    assert.equal(salaryTx.category, "category-income");
    assert.equal(salaryTx.categoryName, "Income");
  } finally {
    sqlite.close();
    assert.equal(
      path.dirname(path.resolve(directory)),
      path.resolve(os.tmpdir()),
    );
    assert.ok(path.basename(directory).startsWith("budget-categories-stuck-"));
    fs.rmSync(directory, { recursive: true, force: true });
  }
});
