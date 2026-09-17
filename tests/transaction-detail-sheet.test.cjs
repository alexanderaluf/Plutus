const fs = require("node:fs");
const assert = require("node:assert/strict");
const { test } = require("node:test");
const ts = require("typescript");
const { jsx } = require("react/jsx-runtime");

const flatten = (style) => Object.assign({}, ...[style].flat(Infinity).filter(Boolean));

function mountSheet(language, nativeRTL) {
  const slots = [];
  let cursor = 0;
  const native = { isRTL: nativeRTL };
  const i18n = {
    language,
    resolvedLanguage: language,
    dir: (value) => value === "he" ? "rtl" : "ltr",
  };
  const translate = (key, values = {}) => {
    if (key === "transactions.details.exchangeRateValue")
      return `1 ${values.from} = ${values.rate} ${values.to}`;
    return key;
  };
  const primitive = (name) => (props) => jsx(name, props);
  const bottomSheet = Object.assign(primitive("BottomSheet"),
    Object.fromEntries(["Portal", "Overlay", "Content", "Title", "Description"]
      .map((name) => [name, primitive(`BottomSheet.${name}`)])));
  const button = Object.assign(primitive("Button"), { Label: primitive("Button.Label") });
  const animation = { duration: () => ({ reduceMotion: () => undefined }) };
  const mocks = {
    react: {
      useState(initial) {
        const index = cursor++;
        if (!(index in slots))
          slots[index] = typeof initial === "function" ? initial() : initial;
        return [slots[index], (value) => {
          slots[index] = typeof value === "function" ? value(slots[index]) : value;
        }];
      },
      useRef(initial) {
        const index = cursor++;
        if (!(index in slots)) slots[index] = { current: initial };
        return slots[index];
      },
      useEffect: () => {},
    },
    "react-native": {
      View: "View", Text: "NativeText", Image: "Image",
      I18nManager: native, Platform: { OS: "android" },
      StyleSheet: { create: (styles) => styles, flatten },
    },
    "react-i18next": { useTranslation: () => ({ t: translate, i18n }) },
    "react-native-reanimated": {
      __esModule: true, default: { View: "Animated.View" },
      FadeIn: animation, FadeOut: animation, ReduceMotion: { System: "system" },
    },
    "react-native-safe-area-context": {
      useSafeAreaInsets: () => ({ top: 24, bottom: 24 }),
    },
    "@/shared/ui/app-bottom-sheet": { BottomSheet: bottomSheet, BottomSheetScrollView: "ScrollView" },
    "expo-router": { useRouter: () => ({}) },
    "heroui-native": { BottomSheet: bottomSheet, Button: button, useThemeColor: () => "#ffffff" },
    "@/data/attachments/attachment-store": {},
    "@/data/local-data-provider": {
      useLocalData: () => ({ document: {}, updateDocument: async () => {} }),
    },
    "@/data/model/transaction-record": {},
    "@/data/selectors/recurring-selectors": {
      selectRecurringTransactionSnapshot: (document, transactionId) => ({
        document,
        transactionId,
      }),
    },
    "@/features/profile/profile-provider": { useProfiles: () => ({ activeProfile: { id: "profile" } }) },
    "@/localization/localization-provider": {
      useAppLocalization: () => ({ isRTL: false, direction: "ltr", language: "en" }),
    },
    "@/shared/lib/currency": { formatCurrency: (amount, code) => `${amount.toFixed(2)} ${code}` },
    "@/shared/lib/use-app-date": {
      useAppDate: () => ({
        dateFormat: "DD/MM/YYYY",
        formatDate: (date) => new Date(date).toISOString().slice(0, 10),
        formatDayMonth: (date) => new Date(date).toISOString().slice(5, 10),
        formatDateRange: (start, end) =>
          `${new Date(start).toISOString().slice(0, 10)} – ${new Date(end).toISOString().slice(0, 10)}`,
        formatDateTime: (date) => new Date(date).toISOString(),
      }),
    },
    "@/shared/lib/use-currency-format": {
      useCurrencyFormat: () => ({
        amountsHidden: false,
        formatCurrency: (amount, code) => `${amount.toFixed(2)} ${code}`,
        formatSignedCurrency: (amount, code) => `${amount.toFixed(2)} ${code}`,
      }),
      useAmountVisibility: () => ({ hidden: false, toggle: async () => {} }),
      useAmountsHidden: () => false,
    },
    "@/shared/theme/app-theme": {
      useAppThemeColors: () => ({ danger: "#ff0000", success: "#00ff00", accent: "#00ffff" }),
      colorWithAlpha: (color) => color,
    },
    "@/shared/ui/filled-icon": { FilledIcon: "FilledIcon" },
    "@/shared/ui/record-icon": { RecordIcon: "RecordIcon" },
    "@/shared/ui/app-bottom-sheet-portal": {
      AppBottomSheetPortal: primitive("AppBottomSheetPortal"),
    },
    "@/shared/ui/use-bottom-sheet-initial-position-fix": {
      useBottomSheetInitialPositionFix: () => ({
        containerStyle: undefined,
        onChange: () => {},
      }),
    },
    "./recurring-payment-snapshot": { RecurringPaymentSnapshot: "RecurringPaymentSnapshot" },
  };
  function load(relative) {
    const filename = require.resolve(`../src/${relative}`);
    const compiled = ts.transpileModule(fs.readFileSync(filename, "utf8"), {
      compilerOptions: {
        module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022,
        jsx: ts.JsxEmit.ReactJSX,
      },
    }).outputText;
    const module = { exports: {} };
    new Function("require", "module", "exports", compiled)(
      (name) => mocks[name] ?? require(name), module, module.exports,
    );
    return module.exports;
  }
  mocks["@/shared/ui/app-text"] = load("shared/ui/app-text.tsx");
  const { TransactionDetailSheet } = load("features/transactions/transaction-detail-sheet.tsx");
  const transaction = {
    id: "transaction", merchant: "Bobik", type: 0,
    occurredAtIso: "2026-09-09T18:49:00.000Z",
    absoluteAmount: 450, currencyCode: "USD",
    accountAmount: 1360.10, accountCurrencyCode: "ILS",
    exchangeRate: 3.02244974, exchangeRateDate: "2026-09-11",
    exchangeRateFetchedAt: "2026-09-11T08:27:00.000Z",
    color: "#00ff00", icon: "car", accountName: "Bank card",
    categoryId: "category", category: "Car", budgetName: "Lifestyle",
  };
  function expand(node) {
    if (Array.isArray(node)) return node.map(expand);
    if (!node || typeof node !== "object") return node;
    if (typeof node.type === "function") return expand(node.type(node.props));
    return { ...node, props: { ...node.props, children: expand(node.props.children) } };
  }
  return {
    native, i18n, transaction,
    render() {
      cursor = 0;
      return nodesOf(expand(TransactionDetailSheet({ transaction, onDismiss: () => {} })));
    },
  };
}

