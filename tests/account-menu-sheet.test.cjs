/* global __dirname */
const fs = require("node:fs");
const path = require("node:path");
const assert = require("node:assert/strict");
const { test } = require("node:test");
const ts = require("typescript");

// Drive the real screen's handlers with delayed portal layout and native close
// callbacks. Native rendering itself still needs verification on a device.
function mountScreen(
  platform = "android",
  write = async () => {},
  preLayout = true,
  open = true,
  configuration = {},
) {
  const records = configuration.records ?? [];
  const slots = [],
    effects = [],
    cleanups = [];
  const frames = new Map();
  const navigation = [];
  const rangeCalls = [],
    shiftCalls = [];
  let cursor = 0,
    nextFrame = 0,
    writes = 0;
  const sheet = Object.assign(() => {}, {
    Content: "Content",
    Overlay: "Overlay",
    Title: "Title",
    Description: "Description",
  });
  const button = Object.assign(() => {}, { Label: "Label" });
  const mocks = {
    react: {
      useState(initial) {
        const index = cursor++;
        if (!(index in slots))
          slots[index] = typeof initial === "function" ? initial() : initial;
        return [
          slots[index],
          (value) => {
            slots[index] =
              typeof value === "function" ? value(slots[index]) : value;
          },
        ];
      },
      useRef(initial) {
        const index = cursor++;
        if (!(index in slots)) slots[index] = { current: initial };
        return slots[index];
      },
      useEffect(effect) {
        const index = cursor++;
        if (!(index in slots)) {
          slots[index] = true;
          effects.push(effect);
        }
      },
      useMemo: (compute) => compute(),
    },
    "react-native": {
      View: "View",
      Pressable: "Pressable",
      Platform: { OS: platform },
      Animated: { FlatList: "FlatList" },
      StyleSheet: { create: (styles) => styles },
    },
    "react-native-reanimated": { Easing: { bezier: (...points) => points } },
    "react-i18next": {
      useTranslation: () => ({
        t: (key) => key,
        i18n: { resolvedLanguage: "en" },
      }),
    },
    "expo-router": {
      useLocalSearchParams: () => ({ id: "account-id" }),
      useRouter: () => ({
        push: (route) => navigation.push(route),
        dismissTo: (route) => navigation.push(route),
      }),
    },
    "expo-blur": { BlurTargetView: "BlurTargetView" },
    "react-native-safe-area-context": {
      useSafeAreaInsets: () => ({ top: 24, bottom: 24 }),
    },
    "heroui-native": { Button: button },
    "@/shared/ui/app-bottom-sheet": { BottomSheet: sheet },
    "@/shared/ui/use-bottom-sheet-initial-position-fix": {
      useBottomSheetInitialPositionFix: () => ({ onChange: () => {} }),
    },
    "@/shared/ui/collapsing-header": {
      CollapsingHeader: "Header",
      CollapsingHeaderSpacer: "Spacer",
      useCollapsingHeader: () => ({}),
    },
    "@/shared/theme/app-theme": { useAppThemeColors: () => ({}) },
    "@/shared/lib/currency": { formatCurrency: (amount) => String(amount) },
    "@/shared/lib/use-local-day-clock": {
      useLocalDayClock: () => new Date(2026, 8, 17),
    },
    "@/localization/localization-provider": {
      useAppLocalization: () => ({ isRTL: false }),
    },
    "@/data/local-data-provider": {
      useLocalData: () => ({
        document: {},
        updateDocument: async (updater) => {
          writes++;
          await write(updater({ accounts: [{ uuid: "account-id" }] }));
        },
      }),
    },
    "@/data/model/account-record": {
      deleteAccountFromDocument: (document, id) => ({
        ...document,
        deletedId: id,
      }),
    },
    "@/data/selectors/document-selectors": {
      selectAccounts: () => [
        {
          id: "account-id",
          name: "Checking",
          ownerName: "Owner",
          currencyCode: "USD",
          kind: configuration.kind ?? "bank",
          paymentDay: configuration.paymentDay ?? null,
        },
      ],
      selectAccountTransactions: (_document, _id, range) =>
        range
          ? records.filter((record) => record.month === range.anchor.getMonth())
          : records,
      selectAccountTransactionCount: () => records.length,
      accountPeriodRange: (...args) => {
        rangeCalls.push(args);
        return {
          start: new Date("2026-09-01"),
          end: new Date("2026-10-01"),
        };
      },
      shiftAccountPeriodAnchor: (...args) => {
        shiftCalls.push(args);
        return new Date(2026, 8 + args[2], args[3] ?? 1);
      },
    },
  };
  const filename = path.resolve(
    __dirname,
    "../src/features/accounts/account-details-screen.tsx",
  );
  const compiled = ts.transpileModule(fs.readFileSync(filename, "utf8"), {
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2022,
      jsx: ts.JsxEmit.ReactJSX,
    },
  }).outputText;
  const module = { exports: {} };
  new Function(
    "require",
    "module",
    "exports",
    "requestAnimationFrame",
    "cancelAnimationFrame",
    compiled,
  )(
    (name) =>
      mocks[name] ??
      (name.startsWith("@/") || name.startsWith("./")
        ? new Proxy({}, { get: (_, key) => key })
        : require(name)),
    module,
    module.exports,
    (callback) => {
      const id = ++nextFrame;
      frames.set(id, callback);
      return id;
    },
    (id) => frames.delete(id),
  );
  let tree;
  function render() {
    cursor = 0;
    tree = module.exports.AccountDetailsScreen();
    return tree;
  }
  function nodes(node = tree) {
    if (!node || typeof node !== "object") return [];
    if (Array.isArray(node)) return node.flatMap((child) => nodes(child));
    return [node, ...nodes(node.props?.children ?? null)];
  }
  render();
  effects.forEach((effect) => {
    const cleanup = effect();
    if (cleanup) cleanups.push(cleanup);
  });
  const api = {
    render,
    nodes,
    navigation,
    rangeCalls,
    shiftCalls,
    get writes() {
      return writes;
    },
    get frameCount() {
      return frames.size;
    },
    sheet: () => nodes().find((node) => node.type === sheet),
    content: () => nodes().find((node) => node.type === "Content"),
    list: () => nodes().find((node) => node.type === "FlatList"),
    options: () =>
      nodes().find(
        (node) => node.props?.accessibilityLabel === "accounts.details.options",
      ),
    action: (variant) =>
      nodes().find(
        (node) => node.type === button && node.props.variant === variant,
      ),
    layout: () => {
      nodes()
        .find((node) => node.props?.onLayout)
        .props.onLayout();
      render();
    },
    frame: () => {
      const callbacks = [...frames.values()];
      frames.clear();
      callbacks.forEach((callback) => callback());
      render();
    },
    unmount: () => cleanups.forEach((cleanup) => cleanup()),
  };
  if (preLayout) api.layout();
  if (open) api.options().props.onPress();
  render();
  return api;
}

