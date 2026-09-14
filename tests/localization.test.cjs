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