for (const language of ["en", "he"]) {
  for (const nativeRTL of [false, true]) {
    test(`${language} details mirror once on a native ${nativeRTL ? "RTL" : "LTR"} layout`, () => {
      const sheet = mountSheet(language, nativeRTL);
      const nodes = sheet.render();
      const recurringSnapshot = nodes.find(
        (node) => node.type === "RecurringPaymentSnapshot",
      ).props.snapshot;
      assert.equal(recurringSnapshot.transactionId, "transaction");
      const desiredRTL = language === "he";
      const direction = desiredRTL ? "rtl" : "ltr";
      const text = (key) => {
        const found = nodes.find((node) => node.props.children === key);
        assert.ok(found, `Missing ${key}`);
        return found;
      };
      const physicalAlignment = (node) => {
        const alignment = flatten(node.props.style).textAlign;
        return nativeRTL ? { left: "right", right: "left" }[alignment] : alignment;
      };
      const rows = nodes.filter((node) => flatten(node.props.style).flexDirection);
      assert.ok(rows.length >= 12);
      for (const node of rows) {
        const reverse = flatten(node.props.style).flexDirection === "row-reverse";
        assert.equal(nativeRTL !== reverse, desiredRTL, `${node.type} must mirror once`);
      }
      assert.equal(nodes.find((node) => node.type === "BottomSheet.Content")
        .props.contentContainerProps.style.direction, nativeRTL ? "rtl" : "ltr");
      for (const value of [
        "Bobik", "Bank card", "Car", "Lifestyle",
        "transactions.details.typeAndDate", "transactions.details.heading",
        "transactions.details.conversionTitle", "transactions.details.originalAmount",
        "transactions.details.accountAmount", "transactions.details.rateCaptured",
        "transactions.details.created",
      ]) {
        const node = text(value);
        assert.equal(physicalAlignment(node), desiredRTL ? "right" : "left", value);
        assert.equal(flatten(node.props.style).writingDirection, direction, value);
      }
      for (const value of ["450.00 USD", "1360.10 ILS", "1 USD = 3.02 ILS"]) {
        assert.equal(flatten(text(value).props.style).writingDirection, "ltr");
      }
      assert.equal(sheet.transaction.exchangeRate, 3.02244974);

      nodes.find((node) => node.type === "Button" &&
        nodesOf(node).some((child) => child.props.children === "transactions.details.delete"))
        .props.onPress();
      const confirmation = sheet.render();
      for (const node of confirmation.filter((node) =>
        ["BottomSheet.Title", "BottomSheet.Description"].includes(node.type))) {
        assert.equal(flatten(node.props.style).textAlign, "center");
        assert.equal(flatten(node.props.style).writingDirection, direction);
      }
    });
  }
}

function nodesOf(node) {
  if (Array.isArray(node)) return node.flatMap(nodesOf);
  if (!node || typeof node !== "object") return [];
  return [node, ...nodesOf(node.props.children)];
}

test("direction follows language changes without relying on the portal's stale app context", () => {
  const sheet = mountSheet("en", false);
  for (const language of ["en", "he", "en"]) {
    sheet.i18n.language = language;
    sheet.i18n.resolvedLanguage = language;
    const heading = sheet.render().find((node) =>
      node.props.children === "transactions.details.heading");
    assert.equal(flatten(heading.props.style).textAlign, language === "he" ? "right" : "left");
    assert.equal(flatten(heading.props.style).writingDirection, language === "he" ? "rtl" : "ltr");
  }
});
