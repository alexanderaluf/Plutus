const assert = require("node:assert/strict");
const fs = require("node:fs");
const { test } = require("node:test");
const ts = require("typescript");

const filename = require.resolve("../src/features/local-ai/model-compatibility-policy.ts");
const source = ts.transpileModule(fs.readFileSync(filename, "utf8"), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
}).outputText;
const moduleShim = { exports: {} };
new Function("module", "exports", source)(moduleShim, moduleShim.exports);
const { evaluateLocalAICompatibility, LOCAL_AI_MODEL, LOCAL_AI_MODELS } = moduleShim.exports;

const suitableDevice = {
  platform: "android",
  isDevice: true,
  architectures: ["arm64-v8a", "armeabi-v7a"],
  totalMemoryBytes: 8_500_000_000,
  freeStorageBytes: LOCAL_AI_MODEL.minFreeStorageBytes + 1,
  isExpoGo: true,
};

test("compatible hardware is distinct from Expo Go runtime support", () => {
  const result = evaluateLocalAICompatibility(suitableDevice);
  assert.equal(result.hardwareSupported, true);
  assert.equal(result.isExpoGo, true);
  assert.deepEqual(result.reasons, []);
});

test("each unavailable hardware measurement fails closed with a reason", () => {
  const result = evaluateLocalAICompatibility({
    ...suitableDevice,
    totalMemoryBytes: null,
    freeStorageBytes: null,
    architectures: null,
  });
  assert.equal(result.hardwareSupported, false);
  assert.deepEqual(result.reasons, [
    "architecture",
    "memory-unknown",
    "storage-unknown",
  ]);
});

test("low memory and storage are rejected", () => {
  assert.equal(LOCAL_AI_MODELS.E2B.minMemoryBytes, 4_000_000_000);
  assert.equal(LOCAL_AI_MODELS.E4B.minMemoryBytes, 4_000_000_000);
  const result = evaluateLocalAICompatibility({
    ...suitableDevice,
    totalMemoryBytes: LOCAL_AI_MODEL.minMemoryBytes - 1,
    freeStorageBytes: LOCAL_AI_MODEL.minFreeStorageBytes - 1,
  });
  assert.deepEqual(result.reasons, ["memory-low", "storage-low"]);
});

test("simulators and unsupported platforms are rejected", () => {
  const result = evaluateLocalAICompatibility({
    ...suitableDevice,
    platform: "web",
    isDevice: false,
  });
  assert.deepEqual(result.reasons, ["platform", "simulator"]);
});

test("E4B has a separate verified file and requires more free storage", () => {
  assert.notEqual(LOCAL_AI_MODELS.E2B.fileName, LOCAL_AI_MODELS.E4B.fileName);
  assert.notEqual(LOCAL_AI_MODELS.E2B.sha256, LOCAL_AI_MODELS.E4B.sha256);
  assert.deepEqual(
    evaluateLocalAICompatibility(suitableDevice, LOCAL_AI_MODELS.E4B).reasons,
    ["storage-low"],
  );
});
