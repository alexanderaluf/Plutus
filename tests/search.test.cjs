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
  DEFAULT_SEARCH_FILTERS,
  countActiveFilters,
  createSearchContext,
  searchTransactions,
} = require("../src/data/selectors/search-selectors.ts");

const PROFILE = "alex-personal";
const NOW = new Date(2026, 8, 20, 12, 0, 0);

function documentWith(transactions, extras = {}) {
  const base = createLegacyDevelopmentBackup();
  return normalizeBackupDocument({
    ...base,
    _local: { ...base._local, selectedProfileId: PROFILE, monthStartDay: 1 },
    accounts: [
      {
        uuid: "account-main",
        id: 1,
        name: "Everyday Card",
        currencyCode: "USD",
        amount: 0,
        user: PROFILE,
      },
      {
        uuid: "account-euro",
        id: 2,
        name: "Travel Wallet",
        currencyCode: "EUR",
        amount: 0,
        user: PROFILE,
      },
    ],
    categories: [
      { uuid: "category-food", id: 7, name: "Food", user: PROFILE },
      {
        uuid: "category-groceries",
        id: 8,
        name: "Groceries",
        parentId: "category-food",
        user: PROFILE,
      },
      { uuid: "category-salary", id: 9, name: "Salary", user: PROFILE },
    ],
    labels: [{ uuid: "label-work", name: "Work" }],
    places: [{ uuid: "place-market", name: "Carmel Market" }],
    peoples: [{ uuid: "person-dana", name: "Dana" }],
    transactions,
    ...extras,
  });
}

function entry(index, name, overrides = {}) {
  return {
    uuid: `tx-${index}`,
    name,
    account: "account-main",
    category: "category-groceries",
    amount: 10,
    currencyCode: "USD",
    type: 0,
    user: PROFILE,
    date: "2026-09-10T10:00:00.000Z",
    createdAt: "2026-09-10T10:00:00.000Z",
    ...overrides,
  };
}

function search(document, filters = {}) {
  return searchTransactions(
    createSearchContext(document, "USD"),
    { ...DEFAULT_SEARCH_FILTERS, ...filters },
    NOW,
  );
}
const ids = (outcome) => outcome.entries.map((item) => item.record.uuid);

test("no query and no filters lists the profile's activity newest first", () => {
  const document = documentWith([
    entry(1, "Old", { date: "2026-08-01T10:00:00.000Z" }),
    entry(2, "New", { date: "2026-09-12T10:00:00.000Z" }),
    entry(3, "Someone else", { user: "another-profile" }),
  ]);
  assert.deepEqual(ids(search(document)), ["tx-2", "tx-1"]);
});

test("the query matches names, notes, relations, parent categories and amounts", () => {
  const document = documentWith([
    entry(1, "Flat white", { description: "Morning with the team" }),
    entry(2, "Bus ticket", {
      category: null,
      label: "label-work",
      place: "place-market",
      person: "person-dana",
      amount: 45.5,
    }),
  ]);
  assert.deepEqual(ids(search(document, { query: "morning" })), ["tx-1"]);
  // Parent category names reach child-category transactions.
  assert.deepEqual(ids(search(document, { query: "food" })), ["tx-1"]);
  assert.deepEqual(ids(search(document, { query: "carmel" })), ["tx-2"]);
  assert.deepEqual(ids(search(document, { query: "dana" })), ["tx-2"]);
  assert.deepEqual(ids(search(document, { query: "work" })), ["tx-2"]);
  assert.deepEqual(ids(search(document, { query: "45.50" })), ["tx-2"]);
  assert.equal(search(document, { query: "everyday" }).total, 2);
  // Every word must match, and case/accents are ignored.
  assert.deepEqual(ids(search(document, { query: "FLÂT everyday" })), ["tx-1"]);
  assert.equal(search(document, { query: "flat dana" }).total, 0);
});

test("a parent category filter includes its subcategories", () => {
  const document = documentWith([
    entry(1, "Apples"),
    entry(2, "Paycheck", { category: "category-salary", type: 1 }),
  ]);
  assert.deepEqual(ids(search(document, { categories: ["category-food"] })), [
    "tx-1",
  ]);
  assert.deepEqual(
    ids(search(document, { categories: ["category-groceries"] })),
    ["tx-1"],
  );
});

