const fs = require("node:fs");
const assert = require("node:assert/strict");
const { test } = require("node:test");
const ts = require("typescript");

function loadGradients(insets, background) {
  const filename = require.resolve("../src/shared/ui/safe-area-gradients.tsx");
  const compiled = ts.transpileModule(fs.readFileSync(filename, "utf8"), {
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2022,
      jsx: ts.JsxEmit.ReactJSX,
    },
  }).outputText;
  const mocks = {
    "expo-linear-gradient": { LinearGradient: "LinearGradient" },
    "react-native": { View: "View" },
    "react-native-safe-area-context": { useSafeAreaInsets: () => insets },
    "@/shared/theme/app-theme": {
      useAppThemeColors: () => ({ background }),
      colorWithAlpha: (color, alpha) => `${color}:${alpha}`,
    },
  };
  const module = { exports: {} };
  new Function("require", "module", "exports", compiled)(
    (name) => mocks[name] ?? require(name),
    module,
    module.exports,
  );
  return module.exports;
}

for (const [device, top, bottom] of [
  ["iOS home indicator", 59, 34],
  ["iOS without home indicator", 20, 0],
  ["Android gestures", 24, 24],
  ["Android navigation buttons", 24, 48],
  ["Android hidden navigation", 24, 0],
]) {
  for (const background of ["#DCE7E0", "#000000"]) {
    test(`${device}, ${background}: continuous fades cover the system areas`, () => {
      const { TopSafeAreaGradient, BottomSafeAreaGradient } = loadGradients(
        { top, bottom },
        background,
      );
      const header = TopSafeAreaGradient({});
      assert.equal(header.type, "LinearGradient");
      assert.equal(header.props.style.top, 0);
      assert.equal(header.props.style.height, top + 96);
      assert.equal(header.props.children, undefined);
      assert.equal(header.props.style.backgroundColor, undefined);
      assert.equal(header.props.colors[0], background + ":0.92");
      assert.equal(header.props.colors.at(-1), background + ":0");
      const collapsed = TopSafeAreaGradient({ headerHidden: true });
      assert.equal(collapsed.props.style.top, 0);
      assert.equal(collapsed.props.style.height, top + 32);
      assert.equal(collapsed.props.colors[0], background + ":0.72");
      assert.equal(collapsed.props.colors[1], background + ":0.18");
      assert.equal(collapsed.props.colors.at(-1), background + ":0");
      assert.equal(collapsed.props.pointerEvents, "none");
      assert.equal(
        TopSafeAreaGradient({ headerHidden: false }).props.style.height,
        top + 96,
      );

      for (const fadeHeight of [104, 110, 128, 138]) {
        const footer = BottomSafeAreaGradient({ fadeHeight });
        assert.equal(footer.type, "LinearGradient");
        assert.equal(footer.props.children, undefined);
        assert.equal(footer.props.style.backgroundColor, undefined);
        assert.equal(footer.props.style.bottom, 0);
        assert.equal(footer.props.style.height, fadeHeight + bottom);
        assert.equal(footer.props.colors[0], `${background}:0`);
        assert.equal(footer.props.colors.at(-1), background + ":0.92");
        assert.equal(footer.props.pointerEvents, "none");
        assert.equal(footer.props["aria-hidden"], true);
      }
      assert.equal(header.props.pointerEvents, "none");
    });
  }
}

test("a navigation-mode change uses the latest inset", () => {
  const insets = { top: 24, bottom: 24 };
  const { BottomSafeAreaGradient } = loadGradients(insets, "#000000");
  assert.equal(BottomSafeAreaGradient({}).props.style.height, 176);
  insets.bottom = 48;
  assert.equal(BottomSafeAreaGradient({}).props.style.height, 200);
});
