const fs = require("node:fs");
const assert = require("node:assert/strict");
const { test } = require("node:test");
const ts = require("typescript");
const normalizeColor = require("@react-native/normalize-colors");

const compiled = ts.transpileModule(
  fs.readFileSync(require.resolve("../src/shared/theme/app-theme.tsx"), "utf8"),
  {
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      jsx: ts.JsxEmit.ReactJSX,
    },
  },
).outputText;

function loadAlpha(platform) {
  const module = { exports: {} };
  new Function("require", "module", "exports", compiled)(
    (name) =>
      name === "react-native"
        ? {
            processColor(color) {
              const rgba = normalizeColor(color);
              if (rgba == null) return undefined;
              const argb = ((rgba << 24) | (rgba >>> 8)) >>> 0;
              return platform === "android" ? argb | 0 : argb;
            },
          }
        : {},
    module,
    module.exports,
  );
  return module.exports.colorWithAlpha;
}

for (const platform of ["android", "ios"]) {
  test(`${platform}: RGB and hex theme colors retain transparent gradient stops`, () => {
    const alpha = loadAlpha(platform);
    for (const color of [
      "#DCE7E0",
      "rgb(220, 231, 224)",
      "rgba(220, 231, 224, 1)",
    ]) {
      assert.equal(alpha(color, 0), "rgba(220, 231, 224, 0)");
      assert.equal(alpha(color, 0.92), "rgba(220, 231, 224, 0.92)");
    }
    for (const color of ["white", "#fff", "#ffffffff", "rgb(255, 255, 255)"]) {
      assert.equal(alpha(color, 0), "rgba(255, 255, 255, 0)");
    }
    assert.equal(alpha("#000000", 0.36), "rgba(0, 0, 0, 0.36)");
    assert.equal(alpha("#000000", 2), "rgba(0, 0, 0, 1)");
    assert.equal(alpha("#000000", -1), "rgba(0, 0, 0, 0)");
  });
}
