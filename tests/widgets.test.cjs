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
  selectWidgetSnapshot,
} = require("../src/data/selectors/document-selectors.ts");
const { i18n } = require("../src/localization/i18n.ts");

const NOW = new Date(2026, 9, 27, 12, 0, 0);

function buildMultiProfileDocument(overrides = {}) {
  const base = createLegacyDevelopmentBackup();
  return normalizeBackupDocument({
    ...base,
    _local: {
      ...base._local,
      selectedProfileId: "profile-alex",
      appLanguage: "en",
      themeMode: "system",
      amountsHidden: false,
      ...(overrides._local ?? {}),
    },
    users: [
      {
        id: 1,
        uuid: "profile-alex",
        name: "Alex Personal",
        currency: "USD",
        color: "#70d2eb",
        isSelected: true,
      },
      {
        id: 2,
        uuid: "profile-family",
        name: "Family Shared",
        currency: "EUR",
        color: "#b89cf5",
        isSelected: false,
      },
    ],
    accounts: [
      {
        uuid: "acc-checking",
        name: "Main Checking",
        user: "profile-alex",
        amount: 18400,
        currencyCode: "USD",
        accountType: "bank",
      },
      {
        uuid: "acc-savings",
        name: "High-Yield Savings",
        user: "profile-alex",
        amount: 7720,
        currencyCode: "USD",
        accountType: "savings",
      },
      {
        uuid: "acc-card",
        name: "Rewards Card",
        user: "profile-alex",
        amount: -1540,
        currencyCode: "USD",
        accountType: "card",
      },
      {
        uuid: "acc-excluded",
        name: "Archived Vault",
        user: "profile-alex",
        amount: 99999,
        currencyCode: "USD",
        accountType: "savings",
        isExcluded: true,
      },
      {
        uuid: "acc-family-bank",
        name: "Household Account",
        user: "profile-family",
        amount: 9200,
        currencyCode: "EUR",
        accountType: "bank",
      },
    ],
    transactions: [
      {
        uuid: "tx-income-1",
        name: "Monthly Salary",
        user: "profile-alex",
        account: "acc-checking",
        amount: 6400,
        accountAmount: 6400,
        currencyCode: "USD",
        type: 1,
        date: new Date(2026, 9, 5, 9, 0).toISOString(),
        createdAt: new Date(2026, 9, 5, 9, 0).toISOString(),
        updatedAt: new Date(2026, 9, 5, 9, 0).toISOString(),
      },
      {
        uuid: "tx-expense-1",
        name: "Rent & Utilities",
        user: "profile-alex",
        account: "acc-checking",
        amount: 1800,
        accountAmount: 1800,
        currencyCode: "USD",
        type: 0,
        date: new Date(2026, 9, 10, 12, 0).toISOString(),
        createdAt: new Date(2026, 9, 10, 12, 0).toISOString(),
        updatedAt: new Date(2026, 9, 10, 12, 0).toISOString(),
      },
      {
        uuid: "tx-expense-2",
        name: "Groceries",
        user: "profile-alex",
        account: "acc-card",
        amount: 380,
        accountAmount: 380,
        currencyCode: "USD",
        type: 0,
        date: new Date(2026, 9, 18, 15, 30).toISOString(),
        createdAt: new Date(2026, 9, 18, 15, 30).toISOString(),
        updatedAt: new Date(2026, 9, 18, 15, 30).toISOString(),
      },
      {
        uuid: "tx-family-income",
        name: "Shared Contribution",
        user: "profile-family",
        account: "acc-family-bank",
        amount: 3000,
        accountAmount: 3000,
        currencyCode: "EUR",
        type: 1,
        date: new Date(2026, 9, 4, 10, 0).toISOString(),
        createdAt: new Date(2026, 9, 4, 10, 0).toISOString(),
        updatedAt: new Date(2026, 9, 4, 10, 0).toISOString(),
      },
    ],
  });
}

