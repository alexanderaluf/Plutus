const fs = require("node:fs");
const path = require("node:path");

// @gorhom/bottom-sheet 5.2.14 (used by HeroUI sheets on Android/web) and
// heroui-native 1.0.9 still pass Reanimated 3-style dependency arrays to
// worklet hooks. Reanimated 4 ignores them on native and logs "Dependencies
// should only be used on the web" every time a sheet mounts. The Babel worklet
// plugin already captures each closure, so the arrays are dropped here.

let ts;
try {
  ts = require("typescript");
} catch {
  console.warn("patch-reanimated-dependencies: typescript missing, skipped.");
  return;
}

// Hook name -> index of its dependency argument.
const HOOKS = {
  useAnimatedStyle: 1,
  useAnimatedProps: 1,
  useDerivedValue: 1,
  useAnimatedReaction: 2,
  useAnimatedScrollHandler: 1,
  useHandler: 1,
};
const PACKAGES = ["@gorhom/bottom-sheet", "heroui-native"];
// `--dry-run` reports what would change without writing any file.
const DRY_RUN = process.argv.includes("--dry-run");
const HOOK_PATTERN = new RegExp(`\\b(${Object.keys(HOOKS).join("|")})\\b`);

function sourceFiles(directory, files = []) {
  if (!fs.existsSync(directory)) return files;
  for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
    const fullPath = path.join(directory, entry.name);
    if (entry.isDirectory()) {
      if (entry.name !== "node_modules" && entry.name !== "__tests__")
        sourceFiles(fullPath, files);
    } else if (
      /\.(tsx?|jsx?)$/.test(entry.name) &&
      !/\.d\.ts$/.test(entry.name) &&
      // Web-only files may run without the worklet plugin.
      !/\.webx?\.[jt]sx?$/.test(entry.name)
    ) {
      files.push(fullPath);
    }
  }
  return files;
}

function hookName(callee) {
  // Compiled CommonJS calls hooks as `(0, _reanimated.useAnimatedStyle)(…)`.
  while (ts.isParenthesizedExpression(callee)) callee = callee.expression;
  if (
    ts.isBinaryExpression(callee) &&
    callee.operatorToken.kind === ts.SyntaxKind.CommaToken
  )
    callee = callee.right;
  if (ts.isIdentifier(callee)) return callee.text;
  if (ts.isPropertyAccessExpression(callee)) return callee.name.text;
  return null;
}

function scriptKind(file) {
  return /\.tsx$/.test(file)
    ? ts.ScriptKind.TSX
    : /\.ts$/.test(file)
      ? ts.ScriptKind.TS
      : /\.jsx$/.test(file)
        ? ts.ScriptKind.JSX
        : ts.ScriptKind.JS;
}

/** Returns the patched text, or null when the file needs no change. */
function patchSource(file, before) {
  if (!HOOK_PATTERN.test(before)) return null;
  const sourceFile = ts.createSourceFile(
    file,
    before,
    ts.ScriptTarget.Latest,
    true,
    scriptKind(file),
  );
  const edits = [];
  const visit = (node) => {
    if (ts.isCallExpression(node)) {
      const index = HOOKS[hookName(node.expression)];
      const args = node.arguments;
      if (index !== undefined && args.length > index) {
        const dependency = args[index];
        const isNullish =
          dependency.kind === ts.SyntaxKind.NullKeyword ||
          (ts.isIdentifier(dependency) && dependency.text === "undefined");
        if (!isNullish) {
          edits.push(
            index === args.length - 1
              ? // Last argument: remove it with its leading comma.
                { start: args[index - 1].getEnd(), end: dependency.getEnd(), text: "" }
              : // Later arguments still need their positions.
                { start: dependency.getStart(), end: dependency.getEnd(), text: "undefined" },
          );
        }
      }
    }
    ts.forEachChild(node, visit);
  };
  visit(sourceFile);
  if (edits.length === 0) return null;

  let after = before;
  for (const edit of edits.sort((a, b) => b.start - a.start)) {
    after = after.slice(0, edit.start) + edit.text + after.slice(edit.end);
  }
  return { text: after, count: edits.length };
}

let patchedFiles = 0;
let patchedCalls = 0;
for (const name of PACKAGES) {
  const root = path.join(__dirname, "../node_modules", name);
  for (const folder of ["src", "lib"]) {
    for (const file of sourceFiles(path.join(root, folder))) {
      const result = patchSource(file, fs.readFileSync(file, "utf8"));
      if (!result) continue;
      patchedFiles++;
      patchedCalls += result.count;
      if (DRY_RUN) {
        // The patched text must parse cleanly and need no further edits.
        const parsed = ts.createSourceFile(
          file,
          result.text,
          ts.ScriptTarget.Latest,
          true,
          scriptKind(file),
        );
        const errors = parsed.parseDiagnostics?.length ?? 0;
        const remaining = patchSource(file, result.text);
        console.log(
          `${path.relative(root, file)}: ${result.count} call(s)` +
            (errors ? `, ${errors} PARSE ERROR(S)` : "") +
            (remaining ? ", NOT IDEMPOTENT" : ""),
        );
      } else {
        fs.writeFileSync(file, result.text);
      }
    }
  }
}
if (patchedCalls > 0) {
  console.log(
    `patch-reanimated-dependencies: ${DRY_RUN ? "would patch" : "patched"} ` +
      `${patchedCalls} calls in ${patchedFiles} files.`,
  );
}
