// Run with: node --test tests/accounts.test.cjs
// Load the pure TypeScript data modules without adding a runtime test dependency.
const fs = require("node:fs");
const path = require("node:path");
const os = require("node:os");
const assert = require("node:assert/strict");
const { test } = require("node:test");
const { DatabaseSync } = require("node:sqlite");
const ts = require("typescript");
const sourceRoot = path.resolve(__dirname, "../src");
require.extensions[".ts"] = (module, filename) => {
  const compiled = ts
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
  module._compile(compiled, filename);
};
const {
  createLegacyDevelopmentBackup: createDefaultBackup,
} = require("./fixtures/legacy-development-backup.ts");
const {
  normalizeBackupDocument,
} = require("../src/data/model/normalize-backup.ts");
const {
  CARD_COMPANIES,
  addAccountToDocument,
  updateAccountInDocument,
  parseAccountAmount,
} = require("../src/data/model/account-record.ts");
const { settleDueCardPayments } = require("../src/data/model/card-payment.ts");
const {
  getExchangeRates,
} = require("../src/data/exchange-rates/exchange-rate-service.ts");
const {
  convertCurrency,
  parseExchangeRates,
  storeExchangeRates,
} = require("../src/data/model/exchange-rate.ts");
const {
  selectExchangeQuote,
} = require("../src/data/selectors/exchange-rate-selectors.ts");
const {
  selectAccounts,
  selectAccountTotalsByCurrency,
  selectMonthlySummary,
  selectSpendingCategories,
  selectDailySpending,
  selectBudgetCategories,
  selectBankAccounts,
  selectAccountDraft,
  selectAccountTransactions,
  getCreditCardBillingCycle,
} = require("../src/data/selectors/document-selectors.ts");
const {
  createJsonBackupDocument,
  createFullBackupDocument,
} = require("../src/data/backup/document-export.ts");
const {
  ACCOUNT_ICON_GROUPS,
} = require("../src/features/accounts/account-options.ts");
const { migrateLocalDatabase } = require("../src/data/database/migrations.ts");
const {
  readDocument,
  writeDocument,
} = require("../src/data/database/document-repository.ts");
const {
  createDefaultSavingsDetails,
  estimateSavingsWithdrawal,
} = require("../src/data/model/savings-account.ts");
const now = "2026-09-07T12:00:00.000Z";
const draft = (overrides = {}) => ({
  name: " Travel card ",
  amount: "-123.45",
  accountNumber: "0012345",
  accountType: "card",
  currencyCode: "USD",
  icon: "car",
  iconPath: null,
  color: "#AB47BC",
  isDefault: true,
  isExcluded: false,
  cardLastFour: "0007",
  cardCompany: "Visa",
  paymentDay: 31,
  bankName: "",
  linkedBankAccountId: "account-checking",
  savingsDetails: createDefaultSavingsDetails(),
  ...overrides,
});
const validSavingsDetails = () => ({
  ...createDefaultSavingsDetails(),
  isDetailed: true,
  providerName: "Test savings provider",
  taxJurisdiction: "Test jurisdiction",
  estimatedTaxRate: "15",
});
const add = (document, changes = {}, id = "test-account") =>
  addAccountToDocument(document, draft(changes), "alex-personal", id, now);

test("generated Material catalog contains every installed rounded symbol", () => {
  const metadata = JSON.parse(
    fs.readFileSync(
      path.resolve(
        __dirname,
        "../node_modules/@material-symbols-svg/react-native/dist/metadata/icon-index.json",
      ),
      "utf8",
    ),
  );
  const source = fs.readFileSync(
    path.join(sourceRoot, "shared/icons/material-rounded-filled-icons.ts"),
    "utf8",
  );
  const assignment = source.indexOf("= [");
  const end = source.lastIndexOf("];");
  const icons = JSON.parse(source.slice(assignment + 2, end + 1));
  assert.equal(icons.length, 3903);
  assert.ok(icons.length <= Object.keys(metadata).length);
  assert.equal(new Set(icons.map((icon) => icon.name)).size, icons.length);
  assert.ok(
    icons.every(
      (icon) =>
        icon.name &&
        icon.searchText.includes(icon.name) &&
        /^[Mm]/.test(icon.pathData),
    ),
  );
  const trailingNames = icons.slice(-68).map((icon) => icon.name);
  assert.ok(trailingNames.every((name) => /^\d/.test(name) || name === "abc"));
  for (const name of ["10k", "18_up_rating", "360", "9mp", "abc"]) {
    assert.ok(trailingNames.includes(name));
  }
});

test("suggested icon categories contain 20 valid choices each", () => {
  const expectedTitles = [
    "Money & accounts",
    "Everyday spending",
    "Goals & interests",
    "Entertainment",
    "Food",
    "Groceries",
    "Subscriptions",
    "Transportation",
    "Travel",
    "Rent",
    "Health",
    "Education",
    "Utilities",
    "Other",
    "More",
  ];
  assert.deepEqual(
    ACCOUNT_ICON_GROUPS.map((group) => group.title),
    expectedTitles,
  );
  assert.ok(ACCOUNT_ICON_GROUPS.every((group) => group.icons.length >= 20));

  const source = fs.readFileSync(
    path.join(sourceRoot, "shared/icons/material-rounded-filled-icons.ts"),
    "utf8",
  );
  const assignment = source.indexOf("= [");
  const end = source.lastIndexOf("];");
  const materialNames = new Set(
    JSON.parse(source.slice(assignment + 2, end + 1)).map(
      (icon) => `material:${icon.name}`,
    ),
  );
  assert.deepEqual(
    ACCOUNT_ICON_GROUPS.flatMap((group) =>
      group.icons
        .filter(
          (icon) =>
            icon.name.startsWith("material:") && !materialNames.has(icon.name),
        )
        .map((icon) => `${group.title}: ${icon.name}`),
    ),
    [],
  );
});

