const fs = require("node:fs");
const path = require("node:path");
const assert = require("node:assert/strict");
const { test } = require("node:test");
const ts = require("typescript");
const root = path.resolve(__dirname, "../src");
require.extensions[".ts"] = (module, filename) => {
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
};
const {
  finishProjection,
  sortProjection,
} = require("../src/data/selectors/cooperative.ts");
const { createDefaultBackup } = require("../src/data/model/default-backup.ts");
const {
  normalizeBackupDocument,
} = require("../src/data/model/normalize-backup.ts");
const { budgetDefaults } = require("../src/data/model/budget-record.ts");
const { recurringDefaults } = require("../src/data/model/recurring-record.ts");
const {
  createTransactionIndex,
  iterateTransactionIndex,
  selectTransactionPeriod,
  selectTransactionMonths,
  selectPeriodTransactionCandidates,
  selectTransaction,
  selectTransactions,
} = require("../src/data/selectors/transaction-selectors.ts");
const {
  selectHomeOverview,
  selectTrackedBudgets,
} = require("../src/data/selectors/document-selectors.ts");
const {
  createHomeSectionLoader,
} = require("../src/data/selectors/home-section-selectors.ts");
const { i18n } = require("../src/localization/i18n.ts");
const now = new Date(2026, 8, 17, 12);

// Reordering a read-only sum can differ below a cent due to IEEE-754 arithmetic.
// Compare money numerically while retaining exact structure/relationships.
function equivalent(actual, expected) {
  if (typeof expected === "number") {
    assert.ok(Math.abs(actual - expected) < 1e-6, `${actual} != ${expected}`);
  } else if (expected instanceof Date)
    assert.equal(actual.getTime(), expected.getTime());
  else if (expected && typeof expected === "object") {
    assert.deepEqual(Object.keys(actual).sort(), Object.keys(expected).sort());
    for (const key of Object.keys(expected))
      equivalent(actual[key], expected[key]);
  } else assert.equal(actual, expected);
}

function fixture(count = 0) {
  const document = createDefaultBackup();
  document.users = [
    { uuid: "me", id: 1, currency: "USD" },
    { uuid: "other", id: 2, currency: "ILS" },
  ];
  document._local.selectedProfileId = "me";
  document.accounts = [
    { uuid: "bank", id: 20, user: 1, currencyCode: "USD", amount: 1000 },
  ];
  document.categories = [
    { uuid: "food", id: 10, user: 1, type: 0 },
    { uuid: "child", user: 1, parentId: 10, type: 0 },
  ];
  document.budgets = [
    {
      ...budgetDefaults("USD"),
      uuid: "budget",
      user: 1,
      categories: [10],
      amount: "500",
      showOnHome: true,
    },
  ];
  document.recurrings = [
    {
      ...recurringDefaults(now),
      uuid: "rent",
      user: 1,
      account: 20,
      type: 0,
      amount: 100,
      startAt: new Date(2026, 8, 18).toISOString(),
    },
  ];
  document.transactions = Array.from({ length: count }, (_, index) => ({
    uuid: `tx-${index}`,
    user: 1,
    account: 20,
    category: "child",
    amount: 1,
    type: 0,
    date: new Date(2026, 8, 1 + (index % 15), index % 24).toISOString(),
  }));
  return document;
}

test("cooperative stable sorting matches native ordering, including invalid-date ties", () => {
  const values = Array.from({ length: 2000 }, (_, id) => ({
    id,
    rank: id % 17 === 0 ? Infinity : id % 7,
  }));
  const compare = (a, b) => a.rank - b.rank;
  assert.deepEqual(
    finishProjection(sortProjection([...values], compare)),
    [...values].sort(compare),
  );
});


test("shared index matches the generator ordering, is built once per document and partitions months", () => {
  const document = fixture(2000);
  document.transactions.push(
    { ...document.transactions[0], uuid: "undated", date: "" },
    { ...document.transactions[0], uuid: "tie", date: document.transactions[5].date },
  );
  const index = createTransactionIndex(document);
  assert.deepEqual(index, finishProjection(iterateTransactionIndex(document)));
  assert.equal(createTransactionIndex(document), index, "shared per document");
  const copy = { ...document, transactions: [...document.transactions] };
  assert.notEqual(createTransactionIndex(copy), index);
  document.transactions.push({ ...document.transactions[0], uuid: "pushed" });
  assert.equal(
    createTransactionIndex(document).length,
    index.length + 1,
    "in-place mutation of a collection invalidates the cache",
  );
  const months = selectTransactionMonths(document);
  const september = months.get("2026-09");
  assert.ok(september);
  const all = createTransactionIndex(document);
  assert.deepEqual(
    all.slice(september.first, september.last),
    selectTransactionPeriod(all, new Date(2026, 8, 1), new Date(2026, 9, 1)),
  );
});

