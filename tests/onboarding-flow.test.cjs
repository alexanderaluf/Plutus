const fs = require("node:fs");
const path = require("node:path");
const assert = require("node:assert/strict");
const { test } = require("node:test");
const ts = require("typescript");
const root = path.resolve(__dirname, "../src");
require.extensions[".ts"] = (module, filename) => {
  const code = ts
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
  module._compile(code, filename);
};
const { createDefaultBackup } = require("../src/data/model/default-backup.ts");
const { completeSetup } = require("../src/data/model/onboarding.ts");

// Exercise actual screen handlers and async transitions, not native rendering.
function mount({
  imported = null,
  confirm = true,
  failCommit = false,
  failAttachments = false,
} = {}) {
  const slots = [];
  let cursor = 0,
    document = createDefaultBackup(),
    language = "en",
    writes = 0;
  let releaseWrite;
  const events = [],
    alerts = [];
  const button = Object.assign(() => {}, { Label: "Label" });
  const context = {
    get document() {
      return document;
    },
    updateDocument: async (update) => {
      writes++;
      events.push("write-start");
      await new Promise((resolve) => {
        releaseWrite = resolve;
      });
      if (failCommit) throw new Error("disk full");
      document = update(document);
      events.push("write-end");
    },
    replaceDocument: async (next) => {
      document = next;
      events.push("replace");
    },
  };
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
      useEffect() {},
    },
    "react-native": {
      View: "View",
      ScrollView: "ScrollView",
      TextInput: "TextInput",
      Pressable: "Pressable",
      KeyboardAvoidingView: "KeyboardAvoidingView",
      ActivityIndicator: "ActivityIndicator",
      Platform: { OS: "android" },
      BackHandler: {},
      Keyboard: {
        dismiss: () => events.push("keyboard-dismiss"),
      },
      StyleSheet: { absoluteFill: {}, create: (sheet) => sheet },
      useWindowDimensions: () => ({ width: 390, height: 844 }),
      Alert: {
        alert: (title, message, buttons) => {
          alerts.push({ title, message });
          if (buttons) buttons[confirm ? 1 : 0].onPress();
        },
      },
    },
    "react-native-reanimated": {
      default: { View: "Animated.View" },
      Easing: { bezier: () => () => 0 },
      ReduceMotion: { System: "system" },
      runOnJS: (fn) => fn,
      useAnimatedStyle: (worklet) => worklet(),
      useSharedValue: (initial) => ({ value: initial }),
      withTiming: (to, _config, callback) => {
        callback?.(true);
        return to;
      },
    },
    "@/shared/ui/safe-area-gradients": {
      BottomSafeAreaGradient: "BottomSafeAreaGradient",
      TopSafeAreaGradient: "TopSafeAreaGradient",
    },
    "@/shared/theme/app-theme": {
      colorWithAlpha: (color) => color,
      useAppThemeColors: () => ({
        accent: "#afd",
        accentForeground: "#012",
        background: "#000",
        border: "#333",
        danger: "#f00",
        foreground: "#fff",
        isDark: true,
        muted: "#aaa",
        success: "#0f0",
        surface: "#111",
        surfaceSecondary: "#202020",
        surfaceTertiary: "#2d2d2d",
      }),
    },
    "heroui-native": {
      Button: button,
      useThemeColor: () => ["#fff", "#aaa", "#afd"],
    },
    "react-i18next": { useTranslation: () => ({ t: (key) => key }) },
    "react-native-safe-area-context": {
      useSafeAreaInsets: () => ({ top: 20, bottom: 20 }),
    },
    "@/data/local-data-provider": { useLocalData: () => context },
    "@/localization/localization-provider": {
      useAppLocalization: () => ({
        language,
        isRTL: language === "he",
        setPreviewLanguage: (value) => {
          language = value;
        },
      }),
    },
    "@/shared/ui/app-text": { Text: "Text" },
    "@/shared/ui/filled-icon": { FilledIcon: "Icon" },
    "@/features/profile/components/currency-selector-sheet": {
      CurrencySelectorSheet: "CurrencySheet",
    },
    "@/data/backup/backup-service": {
      pickAndImportBackup: async () => imported,
    },
    "@/data/attachments/attachment-store": {
      stageAttachments: () => events.push("stage"),
      commitStagedAttachments: () => {
        events.push("attachments");
        if (failAttachments) throw new Error("attachment commit failed");
      },
      discardStagedAttachments: () => events.push("discard"),
    },
  };
  const filename = path.join(root, "features/onboarding/onboarding-screen.tsx");
  const compiled = ts.transpileModule(fs.readFileSync(filename, "utf8"), {
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2022,
      jsx: ts.JsxEmit.ReactJSX,
    },
  }).outputText;
  const module = { exports: {} };
  new Function("require", "module", "exports", compiled)(
    (name) =>
      mocks[name] ??
      (name.startsWith("@/")
        ? require(path.join(root, name.slice(2)))
        : require(name)),
    module,
    module.exports,
  );
  let tree;
  function render() {
    cursor = 0;
    tree = module.exports.OnboardingScreen({
      onBusyChange: (value) => events.push(value ? "busy" : "idle"),
    });
  }
  function nodes(node = tree, result = []) {
    if (Array.isArray(node))
      node.forEach((child) => nodes(child ?? null, result));
    else if (node && typeof node === "object") {
      result.push(node);
      nodes(node.props?.children ?? null, result);
    }
    return result;
  }
  const label = (node) => {
    if (typeof node === "string") return node;
    if (Array.isArray(node)) return node.map(label).join(" ");
    return node && typeof node === "object" ? label(node.props?.children) : "";
  };
  render();
  const app = {
    render,
    nodes,
    events,
    alerts,
    get document() {
      return document;
    },
    get writes() {
      return writes;
    },
    get language() {
      return language;
    },
    release: () => releaseWrite(),
    action: (key) =>
      nodes().find(
        (node) =>
          node.props?.accessibilityRole === "button" &&
          label(node).includes(key),
      ),
    radio: (text) =>
      nodes().find(
        (node) =>
          node.props?.accessibilityRole === "radio" &&
          (label(node).trim() === text ||
            node.props.accessibilityLabel === text),
      ),
    press: async (key) => {
      const action = app.action(key);
      assert.ok(action, key);
      if (!action.props.disabled) await action.props.onPress();
      render();
    },
  };
  return app;
}

