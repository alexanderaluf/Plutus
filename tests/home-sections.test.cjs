const fs = require("node:fs");
const path = require("node:path");
const assert = require("node:assert/strict");
const { test } = require("node:test");
const ts = require("typescript");
const root = path.resolve(__dirname, "../src");
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
      (_, relative) => `require(${JSON.stringify(path.join(root, relative))})`,
    );
  module._compile(source, filename);
};
const { createDefaultBackup } = require("../src/data/model/default-backup.ts");
const { budgetDefaults } = require("../src/data/model/budget-record.ts");
const { selectBudgets } = require("../src/data/selectors/budget-selectors.ts");
const {
  selectCategories,
  selectCategoryMonthlyTotals,
} = require("../src/data/selectors/category-selectors.ts");
const {
  createTransactionIndex,
} = require("../src/data/selectors/transaction-selectors.ts");
const { recurringDefaults } = require("../src/data/model/recurring-record.ts");
const {
  createHomeCategoryRows,
  createHomeSectionLoader,
} = require("../src/data/selectors/home-section-selectors.ts");
const now = new Date(2026, 8, 16, 12);
function fixture() {
  const document = createDefaultBackup();
  document.users = [
    { uuid: "me", id: 1, currency: "USD" },
    { uuid: "other", id: 2, currency: "ILS" },
  ];
  document._local.selectedProfileId = "me";
  document.categories = [
    { uuid: "root", id: 10, user: 1, name: "Food", type: 0 },
    { uuid: "child", id: 11, user: 1, parentId: 10, type: 0 },
    { uuid: "grandchild", user: "me", parentId: 11, type: 0 },
    { uuid: "foreign", user: 2, type: 0 },
  ];
  document.accounts = [{ uuid: "bank", id: 20, user: 1, currencyCode: "USD" }];
  document.transactions = [
    {
      uuid: "tx",
      user: 1,
      account: 20,
      category: "grandchild",
      amount: 25,
      type: 0,
      date: now.toISOString(),
    },
  ];
  document.budgets = [
    {
      ...budgetDefaults("USD"),
      uuid: "shown",
      user: 1,
      amount: "500",
      categories: [10],
      showOnHome: true,
    },
    {
      ...budgetDefaults("USD"),
      uuid: "hidden",
      user: 1,
      amount: "500",
      categories: [10],
      showOnHome: false,
    },
  ];
  document.recurrings = [
    {
      ...recurringDefaults(now),
      uuid: "rent",
      user: 1,
      account: 20,
      category: 11,
      amount: 100,
      type: 0,
      startAt: new Date(2026, 8, 17, 10).toISOString(),
      nextIndex: 0,
    },
  ];
  return document;
}

test("home category rows retain hierarchy, orphan and cyclic imports without recursive rendering", () => {
  const document = fixture();
  document.categories.push(
    { uuid: "orphan", parentId: "missing" },
    { uuid: "cycle-a", parentId: "cycle-b" },
    { uuid: "cycle-b", parentId: "cycle-a" },
  );
  const rows = createHomeCategoryRows(selectCategories(document));
  assert.deepEqual(
    rows.map(({ id, depth }) => [id, depth]),
    [
      ["root", 0],
      ["child", 1],
      ["grandchild", 2],
      ["orphan", 0],
      ["cycle-a", 0],
      ["cycle-b", 1],
    ],
  );
  assert.deepEqual(
    rows.filter((row) => row.last).map((row) => row.id),
    ["grandchild", "orphan", "cycle-b"],
  );
  document.categories = Array.from({ length: 3000 }, (_, i) => ({
    uuid: `deep-${i}`,
    parentId: i ? `deep-${i - 1}` : null,
  }));
  const deepRows = createHomeCategoryRows(selectCategories(document));
  assert.equal(deepRows.length, 3000);
  assert.equal(deepRows.at(-1).depth, 2999);
  assert.equal(deepRows.at(-1).last, true);
});

