// Bundles only the Material Symbols the icon picker offers (see
// src/shared/icons/icon-options.ts) plus those used by default categories.
// Records keep their own path data, so icons removed from the picker still
// render on existing records.
//
// Run: node scripts/generate-material-icons.mjs
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const projectRoot = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "..",
);
const packageRoot = path.join(
  projectRoot,
  "node_modules",
  "@material-symbols-svg",
  "react-native",
  "dist",
);
const iconDirectory = path.join(packageRoot, "rounded", "icons");
const metadata = JSON.parse(
  fs.readFileSync(path.join(packageRoot, "metadata", "icon-index.json"), "utf8"),
);
const outputPath = path.join(
  projectRoot,
  "src",
  "shared",
  "icons",
  "material-rounded-filled-icons.ts",
);

const { ICON_GROUPS } = await import(
  pathToFileURL(path.join(projectRoot, "src", "shared", "icons", "icon-options.ts"))
    .href
);
const defaultBackup = fs.readFileSync(
  path.join(projectRoot, "src", "data", "model", "default-backup.ts"),
  "utf8",
);

const needed = new Set([
  ...ICON_GROUPS.flatMap((group) => group.icons)
    .map((icon) => icon.name)
    .filter((name) => name.startsWith("material:"))
    .map((name) => name.slice("material:".length)),
  ...[...defaultBackup.matchAll(/"material:([a-z0-9_]+)"/g)].map(
    (match) => match[1],
  ),
]);

function titleFromName(name) {
  return name
    .split(/[_-]+/)
    .map((word) => (word ? `${word[0].toUpperCase()}${word.slice(1)}` : word))
    .join(" ");
}

const byName = new Map(
  Object.entries(metadata).map(([slug, item]) => [item.name, { slug, item }]),
);
const missing = [...needed].filter((name) => !byName.has(name));
if (missing.length)
  throw new Error(`Unknown Material Symbols: ${missing.join(", ")}`);

const icons = [...needed]
  .map((name) => {
    const { slug, item } = byName.get(name);
    const source = fs.readFileSync(
      path.join(iconDirectory, `${slug.replaceAll("_", "-")}.js`),
      "utf8",
    );
    const filledStart = source.indexOf("filled:");
    const blockStart =
      filledStart >= 0 ? filledStart : source.indexOf("regular:");
    const weight400 = source
      .slice(blockStart)
      .match(/"400":\s*("(?:\\.|[^"\\])*")/);
    const pathData = weight400 ? JSON.parse(weight400[1]) : "";
    if (blockStart < 0 || !pathData)
      throw new Error(`Missing rounded filled weight 400 path: ${name}`);
    const label = titleFromName(name);
    return {
      name,
      label,
      searchText: `${name} ${label} ${item.categories.join(" ")}`.toLowerCase(),
      pathData,
    };
  })
  .sort((left, right) => left.name.localeCompare(right.name));

const lines = icons.map((icon) => JSON.stringify(icon)).join(",\n");
fs.writeFileSync(
  outputPath,
  `// Generated from @material-symbols-svg/react-native. Do not edit manually.
// Run: node scripts/generate-material-icons.mjs

export type MaterialRoundedFilledIcon = {
  name: string;
  label: string;
  searchText: string;
  pathData: string;
};

export const MATERIAL_ROUNDED_FILLED_ICONS: readonly MaterialRoundedFilledIcon[] = [
${lines}
];
`,
);
console.log(
  `Generated ${icons.length} Material Symbols (${Math.round(
    fs.statSync(outputPath).size / 1024,
  )} KB).`,
);
