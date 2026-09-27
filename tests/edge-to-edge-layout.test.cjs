const fs = require("node:fs");
const assert = require("node:assert/strict");
const { test } = require("node:test");
const ts = require("typescript");

function loadLayout(safeInsets) {
  const filename = require.resolve("../src/shared/ui/edge-to-edge-layout.tsx");
  const compiled = ts.transpileModule(fs.readFileSync(filename, "utf8"), {
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2022,
      jsx: ts.JsxEmit.ReactJSX,
    },
  }).outputText;
  let cursor = 0;
  let contextInsets = null;
  const slots = [];
  const mocks = {
    react: {
      createContext: () => "ContentInsetsContext",
      use: () => contextInsets,
      useState: (initial) => {
        const index = cursor++;
        slots[index] ??= initial;
        return [
          slots[index],
          (value) => {
            slots[index] = value;
          },
        ];
      },
    },
    "react-native": {
      View: "View",
      ScrollView: "ScrollView",
      StyleSheet: {
        flatten: (style) =>
          Object.assign({}, ...[style].flat(Infinity).filter(Boolean)),
      },
    },
    "react-native-safe-area-context": { useSafeAreaInsets: () => safeInsets },
    "@/shared/theme/app-theme": {
      useAppThemeColors: () => ({ background: "#000000" }),
    },
    "./safe-area-gradients": {
      TopSafeAreaGradient: "TopFade",
      BottomSafeAreaGradient: "BottomFade",
    },
  };
  const module = { exports: {} };
  new Function("require", "module", "exports", compiled)(
    (name) => mocks[name] ?? require(name),
    module,
    module.exports,
  );
  return {
    render: (props) => {
      cursor = 0;
      const tree = module.exports.EdgeToEdgeLayout(props);
      contextInsets = tree.props.value;
      return tree;
    },
    scroll: (props) => module.exports.EdgeToEdgeScrollView(props),
  };
}

for (const [device, top, bottom] of [
  ["iOS", 59, 34],
  ["Android gestures", 24, 24],
  ["Android buttons", 24, 48],
]) {
  test(`${device}: safe controls overlay a viewport that reaches both phone edges`, () => {
    const layout = loadLayout({ top, bottom, left: 0, right: 0 });
    const props = {
      header: "Header",
      footer: "Save",
      children: (insets) => ({ type: "Content", insets }),
    };
    let tree = layout.render(props);
    const root = tree.props.children;
    assert.equal(root.props.style.flex, 1);
    assert.equal(root.props.style.paddingTop, undefined);
    assert.equal(root.props.style.paddingBottom, undefined);
    const [, topFade, bottomFade, header, footer] = root.props.children;
    assert.equal(topFade.type, "TopFade");
    assert.equal(bottomFade.type, "BottomFade");
    assert.equal(header.props.style.top, top);
    assert.equal(footer.props.style.bottom, bottom);
    // Measured control sizes, including larger system text, become content padding.
    header.props.onLayout({ nativeEvent: { layout: { height: 92 } } });
    footer.props.onLayout({ nativeEvent: { layout: { height: 80 } } });
    tree = layout.render(props);
    assert.equal(tree.props.value.top, top + 92);
    assert.equal(tree.props.value.bottom, bottom + 80);
    const scroll = layout.scroll({
      contentContainerStyle: { paddingTop: 12, paddingBottom: 16, gap: 8 },
    });
    assert.equal(scroll.props.contentInsetAdjustmentBehavior, "never");
    assert.equal(scroll.props.automaticallyAdjustContentInsets, false);
    assert.equal(scroll.props.style, undefined);
    assert.equal(
      scroll.props.contentContainerStyle[1].paddingTop,
      top + 92 + 12,
    );
    assert.equal(
      scroll.props.contentContainerStyle[1].paddingBottom,
      bottom + 80 + 16,
    );
    assert.equal(scroll.props.contentContainerStyle[0].gap, 8);
  });
}
