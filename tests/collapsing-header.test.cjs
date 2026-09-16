const fs = require("node:fs");
const assert = require("node:assert/strict");
const { test } = require("node:test");
const ts = require("typescript");

const flatten = (style) =>
  Object.assign({}, ...[style].flat(Infinity).filter(Boolean));

function loadHeader(platform) {
  const filename = require.resolve("../src/shared/ui/collapsing-header.tsx");
  const compiled = ts.transpileModule(fs.readFileSync(filename, "utf8"), {
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2022,
      jsx: ts.JsxEmit.ReactJSX,
    },
  }).outputText;
  const mocks = {
    "react-native-safe-area-context": {
      useSafeAreaInsets: () => ({ top: 47, bottom: 34 }),
    },
    "@/shared/ui/safe-area-gradients": {
      TopSafeAreaGradient: "TopSafeAreaGradient",
    },
    "react-native": {
      Animated: { View: "Animated.View" },
      Platform: { OS: platform },
      StyleSheet: { create: (styles) => styles },
      View: "View",
    },
    "@/shared/theme/app-theme": {
      useAppThemeColors: () => ({ background: "#ffffff" }),
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

for (const platform of ["ios", "android"]) {
  test(`${platform} header bounds match the supplied page gutter`, () => {
    const { CollapsingHeader, CollapsingHeaderSpacer } = loadHeader(platform);
    for (const inset of [undefined, 12, 20]) {
      const tree = CollapsingHeader({
        children: "Header",
        height: 112,
        horizontalInset: inset,
        headerHidden: false,
        scrollY: { interpolate: (config) => config },
        topInset: 47,
      });
      const [gradient, clip] = tree.props.children;
      const bounds = flatten(clip.props.style);
      assert.equal(bounds.left, inset ?? 16);
      assert.equal(bounds.right, inset ?? 16);
      assert.equal(bounds.height, 112);
      assert.equal(bounds.top, 47);
      assert.equal(bounds.overflow, "hidden");
      assert.equal(gradient.type, "TopSafeAreaGradient");
      assert.equal(gradient.props.topInset, undefined);
      assert.equal(gradient.props.headerHidden, false);
      assert.equal(clip.props.pointerEvents, "auto");
      assert.equal(
        flatten(CollapsingHeaderSpacer({ height: 112 }).props.style).height,
        159,
      );
      const animated = clip.props.children.props.style;
      assert.deepEqual(animated.opacity.inputRange, [0, 40]);
      assert.deepEqual(animated.opacity.outputRange, [1, 0]);
      assert.equal(animated.opacity.extrapolate, "clamp");
      assert.deepEqual(animated.transform[0].translateY.outputRange, [0, -56]);
    }
  });

  test(`${platform} faded header is hidden from touches and screen readers`, () => {
    const { CollapsingHeader } = loadHeader(platform);
    const tree = CollapsingHeader({
      headerHidden: true,
      scrollY: { interpolate: (config) => config },
    });
    const clip = tree.props.children[1];
    assert.equal(tree.props.children[0].props.headerHidden, true);
    assert.equal(clip.props.pointerEvents, "none");
    assert.equal(clip.props.accessibilityElementsHidden, true);
    assert.equal(clip.props.importantForAccessibility, "no-hide-descendants");
  });
}
