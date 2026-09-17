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
function screenHarness(document, insets, sizes = {}) {
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
  let deferUpdates = false;
  const slots = [],
    effects = [];
  const counts = {
    indexed: 0,
    projected: 0,
    overview: 0,
    budgets: 0,
    categories: 0,
    recurring: 0,
  };
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
      useDeferredValue: (value) => {
        const index = cursor++;
        if (!slots[index] || !deferUpdates) slots[index] = { value };
        return slots[index].value;
      },
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
      ActivityIndicator: "Loading",
      useWindowDimensions: () => ({ width: 390, height: 844 }),
      View: "View",
      StyleSheet: { create: (value) => value },
    },
    "react-native-reanimated": {
      default: { View: "AnimatedContent" },
      Easing: { bezier: () => () => 0 },
      ReduceMotion: { System: "system" },
      useSharedValue: (initial) =>
        memo(
          () => ({
            value: initial,
            get() {
              return this.value;
            },
            set(value) {
              this.value = value;
            },
          }),
          [],
        ),
      useAnimatedStyle: () => memo(() => ({}), []),
      withTiming: (value) => value,
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
      selectCategories() {
        counts.categories++;
        return Array.from({ length: sizes.categories ?? 0 }, (_, i) => ({
          id: `category-${i}`,
          parentId: i > 0 && i % 2 ? `category-${i - 1}` : null,
        }));
      },
      selectCategoryMonthlyTotals: () => new Map(),
      selectTrackedBudgets() {
        counts.budgets++;
        return Array.from({ length: sizes.budgets ?? 0 }, (_, i) => ({
          id: `budget-${i}`,
        }));
      },
      selectHomeRecurringPayments() {
        counts.recurring++;
        return {
          paid: [],
          remaining: [],
          pending: Array.from({ length: sizes.recurring ?? 0 }, (_, i) => ({
            recurring: { id: `recurring-${i}` },
            date: new Date(2026, 8, 16, 0, 0, i),
          })),
        };
      },
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
    "./components/visible-fade-row": { VisibleFadeRow: "VisibleFadeRow" },
    "./visible-row-fade": require("../src/features/home/visible-row-fade.ts"),
    "./components/transaction-month-selector": {
      TransactionMonthSelector: "MonthSelector",
    },
    "./components/budget-card": {
      BudgetListHeader: "Budgets",
      BudgetOverviewCard: "BudgetRow",
    },
    "./components/category-list": {
      CategoryListHeader: "Categories",
      CategoryListRow: "CategoryRow",
    },
    "./components/overview-carousel": { OverviewCarousel: "Overview" },
    "./components/recurring-home-section": {
      RecurringHomeHeader: "Recurring",
      RecurringHomeRow: "RecurringRow",
    },
    "@/data/model/financial-month": require("../src/data/model/financial-month.ts"),
  };
  const loaderModule = { exports: {} };
  const loaderSource = ts.transpileModule(
    fs.readFileSync(
      require.resolve("../src/data/selectors/home-section-selectors.ts"),
      "utf8",
    ),
    {
      compilerOptions: {
        module: ts.ModuleKind.CommonJS,
        target: ts.ScriptTarget.ES2022,
      },
    },
  ).outputText;
  new Function("require", "module", "exports", loaderSource)(
    (name) =>
      name === "./document-selectors"
        ? mocks["@/data/selectors/document-selectors"]
        : name === "./transaction-selectors"
          ? selectors
          : require(
              name.startsWith(".")
                ? path.join(root, "data/selectors", name)
                : name,
            ),
    loaderModule,
    loaderModule.exports,
  );
  mocks["@/data/selectors/home-section-selectors"] = loaderModule.exports;
  // Screen tests control readiness independently of the scheduler. The real
  // cooperative loader and hook are exercised in home-data-loader.test.cjs.
  mocks["./use-home-data"] = {
    useHomeData(d, currency, clock, selectedSection) {
      const index = memo(
        () =>
          mocks[
            "@/data/selectors/transaction-selectors"
          ].createTransactionIndex(d),
        [d],
      );
      const overview = memo(
        () =>
          mocks["@/data/selectors/document-selectors"].selectHomeOverview(
            d,
            currency,
            clock,
          ),
        [d, currency, clock],
      );
      const loader = memo(
        () => loaderModule.exports.createHomeSectionLoader(d, clock, index),
        [d, clock, index],
      );
      const request = memo(
        () => ({ section: selectedSection, loader }),
        [selectedSection, loader],
      );
      const ready = mocks.react.useDeferredValue(request);
      const sectionData = memo(
        () =>
          ready.section === "transactions" ? null : ready.loader(ready.section),
        [ready],
      );
      return { index, overview, sectionData, pending: ready !== request };
    },
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
    defer() {
      deferUpdates = true;
    },
    resume() {
      deferUpdates = false;
    },
    replaceDocument(next) {
      document = next;
    },
    render() {
      cursor = 0;
      const tree = module.exports.HomeScreen();
      while (effects.length) effects.shift()();
      return tree;
    },
  };
}

