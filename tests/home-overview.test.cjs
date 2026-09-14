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
const { createLegacyDevelopmentBackup: createDefaultBackup } = require("./fixtures/legacy-development-backup.ts");
const { parseExchangeRates } = require("../src/data/model/exchange-rate.ts");
const {
  selectHomeOverview,
  selectBudgets,
} = require("../src/data/selectors/document-selectors.ts");
const {
  budgetDefaults,
  saveBudget,
} = require("../src/data/model/budget-record.ts");
const { recurringDefaults } = require("../src/data/model/recurring-record.ts");
const now = new Date(2026, 8, 13, 12);
function fixture() {
  const d = createDefaultBackup();
  d.users = [
    { uuid: "me", id: 1, currency: "ILS" },
    { uuid: "other", id: 2, currency: "ILS" },
  ];
  d._local.selectedProfileId = "me";
  d.accounts = [
    { uuid: "bank", id: 10, user: "me", amount: 3000, currencyCode: "ILS" },
    { uuid: "cash", user: "me", amount: 200, currencyCode: "ILS" },
    { uuid: "card", user: "me", amount: -500, currencyCode: "ILS" },
    {
      uuid: "excluded",
      id: 11,
      user: "me",
      amount: 90000,
      currencyCode: "ILS",
      isExcluded: true,
    },
    { uuid: "foreign", user: "other", amount: 90000, currencyCode: "ILS" },
  ];
  d.transactions = [];
  d.budgets = [];
  return d;
}
function transaction(extra = {}) {
  return {
    uuid: "tx",
    name: "Groceries",
    user: 1,
    type: 0,
    amount: 500,
    account: 10,
    currencyCode: "ILS",
    date: new Date(2026, 8, 12, 12).toISOString(),
    ...extra,
  };
}
function schedule(extra = {}) {
  return {
    ...recurringDefaults(now),
    uuid: "rent",
    name: "Rent",
    user: 1,
    account: "bank",
    currencyCode: "ILS",
    amount: 100,
    period: "Monthly",
    startAt: new Date(2026, 8, 14, 10).toISOString(),
    nextIndex: 0,
    occurrences: [],
    ...extra,
  };
}

test("home balances include all included accounts, negative balances, and only the active profile", () => {
  const d = fixture();
  const original = JSON.stringify(d);
  const s = selectHomeOverview(d, "ILS", now);
  assert.equal(s.balance.amount, 2700);
  assert.equal(s.assets.amount, 3200);
  assert.equal(s.debt.amount, 500);
  assert.equal(s.accountCount, 3);
  assert.equal(JSON.stringify(d), original);
});

test("monthly flow excludes transfers, future records, previous months, excluded and foreign accounts", () => {
  const d = fixture();
  d.transactions = [
    transaction(),
    transaction({ uuid: "income", type: 1, amount: 2000 }),
    transaction({
      uuid: "fx",
      currencyCode: "USD",
      amount: 10,
      accountAmount: 37,
      accountCurrencyCode: "ILS",
    }),
    transaction({ uuid: "transfer", type: 2, amount: 3000 }),
    transaction({ uuid: "excluded", account: 11 }),
    transaction({ uuid: "foreign", account: "foreign" }),
    transaction({ uuid: "other", user: 2 }),
    transaction({ uuid: "old", date: new Date(2026, 7, 31).toISOString() }),
    transaction({ uuid: "future", date: new Date(2026, 8, 14).toISOString() }),
    transaction({ uuid: "bad-date", date: "invalid" }),
  ];
  const s = selectHomeOverview(d, "ILS", now);
  assert.equal(s.income.amount, 2000);
  assert.equal(s.expense.amount, 537);
  assert.equal(s.net.amount, 1463);
  assert.equal(s.dailyExpense.amount, 537 / 13);
  assert.equal(s.transactionCount, 3);
});

