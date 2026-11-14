const fs = require("node:fs");
const assert = require("node:assert/strict");
const { test } = require("node:test");
const ts = require("typescript");

// The hook module imports React and React Native; only its pure retry logic is
// exercised here, so those imports are replaced with inert stand-ins.
function loadSync() {
  const filename = require.resolve(
    "../src/shared/ui/use-bottom-sheet-initial-position-fix.ts",
  );
  const compiled = ts.transpileModule(fs.readFileSync(filename, "utf8"), {
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2022,
    },
  }).outputText;
  const module = { exports: {} };
  new Function("require", "module", "exports", compiled)(
    (name) =>
      name === "react"
        ? { useCallback: (f) => f, useEffect() {}, useRef: () => ({}), useState: (v) => [v, () => {}] }
        : name === "react-native"
          ? { Platform: { OS: "android" }, StyleSheet: { create: (s) => s } }
          : require(name),
    module,
    module.exports,
  );
  return module.exports;
}

/** A manual clock: `advance` runs every timer that is due, in order. */
function fakeClock() {
  let now = 0;
  let timers = [];
  return {
    schedule(callback, delay) {
      const handle = { at: now + delay, callback };
      timers.push(handle);
      return handle;
    },
    cancel(handle) {
      timers = timers.filter((item) => item !== handle);
    },
    advance(ms) {
      const end = now + ms;
      for (;;) {
        const due = timers
          .filter((item) => item.at <= end)
          .sort((a, b) => a.at - b.at)[0];
        if (!due) break;
        timers = timers.filter((item) => item !== due);
        now = due.at;
        due.callback();
      }
      now = end;
    },
    pending: () => timers.length,
  };
}

/** A Gorhom sheet that ignores requests until its layout is measured. */
function fakeSheet() {
  const sheet = {
    measured: false,
    settledIndex: -1,
    calls: [],
    snapToIndex(index) {
      sheet.calls.push(`snap:${index}`);
      if (sheet.measured) sheet.settledIndex = index;
    },
    close() {
      sheet.calls.push("close");
      if (sheet.measured) sheet.settledIndex = -1;
    },
  };
  return sheet;
}

test("sheet sync knows what an open or closed sheet still needs", () => {
  const { sheetSyncCommand } = loadSync();
  assert.equal(sheetSyncCommand(true, -1), "open");
  assert.equal(sheetSyncCommand(true, 0), null);
  assert.equal(sheetSyncCommand(false, 0), "close");
  assert.equal(sheetSyncCommand(false, -1), null);
});

test("an open request dropped before layout is re-sent until the sheet arrives", () => {
  const { startSheetSync, SHEET_SYNC_INTERVAL_MS } = loadSync();
  const clock = fakeClock();
  const sheet = fakeSheet();
  startSheetSync({
    isOpen: true,
    openIndex: 0,
    getSettledIndex: () => sheet.settledIndex,
    getSheet: () => sheet,
    schedule: clock.schedule,
    cancel: clock.cancel,
  });
  // Still measuring: requests are dropped, the sheet stays closed.
  clock.advance(SHEET_SYNC_INTERVAL_MS * 3);
  assert.equal(sheet.settledIndex, -1);
  assert.deepEqual(sheet.calls, ["snap:0", "snap:0", "snap:0"]);
  // Layout lands: the next retry opens it, then retries stop.
  sheet.measured = true;
  clock.advance(SHEET_SYNC_INTERVAL_MS);
  assert.equal(sheet.settledIndex, 0);
  clock.advance(SHEET_SYNC_INTERVAL_MS * 10);
  assert.equal(sheet.calls.length, 4, "no requests once confirmed");
  assert.equal(clock.pending(), 0);
});

test("a sheet that opened normally is left alone", () => {
  const { startSheetSync, SHEET_SYNC_INTERVAL_MS } = loadSync();
  const clock = fakeClock();
  const sheet = fakeSheet();
  sheet.measured = true;
  sheet.settledIndex = 0; // HeroUI's own request already worked.
  startSheetSync({
    isOpen: true,
    openIndex: 0,
    getSettledIndex: () => sheet.settledIndex,
    getSheet: () => sheet,
    schedule: clock.schedule,
    cancel: clock.cancel,
  });
  clock.advance(SHEET_SYNC_INTERVAL_MS * 5);
  assert.deepEqual(sheet.calls, []);
});

test("a close that did not land is retried, so no sheet stays half open", () => {
  const { startSheetSync, SHEET_SYNC_INTERVAL_MS } = loadSync();
  const clock = fakeClock();
  const sheet = fakeSheet();
  sheet.settledIndex = 0;
  startSheetSync({
    isOpen: false,
    openIndex: 0,
    getSettledIndex: () => sheet.settledIndex,
    getSheet: () => sheet,
    schedule: clock.schedule,
    cancel: clock.cancel,
  });
  clock.advance(SHEET_SYNC_INTERVAL_MS);
  assert.deepEqual(sheet.calls, ["close"]);
  sheet.measured = true;
  clock.advance(SHEET_SYNC_INTERVAL_MS);
  assert.equal(sheet.settledIndex, -1);
});

test("retries are bounded, wait for a mounted sheet, and stop when cancelled", () => {
  const {
    startSheetSync,
    SHEET_SYNC_INTERVAL_MS,
    SHEET_SYNC_MAX_ATTEMPTS,
  } = loadSync();
  // Never measured: gives up after the attempt limit instead of looping forever.
  const clock = fakeClock();
  const stuck = fakeSheet();
  startSheetSync({
    isOpen: true,
    openIndex: 0,
    getSettledIndex: () => stuck.settledIndex,
    getSheet: () => stuck,
    schedule: clock.schedule,
    cancel: clock.cancel,
  });
  clock.advance(SHEET_SYNC_INTERVAL_MS * (SHEET_SYNC_MAX_ATTEMPTS + 20));
  assert.equal(stuck.calls.length, SHEET_SYNC_MAX_ATTEMPTS);
  assert.equal(clock.pending(), 0);

  // The portal mounts the sheet a little later: a missing sheet is no error.
  const lateClock = fakeClock();
  const late = fakeSheet();
  late.measured = true;
  let mounted = null;
  startSheetSync({
    isOpen: true,
    openIndex: 0,
    getSettledIndex: () => late.settledIndex,
    getSheet: () => mounted,
    schedule: lateClock.schedule,
    cancel: lateClock.cancel,
  });
  lateClock.advance(SHEET_SYNC_INTERVAL_MS * 2);
  mounted = late;
  lateClock.advance(SHEET_SYNC_INTERVAL_MS);
  assert.equal(late.settledIndex, 0);

  // Closing the page (or flipping isOpen) cancels pending retries.
  const cancelClock = fakeClock();
  const cancelled = fakeSheet();
  const stop = startSheetSync({
    isOpen: true,
    openIndex: 0,
    getSettledIndex: () => cancelled.settledIndex,
    getSheet: () => cancelled,
    schedule: cancelClock.schedule,
    cancel: cancelClock.cancel,
  });
  stop();
  cancelClock.advance(SHEET_SYNC_INTERVAL_MS * 5);
  assert.deepEqual(cancelled.calls, []);
});
