const fs = require("node:fs");
const path = require("node:path");
const assert = require("node:assert/strict");
const { test } = require("node:test");
const ts = require("typescript");

function load(relative, mocks) {
  const filename = path.resolve(__dirname, "../src", relative);
  const source = ts.transpileModule(fs.readFileSync(filename, "utf8"), {
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2022,
      jsx: ts.JsxEmit.ReactJSX,
    },
  }).outputText;
  const module = { exports: {} };
  new Function("require", "module", "exports", source)(
    (name) => mocks[name] ?? require(name),
    module,
    module.exports,
  );
  return module.exports;
}

function nativeSheet(isDark = false, isRTL = false) {
  let context;
  const closing = [],
    changes = [];
  let keyboardDismissals = 0,
    completions = 0;
  const modifier =
    (name) =>
    (...args) => ({ name, args });
  const mocks = {
    react: {
      createContext: () => ({ Provider: "SheetContext" }),
      useContext: () => context,
      useState: (initial) => [initial, () => {}],
      useMemo: (compute) => compute(),
    },
    "@expo/ui": { Host: "Host", RNHostView: "RNHost" },
    "@expo/ui/swift-ui": { BottomSheet: "NativeSheet", Group: "Group" },
    "@expo/ui/swift-ui/modifiers": Object.fromEntries(
      [
        "interactiveDismissDisabled",
        "presentationBackground",
        "presentationDetents",
        "presentationDragIndicator",
        "presentationSizing",
      ].map((name) => [name, modifier(name)]),
    ),
    "heroui-native": { CloseButton: "CloseButton" },
    "react-native": {
      Keyboard: { dismiss: () => keyboardDismissals++ },
      View: "View",
      FlatList: "NativeFlatList",
      ScrollView: { Context: { Provider: "ScrollContext" } },
      VirtualizedList: { contextType: { Provider: "ListContext" } },
      useWindowDimensions: () => ({ width: 393, height: 852 }),
    },
    "@/localization/localization-provider": {
      useAppLocalization: () => ({ isRTL }),
    },
    "@/shared/theme/app-theme": {
      useAppThemeColors: () => ({
        isDark,
        surface: isDark ? "#161616" : "#FFFFFF",
      }),
    },
    "./app-text": { Text: "Text" },
  };
  const { BottomSheet, BottomSheetFlatList } = load(
    "shared/ui/app-bottom-sheet.ios.tsx",
    mocks,
  );
  return {
    BottomSheetFlatList,
    render(props = {}, open = true) {
      const provider = BottomSheet({
        isOpen: open,
        onOpenChange: (value) => closing.push(value),
      });
      context = provider.props.value;
      return BottomSheet.Content({
        children: "Records",
        onClose: () => completions++,
        onChange: (...args) => changes.push(args),
        ...props,
      });
    },
    closeButton: (props) => BottomSheet.Close(props),
    title: (props) => BottomSheet.Title(props),
    overlay: () => BottomSheet.Overlay(),
    get closing() {
      return closing;
    },
    get completions() {
      return completions;
    },
    get changes() {
      return changes;
    },
    get keyboardDismissals() {
      return keyboardDismissals;
    },
  };
}
function modifiers(host) {
  return host.props.children.props.children.props.modifiers;
}
function getModifier(host, name) {
  return modifiers(host).find((modifier) => modifier.name === name);
}

for (const dark of [false, true]) {
  for (const rtl of [false, true]) {
    test(`native iOS sheet applies ${dark ? "dark" : "light"} theme, ${rtl ? "RTL" : "LTR"} layout and native detents`, () => {
      const sheet = nativeSheet(dark, rtl);
      const host = sheet.render({
        snapPoints: ["38%", "80%"],
        enableDynamicSizing: false,
      });
      assert.equal(host.type, "Host");
      assert.equal(host.props.pointerEvents, "none");
      assert.equal(host.props.colorScheme, dark ? "dark" : "light");
      assert.equal(
        host.props.layoutDirection,
        rtl ? "rightToLeft" : "leftToRight",
      );
      const native = host.props.children;
      assert.equal(native.type, "NativeSheet");
      assert.equal(native.props.isPresented, true);
      assert.equal(native.props.fitToContents, false);
      assert.deepEqual(getModifier(host, "presentationDetents").args[0], [
        { fraction: 0.38 },
        { fraction: 0.8 },
      ]);
      assert.equal(
        getModifier(host, "presentationBackground").args[0],
        dark ? "#161616" : "#FFFFFF",
      );
      assert.equal(getModifier(host, "presentationSizing").args[0], "page");
      getModifier(host, "presentationDetents").args[1].onSelectionChange({
        fraction: 0.8,
      });
      assert.equal(sheet.changes[0][0], 1);
      native.props.onIsPresentedChange(false);
      assert.deepEqual(sheet.closing, [false]);
      assert.equal(sheet.keyboardDismissals, 1);
      assert.equal(
        sheet.completions,
        0,
        "completion waits for the native dismissal animation",
      );
      native.props.onDismiss();
      assert.equal(sheet.completions, 1);
      assert.equal(sheet.changes.at(-1)[0], -1);
      assert.equal(
        sheet.overlay(),
        null,
        "iOS owns the backdrop and drag indicator",
      );
    });
  }
}