test("card saves explicit type, money, stable identity, leading zeroes, appearance and owner", () => {
  const current = createDefaultBackup();
  const next = add(current);
  const record = next.accounts.at(-1);
  assert.equal(record.uuid, "test-account");
  assert.equal(record.name, "Travel card");
  assert.equal(record.amount, -123.45);
  assert.equal(record.accountNumber, "0012345");
  assert.equal(record.cardLastFour, "0007");
  assert.equal(record.paymentDay, 31);
  assert.equal(record.linkedBankAccountId, "account-checking");
  assert.equal(record.user, "alex-personal");
  assert.equal(record.createdAt, now);
  assert.equal(record.updatedAt, now);
  const view = selectAccounts(next).at(-1);
  assert.equal(view.kind, "credit");
  assert.equal(view.icon, "car");
  assert.equal(view.iconPath, null);
  assert.equal(view.color, "#ab47bc");
  assert.equal(view.currencyCode, "USD");
  assert.equal(view.lastFour, "0007");
  assert.equal(current.accounts.length, 3);
  assert.equal(current.accounts[0].isDefault, true);
});

test("default replacement is scoped to the owner, preserves other profiles and unknown data", () => {
  const current = createDefaultBackup();
  current.accounts.push({
    uuid: "other-owner",
    user: "alex-household",
    isDefault: true,
    custom: { keep: true },
  });
  current.customCollection = [{ value: "preserved" }];
  current.accounts[0].extra = { keep: true };
  const next = add(add(current), {}, "second-account");
  assert.deepEqual(
    next.accounts
      .filter((item) => item.user === "alex-personal" && item.isDefault)
      .map((item) => item.uuid),
    ["second-account"],
  );
  assert.equal(
    next.accounts.find((item) => item.uuid === "other-owner").isDefault,
    true,
  );
  assert.deepEqual(next.accounts[0].extra, { keep: true });
  assert.deepEqual(next.customCollection, current.customCollection);
  assert.equal(next._local.cloudProvider, null);
  assert.throws(() => add(next, {}, "second-account"), /already been saved/);
});

test("cash and savings discard hidden card-only draft fields and do not change defaults when off", () => {
  for (const accountType of ["cash", "savings"]) {
    const next = add(createDefaultBackup(), {
      accountType,
      isDefault: false,
      cardLastFour: "invalid",
      cardCompany: "",
      paymentDay: null,
      savingsDetails: validSavingsDetails(),
    });
    const record = next.accounts.at(-1);
    assert.equal(record.cardLastFour, null);
    assert.equal(record.cardCompany, null);
    assert.equal(record.paymentDay, null);
    assert.equal(record.linkedBankAccountId, null);
    assert.equal(record.bankName, null);
    assert.equal(selectAccounts(next).at(-1).kind, accountType);
    assert.equal(next.accounts[0].isDefault, true);
  }
});

test("bank saves its name and is available as a same-profile card payment account", () => {
  const next = add(createDefaultBackup(), {
    accountType: "bank",
    name: "Salary account",
    bankName: "Bank Hapoalim",
    isDefault: false,
  });
  const record = next.accounts.at(-1);
  assert.equal(record.accountType, "bank");
  assert.equal(record.type, 3);
  assert.equal(record.bankName, "Bank Hapoalim");
  assert.equal(record.linkedBankAccountId, null);
  assert.equal(selectAccounts(next).at(-1).kind, "bank");
  assert.ok(
    selectBankAccounts(next).some((account) => account.id === "test-account"),
  );
});

test("Material rounded filled icons persist their exact SVG path", () => {
  const pathData = "M120-120v-720h720v720H120Z";
  const next = add(createDefaultBackup(), {
    icon: "material:account-balance",
    iconPath: pathData,
  });
  const record = next.accounts.at(-1);
  const view = selectAccounts(next).at(-1);
  assert.equal(record.icon, "material:account-balance");
  assert.equal(record.iconPath, pathData);
  assert.equal(view.icon, "material:account-balance");
  assert.equal(view.iconPath, pathData);
});

test("reject malformed amounts, card details and missing owners before mutation", () => {
  for (const value of [
    "",
    " ",
    "NaN",
    "Infinity",
    "1e6",
    "1,234.56",
    "12.3456",
    "1.2.3",
    "9007199254740991",
  ])
    assert.throws(() => parseAccountAmount(value));
  assert.equal(parseAccountAmount("-12,50"), -12.5);
  assert.equal(parseAccountAmount("0"), 0);
  for (const changes of [
    { name: " " },
    { cardLastFour: "123" },
    { cardLastFour: "12a4" },
    { cardCompany: "" },
    { paymentDay: 0 },
    { paymentDay: 32 },
    { paymentDay: 1.5 },
    { linkedBankAccountId: null },
    { linkedBankAccountId: "account-savings" },
    { accountType: "bank", bankName: " " },
    { color: "red" },
    { currencyCode: "?" },
    { icon: "material:account-balance", iconPath: null },
    { icon: "material:account-balance", iconPath: "invalid" },
    { creditLimit: "-100" },
    { creditLimit: "invalid" },
  ])
    assert.throws(() => add(createDefaultBackup(), changes));
  assert.throws(
    () =>
      addAccountToDocument(
        createDefaultBackup(),
        draft(),
        "missing-owner",
        "new",
        now,
      ),
    /existing profile/,
  );
});