test("Android menu survives delayed portal mounting and initial closed callbacks, then reopens", () => {
  const screen = mountScreen("android", async () => {}, false);
  screen.frame();
  assert.equal(screen.sheet().props.isOpen, false);
  screen.content().props.onClose();
  screen.sheet().props.onOpenChange(false);
  screen.render();
  assert.ok(screen.sheet(), "initial native close must not remove the menu");
  screen.layout();
  screen.layout();
  assert.equal(
    screen.frameCount,
    0,
    "layout should open directly without an extra animation frame",
  );
  screen.frame();
  assert.equal(screen.sheet().props.isOpen, true);
  screen.options().props.onPress();
  screen.render();
  assert.equal(
    screen.sheet().props.isOpen,
    true,
    "repeated menu taps must not restart opening",
  );
  screen.sheet().props.onOpenChange(false);
  screen.render();
  assert.equal(screen.sheet().props.isOpen, false);
  screen.options().props.onPress();
  screen.content().props.onClose();
  screen.render();
  assert.equal(
    screen.sheet().props.isOpen,
    false,
    "closed content stays ready for the next tap",
  );
  screen.options().props.onPress();
  screen.render();
  screen.content().props.onClose();
  assert.equal(
    screen.sheet().props.isOpen,
    true,
    "reopening must not wait for another layout",
  );
  screen.unmount();
});

test("Edit and Delete share a row, and Edit waits for native dismissal before navigation", () => {
  const screen = mountScreen();
  screen.layout();
  screen.frame();
  const row = screen
    .nodes()
    .find(
      (node) =>
        node.props?.style?.direction === "ltr" &&
        node.props?.className === "flex-row gap-3",
    );
  assert.deepEqual(
    row.props.children.map((child) => child.props.variant),
    ["secondary", "danger-soft"],
  );
  screen.action("secondary").props.onPress();
  screen.render();
  assert.equal(screen.sheet().props.isOpen, false);
  assert.deepEqual(screen.navigation, []);
  const onClose = screen.content().props.onClose;
  onClose();
  onClose();
  assert.deepEqual(screen.navigation, [
    { pathname: "/accounts/[id]/edit", params: { id: "account-id" } },
  ]);
  screen.unmount();
});

