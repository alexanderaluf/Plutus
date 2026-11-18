// Run with: node --test tests/fast-store-index.test.cjs
const fs = require("node:fs");
const path = require("node:path");
const os = require("node:os");
const assert = require("node:assert/strict");
const { performance } = require("node:perf_hooks");
const { test } = require("node:test");
const { DatabaseSync } = require("node:sqlite");
const ts = require("typescript");

const sourceRoot = path.resolve(__dirname, "../src");
require.extensions[".ts"] = (module, filename) => {
  const compiled = ts
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
  module._compile(compiled, filename);
};

const { createDefaultBackup } = require("../src/data/model/default-backup.ts");
const {
  DATABASE_VERSION,
  migrateLocalDatabase,
} = require("../src/data/database/migrations.ts");
const {
  createDocumentReader,
  createWindowedDocumentReader,
  mutateDocument,
  projectUiDocumentAfterCommit,
  writeDocument,
} = require("../src/data/database/document-repository.ts");
const {
  ensurePeriodMonthsLoadedAsync,
  queryScopedTransactionsAsync,
  readIndexedWindowBootstrap,
  selectCatalogCategoryCounts,
} = require("../src/data/database/fast-store-client.ts");
const {
  getDocumentWindowState,
} = require("../src/data/database/month-index.ts");
const {
  selectAccounts,
  selectBudgets,
  selectCategories,
  selectCategoryMonthlyTotals,
  selectHomeOverview,
} = require("../src/data/selectors/document-selectors.ts");
const {
  selectConsumptionReport,
} = require("../src/data/selectors/consumption-report-selectors.ts");
const {
  selectSearchContext,
  searchTransactions,
  DEFAULT_SEARCH_FILTERS,
} = require("../src/data/selectors/search-selectors.ts");
const {
  rankRootCategories,
} = require("../src/features/transactions/transaction-form-helpers.ts");
const {
  createJsonBackupDocument,
} = require("../src/data/backup/document-export.ts");

function createSqliteAdapter(filename = ":memory:") {
  const sql = new DatabaseSync(filename);
  const db = {
    sql,
    databasePath: filename === ":memory:" ? undefined : filename,
    execAsync: async (statement) => {
      sql.exec(statement);
    },
    getFirstAsync: async (statement, ...args) =>
      sql.prepare(statement).get(...args) ?? null,
    getAllAsync: async (statement, ...args) =>
      sql.prepare(statement).all(...args),
    runAsync: async (statement, ...args) =>
      sql.prepare(statement).run(...args),
    withExclusiveTransactionAsync: async (work) => {
      sql.exec("BEGIN IMMEDIATE");
      try {
        await work(db);
        sql.exec("COMMIT");
      } catch (error) {
        sql.exec("ROLLBACK");
        throw error;
      }
    },
  };
  return db;
}

