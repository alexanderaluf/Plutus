const fs = require("node:fs");
const path = require("node:path");
const assert = require("node:assert/strict");
const { test } = require("node:test");
const ts = require("typescript");
const root = path.resolve(__dirname, "../src");
require.extensions[".ts"] = (module, filename) => {
  const source = ts
    .transpileModule(fs.readFileSync(filename, "utf8"), {
      compilerOptions: {
        module: ts.ModuleKind.CommonJS,
        target: ts.ScriptTarget.ES2022,
      },
    })
    .outputText.replace(
      /require\("@\/([^\"]+)"\)/g,
      (_, relative) => `require(${JSON.stringify(path.join(root, relative))})`,
    );
  module._compile(source, filename);
};
const selectors = require("../src/data/selectors/transaction-selectors.ts");
const { createDefaultBackup } = require("../src/data/model/default-backup.ts");

// Exercise actual screen callbacks using the native-component/hook harness
// pattern of the repository's layout tests. Native windowing is not simulated.
function screenHarness(document, insets) {
  const compiled = ts.transpileModule(
    fs.readFileSync(
      require.resolve("../src/features/home/home-screen.tsx"),
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
  let cursor = 0;
  const slots = [],
    effects = [];
  const counts = { indexed: 0, projected: 0, overview: 0, budgets: 0 };
  const equal = (a, b) =>
    a &&
    b &&
    a.length === b.length &&
    a.every((value, i) => Object.is(value, b[i]));
  const memo = (compute, deps) => {
    const index = cursor++;
    if (!slots[index] || !equal(slots[index].deps, deps))
      slots[index] = { deps, value: compute() };
    return slots[index].value;
  };
  const listeners = new Map();
  const scrollY = {
    value: 0,
    addListener(callback) {
      const id = String(listeners.size);
      listeners.set(id, callback);
      return id;
    },
    removeListener(id) {
      listeners.delete(id);
    },
    setValue(value) {
      this.value = value;
      for (const listener of listeners.values()) listener({ value });
    },
  };
  const now = new Date(2026, 8, 16, 12);
  const mocks = {
    react: {
      useMemo: memo,
      useCallback: (callback, deps) => memo(() => callback, deps),
      useRef: (initial) => memo(() => ({ current: initial }), []),
      useState: (initial) => {
        const index = cursor++;
        if (!slots[index])
          slots[index] = {
            value: typeof initial === "function" ? initial() : initial,
          };
        return [
          slots[index].value,
          (value) => {
            slots[index].value =
              typeof value === "function" ? value(slots[index].value) : value;
          },
        ];
      },
      useEffect: (effect, deps) => {
        const index = cursor++;
        if (!slots[index] || !equal(slots[index].deps, deps)) {
          const previous = slots[index];
          slots[index] = { deps };
          effects.push(() => {
            previous?.cleanup?.();
            slots[index].cleanup = effect();
          });
        }
      },
    },
    "react-native": {
      Animated: { FlatList: "FlatList" },
      FlatList: "FlatList",
      Pressable: "Pressable",
      View: "View",
      StyleSheet: { create: (value) => value },
    },
    "expo-blur": { BlurTargetView: "BlurTargetView" },
    "react-native-safe-area-context": { useSafeAreaInsets: () => insets },
    "expo-router": { useRouter: () => ({ push() {} }) },
    "react-i18next": {
      useTranslation: () => ({
        i18n: { resolvedLanguage: "en" },
        t: (key) => key,
      }),
    },
    "@/data/local-data-provider": { useLocalData: () => ({ document }) },
    "@/features/profile/profile-provider": {
      useProfiles: () => ({
        activeProfile: {
          id: "me",
          name: "Alex",
          currencyCode: "USD",
          color: "#123456",
        },
      }),
    },
    "@/features/categories/use-category-clock": { useCategoryClock: () => now },
    "@/data/selectors/transaction-selectors": {
      ...selectors,
      createTransactionIndex(d) {
        counts.indexed++;
        return selectors.createTransactionIndex(d);
      },
      createTransactionProjector(...args) {
        const project = selectors.createTransactionProjector(...args);
        return (entry) => {
          counts.projected++;
          return project(entry);
        };
      },
    },
    "@/data/selectors/document-selectors": {
      selectHomeOverview() {
        counts.overview++;
        return {};
      },
      selectCategories: () => [],
      selectCategoryMonthlyTotals: () => new Map(),
      selectTrackedBudgets() {
        counts.budgets++;
        return [];
      },
      selectHomeRecurringPayments: () => ({
        paid: [],
        pending: [],
        remaining: [],
      }),
    },
    "@/shared/icons/colors": { colorForeground: () => "#ffffff" },
    "@/shared/ui/app-text": { Text: "Text" },
    "@/shared/ui/glass-segmented-control": {
      GlassSegmentedControl: "Selector",
    },
    "@/shared/ui/filled-icon": { FilledIcon: "Icon" },
    "@/shared/ui/collapsing-header": {
      CollapsingHeader: "Header",
      CollapsingHeaderSpacer: "Spacer",
      useCollapsingHeader: () => ({
        headerHidden: false,
        scrollY,
        onScroll() {},
      }),
    },
    "@/features/transactions/transaction-detail-sheet": {
      TransactionDetailSheet: "Details",
    },
    "./components/transaction-list": { IndexedTransactionRow: "Row" },
    "./components/transaction-month-selector": {
      TransactionMonthSelector: "MonthSelector",
    },
    "./components/budget-card": { BudgetCard: "Budgets" },
    "./components/category-list": { CategoryList: "Categories" },
    "./components/overview-carousel": { OverviewCarousel: "Overview" },
    "./components/recurring-home-section": {
      RecurringHomeSection: "Recurring",
    },
    "@/data/model/financial-month": require("../src/data/model/financial-month.ts"),
  };
  const module = { exports: {} };
  new Function("require", "module", "exports", compiled)(
    (name) => mocks[name] ?? require(name),
    module,
    module.exports,
  );
  return {
    counts,
    scrollY,
    render() {
      cursor = 0;
      const tree = module.exports.HomeScreen();
      while (effects.length) effects.shift()();
      return tree;
    },
  };
}
function find(tree, type) {
  if (!tree) return null;
  if (Array.isArray(tree))
    return tree.map((child) => find(child, type)).find(Boolean) ?? null;
  return tree.type === type ? tree : find(tree.props?.children, type);
}
function fixture() {
  const d = createDefaultBackup();
  d.users = [{ uuid: "me" }];
  d._local.selectedProfileId = "me";
  d._local.monthStartDay = 10;
  d.transactions = [];
  for (const [month, count] of [
    [8, 100],
    [7, 50],
  ]) {
    for (let i = 0; i < count; i++)
      d.transactions.push({
        uuid: `${month}-${i}`,
        user: "me",
        name: `Transaction ${i}`,
        date: new Date(2026, month, 10, 12, 0, i).toISOString(),
        amount: 10,
        type: 0,
      });
  }
  return d;
}

for (const [device, top, bottom] of [
  ["iOS", 59, 34],
  ["Android gestures", 24, 24],
  ["Android buttons", 24, 48],
]) {
  test(`${device}: home pages the selected financial month and pins its controls below the safe inset`, () => {
    const harness = screenHarness(fixture(), { top, bottom });
    let tree = harness.render(),
      list = find(tree, "FlatList");
    assert.equal(list.props.data.length, 30);
    assert.equal(list.props.data[0].id, "8-99");
    assert.equal(list.props.contentInsetAdjustmentBehavior, "never");
    assert.equal(
      list.props.contentContainerStyle[1].paddingBottom,
      160 + bottom,
    );
    assert.equal(
      harness.counts.projected,
      0,
      "the header must not eagerly format the month",
    );
    assert.equal(harness.counts.budgets, 0);
    for (const expected of [60, 90, 100, 100]) {
      list.props.onEndReached();
      tree = harness.render();
      list = find(tree, "FlatList");
      assert.equal(list.props.data.length, expected);
    }
    assert.equal(harness.counts.indexed, 1, "pages must reuse the date index");
    assert.equal(
      harness.counts.overview,
      1,
      "pages must not recalculate the overview",
    );
    const row = list.props.renderItem({ item: list.props.data[0], index: 0 });
    row.props.onPress(row.props.project(row.props.entry));
    tree = harness.render();
    assert.equal(find(tree, "Details").props.transaction.id, "8-99");
    const layout = list.props.ListHeaderComponent.props.children.find(
      (child) => child?.props?.onLayout,
    );
    layout.props.onLayout({ nativeEvent: { layout: { y: 400 } } });
    harness.render();
    harness.scrollY.setValue(500);
    tree = harness.render();
    const sticky = tree.props.children[0].props.children.at(-1);
    assert.equal(sticky.props.style[1].top, top + 8);
    assert.ok(find(sticky, "MonthSelector"));
    find(list.props.ListHeaderComponent, "MonthSelector").props.onPrevious();
    tree = harness.render();
    list = find(tree, "FlatList");
    assert.equal(list.props.data.length, 30);
    assert.equal(list.props.data[0].id, "7-49");
    assert.equal(
      find(list.props.ListHeaderComponent, "MonthSelector").props.isCurrent,
      false,
    );
    assert.equal(find(tree, "Details"), null);
    assert.equal(harness.scrollY.value, 0);
    find(list.props.ListHeaderComponent, "MonthSelector").props.onNext();
    tree = harness.render();
    list = find(tree, "FlatList");
    assert.equal(
      list.props.data.length,
      30,
      "returning to a month starts with a small page again",
    );
    assert.equal(
      find(list.props.ListHeaderComponent, "MonthSelector").props.isCurrent,
      true,
    );
    assert.equal(harness.counts.indexed, 1);
    find(list.props.ListHeaderComponent, "Selector").props.onChange("budgets");
    tree = harness.render();
    assert.equal(find(tree, "FlatList").props.data.length, 0);
    assert.equal(
      find(find(tree, "FlatList").props.ListHeaderComponent, "MonthSelector"),
      null,
    );
    assert.equal(harness.counts.budgets, 1);
  });
}
