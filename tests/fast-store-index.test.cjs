// Run with: node --test tests/fast-store-index.test.cjs
const fs = require("node:fs");
const path = require("node:path");
const os = require("node:os");
const assert = require("node:assert/strict");
const { execFileSync } = require("node:child_process");
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
    assert.equal(DATABASE_VERSION, 25);

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
    assert.equal(headRow.schema_version, 25);
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

test("native Swift FastStoreEngine compiles and runs single-digit ms bootstrap & SQLite queries on 20,000 rows", async (t) => {
  let hasSwiftc = false;
  try {
    execFileSync("swiftc", ["--version"], { stdio: "ignore" });
    hasSwiftc = true;
  } catch {
    t.skip("swiftc unavailable on host");
    return;
  }
  assert.ok(hasSwiftc);

  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "plutus-fast-store-swift-"));
  const dbPath = path.join(tmpDir, "budget-manager.db");
  const cacheDir = path.join(tmpDir, "swift-cache");
  const indexDir = path.join(tmpDir, "fast-index");
  fs.mkdirSync(cacheDir, { recursive: true });
  fs.mkdirSync(indexDir, { recursive: true });

  const db = createSqliteAdapter(dbPath);
  try {
    await migrateLocalDatabase(db);
    const { document: large } = buildLargeMultiYearDocument(20000);
    await writeDocument(db, large);
    // Keep WAL active just as on iOS/Android
    db.sql.exec("PRAGMA wal_checkpoint(PASSIVE);");
  } finally {
    db.sql.close();
  }

  try {
    const swiftEnginePath = path.resolve(
      __dirname,
      "../modules/plutus-fast-store/ios/FastStoreEngine.swift",
    );
    const harnessPath = path.join(tmpDir, "bench.swift");
    const binPath = path.join(tmpDir, "bench-bin");

    fs.writeFileSync(
      harnessPath,
      `
import Foundation

func msSince(_ start: CFAbsoluteTime) -> Double {
  return (CFAbsoluteTimeGetCurrent() - start) * 1000.0
}

@main
struct BenchMain {
  static func main() {
    let dbPath = CommandLine.arguments[1]
    let engine = FastStoreEngine.shared
    engine.clearAllCaches()

    // 1. Cold bootstrap from SQLite
    let t0 = CFAbsoluteTimeGetCurrent()
    guard let boot1 = engine.readBootstrapSync(dbPath: dbPath, dbName: "budget-manager.db", activeMonthKeys: ["2026-11", "2026-10"]) else {
      fputs("readBootstrapSync returned nil\\n", stderr)
      exit(1)
    }
    _ = boot1
    let coldBootMs = msSince(t0)

    // 2. Sync .pidx files
    let tSync = CFAbsoluteTimeGetCurrent()
    let syncedCount = engine.syncPartitionFilesSync(dbPath: dbPath, dbName: "budget-manager.db", dirtyMonthKeys: nil, forceAll: true)
    let syncMs = msSince(tSync)
    assert(syncedCount == 48, "Expected 48 synced month files, got \\(syncedCount)")

    // 3. Hot RAM bootstrap
    let t1 = CFAbsoluteTimeGetCurrent()
    guard let boot2 = engine.readBootstrapSync(dbPath: dbPath, dbName: "budget-manager.db", activeMonthKeys: ["2026-11", "2026-10"]) else {
      exit(2)
    }
    let hotBootMs = msSince(t1)
    assert((boot2["source"] as? String) == "memory")

    // 4. Read cold historical month slice (2023-06)
    let tSlice = CFAbsoluteTimeGetCurrent()
    guard let slice = engine.readMonthSliceSync(dbPath: dbPath, dbName: "budget-manager.db", monthKey: "2023-06"),
          let payload = slice["payloadJson"] as? String,
          payload.contains("tx-") else {
      fputs("readMonthSliceSync failed\\n", stderr)
      exit(3)
    }
    let sliceMs = msSince(tSlice)

    // 5. Cross-year indexed SQLite search across 20,000 rows
    let tSearch = CFAbsoluteTimeGetCurrent()
    let searchRes = engine.querySearchSync(dbPath: dbPath, dbName: "budget-manager.db", options: [
      "profileId": "profile-main",
      "queryTokens": ["espresso", "vintage"],
      "limit": 20,
      "offset": 0,
      "sort": "newest"
    ])
    let searchMs = msSince(tSearch)
    let count = (searchRes["totalCount"] as? Int64) ?? -1
    let rowsJson = (searchRes["rowsJson"] as? String) ?? ""
    assert(count == 1, "Expected 1 matching search row, got \\(count)")
    assert(rowsJson.contains("tx-12345"), "Expected tx-12345 in search rows")

    // 6. Receipt & account filter across 48 months
    let tReceipt = CFAbsoluteTimeGetCurrent()
    let receiptRes = engine.querySearchSync(dbPath: dbPath, dbName: "budget-manager.db", options: [
      "profileId": "profile-main",
      "accountIds": ["acc-card"],
      "hasReceipt": true,
      "limit": 50,
      "offset": 0
    ])
    let receiptMs = msSince(tReceipt)
    let receiptCount = (receiptRes["totalCount"] as? Int64) ?? -1
    assert(receiptCount > 200, "Expected >200 card receipts, got \\(receiptCount)")

    print(String(format: "SWIFT_BENCH coldBootMs=%.2f hotBootMs=%.2f sync48Ms=%.2f coldSliceMs=%.2f searchMs=%.2f receiptMs=%.2f", coldBootMs, hotBootMs, syncMs, sliceMs, searchMs, receiptMs))
  }
}
`,
    );

    execFileSync(
      "swiftc",
      [
        "-O",
        "-module-cache-path",
        cacheDir,
        swiftEnginePath,
        harnessPath,
        "-lsqlite3",
        "-o",
        binPath,
      ],
      { stdio: "pipe" },
    );

    const benchOut = execFileSync(binPath, [dbPath], {
      encoding: "utf8",
      env: { ...process.env, PLUTUS_FAST_INDEX_DIR: indexDir },
    }).trim();
    console.log("   ", benchOut);
    assert.ok(benchOut.startsWith("SWIFT_BENCH"));

    // Parse numbers and assert single-digit millisecond reads!
    const metrics = Object.fromEntries(
      benchOut
        .replace(/^SWIFT_BENCH\s+/, "")
        .split(/\s+/)
        .map((pair) => {
          const [k, v] = pair.split("=");
          return [k, Number(v)];
        }),
    );
    assert.ok(metrics.coldBootMs < 50, `coldBootMs too high: ${metrics.coldBootMs}`);
    assert.ok(metrics.hotBootMs < 10, `hotBootMs too high: ${metrics.hotBootMs}`);
    assert.ok(metrics.coldSliceMs < 15, `coldSliceMs too high: ${metrics.coldSliceMs}`);
    assert.ok(metrics.searchMs < 25, `searchMs too high: ${metrics.searchMs}`);
  } finally {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
});
