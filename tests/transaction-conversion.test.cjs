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
  createTransactionDraft,
  saveTransaction,
  transactionDraftFromRecord,
  deleteTransaction,
} = require("../src/data/model/transaction-record.ts");
const {
  parseExchangeRates,
  storeExchangeRates,
} = require("../src/data/model/exchange-rate.ts");
const {
  transactionMoney,
} = require("../src/data/model/transaction-conversion.ts");
const {
  cardPaymentConversion,
  settleDueCardPayments,
} = require("../src/data/model/card-payment.ts");
const {
  selectHomeOverview,
  selectMonthlySummary,
  selectDailySpending,
  selectSpendingCategories,
  selectAccounts,
} = require("../src/data/selectors/document-selectors.ts");
const {
  selectCategoryMonthlyTotals,
} = require("../src/data/selectors/category-selectors.ts");
const {
  normalizeBackupDocument,
} = require("../src/data/model/normalize-backup.ts");
const {
  createJsonBackupDocument,
  createFullBackupDocument,
} = require("../src/data/backup/document-export.ts");
const {
  writeDocument,
  readDocument,
} = require("../src/data/database/document-repository.ts");
const {
  migrateLocalDatabase,
  DATABASE_VERSION,
} = require("../src/data/database/migrations.ts");
const { DatabaseSync } = require("node:sqlite");
const {
  budgetDefaults,
  saveBudget,
} = require("../src/data/model/budget-record.ts");
const { selectBudgets } = require("../src/data/selectors/budget-selectors.ts");

const reportDate = new Date("2026-09-17T12:00:00.000Z");
const paymentDate = new Date("2026-09-20T12:00:00.000Z");
function rate(value, day = 15) {
  const now = new Date(`2026-09-${day}T12:00:00.000Z`);
  return parseExchangeRates(
    {
      date: now.toISOString().slice(0, 10),
      usd: { usd: 1, ils: value, eur: value / 2 },
    },
    "USD",
    now,
  );
}
function fixture(bankCurrency = "ILS", kind = "card") {
  const document = createLegacyDevelopmentBackup();
  document.users.find((user) => user.uuid === "alex-personal").currency = "ILS";
  document._local.mainCurrency = "ILS";
  document.transactions = [];
  document.exchangeRates = [];
  document.accounts = [
    {
      uuid: "foreign",
      name: "Foreign",
      user: "alex-personal",
      accountType: kind,
      amount: 0,
      currencyCode: "USD",
      linkedBankAccountId: "bank",
      paymentDay: 20,
      createdAt: "2026-08-01T12:00:00.000Z",
      transactions: [],
    },
    {
      uuid: "bank",
      name: "Bank",
      user: "alex-personal",
      accountType: "bank",
      amount: 1000,
      currencyCode: bankCurrency,
      transactions: [],
    },
  ];
  document.categories = [
    {
      uuid: "food",
      name: "Food",
      user: "alex-personal",
      type: 0,
      transactions: [],
    },
  ];
  return document;
}
function purchase(document, id, snapshot, overrides = {}) {
  return saveTransaction(
    document,
    {
      ...createTransactionDraft(),
      name: "Purchase",
      amount: "20",
      currencyCode: "USD",
      accountCurrencyCode: "USD",
      accountId: "foreign",
      categoryId: "food",
      occurredAt: snapshot.fetchedAt,
      conversionSnapshot: snapshot,
      ...overrides,
    },
    id,
    "alex-personal",
    snapshot.fetchedAt,
  );
}
function twoPurchases(bankCurrency = "ILS") {
  return purchase(
    purchase(fixture(bankCurrency), "first", rate(3)),
    "second",
    rate(4, 16),
  );
}

