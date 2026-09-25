const fs = require("node:fs");
const assert = require("node:assert/strict");
const { test } = require("node:test");
const ts = require("typescript");

// Only the pure frame rule is exercised; native rendering is not simulated.
const source = ts.transpileModule(
  fs.readFileSync(
    require.resolve("../src/shared/ui/sliding-indicator.tsx"),
    "utf8",
  ),
  {
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2022,
      jsx: ts.JsxEmit.ReactJSX,
    },
  },
).outputText;
const module_ = { exports: {} };
const stubs = {
  "react/jsx-runtime": { jsx() {}, jsxs() {} },
  "react-native": { StyleSheet: { create: (styles) => styles } },
  "react-native-reanimated": { ReduceMotion: { System: "system" } },
};
new Function("require", "module", "exports", source)(
  (name) => stubs[name] ?? {},
  module_,
  module_.exports,
);
const { mergeIndicatorFrame } = module_.exports;

test("a hidden or detached screen's empty layout keeps the remembered frame", () => {
  const frames = { home: { x: 12, width: 80 } };
  assert.equal(mergeIndicatorFrame(frames, "home", { x: 0, width: 0 }), frames);
  assert.equal(
    mergeIndicatorFrame(frames, "home", { x: NaN, width: 80 }),
    frames,
  );
});

test("unchanged layouts keep the same object so nothing re-renders", () => {
  const frames = { home: { x: 12, width: 80 } };
  assert.equal(
    mergeIndicatorFrame(frames, "home", { x: 12, width: 80 }),
    frames,
  );
});

test("new or moved items are recorded without dropping the others", () => {
  const frames = { home: { x: 12, width: 80 } };
  const next = mergeIndicatorFrame(frames, "search", { x: 200, width: 70 });
  assert.deepEqual(next, {
    home: { x: 12, width: 80 },
    search: { x: 200, width: 70 },
  });
  // RTL rows report physical positions too: the first item sits on the right.
  const rtl = mergeIndicatorFrame(next, "home", { x: 290, width: 80 });
  assert.deepEqual(rtl.home, { x: 290, width: 80 });
});
