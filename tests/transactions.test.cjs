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

const { createLegacyDevelopmentBackup: createDefaultBackup } = require("./fixtures/legacy-development-backup.ts");
const {
  normalizeBackupDocument,
} = require("../src/data/model/normalize-backup.ts");
const {
  createTransactionDraft,
  deleteTransaction,
  saveTransaction,
  saveTransactionTemplate,
  transactionDraftFromRecord,
} = require("../src/data/model/transaction-record.ts");
const {
  createJsonBackupDocument,
} = require("../src/data/backup/document-export.ts");
const {
  selectMonthlySummary,
  selectTransactions,
} = require("../src/data/selectors/document-selectors.ts");

const now = "2026-09-09T12:00:00.000Z";

function fixture() {
  const document = createDefaultBackup();
  document.transactions = [];
  document.templates = [];
  document.accounts = [
    {
      uuid: "checking",
      user: "alex-personal",
      name: "Checking",
      amount: 100,
      currencyCode: "USD",
      transactions: [],
    },
    {
      uuid: "savings",
      user: "alex-personal",
      name: "Savings",
      amount: 50,
      currencyCode: "USD",
      transactions: [],
    },
  ];
  document.categories = [
    {
      uuid: "food",
      user: "alex-personal",
      name: "Food",
      type: 0,
      transactions: [],
    },
    {
      uuid: "move",
      user: "alex-personal",
      name: "Move",
      type: 2,
      transactions: [],
    },
  ];
  return document;
}

function draft(overrides = {}) {
  return {
    ...createTransactionDraft(),
    name: "Lunch",
    amount: "12.50",
    accountId: "checking",
    categoryId: "food",
    occurredAt: now,
    ...overrides,
  };
}

test("create, edit to transfer, and delete atomically reverse account effects", () => {
  let document = saveTransaction(
    fixture(),
    draft(),
    "transaction",
    "alex-personal",
    now,
  );
  assert.equal(document.accounts[0].amount, 87.5);
  assert.deepEqual(document.accounts[0].transactions, ["transaction"]);
  assert.deepEqual(document.categories[0].transactions, ["transaction"]);

  document.transactions[0].unknownImportedValue = { preserved: true };
  document = saveTransaction(
    document,
    draft({
      type: 2,
      amount: "20",
      categoryId: "move",
      destinationAccountId: "savings",
    }),
    "transaction",
    "alex-personal",
    now,
    true,
  );
  assert.equal(document.accounts[0].amount, 80);
  assert.equal(document.accounts[1].amount, 70);
  assert.deepEqual(document.categories[0].transactions, []);
  assert.deepEqual(document.categories[1].transactions, ["transaction"]);
  assert.deepEqual(document.transactions[0].unknownImportedValue, {
    preserved: true,
  });

  document = deleteTransaction(document, "transaction", "alex-personal", now);
  assert.equal(document.accounts[0].amount, 100);
  assert.equal(document.accounts[1].amount, 50);
  assert.deepEqual(document.accounts[0].transactions, []);
  assert.deepEqual(document.accounts[1].transactions, []);
  assert.equal(document.transactions.length, 0);
});

test("transaction drafts round trip optional relationships and receipt data", () => {
  const document = fixture();
  document.labels = [{ uuid: "work", user: "alex-personal" }];
  document.places = [{ uuid: "office", user: "alex-personal" }];
  document.peoples = [{ uuid: "sam", user: "alex-personal" }];
  const saved = saveTransaction(
    document,
    draft({
      description: "Team lunch",
      labelId: "work",
      placeId: "office",
      personId: "sam",
      receiptPath: "receipt.jpg",
      receiptAttachmentId: "attachment",
    }),
    "transaction",
    "alex-personal",
    now,
  );
  const restored = transactionDraftFromRecord(saved, "transaction");
  assert.equal(restored.description, "Team lunch");
  assert.equal(restored.labelId, "work");
  assert.equal(restored.placeId, "office");
  assert.equal(restored.personId, "sam");
  assert.equal(restored.receiptPath, "receipt.jpg");
});