function buildLargeMultiYearDocument(totalTransactions = 20000) {
  const base = createDefaultBackup();
  const profileId = "profile-main";
  const accCash = "acc-cash";
  const accCard = "acc-card";
  const catFood = "cat-food";
  const catCoffee = "cat-coffee";
  const catRent = "cat-rent";
  const catSalary = "cat-salary";

  base.users = [
    {
      uuid: profileId,
      name: "Bench User",
      currency: "USD",
      isDefault: true,
      createdAt: "2022-01-01T00:00:00.000Z",
      updatedAt: "2022-01-01T00:00:00.000Z",
    },
  ];
  base._local.selectedProfileId = profileId;
  base._local.onboardingCompleted = true;
  base._local.dataMode = "production";
  base._local.monthStartDay = 1;

  base.accounts = [
    {
      uuid: accCash,
      name: "Everyday Checking",
      amount: 12500,
      currencyCode: "USD",
      kind: "bank",
      isDefault: true,
      user: profileId,
      createdAt: "2022-01-01T00:00:00.000Z",
      updatedAt: "2022-01-01T00:00:00.000Z",
    },
    {
      uuid: accCard,
      name: "Rewards Card",
      amount: -450,
      currencyCode: "USD",
      kind: "credit",
      user: profileId,
      createdAt: "2022-01-01T00:00:00.000Z",
      updatedAt: "2022-01-01T00:00:00.000Z",
    },
  ];

  base.categories = [
    {
      uuid: catFood,
      name: "Food & Dining",
      icon: "utensils",
      color: "#ff7043",
      type: 0,
      user: profileId,
      createdAt: "2022-01-01T00:00:00.000Z",
      updatedAt: "2022-01-01T00:00:00.000Z",
    },
    {
      uuid: catCoffee,
      name: "Coffee Shops",
      icon: "coffee",
      color: "#8d6e63",
      parent: catFood,
      type: 0,
      user: profileId,
      createdAt: "2022-01-01T00:00:00.000Z",
      updatedAt: "2022-01-01T00:00:00.000Z",
    },
    {
      uuid: catRent,
      name: "Housing",
      icon: "home",
      color: "#5c6bc0",
      type: 0,
      user: profileId,
      createdAt: "2022-01-01T00:00:00.000Z",
      updatedAt: "2022-01-01T00:00:00.000Z",
    },
    {
      uuid: catSalary,
      name: "Salary",
      icon: "cash",
      color: "#66bb6a",
      type: 1,
      user: profileId,
      createdAt: "2022-01-01T00:00:00.000Z",
      updatedAt: "2022-01-01T00:00:00.000Z",
    },
  ];

  base.budgets = [
    {
      uuid: "budget-monthly-food",
      name: "Monthly Dining",
      amount: 1200,
      period: "Monthly",
      transactionType: 0,
      categories: [catFood],
      includeSubcategories: true,
      showOnHome: true,
      user: profileId,
      currencyCode: "USD",
      createdAt: "2022-01-01T00:00:00.000Z",
      updatedAt: "2022-01-01T00:00:00.000Z",
    },
  ];

  // Spread across 48 consecutive UTC calendar months ending 2026-11.
  const transactions = new Array(totalTransactions);
  const anchorYear = 2026;
  const anchorMonth = 10; // November (0-based)
  const expectedCategoryCounts = new Map([
    [catCoffee, 0],
    [catFood, 0],
    [catRent, 0],
    [catSalary, 0],
  ]);

  for (let i = 0; i < totalTransactions; i++) {
    const monthBack = i % 48;
    const totalMonths = anchorYear * 12 + anchorMonth - monthBack;
    const year = Math.floor(totalMonths / 12);
    const month = totalMonths % 12;
    const day = ((i * 7) % 27) + 1;
    const hour = (i * 3) % 24;
    const iso = new Date(
      Date.UTC(year, month, day, hour, i % 60, 0),
    ).toISOString();

    const kindSlot = i % 10;
    const isIncome = kindSlot === 9;
    const categoryId = isIncome
      ? catSalary
      : kindSlot < 4
        ? catCoffee
        : kindSlot < 8
          ? catFood
          : catRent;
    const accountId = i % 3 === 0 ? accCard : accCash;
    expectedCategoryCounts.set(
      categoryId,
      (expectedCategoryCounts.get(categoryId) ?? 0) + 1,
    );

    const hasReceipt = i % 25 === 0;
    const isMatch = i === 12345;

    transactions[i] = {
      uuid: `tx-${i}`,
      name: isMatch
        ? "Espresso Vintage 2023"
        : isIncome
          ? `Paycheck #${i}`
          : categoryId === catCoffee
            ? `Latte #${i}`
            : categoryId === catFood
              ? `Bistro #${i}`
              : `Rent #${i}`,
      description: i % 5 === 0 ? `Memo item ${i}` : "",
      amount: isIncome ? 4200 : Number((5.5 + (i % 73)).toFixed(2)),
      type: isIncome ? 1 : 0,
      currencyCode: "USD",
      time: iso,
      createdAt: iso,
      updatedAt: iso,
      account: accountId,
      category: categoryId,
      user: profileId,
      tags: [],
      ...(hasReceipt
        ? { receiptPath: `attachments/receipt-${i}.jpg` }
        : {}),
    };
  }

  base.transactions = transactions;
  base.customExtension = { preserve: true, version: 3 };
  return { document: base, expectedCategoryCounts };
}

