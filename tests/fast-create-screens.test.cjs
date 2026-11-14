const fs = require("node:fs");
const path = require("node:path");
const assert = require("node:assert/strict");
const { test } = require("node:test");
const ts = require("typescript");
const { jsx } = require("react/jsx-runtime");

const sourceRoot = path.resolve(__dirname, "../src");

require.extensions[".ts"] = (module, filename) => {
  const source = ts
    .transpileModule(fs.readFileSync(filename, "utf8"), {
      compilerOptions: {
        module: ts.ModuleKind.CommonJS,
        target: ts.ScriptTarget.ES2022,
      },
    })
    .outputText.replace(
      /require\("@\/([^"]+)"\)/g,
      (_, relative) =>
        `require(${JSON.stringify(path.join(sourceRoot, relative))})`,
    );
  module._compile(source, filename);
};

const { createDefaultBackup } = require("../src/data/model/default-backup.ts");
const {
  selectBudgets,
  selectBudgetOptions,
} = require("../src/data/selectors/budget-selectors.ts");
const {
  selectBankAccounts,
} = require("../src/data/selectors/document-selectors.ts");
const {
  categoryHasChildren,
  categoryRootIdIn,
  selectCategories,
} = require("../src/data/selectors/category-selectors.ts");
const {
  rankRootCategories,
  resolveInitialTransactionDraft,
} = require("../src/features/transactions/transaction-form-helpers.ts");
const {
  currencies,
} = require("../src/features/profile/data/currencies-data.ts");
const {
  getCurrencySymbol,
} = require("../src/features/profile/data/currency-symbols.ts");

function resolveSrcFile(absBase) {
  for (const candidate of [
    absBase,
    `${absBase}.ts`,
    `${absBase}.tsx`,
    path.join(absBase, "index.ts"),
    path.join(absBase, "index.tsx"),
  ]) {
    if (fs.existsSync(candidate) && fs.statSync(candidate).isFile()) {
      return candidate;
    }
  }
  return null;
}

function loadComponent(relative, mocks) {
  const cache = new Map();

  function compileAndLoad(filename) {
    if (cache.has(filename)) return cache.get(filename).exports;
    const source = ts.transpileModule(fs.readFileSync(filename, "utf8"), {
      compilerOptions: {
        module: ts.ModuleKind.CommonJS,
        target: ts.ScriptTarget.ES2022,
        jsx: ts.JsxEmit.ReactJSX,
      },
    }).outputText;
    const module = { exports: {} };
    cache.set(filename, module);
    new Function("require", "module", "exports", source)(
      (name) => {
        if (Object.hasOwn(mocks, name)) return mocks[name];
        if (name === "react/jsx-runtime") return require("react/jsx-runtime");
        if (name.startsWith("@/")) {
          const resolved = resolveSrcFile(path.join(sourceRoot, name.slice(2)));
          if (resolved) {
            const rel = `@/${path.relative(sourceRoot, resolved).replace(/\.(tsx?|js)$/, "")}`;
            if (Object.hasOwn(mocks, rel)) return mocks[rel];
            return compileAndLoad(resolved);
          }
        }
        if (name.startsWith(".")) {
          const resolved = resolveSrcFile(
            path.resolve(path.dirname(filename), name),
          );
          if (resolved) {
            const rel = `@/${path.relative(sourceRoot, resolved).replace(/\.(tsx?|js)$/, "")}`;
            if (Object.hasOwn(mocks, rel)) return mocks[rel];
            return compileAndLoad(resolved);
          }
        }
        return require(name);
      },
      module,
      module.exports,
    );
    return module.exports;
  }

  return compileAndLoad(path.join(sourceRoot, relative));
}