test("all home sections reveal only visible rows and keep animation history while paging", () => {
  const harness = screenHarness(
    fixture(),
    { top: 59, bottom: 34 },
    {
      categories: 90,
      budgets: 90,
      recurring: 90,
    },
  );
  let tree = harness.render();
  let previousController;
  for (const section of [
    "transactions",
    "categories",
    "budgets",
    "recurring",
    "transactions",
  ]) {
    let list = find(tree, "FlatList");
    find(list.props.ListHeaderComponent, "Selector").props.onChange(section);
    tree = harness.render();
    list = find(tree, "FlatList");
    const first = list.props.data[0];
    const second = list.props.data[1];
    const animationRow = list.props.renderItem({ item: first, index: 0 });
    assert.equal(animationRow.type, "VisibleFadeRow");
    assert.equal(animationRow.props.rowKey, list.props.keyExtractor(first));
    const controller = animationRow.props.controller;
    assert.notEqual(
      controller,
      previousController,
      "each section visit has fresh reveal history",
    );
    const calls = [];
    const unmount = controller.register(animationRow.props.rowKey, {
      reveal: (delay) => calls.push(["reveal", delay]),
      finish: () => calls.push(["finish"]),
      hide: () => calls.push(["hide"]),
    });
    list.props.onViewableItemsChanged({
      viewableItems: [
        {
          item: first,
          key: list.props.keyExtractor(first),
          index: 0,
          isViewable: true,
        },
      ],
    });
    assert.deepEqual(calls, [["hide"], ["reveal", 0]]);
    assert.equal(controller.hasSeen(list.props.keyExtractor(second)), false);
    const callback = list.props.onViewableItemsChanged;
    list.props.onEndReached();
    tree = harness.render();
    list = find(tree, "FlatList");
    assert.equal(
      list.props.onViewableItemsChanged,
      callback,
      "pagination must not reset the visibility callback",
    );
    assert.equal(
      list.props.renderItem({ item: first, index: 0 }).props.controller,
      controller,
    );
    list.props.onViewableItemsChanged({ viewableItems: [] });
    list.props.onViewableItemsChanged({
      viewableItems: [
        {
          item: first,
          key: list.props.keyExtractor(first),
          index: 0,
          isViewable: true,
        },
      ],
    });
    assert.equal(calls.filter(([kind]) => kind === "reveal").length, 1);
    previousController = controller;
    unmount();
  }
});

test("home sections acknowledge selection before derived work, page rows, reuse results and invalidate changed data", () => {
  const document = fixture();
  const sizes = { categories: 95, budgets: 78, recurring: 103 };
  const harness = screenHarness(document, { top: 24, bottom: 24 }, sizes);
  let tree = harness.render();
  const initialKey = find(tree, "FlatList").key;
  for (const [section, rowType] of [
    ["categories", "CategoryRow"],
    ["budgets", "BudgetRow"],
    ["recurring", "RecurringRow"],
  ]) {
    harness.defer();
    find(
      find(tree, "FlatList").props.ListHeaderComponent,
      "Selector",
    ).props.onChange(section);
    tree = harness.render();
    let list = find(tree, "FlatList");
    assert.equal(
      find(list.props.ListHeaderComponent, "Selector").props.value,
      section,
    );
    assert.equal(
      harness.counts[section],
      0,
      "the urgent selection must not calculate the section",
    );
    assert.ok(find(list.props.ListEmptyComponent, "Loading"));
    assert.equal(
      list.props.data.length,
      0,
      "old section rows must not appear under the new selection",
    );
    harness.resume();
    tree = harness.render();
    list = find(tree, "FlatList");
    assert.equal(list.key, initialKey);
    assert.equal(list.props.data.length, 30);
    assert.ok(
      find(
        list.props.renderItem({ item: list.props.data[0], index: 0 }),
        rowType,
      ),
    );
    assert.equal(
      find(list.props.ListHeaderComponent, rowType),
      null,
      "section items must be virtualized, never mounted inside the header",
    );
    while (list.props.data.length < sizes[section]) {
      const previous = list.props.data.length;
      list.props.onEndReached();
      tree = harness.render();
      list = find(tree, "FlatList");
      assert.equal(
        list.props.data.length,
        Math.min(previous + 30, sizes[section]),
      );
    }
    assert.equal(
      new Set(list.props.data.map(list.props.keyExtractor)).size,
      sizes[section],
    );
    assert.equal(
      harness.counts[section],
      1,
      "paging must not rebuild derived results",
    );
  }
  for (const section of ["categories", "budgets", "recurring"]) {
    find(
      find(tree, "FlatList").props.ListHeaderComponent,
      "Selector",
    ).props.onChange(section);
    tree = harness.render();
    assert.equal(find(tree, "FlatList").props.data.length, 30);
    assert.equal(
      harness.counts[section],
      1,
      "return visits must reuse results for the same document/date",
    );
  }
  harness.defer();
  harness.replaceDocument({
    ...document,
    recurrings: [...document.recurrings],
  });
  tree = harness.render();
  assert.equal(find(tree, "FlatList").props.data.length, 0);
  harness.resume();
  tree = harness.render();
  assert.equal(find(tree, "FlatList").props.data.length, 30);
  assert.equal(
    harness.counts.recurring,
    2,
    "a new canonical document must invalidate derived results",
  );
});