test("excluded accounts remain visible but never contribute to balances or spending calculations", () => {
  const current = createDefaultBackup();
  const next = add(current, {
    isExcluded: true,
    currencyCode: "USD",
    amount: "500",
    accountType: "cash",
  });
  next.transactions = [
    ...next.transactions,
    {
      uuid: "excluded-expense",
      account: "test-account",
      amount: 100,
      type: 0,
      category: "category-groceries",
      createdAt: now,
    },
  ];
  assert.equal(selectAccounts(next).length, 4);
  assert.deepEqual(
    selectAccountTotalsByCurrency(selectAccounts(next)),
    selectAccountTotalsByCurrency(selectAccounts(current)),
  );
  assert.deepEqual(selectMonthlySummary(next), selectMonthlySummary(current));
  assert.deepEqual(
    selectSpendingCategories(next),
    selectSpendingCategories(current),
  );
  assert.deepEqual(selectDailySpending(next), selectDailySpending(current));
  assert.deepEqual(
    selectBudgetCategories(next),
    selectBudgetCategories(current),
  );
});

test("mixed currencies have separate totals and new profiles only see their accounts", () => {
  const next = add(createDefaultBackup(), {
    accountType: "cash",
    currencyCode: "ILS",
  });
  const groups = selectAccountTotalsByCurrency(selectAccounts(next));
  assert.equal(groups.length, 2);
  assert.equal(
    groups.find((group) => group.currencyCode === "ILS").netWorth,
    -123.45,
  );
  next._local.selectedProfileId = "alex-household";
  assert.equal(selectAccounts(next).length, 0);
});

test("JSON backup round trip preserves all new account options and unknown fields", () => {
  const next = add(createDefaultBackup());
  next._local.themeMode = "dark";
  next._local.accentColor = "violet";
  next.unknown = { values: [1, 2, 3] };
  next.accounts.at(-1).unknown = "keep";
  const restored = normalizeBackupDocument(
    JSON.parse(JSON.stringify(createJsonBackupDocument(next))),
  );
  assert.deepEqual(restored.accounts, next.accounts);
  assert.deepEqual(restored.unknown, next.unknown);
  assert.equal(restored._local.schemaVersion, 17);
  assert.equal(restored._local.themeMode, "dark");
  assert.equal(restored._local.accentColor, "violet");
  assert.equal(
    restored.accounts.at(-1).linkedBankAccountId,
    "account-checking",
  );
  assert.throws(() => normalizeBackupDocument({ backupVersion: 999 }), /newer/);
  assert.throws(
    () => normalizeBackupDocument({ _local: { schemaVersion: 999 } }),
    /newer/,
  );
});

test("theme preferences default to system and reject unknown accents", () => {
  const restored = normalizeBackupDocument({
    backupVersion: 3,
    _local: { themeMode: "sunset", accentColor: "chartreuse" },
  });
  assert.equal(restored._local.themeMode, "system");
  assert.equal(restored._local.accentColor, "cyan");
});

test("savings accounts preserve ownership, terms, fees and configurable tax rules", () => {
  const savingsDetails = {
    ...createDefaultSavingsDetails(),
    isDetailed: true,
    productType: "provident_fund",
    providerName: "Example Provident",
    contributionMode: "recurring",
    contributedPrincipal: "300000",
    monthlyContribution: "500",
    expectedAnnualReturnRate: "7.25",
    liquidity: "retirement",
    annualManagementFeeRate: "0.6",
    contributionFeeRate: "1.2",
    performanceFeeRate: "10",
    earlyWithdrawalFeeRate: "2",
    taxJurisdiction: "Israel",
    taxTreatment: "progressive",
    taxBasis: "earnings",
    estimatedTaxRate: "25",
    taxFreeAllowance: "1000",
  };
  const next = add(
    createDefaultBackup(),
    {
      accountType: "savings",
      amount: "340000",
      savingsDetails,
    },
    "provident-test",
  );
  const record = next.accounts.at(-1);
  assert.equal(record.savingsDetails.productType, "provident_fund");
  assert.equal(record.savingsDetails.contributedPrincipal, 300000);
  assert.equal(record.savingsDetails.performanceFeeRate, 10);
  assert.equal(
    selectAccountDraft(next, "provident-test").savingsDetails
      .monthlyContribution,
    "500",
  );
  const account = selectAccounts(next).find(
    (item) => item.id === "provident-test",
  );
  assert.equal(
    account.savingsSummary.productLabel,
    "Provident fund / Kupat Gemel",
  );
  assert.equal(account.savingsSummary.principal, 300000);
  assert.equal(account.savingsSummary.earnings, 40000);
  assert.equal(account.savingsSummary.monthlyContribution, 500);

  const estimate = estimateSavingsWithdrawal(
    record.amount,
    record.savingsDetails,
  );
  assert.equal(estimate.principal, 300000);
  assert.equal(estimate.earnings, 40000);
  assert.equal(estimate.performanceFee, 4000);
  assert.equal(estimate.earlyWithdrawalFee, 6800);
  assert.equal(estimate.estimatedTax, 9750);
  assert.equal(estimate.estimatedNetWithdrawal, 319450);

  const restored = normalizeBackupDocument(JSON.parse(JSON.stringify(next)));
  assert.deepEqual(
    restored.accounts.at(-1).savingsDetails,
    record.savingsDetails,
  );
});