function createHarness(platform = "android") {
  const slots = [];
  const effects = [];
  const frames = [];
  let cursor = 0;
  let rendering = false;
  let dirty = false;

  const react = {
    useState(initial) {
      const i = cursor++;
      if (!(i in slots)) {
        slots[i] = typeof initial === "function" ? initial() : initial;
      }
      return [
        slots[i],
        (value) => {
          const next = typeof value === "function" ? value(slots[i]) : value;
          if (!Object.is(next, slots[i])) {
            slots[i] = next;
            if (rendering) dirty = true;
          }
        },
      ];
    },
    useRef(initial) {
      const i = cursor++;
      if (!(i in slots)) slots[i] = { current: initial };
      return slots[i];
    },
    useCallback: (fn) => fn,
    useMemo: (compute) => compute(),
    useEffect(effect) {
      const i = cursor++;
      if (!(i in slots)) {
        slots[i] = true;
        effects.push(effect);
      }
    },
  };

  function expandNode(node) {
    if (Array.isArray(node)) {
      return node.map(expandNode);
    }
    if (node && typeof node === "object" && "type" in node) {
      if (typeof node.type === "function") {
        return expandNode(node.type(node.props));
      }
      if (node.props?.children !== undefined) {
        return {
          ...node,
          props: {
            ...node.props,
            children: expandNode(node.props.children),
          },
        };
      }
    }
    return node;
  }

  function collectNodes(node, result = []) {
    if (Array.isArray(node)) {
      for (const child of node) collectNodes(child, result);
    } else if (node && typeof node === "object" && "type" in node) {
      result.push(node);
      if (typeof node.type === "function") {
        collectNodes(node.type(node.props), result);
        return result;
      }
      if (node.props?.children !== undefined) {
        collectNodes(node.props.children, result);
      }
    }
    return result;
  }

  return {
    platform,
    react,
    requestAnimationFrame(cb) {
      frames.push(cb);
      return frames.length;
    },
    cancelAnimationFrame() {},
    render(fn) {
      let tree;
      for (let pass = 0; pass < 5; pass++) {
        cursor = 0;
        dirty = false;
        rendering = true;
        try {
          tree = expandNode(fn());
        } finally {
          rendering = false;
        }
        if (!dirty) break;
      }
      while (effects.length > 0) effects.shift()();
      return tree;
    },
    flushFrame() {
      const pending = frames.splice(0, frames.length);
      for (const cb of pending) cb();
    },
    collectNodes,
  };
}

function buildLargeBenchmarkDocument() {
  const doc = createDefaultBackup();
  doc.users = [
    { uuid: "me", id: "me", name: "Me", currency: "USD" },
    { uuid: "other", id: "other", name: "Other", currency: "EUR" },
  ];
  doc._local = { ...doc._local, selectedProfileId: "me" };
  for (let i = 0; i < 12; i++) {
    doc.accounts.push({
      uuid: `acc-${i}`,
      id: `acc-${i}`,
      user: "me",
      name: `Account ${i}`,
      accountType: i < 4 ? "bank" : "cash",
      amount: 1000,
      currencyCode: "USD",
      isDefault: i === 0,
    });
  }
  doc.categories.push(
    { uuid: "cat-root", id: "cat-root", user: "me", name: "Root", type: 0, parentId: null },
    { uuid: "cat-child", id: "cat-child", user: "me", name: "Child", type: 0, parentId: "cat-root" },
    { uuid: "cat-grand", id: "cat-grand", user: "me", name: "Grand", type: 0, parentId: "cat-child" },
    { uuid: "cat-other", id: "cat-other", user: "me", name: "Solo", type: 0, parentId: null },
  );
  for (let i = 0; i < 25; i++) {
    doc.budgets.push({
      uuid: `bud-${i}`,
      id: `bud-${i}`,
      user: "me",
      name: `Budget ${i}`,
      amount: 500,
      period: "Monthly",
      transactionType: i % 2 === 0 ? 0 : 1,
      categories: ["cat-root"],
      accounts: ["acc-0"],
      rolling: true,
      icon: "wallet",
      color: "#5c6bc0",
      isArchived: i === 24,
      createdAt: "2024-01-01T00:00:00.000Z",
    });
  }
  doc.budgets.push({
    uuid: "bud-foreign",
    id: "bud-foreign",
    user: "other",
    name: "Foreign",
    amount: 200,
    period: "Monthly",
    transactionType: 0,
  });
  for (let i = 0; i < 20_000; i++) {
    doc.transactions.push({
      uuid: `tx-${i}`,
      user: "me",
      name: `Tx ${i}`,
      amount: 10 + (i % 50),
      type: i % 2,
      category: i % 3 === 0 ? "cat-other" : "cat-grand",
      account: `acc-${i % 12}`,
      createdAt: new Date(Date.UTC(2025, i % 12, (i % 28) + 1)).toISOString(),
    });
  }
  return doc;
}