test("v25 migration builds month index tables for established pre-v25 DBs", async () => {
  const db = createSqliteAdapter();
  try {
    const initial = createDefaultBackup();
    initial.users = [{ uuid: "u-1", name: "Pat", currency: "USD" }];
    initial._local.selectedProfileId = "u-1";
    initial._local.schemaVersion = 24;
    initial.transactions = [
      {
        uuid: "tx-a",
        name: "Coffee",
        amount: 5,
        type: 0,
        time: "2026-10-12T10:00:00.000Z",
        createdAt: "2026-10-12T10:00:00.000Z",
        updatedAt: "2026-10-12T10:00:00.000Z",
        account: "acc-1",
        category: initial.categories[0]?.uuid ?? "cat-1",
        user: "u-1",
      },
      {
        uuid: "tx-b",
        name: "Groceries",
        amount: 42,
        type: 0,
        time: "2025-04-03T10:00:00.000Z",
        createdAt: "2025-04-03T10:00:00.000Z",
        updatedAt: "2025-04-03T10:00:00.000Z",
        account: "acc-1",
        category: initial.categories[0]?.uuid ?? "cat-1",
        user: "u-1",
      },
    ];

    db.sql.exec(`
      CREATE TABLE app_document (
        id INTEGER PRIMARY KEY NOT NULL,
        schema_version INTEGER NOT NULL,
        document_json TEXT NOT NULL,
        updated_at TEXT NOT NULL
      );
      CREATE TABLE app_storage_identity (
        id INTEGER PRIMARY KEY CHECK (id = 1),
        had_profile INTEGER NOT NULL DEFAULT 0
      );
      PRAGMA user_version = 24;
    `);
    db.sql
      .prepare("INSERT INTO app_document VALUES (1, 24, ?, ?)")
      .run(JSON.stringify(initial), "2026-10-12T10:00:00.000Z");
    db.sql.prepare("INSERT INTO app_storage_identity VALUES (1, 1)").run();

    await migrateLocalDatabase(db);

    const versionRow = await db.getFirstAsync("PRAGMA user_version");
    assert.equal(versionRow.user_version, DATABASE_VERSION);
    assert.ok(DATABASE_VERSION >= 25);

    const monthCount = await db.getFirstAsync(
      "SELECT COUNT(*) AS count FROM app_month_index",
    );
    assert.equal(monthCount.count, 2);

    const rowCount = await db.getFirstAsync(
      "SELECT COUNT(*) AS count FROM tx_month_rows",
    );
    assert.equal(rowCount.count, 2);

    const headRow = await db.getFirstAsync(
      "SELECT schema_version, had_profile, tx_count, revision FROM app_meta_head WHERE id = 1",
    );
    assert.equal(headRow.schema_version, DATABASE_VERSION);
    assert.equal(headRow.had_profile, 1);
    assert.equal(headRow.tx_count, 2);
    assert.ok(headRow.revision >= 1);

    // Second run hits fast verifyFastCurrentDatabase path without rebuilding
    await migrateLocalDatabase(db);
    const monthCountAfter = await db.getFirstAsync(
      "SELECT COUNT(*) AS count FROM app_month_index",
    );
    assert.equal(monthCountAfter.count, 2);
  } finally {
    db.sql.close();
  }
});