test("savings validation rejects incomplete recurring and tax estimates", () => {
  const base = {
    ...createDefaultSavingsDetails(),
    isDetailed: true,
    providerName: "Savings provider",
  };
  assert.throws(
    () =>
      add(createDefaultBackup(), {
        accountType: "savings",
        savingsDetails: { ...base, contributionMode: "recurring" },
      }),
    /monthly contribution/,
  );
  assert.throws(
    () =>
      add(createDefaultBackup(), {
        accountType: "savings",
        savingsDetails: { ...base, taxJurisdiction: "Israel" },
      }),
    /estimated tax rate/,
  );
});

test("simple savings require no advanced provider, fee or tax fields", () => {
  const next = add(
    createDefaultBackup(),
    {
      accountType: "savings",
      name: "Rainy day",
      amount: "2500",
      accountNumber: "7788",
      savingsDetails: createDefaultSavingsDetails(),
    },
    "simple-savings",
  );
  const record = next.accounts.at(-1);
  assert.equal(record.savingsDetails.isDetailed, false);
  assert.equal(record.savingsDetails.providerName, "");
  assert.equal(record.savingsDetails.contributedPrincipal, 2500);
  assert.equal(record.savingsDetails.taxTreatment, "tax_exempt");
  const selected = selectAccounts(next).find(
    (item) => item.id === "simple-savings",
  );
  assert.equal(selected.savingsSummary.isDetailed, false);
  assert.equal(selected.savingsSummary.productLabel, "Simple savings");
  assert.equal(selected.savingsSummary.estimatedNetWithdrawal, 2500);
});

test("blank savings principal defaults to balance while explicit zero remains zero", () => {
  const details = {
    ...validSavingsDetails(),
    taxTreatment: "tax_exempt",
    taxJurisdiction: "",
    estimatedTaxRate: "",
  };
  const blank = add(createDefaultBackup(), {
    accountType: "savings",
    amount: "1000",
    savingsDetails: details,
  });
  assert.equal(blank.accounts.at(-1).savingsDetails.contributedPrincipal, 1000);

  const zero = add(
    createDefaultBackup(),
    {
      accountType: "savings",
      amount: "1000",
      savingsDetails: { ...details, contributedPrincipal: "0" },
    },
    "zero-principal",
  );
  assert.equal(zero.accounts.at(-1).savingsDetails.contributedPrincipal, 0);
  assert.equal(
    selectAccounts(zero).find((item) => item.id === "zero-principal")
      .savingsSummary.earnings,
    1000,
  );
});

test("monthly card payment debits its bank into overdraft, clears debt and records one transfer per side", () => {
  const current = createDefaultBackup();
  const bank = current.accounts.find(
    (account) => account.uuid === "account-checking",
  );
  const card = current.accounts.find(
    (account) => account.uuid === "account-credit",
  );
  bank.amount = 1000;
  card.amount = -6000;
  card.paymentDay = 10;
  card.lastPaymentPeriod = null;

  const beforeDue = settleDueCardPayments(current, new Date(2026, 8, 9, 12));
  assert.equal(beforeDue, current);

  const paid = settleDueCardPayments(current, new Date(2026, 8, 10, 12));
  assert.equal(
    paid.accounts.find((account) => account.uuid === "account-checking").amount,
    -5000,
  );
  assert.equal(
    paid.accounts.find((account) => account.uuid === "account-credit").amount,
    0,
  );
  assert.equal(
    paid.accounts.find((account) => account.uuid === "account-credit")
      .lastPaymentPeriod,
    "2026-09",
  );
  const transfers = paid.transactions.filter(
    (transaction) => transaction.cardPaymentPeriod === "2026-09",
  );
  assert.equal(transfers.length, 2);
  assert.ok(
    transfers.every(
      (transaction) => transaction.type === 2 && transaction.amount === 6000,
    ),
  );

  assert.equal(settleDueCardPayments(paid, new Date(2026, 8, 30, 12)), paid);
  const nextMonthDraft = structuredClone(paid);
  nextMonthDraft.accounts.find(
    (account) => account.uuid === "account-credit",
  ).amount = -500;
  const nextMonth = settleDueCardPayments(
    nextMonthDraft,
    new Date(2026, 9, 10, 12),
  );
  assert.equal(
    nextMonth.accounts.find((account) => account.uuid === "account-checking")
      .amount,
    -5500,
  );
  assert.equal(
    nextMonth.transactions.filter(
      (transaction) => transaction.cardPaymentPeriod === "2026-10",
    ).length,
    2,
  );
});

test("days 29 to 31 settle on the last day of a shorter month", () => {
  const current = createDefaultBackup();
  const card = current.accounts.find(
    (account) => account.uuid === "account-credit",
  );
  card.amount = -250;
  card.paymentDay = 31;
  card.lastPaymentPeriod = null;
  const paid = settleDueCardPayments(current, new Date(2027, 1, 28, 12));
  assert.equal(
    paid.accounts.find((account) => account.uuid === "account-credit").amount,
    0,
  );
  assert.equal(
    paid.accounts.find((account) => account.uuid === "account-credit")
      .lastPaymentPeriod,
    "2027-02",
  );
});

