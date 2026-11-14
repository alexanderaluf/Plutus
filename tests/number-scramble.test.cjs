const fs = require("node:fs");
const assert = require("node:assert/strict");
const { test } = require("node:test");
const ts = require("typescript");

const compiled = ts.transpileModule(
  fs.readFileSync(
    require.resolve("../src/shared/lib/number-scramble.ts"),
    "utf8",
  ),
  {
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2022,
    },
  },
).outputText;
const exportsObject = {};
new Function("exports", compiled)(exportsObject);
const {
  hasPrivateNumber,
  maskPrivateNumbers,
  numberScrambleFrame,
  scrambleSeed,
  isVisibleNumber,
} = exportsObject;

test("privacy masks every locale's numeric characters, retaining labels and punctuation", () => {
  for (const value of [
    "1,234.50$",
    "١٬٢٣٤٫٥٠₪",
    "۱۲۳٫۴۵€",
    "12 transactions · 35%",
    "Card ４２",
  ]) {
    const masked = maskPrivateNumbers(value);
    assert.equal(/\p{N}/u.test(masked), false);
    assert.equal(masked.length, value.length);
    assert.equal(hasPrivateNumber(masked), true);
  }
  assert.equal(maskPrivateNumbers("Savings"), "Savings");
  assert.equal(hasPrivateNumber("Savings"), false);
});

test("encrypting begins with scrambled glyphs and settles to dots without a plaintext frame", () => {
  const target = "••••••";
  const first = numberScrambleFrame(target, 0, scrambleSeed("home:balance"));
  assert.match(first, /^[A-Z2-9]{6}$/);
  assert.notEqual(first, target);
  let settled = 0;
  for (let frame = 0; frame <= 60; frame++) {
    const value = numberScrambleFrame(target, frame / 60, 37);
    assert.equal(value.length, 6);
    const dots = [...value].filter((character) => character === "•").length;
    assert.ok(dots >= settled, "settled characters must never scramble again");
    settled = dots;
  }
  assert.equal(numberScrambleFrame(target, 1, 37), target);
});

test("decoding resolves characters individually and preserves currency and surrounding words", () => {
  const target = "Net: −1,234.50₪";
  const first = numberScrambleFrame(target, 0, 59);
  assert.match(first, /^Net: −[A-Z2-9],[A-Z2-9]{3}\.[A-Z2-9]{2}₪$/);
  const middle = numberScrambleFrame(target, 0.7, 59);
  assert.notEqual(middle, first);
  assert.notEqual(middle, target);
  assert.equal(numberScrambleFrame(target, 1, 59), target);
  assert.equal(numberScrambleFrame(target, 10, 59), target);
});

test("different labels have deterministic, independent scrambling sequences", () => {
  const seedA = scrambleSeed("accounts:balance");
  const seedB = scrambleSeed("accounts:assets");
  assert.equal(seedA, scrambleSeed("accounts:balance"));
  const frames = (seed) =>
    [0, 0.15, 0.3, 0.55, 0.75].map((p) =>
      numberScrambleFrame("••••••", p, seed),
    );
  assert.notDeepEqual(frames(seedA), frames(seedB));
  assert.ok(new Set(frames(seedA)).size > 3);
});

test("only measurable on-screen labels participate, including partially visible rows", () => {
  const visible = (rect) => isVisibleNumber(rect, 400, 800);
  assert.equal(visible({ x: 10, y: 10, width: 100, height: 24 }), true);
  assert.equal(visible({ x: 10, y: 790, width: 100, height: 24 }), true);
  assert.equal(visible({ x: 10, y: -10, width: 100, height: 24 }), true);
  assert.equal(visible({ x: 10, y: 801, width: 100, height: 24 }), false);
  assert.equal(visible({ x: 401, y: 10, width: 100, height: 24 }), false);
  assert.equal(visible({ x: -101, y: 10, width: 100, height: 24 }), false);
  assert.equal(visible({ x: 10, y: 10, width: 0, height: 24 }), false);
  assert.equal(visible({ x: 10, y: 10, width: 100, height: 0 }), false);
});
