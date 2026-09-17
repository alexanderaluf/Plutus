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
  selectProfileReport,
} = require("../src/data/selectors/report-selectors.ts");

const NOW = new Date(2026, 8, 20, 12, 0, 0);
const PROFILE = "alex-personal";

function documentWith(transactions, extras = {}) {
  const base = createLegacyDevelopmentBackup();
  return normalizeBackupDocument({
    ...base,
    ...extras,
    _local: {
      ...base._local,
      selectedProfileId: PROFILE,
      monthStartDay: 1,
      ...(extras._local ?? {}),
    },
    users: [
      {
        uuid: PROFILE,
        name: "Alex",
        currency: "USD",
        currencyName: "US Dollar",
        currencySymbol: "$",
        isSelected: true,
        createdAt: NOW.toISOString(),
        updatedAt: NOW.toISOString(),
      },
    ],
    accounts: extras.accounts ?? [
      {
        uuid: "account-main",
        name: "Checking",
        user: PROFILE,
        amount: 5000,
        currencyCode: "USD",
        accountType: "cash",
      },
    ],
    transactions,
  });
}

function entry(id, amount, type, date, category = "Groceries") {
  return {
    uuid: id,
    name: id,
    user: PROFILE,
    account: "account-main",
    amount,
    accountAmount: amount,
    currencyCode: "USD",
    type,
    categoryName: category,
    date: date.toISOString(),
    createdAt: date.toISOString(),
    updatedAt: date.toISOString(),
  };
}

test("report totals cover six financial months and compare against the previous one", () => {
  const thisMonth = new Date(2026, 8, 5);
  const lastMonth = new Date(2026, 7, 5);
  const document = documentWith([
    entry("income-now", 4000, 1, thisMonth),
    entry("spend-now", 1000, 0, thisMonth),
    entry("income-prev", 4000, 1, lastMonth),
    entry("spend-prev", 2000, 0, lastMonth),
  ]);

  const report = selectProfileReport(document, "USD", NOW);

  assert.equal(report.months.length, 6);
  assert.equal(report.current.income, 4000);
  assert.equal(report.current.expense, 1000);
  assert.equal(report.current.net, 3000);
  assert.equal(report.previous.expense, 2000);
  // 4000 income against 1000 spent is a 75% savings rate.
  assert.equal(Math.round(report.savingsRate), 75);
  // Spending halved month over month.
  assert.equal(Math.round(report.expenseChange), -50);
  assert.equal(report.hasData, true);
});

test("a profile spending more than it earns is flagged critical with the shortfall", () => {
  const when = new Date(2026, 8, 5);
  const document = documentWith([
    entry("income", 1000, 1, when),
    entry("rent", 1800, 0, when, "Rent"),
  ]);

  const report = selectProfileReport(document, "USD", NOW);
  const overspending = report.insights.find(
    (insight) => insight.id === "overspending",
  );

  assert.ok(overspending);
  assert.equal(overspending.severity, "critical");
  assert.equal(overspending.values.gap, 800);
  // A shortfall must never be reported as a healthy profile.
  assert.equal(report.health.band, "fragile");
  // The rate stays negative rather than clamping, so the depth of the
  // shortfall is visible.
  assert.equal(report.savingsRate, -80);
});

test("a single dominant category raises a concentration warning", () => {
  const when = new Date(2026, 8, 5);
  const document = documentWith([
    entry("income", 5000, 1, when),
    entry("rent", 1500, 0, when, "Rent"),
    entry("food", 200, 0, when, "Groceries"),
    entry("bus", 100, 0, when, "Transport"),
  ]);

  const report = selectProfileReport(document, "USD", NOW);
  const concentration = report.insights.find(
    (insight) => insight.id === "concentration",
  );

  assert.ok(concentration);
  assert.equal(concentration.values.name, "Rent");
  assert.equal(report.categories[0].label, "Rent");
  assert.equal(report.categories[0].share, 83);
});

test("category growth against the previous month is measured over the full period", () => {
  const document = documentWith([
    entry("income", 6000, 1, new Date(2026, 8, 2)),
    entry("food-now", 300, 0, new Date(2026, 8, 3), "Groceries"),
    // Late-month spending in the previous period must still count in its total.
    entry("food-prev-a", 100, 0, new Date(2026, 7, 2), "Groceries"),
    entry("food-prev-b", 100, 0, new Date(2026, 7, 28), "Groceries"),
  ]);

  const report = selectProfileReport(document, "USD", NOW);
  const food = report.categories.find((item) => item.label === "Groceries");

  assert.ok(food);
  // 300 this month against 200 last month is +50%.
  assert.equal(Math.round(food.changePercent), 50);
  assert.ok(
    report.insights.some((insight) => insight.id === "categorySpike"),
    "a 50% jump should surface a spike warning",
  );
});