test("20,000-tx 48-month partitioning: instant windowed bootstrap, LRU bounds, selector parity, dirty sync, & full backup", async () => {
  const db = createSqliteAdapter();
  try {
    const now = new Date(Date.UTC(2026, 10, 14, 12, 0, 0)); // 2026-11-14
    await migrateLocalDatabase(db);

    const { document: fullInput, expectedCategoryCounts } =
      buildLargeMultiYearDocument(20000);
    const fullDoc = await writeDocument(db, fullInput);

    // 1. Windowed bootstrap loads ONLY current + previous month window into RAM
    const bootStart = performance.now();
    const windowed = await createWindowedDocumentReader(db)(now);
    const bootMs = performance.now() - bootStart;

    const state = getDocumentWindowState(windowed);
    assert.ok(state, "expected DocumentWindowState on bootstrapped doc");
    assert.equal(state.isPartial, true);
    assert.equal(state.totalTransactionCount, 20000);
    assert.equal(state.catalog.length, 48);
    assert.ok(
      windowed.transactions.length > 0 &&
        windowed.transactions.length < 1500,
      `expected small active window, got ${windowed.transactions.length} txs`,
    );
    assert.equal(windowed.customExtension?.preserve, true);
    assert.ok(
      bootMs < 150,
      `expected fast JS SQLite windowed bootstrap (< 150ms), took ${bootMs.toFixed(2)}ms`,
    );

    // 2. Pre-aggregated category counts match all 20,000 rows instantaneously
    const catCountStart = performance.now();
    const catalogCounts = selectCatalogCategoryCounts(windowed);
    const catCountMs = performance.now() - catCountStart;
    assert.ok(catalogCounts);
    for (const [catId, expected] of expectedCategoryCounts) {
      assert.equal(catalogCounts.get(catId), expected);
    }
    assert.ok(catCountMs < 5, `selectCatalogCategoryCounts took ${catCountMs.toFixed(2)}ms`);

    const categories = selectCategories(windowed);
    assert.deepEqual(
      rankRootCategories(windowed, categories, 0).map((c) => c.id),
      rankRootCategories(fullDoc, selectCategories(fullDoc), 0).map((c) => c.id),
    );

    const assertNearlyEqual = (actual, expected, pathLabel = "root") => {
      if (typeof actual === "number" && typeof expected === "number") {
        assert.ok(
          Math.abs(actual - expected) <= 1e-9,
          `${pathLabel}: expected ${expected}, got ${actual}`,
        );
        return;
      }
      if (actual instanceof Map && expected instanceof Map) {
        assert.equal(actual.size, expected.size, `${pathLabel}.size`);
        for (const [key, val] of expected) {
          assert.ok(actual.has(key), `${pathLabel} missing key ${String(key)}`);
          assertNearlyEqual(actual.get(key), val, `${pathLabel}[${String(key)}]`);
        }
        return;
      }
      if (Array.isArray(actual) && Array.isArray(expected)) {
        assert.equal(actual.length, expected.length, `${pathLabel}.length`);
        for (let i = 0; i < expected.length; i++) {
          assertNearlyEqual(actual[i], expected[i], `${pathLabel}[${i}]`);
        }
        return;
      }
      if (
        actual &&
        expected &&
        typeof actual === "object" &&
        typeof expected === "object"
      ) {
        const keys = new Set([
          ...Object.keys(actual),
          ...Object.keys(expected),
        ]);
        for (const k of keys) {
          assertNearlyEqual(actual[k], expected[k], `${pathLabel}.${k}`);
        }
        return;
      }
      assert.deepEqual(actual, expected, pathLabel);
    };

    // 3. Selector accuracy & speed across Home, Accounts, Categories, Reports, Budgets
    const homeWin = selectHomeOverview(windowed, "USD", now);
    const homeFull = selectHomeOverview(fullDoc, "USD", now);
    assertNearlyEqual(homeWin, homeFull, "home");

    const accWinStart = performance.now();
    const accWin = selectAccounts(windowed, now);
    const accWinMs = performance.now() - accWinStart;
    const accFull = selectAccounts(fullDoc, now);
    assertNearlyEqual(accWin, accFull, "accounts");

    const catWin = selectCategoryMonthlyTotals(windowed, now);
    const catFull = selectCategoryMonthlyTotals(fullDoc, now);
    assertNearlyEqual(catWin, catFull, "categories");

    const repWinStart = performance.now();
    const repWin = selectConsumptionReport(windowed, "USD", now, 0);
    const repWinMs = performance.now() - repWinStart;
    const repFull = selectConsumptionReport(fullDoc, "USD", now, 0);
    assertNearlyEqual(repWin, repFull, "report");

    const budWin = selectBudgets(windowed, now);
    const budFull = selectBudgets(fullDoc, now);
    assert.equal(budWin[0].tracked, budFull[0].tracked);
    assert.equal(budWin[0].limit, budFull[0].limit);

    console.log(
      `   JS_SELECTOR_BENCH bootMs=${bootMs.toFixed(2)} accWinMs=${accWinMs.toFixed(2)} repWinMs=${repWinMs.toFixed(2)}`,
    );
    assert.ok(
      accWinMs < 100 && repWinMs < 100,
      `expected <100ms even under suite contention, got acc=${accWinMs.toFixed(2)}ms rep=${repWinMs.toFixed(2)}ms`,
    );

    // 4. Scoped queries pull all 48 months cleanly for one account or category
    const cardScoped = await queryScopedTransactionsAsync(windowed, {
      kind: "account",
      ids: ["acc-card"],
    });
    assert.ok(cardScoped && cardScoped.length > 6000);
    assert.equal(
      cardScoped.length,
      fullDoc.transactions.filter((t) => t.account === "acc-card").length,
    );

    const salaryScoped = await queryScopedTransactionsAsync(windowed, {
      kind: "category",
      ids: ["cat-salary"],
    });
    assert.equal(salaryScoped?.length, 2000);

    // 5. Expanding cold historical periods respects MAX_LOADED_WINDOW_MONTHS = 6
    let cursorDoc = windowed;
    for (let monthsBack = 3; monthsBack <= 30; monthsBack += 3) {
      const mStart = new Date(Date.UTC(2026, 10 - monthsBack, 1));
      const mEnd = new Date(Date.UTC(2026, 11 - monthsBack, 1));
      cursorDoc = await ensurePeriodMonthsLoadedAsync(cursorDoc, mStart, mEnd);
      const nextState = getDocumentWindowState(cursorDoc);
      assert.ok(
        nextState.loadedMonthKeys.size <= 6,
        `expected <= 6 loaded months, got ${nextState.loadedMonthKeys.size}`,
      );
    }

    // 6. Incremental mutation updates single dirty month cleanly and preserves totals
    const beforeTotal = state.totalTransactionCount;
    const mutateStart = performance.now();
    const updatedFull = await mutateDocument(db, (current) => ({
      ...current,
      transactions: [
        ...current.transactions,
        {
          uuid: "tx-incremental-new",
          name: "Matcha",
          amount: 7.5,
          type: 0,
          currencyCode: "USD",
          time: "2026-11-14T08:00:00.000Z",
          createdAt: "2026-11-14T08:00:00.000Z",
          updatedAt: "2026-11-14T08:00:00.000Z",
          account: "acc-cash",
          category: "cat-coffee",
          user: "profile-main",
          tags: [],
        },
      ],
    }));
    const projectedAfter = projectUiDocumentAfterCommit(db, updatedFull, windowed);
    const mutateMs = performance.now() - mutateStart;

    const afterState = getDocumentWindowState(projectedAfter);
    assert.equal(afterState.totalTransactionCount, beforeTotal + 1);
    assert.equal(afterState.revision, state.revision + 1);
    assert.equal(
      selectCatalogCategoryCounts(projectedAfter).get("cat-coffee"),
      expectedCategoryCounts.get("cat-coffee") + 1,
    );
    console.log(`   JS_DIRTY_MUTATE mutateMs=${mutateMs.toFixed(2)}`);
    assert.ok(mutateMs < 750, `dirty mutation took ${mutateMs.toFixed(2)}ms`);

    // 7. Full canonical export still returns every record + preserves unknown keys
    const canonical = await createDocumentReader(db)();
    assert.equal(canonical.transactions.length, 20001);
    const exportedJson = createJsonBackupDocument(canonical);
    assert.equal(exportedJson.transactions.length, 20001);
    assert.equal(exportedJson.customExtension?.preserve, true);
  } finally {
    db.sql.close();
  }
});