async function fill(app, demo = false) {
  await app.press(demo ? "onboarding.demo" : "onboarding.fresh");
  assert.equal(app.document.users.length, 0);
  assert.equal(app.radio("Русский"), undefined);
  app.radio("עברית").props.onPress();
  app.render();
  assert.equal(app.language, "he");
  assert.equal(app.document._local.appLanguage, "en");
  await app.press("onboarding.continue");
  assert.equal(app.action("onboarding.agree").props.disabled, true);
  let checks = app
    .nodes()
    .filter((node) => node.props?.accessibilityRole === "checkbox");
  checks[0].props.onPress();
  app.render();
  assert.equal(app.action("onboarding.agree").props.disabled, true);
  checks = app
    .nodes()
    .filter((node) => node.props?.accessibilityRole === "checkbox");
  checks[1].props.onPress();
  app.render();
  await app.press("onboarding.agree");
  assert.equal(app.action("onboarding.continue").props.disabled, true);
  app
    .nodes()
    .find((node) => node.type === "TextInput")
    .props.onChangeText("Alex");
  app.render();
  await app.press("onboarding.continue");
  assert.equal(app.action("onboarding.continue").props.disabled, true);
  app
    .nodes()
    .find((node) => node.type === "CurrencySheet")
    .props.onSelect({ code: "ILS", name: "Israeli New Shekel", symbol: "₪" });
  app.render();
  await app.press("onboarding.continue");
  await app.press("onboarding.continue");
  app.radio("10").props.onPress();
  app.render();
  await app.press("onboarding.continue");
  app.radio("onboarding.sunday").props.onPress();
  app.render();
  assert.equal(app.writes, 0);
  assert.equal(app.document.users.length, 0);
}

