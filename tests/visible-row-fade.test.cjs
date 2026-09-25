const fs = require("node:fs");
const assert = require("node:assert/strict");
const { test } = require("node:test");
const ts = require("typescript");
require.extensions[".ts"] = (module, filename) => {
  module._compile(
    ts.transpileModule(fs.readFileSync(filename, "utf8"), {
      compilerOptions: { module: ts.ModuleKind.CommonJS },
    }).outputText,
    filename,
  );
};
const {
  createVisibleRowFade,
} = require("../src/features/home/visible-row-fade.ts");
const row = (index) => ({ key: `row-${index}`, index, isViewable: true });
function harness() {
  let time = 0;
  const fade = createVisibleRowFade(() => time);
  const calls = [];
  const mount = (index) =>
    fade.register(`row-${index}`, {
      reveal: (delay) => calls.push([index, "reveal", delay]),
      hide: () => calls.push([index, "hide"]),
      finish: () => calls.push([index, "finish"]),
    });
  return {
    fade,
    calls,
    mount,
    tick: (next) => {
      time = next;
    },
  };
}

test("only visible rows reveal, in screen order, not mount/global-index order", () => {
  const h = harness();
  for (let i = 0; i < 30; i++) h.mount(i);
  h.calls.length = 0;
  h.fade.update([row(12), row(10), row(11)]);
  assert.deepEqual(h.calls, [
    [10, "reveal", 0],
    [11, "reveal", 40],
    [12, "reveal", 80],
  ]);
  h.tick(300);
  h.fade.update([row(11), row(12), row(13), row(14)]);
  assert.deepEqual(h.calls.filter((c) => c[1] === "reveal").slice(3), [
    [13, "reveal", 0],
    [14, "reveal", 40],
  ]);
});

test("seen rows never replay when scrolled back or remounted; unseen prefetched rows stay hidden", () => {
  const h = harness();
  const unmount = h.mount(0);
  h.mount(1);
  h.fade.update([row(0)]);
  h.tick(500);
  h.fade.update([]);
  unmount();
  h.mount(0);
  h.fade.update([row(0)]);
  assert.equal(h.calls.filter((c) => c[1] === "reveal").length, 1);
  assert.equal(h.fade.hasSeen("row-0"), true);
  assert.equal(h.fade.hasSeen("row-1"), false);
  assert.deepEqual(h.calls.at(-1), [0, "finish"]);
});

test("quickly hidden queued rows cancel and reveal on a later visible visit", () => {
  const h = harness();
  h.mount(0);
  h.mount(1);
  h.fade.update([row(0), row(1)]);
  h.tick(10);
  h.fade.update([]);
  assert.equal(h.fade.hasSeen("row-1"), false);
  assert.deepEqual(h.calls.at(-1), [1, "hide"]);
  h.tick(500);
  h.fade.update([row(1)]);
  assert.deepEqual(h.calls.at(-1), [1, "reveal", 0]);
});

test("visibility can precede row mounting; waits are capped and resume from remaining delay", () => {
  const h = harness();
  h.fade.update(Array.from({ length: 20 }, (_, i) => row(i)));
  h.tick(20);
  h.mount(1);
  h.mount(19);
  assert.deepEqual(h.calls, [
    [1, "reveal", 20],
    [19, "reveal", 220],
  ]);
  h.tick(500);
  h.mount(0);
  assert.deepEqual(h.calls.at(-1), [0, "reveal", 0]);
});

test("pagination and duplicate visibility notifications preserve history; a new section visit resets it", () => {
  const h = harness();
  h.mount(0);
  h.fade.update([row(0)]);
  h.fade.update([row(0)]);
  h.mount(30);
  h.tick(500);
  h.fade.update([row(0), row(30)]);
  assert.deepEqual(
    h.calls.filter((c) => c[1] === "reveal"),
    [
      [0, "reveal", 0],
      [30, "reveal", 0],
    ],
  );
  assert.equal(createVisibleRowFade().hasSeen("row-0"), false);
});

function optionsHarness(options) {
  let time = 0;
  const fade = createVisibleRowFade(() => time, options);
  const calls = [];
  const mount = (index) =>
    fade.register(`row-${index}`, {
      reveal: (delay) => calls.push([index, "reveal", delay]),
      hide: () => calls.push([index, "hide"]),
      finish: () => calls.push([index, "finish"]),
    });
  return { fade, calls, mount, tick: (next) => (time = next) };
}

test("entryOnly animates the first visible batch and shows later rows at once", () => {
  const h = optionsHarness({ entryOnly: true });
  for (let i = 0; i < 4; i++) h.mount(i);
  h.calls.length = 0;
  // Page entry: rows 0-1 are on screen, 2-3 are pre-mounted below the fold.
  h.fade.update([row(0), row(1)]);
  assert.deepEqual(h.calls, [
    [0, "reveal", 0],
    [1, "reveal", 40],
    [2, "finish"],
    [3, "finish"],
  ]);
  h.tick(1000);
  h.calls.length = 0;
  // Scrolling down: already-shown rows and newly mounted ones never fade.
  h.fade.update([row(2), row(3)]);
  h.mount(4);
  h.fade.update([row(3), row(4)]);
  assert.equal(h.calls.length > 0, true);
  assert.equal(
    h.calls.some(([, kind]) => kind !== "finish"),
    false,
  );
});

test("entryOnly rows re-mounted after scrolling back up appear at once", () => {
  const h = optionsHarness({ entryOnly: true });
  const unmount = h.mount(0);
  h.fade.update([row(0)]);
  h.tick(1000);
  h.fade.update([]);
  unmount();
  h.calls.length = 0;
  h.mount(0);
  h.fade.update([row(0)]);
  assert.equal(
    h.calls.some(([, kind]) => kind !== "finish"),
    false,
  );
});

test("default history still survives unmounting (Home behavior)", () => {
  const h = optionsHarness();
  const unmount = h.mount(0);
  h.fade.update([row(0)]);
  h.tick(1000);
  h.fade.update([]);
  unmount();
  h.calls.length = 0;
  h.mount(0);
  assert.deepEqual(h.calls, [[0, "finish"]]);
});

test("revealAfter delays the first rows until the header has entered", () => {
  const h = optionsHarness({ revealAfter: 300 });
  h.mount(0);
  h.mount(1);
  h.calls.length = 0;
  h.fade.update([row(0), row(1)]);
  assert.deepEqual(h.calls, [
    [0, "reveal", 300],
    [1, "reveal", 340],
  ]);
  // Later scrolling is not delayed.
  h.tick(5000);
  h.mount(2);
  h.calls.length = 0;
  h.fade.update([row(0), row(1), row(2)]);
  assert.deepEqual(h.calls, [[2, "reveal", 0]]);
});
