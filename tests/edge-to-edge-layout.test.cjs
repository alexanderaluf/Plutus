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
  let contextCount = 0;
  const contexts = {};
  const slots = [];
  const scrollListeners = [];
  class AnimatedValue {
    constructor(value) {
      this.value = value;
    }
    setValue(value) {
      this.value = value;
    }
    interpolate(config) {
      return { interpolate: config };
    }
    addListener(listener) {
      scrollListeners.push(listener);
      return scrollListeners.length;
    }
    removeListener() {}
  }
  const mocks = {
    react: {
      createContext: () => `Context${contextCount++}`,
      use: (context) => contexts[context] ?? null,
      useState: (initial) => {
        const index = cursor++;
        if (!(index in slots))
          slots[index] = typeof initial === "function" ? initial() : initial;
        return [
          slots[index],
          (value) => {
            slots[index] = value;
          },
        ];
      },
      useEffect: (effect) => effect(),
      useMemo: (factory) => factory(),
      useCallback: (callback) => callback,
      useRef: (value) => ({ current: value }),
    },
    "react-native": {
      View: "View",
      Animated: {
        Value: AnimatedValue,
        View: "AnimatedView",
        ScrollView: "AnimatedScrollView",
        FlatList: "AnimatedFlatList",
        event: (mapping, config) => ({ mapping, config }),
      },
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
      // Provider elements: content insets, then the header scroll value.
      contexts[tree.type] = tree.props.value;
      const scrollProvider = tree.props.children;
      contexts[scrollProvider.type] = scrollProvider.props.value;
      return {
        tree,
        scrollY: scrollProvider.props.value,
        root: scrollProvider.props.children,
      };
    },
    scroll: (props) => module.exports.EdgeToEdgeScrollView(props),
    list: (props) => module.exports.EdgeToEdgeFlatList(props),
    emitScroll: (value) =>
      scrollListeners.forEach((listener) => listener({ value })),
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
    let { tree, root } = layout.render(props);
    assert.equal(root.props.style.flex, 1);
    assert.equal(root.props.style.paddingTop, undefined);
    assert.equal(root.props.style.paddingBottom, undefined);
    const [, topFade, bottomFade, header, dock, footer] = root.props.children;
    assert.equal(topFade.type, "TopFade");
    assert.equal(bottomFade.type, "BottomFade");
    assert.equal(dock, undefined);
    assert.equal(header.props.style.top, top);
    assert.equal(footer.props.style.bottom, bottom);
    // Measured control sizes, including larger system text, become content padding.
    header.props.children.props.onLayout({
      nativeEvent: { layout: { height: 92 } },
    });
    footer.props.onLayout({ nativeEvent: { layout: { height: 80 } } });
    ({ tree } = layout.render(props));
    assert.equal(tree.props.value.top, top + 92);
    assert.equal(tree.props.value.bottom, bottom + 80);
    const scroll = layout.scroll({
      contentContainerStyle: { paddingTop: 12, paddingBottom: 16, gap: 8 },
    });
    assert.equal(scroll.type, "AnimatedScrollView");
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

  test(`${device}: the page header hides while scrolling like the tab pages`, () => {
    const layout = loadLayout({ top, bottom, left: 0, right: 0 });
    const props = { header: "Header", children: "Content" };
    let { root, scrollY } = layout.render(props);
    let header = root.props.children[3];
    header.props.children.props.onLayout({
      nativeEvent: { layout: { height: 72 } },
    });
    ({ root, scrollY } = layout.render(props));
    header = root.props.children[3];
    const [translateY] = header.props.children.props.style.transform;
    // Travels exactly its own measured height, fully faded after 40 points.
    assert.deepEqual(translateY.translateY.interpolate.inputRange, [0, 72]);
    assert.deepEqual(translateY.translateY.interpolate.outputRange, [0, -72]);
    assert.deepEqual(
      header.props.children.props.style.opacity.interpolate.inputRange,
      [0, 40],
    );
    // Clipped to its slot so it never draws over the status bar.
    assert.equal(header.props.style.overflow, "hidden");
    assert.equal(header.props.pointerEvents, "box-none");
    assert.equal(root.props.children[1].props.headerHidden, false);

    // The page scroller drives the shared value with the native driver.
    scrollY.setValue(120);
    const scroll = layout.scroll({});
    assert.equal(scrollY.value, 0, "a newly mounted page starts expanded");
    assert.equal(scroll.props.onScroll.config.useNativeDriver, true);
    assert.equal(
      scroll.props.onScroll.mapping[0].nativeEvent.contentOffset.y,
      scrollY,
    );
    assert.equal(scroll.props.scrollEventThrottle, 16);
    const list = layout.list({ data: [] });
    assert.equal(list.type, "AnimatedFlatList");
    assert.equal(list.props.onScroll.mapping[0].nativeEvent.contentOffset.y, scrollY);

    layout.emitScroll(40);
    ({ root } = layout.render(props));
    header = root.props.children[3];
    assert.equal(header.props.pointerEvents, "none");
    assert.equal(header.props.accessibilityElementsHidden, true);
    assert.equal(header.props.importantForAccessibility, "no-hide-descendants");
    assert.equal(root.props.children[1].props.headerHidden, true);

    layout.emitScroll(0);
    ({ root } = layout.render(props));
    assert.equal(root.props.children[3].props.pointerEvents, "box-none");
  });

  test(`${device}: docked filters follow the header up, then stay pinned`, () => {
    const layout = loadLayout({ top, bottom, left: 0, right: 0 });
    const props = { header: "Header", headerDock: "Filters", children: "Content" };
    let { root, tree } = layout.render(props);
    root.props.children[3].props.children.props.onLayout({
      nativeEvent: { layout: { height: 56 } },
    });
    root.props.children[4].props.onLayout({
      nativeEvent: { layout: { height: 120 } },
    });
    ({ root, tree } = layout.render(props));
    const dock = root.props.children[4];
    assert.equal(dock.props.style.top, top + 56);
    assert.deepEqual(
      dock.props.style.transform[0].translateY.interpolate.outputRange,
      [0, -56],
      "the dock stops right below the top edge",
    );
    assert.equal(tree.props.value.top, top + 56 + 120);
    layout.emitScroll(200);
    ({ root } = layout.render(props));
    // The taller fade stays so rows pass softly under the pinned filters.
    assert.equal(root.props.children[1].props.headerHidden, false);
  });

  test(`${device}: pages without a header have nothing to collapse`, () => {
    const layout = loadLayout({ top, bottom, left: 0, right: 0 });
    const { scrollY, tree } = layout.render({ children: "Content" });
    assert.equal(scrollY, null);
    assert.equal(tree.props.value.top, top);
    const scroll = layout.scroll({});
    assert.equal(typeof scroll.props.onScroll, "function");
  });
}