test("foreign-currency transactions preserve the entered amount and snapshot the account conversion", () => {
  const document = fixture();
  document.accounts[0].currencyCode = "ILS";
  const saved = saveTransaction(
    document,
    draft({
      amount: "25",
      currencyCode: "USD",
      accountCurrencyCode: "ILS",
      exchangeRate: 3.02244974,
      exchangeRateDate: "2026-09-09",
      exchangeRateFetchedAt: now,
      exchangeRateSource: "fawazahmed0/currency-api",
    }),
    "foreign-transaction",
    "alex-personal",
    now,
  );

  assert.equal(saved.accounts[0].amount, 24.44);
  assert.deepEqual(
    {
      amount: saved.transactions[0].amount,
      currencyCode: saved.transactions[0].currencyCode,
      accountAmount: saved.transactions[0].accountAmount,
      accountCurrencyCode: saved.transactions[0].accountCurrencyCode,
      exchangeRate: saved.transactions[0].exchangeRate,
      exchangeRateDate: saved.transactions[0].exchangeRateDate,
      exchangeRateFetchedAt: saved.transactions[0].exchangeRateFetchedAt,
      exchangeRateSource: saved.transactions[0].exchangeRateSource,
    },
    {
      amount: 25,
      currencyCode: "USD",
      accountAmount: 75.56,
      accountCurrencyCode: "ILS",
      exchangeRate: 3.02244974,
      exchangeRateDate: "2026-09-09",
      exchangeRateFetchedAt: now,
      exchangeRateSource: "fawazahmed0/currency-api",
    },
  );

  const normalized = normalizeBackupDocument(
    JSON.parse(JSON.stringify(saved)),
  );
  const restored = transactionDraftFromRecord(
    normalized,
    "foreign-transaction",
  );
  assert.equal(restored.currencyCode, "USD");
  assert.equal(restored.accountCurrencyCode, "ILS");
  assert.equal(restored.exchangeRate, 3.02244974);

  const projected = selectTransactions(normalized)[0];
  assert.equal(projected.amount, -25);
  assert.equal(projected.absoluteAmount, 25);
  assert.equal(projected.currencyCode, "USD");
  assert.equal(projected.accountAmount, 75.56);
  assert.equal(projected.accountCurrencyCode, "ILS");
  assert.equal(projected.exchangeRate, 3.02244974);
  assert.equal(selectMonthlySummary(normalized, new Date(now)).spent, 25);

  const edited = saveTransaction(
    normalized,
    { ...restored, amount: "30" },
    "foreign-transaction",
    "alex-personal",
    now,
    true,
  );
  assert.equal(edited.transactions[0].accountAmount, 90.67);
  assert.equal(edited.accounts[0].amount, 9.33);

  const deleted = deleteTransaction(
    edited,
    "foreign-transaction",
    "alex-personal",
    now,
  );
  assert.equal(deleted.accounts[0].amount, 100);
});

test("validation rejects cross-currency and same-account transfers", () => {
  const document = fixture();
  assert.throws(
    () =>
      saveTransaction(
        document,
        draft({
          type: 2,
          categoryId: "move",
          destinationAccountId: "checking",
        }),
        "same",
        "alex-personal",
        now,
      ),
    /different destination/,
  );
  document.accounts[1].currencyCode = "ILS";
  assert.throws(
    () =>
      saveTransaction(
        document,
        draft({ type: 2, categoryId: "move", destinationAccountId: "savings" }),
        "currency",
        "alex-personal",
        now,
      ),
    /same currency/,
  );
});

test("a category with children requires a subcategory selection", () => {
  const document = fixture();
  document.categories.push({
    uuid: "restaurant",
    user: "alex-personal",
    name: "Restaurant",
    type: 0,
    parentId: "food",
  });
  assert.throws(
    () =>
      saveTransaction(
        document,
        draft(),
        "parent-category",
        "alex-personal",
        now,
      ),
    /Choose a subcategory of Food/,
  );
  const saved = saveTransaction(
    document,
    draft({ categoryId: "restaurant" }),
    "child-category",
    "alex-personal",
    now,
  );
  assert.equal(saved.transactions[0].category, "restaurant");
});

test("saving a template does not change balances or create a transaction", () => {
  const document = saveTransactionTemplate(
    fixture(),
    draft(),
    "template",
    "alex-personal",
    now,
  );
  assert.equal(document.templates.length, 1);
  assert.equal(document.transactions.length, 0);
  assert.equal(document.accounts[0].amount, 100);
});

test("data-only JSON backup removes transaction receipt references", () => {
  const document = fixture();
  document._local.attachments = [
    {
      id: "attachment",
      fileName: "receipt.jpg",
      mimeType: "image/jpeg",
      relativePath: "receipt.jpg",
      size: 100,
    },
  ];
  const saved = saveTransaction(
    document,
    draft({
      receiptPath: "receipt.jpg",
      receiptAttachmentId: "attachment",
    }),
    "transaction",
    "alex-personal",
    now,
  );
  const exported = createJsonBackupDocument(saved);
  assert.equal(exported.transactions[0].image, null);
  assert.equal(exported.transactions[0].receipt, null);
  assert.equal(exported.transactions[0].receiptAttachmentId, null);
  assert.deepEqual(exported._local.attachments, []);
});