test("selectWidgetSnapshot projects assets, account state, monthly flow, and all profiles", async () => {
  await i18n.changeLanguage("en");
  const document = buildMultiProfileDocument();
  const snapshot = selectWidgetSnapshot(document, NOW);

  assert.equal(snapshot.version, 1);
  assert.equal(snapshot.selectedProfileId, "profile-alex");
  assert.equal(snapshot.isRTL, false);
  assert.equal(snapshot.themeMode, "system");
  assert.equal(snapshot.profiles.length, 2);

  const alex = snapshot.profiles.find((p) => p.id === "profile-alex");
  assert.ok(alex);
  assert.equal(alex.name, "Alex Personal");
  assert.equal(alex.initials, "AP");
  // Excluded account is omitted from widget totals and account count.
  assert.equal(alex.accountCount, 3);
  assert.equal(alex.balanceFormatted, "24,580.00$");
  assert.equal(alex.assetsFormatted, "26,120.00$");
  assert.equal(alex.debtFormatted, "1,540.00$");
  assert.equal(alex.monthlyIncomeFormatted, "+6,400.00$");
  assert.equal(alex.monthlyExpenseFormatted, "-2,180.00$");
  assert.equal(alex.assetsRatio, Math.round((26120 / (26120 + 1540)) * 100));
  assert.equal(alex.topAccounts.length, 3);
  assert.equal(alex.topAccounts[0].name, "Main Checking");
  assert.match(alex.accountsSummary, /Main Checking: 18,400\.00\$/);

  const family = snapshot.profiles.find((p) => p.id === "profile-family");
  assert.ok(family);
  assert.equal(family.name, "Family Shared");
  assert.equal(family.accountCount, 1);
  assert.equal(family.monthlyIncomeFormatted, "+3,000.00€");
});

test("selectWidgetSnapshot masks all monetary figures when amountsHidden is enabled", async () => {
  await i18n.changeLanguage("en");
  const document = buildMultiProfileDocument({
    _local: { amountsHidden: true },
  });
  const snapshot = selectWidgetSnapshot(document, NOW);
  const alex = snapshot.profiles[0];

  assert.equal(snapshot.amountsHidden, true);
  assert.equal(alex.balanceFormatted, "••••••");
  assert.equal(alex.assetsFormatted, "••••••");
  assert.equal(alex.debtFormatted, "••••••");
  assert.equal(alex.monthlyIncomeFormatted, "••••••");
  assert.equal(alex.monthlyExpenseFormatted, "••••••");
  assert.equal(alex.topAccounts[0].balanceFormatted, "••••");
});

test("selectWidgetSnapshot adapts labels and RTL direction for Hebrew", async () => {
  await i18n.changeLanguage("he");
  const document = buildMultiProfileDocument({
    _local: { appLanguage: "he" },
  });
  const snapshot = selectWidgetSnapshot(document, NOW);

  assert.equal(snapshot.language, "he");
  assert.equal(snapshot.isRTL, true);
  assert.equal(snapshot.labels.assets, "נכסים");
  assert.equal(snapshot.labels.createIncome, "הוספת הכנסה");
  assert.equal(snapshot.labels.createExpense, "הוספת הוצאה");
  await i18n.changeLanguage("en");
});

test("native Android and iOS widget definitions enforce fixed 3-row large size, previews, and light/dark themes", () => {
  const androidInfoXml = fs.readFileSync(
    path.resolve(
      __dirname,
      "../modules/plutus-widget/android/src/main/res/xml/plutus_widget_info.xml",
    ),
    "utf8",
  );
  assert.match(androidInfoXml, /android:targetCellWidth="4"/);
  assert.match(androidInfoXml, /android:targetCellHeight="3"/);
  assert.match(androidInfoXml, /android:resizeMode="none"/);
  assert.match(androidInfoXml, /android:previewLayout="@layout\/plutus_widget_preview"/);
  assert.match(androidInfoXml, /android:previewImage="@drawable\/plutus_widget_preview_card"/);

  const lightColors = fs.readFileSync(
    path.resolve(
      __dirname,
      "../modules/plutus-widget/android/src/main/res/values/colors.xml",
    ),
    "utf8",
  );
  const darkColors = fs.readFileSync(
    path.resolve(
      __dirname,
      "../modules/plutus-widget/android/src/main/res/values-night/colors.xml",
    ),
    "utf8",
  );
  const extractColorNames = (xml) =>
    [...xml.matchAll(/<color name="([^"]+)">/g)].map((m) => m[1]).sort();
  assert.deepEqual(extractColorNames(lightColors), extractColorNames(darkColors));

  const iosPluginSource = fs.readFileSync(
    path.resolve(__dirname, "../plugins/with-plutus-widgets.js"),
    "utf8",
  );
  assert.match(iosPluginSource, /\.supportedFamilies\(\[\.systemLarge\]\)/);
  assert.match(iosPluginSource, /contentMarginsDisabled/);
  assert.match(iosPluginSource, /SwitchPlutusProfileIntent/);
  assert.match(iosPluginSource, /plutus:\/\/\/transactions\/create\?type=income/);
  assert.match(iosPluginSource, /plutus:\/\/\/transactions\/create\?type=expense/);
});