test("derived section caches preserve totals and canonical data, and new documents get fresh values", () => {
  const document = fixture();
  const original = JSON.stringify(document);
  const load = createHomeSectionLoader(document, now);
  const categories = load("categories");
  assert.equal(categories.totals.get("root").amounts.USD, 25);
  assert.equal(categories.totals.get("child").count, 1);
  assert.equal(categories.rows.length, 3);
  assert.equal(load("categories"), categories);
  const recurring = load("recurring");
  assert.equal(recurring.rows.length, 1);
  assert.deepEqual(recurring.remaining, [{ currencyCode: "USD", amount: 100 }]);
  assert.equal(recurring.rows[0].event.recurring.accountName, "No account");
  assert.equal(load("recurring"), recurring);
  assert.equal(load("budgets"), load("budgets"));
  assert.equal(JSON.stringify(document), original);
  const next = {
    ...document,
    transactions: document.transactions.map((transaction) => ({
      ...transaction,
      amount: 75,
    })),
  };
  assert.equal(
    createHomeSectionLoader(next, now)("categories").totals.get("root").amounts
      .USD,
    75,
  );
  const otherProfile = {
    ...document,
    _local: { ...document._local, selectedProfileId: "other" },
  };
  assert.deepEqual(
    createHomeSectionLoader(
      otherProfile,
      now,
    )("categories").rows.map((row) => row.id),
    ["foreign"],
  );
  assert.equal(
    createHomeSectionLoader(
      document,
      new Date(2026, 9, 16),
    )("categories").totals.get("root").count,
    0,
  );
});

test("category paging reuses the date index and never rescans older transaction history", () => {
  const document = fixture();
  let oldDateReads = 0;
  const old = Array.from(
    { length: 10000 },
    (_, i) =>
      new Proxy(
        {
          uuid: `old-${i}`,
          user: 1,
          account: 20,
          category: "grandchild",
          type: 0,
          amount: 100,
          date: new Date(2025, 0, 1).toISOString(),
        },
        {
          get(target, key) {
            if (key === "date") oldDateReads++;
            return target[key];
          },
        },
      ),
  );
  document._local.monthStartDay = 10;
  document.transactions.push(
    ...old,
    {
      ...document.transactions[0],
      uuid: "before-financial-month",
      amount: 5,
      date: new Date(2026, 8, 6).toISOString(),
    },
    {
      ...document.transactions[0],
      uuid: "foreign-transaction",
      user: 2,
      amount: 1000,
    },
  );
  const expected = selectCategoryMonthlyTotals(document, now);
  const index = createTransactionIndex(document);
  oldDateReads = 0;
  const data = createHomeSectionLoader(document, now, index)("categories");
  assert.deepEqual(data.totals, expected);
  assert.equal(data.totals.get("root").amounts.USD, 30);
  assert.equal(oldDateReads, 0);
});

test("home budget aggregates match detail calculations and exclude hidden budgets before building cards", () => {
  const document = fixture();
  const detailed = selectBudgets(document, now).find(
    (budget) => budget.id === "shown",
  );
  const data = createHomeSectionLoader(document, now)("budgets");
  assert.deepEqual(
    data.rows.map((row) => row.id),
    ["shown"],
  );
  const summary = data.rows[0].budget;
  for (const field of [
    "tracked",
    "remaining",
    "percent",
    "rollover",
    "dailyPlan",
    "dailyAllowance",
    "excludedCurrencyCount",
    "periodDays",
    "daysLeft",
  ])
    assert.equal(summary[field], detailed[field], field);
  assert.equal(summary.transactionCount, detailed.transactions.length);
  assert.equal(summary.transactions.length, 0);
  assert.ok(detailed.points.length);
  assert.ok(detailed.breakdown.length);
  assert.equal(summary.points.length, 0);
  assert.equal(summary.breakdown.length, 0);
});