test("credit card billing cycle calculates dynamic dates for any paymentDay and handles month transitions", () => {
  // Scenario 1: paymentDay = 5
  // When anchor is Sept 3, 2026 (before payday on Sept 5):
  // Current cycle is Aug 5, 2026 to Sept 4, 2026. Next payday is Sept 5, 2026. Days left: 2.
  const cycle5Before = getCreditCardBillingCycle(5, new Date(2026, 8, 3, 10));
  assert.equal(cycle5Before.cycleStart.getFullYear(), 2026);
  assert.equal(cycle5Before.cycleStart.getMonth(), 7); // August
  assert.equal(cycle5Before.cycleStart.getDate(), 5);
  assert.equal(cycle5Before.cycleEnd.getFullYear(), 2026);
  assert.equal(cycle5Before.cycleEnd.getMonth(), 8); // September
  assert.equal(cycle5Before.cycleEnd.getDate(), 4);
  assert.equal(cycle5Before.nextPaymentDate.getDate(), 5);
  assert.equal(cycle5Before.daysUntilPayment, 2);

  // When anchor is Sept 5, 2026 (on payday):
  // Current cycle is Sept 5, 2026 to Oct 4, 2026. Next payday is Oct 5, 2026.
  const cycle5On = getCreditCardBillingCycle(5, new Date(2026, 8, 5, 10));
  assert.equal(cycle5On.cycleStart.getFullYear(), 2026);
  assert.equal(cycle5On.cycleStart.getMonth(), 8); // September
  assert.equal(cycle5On.cycleStart.getDate(), 5);
  assert.equal(cycle5On.cycleEnd.getFullYear(), 2026);
  assert.equal(cycle5On.cycleEnd.getMonth(), 9); // October
  assert.equal(cycle5On.cycleEnd.getDate(), 4);
  assert.equal(cycle5On.nextPaymentDate.getDate(), 5);

  // Scenario 2: paymentDay = 1
  // When anchor is Sept 15, 2026:
  // Current cycle is Sept 1, 2026 to Sept 30, 2026. Next payday is Oct 1, 2026.
  const cycle1 = getCreditCardBillingCycle(1, new Date(2026, 8, 15, 10));
  assert.equal(cycle1.cycleStart.getMonth(), 8); // September
  assert.equal(cycle1.cycleStart.getDate(), 1);
  assert.equal(cycle1.cycleEnd.getMonth(), 8); // September
  assert.equal(cycle1.cycleEnd.getDate(), 30);
  assert.equal(cycle1.nextPaymentDate.getMonth(), 9); // October
  assert.equal(cycle1.nextPaymentDate.getDate(), 1);

  // Scenario 3: paymentDay = 10 (Israeli typical)
  // When anchor is Sept 9, 2026: cycle Aug 10 to Sept 9 (inclusive), next payment Sept 10.
  const cycle10 = getCreditCardBillingCycle(10, new Date(2026, 8, 9, 10));
  assert.equal(cycle10.cycleStart.getMonth(), 7); // August
  assert.equal(cycle10.cycleStart.getDate(), 10);
  assert.equal(cycle10.cycleEnd.getMonth(), 8); // September
  assert.equal(cycle10.cycleEnd.getDate(), 9);
  assert.equal(cycle10.nextPaymentDate.getDate(), 10);
  assert.equal(cycle10.daysUntilPayment, 1);
});

test("credit limit, available credit, overdraft, and frame restoration on payday", () => {
  const current = createDefaultBackup();
  const card = current.accounts.find((a) => a.uuid === "account-credit");
  const bank = current.accounts.find((a) => a.uuid === "account-checking");
  bank.amount = 10000;
  card.creditLimit = 6000;
  card.amount = -2532; // 2532 spent
  card.paymentDay = 10;
  card.lastPaymentPeriod = null;

  // Before payday (Sept 7):
  const accountsBefore = selectAccounts(current, new Date(2026, 8, 7, 12));
  const cardBefore = accountsBefore.find((a) => a.id === "account-credit");
  assert.equal(cardBefore.creditLimit, 6000);
  assert.equal(cardBefore.currentSpent, 2532);
  assert.equal(cardBefore.availableCredit, 3468);
  assert.equal(cardBefore.isOverdraft, false);
  assert.equal(cardBefore.overdraftAmount, 0);
  assert.equal(cardBefore.creditUtilization, 42); // 2532 / 6000 = 42.2% -> 42%

  // Overdraft condition: card has spent 6500 (exceeding 6000 limit)
  card.amount = -6500;
  const accountsOverdraft = selectAccounts(current, new Date(2026, 8, 7, 12));
  const cardOverdraft = accountsOverdraft.find(
    (a) => a.id === "account-credit",
  );
  assert.equal(cardOverdraft.currentSpent, 6500);
  assert.equal(cardOverdraft.availableCredit, -500);
  assert.equal(cardOverdraft.isOverdraft, true);
  assert.equal(cardOverdraft.overdraftAmount, 500);
  assert.equal(cardOverdraft.creditUtilization, 108);

  // Restore spending to 2532 for settlement test
  card.amount = -2532;

  // Payday arrives on Sept 10:
  const paidDoc = settleDueCardPayments(current, new Date(2026, 8, 10, 12));
  const paidCardRecord = paidDoc.accounts.find(
    (a) => a.uuid === "account-credit",
  );
  const paidBankRecord = paidDoc.accounts.find(
    (a) => a.uuid === "account-checking",
  );
  assert.equal(paidCardRecord.amount, 0);
  assert.equal(paidBankRecord.amount, 10000 - 2532);

  // Available credit restored to initial full credit limit (6000 ILS)!
  const accountsAfter = selectAccounts(paidDoc, new Date(2026, 8, 10, 12));
  const cardAfter = accountsAfter.find((a) => a.id === "account-credit");
  assert.equal(cardAfter.creditLimit, 6000);
  assert.equal(cardAfter.currentSpent, 0);
  assert.equal(cardAfter.availableCredit, 6000);
  assert.equal(cardAfter.isOverdraft, false);
  assert.equal(cardAfter.overdraftAmount, 0);
  assert.equal(cardAfter.creditUtilization, 0);
});