test("type, account, currency, amount and detail filters combine", () => {
  const document = documentWith([
    entry(1, "Small", { amount: 5 }),
    entry(2, "Large", { amount: 500, description: "note" }),
    entry(3, "Pay", { type: 1, amount: 1000, category: "category-salary" }),
    entry(4, "Move", { type: 2, toAccount: "account-euro", category: null }),
    entry(5, "Paris", {
      account: "account-euro",
      currencyCode: "EUR",
      receipt: "attachments/receipt.jpg",
    }),
  ]);
  assert.deepEqual(ids(search(document, { types: ["income"] })), ["tx-3"]);
  assert.deepEqual(ids(search(document, { types: ["transfer"] })), ["tx-4"]);
  // Transfers match either side of the move.
  assert.deepEqual(ids(search(document, { accounts: ["account-euro"] })), [
    "tx-4",
    "tx-5",
  ]);
  assert.deepEqual(ids(search(document, { currencies: ["EUR"] })), ["tx-5"]);
  assert.deepEqual(ids(search(document, { minAmount: 100, maxAmount: 600 })), [
    "tx-2",
  ]);
  assert.deepEqual(ids(search(document, { withNotes: true })), ["tx-2"]);
  assert.deepEqual(ids(search(document, { withReceipt: true })), ["tx-5"]);
  assert.equal(
    countActiveFilters({
      ...DEFAULT_SEARCH_FILTERS,
      query: "ignored",
      sort: "largest",
      types: ["income"],
      minAmount: 1,
      maxAmount: 5,
    }),
    2,
  );
});

test("periods use the financial month and sorting keeps newest-first ties", () => {
  const document = documentWith([
    entry(1, "August", { date: "2026-08-15T10:00:00.000Z", amount: 30 }),
    entry(2, "September", { date: "2026-09-05T10:00:00.000Z", amount: 30 }),
    entry(3, "Last year", { date: "2025-12-05T10:00:00.000Z", amount: 5 }),
  ]);
  assert.deepEqual(ids(search(document, { period: "cycle" })), ["tx-2"]);
  assert.deepEqual(ids(search(document, { period: "lastCycle" })), ["tx-1"]);
  assert.deepEqual(ids(search(document, { period: "year" })), ["tx-2", "tx-1"]);
  assert.deepEqual(ids(search(document, { sort: "oldest" })), [
    "tx-3",
    "tx-1",
    "tx-2",
  ]);
  assert.deepEqual(ids(search(document, { sort: "largest" })), [
    "tx-2",
    "tx-1",
    "tx-3",
  ]);
  assert.deepEqual(ids(search(document, { sort: "smallest" }))[0], "tx-3");
});

test("totals exclude transfers and keep unconverted currencies separate", () => {
  const document = documentWith([
    entry(1, "Lunch", { amount: 20 }),
    entry(2, "Pay", { type: 1, amount: 100 }),
    entry(3, "Move", { type: 2, amount: 50 }),
    entry(4, "Paris", {
      account: "account-euro",
      currencyCode: "EUR",
      amount: 7,
    }),
  ]);
  const outcome = search(document);
  assert.equal(outcome.total, 4);
  assert.equal(outcome.transfers, 1);
  assert.deepEqual(outcome.totals, [
    { currencyCode: "USD", income: 100, expense: 20, net: 80 },
    { currencyCode: "EUR", income: 0, expense: 7, net: -7 },
  ]);
});

test("facets list only used records, categories as a parent-first tree", () => {
  const document = documentWith([
    entry(1, "Apples", { label: "label-work" }),
    entry(2, "Pears"),
  ]);
  const { facets } = createSearchContext(document, "USD");
  assert.deepEqual(
    facets.categories.map((item) => [item.id, item.depth, item.count]),
    [
      ["category-food", 0, 2],
      ["category-groceries", 1, 2],
    ],
  );
  assert.deepEqual(
    facets.accounts.map((item) => item.id),
    ["account-main"],
  );
  assert.deepEqual(
    facets.labels.map((item) => item.label),
    ["Work"],
  );
  assert.deepEqual(facets.places, []);
  assert.deepEqual(
    facets.currencies.map((item) => item.id),
    ["USD"],
  );
});