test("profile snapshots keep USD amounts native while reports preserve both historic rates", () => {
  const document = twoPurchases();
  assert.deepEqual(
    document.transactions.map((record) => [
      record.amount,
      record.currencyCode,
      record.accountAmount,
      record.profileAmount,
      record.profileCurrencyCode,
    ]),
    [
      [20, "USD", 20, 60, "ILS"],
      [20, "USD", 20, 80, "ILS"],
    ],
  );
  assert.equal(document.accounts[0].amount, -40);
  const repriced = storeExchangeRates(document, rate(9, 17));
  assert.equal(
    selectHomeOverview(repriced, "ILS", reportDate).expense.amount,
    140,
  );
  assert.equal(selectMonthlySummary(repriced, reportDate).spent, 140);
  assert.equal(selectSpendingCategories(repriced, reportDate)[0].amount, 140);
  assert.equal(
    selectDailySpending(repriced, reportDate).reduce(
      (sum, day) => sum + day.amount,
      0,
    ),
    140,
  );
  assert.equal(selectAccounts(repriced, reportDate)[0].currentSpent, 40);
  // Frozen full tables can also report in another currency without a network request.
  assert.equal(transactionMoney(document.transactions[0], "EUR").amount, 30);
  assert.equal(
    selectCategoryMonthlyTotals(repriced, reportDate).get("food").amounts.ILS,
    140,
  );
});

test("budgets use recorded conversions for daily, weekly, monthly and yearly tracking", () => {
  for (const period of ["Daily", "Weekly", "Monthly", "Yearly"]) {
    const document = purchase(fixture(), "purchase", rate(3, 17));
    const budgeted = saveBudget(
      document,
      {
        ...budgetDefaults(),
        name: "Food",
        amount: "1000",
        currencyCode: "ILS",
        categories: ["food"],
        period,
      },
      "budget",
      reportDate.toISOString(),
    );
    const result = selectBudgets(budgeted, reportDate).find(
      (budget) => budget.id === "budget",
    );
    assert.equal(result.tracked, 60);
    assert.equal(result.excludedCurrencyCount, 0);
  }
});

test("profile currency wins over global preferences and currency edits capture a new pair", () => {
  let document = fixture();
  document._local.mainCurrency = "USD";
  document = purchase(document, "purchase", rate(3));
  assert.equal(document.transactions[0].profileCurrencyCode, "ILS");
  const snapshot = parseExchangeRates(
    { date: "2026-09-17", eur: { eur: 1, usd: 2 / 3, ils: 2 } },
    "EUR",
    reportDate,
  );
  const edited = saveTransaction(
    document,
    {
      ...transactionDraftFromRecord(document, "purchase"),
      currencyCode: "EUR",
      exchangeRate: 2 / 3,
      exchangeRateDate: snapshot.date,
      exchangeRateFetchedAt: snapshot.fetchedAt,
      exchangeRateSource: snapshot.source,
      conversionSnapshot: snapshot,
    },
    "purchase",
    "alex-personal",
    reportDate.toISOString(),
    true,
  );
  assert.equal(edited.transactions[0].amount, 20);
  assert.equal(edited.transactions[0].currencyCode, "EUR");
  assert.equal(edited.transactions[0].accountAmount, 13.33);
  assert.equal(edited.transactions[0].profileAmount, 40);
  assert.equal(edited.transactions[0].conversionSnapshot.base, "EUR");
});

test("a third account currency is independent from the profile and bank payout currency", () => {
  const document = fixture();
  document.accounts[0].currencyCode = "EUR";
  const snapshot = rate(3);
  const saved = purchase(document, "purchase", snapshot, {
    accountCurrencyCode: "EUR",
    exchangeRate: 1.5,
    exchangeRateDate: snapshot.date,
    exchangeRateFetchedAt: snapshot.fetchedAt,
    exchangeRateSource: snapshot.source,
  });
  assert.equal(saved.accounts[0].amount, -30);
  assert.equal(saved.transactions[0].amount, 20);
  assert.equal(saved.transactions[0].profileAmount, 60);
  const paid = settleDueCardPayments(saved, paymentDate);
  assert.equal(paid.accounts[1].amount, 940);
});

test("editing amount/name retains the original rate even when the shared cache has changed", () => {
  const document = storeExchangeRates(twoPurchases(), rate(9, 17));
  const draft = transactionDraftFromRecord(document, "first");
  const edited = saveTransaction(
    document,
    { ...draft, amount: "25", name: "Edited" },
    "first",
    "alex-personal",
    reportDate.toISOString(),
    true,
  );
  assert.equal(edited.transactions[0].profileAmount, 75);
  assert.equal(edited.transactions[0].conversionSnapshot.rates.ILS, 3);
  assert.equal(
    edited.transactions[0].conversionCapturedAt,
    document.transactions[0].conversionCapturedAt,
  );
  assert.equal(selectMonthlySummary(edited, reportDate).spent, 155);
});