const rateNow = new Date("2026-09-10T12:00:00.000Z");
const rateTable = (date = "2026-09-10") =>
  parseExchangeRates(
    { date, usd: { usd: 1, ils: 3.2, eur: 0.85, jpy: 147.2 } },
    "USD",
    rateNow,
  );

test("daily-rate fetch uses one table and falls back for HTTP, JSON and payload errors", async () => {
  for (const failure of [
    async () => {
      throw new Error("offline");
    },
    async () => ({ ok: false }),
    async () => ({
      ok: true,
      json: async () => {
        throw new Error("invalid JSON");
      },
    }),
    async () => ({
      ok: true,
      json: async () => ({ date: "2026-09-10", eur: { usd: 1 } }),
    }),
  ]) {
    const calls = [];
    const fetched = await getExchangeRates(
      "USD",
      async (url) => {
        calls.push(url);
        if (calls.length === 1) return failure();
        return {
          ok: true,
          json: async () => ({
            date: "2026-09-10",
            usd: { usd: 1, ils: 3.2, eur: 0.85 },
          }),
        };
      },
      rateNow,
    );
    assert.equal(calls.length, 2);
    assert.match(calls[0], /^https:\/\/cdn\.jsdelivr\.net\/.*\/usd.min.json$/);
    assert.equal(
      calls[1],
      "https://latest.currency-api.pages.dev/v1/currencies/usd.min.json",
    );
    assert.equal(fetched.rates.ILS, 3.2);
    assert.equal(fetched.rates.EUR, 0.85);
  }
  let calls = 0;
  await assert.rejects(
    getExchangeRates(
      "USD",
      async () => {
        calls++;
        throw new Error("offline");
      },
      rateNow,
    ),
    /Unable to retrieve/,
  );
  assert.equal(calls, 2);
  await assert.rejects(
    getExchangeRates("../secret", async () => {
      throw new Error("must not run");
    }),
    /Invalid currency/,
  );
});

test("exchange-rate validation and money rounding reject unsafe data and preserve overdrafts", () => {
  for (const rate of [0, -1, Infinity, NaN, "3.2"]) {
    assert.throws(() =>
      parseExchangeRates(
        { date: "2026-09-10", usd: { usd: 1, ils: rate } },
        "USD",
        rateNow,
      ),
    );
  }
  assert.throws(() =>
    parseExchangeRates(
      { date: "2026-02-30", usd: { usd: 1, ils: 3 } },
      "USD",
      rateNow,
    ),
  );
  assert.throws(() =>
    parseExchangeRates(
      { date: "2027-01-01", usd: { usd: 1, ils: 3 } },
      "USD",
      rateNow,
    ),
  );
  assert.equal(convertCurrency(5000, 3.2, "ILS"), 16000);
  assert.equal(convertCurrency(-5000, 3.2, "ILS"), -16000);
  assert.equal(convertCurrency(1.005, 1, "USD"), 1.01);
  assert.equal(convertCurrency(-1.005, 1, "USD"), -1.01);
  assert.equal(convertCurrency(1, 147.2, "JPY"), 147);
  assert.equal(convertCurrency(1, 0.3075, "KWD"), 0.308);
  assert.throws(() => convertCurrency(Number.MAX_VALUE, 3, "ILS"));
});