test("fresh flow validates both checkboxes, name and currency; keeps drafts until one awaited final write", async () => {
  const app = mount();
  await fill(app);
  const action = app.action("onboarding.finish");
  action.props.onPress();
  action.props.onPress();
  app.render();
  assert.equal(app.writes, 1);
  assert.ok(app.nodes().some((node) => node.type === "ActivityIndicator"));
  assert.equal(app.document.users.length, 0);
  app.release();
  await new Promise((resolve) => setImmediate(resolve));
  app.render();
  assert.equal(app.document.users.length, 1);
  assert.equal(app.document._local.mainCurrency, "ILS");
  assert.equal(app.document._local.monthStartDay, 10);
  assert.equal(app.document._local.weekStartDay, 0);
  assert.equal(app.document._local.appLanguage, "he");
  assert.equal(app.document.accounts.length, 0);
  assert.equal(app.events.at(-1), "idle");
});

test("failed setup keeps drafts and the empty database and shows an actionable error", async () => {
  const app = mount({ failCommit: true });
  await fill(app);
  app.action("onboarding.finish").props.onPress();
  app.release();
  await new Promise((resolve) => setImmediate(resolve));
  app.render();
  assert.equal(app.document.users.length, 0);
  assert.equal(app.alerts.at(-1).message, "disk full");
  assert.equal(app.action("onboarding.finish").props.disabled, false);
});

test("demo choice uses the same full setup and saves sample records only at completion", async () => {
  const app = mount();
  await fill(app, true);
  app.action("onboarding.finish").props.onPress();
  await new Promise((resolve) => setImmediate(resolve));
  assert.equal(app.writes, 1);
  assert.equal(app.document.accounts.length, 0);
  app.release();
  await new Promise((resolve) => setImmediate(resolve));
  assert.equal(app.document._local.dataMode, "demo");
  assert.equal(app.document.accounts.length, 3);
  assert.ok(app.document.transactions.length >= 90);
});

const restored = () => ({
  format: "zip",
  attachments: [],
  document: completeSetup(
    createDefaultBackup(),
    {
      name: "Restored",
      language: "en",
      currency: "USD",
      currencyName: "Dollar",
      currencySymbol: "$",
      dateFormat: "DD/MM/YYYY",
      monthStartDay: 10,
      weekStartDay: 0,
      backupAccepted: true,
      responsibilityAccepted: true,
    },
    "restored",
    new Date().toISOString(),
  ),
});

test("local restore requires confirmation and completes staged attachments before releasing the gate", async () => {
  const app = mount({ imported: restored() });
  await app.press("onboarding.restore");
  assert.deepEqual(app.events, [
    "busy",
    "stage",
    "replace",
    "attachments",
    "idle",
  ]);
  assert.equal(app.document.users[0].uuid, "restored");
  assert.equal(app.document._local.dataMode, "restored");
  const cancelled = mount({ imported: restored(), confirm: false });
  await cancelled.press("onboarding.restore");
  assert.deepEqual(cancelled.events, ["busy", "idle"]);
  assert.equal(cancelled.document.users.length, 0);
});

test("attachment commit failure rolls back the restored document and stays in setup", async () => {
  const app = mount({ imported: restored(), failAttachments: true });
  await app.press("onboarding.restore");
  assert.deepEqual(app.events, [
    "busy",
    "stage",
    "replace",
    "attachments",
    "discard",
    "replace",
    "idle",
  ]);
  assert.equal(app.document.users.length, 0);
  assert.equal(app.alerts.at(-1).message, "attachment commit failed");
});

test("CSV and backups missing a user cannot bypass setup or overwrite data", async () => {
  for (const imported of [
    { ...restored(), format: "csv" },
    { format: "json", document: createDefaultBackup() },
  ]) {
    const app = mount({ imported });
    await app.press("onboarding.restore");
    assert.deepEqual(app.events, ["busy", "idle"]);
    assert.equal(app.document.users.length, 0);
    assert.equal(app.alerts.length, 1);
  }
});