test("period candidates equal a full filtered scan in document order, including undated records", () => {
  const document = fixture(500);
  document.transactions.push(
    { ...document.transactions[0], uuid: "empty-date", date: "", createdAt: new Date(2026, 8, 3).toISOString() },
    { ...document.transactions[0], uuid: "old", date: new Date(2025, 1, 1).toISOString() },
    { ...document.transactions[0], uuid: "foreign", user: 2 },
  );
  const start = new Date(2026, 8, 1),
    end = new Date(2026, 8, 8);
  const candidates = selectPeriodTransactionCandidates(document, start, end);
  const ids = candidates.map((record) => record.uuid);
  assert.ok(ids.includes("empty-date"), "undated records stay candidates");
  assert.ok(!ids.includes("old") && !ids.includes("foreign"));
  const positions = ids.map((id) =>
    document.transactions.findIndex((record) => record.uuid === id),
  );
  assert.deepEqual(positions, [...positions].sort((a, b) => a - b));
  const expected = document.transactions.filter((record) => {
    const time = new Date(record.date).getTime();
    return record.user === 1 && time >= start.getTime() && time < end.getTime();
  });
  assert.deepEqual(
    candidates.filter((record) => record.date),
    expected,
  );
});

test("single transaction lookup equals projecting every transaction", () => {
  const document = fixture(300);
  const all = selectTransactions(document);
  for (const expected of [all[0], all[150], all[299]])
    assert.deepEqual(selectTransaction(document, expected.id), expected);
  assert.equal(selectTransaction(document, "missing"), undefined);
});

test("100,000 transactions: overview and all sections keep correct totals and are reused", () => {
  const h = hookHarness();
  const document = fixture(100000);
  const result = h.render(document);
  assert.equal(result.pending, false);
  assert.equal(result.index.length, 100000);
  assert.equal(result.overview.expense.amount, 100000);
  assert.equal(result.overview.transactionCount, 100000);
  const categories = h.render(document, "categories").sectionData;
  assert.equal(categories.totals.get("food").count, 100000);
  assert.equal(categories.totals.get("child").amounts.USD, 100000);
  const budgets = h.render(document, "budgets").sectionData;
  assert.equal(budgets.rows[0].budget.tracked, 100000);
  assert.equal(budgets.rows[0].budget.transactionCount, 100000);
  assert.equal(budgets.rows[0].budget.transactions.length, 0);
  assert.equal(h.render(document, "recurring").sectionData.rows.length, 1);
  // A remounted screen (fresh hook state) reuses the same document's results.
  const remounted = hookHarness();
  assert.equal(remounted.render(document).overview, result.overview);
  assert.equal(remounted.render(document, "budgets").sectionData, budgets);
});

test("supplied device backup: home projections preserve every profile's financial totals", () => {
  const source = JSON.parse(
    fs.readFileSync(
      path.resolve(__dirname, "../test-data/plutus-en.json"),
      "utf8",
    ),
  );
  const document = normalizeBackupDocument(source);
  const original = JSON.stringify(document);
  for (const owner of document.users) {
    const selected = {
      ...document,
      _local: {
        ...document._local,
        selectedProfileId: String(owner.uuid ?? owner.id),
      },
    };
    const currency = String(owner.currency ?? "USD");
    const h = hookHarness();
    const result = h.render(selected, "transactions", 0, now, currency);
    assert.equal(result.error, undefined);
    assert.deepEqual(
      result.index,
      finishProjection(iterateTransactionIndex(selected)),
    );
    equivalent(result.overview, selectHomeOverview(selected, currency, now));
    const reference = createHomeSectionLoader(selected, now, result.index);
    for (const section of ["categories", "recurring"])
      assert.deepEqual(
        h.render(selected, section, 0, now, currency).sectionData,
        reference(section),
      );
    const budgets = h.render(selected, "budgets", 0, now, currency).sectionData;
    const expected = selectTrackedBudgets(selected, now);
    assert.deepEqual(
      budgets.rows.map((row) => row.id),
      expected.map((budget) => budget.id),
    );
    for (let i = 0; i < expected.length; i++) {
      for (const key of [
        "tracked",
        "limit",
        "remaining",
        "rollover",
        "dailyAllowance",
      ])
        assert.ok(
          Math.abs(budgets.rows[i].budget[key] - expected[i][key]) < 1e-6,
          key,
        );
      assert.equal(
        budgets.rows[i].budget.transactionCount,
        expected[i].transactionCount,
      );
    }
  }
  assert.equal(
    JSON.stringify(document),
    original,
    "projections must never mutate canonical records",
  );
});