test("selectBudgetOptions matches active selectBudgets metadata and is document-memoized", () => {
  const doc = buildLargeBenchmarkDocument();
  const full = selectBudgets(doc, new Date());
  const opts1 = selectBudgetOptions(doc);
  const opts2 = selectBudgetOptions(doc);

  assert.equal(opts1, opts2, "repeated calls reuse memoized array");
  assert.equal(opts1.length, full.length);
  for (let i = 0; i < full.length; i++) {
    assert.deepEqual(opts1[i], {
      id: full[i].id,
      name: full[i].name,
      period: full[i].period,
      transactionType: full[i].transactionType,
      currencyCode: full[i].currencyCode,
      accounts: full[i].accounts,
      icon: full[i].icon,
      iconPath: full[i].iconPath,
      color: full[i].color,
    });
  }

  const draft = resolveInitialTransactionDraft({
    sourceDraft: null,
    isCopy: false,
    presetBudget: opts1[0],
    accounts: [
      { id: "acc-1", currencyCode: "USD", isDefault: false },
      { id: "acc-0", currencyCode: "USD", isDefault: true },
    ],
    defaultAccount: { id: "acc-0", currencyCode: "USD", isDefault: true },
    activeProfileCurrencyCode: "USD",
  });
  assert.equal(draft.budgetId, "bud-0");
  assert.equal(draft.accountId, "acc-0");

  const t0 = performance.now();
  for (let i = 0; i < 20; i++) selectBudgetOptions(doc);
  const optionMs = performance.now() - t0;
  assert.ok(optionMs < 5, `cached budget options took ${optionMs.toFixed(2)}ms`);
});

test("selectBankAccounts and category ancestor/children helpers are cached and exact", () => {
  const doc = buildLargeBenchmarkDocument();
  const banks1 = selectBankAccounts(doc);
  const banks2 = selectBankAccounts(doc);
  assert.equal(banks1, banks2);
  assert.equal(banks1.length, 4);

  const cats = selectCategories(doc);
  assert.equal(categoryRootIdIn(cats, "cat-grand"), "cat-root");
  assert.equal(categoryRootIdIn(cats, "cat-child"), "cat-root");
  assert.equal(categoryRootIdIn(cats, "cat-other"), "cat-other");
  assert.equal(categoryHasChildren(cats, "cat-root"), true);
  assert.equal(categoryHasChildren(cats, "cat-child"), true);
  assert.equal(categoryHasChildren(cats, "cat-grand"), false);
  assert.equal(categoryHasChildren(cats, "cat-other"), false);

  const ranked = rankRootCategories(doc, cats, 0);
  assert.equal(ranked[0].id, "cat-root");
});

test("getCurrencySymbol matches full currencies catalog", () => {
  for (const item of currencies) {
    assert.equal(getCurrencySymbol(item.code), item.symbol);
  }
});

