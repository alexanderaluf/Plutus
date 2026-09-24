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
const {
  selectConsumptionReport,
  selectConsumptionDetails,
} = require("../src/data/selectors/consumption-report-selectors.ts");
const PROFILE = "alex-personal";
const {
  expensePieLayout,
} = require("../src/features/reports/components/expense-pie-layout.ts");

test("pie keeps the saved parent colors even for child expenses and repeated colors", () => {
  const document = documentWith(
    [
      { ...entry("child-expense", 50, 0, NOW), category: "child" },
      { ...entry("parent-expense", 10, 0, NOW), category: "parent" },
      { ...entry("other-parent", 40, 0, NOW), category: "second" },
    ],
    {
      categories: [
        { ...category("parent", "Parent"), color: "#AABBCC" },
        { ...category("child", "Child", "parent"), color: "#112233" },
        { ...category("second", "Second"), color: "#AABBCC" },
      ],
    },
  );
  const flow = selectConsumptionReport(document, "USD", NOW).flows[0];
  assert.equal(
    flow.slices.find((slice) => slice.id === "parent").color,
    "#AABBCC",
  );
  assert.equal(
    flow.slices.find((slice) => slice.id === "second").color,
    "#AABBCC",
  );
  assert.equal(flow.slices.find((slice) => slice.id === "parent").amount, 60);
});

test("dominant expenses still produce evenly balanced labels without altering shares", () => {
  for (const shares of [
    [48.4, 7.1, 6.9, 5.6, 4.9, 27.1],
    [99.5, 0.1, 0.1, 0.1, 0.1, 0.1],
    [100],
    [50, 50],
  ]) {
    const slices = shares.map((share, index) => ({ id: String(index), share }));
    const layout = expensePieLayout(slices, 350, 1);
    const right = layout.labels.filter((label) => label.right).length;
    assert.ok(Math.abs(right - (slices.length - right)) <= 1);
    for (const arc of layout.arcs) {
      assert.ok(
        Math.abs(
          ((arc.end - arc.start) / (2 * Math.PI)) * 100 - arc.slice.share,
        ) < 1e-8,
      );
      assert.ok(!/NaN|Infinity/.test(arc.path));
      if (slices.length > 1) assert.ok(arc.path.includes("Q "));
    }
  }
});

test("balanced pie labels stay within mobile bounds at large font sizes", () => {
  for (const width of [216, 280, 326, 366, 480])
    for (const fontScale of [1, 1.3, 2.5])
      for (let count = 1; count <= 6; count++) {
        const weights = Array.from({ length: count }, (_, index) =>
          index === 0 ? 995 : 1,
        );
        const total = weights.reduce((sum, weight) => sum + weight, 0);
        const layout = expensePieLayout(
          weights.map((weight, index) => ({
            id: String(index),
            share: (weight / total) * 100,
          })),
          width,
          fontScale,
        );
        for (const label of layout.labels) {
          assert.ok(label.x >= 0 && label.y >= 0);
          assert.ok(label.x + label.width <= width + 1e-8);
          assert.ok(label.y + label.height <= layout.height + 1e-8);
          for (const other of layout.labels)
            if (other !== label) {
              assert.ok(
                label.x + label.width <= other.x + 1e-8 ||
                  other.x + other.width <= label.x + 1e-8 ||
                  label.y + label.height <= other.y ||
                  other.y + other.height <= label.y,
              );
            }
        }
      }
});

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

test("consumption uses the selected salary cycle with exact inclusive/exclusive boundaries", () => {
  const now = new Date(2026, 9, 20, 12);
  const document = documentWith(
    [
      entry("before", 900, 0, new Date(2026, 8, 14, 23, 59, 59)),
      entry("first", 100, 0, new Date(2026, 8, 15)),
      entry("last", 200, 0, new Date(2026, 9, 14, 23, 59, 59)),
      entry("after", 800, 0, new Date(2026, 9, 15)),
      entry("salary", 1000, 1, new Date(2026, 8, 15)),
    ],
    { _local: { monthStartDay: 15 } },
  );
  const report = selectConsumptionReport(document, "USD", now, -1);
  assert.equal(report.period.start.getTime(), new Date(2026, 8, 15).getTime());
  assert.equal(report.period.end.getTime(), new Date(2026, 9, 15).getTime());
  assert.equal(report.flows[0].expense, 300);
  assert.equal(report.flows[0].income, 1000);
  assert.equal(report.flows[0].net, 700);
  assert.equal(report.flows[0].dailyAverage, 10);
});

test("consumption clamps short months and crosses years without gaps", () => {
  const document = documentWith([], { _local: { monthStartDay: 31 } });
  for (const [now, start, end] of [
    [new Date(2026, 2, 15), new Date(2026, 1, 28), new Date(2026, 2, 31)],
    [new Date(2028, 2, 15), new Date(2028, 1, 29), new Date(2028, 2, 31)],
    [new Date(2027, 0, 10), new Date(2026, 11, 31), new Date(2027, 0, 31)],
  ]) {
    const report = selectConsumptionReport(document, "USD", now);
    assert.equal(report.period.start.getTime(), start.getTime());
    assert.equal(report.period.end.getTime(), end.getTime());
    assert.equal(
      new Set(report.flows[0].days.map((day) => day.key)).size,
      report.flows[0].days.length,
    );
  }
});