test("new foreign transactions require a profile conversion rather than silently mixing amounts", () => {
  assert.throws(
    () => purchase(fixture(), "missing", rate(3), { conversionSnapshot: null }),
    /rate|conversion/i,
  );
});

test("credit, bank, cash and savings all retain foreign transaction snapshots", () => {
  for (const kind of ["card", "bank", "cash", "savings"]) {
    const document = purchase(fixture("ILS", kind), "purchase", rate(3));
    assert.equal(document.accounts[0].amount, -20);
    assert.equal(document.transactions[0].profileAmount, 60);
  }
});

test("foreign income and same-currency transfers also capture the profile rate", () => {
  let document = fixture("USD");
  document = purchase(document, "income", rate(3), { type: 1, categoryId: "" });
  document = purchase(document, "transfer", rate(4, 16), {
    type: 2,
    destinationAccountId: "bank",
    categoryId: "",
  });
  assert.equal(document.transactions[0].profileAmount, 60);
  assert.equal(document.transactions[1].profileAmount, 80);
  assert.equal(document.accounts[1].amount, 1020);
  assert.equal(selectMonthlySummary(document, reportDate).income, 60);
  assert.equal(selectMonthlySummary(document, reportDate).spent, 0);
});

test("ILS bank payout uses each captured USD rate with no shared rate cache", () => {
  const document = twoPurchases();
  const conversion = cardPaymentConversion(
    document,
    document.accounts[0],
    document.accounts[1],
    paymentDate,
  );
  assert.equal(conversion.missingAmount, 0);
  assert.equal(conversion.bankAmount, 140);
  const paid = settleDueCardPayments(document, paymentDate);
  assert.equal(paid.accounts[0].amount, 0);
  assert.equal(paid.accounts[1].amount, 860);
  assert.deepEqual(
    paid.transactions
      .at(-1)
      .cardPaymentAllocations.map((allocation) => allocation.bankAmount),
    [60, 80],
  );
  assert.equal(settleDueCardPayments(paid, paymentDate), paid);
  assert.equal(selectMonthlySummary(paid, paymentDate).spent, 140);
});

test("USD bank payout stays in USD even when the profile is ILS", () => {
  const paid = settleDueCardPayments(twoPurchases("USD"), paymentDate);
  assert.equal(paid.accounts[1].amount, 960);
  assert.equal(paid.transactions.at(-2).currencyCode, "USD");
  assert.equal(paid.transactions.at(-2).amount, 40);
  assert.equal(selectMonthlySummary(paid, paymentDate).spent, 140);
});

test("refunds reduce the bank payout using their own recorded rate", () => {
  const document = purchase(twoPurchases(), "refund", rate(5, 17), {
    type: 1,
    amount: "5",
    categoryId: "",
  });
  const paid = settleDueCardPayments(document, paymentDate);
  assert.equal(paid.accounts[1].amount, 885);
  assert.equal(paid.transactions.at(-2).sourceAmount, 35);
  assert.equal(paid.transactions.at(-2).targetAmount, 115);
});

test("the next payout ignores settled purchases and uses the new purchase's rate", () => {
  const paid = settleDueCardPayments(twoPurchases(), paymentDate);
  const next = purchase(paid, "new", rate(5, 21));
  const again = settleDueCardPayments(
    next,
    new Date("2026-10-20T12:00:00.000Z"),
  );
  assert.equal(again.accounts[1].amount, 760);
  assert.equal(again.transactions.at(-1).cardPaymentAllocations.length, 1);
  assert.equal(
    again.transactions.at(-1).cardPaymentAllocations[0].transactionId,
    "new",
  );
});

test("editing a paid purchase charges only its captured-rate difference on the next payout", () => {
  const paid = settleDueCardPayments(twoPurchases(), paymentDate);
  const draft = transactionDraftFromRecord(paid, "first");
  const edited = saveTransaction(
    paid,
    { ...draft, amount: "25" },
    "first",
    "alex-personal",
    reportDate.toISOString(),
    true,
  );
  const next = settleDueCardPayments(
    edited,
    new Date("2026-10-20T12:00:00.000Z"),
  );
  assert.equal(next.accounts[1].amount, 845);
});

