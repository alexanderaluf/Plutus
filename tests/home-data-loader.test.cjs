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
  runProjection,
  finishProjection,
  sortProjection,
} = require("../src/data/selectors/cooperative.ts");
const {
  createHomeDataLoader,
} = require("../src/data/selectors/home-data-loader.ts");
const { createDefaultBackup } = require("../src/data/model/default-backup.ts");
const {
  normalizeBackupDocument,
} = require("../src/data/model/normalize-backup.ts");
const { budgetDefaults } = require("../src/data/model/budget-record.ts");
const { recurringDefaults } = require("../src/data/model/recurring-record.ts");
const {
  createTransactionIndex,
  selectTransactionPeriod,
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
const signal = () => new AbortController().signal;

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

test("one shared 3ms budget covers concurrent jobs and cancellation removes queued work", async () => {
  const originalIdle = global.requestIdleCallback,
    originalCancel = global.cancelIdleCallback;
  const descriptor = Object.getOwnPropertyDescriptor(performance, "now");
  const callbacks = new Map();
  let clock = 0,
    id = 0,
    advances = 0;
  global.requestIdleCallback = (callback) => {
    callbacks.set(++id, callback);
    return id;
  };
  global.cancelIdleCallback = (handle) => callbacks.delete(handle);
  Object.defineProperty(performance, "now", {
    configurable: true,
    value: () => clock,
  });
  const controller = new AbortController();
  function* work() {
    for (let index = 0; index < 50; index++) {
      advances++;
      clock++;
      yield;
    }
    return "done";
  }
  try {
    const a = runProjection(work(), signal());
    const b = runProjection(work(), controller.signal);
    const rejected = assert.rejects(b, /cancelled/);
    assert.equal(
      advances,
      0,
      "requesting a projection must do no synchronous work",
    );
    assert.equal(callbacks.size, 1, "all jobs share one scheduled callback");
    const flush = () => {
      const [key, callback] = callbacks.entries().next().value;
      callbacks.delete(key);
      callback({ timeRemaining: () => 50 });
    };
    flush();
    assert.equal(
      advances,
      3,
      "concurrent jobs must not each consume their own frame budget",
    );
    controller.abort();
    while (callbacks.size) {
      const start = clock;
      flush();
      assert.ok(clock - start <= 3);
    }
    assert.equal(await a, "done");
    await rejected;
    assert.equal(advances, 51, "cancelled job must stop after its first slice");
  } finally {
    if (descriptor) Object.defineProperty(performance, "now", descriptor);
    else delete performance.now;
    global.requestIdleCallback = originalIdle;
    global.cancelIdleCallback = originalCancel;
  }
});

test("100,000 transactions yield to UI work while indexing, overview and all sections retain correct totals", async () => {
  const document = fixture(100000);
  const loader = createHomeDataLoader(document);
  let beats = 0;
  const timer = setInterval(() => beats++, 0);
  try {
    const pending = loader.loadIndex(signal());
    assert.equal(beats, 0);
    const index = await pending;
    assert.ok(
      beats > 1,
      "index building and sorting must allow other event-loop work",
    );
    assert.equal(index.length, 100000);
    assert.equal(
      selectTransactionPeriod(
        index,
        new Date(2026, 8, 1),
        new Date(2026, 9, 1),
        30,
      ).length,
      30,
    );
    assert.equal(await loader.loadIndex(signal()), index);
    let start = beats;
    const overview = await loader.loadOverview("USD", now, signal());
    assert.ok(beats > start);
    assert.equal(overview.expense.amount, 100000);
    assert.equal(overview.transactionCount, 100000);
    start = beats;
    const categories = await loader.loadSection("categories", now, signal());
    assert.ok(beats > start);
    assert.equal(categories.totals.get("food").count, 100000);
    assert.equal(categories.totals.get("child").amounts.USD, 100000);
    start = beats;
    const budgets = await loader.loadSection("budgets", now, signal());
    assert.ok(beats > start);
    assert.equal(budgets.rows[0].budget.tracked, 100000);
    assert.equal(budgets.rows[0].budget.transactionCount, 100000);
    assert.equal(budgets.rows[0].budget.transactions.length, 0);
    assert.equal(await loader.loadSection("budgets", now, signal()), budgets);
    assert.equal(
      (await loader.loadSection("recurring", now, signal())).rows.length,
      1,
    );
  } finally {
    clearInterval(timer);
  }
});

test("supplied device backup: cooperative projections preserve every profile's financial totals", async () => {
  const source = JSON.parse(
    fs.readFileSync(
      path.resolve(__dirname, "../test-data/plutus-device-test-2026-09.json"),
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
    const loader = createHomeDataLoader(selected);
    const index = await loader.loadIndex(signal());
    assert.deepEqual(index, createTransactionIndex(selected));
    equivalent(
      await loader.loadOverview(String(owner.currency ?? "USD"), now, signal()),
      selectHomeOverview(selected, String(owner.currency ?? "USD"), now),
    );
    const reference = createHomeSectionLoader(selected, now, index);
    for (const section of ["categories", "recurring"])
      assert.deepEqual(
        await loader.loadSection(section, now, signal()),
        reference(section),
      );
    const budgets = await loader.loadSection("budgets", now, signal());
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
      assert.equal(
        budgets.rows[i].budget.excludedCurrencyCount,
        expected[i].excludedCurrencyCount,
      );
    }
  }
  assert.equal(
    JSON.stringify(document),
    original,
    "loading must never mutate canonical records",
  );
});

test("new documents, profiles and dates get fresh projections, including rollover history", async () => {
  const document = fixture(10);
  document.budgets[0].rolling = true;
  document.budgets[0].createdAt = new Date(2026, 6, 1).toISOString();
  document.transactions.push({
    ...document.transactions[0],
    uuid: "past",
    amount: 100,
    date: new Date(2026, 6, 15).toISOString(),
  });
  const loader = createHomeDataLoader(document);
  await loader.loadIndex(signal());
  const first = await loader.loadSection("budgets", now, signal());
  assert.equal(
    first.rows[0].budget.rollover,
    selectTrackedBudgets(document, now)[0].rollover,
  );
  assert.equal(first.rows[0].budget.tracked, 10);
  const next = {
    ...document,
    transactions: document.transactions.map((t) => ({ ...t, amount: 2 })),
  };
  const nextLoader = createHomeDataLoader(next);
  await nextLoader.loadIndex(signal());
  assert.equal(
    (await nextLoader.loadSection("budgets", now, signal())).rows[0].budget
      .tracked,
    20,
  );
  assert.notEqual(
    await loader.loadSection("budgets", new Date(2026, 9, 1), signal()),
    first,
  );
  const foreign = createHomeDataLoader({
    ...document,
    _local: { ...document._local, selectedProfileId: "other" },
  });
  assert.equal((await foreign.loadIndex(signal())).length, 0);
  assert.equal(
    (await foreign.loadSection("budgets", now, signal())).rows.length,
    0,
  );
});

test("budget home queries do not reread dates from irrelevant older history", async () => {
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
  const loader = createHomeDataLoader(document);
  await loader.loadIndex(signal());
  oldReads = 0;
  assert.equal(
    (await loader.loadSection("budgets", now, signal())).rows[0].budget.tracked,
    3,
  );
  assert.equal(oldReads, 0);
  const overview = await loader.loadOverview("USD", now, signal());
  assert.equal(overview.expense.amount, 3);
  assert.equal(
    oldReads,
    0,
    "overview refresh must reuse the same binary date bounds",
  );
});

test("cancelled load stops processing and can be retried without caching partial results", async () => {
  const document = fixture(10000);
  const loader = createHomeDataLoader(document);
  const controller = new AbortController();
  const pending = loader.loadIndex(controller.signal);
  controller.abort();
  await assert.rejects(pending, /cancelled/);
  assert.equal((await loader.loadIndex(signal())).length, 10000);
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
      assert.equal(formatCurrency(-1, "USD"), "$1.00");
      assert.equal(formatSignedCurrency(-1, "USD"), "-$1.00");
    }
    assert.equal(constructed, 2);
    await i18n.changeLanguage("ru");
    assert.equal(
      formatCurrency(1, "USD"),
      new NumberFormat("ru", {
        style: "currency",
        currency: "USD",
        minimumFractionDigits: 2,
      }).format(1),
    );
    assert.equal(constructed, 3);
    await i18n.changeLanguage("en");
    assert.equal(formatCurrency(1), "$1.00");
    assert.equal(constructed, 3);
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
    (name) => (name === "react" ? react : { createHomeDataLoader }),
    module,
    module.exports,
  );
  return {
    render(document, section = "transactions", retry = 0, clock = now) {
      cursor = 0;
      const result = module.exports.useHomeData(
        document,
        "USD",
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
async function settle(render) {
  const deadline = performance.now() + 3000;
  for (;;) {
    const result = render();
    if (result.error || (!result.pending && result.overview)) return result;
    assert.ok(performance.now() < deadline, "home projection did not resolve");
    await new Promise((resolve) => setTimeout(resolve, 1));
  }
}

test("real home hook acknowledges switches immediately, cancels obsolete loads and never shows another profile's rows", async () => {
  const h = hookHarness();
  const document = fixture(50000);
  try {
    assert.equal(h.render(document).pending, true);
    const initial = await settle(() => h.render(document));
    assert.equal(initial.index.length, 50000);
    const budget = h.render(document, "budgets");
    assert.equal(budget.pending, true);
    assert.equal(budget.sectionData, undefined);
    const recurring = await settle(() => h.render(document, "recurring"));
    assert.equal(recurring.sectionData.section, "recurring");
    assert.equal(recurring.sectionData.rows.length, 1);
    const budgetRetry = await settle(() => h.render(document, "budgets"));
    assert.equal(budgetRetry.sectionData.rows[0].budget.tracked, 50000);
    const other = {
      ...document,
      _local: { ...document._local, selectedProfileId: "other" },
    };
    const changed = h.render(other, "categories");
    assert.equal(changed.index, undefined);
    assert.equal(changed.sectionData, undefined);
    const resolved = await settle(() => h.render(other, "categories"));
    assert.equal(resolved.index.length, 0);
    assert.equal(resolved.sectionData.rows.length, 0);
  } finally {
    h.unmount();
  }
});

test("real home hook distinguishes failures from empty data and retry recovers without a persisted write", async () => {
  const h = hookHarness();
  const document = fixture(1);
  let fail = true;
  document.transactions[0] = new Proxy(document.transactions[0], {
    get(target, key) {
      if (fail && key === "date") throw new Error("Read failed");
      return target[key];
    },
  });
  try {
    const failed = await settle(() => h.render(document));
    assert.equal(failed.error.message, "Read failed");
    assert.equal(failed.index, undefined);
    fail = false;
    const retrying = h.render(document, "transactions", 1);
    assert.equal(retrying.error, undefined);
    assert.equal(retrying.pending, true);
    const resolved = await settle(() => h.render(document, "transactions", 1));
    assert.equal(resolved.index.length, 1);
    assert.equal(resolved.overview.expense.amount, 1);
  } finally {
    h.unmount();
  }
});

test("clock refresh retains the same document's overview while preparing fresh totals", async () => {
  const h = hookHarness();
  const document = fixture(10000);
  try {
    const first = await settle(() => h.render(document));
    const nextTime = new Date(now.getTime() + 60000);
    const refreshing = h.render(document, "transactions", 0, nextTime);
    assert.equal(refreshing.overview, first.overview);
    assert.equal(refreshing.overviewRefreshing, true);
    const deadline = performance.now() + 3000;
    let refreshed;
    do {
      await new Promise((resolve) => setTimeout(resolve, 1));
      refreshed = h.render(document, "transactions", 0, nextTime);
      assert.ok(performance.now() < deadline);
    } while (refreshed.overviewRefreshing);
    assert.equal(
      refreshed.overview.expense.amount,
      first.overview.expense.amount,
    );
    assert.equal(
      refreshed.index,
      first.index,
      "clock changes must not rebuild or resort history",
    );
  } finally {
    h.unmount();
  }
});
