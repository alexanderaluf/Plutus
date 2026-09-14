const fs = require("node:fs");
const path = require("node:path");
const assert = require("node:assert/strict");
const { test } = require("node:test");
const ts = require("typescript");

// Exercise the real component's event handlers with delayed native layout and
// animation frames. This does not attempt to emulate native sheet rendering.
function mountSheet(parentId = null, write = async () => {}) {
  const slots = [];
  let cursor = 0;
  const effects = [];
  const cleanups = [];
  const frames = new Map();
  let nextFrame = 0;
  let dismissed = 0;
  const deleted = [];
  const root = Object.assign(
    () => {},
    Object.fromEntries(
      ["Portal", "Overlay", "Content", "Title", "Description"].map((name) => [
        name,
        name,
      ]),
    ),
  );
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
    },
    "react-native": { View: "View", Text: "Text" },
    "react-i18next": { useTranslation: () => ({ t: (key) => key }) },
    "@/shared/ui/app-text": { Text: "Text" },
    "@/shared/ui/use-bottom-sheet-initial-position-fix": {
      useBottomSheetInitialPositionFix: () => ({ containerStyle: undefined, onChange: () => {} }),
    },
    "heroui-native": { BottomSheet: root, Button: button },
    "react-native-safe-area-context": {
      useSafeAreaInsets: () => ({ top: 24, bottom: 24 }),
    },
    "@material-symbols-svg/react-native/rounded/icons/warning": {
      WarningFill: "Warning",
    },
    "@/data/local-data-provider": {
      useLocalData: () => ({ document: {}, updateDocument: write }),
    },
    "@/data/model/category-record": {
      deleteCategory: (document, id) => ({ ...document, deleted: id }),
    },
    "@/data/selectors/document-selectors": { selectCategories: () => [] },
  };
  const filename = path.resolve(
    __dirname,
    "../src/features/categories/components/category-delete-sheet.tsx",
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
    (name) => mocks[name] ?? require(name),
    module,
    module.exports,
    (callback) => {
      const id = ++nextFrame;
      frames.set(id, callback);
      return id;
    },
    (id) => frames.delete(id),
  );
  const props = {
    category: { id: "target", name: "Food", parentId },
    onDismiss: () => {
      dismissed++;
    },
    onDeleted: (id) => deleted.push(id),
  };
  let tree;
  function render() {
    cursor = 0;
    tree = module.exports.CategoryDeleteSheet(props);
    return tree;
  }
  function nodes(node = tree) {
    if (!node || typeof node !== "object") return [];
    if (Array.isArray(node)) return node.flatMap((item) => nodes(item));
    return [node, ...nodes(node.props?.children ?? null)];
  }
  render();
  for (const effect of effects) {
    const cleanup = effect();
    if (cleanup) cleanups.push(cleanup);
  }
  render();
  return {
    render,
    get tree() {
      return tree;
    },
    get dismissed() {
      return dismissed;
    },
    get deleted() {
      return deleted;
    },
    get frameCount() {
      return frames.size;
    },
    content: () => nodes().find((node) => node.type === "Content"),
    layout: () =>
      nodes()
        .find((node) => node.type === "View" && node.props.onLayout)
        .props.onLayout(),
    action: (danger) =>
      nodes().find(
        (node) =>
          node.type === button && (node.props.variant === "danger") === danger,
      ),
    frame: () => {
      const pending = [...frames.values()];
      frames.clear();
      pending.forEach((callback) => callback());
      render();
    },
    unmount: () => cleanups.forEach((cleanup) => cleanup()),
  };
}

for (const parentId of [null, "parent"]) {
  test(`${parentId ? "subcategory" : "parent"} confirmation waits for portal layout, then opens and cancels`, () => {
    const sheet = mountSheet(parentId);
    assert.equal(
      sheet.tree.props.isOpen,
      false,
      "must remain closed while the portal mounts",
    );
    sheet.content().props.onClose();
    assert.equal(
      sheet.dismissed,
      0,
      "initial native closed position must not unmount the sheet",
    );
    sheet.layout();
    sheet.layout();
    assert.equal(sheet.frameCount, 1);
    sheet.frame();
    assert.equal(sheet.tree.props.isOpen, true);
    sheet.action(false).props.onPress();
    sheet.render();
    assert.equal(sheet.tree.props.isOpen, false);
    sheet.content().props.onClose();
    assert.equal(sheet.dismissed, 1);
    assert.deepEqual(sheet.deleted, []);
    sheet.unmount();
  });
}

test("dismissed before opening cancels the scheduled native frame", () => {
  const sheet = mountSheet();
  sheet.layout();
  sheet.unmount();
  assert.equal(sheet.frameCount, 0);
});

test("confirmation waits for the write, prevents double deletion and reports failure in the open sheet", async () => {
  let rejectWrite;
  let writes = 0;
  const sheet = mountSheet("parent", () => {
    writes++;
    return new Promise((_, reject) => {
      rejectWrite = reject;
    });
  });
  sheet.layout();
  sheet.frame();
  const confirm = sheet.action(true).props.onPress;
  const pending = confirm();
  await confirm();
  sheet.render();
  assert.equal(writes, 1);
  assert.equal(sheet.action(true).props.isDisabled, true);
  rejectWrite(new Error("Storage unavailable"));
  await pending;
  sheet.render();
  assert.equal(sheet.tree.props.isOpen, true);
  assert.equal(sheet.action(true).props.isDisabled, false);
  assert.deepEqual(sheet.deleted, []);
  sheet.unmount();
});

test("successful deletion notifies the route only after the sheet closes", async () => {
  const sheet = mountSheet();
  sheet.layout();
  sheet.frame();
  await sheet.action(true).props.onPress();
  sheet.render();
  assert.equal(sheet.tree.props.isOpen, false);
  assert.deepEqual(sheet.deleted, []);
  sheet.content().props.onClose();
  assert.deepEqual(sheet.deleted, ["target"]);
  sheet.unmount();
});