test("deleting a paid purchase preserves its historical credit against new purchases", () => {
  const paid = settleDueCardPayments(twoPurchases(), paymentDate);
  const deleted = deleteTransaction(
    paid,
    "first",
    "alex-personal",
    reportDate.toISOString(),
  );
  const purchased = purchase(deleted, "new", rate(5, 21), { amount: "30" });
  const next = settleDueCardPayments(
    purchased,
    new Date("2026-10-20T12:00:00.000Z"),
  );
  assert.equal(next.accounts[1].amount, 770);
});

test("missing opening-balance rates keep the payout pending and do not change recorded rates", () => {
  const document = twoPurchases();
  document.accounts[0].amount -= 10;
  assert.equal(settleDueCardPayments(document, paymentDate), document);
  const snapshot = parseExchangeRates(
    { date: "2026-09-20", usd: { usd: 1, ils: 6 } },
    "USD",
    paymentDate,
  );
  const paid = settleDueCardPayments(
    storeExchangeRates(document, snapshot),
    paymentDate,
  );
  assert.equal(paid.accounts[1].amount, 800);
  assert.equal(paid.transactions[0].profileAmount, 60);
});

test("JSON/full backup round trips retain immutable snapshots and payout allocations", () => {
  const paid = settleDueCardPayments(twoPurchases(), paymentDate);
  paid.transactions[0].conversionSnapshot.custom = { preserved: true };
  for (const exporter of [createJsonBackupDocument, createFullBackupDocument]) {
    const restored = normalizeBackupDocument(
      JSON.parse(JSON.stringify(exporter(paid))),
    );
    assert.equal(transactionMoney(restored.transactions[0], "ILS").amount, 60);
    assert.deepEqual(restored.transactions[0].conversionSnapshot.custom, {
      preserved: true,
    });
    assert.deepEqual(
      restored.transactions.at(-1).cardPaymentAllocations,
      paid.transactions.at(-1).cardPaymentAllocations,
    );
    assert.equal(settleDueCardPayments(restored, paymentDate), restored);
  }
});

test("SQLite v17 upgrades preserve records, snapshots, unknown fields and the original checkpoint", async () => {
  const sql = new DatabaseSync(":memory:");
  const db = {
    execAsync: async (s) => sql.exec(s),
    getFirstAsync: async (s, ...args) => sql.prepare(s).get(...args),
    getAllAsync: async (s, ...args) => sql.prepare(s).all(...args),
    runAsync: async (s, ...args) => sql.prepare(s).run(...args),
    withExclusiveTransactionAsync: async (work) => {
      sql.exec("BEGIN");
      try {
        await work(db);
        sql.exec("COMMIT");
      } catch (error) {
        sql.exec("ROLLBACK");
        throw error;
      }
    },
  };
  try {
    const document = twoPurchases();
    document._local.schemaVersion = 17;
    document.future = { retain: true };
    const original = JSON.stringify(document);
    sql.exec(
      "CREATE TABLE app_document (id INTEGER PRIMARY KEY, schema_version INTEGER NOT NULL, document_json TEXT NOT NULL, updated_at TEXT NOT NULL); CREATE TABLE app_storage_identity (id INTEGER PRIMARY KEY, had_profile INTEGER NOT NULL); INSERT INTO app_storage_identity VALUES (1, 1); PRAGMA user_version = 17",
    );
    sql
      .prepare("INSERT INTO app_document VALUES (1, 17, ?, ?)")
      .run(original, reportDate.toISOString());
    await migrateLocalDatabase(db);
    const restored = await readDocument(db);
    assert.equal(restored._local.schemaVersion, DATABASE_VERSION);
    assert.deepEqual(restored.future, { retain: true });
    assert.equal(transactionMoney(restored.transactions[0], "ILS").amount, 60);
    assert.equal(
      sql.prepare("SELECT document_json FROM app_migration_snapshots").get()
        .document_json,
      original,
    );
    assert.equal(
      sql.prepare("SELECT had_profile FROM app_storage_identity").get()
        .had_profile,
      1,
    );
    await writeDocument(db, restored);
    assert.equal((await readDocument(db)).transactions[1].profileAmount, 80);
  } finally {
    sql.close();
  }
});