test("consumption excludes transfers, hidden accounts, other owners and future records", () => {
  const document = documentWith(
    [
      entry("expense", 50, 0, NOW),
      entry("transfer", 900, 2, NOW),
      { ...entry("hidden", 700, 0, NOW), account: 42 },
      { ...entry("foreign", 800, 0, NOW), user: "someone-else" },
      entry("future", 600, 0, new Date(NOW.getTime() + 1000)),
      { ...entry("invalid", 400, 0, NOW), date: "invalid" },
    ],
    {
      accounts: [
        {
          uuid: "account-main",
          user: PROFILE,
          amount: 300,
          currencyCode: "USD",
        },
        { uuid: "hidden", id: 42, isExcluded: true, amount: 999 },
      ],
    },
  );
  const before = JSON.stringify(document);
  const report = selectConsumptionReport(document, "USD", NOW);
  assert.equal(report.flows[0].expense, 50);
  assert.equal(report.flows[0].expenseCount, 1);
  assert.equal(report.holdings[0].accounts.length, 1);
  assert.equal(JSON.stringify(document), before);
});

test("consumption preserves missing conversions in their own currency and uses saved account amounts", () => {
  const document = documentWith([
    entry("dollars", 10, 0, NOW),
    {
      ...entry("euros", 20, 0, NOW),
      currencyCode: "EUR",
      accountCurrencyCode: "EUR",
    },
    {
      ...entry("converted", 30, 0, NOW),
      currencyCode: "EUR",
      accountCurrencyCode: "USD",
      accountAmount: 36,
    },
  ]);
  const report = selectConsumptionReport(document, "USD", NOW);
  assert.equal(
    report.flows.find((flow) => flow.currencyCode === "USD").expense,
    46,
  );
  assert.equal(
    report.flows.find((flow) => flow.currencyCode === "EUR").expense,
    20,
  );
});

test("pie drilldown reconciles every parent, child and remainder transaction", () => {
  const names = ["A", "B", "C", "D", "E", "F", "G", "H"];
  const document = documentWith(
    names.map((name, i) => ({
      ...entry(name, 100 * (i + 1), 0, NOW),
      category: `child-${name}`,
    })),
    {
      categories: names.flatMap((name) => [
        category(name, name),
        category(`child-${name}`, `Child ${name}`, name),
      ]),
    },
  );
  const flow = selectConsumptionReport(document, "USD", NOW).flows[0];
  assert.equal(flow.slices.length, 6);
  assert.equal(
    flow.slices.reduce((sum, slice) => sum + slice.amount, 0),
    flow.expense,
  );
  assert.ok(
    Math.abs(flow.slices.reduce((sum, slice) => sum + slice.share, 0) - 100) <
      1e-9,
  );
  const detailEntries = flow.slices.flatMap((slice) => {
    const details = selectConsumptionDetails(flow, slice);
    assert.equal(
      details.entries.reduce((sum, record) => sum + record.amount, 0),
      slice.amount,
    );
    assert.equal(
      details.categories.reduce((sum, record) => sum + record.amount, 0),
      slice.amount,
    );
    return details.entries;
  });
  assert.equal(
    new Set(detailEntries.map((item) => item.id)).size,
    names.length,
  );
  assert.equal(
    flow.days.reduce((sum, day) => sum + day.amount, 0),
    flow.expense,
  );
});

test("duplicate category names and broken parent cycles retain stable identities", () => {
  const document = documentWith(
    [
      { ...entry("one", 10, 0, NOW), category: "left" },
      { ...entry("two", 20, 0, NOW), category: "right" },
      { ...entry("three", 30, 0, NOW), category: "separate" },
    ],
    {
      categories: [
        category("left", "Same", "right"),
        category("right", "Same", "left"),
        category("separate", "Same"),
      ],
    },
  );
  const flow = selectConsumptionReport(document, "USD", NOW).flows[0];
  assert.equal(flow.categories.length, 2);
  assert.equal(flow.expense, 60);
  assert.deepEqual(
    flow.categories.map((item) => item.amount),
    [30, 30],
  );
});

test("current holdings keep currencies separate while historical consumption changes", () => {
  const document = documentWith([], {
    accounts: [
      { uuid: "usd", user: PROFILE, amount: 100, currencyCode: "USD" },
      {
        uuid: "card",
        user: PROFILE,
        amount: -20,
        currencyCode: "USD",
        accountType: "card",
      },
      { uuid: "eur", user: PROFILE, amount: 200, currencyCode: "EUR" },
    ],
  });
  const report = selectConsumptionReport(document, "USD", NOW, -8);
  assert.deepEqual(
    report.holdings.map(({ currencyCode, net, debt }) => ({
      currencyCode,
      net,
      debt,
    })),
    [
      { currencyCode: "USD", net: 80, debt: 20 },
      { currencyCode: "EUR", net: 200, debt: 0 },
    ],
  );
  assert.equal(report.flows[0].spentIncomePercent, null);
  assert.deepEqual(report.flows[0].slices, []);
});

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
  assert.equal(
    Math.round(parentCategories.reduce((s, i) => s + i.share, 0)),
    100,
  );
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
