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
const { financialMonth } = require("../src/data/model/financial-month.ts");
const {
  createTransactionIndex,
  createTransactionProjector,
  selectTransactionPeriod,
  transactionPeriodBounds,
  selectTransactions,
} = require("../src/data/selectors/transaction-selectors.ts");
const {
  selectHomeOverview,
} = require("../src/data/selectors/document-selectors.ts");
const { createDefaultBackup } = require("../src/data/model/default-backup.ts");

function fixture() {
  const d = createDefaultBackup();
  d.users = [
    { uuid: "me", id: 1 },
    { uuid: "other", id: 2 },
  ];
  d._local.selectedProfileId = "me";
  d.accounts = [
    {
      uuid: "bank",
      id: 10,
      name: "Bank",
      user: "me",
      amount: 1000,
      currencyCode: "USD",
    },
  ];
  d.categories = [
    { uuid: "food", id: 20, name: "Food", icon: "food", color: "#123456" },
  ];
  d.transactions = [];
  return d;
}
function parts(date) {
  return [
    date.getFullYear(),
    date.getMonth() + 1,
    date.getDate(),
    date.getHours(),
  ];
}
function tx(uuid, date, extra = {}) {
  return {
    uuid,
    name: uuid,
    date: date.toISOString(),
    amount: 10,
    type: 0,
    user: "me",
    account: 10,
    category: 20,
    ...extra,
  };
}

test("financial months use local midnight and the saved start day on both sides of its boundary", () => {
  const before = financialMonth(new Date(2026, 8, 9, 23, 59, 59), 10);
  assert.deepEqual(parts(before.start), [2026, 8, 10, 0]);
  assert.deepEqual(parts(before.end), [2026, 9, 10, 0]);
  const current = financialMonth(new Date(2026, 8, 10), 10);
  assert.deepEqual(parts(current.start), [2026, 9, 10, 0]);
  assert.deepEqual(parts(current.end), [2026, 10, 10, 0]);
  const previous = financialMonth(new Date(2026, 8, 10), 10, -1);
  assert.equal(previous.end.getTime(), current.start.getTime());
});

test("days 29–31 clamp independently in February, leap years, and year transitions", () => {
  for (const day of [29, 30, 31]) {
    const common = financialMonth(new Date(2026, 1, 28), day);
    assert.deepEqual(parts(common.start), [2026, 2, 28, 0]);
    assert.deepEqual(parts(common.end), [2026, 3, day, 0]);
    const leap = financialMonth(new Date(2028, 1, 29), day);
    assert.deepEqual(parts(leap.start), [2028, 2, 29, 0]);
    assert.deepEqual(parts(leap.end), [2028, 3, day, 0]);
    const january = financialMonth(new Date(2026, 0, 1), day);
    assert.deepEqual(parts(january.start), [2025, 12, day, 0]);
    assert.deepEqual(parts(january.end), [2026, 1, day, 0]);
  }
  const calendar = financialMonth(new Date(2026, 8, 16), 1);
  assert.deepEqual(parts(calendar.start), [2026, 9, 1, 0]);
  assert.deepEqual(parts(calendar.end), [2026, 10, 1, 0]);
});

test("financial months retain local calendar boundaries across daylight saving changes", () => {
  const previousTZ = process.env.TZ;
  try {
    process.env.TZ = "America/New_York";
    const spring = financialMonth(new Date(2026, 2, 20), 1);
    assert.deepEqual(parts(spring.start), [2026, 3, 1, 0]);
    assert.deepEqual(parts(spring.end), [2026, 4, 1, 0]);
    assert.equal(spring.end - spring.start, (31 * 24 - 1) * 3_600_000);
    const autumn = financialMonth(new Date(2026, 10, 20), 1);
    assert.equal(autumn.end - autumn.start, (30 * 24 + 1) * 3_600_000);
  } finally {
    if (previousTZ === undefined) delete process.env.TZ;
    else process.env.TZ = previousTZ;
  }
});

test("month selection is start-inclusive/end-exclusive, newest first, and accepts UUID/numeric owners", () => {
  const d = fixture();
  const { start, end } = financialMonth(new Date(2026, 8, 16), 10);
  d.transactions = [
    tx("start", start),
    tx("before", new Date(start - 1)),
    tx("next-month", end),
    tx("last", new Date(end - 1), { user: "1", type: 2 }),
    tx("foreign", new Date(end - 2), { user: 2 }),
    tx("numeric", new Date(end - 3), { user: 1 }),
    tx("fallback", new Date(end - 4), {
      date: undefined,
      createdAt: new Date(end - 4).toISOString(),
    }),
    tx("undated", start, { date: "invalid" }),
  ];
  const index = createTransactionIndex(d);
  assert.deepEqual(
    selectTransactionPeriod(index, start, end).map((t) => t.id),
    ["last", "numeric", "fallback", "start"],
  );
  assert.equal(transactionPeriodBounds(index, start, end).count, 4);
  assert.equal(
    selectTransactionPeriod(index, new Date(2030, 0, 1), new Date(2030, 1, 1))
      .length,
    0,
  );
  assert.equal(index.at(-1).id, "undated");
  assert.equal(selectTransactions(d).at(-1).occurredAtIso, "invalid");
});