test("all account types allow keep-number or converted currency changes, preserving history and card links", () => {
  for (const accountType of ["bank", "card", "cash", "savings"]) {
    for (const convert of [false, true]) {
      let document = add(createDefaultBackup(), {
        accountType,
        bankName: "Test bank",
        amount: "5000",
        savingsDetails: validSavingsDetails(),
      });
      document.transactions.push({
        uuid: "old",
        account: "test-account",
        type: 0,
        amount: 100,
        custom: "keep",
      });
      document.transactions.push({
        uuid: "explicit",
        account: "test-account",
        type: 0,
        amount: 10,
        currencyCode: "EUR",
      });
      if (accountType === "bank")
        document.accounts.find(
          (a) => a.uuid === "account-credit",
        ).linkedBankAccountId = "test-account";
      const draft = selectAccountDraft(document, "test-account");
      const next = updateAccountInDocument(
        document,
        {
          ...draft,
          currencyCode: "ILS",
          amount: String(convert ? convertCurrency(5000, 3.2, "ILS") : 5000),
        },
        "test-account",
        now,
      );
      assert.equal(next.accounts.at(-1).amount, convert ? 16000 : 5000);
      assert.equal(next.accounts.at(-1).currencyCode, "ILS");
      assert.equal(
        next.transactions.find((t) => t.uuid === "old").currencyCode,
        "USD",
      );
      assert.equal(
        next.transactions.find((t) => t.uuid === "old").custom,
        "keep",
      );
      assert.equal(
        next.transactions.find((t) => t.uuid === "explicit").currencyCode,
        "EUR",
      );
      assert.equal(
        selectAccountTransactions(next, "test-account").find(
          (t) => t.id === "old",
        ).amount,
        100,
      );
      if (accountType === "bank")
        assert.equal(
          next.accounts.find((a) => a.uuid === "account-credit")
            .linkedBankAccountId,
          "test-account",
        );
      if (accountType === "card")
        assert.equal(
          next.accounts.at(-1).linkedBankAccountId,
          "account-checking",
        );
      assert.equal(document.accounts.at(-1).currencyCode, "USD");
    }
  }
  const crossCurrency = add(createDefaultBackup(), { currencyCode: "ILS" });
  assert.equal(
    crossCurrency.accounts.at(-1).linkedBankAccountId,
    "account-checking",
  );
});

test("two USD cards settle in ILS exactly once, preserving rate audit and spending totals", () => {
  let document = createDefaultBackup();
  document.accounts.find((a) => a.uuid === "account-checking").currencyCode =
    "ILS";
  document.accounts.find((a) => a.uuid === "account-checking").amount = 1000;
  document.accounts.find((a) => a.uuid === "account-credit").amount = -6000;
  document = add(document, { amount: "-6000", paymentDay: 10 }, "second-card");
  document = storeExchangeRates(document, rateTable());
  const paid = settleDueCardPayments(document, rateNow);
  assert.equal(
    paid.accounts.find((a) => a.uuid === "account-checking").amount,
    -37400,
  );
  assert.equal(
    paid.accounts.find((a) => a.uuid === "account-credit").amount,
    0,
  );
  assert.equal(paid.accounts.find((a) => a.uuid === "second-card").amount, 0);
  const transfers = paid.transactions.filter(
    (t) => t.cardPaymentPeriod === "2026-09",
  );
  assert.equal(transfers.length, 4);
  assert.ok(
    transfers
      .filter((t) => t.account === "account-checking")
      .every((t) => t.amount === 19200 && t.currencyCode === "ILS"),
  );
  assert.ok(
    transfers.every(
      (t) =>
        t.sourceAmount === 6000 &&
        t.exchangeRate === 3.2 &&
        t.exchangeRateDate === "2026-09-10",
    ),
  );
  assert.equal(
    paid.accounts.find((a) => a.uuid === "account-checking").transactions
      .length,
    2,
  );
  assert.deepEqual(selectMonthlySummary(paid), selectMonthlySummary(document));
  assert.deepEqual(
    selectSpendingCategories(paid),
    selectSpendingCategories(document),
  );
  assert.equal(settleDueCardPayments(paid, rateNow), paid);
  const restored = normalizeBackupDocument(
    JSON.parse(JSON.stringify(createFullBackupDocument(paid))),
  );
  assert.equal(settleDueCardPayments(restored, rateNow), restored);
  restored.accounts.find((a) => a.uuid === "second-card").lastPaymentPeriod =
    null;
  const repaired = settleDueCardPayments(restored, rateNow);
  assert.equal(
    repaired.accounts.find((a) => a.uuid === "account-checking").amount,
    -37400,
  );
});

test("foreign-currency payday waits for a current rate, and catches up before next month's payday", () => {
  const current = createDefaultBackup();
  current.accounts[0].currencyCode = "ILS";
  const bankBalance = current.accounts[0].amount;
  assert.equal(settleDueCardPayments(current, rateNow), current);
  const stale = storeExchangeRates(current, rateTable("2026-09-09"));
  assert.equal(selectExchangeQuote(stale, "USD", "ILS", rateNow, true), null);
  assert.equal(settleDueCardPayments(stale, rateNow), stale);
  assert.equal(stale.accounts[0].amount, bankBalance);
  assert.equal(stale.accounts[2].lastPaymentPeriod, null);
  const later = new Date("2026-10-02T12:00:00.000Z");
  const fresh = parseExchangeRates(
    { date: "2026-10-02", usd: { usd: 1, ils: 3 } },
    "USD",
    later,
  );
  const paid = settleDueCardPayments(storeExchangeRates(stale, fresh), later);
  assert.equal(paid.accounts[2].lastPaymentPeriod, "2026-09");
  assert.equal(paid.accounts[2].amount, 0);
  assert.equal(paid.transactions.at(-1).exchangeRateDate, "2026-10-02");
  assert.equal(paid.transactions.at(-1).createdAt, later.toISOString());
});

test("rate tables and unknown imported rates survive JSON and full backup round trips", () => {
  const document = createDefaultBackup();
  document.exchangeRates = [{ id: 42, custom: { keep: true } }];
  const saved = storeExchangeRates(document, rateTable());
  for (const exportDocument of [
    createJsonBackupDocument,
    createFullBackupDocument,
  ]) {
    const restored = normalizeBackupDocument(
      JSON.parse(JSON.stringify(exportDocument(saved))),
    );
    assert.deepEqual(restored.exchangeRates, saved.exchangeRates);
    assert.equal(
      selectExchangeQuote(restored, "USD", "ILS", rateNow, true).rate,
      3.2,
    );
    assert.equal(restored._local.cloudProvider, null);
  }
});

