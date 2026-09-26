const fs = require("node:fs");
const path = require("node:path");

// Expo SDK 57's JSI C++ header annotates constructors as retained return
// values. Xcode 26.2 rejects that invalid Swift interop annotation.
const header = path.join(
  __dirname,
  "../node_modules/expo-modules-jsi/apple/Sources/ExpoModulesJSI-Cxx/include/RuntimeScheduler.h",
);
if (fs.existsSync(header)) {
  const before = fs.readFileSync(header, "utf8");
  const after = before
    .replace(
      "SWIFT_RETURNS_RETAINED RuntimeScheduler(void *scheduler",
      "RuntimeScheduler(void *scheduler",
    )
    .replace("SWIFT_RETURNS_RETAINED RuntimeScheduler()", "RuntimeScheduler()");
  if (after !== before) fs.writeFileSync(header, after);
}

const manifest = path.join(
  __dirname,
  "../node_modules/expo-modules-jsi/apple/Package.swift",
);
if (fs.existsSync(manifest)) {
  const before = fs.readFileSync(manifest, "utf8");
  const after = before.replace(
    "swiftLanguageModes: [.v6]",
    "swiftLanguageModes: [.v5]",
  );
  if (after !== before) fs.writeFileSync(manifest, after);
}

const runtime = path.join(
  __dirname,
  "../node_modules/expo-modules-jsi/apple/Sources/ExpoModulesJSI/Runtime/JavaScriptRuntime.swift",
);
if (fs.existsSync(runtime)) {
  const before = fs.readFileSync(runtime, "utf8");
  const after = before.replace(
    "name.wholeMatch(of: /^[a-zA-Z_$][a-zA-Z0-9_$]*$/) == nil",
    'name.range(of: "^[a-zA-Z_$][a-zA-Z0-9_$]*$", options: .regularExpression) == nil',
  );
  if (after !== before) fs.writeFileSync(runtime, after);
}

const promise = path.join(
  __dirname,
  "../node_modules/expo-modules-jsi/apple/Sources/ExpoModulesJSI/Runtime/Values/JavaScriptPromise.swift",
);
if (fs.existsSync(promise)) {
  const before = fs.readFileSync(promise, "utf8");
  const after = before
    .replace("private let longLivedState = LongLivedState()", "private let longLivedState: LongLivedState")
    .replace(
      "self.runtime = runtime\n    longLivedState.object.reset",
      "self.runtime = runtime\n    self.longLivedState = LongLivedState()\n    longLivedState.object.reset",
    )
    .replace(
      "self.runtime = runtime\n\n    // The promise",
      "self.runtime = runtime\n    self.longLivedState = LongLivedState()\n\n    // The promise",
    );
  if (after !== before) fs.writeFileSync(promise, after);
}
