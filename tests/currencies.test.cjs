const fs = require("node:fs");
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

const {
  currencies,
  getCurrencyDisplayName,
  getCurrencyFlag,
  searchCurrencies,
} = require("../src/features/profile/data/currencies-data.ts");
const {
  currencyTranslations,
} = require("../src/features/profile/data/currency-translations.ts");

function codes(list) {
  return list.map((currency) => currency.code);
}

test("every currency has Hebrew and Russian names and a flag", () => {
  for (const currency of currencies) {
    const translation = currencyTranslations[currency.code];
    assert.ok(translation, `${currency.code} must have translations`);
    assert.notEqual(translation[1].trim(), "", `${currency.code} he`);
    assert.notEqual(translation[2].trim(), "", `${currency.code} ru`);
    assert.notEqual(getCurrencyFlag(currency.code), "", currency.code);
  }
  assert.deepEqual(
    Object.keys(currencyTranslations).sort(),
    codes(currencies).sort(),
  );
});

test("currency codes stay the same while names follow the interface", () => {
  const ils = currencies.find((currency) => currency.code === "ILS");

  assert.equal(ils.name, "Israeli Shekel");
  assert.equal(getCurrencyDisplayName(ils, "en"), "Israeli Shekel");
  assert.equal(getCurrencyDisplayName(ils, "he"), "שקל ישראלי");
  assert.equal(getCurrencyDisplayName(ils, "ru"), "Израильский шекель");
  assert.equal(getCurrencyDisplayName(ils, "fr"), "Israeli Shekel");
  assert.equal(getCurrencyFlag("ILS"), "🇮🇱");
  assert.equal(getCurrencyFlag("EUR"), "🇪🇺");
  assert.equal(getCurrencyFlag("RUB"), "🇷🇺");
});

test("search matches every language at once, regardless of interface", () => {
  for (const query of [
    "Israeli Shekel",
    "שקל ישראלי",
    "израильский шекель",
    "ils",
    "₪",
    'ש"ח',
    "ש״ח",
    "shekel israeli",
  ]) {
    assert.deepEqual(codes(searchCurrencies(currencies, query)), ["ILS"], query);
  }

  assert.deepEqual(
    codes(searchCurrencies(currencies, "Российский рубль")),
    ["RUB"],
  );
  assert.deepEqual(codes(searchCurrencies(currencies, "רובל רוסי")), ["RUB"]);
  assert.ok(codes(searchCurrencies(currencies, "דולר")).includes("USD"));
  assert.ok(codes(searchCurrencies(currencies, "евро")).includes("EUR"));
  assert.equal(searchCurrencies(currencies, "  ").length, currencies.length);
  assert.deepEqual(searchCurrencies(currencies, "zzzz"), []);
});
