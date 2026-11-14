const fs = require("node:fs");
const assert = require("node:assert/strict");
const { test } = require("node:test");
const ts = require("typescript");

require.extensions[".ts"] = (module, filename) => {
  const source = ts.transpileModule(fs.readFileSync(filename, "utf8"), {
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2022,
    },
  }).outputText;
  module._compile(source, filename);
};

const {
  DEFAULT_APP_LOCK,
  PIN_COOLDOWN_MS,
  isValidPin,
  parseAppLockSettings,
  pinCooldownUntil,
  shouldRelock,
} = require("../src/features/security/app-lock-policy.ts");

test("app lock is off by default and ignores damaged stored settings", () => {
  assert.deepEqual(parseAppLockSettings(null), DEFAULT_APP_LOCK);
  assert.deepEqual(parseAppLockSettings("{not json"), DEFAULT_APP_LOCK);
  assert.deepEqual(
    parseAppLockSettings(
      JSON.stringify({ enabled: true, method: "pin", relockAfterSeconds: 300 }),
    ),
    { enabled: true, method: "pin", relockAfterSeconds: 300 },
  );
  assert.equal(
    parseAppLockSettings(
      JSON.stringify({ enabled: "yes", relockAfterSeconds: 7 }),
    ).enabled,
    false,
  );
  assert.equal(
    parseAppLockSettings(JSON.stringify({ relockAfterSeconds: 7 }))
      .relockAfterSeconds,
    60,
  );
});

test("the app relocks only after the chosen time away", () => {
  const settings = {
    enabled: true,
    method: "biometric",
    relockAfterSeconds: 60,
  };
  const left = 1_000_000;
  assert.equal(shouldRelock(settings, left, left + 59_999), false);
  assert.equal(shouldRelock(settings, left, left + 60_000), true);
  assert.equal(
    shouldRelock({ ...settings, relockAfterSeconds: 0 }, left, left),
    true,
  );
  assert.equal(
    shouldRelock({ ...settings, enabled: false }, left, left + 1e9),
    false,
  );
  // Never left the foreground (e.g. a Face ID prompt): stays unlocked.
  assert.equal(shouldRelock(settings, null, left + 1e9), false);
});

test("PINs are four digits with growing cooldowns after repeated failures", () => {
  assert.equal(isValidPin("0429"), true);
  assert.equal(isValidPin("042"), false);
  assert.equal(isValidPin("04a9"), false);
  assert.equal(pinCooldownUntil(4, 0), null);
  assert.equal(pinCooldownUntil(5, 1000), 1000 + PIN_COOLDOWN_MS);
  assert.equal(pinCooldownUntil(6, 1000), null);
  assert.equal(pinCooldownUntil(10, 1000), 1000 + PIN_COOLDOWN_MS * 2);
});