test("lazy rows retain icon, currency, receipt and relationship details with numeric/string aliases", () => {
  const d = fixture();
  d.budgets = [{ uuid: "budget", id: 30, name: "Groceries" }];
  d.labels = [{ uuid: "label", id: 40, name: "Shared" }];
  d.peoples = [{ uuid: "person", id: 50, name: "Taylor" }];
  d.transactions = [
    tx("income", new Date(2026, 8, 15), {
      type: 1,
      category: "20",
      account: "10",
      budget: "30",
      tags: [40],
      person: "50",
      receipt: "attachments/receipt.jpg",
      accountAmount: 37,
      currencyCode: "EUR",
      exchangeRate: 3.7,
    }),
  ];
  const row = createTransactionProjector(d)(createTransactionIndex(d)[0]);
  assert.equal(row.icon, "food");
  assert.equal(row.color, "#123456");
  assert.equal(row.amount, 10);
  assert.equal(row.currencyCode, "EUR");
  assert.equal(row.accountAmount, 37);
  assert.equal(row.accountCurrencyCode, "USD");
  assert.equal(row.accountId, "bank");
  assert.equal(row.budgetName, "Groceries");
  assert.equal(row.labelName, "Shared");
  assert.equal(row.personName, "Taylor");
  assert.equal(row.receiptPath, "attachments/receipt.jpg");
});

test("100,000-record history prepares only requested pages and formats only mounted rows", () => {
  const d = fixture();
  let formattedNames = 0;
  for (let i = 0; i < 100_000; i++) {
    const record = tx(
      `tx-${i}`,
      new Date(2026, i % 12, 1, 12, 0, Math.floor(i / 12)),
      { user: i % 7 === 0 ? "other" : "me" },
    );
    Object.defineProperty(record, "name", {
      get() {
        formattedNames++;
        return `Transaction ${i}`;
      },
    });
    d.transactions.push(record);
  }
  const index = createTransactionIndex(d);
  const { start, end } = financialMonth(new Date(2026, 8, 16), 1);
  const count = transactionPeriodBounds(index, start, end).count;
  assert.ok(count > 7000);
  const firstPage = selectTransactionPeriod(index, start, end, 30);
  assert.equal(firstPage.length, 30);
  assert.equal(formattedNames, 0);
  const project = createTransactionProjector(d);
  firstPage.slice(0, 10).map(project);
  assert.equal(formattedNames, 10);
  const secondPage = selectTransactionPeriod(index, start, end, 60);
  assert.deepEqual(secondPage.slice(0, 30), firstPage);
  assert.equal(formattedNames, 10);
  const fullMonth = selectTransactionPeriod(index, start, end, count + 30);
  assert.equal(fullMonth.length, count);
  assert.equal(new Set(fullMonth.map((t) => t.id)).size, count);
  for (let i = 0; i < fullMonth.length; i++) {
    assert.ok(fullMonth[i].timestamp >= start && fullMonth[i].timestamp < end);
    if (i > 0) assert.ok(fullMonth[i - 1].timestamp >= fullMonth[i].timestamp);
  }
  const overview = selectHomeOverview(d, "USD", new Date(2026, 8, 16));
  assert.equal(overview.transactionCount, count);
  assert.equal(
    formattedNames,
    10,
    "overview aggregates without projecting rows",
  );
});

test("overview totals and daily pacing use the same saved financial month", () => {
  const d = fixture();
  d._local.monthStartDay = 10;
  d.transactions = [
    tx("previous", new Date(2026, 8, 9)),
    tx("current", new Date(2026, 8, 10), { amount: 40 }),
    tx("income", new Date(2026, 8, 11), { amount: 100, type: 1 }),
  ];
  const overview = selectHomeOverview(d, "USD", new Date(2026, 8, 13, 12));
  assert.equal(overview.transactionCount, 2);
  assert.equal(overview.expense.amount, 40);
  assert.equal(overview.income.amount, 100);
  assert.equal(overview.dailyExpense.amount, 10);
});

test("device-test backup history is navigable without losing records at custom month boundaries", () => {
  const d = JSON.parse(
    fs.readFileSync(
      path.resolve(__dirname, "../test-data/plutus-device-test-2026-09.json"),
      "utf8",
    ),
  );
  const index = createTransactionIndex(d);
  const ids = new Set();
  for (let offset = 0; offset > -7; offset--) {
    const { start, end } = financialMonth(new Date(2026, 8, 16), 10, offset);
    for (const record of selectTransactionPeriod(index, start, end)) {
      assert.ok(
        !ids.has(record.id),
        "a record must appear in exactly one financial month",
      );
      ids.add(record.id);
    }
  }
  assert.equal(ids.size, index.length);
});