test("filtering a large profile stays fast once the context is built", () => {
  const document = documentWith(
    Array.from({ length: 20000 }, (_, index) =>
      entry(index, index % 2 ? "Coffee" : "Rent", {
        date: new Date(2026, 8, 1 + (index % 19)).toISOString(),
      }),
    ),
  );
  const context = createSearchContext(document, "USD");
  const started = Date.now();
  for (const query of ["c", "co", "cof", "coffee"]) {
    const outcome = searchTransactions(
      context,
      { ...DEFAULT_SEARCH_FILTERS, query },
      NOW,
    );
    if (query === "coffee") assert.equal(outcome.total, 10000);
  }
  const elapsed = Date.now() - started;
  assert.ok(elapsed < 2000, `typing took ${elapsed}ms`);
});

const {
  buildSearchRows,
  nextSearchWindow,
  SEARCH_PAGE_SIZE,
} = require("../src/features/search/search-rows.ts");

function indexEntries(dates) {
  return dates.map((date, index) => ({
    id: `tx-${index}`,
    index,
    record: {},
    timestamp: new Date(date).getTime(),
  }));
}

test("rows cover only the loaded window, with day headers and card edges", () => {
  const entries = indexEntries([
    new Date(2026, 8, 12, 18),
    new Date(2026, 8, 12, 9),
    new Date(2026, 8, 11, 12),
    new Date(2026, 8, 10, 12),
  ]);
  const rows = buildSearchRows(entries, 3, true);
  assert.deepEqual(
    rows.map((row) =>
      row.kind === "day"
        ? `day:${row.dayKey}`
        : `${row.key}:${row.first ? "F" : ""}${row.last ? "L" : ""}`,
    ),
    ["day:2026-09-12", "tx-0:F", "tx-1:L", "day:2026-09-11", "tx-2:FL"],
  );
  // Rows point at the existing index entries; nothing is copied or projected.
  assert.equal(rows[1].entry, entries[0]);
});

test("growing the window keeps earlier rows identical for scrolling back", () => {
  const entries = indexEntries(
    Array.from(
      { length: 100 },
      (_, index) => new Date(2026, 8, 20 - (index % 9)),
    ),
  );
  const first = buildSearchRows(entries, SEARCH_PAGE_SIZE, true);
  const loaded = nextSearchWindow(SEARCH_PAGE_SIZE, entries.length);
  const second = buildSearchRows(entries, loaded, true);
  assert.equal(loaded, 80);
  assert.equal(nextSearchWindow(80, entries.length), 100);
  assert.equal(nextSearchWindow(100, entries.length), 100);
  // Same keys in the same order for the already-seen part of the list.
  const keys = (rows) => rows.map((row) => row.key);
  assert.deepEqual(
    keys(second).slice(0, first.length - 1),
    keys(first).slice(0, -1),
  );
  assert.equal(new Set(keys(second)).size, second.length);
});

test("amount sorting renders one card without day headers", () => {
  const rows = buildSearchRows(
    indexEntries([
      new Date(2026, 8, 1),
      new Date(2026, 8, 5),
      new Date(2026, 8, 3),
    ]),
    40,
    false,
  );
  assert.deepEqual(
    rows.map((row) => [row.kind, row.first, row.last]),
    [
      ["transaction", true, false],
      ["transaction", false, false],
      ["transaction", false, true],
    ],
  );
});

test("growing the window reuses unchanged row objects so cells skip re-rendering", () => {
  const entries = indexEntries(
    Array.from(
      { length: 90 },
      (_, index) => new Date(2026, 8, 20 - Math.floor(index / 30)),
    ),
  );
  const first = buildSearchRows(entries, 40, true);
  const second = buildSearchRows(entries, 80, true);
  const byKey = new Map(first.map((row) => [row.key, row]));
  const changed = second
    .slice(0, first.length)
    .filter((row) => byKey.get(row.key) !== row)
    .map((row) => row.key);
  // Only the old window's last row changes: it is no longer the card's end.
  assert.deepEqual(changed, ["tx-39"]);
});
