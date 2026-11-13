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
  applyQuickDatePreset,
  formatTransactionTime,
  getTransactionTypeTone,
  getTransactionTypeVisual,
  isTodayDate,
  isYesterdayDate,
  mapTransactionSaveError,
  parseTransactionAmount,
  resolveAccountSelectionUpdate,
  resolveInitialTransactionDraft,
  resolveUses24HourClock,
} = require("../src/features/transactions/transaction-form-helpers.ts");
const {
  createTransactionDraft,
} = require("../src/data/model/transaction-record.ts");

const fakeTheme = {
  accent: "#087E8B",
  danger: "#BB4034",
  success: "#1C8C59",
};

test("mode tones and directional visuals map distinctively per transaction type", () => {
  assert.equal(getTransactionTypeTone(0, fakeTheme), fakeTheme.danger);
  assert.equal(getTransactionTypeTone(1, fakeTheme), fakeTheme.success);
  assert.equal(getTransactionTypeTone(2, fakeTheme), fakeTheme.accent);

  assert.deepEqual(getTransactionTypeVisual(0), {
    symbol: "−",
    icon: "arrow-top-right",
  });
  assert.deepEqual(getTransactionTypeVisual(1), {
    symbol: "+",
    icon: "arrow-bottom-left",
  });
  assert.deepEqual(getTransactionTypeVisual(2), {
    symbol: "⇄",
    icon: "swap-horizontal",
  });
});

test("quick date presets switch between Today and Yesterday and clamp future times", () => {
  const now = new Date(2026, 10, 13, 14, 30, 0, 0);
  const selectedLate = new Date(2026, 10, 10, 18, 45, 0, 0);

  const yesterday = applyQuickDatePreset(selectedLate, "yesterday", now);
  assert.equal(yesterday.getDate(), 12);
  assert.equal(yesterday.getHours(), 18);
  assert.equal(yesterday.getMinutes(), 45);
  assert.equal(isYesterdayDate(yesterday, now), true);
  assert.equal(isTodayDate(yesterday, now), false);

  // Moving from a past day whose clock time exceeds `now` clamps to `now`.
  const todayClamped = applyQuickDatePreset(yesterday, "today", now);
  assert.equal(todayClamped.getTime(), now.getTime());
  assert.equal(isTodayDate(todayClamped, now), true);
});

test("parseTransactionAmount parses comma and dot decimals cleanly", () => {
  assert.equal(parseTransactionAmount("42,50"), 42.5);
  assert.equal(parseTransactionAmount("18.5"), 18.5);
  assert.equal(Number.isNaN(parseTransactionAmount("   ")), true);
});

test("resolveAccountSelectionUpdate clears stale FX state and mismatched transfer destinations", () => {
  const accounts = [
    { id: "usd-1", currencyCode: "USD" },
    { id: "usd-2", currencyCode: "USD" },
    { id: "eur-1", currencyCode: "EUR" },
  ];

  const baseDraft = {
    ...createTransactionDraft(2),
    accountId: "usd-1",
    destinationAccountId: "usd-2",
    currencyCode: "GBP",
    accountCurrencyCode: "USD",
    exchangeRate: 1.25,
    exchangeRateDate: "2026-11-13",
  };

  // Selecting an EUR source clears the USD destination account in Transfer mode.
  const nextEur = resolveAccountSelectionUpdate(
    baseDraft,
    accounts[2],
    accounts,
  );
  assert.equal(nextEur.accountId, "eur-1");
  assert.equal(nextEur.currencyCode, "EUR");
  assert.equal(nextEur.exchangeRate, null);
  assert.equal(nextEur.destinationAccountId, "");

  // Selecting another USD source keeps the compatible USD destination account.
  const transferFromUsd2 = resolveAccountSelectionUpdate(
    { ...baseDraft, accountId: "usd-2", destinationAccountId: "usd-1" },
    accounts[0],
    accounts,
  );
  assert.equal(transferFromUsd2.destinationAccountId, "");
});

test("resolveInitialTransactionDraft honors copy, preset budget, params.type, and onboarding defaults", () => {
  const accounts = [
    { id: "acc-1", currencyCode: "EUR", isDefault: false },
    { id: "acc-2", currencyCode: "ILS", isDefault: true },
  ];

  // Respects default onboarding account and currency.
  const fresh = resolveInitialTransactionDraft({
    sourceDraft: null,
    isCopy: false,
    presetBudget: null,
    accounts,
    defaultAccount: accounts[1],
    paramType: "income",
    activeProfileCurrencyCode: "usd",
  });
  assert.equal(fresh.type, 1);
  assert.equal(fresh.accountId, "acc-2");
  assert.equal(fresh.currencyCode, "ILS");

  // Copy strips receipts and conversion snapshot so copy creates a clean duplicate.
  const sourceDraft = {
    ...createTransactionDraft(0),
    name: "Dinner",
    amount: "50",
    receiptPath: "attachments/r.jpg",
    receiptAttachmentId: "att-1",
    conversionSnapshot: { base: "USD", date: "2026-11-13", rates: { USD: 1 } },
  };
  const copied = resolveInitialTransactionDraft({
    sourceDraft,
    isCopy: true,
    presetBudget: null,
    accounts,
    defaultAccount: accounts[1],
    activeProfileCurrencyCode: "USD",
  });
  assert.equal(copied.receiptPath, null);
  assert.equal(copied.receiptAttachmentId, null);
  assert.equal(copied.conversionSnapshot, null);
  assert.equal(copied.name, "Dinner");
});

test("mapTransactionSaveError translates known validation and relation errors", () => {
  const fakeT = (key, vars) =>
    vars ? `${key}:${JSON.stringify(vars)}` : key;

  assert.equal(
    mapTransactionSaveError(
      new Error("Choose a different destination account."),
      fakeT,
    ),
    "transactions.form.validation.destinationAccount",
  );
  assert.equal(
    mapTransactionSaveError(
      new Error("Choose a valid person in this profile."),
      fakeT,
    ),
    'transactions.form.validation.relation:{"relation":"transactions.common.fields.payee"}',
  );
});

test("formatTransactionTime follows 24h vs 12h setting and defaults to 24h", () => {
  const midnight = new Date(2026, 10, 13, 0, 5, 0, 0);
  const evening = new Date(2026, 10, 13, 18, 7, 0, 0);

  assert.equal(resolveUses24HourClock(true), true);
  assert.equal(resolveUses24HourClock(null), true);
  assert.equal(resolveUses24HourClock(undefined), true);
  assert.equal(resolveUses24HourClock(false), false);

  assert.equal(formatTransactionTime(midnight, "en", null), "00:05");
  assert.equal(formatTransactionTime(evening, "en", undefined), "18:07");
  assert.equal(formatTransactionTime(evening, "en", true), "18:07");
  assert.match(formatTransactionTime(evening, "en", false), /6:07.*PM/i);
});