test("new documents, profiles and dates get fresh projections, including rollover history", () => {
  const document = fixture(10);
  document.budgets[0].rolling = true;
  document.budgets[0].createdAt = new Date(2026, 6, 1).toISOString();
  document.transactions.push({
    ...document.transactions[0],
    uuid: "past",
    amount: 100,
    date: new Date(2026, 6, 15).toISOString(),
  });
  const h = hookHarness();
  const first = h.render(document, "budgets").sectionData;
  assert.equal(
    first.rows[0].budget.rollover,
    selectTrackedBudgets(document, now)[0].rollover,
  );
  assert.equal(first.rows[0].budget.tracked, 10);
  const next = {
    ...document,
    transactions: document.transactions.map((t) => ({ ...t, amount: 2 })),
  };
  const changed = h.render(next, "budgets");
  assert.equal(changed.pending, false, "a save never shows a loading state");
  assert.equal(changed.sectionData.rows[0].budget.tracked, 20);
  assert.notEqual(
    h.render(document, "budgets", 0, new Date(2026, 9, 1)).sectionData,
    first,
  );
  const foreign = {
    ...document,
    _local: { ...document._local, selectedProfileId: "other" },
  };
  const other = h.render(foreign, "budgets");
  assert.equal(other.index.length, 0);
  assert.equal(other.sectionData.rows.length, 0);
});

test("budget and overview queries do not reread dates from irrelevant older history", () => {
  const document = fixture(3);
  let oldReads = 0;
  const old = new Proxy(
    {
      ...document.transactions[0],
      uuid: "old",
      date: new Date(2020, 0, 1).toISOString(),
    },
    {
      get(target, key) {
        if (key === "date") oldReads++;
        return target[key];
      },
    },
  );
  document.transactions.push(...Array.from({ length: 10000 }, () => old));
  const h = hookHarness();
  h.render(document);
  oldReads = 0;
  assert.equal(
    h.render(document, "budgets").sectionData.rows[0].budget.tracked,
    3,
  );
  assert.equal(oldReads, 0);
  const later = new Date(now.getTime() + 60000);
  assert.equal(h.render(document, "transactions", 0, later).overview.expense.amount, 3);
  assert.equal(
    oldReads,
    0,
    "overview refresh must reuse the same binary date bounds",
  );
});

test("currency formatting reuses formatters and still follows locale/sign changes", async () => {
  const {
    formatCurrency,
    formatSignedCurrency,
  } = require("../src/shared/lib/currency.ts");
  const NumberFormat = Intl.NumberFormat;
  let constructed = 0;
  Intl.NumberFormat = function (...args) {
    constructed++;
    return new NumberFormat(...args);
  };
  try {
    await i18n.changeLanguage("en");
    for (let i = 0; i < 100; i++) {
      // The symbol always trails the amount, in every language.
      assert.equal(formatCurrency(-1, "USD"), "1.00$");
      assert.equal(formatSignedCurrency(-1, "USD"), "-1.00$");
    }
    // Two cached entries (signed and unsigned), each deriving the locale symbol
    // from a reference formatter plus the number formatter it reuses.
    assert.equal(constructed, 4);
    await i18n.changeLanguage("ru");
    assert.equal(
      formatCurrency(1, "USD"),
      `${new NumberFormat("ru", {
        minimumFractionDigits: 2,
        maximumFractionDigits: 2,
      }).format(1)}$`,
    );
    assert.equal(constructed, 6);
    await i18n.changeLanguage("en");
    assert.equal(formatCurrency(1), "1.00$");
    assert.equal(constructed, 6);
  } finally {
    Intl.NumberFormat = NumberFormat;
    await i18n.changeLanguage("en");
  }
});