// ---------------------------------------------------------------------------
// Regression tests for the 2026-11 production "database is locked" / crash
// incident. Read docs/database-safety.md before changing or removing these.
// ---------------------------------------------------------------------------

const nextTick = () => new Promise((resolve) => setImmediate(resolve));

/**
 * Models expo-sqlite closely enough to reproduce lock contention: a
 * long-lived provider connection plus a NEW connection per
 * withExclusiveTransactionAsync (deferred BEGIN, no busy timeout), and every
 * call yields like a native async hop so concurrent work interleaves.
 */
function createMultiConnectionAdapter() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "plutus-db-safety-"));
  const filename = path.join(dir, "budget-manager.db");
  const wrap = (sql) => ({
    sql,
    databasePath: filename,
    execAsync: async (statement) => {
      await nextTick();
      sql.exec(statement);
    },
    getFirstAsync: async (statement, ...args) => {
      await nextTick();
      return sql.prepare(statement).get(...args) ?? null;
    },
    getAllAsync: async (statement, ...args) => {
      await nextTick();
      return sql.prepare(statement).all(...args);
    },
    runAsync: async (statement, ...args) => {
      await nextTick();
      return sql.prepare(statement).run(...args);
    },
  });
  const main = wrap(new DatabaseSync(filename));
  main.withExclusiveTransactionAsync = async (work) => {
    const connection = wrap(new DatabaseSync(filename));
    try {
      await connection.execAsync("BEGIN");
      try {
        await work(connection);
        await connection.execAsync("COMMIT");
      } catch (error) {
        try {
          connection.sql.exec("ROLLBACK");
        } catch {
          /* already rolled back */
        }
        throw error;
      }
    } finally {
      connection.sql.close();
    }
  };
  main.dispose = () => {
    main.sql.close();
    try {
      fs.rmSync(dir, { recursive: true, force: true });
    } catch {
      // A failed run can leave a transaction connection open (Windows EBUSY);
      // never let cleanup hide the assertion that actually failed.
    }
  };
  return main;
}