test("foreign balances use saved direct or inverse rates and retain unavailable currencies separately", () => {
  const d = fixture();
  d.accounts.push({
    uuid: "usd",
    user: "me",
    amount: 100,
    currencyCode: "USD",
  });
  d.accounts.push({
    uuid: "eur",
    user: "me",
    amount: -50,
    currencyCode: "EUR",
  });
  d.exchangeRates = [
    parseExchangeRates(
      { date: "2026-09-13", usd: { usd: 1, ils: 4 } },
      "USD",
      now,
    ),
  ];
  let s = selectHomeOverview(d, "ILS", now);
  assert.equal(s.balance.amount, 3100);
  assert.equal(s.balance.rateDate, "2026-09-13");
  assert.deepEqual(s.balance.unconverted, [
    { currencyCode: "EUR", amount: -50 },
  ]);
  d.exchangeRates = [
    parseExchangeRates(
      { date: "2026-09-13", ils: { ils: 1, usd: 0.25 } },
      "ILS",
      now,
    ),
  ];
  s = selectHomeOverview(d, "ILS", now);
  assert.equal(s.balance.amount, 3100);
});

test("recurring forecast counts each pending occurrence, skips processed/archived/excluded schedules, and separates overdue", () => {
  const d = fixture();
  d.recurrings = [
    schedule(),
    schedule({ uuid: "weekly", period: "Weekly", amount: 20 }),
    schedule({ uuid: "salary", type: 1, amount: 1000 }),
    schedule({ uuid: "archived", archived: true }),
    schedule({ uuid: "excluded", account: 11 }),
    schedule({ uuid: "foreign", account: "foreign" }),
    schedule({
      uuid: "processed",
      nextIndex: 1,
      occurrences: [
        {
          scheduledAt: new Date(2026, 8, 14, 10).toISOString(),
          status: "processed",
          amount: 100,
          currencyCode: "ILS",
          type: 0,
        },
      ],
    }),
    schedule({
      uuid: "overdue",
      startAt: new Date(2026, 8, 10, 10).toISOString(),
      amount: 50,
    }),
    schedule({
      uuid: "outside",
      startAt: new Date(2026, 9, 13, 10).toISOString(),
    }),
  ];
  const s = selectHomeOverview(d, "ILS", now);
  assert.equal(s.upcomingExpense.amount, 250); // Rent + five weekly payments + next month's overdue schedule.
  assert.equal(s.upcomingIncome.amount, 1000);
  assert.equal(s.upcomingNet.amount, 750);
  assert.equal(s.overdueCount, 1);
  assert.equal(s.upcomingCount, 8);
  assert.equal(s.next.name, "Rent");
});

function budgetDocument(extra = {}, at = now) {
  return saveBudget(
    fixture(),
    {
      ...budgetDefaults(),
      name: "Monthly",
      amount: "3000",
      currencyCode: "ILS",
      budgetType: "Overall",
      ...extra,
    },
    "budget",
    at.toISOString(),
  );
}
test("September 13: original daily plan is 100 and remaining daily allowance is 2500 / 18", () => {
  const d = budgetDocument();
  d.transactions = [transaction()];
  const b = selectBudgets(d, now)[0];
  assert.equal(b.periodDays, 30);
  assert.equal(b.daysLeft, 18);
  assert.equal(b.dailyPlan, 100);
  assert.equal(b.dailyAllowance, 2500 / 18);
  assert.equal(b.periodStatus, "active");
});
test("daily pacing handles leap years, last day, overspending and inactive custom periods", () => {
  const leap = new Date(2028, 1, 29, 12);
  let d = budgetDocument({}, leap);
  let b = selectBudgets(d, leap)[0];
  assert.equal(b.periodDays, 29);
  assert.equal(b.daysLeft, 1);
  assert.equal(b.dailyAllowance, 3000);
  d.transactions = [transaction({ amount: 3500, date: leap.toISOString() })];
  assert.equal(selectBudgets(d, leap)[0].dailyAllowance, 0);
  d = budgetDocument({
    period: "Custom",
    startDate: "2026-09-15",
    endDate: "2026-09-20",
  });
  b = selectBudgets(d, now)[0];
  assert.equal(b.periodDays, 6);
  assert.equal(b.dailyAllowance, 0);
  assert.equal(b.periodStatus, "upcoming");
  assert.equal(
    selectBudgets(d, new Date(2026, 8, 21))[0].periodStatus,
    "ended",
  );
});
test("empty home overview produces finite zeroes", () => {
  const d = fixture();
  d.accounts = [];
  const s = selectHomeOverview(d, "ILS", now);
  for (const key of [
    "balance",
    "net",
    "dailyExpense",
    "upcomingExpense",
    "upcomingIncome",
  ])
    assert.equal(s[key].amount, 0);
  assert.equal(s.next, null);
});