test("a healthy profile is told how to maintain it rather than left without guidance", () => {
  const when = new Date(2026, 8, 5);
  const document = documentWith([
    entry("income", 5000, 1, when),
    // Low enough that the month-end projection still lands under last month.
    entry("spend", 1000, 0, when, "Groceries"),
    entry("income-prev", 5000, 1, new Date(2026, 7, 5)),
    entry("spend-prev", 1600, 0, new Date(2026, 7, 5), "Groceries"),
  ]);

  const report = selectProfileReport(document, "USD", NOW);

  assert.equal(report.insights.length > 0, true);
  assert.ok(report.insights.some((insight) => insight.id === "strongSavings"));
  assert.equal(
    report.insights.every((insight) => insight.severity === "good"),
    true,
  );
  assert.equal(report.health.band, "strong");
  assert.ok(report.health.score >= 75);
});

function category(id, name, parentId = null) {
  return {
    uuid: id,
    name,
    user: PROFILE,
    parentId,
    type: 0,
    color: "#70d2eb",
    createdAt: NOW.toISOString(),
    updatedAt: NOW.toISOString(),
  };
}

test("the donut rolls child categories up into their top-most parent", () => {
  const when = new Date(2026, 8, 5);
  const document = documentWith(
    [
      entry("income", 5000, 1, when),
      { ...entry("groceries", 300, 0, when), category: "cat-groceries" },
      { ...entry("dining", 200, 0, when), category: "cat-dining" },
      { ...entry("rent", 400, 0, when), category: "cat-rent" },
    ],
    {
      categories: [
        category("cat-food", "Food"),
        category("cat-groceries", "Groceries", "cat-food"),
        category("cat-dining", "Dining", "cat-food"),
        category("cat-rent", "Rent"),
      ],
    },
  );

  const { parentCategories } = selectProfileReport(document, "USD", NOW);

  assert.deepEqual(
    parentCategories.map((item) => [item.label, item.amount, item.childCount]),
    [
      ["Food", 500, 2],
      ["Rent", 400, 0],
    ],
  );
  // Slices must be distinguishable even though both categories default to the
  // same color.
  assert.notEqual(parentCategories[0].color, parentCategories[1].color);
});

test("a long tail of parents collapses into one slice without losing any spending", () => {
  const when = new Date(2026, 8, 5);
  const names = ["A", "B", "C", "D", "E", "F", "G", "H"];
  const document = documentWith(
    [
      entry("income", 9000, 1, when),
      ...names.map((name, index) => ({
        ...entry(`spend-${name}`, 100 * (names.length - index), 0, when),
        category: `cat-${name}`,
      })),
    ],
    { categories: names.map((name) => category(`cat-${name}`, name)) },
  );

  const { parentCategories, current } = selectProfileReport(
    document,
    "USD",
    NOW,
  );

  // Six named slices plus the remainder.
  assert.equal(parentCategories.length, 7);
  assert.equal(parentCategories[6].id, "__other__");
  // The two smallest parents, 200 and 100.
  assert.equal(parentCategories[6].amount, 300);
  assert.equal(parentCategories[6].childCount, 2);
  const ring = parentCategories.reduce((sum, item) => sum + item.amount, 0);
  assert.equal(ring, current.expense);
  assert.equal(Math.round(parentCategories.reduce((s, i) => s + i.share, 0)), 100);
});

test("an imported parent cycle is resolved instead of looping forever", () => {
  const when = new Date(2026, 8, 5);
  const document = documentWith(
    [
      entry("income", 5000, 1, when),
      { ...entry("spend", 250, 0, when), category: "cat-left" },
    ],
    {
      categories: [
        category("cat-left", "Left", "cat-right"),
        category("cat-right", "Right", "cat-left"),
      ],
    },
  );

  const { parentCategories } = selectProfileReport(document, "USD", NOW);

  assert.equal(parentCategories.length, 1);
  assert.equal(parentCategories[0].amount, 250);
});

test("an empty profile asks for data instead of inventing an assessment", () => {
  const report = selectProfileReport(documentWith([]), "USD", NOW);

  assert.equal(report.hasData, false);
  assert.equal(report.health.score, 0);
  assert.deepEqual(
    report.insights.map((insight) => insight.id),
    ["needsData"],
  );
});