function newTransaction(uuid, iso, extra = {}) {
  return {
    uuid,
    name: `Item ${uuid}`,
    amount: 3.25,
    type: 0,
    currencyCode: "USD",
    time: iso,
    createdAt: iso,
    updatedAt: iso,
    account: "acc-cash",
    category: "cat-coffee",
    user: "profile-main",
    tags: [],
    ...extra,
  };
}

test("ungated concurrent expo-style transactions reproduce 'database is locked'", async () => {
  const db = createMultiConnectionAdapter();
  try {
    await migrateLocalDatabase(db);
    const results = await Promise.allSettled(
      Array.from({ length: 4 }, () =>
        db.withExclusiveTransactionAsync(async (txn) => {
          await txn.getFirstAsync("SELECT document_json FROM app_document WHERE id = 1");
          await txn.runAsync(
            "UPDATE app_storage_identity SET had_profile = had_profile WHERE id = 1",
          );
        }),
      ),
    );
    assert.ok(
      results.some(
        (result) =>
          result.status === "rejected" &&
          /locked|busy/i.test(String(result.reason?.message)),
      ),
      "the adapter must model real lock contention, or the next test proves nothing",
    );
  } finally {
    db.dispose();
  }
});

test("all writers share one gate: concurrent saves and startup migration never hit 'database is locked'", async () => {
  const db = createMultiConnectionAdapter();
  try {
    await migrateLocalDatabase(db);
    const { document } = buildLargeMultiYearDocument(1200);
    await writeDocument(db, document);

    const saves = Array.from({ length: 6 }, (_, i) =>
      mutateDocument(db, (current) => ({
        ...current,
        transactions: [
          ...current.transactions,
          newTransaction(`tx-concurrent-${i}`, `2026-11-1${i}T09:00:00.000Z`),
        ],
      })),
    );
    // The foreground SQLiteProvider and the headless recurring task both migrate.
    const startup = migrateLocalDatabase(db, true);
    await Promise.all([...saves, startup]);

    const canonical = await createDocumentReader(db)();
    for (let i = 0; i < 6; i++) {
      assert.ok(
        canonical.transactions.some((tx) => tx.uuid === `tx-concurrent-${i}`),
        `save ${i} must not be lost`,
      );
    }
    const rows = await db.getFirstAsync("SELECT COUNT(*) AS count FROM tx_month_rows");
    assert.equal(rows.count, 1206);
    const mmap = await db.getFirstAsync("PRAGMA mmap_size");
    assert.equal(Object.values(mmap)[0], 0, "mmap must stay disabled (SIGBUS crash risk)");
  } finally {
    db.dispose();
  }
});

test("a single-record save rewrites only the month it touched, not the whole index", async () => {
  const db = createSqliteAdapter();
  try {
    await migrateLocalDatabase(db);
    const { document } = buildLargeMultiYearDocument(2400);
    await writeDocument(db, document);
    const baseRevision = (
      await db.getFirstAsync("SELECT revision FROM app_meta_head WHERE id = 1")
    ).revision;

    const touchedMonths = async () => {
      const head = await db.getFirstAsync("SELECT revision FROM app_meta_head WHERE id = 1");
      const rows = await db.getAllAsync(
        "SELECT month_key FROM app_month_index WHERE revision = ? ORDER BY month_key",
        head.revision,
      );
      return rows.map((row) => row.month_key);
    };

    // Create
    await mutateDocument(db, (current) => ({
      ...current,
      transactions: [
        ...current.transactions,
        newTransaction("tx-new", "2026-11-14T08:00:00.000Z"),
      ],
    }));
    assert.deepEqual(await touchedMonths(), ["2026-11"]);

    // Edit an existing record in an older month
    await mutateDocument(db, (current) => ({
      ...current,
      transactions: current.transactions.map((tx) =>
        tx.uuid === "tx-47" ? { ...tx, amount: 999 } : tx,
      ),
    }));
    const editedMonths = await touchedMonths();
    assert.equal(editedMonths.length, 1, `edit touched ${editedMonths.join(",")}`);

    // A save that changes no transactions rewrites no month rows
    await mutateDocument(db, (current) => ({
      ...current,
      _local: { ...current._local },
    }));
    assert.deepEqual(await touchedMonths(), []);

    // Renaming a category changes search_text, so every month is re-indexed
    await mutateDocument(db, (current) => ({
      ...current,
      categories: current.categories.map((category) =>
        category.uuid === "cat-coffee" ? { ...category, name: "Cafés" } : category,
      ),
    }));
    assert.equal((await touchedMonths()).length, 48);
    const renamed = await db.getFirstAsync(
      "SELECT COUNT(*) AS count FROM tx_month_rows WHERE category_id = 'cat-coffee' AND search_text LIKE '%cafes%'",
    );
    assert.ok(renamed.count > 0);

    const head = await db.getFirstAsync("SELECT revision FROM app_meta_head WHERE id = 1");
    assert.equal(head.revision, baseRevision + 4);
  } finally {
    db.sql.close();
  }
});