test("rapid section changes prepare only the latest requested data", () => {
  const harness = screenHarness(
    fixture(),
    { top: 59, bottom: 34 },
    { budgets: 100, recurring: 100 },
  );
  let tree = harness.render();
  harness.defer();
  find(
    find(tree, "FlatList").props.ListHeaderComponent,
    "Selector",
  ).props.onChange("budgets");
  tree = harness.render();
  find(
    find(tree, "FlatList").props.ListHeaderComponent,
    "Selector",
  ).props.onChange("recurring");
  tree = harness.render();
  assert.equal(
    find(find(tree, "FlatList").props.ListHeaderComponent, "Selector").props
      .value,
    "recurring",
  );
  harness.resume();
  tree = harness.render();
  assert.equal(harness.counts.budgets, 0);
  assert.equal(harness.counts.recurring, 1);
  assert.ok(
    find(tree, "FlatList").props.data.every((row) => row.kind === "recurring"),
  );
});
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
    const row = find(
      list.props.renderItem({ item: list.props.data[0], index: 0 }),
      "Row",
    );
    row.props.onPress(row.props.project(row.props.entry));
    tree = harness.render();
    assert.equal(find(tree, "Details").props.transaction.id, "8-99");
    const layout = list.props.ListHeaderComponent.props.children.find(
      (child) => child?.props?.onLayout && child?.props?.pointerEvents,
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

  test(`${device}: switching scrolled sections preserves the header and starts content below the pinned selector`, () => {
    const harness = screenHarness(fixture(), { top, bottom });
    let tree = harness.render();
    const initialList = find(tree, "FlatList");
    const scrollCommands = [];
    initialList.props.ref.current = {
      scrollToOffset: (command) => scrollCommands.push(command),
    };
    const layout = initialList.props.ListHeaderComponent.props.children.find(
      (child) => child?.props?.onLayout && child?.props?.pointerEvents,
    );
    layout.props.onLayout({ nativeEvent: { layout: { y: 400 } } });
    harness.render();

    for (const [section, content] of [
      ["categories", "Categories"],
      ["budgets", "Budgets"],
      ["recurring", "Recurring"],
      ["transactions", "Text"],
    ]) {
      harness.scrollY.setValue(650);
      tree = harness.render();
      const dock = tree.props.children[0].props.children.at(-1);
      find(dock, "Selector").props.onChange(section);
      tree = harness.render();
      const list = find(tree, "FlatList");
      assert.equal(
        list.key,
        initialList.key,
        "the measured header must stay mounted",
      );
      assert.equal(harness.scrollY.value, 400 - top - 8);
      assert.deepEqual(scrollCommands.at(-1), {
        offset: 400 - top - 8,
        animated: false,
      });
      assert.ok(find(list.props.ListHeaderComponent, content));
      assert.equal(
        find(list.props.ListHeaderComponent, "Selector").props.value,
        section,
      );
      assert.equal(list.props.data.length, section === "transactions" ? 30 : 0);
    }
    assert.equal(harness.counts.overview, 1);
    assert.equal(harness.counts.indexed, 1);
  });
}
