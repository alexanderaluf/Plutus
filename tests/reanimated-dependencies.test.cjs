const fs = require("node:fs");
const path = require("node:path");
const assert = require("node:assert/strict");
const { test } = require("node:test");
const ts = require("typescript");

// Reanimated 4 ignores worklet hook dependency arrays on native and logs
// "Dependencies should only be used on the web" for each one.
const HOOKS = {
  useAnimatedStyle: 1,
  useAnimatedProps: 1,
  useDerivedValue: 1,
  useAnimatedReaction: 2,
  useAnimatedScrollHandler: 1,
  useHandler: 1,
};

function sourceFiles(directory, files = []) {
  for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
    const fullPath = path.join(directory, entry.name);
    if (entry.isDirectory()) sourceFiles(fullPath, files);
    else if (/\.tsx?$/.test(entry.name) && !/\.d\.ts$/.test(entry.name))
      files.push(fullPath);
  }
  return files;
}

test("app code never passes dependency arrays to Reanimated worklet hooks", () => {
  const root = path.resolve(__dirname, "../src");
  const offenders = [];
  for (const file of sourceFiles(root)) {
    const source = fs.readFileSync(file, "utf8");
    const sourceFile = ts.createSourceFile(
      file,
      source,
      ts.ScriptTarget.Latest,
      true,
      file.endsWith(".tsx") ? ts.ScriptKind.TSX : ts.ScriptKind.TS,
    );
    const visit = (node) => {
      if (ts.isCallExpression(node) && ts.isIdentifier(node.expression)) {
        const index = HOOKS[node.expression.text];
        const dependency = node.arguments[index];
        if (
          index !== undefined &&
          dependency &&
          dependency.kind !== ts.SyntaxKind.NullKeyword &&
          !(ts.isIdentifier(dependency) && dependency.text === "undefined")
        ) {
          const { line } = sourceFile.getLineAndCharacterOfPosition(
            node.getStart(),
          );
          offenders.push(
            `${path.relative(root, file)}:${line + 1} ${node.expression.text}`,
          );
        }
      }
      ts.forEachChild(node, visit);
    };
    visit(sourceFile);
  }
  assert.deepEqual(offenders, []);
});