function sqliteAdapter(filename) {
  const db = new DatabaseSync(filename);
  const adapter = {
    execAsync: async (sql) => db.exec(sql),
    getAllAsync: async (sql, ...params) => db.prepare(sql).all(...params),
    getFirstAsync: async (sql, ...params) => db.prepare(sql).get(...params),
    runAsync: async (sql, ...params) => db.prepare(sql).run(...params),
    withExclusiveTransactionAsync: async (work) => {
      db.exec("BEGIN IMMEDIATE");
      try {
        await work(adapter);
        db.exec("COMMIT");
      } catch (error) {
        db.exec("ROLLBACK");
        throw error;
      }
    },
    close: () => db.close(),
  };
  return adapter;
}

test("every card company survives SQLite reopening and both backup document formats", async () => {
  const directory = fs.mkdtempSync(
    path.join(os.tmpdir(), "budget-card-companies-"),
  );
  const filename = path.join(directory, "test.db");
  let database = sqliteAdapter(filename);
  try {
    await migrateLocalDatabase(database);
    let document = createDefaultBackup();
    for (const company of CARD_COMPANIES) {
      document = add(document, { cardCompany: company }, `company-${company}`);
    }
    await writeDocument(database, document);
    database.close();
    database = sqliteAdapter(filename);
    const saved = await readDocument(database);
    for (const exportDocument of [
      createJsonBackupDocument,
      createFullBackupDocument,
    ]) {
      const restored = normalizeBackupDocument(
        JSON.parse(JSON.stringify(exportDocument(saved))),
      );
      for (const company of CARD_COMPANIES) {
        const id = `company-${company}`;
        assert.equal(
          restored.accounts.find((record) => record.uuid === id).cardCompany,
          company,
        );
        assert.equal(
          selectAccounts(restored).find((account) => account.id === id)
            .cardCompany,
          company,
        );
      }
    }
  } finally {
    database.close();
    assert.equal(
      path.dirname(path.resolve(directory)),
      path.resolve(os.tmpdir()),
    );
    assert.ok(path.basename(directory).startsWith("budget-card-companies-"));
    fs.rmSync(directory, { recursive: true, force: true });
  }
});

test("SQLite v2 migration preserves imported fields without reseeding, survives reopening and rolls back failed writes", async () => {
  const directory = fs.mkdtempSync(
    path.join(os.tmpdir(), "budget-accounts-test-"),
  );
  const filename = path.join(directory, "test.db");
  let database = sqliteAdapter(filename);
  try {
    await database.execAsync(
      "CREATE TABLE app_document (id INTEGER PRIMARY KEY, schema_version INTEGER NOT NULL, document_json TEXT NOT NULL, updated_at TEXT NOT NULL); PRAGMA user_version = 2;",
    );
    const legacy = createDefaultBackup();
    legacy._local.schemaVersion = 2;
    legacy.importedUnknown = { keep: true };
    delete legacy.accounts[0].accountType;
    legacy.accounts[0].icon = 12345;
    legacy.accounts[0].custom = "legacy";
    await database.runAsync(
      "INSERT INTO app_document VALUES (1, 2, ?, ?)",
      JSON.stringify(legacy),
      now,
    );
    await migrateLocalDatabase(database);
    const migrated = await readDocument(database);
    assert.equal(migrated._local.schemaVersion, 17);
    assert.equal(migrated._local.themeMode, "system");
    assert.equal(migrated._local.accentColor, "cyan");
    assert.equal(migrated.accounts[0].accountType, "bank");
    assert.equal(migrated.accounts[0].icon, 12345);
    assert.equal(migrated.accounts[0].custom, "legacy");
    assert.equal(migrated.accounts[0].iconPath, null);
    assert.equal(migrated.accounts[0].savingsDetails, null);
    assert.deepEqual(migrated.importedUnknown, { keep: true });
    assert.equal(
      (await database.getFirstAsync("PRAGMA user_version")).user_version,
      17,
    );
    const next = storeExchangeRates(add(migrated), rateTable());
    await writeDocument(database, next);
    database.close();
    database = sqliteAdapter(filename);
    assert.deepEqual(await readDocument(database), next);
    assert.equal(
      selectExchangeQuote(
        await readDocument(database),
        "USD",
        "ILS",
        rateNow,
        true,
      ).rate,
      3.2,
    );
    await migrateLocalDatabase(database);
    assert.deepEqual(await readDocument(database), next);
    await database.execAsync(
      "CREATE TRIGGER fail_write BEFORE INSERT ON app_document BEGIN SELECT RAISE(ABORT, 'test write failure'); END;",
    );
    await assert.rejects(
      writeDocument(database, add(next, {}, "failed-account")),
      /test write failure/,
    );
    assert.deepEqual(await readDocument(database), next);
  } finally {
    database.close();
    assert.equal(
      path.dirname(path.resolve(directory)),
      path.resolve(os.tmpdir()),
    );
    assert.ok(path.basename(directory).startsWith("budget-accounts-test-"));
    fs.rmSync(directory, { recursive: true, force: true });
  }
});