test("native dismissal is disabled during protected operations while programmatic close still completes", () => {
  const sheet = nativeSheet();
  const host = sheet.render({
    enablePanDownToClose: false,
    enableHandlePanningGesture: false,
    enableContentPanningGesture: false,
  });
  assert.equal(getModifier(host, "interactiveDismissDisabled").args[0], true);
  host.props.children.props.onIsPresentedChange(false);
  assert.deepEqual(sheet.closing, []);
  assert.equal(sheet.keyboardDismissals, 0);
  const closed = sheet.render({}, false);
  assert.equal(closed.props.children.props.isPresented, false);
  closed.props.children.props.onDismiss();
  assert.equal(sheet.completions, 1);
});

test("dynamic iOS confirmations size to content; fixed sheets fill their detent and reset parent list contexts", () => {
  const sheet = nativeSheet();
  const dynamic = sheet.render();
  assert.equal(dynamic.props.children.props.fitToContents, true);
  const dynamicRNHost = dynamic.props.children.props.children.props.children;
  assert.equal(dynamicRNHost.type, "RNHost");
  assert.equal(dynamicRNHost.props.matchContents, true);
  const fixed = sheet.render({
    snapPoints: ["85%"],
    enableDynamicSizing: false,
  });
  const rnHost = fixed.props.children.props.children.props.children;
  assert.equal(rnHost.props.matchContents, false);
  assert.equal(rnHost.props.children.props.style.flexGrow, 1);
  assert.equal(rnHost.props.children.props.style.height, 0);
  const reset = rnHost.props.children.props.children;
  const tree = reset.type(reset.props).props.children;
  assert.equal(tree.type, "ListContext");
  assert.equal(tree.props.value, null);
  assert.equal(tree.props.children.type, "ScrollContext");
  assert.equal(tree.props.children.props.value, null);
  assert.equal(sheet.BottomSheetFlatList, "NativeFlatList");
});

test("iOS changing transaction confirmation replaces its native detent and respects title accessibility", () => {
  const sheet = nativeSheet();
  const details = sheet.render({
    snapPoints: ["80%"],
    enableDynamicSizing: false,
  });
  const confirmation = sheet.render({
    snapPoints: ["38%"],
    enableDynamicSizing: false,
  });
  assert.deepEqual(
    getModifier(details, "presentationDetents").args[1].selection,
    { fraction: 0.8 },
  );
  assert.deepEqual(
    getModifier(confirmation, "presentationDetents").args[1].selection,
    { fraction: 0.38 },
  );
  const title = sheet.title({ children: "Delete?", className: "text-danger" });
  assert.equal(title.props.accessibilityRole, "header");
  assert.ok(title.props.className.includes("text-danger"));
});

test("Android/web export the identical HeroUI and Gorhom components", () => {
  const hero = {},
    scroll = {},
    flat = {};
  const legacy = load("shared/ui/app-bottom-sheet.tsx", {
    "heroui-native": { BottomSheet: hero },
    "@gorhom/bottom-sheet": {
      BottomSheetScrollView: scroll,
      BottomSheetFlatList: flat,
    },
  });
  assert.equal(legacy.BottomSheet, hero);
  assert.equal(legacy.BottomSheetScrollView, scroll);
  assert.equal(legacy.BottomSheetFlatList, flat);
});

test("the iOS portal leaves modal hosting and focus to the native presenter", () => {
  const portal = load("shared/ui/app-bottom-sheet-portal.ios.tsx", {});
  assert.equal(portal.AppBottomSheetPortalHost(), null);
  assert.equal(
    portal.AppBottomSheetPortal({ children: "Content", isOpen: true }).props
      .children,
    "Content",
  );
});