test("currency formatting works when iOS Intl omits formatToParts", async () => {
  const { formatCurrency, formatSignedCurrency } = require("../src/shared/lib/currency.ts");
  const NumberFormat = Intl.NumberFormat;
  Intl.NumberFormat = function (...args) {
    const formatter = new NumberFormat(...args);
    return {
      format: (value) => formatter.format(value),
      resolvedOptions: () => formatter.resolvedOptions(),
    };
  };
  try {
    await i18n.changeLanguage("en");
    assert.equal(formatCurrency(12.5, "CHF"), "12.50 CHF");
    assert.equal(formatSignedCurrency(-12.5, "CHF"), "-12.50 CHF");
    await i18n.changeLanguage("he");
    assert.equal(formatCurrency(12.5, "ILS"), "12.50₪");
  } finally {
    Intl.NumberFormat = NumberFormat;
    await i18n.changeLanguage("en");
  }
});

function hookHarness() {
  let cursor = 0;
  const slots = [],
    effects = [];
  const equal = (a, b) =>
    a && b && a.length === b.length && a.every((v, i) => Object.is(v, b[i]));
  const react = {
    useMemo(compute, deps) {
      const index = cursor++;
      if (!slots[index] || !equal(slots[index].deps, deps))
        slots[index] = { deps, value: compute() };
      return slots[index].value;
    },
    useState(initial) {
      const index = cursor++;
      if (!slots[index])
        slots[index] = {
          value: typeof initial === "function" ? initial() : initial,
        };
      return [
        slots[index].value,
        (value) => {
          slots[index].value =
            typeof value === "function" ? value(slots[index].value) : value;
        },
      ];
    },
    useEffect(effect, deps) {
      const index = cursor++;
      if (!slots[index] || !equal(slots[index].deps, deps)) {
        const previous = slots[index];
        slots[index] = { deps };
        effects.push(() => {
          previous?.cleanup?.();
          slots[index].cleanup = effect();
        });
      }
    },
  };
  const source = ts.transpileModule(
    fs.readFileSync(path.join(root, "features/home/use-home-data.ts"), "utf8"),
    { compilerOptions: { module: ts.ModuleKind.CommonJS } },
  ).outputText;
  const module = { exports: {} };
  new Function("require", "module", "exports", source)(
    (name) =>
      name === "react"
        ? react
        : require(
            name.startsWith("@/") ? path.join(root, name.slice(2)) : name,
          ),
    module,
    module.exports,
  );
  return {
    render(
      document,
      section = "transactions",
      retry = 0,
      clock = now,
      currency = "USD",
    ) {
      cursor = 0;
      const result = module.exports.useHomeData(
        document,
        currency,
        clock,
        section,
        retry,
      );
      while (effects.length) effects.shift()();
      return result;
    },
    unmount() {
      for (const slot of slots) slot?.cleanup?.();
    },
  };
}

test("real home hook never shows a loading state and never shows another profile's rows", () => {
  const h = hookHarness();
  const document = fixture(50000);
  const initial = h.render(document);
  assert.equal(initial.pending, false);
  assert.equal(initial.index.length, 50000);
  const budgets = h.render(document, "budgets");
  assert.equal(budgets.pending, false);
  assert.equal(budgets.sectionData.rows[0].budget.tracked, 50000);
  const recurring = h.render(document, "recurring");
  assert.equal(recurring.sectionData.section, "recurring");
  assert.equal(recurring.sectionData.rows.length, 1);
  const other = {
    ...document,
    _local: { ...document._local, selectedProfileId: "other" },
  };
  const changed = h.render(other, "categories");
  assert.equal(changed.index.length, 0);
  assert.equal(changed.sectionData.rows.length, 0);
});

test("real home hook distinguishes failures from empty data and retry recovers without a persisted write", () => {
  const h = hookHarness();
  const document = fixture(1);
  let fail = true;
  document.transactions[0] = new Proxy(document.transactions[0], {
    get(target, key) {
      if (fail && key === "date") throw new Error("Read failed");
      return target[key];
    },
  });
  const failed = h.render(document);
  assert.equal(failed.error.message, "Read failed");
  assert.equal(failed.index, undefined);
  fail = false;
  const resolved = h.render(document, "transactions", 1);
  assert.equal(resolved.error, undefined);
  assert.equal(resolved.index.length, 1);
  assert.equal(resolved.overview.expense.amount, 1);
});

test("clock refresh computes fresh totals without rebuilding or resorting history", () => {
  const h = hookHarness();
  const document = fixture(10000);
  const first = h.render(document);
  const nextTime = new Date(now.getTime() + 60000);
  const refreshed = h.render(document, "transactions", 0, nextTime);
  assert.equal(refreshed.overviewRefreshing, false);
  assert.equal(
    refreshed.overview.expense.amount,
    first.overview.expense.amount,
  );
  assert.equal(
    refreshed.index,
    first.index,
    "clock changes must not rebuild or resort history",
  );
});
