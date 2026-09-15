const fs = require("node:fs");
const path = require("node:path");
const assert = require("node:assert/strict");
const { test } = require("node:test");
const ts = require("typescript");

require.extensions[".ts"] = (module, filename) => {
  const source = ts.transpileModule(fs.readFileSync(filename, "utf8"), {
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2022,
    },
  }).outputText;

  module._compile(source, filename);
};

const { en } = require("../src/localization/locales/en.ts");
const { he } = require("../src/localization/locales/he.ts");
const { ru } = require("../src/localization/locales/ru.ts");

test("assembled catalogs include recurring translations", () => {
  assert.equal(en.recurring.title, "Recurring");
  assert.equal(en.recurring.monthly, "Monthly average");
  assert.equal(he.recurring.title, "תשלומים חוזרים");
  assert.equal(he.recurring.monthly, "ממוצע חודשי");
});

function flattenCatalog(value, prefix = "", result = new Map()) {
  for (const [key, child] of Object.entries(value)) {
    const keyPath = prefix ? `${prefix}.${key}` : key;

    if (typeof child === "string") {
      result.set(keyPath, child);
      continue;
    }

    assert.equal(
      child !== null && typeof child === "object" && !Array.isArray(child),
      true,
      `${keyPath} must be a string or nested catalog object`,
    );
    flattenCatalog(child, keyPath, result);
  }

  return result;
}

function matches(value, pattern) {
  return [...value.matchAll(pattern)].map(([match]) => match).sort();
}

test("Hebrew catalog has complete recursive key parity with English", () => {
  const english = flattenCatalog(en);
  const hebrew = flattenCatalog(he);

  assert.deepEqual([...hebrew.keys()].sort(), [...english.keys()].sort());
  assert.equal(hebrew.size > 0, true);
  for (const [keyPath, value] of hebrew) {
    assert.notEqual(value.trim(), "", `${keyPath} must not be empty`);
  }
});

test("Russian catalog has complete recursive key parity with English", () => {
  const english = flattenCatalog(en);
  const russian = flattenCatalog(ru);

  assert.deepEqual([...russian.keys()].sort(), [...english.keys()].sort());
  assert.equal(russian.size > 0, true);
  for (const [keyPath, value] of russian) {
    assert.notEqual(value.trim(), "", `${keyPath} must not be empty`);
  }
});

test("Russian catalog is localized for primary application flows", () => {
  assert.equal(ru.language.russian, "Русский");
  assert.equal(ru.navigation.tabs.home, "Главная");
  assert.equal(ru.onboarding.language, "Выберите язык");
  assert.equal(ru.recurring.title, "Регулярные платежи");
});

test("Russian catalog localizes account card activity labels", () => {
  assert.equal(ru.accounts.cards.allTimeActivity, "Активность за всё время");
  assert.equal(ru.accounts.cards.income, "Доходы");
  assert.equal(ru.accounts.cards.expenses, "Расходы");
  assert.equal(ru.accounts.cards.net, "Чистый итог");
  assert.equal(ru.accounts.cards.available, "Доступно");
  assert.equal(ru.accounts.cards.paysDay, "оплата {{day}}");
});

test("Russian catalog localizes budget-sheet selection text", () => {
  assert.equal(ru.budgets.common.typeBudget, "Бюджет: {{type}}");
  assert.equal(ru.budgets.common.current, "Текущее значение: {{value}}");
  assert.equal(
    ru.budgets.common.currentMonthlyCycle,
    "Текущий период: {{period}} · начинается в день {{day}}",
  );
});

test("Russian catalog localizes every delete confirmation flow", () => {
  const confirmations = [
    ["profile", ru.profile.manage.delete, en.profile.manage.delete],
    ["account", ru.accounts.details.delete, en.accounts.details.delete],
    ["budget", ru.budgets.details, en.budgets.details],
    ["transaction", ru.transactions.details, en.transactions.details],
    ["category", ru.categories.delete, en.categories.delete],
    ["recurring", ru.recurring, en.recurring],
  ];

  for (const [name, russian, english] of confirmations) {
    for (const [key, value] of Object.entries(russian)) {
      if (!/delete|delet|confirm|cancel|error|title|description/i.test(key)) {
        continue;
      }
      assert.notEqual(value, english[key], `${name}.${key} must be Russian`);
    }
  }
});

test("Russian catalog preserves interpolation tokens and protected literals", () => {
  const english = flattenCatalog(en);
  const russian = flattenCatalog(ru);
  const interpolationToken = /{{[^{}]+}}/g;
  const protectedLiteral = /YYYY-MM-DD|#[0-9A-Fa-f]{6}|\+|%/g;

  for (const [keyPath, englishValue] of english) {
    const russianValue = russian.get(keyPath);
    assert.deepEqual(
      matches(russianValue, interpolationToken),
      matches(englishValue, interpolationToken),
      `${keyPath} must preserve interpolation tokens`,
    );
    assert.deepEqual(
      matches(russianValue, protectedLiteral),
      matches(englishValue, protectedLiteral),
      `${keyPath} must preserve protected literals`,
    );
  }
});

test("Hebrew catalog preserves interpolation tokens and protected literals", () => {
  const english = flattenCatalog(en);
  const hebrew = flattenCatalog(he);
  const interpolationToken = /{{[^{}]+}}/g;
  // Sentence punctuation and arrow direction can change in RTL translations.
  // Protect machine-readable formats, colors and mathematical literals.
  const protectedLiteral = /YYYY-MM-DD|#[0-9A-Fa-f]{6}|\+|%/g;

  for (const [keyPath, englishValue] of english) {
    const hebrewValue = hebrew.get(keyPath);
    assert.deepEqual(
      matches(hebrewValue, interpolationToken),
      matches(englishValue, interpolationToken),
      `${keyPath} must preserve interpolation tokens`,
    );
    assert.deepEqual(
      matches(hebrewValue, protectedLiteral),
      matches(englishValue, protectedLiteral),
      `${keyPath} must preserve protected literals`,
    );
  }
});