test("emoji names keep the startup fast path: head.doc_bytes uses SQLite length()", async () => {
  const db = createSqliteAdapter();
  try {
    await migrateLocalDatabase(db);
    const { document } = buildLargeMultiYearDocument(200);
    document.categories[0].name = "Food 🍔 & 🍕";
    await writeDocument(db, document);

    const sizes = await db.getFirstAsync(
      "SELECT h.doc_bytes AS head_bytes, length(d.document_json) AS doc_bytes FROM app_meta_head h, app_document d",
    );
    assert.equal(sizes.head_bytes, sizes.doc_bytes);

    const before = (await db.getFirstAsync("SELECT revision FROM app_meta_head")).revision;
    await migrateLocalDatabase(db, true);
    const after = (await db.getFirstAsync("SELECT revision FROM app_meta_head")).revision;
    assert.equal(after, before, "startup must not rebuild the index on every launch");
  } finally {
    db.sql.close();
  }
});

test("storage safety guards: no second SQLite engine, no mmap, one write gate", () => {
  const root = path.resolve(__dirname, "..");
  const skip = new Set(["node_modules", "build", ".gradle", ".cxx", "Pods"]);
  const walk = (dir, files = []) => {
    if (!fs.existsSync(dir)) return files;
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      if (skip.has(entry.name)) continue;
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) walk(full, files);
      else files.push(full);
    }
    return files;
  };

  // 1. Native modules must never open the app database with another SQLite copy.
  const nativeFiles = walk(path.join(root, "modules")).filter((file) =>
    /\.(kt|java|swift|m|mm|c|cc|cpp|h|hpp|podspec|gradle|txt)$/.test(file),
  );
  for (const file of nativeFiles) {
    const text = fs.readFileSync(file, "utf8");
    assert.ok(
      !/sqlite|budget-manager\.db/i.test(text),
      `${path.relative(root, file)} touches SQLite; only expo-sqlite may open budget-manager.db`,
    );
  }

  const sourceFiles = walk(path.join(root, "src")).filter((file) =>
    /\.(ts|tsx)$/.test(file),
  );
  for (const file of sourceFiles) {
    const relative = path.relative(root, file).split(path.sep).join("/");
    const text = fs.readFileSync(file, "utf8");
    // 2. Memory-mapped I/O turns I/O errors into SIGBUS crashes.
    for (const match of text.matchAll(/mmap_size\s*=\s*(\d+)/g)) {
      assert.equal(match[1], "0", `${relative} enables PRAGMA mmap_size`);
    }
    // 3. Only the write gate and the gated migration may open write transactions.
    if (
      relative !== "src/data/database/write-transaction.ts" &&
      relative !== "src/data/database/migrations.ts"
    ) {
      assert.ok(
        !/withExclusiveTransactionAsync\s*\(|withTransactionAsync\s*\(/.test(text),
        `${relative} opens a write transaction outside runWriteTransaction`,
      );
    }
    // 4. Nothing may switch journal mode away from WAL.
    for (const match of text.matchAll(/journal_mode\s*=\s*([A-Za-z]+)/g)) {
      assert.equal(
        match[1].toUpperCase(),
        "WAL",
        `${relative} changes journal_mode away from WAL`,
      );
    }
    // 5. Only the headless task opens its own connection (behind the gate).
    if (relative !== "src/data/recurring/recurring-background.ts") {
      assert.ok(
        !/openDatabase(Async|Sync)\s*\(/.test(text),
        `${relative} opens its own database connection`,
      );
    }
  }
});