test("CurrencySelectorSheet, AccountCurrencyChangeSheet, and DateTimePopover mount zero sheet/host nodes while closed", () => {
  const h = createHarness("ios");
  global.requestAnimationFrame = h.requestAnimationFrame;
  global.cancelAnimationFrame = h.cancelAnimationFrame;

  const BottomSheet = Object.assign(
    (props) => jsx("BottomSheet", props),
    {
      Overlay: (props) => jsx("BottomSheet.Overlay", props),
      Content: (props) => jsx("BottomSheet.Content", props),
      Title: (props) => jsx("BottomSheet.Title", props),
      Description: (props) => jsx("BottomSheet.Description", props),
    },
  );
  const Button = Object.assign((props) => jsx("Button", props), {
    Label: (props) => jsx("Button.Label", props),
  });
  let currenciesLoaded = false;
  const baseMocks = {
    react: h.react,
    "react-i18next": {
      initReactI18next: { type: "3rdParty", init() {} },
      useTranslation: () => ({ t: (k) => k, i18n: { resolvedLanguage: "en" } }),
    },
    "react-native": {
      Keyboard: { dismiss: () => {} },
      Platform: { OS: "ios" },
      Pressable: "Pressable",
      View: "View",
      useWindowDimensions: () => ({ width: 390, height: 844 }),
    },
    "react-native-safe-area-context": {
      useSafeAreaInsets: () => ({ top: 20, bottom: 20 }),
    },
    "heroui-native": {
      SearchField: Object.assign("SearchField", {
        Group: "G",
        SearchIcon: "SI",
        Input: "I",
        ClearButton: "CB",
      }),
      Button,
      useBottomSheetAwareHandlers: () => ({}),
      useThemeColor: () => ["#fff", "#888"],
    },
    "@/shared/ui/app-bottom-sheet": {
      BottomSheet,
      BottomSheetFlatList: "FlatList",
    },
    "@/shared/ui/app-bottom-sheet-portal": {
      AppBottomSheetPortal: (p) => jsx("Portal", p),
    },
    "@/shared/ui/app-text": { Text: "Text" },
    "@/shared/ui/filled-icon": { FilledIcon: "FilledIcon" },
    "@/shared/ui/use-bottom-sheet-initial-position-fix": {
      useBottomSheetInitialPositionFix: () => ({
        onChange: () => {},
        bindSheet: () => {},
      }),
    },
    "@/features/profile/data/currencies-data": new Proxy(
      {},
      {
        get(_t, prop) {
          currenciesLoaded = true;
          return require("../src/features/profile/data/currencies-data.ts")[
            prop
          ];
        },
      },
    ),
    "@/data/local-data-provider": {
      useLocalData: () => ({
        document: {},
        ensureExchangeRates: async () => ({ rates: {} }),
      }),
    },
    "@/data/selectors/exchange-rate-selectors": {
      selectExchangeRates: () => null,
    },
    "@/data/model/exchange-rate": { convertCurrency: (a) => a },
    "@expo/ui/swift-ui": {
      DatePicker: "DatePicker",
      Host: "Host",
      Popover: Object.assign("Popover", {
        Trigger: "Trigger",
        Content: "Content",
      }),
      Spacer: "Spacer",
      VStack: "VStack",
    },
    "@expo/ui/swift-ui/modifiers": Object.fromEntries(
      ["datePickerStyle", "frame", "padding", "scaleEffect", "tint"].map(
        (k) => [k, () => k],
      ),
    ),
  };

  const { CurrencySelectorSheet } = loadComponent(
    "features/profile/components/currency-selector-sheet.tsx",
    baseMocks,
  );
  const closedCurrency = h.render(() =>
    CurrencySelectorSheet({
      isOpen: false,
      selectedCode: "USD",
      onOpenChange: () => {},
      onSelect: () => {},
    }),
  );
  assert.equal(closedCurrency, null);
  assert.equal(currenciesLoaded, false);

  const openedCurrency = h.render(() =>
    CurrencySelectorSheet({
      isOpen: true,
      selectedCode: "USD",
      onOpenChange: () => {},
      onSelect: () => {},
    }),
  );
  assert.ok(
    h.collectNodes(openedCurrency).some((n) => n.type === "BottomSheet"),
  );
  assert.equal(currenciesLoaded, true);

  const h2 = createHarness("ios");
  const { AccountCurrencyChangeSheet } = loadComponent(
    "features/accounts/components/account-currency-change-sheet.tsx",
    { ...baseMocks, react: h2.react },
  );
  const closedChange = h2.render(() =>
    AccountCurrencyChangeSheet({
      request: null,
      onClose: () => {},
      onApply: () => {},
    }),
  );
  assert.equal(closedChange, null);

  const h3 = createHarness("ios");
  const { DateTimePopover } = loadComponent(
    "shared/ui/date-time-popover.ios.tsx",
    { ...baseMocks, react: h3.react },
  );
  const closedPopover = h3.render(() =>
    DateTimePopover({
      accentColor: "#000",
      isDark: false,
      isPresented: false,
      mode: "date",
      title: "Date",
      value: new Date(),
      onDismiss: () => {},
      onValueChange: () => {},
    }),
  );
  assert.equal(
    h3
      .collectNodes(closedPopover)
      .some((n) => n.type === "Host" || n.type === "DatePicker"),
    false,
  );

  const openedPopover = h3.render(() =>
    DateTimePopover({
      accentColor: "#000",
      isDark: false,
      isPresented: true,
      mode: "date",
      title: "Date",
      value: new Date(),
      onDismiss: () => {},
      onValueChange: () => {},
    }),
  );
  assert.equal(
    h3.collectNodes(openedPopover).some((n) => n.type === "Host"),
    true,
  );
  assert.equal(
    h3.collectNodes(openedPopover).some((n) => n.type === "DatePicker"),
    true,
  );
});