test("delete confirmation can cancel, blocks dismissal while saving, and retries after failure", async () => {
  let rejectWrite;
  let attempts = 0;
  const screen = mountScreen("android", () =>
    ++attempts === 1
      ? new Promise((_, reject) => {
          rejectWrite = reject;
        })
      : Promise.resolve(),
  );
  screen.layout();
  screen.frame();
  screen.action("danger-soft").props.onPress();
  screen.render();
  screen.action("tertiary").props.onPress();
  screen.render();
  assert.equal(screen.writes, 0);
  screen.action("danger-soft").props.onPress();
  screen.render();
  const confirm = screen.action("danger").props.onPress;
  const pending = confirm();
  await confirm();
  screen.render();
  screen.sheet().props.onOpenChange(false);
  screen.content().props.onClose();
  screen.render();
  assert.equal(screen.writes, 1);
  assert.equal(screen.sheet().props.isOpen, true);
  for (const prop of [
    "enablePanDownToClose",
    "enableHandlePanningGesture",
    "enableContentPanningGesture",
  ])
    assert.equal(screen.content().props[prop], false);
  rejectWrite(new Error("Storage unavailable"));
  await pending;
  screen.render();
  assert.ok(
    screen
      .nodes()
      .some(
        (node) =>
          node.props?.accessibilityRole === "alert" &&
          node.props.children === "Storage unavailable",
      ),
  );
  assert.equal(screen.action("danger").props.isDisabled, false);
  assert.deepEqual(screen.navigation, []);
  await screen.action("danger").props.onPress();
  screen.render();
  assert.equal(screen.writes, 2);
  assert.deepEqual(screen.navigation, ["/accounts"]);
  screen.unmount();
});

test("successful deletion commits before navigating back", async () => {
  let commit;
  const screen = mountScreen(
    "android",
    () =>
      new Promise((resolve) => {
        commit = resolve;
      }),
  );
  screen.layout();
  screen.frame();
  screen.action("danger-soft").props.onPress();
  screen.render();
  const pending = screen.action("danger").props.onPress();
  assert.deepEqual(screen.navigation, []);
  commit();
  await pending;
  screen.render();
  assert.deepEqual(screen.navigation, ["/accounts"]);
  assert.equal(screen.sheet().props.isOpen, false);
  screen.unmount();
});

test("iOS presents without waiting for hidden content layout", () => {
  const screen = mountScreen("ios");
  assert.equal(screen.sheet().props.isOpen, true);
  screen.layout();
  assert.equal(screen.frameCount, 0);
  screen.sheet().props.onOpenChange(false);
  screen.render();
  screen.content().props.onClose();
  screen.render();
  assert.equal(screen.sheet().props.isOpen, false);
  screen.unmount();
});

test("pre-measured Android sheet opens on the tap without a frame delay", () => {
  const screen = mountScreen("android", async () => {}, true, false);
  assert.equal(screen.sheet().props.isOpen, false);
  screen.layout();
  assert.equal(
    screen.sheet().props.isOpen,
    false,
    "layout alone must not open the menu",
  );
  screen.options().props.onPress();
  screen.render();
  assert.equal(screen.sheet().props.isOpen, true);
  assert.equal(screen.frameCount, 0);
  screen.unmount();
});

for (const kind of ["credit", "bank", "checking", "savings", "cash"]) {
  test(`${kind} details opens with this month's records and keeps explicit all-history access`, () => {
    const records = [
      {
        id: "previous-month",
        month: 7,
        type: "expense",
        amount: 1,
        currencyCode: "USD",
      },
      {
        id: "current-month",
        month: 8,
        type: "expense",
        amount: 2,
        currencyCode: "USD",
      },
      {
        id: "next-month",
        month: 9,
        type: "expense",
        amount: 3,
        currencyCode: "USD",
      },
    ];
    const screen = mountScreen("android", async () => {}, true, false, {
      kind,
      records,
    });
    assert.deepEqual(
      screen.list().props.data.map((record) => record.id),
      ["current-month"],
    );
    const history = screen
      .nodes(screen.list().props.ListHeaderComponent)
      .find(
        (node) => node.type === "Pressable" && node.props.accessibilityState,
      );
    assert.equal(history.props.accessibilityState.selected, false);
    history.props.onPress();
    screen.render();
    assert.equal(screen.list().props.data.length, 3);
    screen
      .nodes()
      .find((node) => node.type === "AccountPeriodSelector")
      .props.onChange("Monthly");
    screen.render();
    assert.deepEqual(
      screen.list().props.data.map((record) => record.id),
      ["current-month"],
    );
    screen.unmount();
  });
}

test("credit Monthly date labels and navigation receive the configured payout day", () => {
  const screen = mountScreen("android", async () => {}, true, false, {
    kind: "credit",
    paymentDay: 5,
  });
  assert.equal(screen.rangeCalls.at(-1)[0], "Monthly");
  assert.equal(screen.rangeCalls.at(-1)[2], 5);
  const next = screen
    .nodes(screen.list().props.ListHeaderComponent)
    .find(
      (node) =>
        node.props?.accessibilityLabel === "accounts.details.nextPeriod",
    );
  next.props.onPress();
  screen.render();
  assert.equal(screen.shiftCalls.at(-1)[0], "Monthly");
  assert.equal(screen.shiftCalls.at(-1)[2], 1);
  assert.equal(screen.shiftCalls.at(-1)[3], 5);
  assert.equal(
    screen.rangeCalls.at(-1)[1].getTime(),
    new Date(2026, 9, 5).getTime(),
  );
  screen.unmount();
});