test("TransactionEditorScreen and AccountCreateScreen stage below-the-fold sections and never touch selectBudgets or closed pickers on Frame 1", () => {
  const doc = buildLargeBenchmarkDocument();
  let fullBudgetsCalled = false;
  let imagePickerLoaded = false;
  let datePickerLoaded = false;
  let iconPickerLoaded = false;
  let savingsFormLoaded = false;

  const hTx = createHarness("android");
  global.requestAnimationFrame = hTx.requestAnimationFrame;
  global.cancelAnimationFrame = hTx.cancelAnimationFrame;

  const BottomSheet = Object.assign((p) => jsx("BottomSheet", p), {
    Overlay: (p) => jsx("BottomSheet.Overlay", p),
    Content: (p) => jsx("BottomSheet.Content", p),
    Title: (p) => jsx("BottomSheet.Title", p),
  });
  const Button = Object.assign((p) => jsx("Button", p), {
    Label: (p) => jsx("Button.Label", p),
  });
  const sharedMocks = {
    "react-i18next": {
      initReactI18next: { type: "3rdParty", init() {} },
      useTranslation: () => ({ t: (k) => k, i18n: { resolvedLanguage: "en" } }),
    },
    "react-native": {
      Animated: {
        Value: function Value() {
          return {
            interpolate: () => 0,
            addListener: () => "1",
            removeListener: () => {},
          };
        },
        View: "Animated.View",
        ScrollView: "Animated.ScrollView",
        event: () => () => {},
      },
      I18nManager: { isRTL: false },
      Keyboard: { dismiss: () => {} },
      KeyboardAvoidingView: "KeyboardAvoidingView",
      Platform: {
        OS: "android",
        select: (options) => options?.android ?? options?.default,
      },
      Pressable: "Pressable",
      ScrollView: "ScrollView",
      StyleSheet: {
        create: (s) => s,
        hairlineWidth: 1,
        flatten: (x) => x,
      },
      TextInput: "TextInput",
      View: "View",
      useWindowDimensions: () => ({ width: 390, height: 844 }),
    },
    "react-native-reanimated": {
      __esModule: true,
      default: { View: "Reanimated.View" },
      Easing: { bezier: () => ({}) },
      FadeIn: (() => {
        const chain = {
          duration: () => chain,
          easing: () => chain,
          reduceMotion: () => chain,
        };
        return chain;
      })(),
      LinearTransition: (() => {
        const chain = {
          duration: () => chain,
          easing: () => chain,
          reduceMotion: () => chain,
        };
        return chain;
      })(),
      ReduceMotion: { System: "system" },
      useAnimatedStyle: () => ({}),
      useSharedValue: (v) => ({ get: () => v, set: () => {} }),
      withTiming: (v) => v,
    },
    "react-native-safe-area-context": {
      useSafeAreaInsets: () => ({ top: 20, bottom: 20, left: 0, right: 0 }),
    },
    "expo": { uuid: { v4: () => "uuid-1" } },
    "expo-blur": { BlurTargetView: "BlurTargetView" },
    "expo-localization": { useCalendars: () => [{ uses24hourClock: true }] },
    "expo-router": {
      useLocalSearchParams: () => ({}),
      useRouter: () => ({
        back: () => {},
        push: () => {},
        dismissTo: () => {},
      }),
    },
    "expo-crypto": { randomUUID: () => "uuid-1" },
    "@expo/ui/community/datetime-picker": {
      get DateTimePicker() {
        datePickerLoaded = true;
        return "DateTimePicker";
      },
    },
    "expo-image-picker": new Proxy(
      {},
      {
        get() {
          imagePickerLoaded = true;
          return async () => ({ canceled: true });
        },
      },
    ),
    "heroui-native": { Button },
    "@/data/local-data-provider": {
      useLocalData: () => ({
        document: doc,
        updateDocument: async () => {},
        ensureExchangeRates: async () => ({ rates: {} }),
      }),
    },
    "@/features/profile/profile-provider": {
      useProfiles: () => ({
        activeProfile: { id: "me", currencyCode: "USD" },
      }),
    },
    "@/localization/localization-provider": {
      useAppLocalization: () => ({
        direction: "ltr",
        isRTL: false,
        language: "en",
      }),
    },
    "@/shared/theme/app-theme": {
      colorWithAlpha: (c) => c,
      useAppThemeColors: () => ({
        accent: "#087E8B",
        accentForeground: "#fff",
        background: "#fff",
        border: "#ddd",
        danger: "#c00",
        foreground: "#111",
        isDark: false,
        muted: "#666",
        success: "#090",
        surface: "#fff",
        surfaceSecondary: "#f5f5f5",
      }),
    },
    "@/shared/ui/app-alert": { AppAlert: { alert: () => {} } },
    "@/shared/ui/app-bottom-sheet": { BottomSheet },
    "@/shared/ui/app-bottom-sheet-portal": {
      AppBottomSheetPortal: "Portal",
    },
    "@/shared/ui/app-text": { Text: "Text" },
    "@/shared/ui/collapsing-header": {
      useCollapsingHeader: () => ({
        headerHidden: false,
        onScroll: () => {},
        scrollY: {
          interpolate: () => 0,
          addListener: () => "1",
          removeListener: () => {},
        },
      }),
    },
    "@/shared/ui/filled-icon": { FilledIcon: "FilledIcon" },
    "@/shared/ui/glass-segmented-control": {
      GlassSegmentedControl: "GlassSegmentedControl",
    },
    "@/shared/ui/safe-area-gradients": {
      BottomSafeAreaGradient: "BottomSafeAreaGradient",
      TopSafeAreaGradient: "TopSafeAreaGradient",
    },
    "@/shared/ui/use-bottom-sheet-initial-position-fix": {
      useBottomSheetInitialPositionFix: () => ({
        bindSheet: () => {},
        onChange: () => {},
      }),
    },
    "@/features/profile/components/currency-selector-sheet": {
      CurrencySelectorSheet: "CurrencySelectorSheet",
    },
    "@/features/transactions/components/transaction-hero-card": {
      TransactionHeroCard: "TransactionHeroCard",
    },
    "@/features/transactions/components/transaction-flow-section": {
      TransactionCategoryCard: "TransactionCategoryCard",
      TransactionAccountCard: "TransactionAccountCard",
    },
    "@/features/transactions/components/transaction-schedule-section": {
      TransactionScheduleSection: "TransactionScheduleSection",
    },
    "@/features/transactions/components/transaction-extras-section": {
      TransactionExtrasSection: "TransactionExtrasSection",
    },
    "@/data/attachments/attachment-store": {
      persistAttachment: async () => ({}),
      resolveAttachmentUri: () => null,
    },
    "@/data/exchange-rates/exchange-rate-service": {},
    "@/data/selectors/document-selectors": {
      ...require("../src/data/selectors/document-selectors.ts"),
      selectBudgets: () => {
        fullBudgetsCalled = true;
        return [];
      },
    },
  };

  const { TransactionEditorScreen } = loadComponent(
    "features/transactions/transaction-editor-screen.tsx",
    { ...sharedMocks, react: hTx.react },
  );

  const txFrame1 = hTx.render(() => TransactionEditorScreen({}));
  const frame1Types = new Set(hTx.collectNodes(txFrame1).map((n) => n.type));
  assert.equal(fullBudgetsCalled, false, "must use selectBudgetOptions");
  assert.equal(imagePickerLoaded, false, "must not load image picker on mount");
  assert.equal(datePickerLoaded, false, "must not load datetime picker on mount");
  assert.equal(frame1Types.has("TransactionHeroCard"), true);
  assert.equal(frame1Types.has("TransactionCategoryCard"), true);
  assert.equal(frame1Types.has("TransactionAccountCard"), true);
  assert.equal(frame1Types.has("BottomSheet"), false, "closed action menu must not mount on create");
  assert.equal(frame1Types.has("TransactionScheduleSection"), false);
  assert.equal(frame1Types.has("TransactionExtrasSection"), false);

  hTx.flushFrame();
  const txFrame2 = hTx.render(() => TransactionEditorScreen({}));
  const frame2Types = new Set(hTx.collectNodes(txFrame2).map((n) => n.type));
  assert.equal(frame2Types.has("TransactionScheduleSection"), true);
  assert.equal(frame2Types.has("TransactionExtrasSection"), true);

  const hAcc = createHarness("android");
  global.requestAnimationFrame = hAcc.requestAnimationFrame;
  global.cancelAnimationFrame = hAcc.cancelAnimationFrame;

  const { AccountCreateScreen } = loadComponent(
    "features/accounts/account-create-screen.tsx",
    {
      ...sharedMocks,
      react: hAcc.react,
      "@/shared/ui/icon-picker": {
        get IconPicker() {
          iconPickerLoaded = true;
          return "IconPicker";
        },
      },
      "@/features/accounts/components/savings-details-form": {
        get SavingsDetailsForm() {
          savingsFormLoaded = true;
          return "SavingsDetailsForm";
        },
      },
      "@/features/accounts/components/account-currency-change-sheet": {
        AccountCurrencyChangeSheet: "AccountCurrencyChangeSheet",
      },
      "@/features/accounts/components/account-icon": {
        AccountIcon: "AccountIcon",
      },
      "@/features/accounts/components/card-company-logo": {
        CardCompanyLogo: "CardCompanyLogo",
      },
      "@/shared/ui/form-ui": {
        CONTINUOUS: {},
        FieldInput: "FieldInput",
        FormCard: "FormCard",
        FormDivider: "FormDivider",
        FormField: "FormField",
        FormHelp: "FormHelp",
        FormLabel: "FormLabel",
        SwitchRow: "SwitchRow",
        TABULAR: {},
      },
    },
  );

  const accFrame1 = hAcc.render(() => AccountCreateScreen({}));
  const accFrame1Types = new Set(hAcc.collectNodes(accFrame1).map((n) => n.type));
  assert.equal(iconPickerLoaded, false, "must not load IconPicker on initial mount");
  assert.equal(savingsFormLoaded, false, "must not load SavingsDetailsForm for default cash");
  assert.equal(accFrame1Types.has("FormCard"), true);
  assert.equal(accFrame1Types.has("SwitchRow"), false);

  hAcc.flushFrame();
  const accFrame2 = hAcc.render(() => AccountCreateScreen({}));
  const accFrame2Types = new Set(hAcc.collectNodes(accFrame2).map((n) => n.type));
  assert.equal(accFrame2Types.has("SwitchRow"), true);
});
