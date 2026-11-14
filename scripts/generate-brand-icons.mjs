// Extracts brand logos from @thesvg/react-native into a static data module.
// The package ships 7,600+ brands (~70 MB), so the app never imports it
// directly; only brands listed in scripts/brand-icon-categories.json are
// bundled.
//
// Only each brand's `default` logo is used (or its `mono` twin). Wordmark
// variants are never read, and logos whose artwork is just lettering (wide
// text such as "VISA" or "SONY") are rejected by measuring the drawn shape.
//
// For each brand up to two render trees are stored:
// - `colored`: the original brand colors, shown in the icon picker.
// - `mono`: one ink (`currentColor`), tinted like every other record icon.
//   Omitted when it is exactly `colored` with every paint set to one ink; the
//   app derives it at runtime.
//
// Run: node scripts/generate-brand-icons.mjs
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { Resvg } from "@resvg/resvg-js";

const projectRoot = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "..",
);
const iconDirectory = path.join(
  projectRoot,
  "node_modules",
  "@thesvg",
  "react-native",
  "dist",
  "icons",
);
const outputPath = path.join(
  projectRoot,
  "src",
  "shared",
  "icons",
  "brand-icons.ts",
);

/** Category keys match `iconPicker.brandGroups.*` translations. */
const CATEGORIES = JSON.parse(
  fs.readFileSync(
    path.join(projectRoot, "scripts", "brand-icon-categories.json"),
    "utf8",
  ),
);

/**
 * Multi-color logos whose parts never overlap, so flattening every color to
 * one ink still reads correctly. Reviewed by hand; add with care.
 */
const FLATTEN_OK = new Set(["microsoft", "slack"]);

/** Wide symbols that are marks, not lettering (aspect check exemption). */
const WIDE_MARKS = new Set([
  "nike",
  "audi",
  "chevrolet",
  "mastercard",
  "hsbc",
  "okx",
  "tradingview",
  "bank-of-america",
  "reebok",
  "hyundai",
  "mini",
  "aston-martin",
  "bentley",
  "infiniti",
  "cadillac",
  "soundcloud",
  "cloudflare",
  "flickr",
  "letterboxd",
  "n8n",
  "lastpass",
  "british-airways",
]);

/**
 * Logos that pass the shape check but are still just the brand name in
 * letters (stacked or compact wordmarks). Reviewed on a contact sheet.
 */
const WORDMARKS = new Set(
  JSON.parse(
    fs.readFileSync(
      path.join(projectRoot, "scripts", "brand-icon-wordmarks.json"),
      "utf8",
    ),
  ),
);

/** Drawn content wider/taller than this reads as lettering in a round tile. */
const MAX_CONTENT_ASPECT = 1.8;
const MIN_CONTENT_ASPECT = 0.4;
/** Breathing room around the cropped artwork, as a share of its size. */
const CROP_PADDING = 0.06;
const RENDER_SIZE = 128;

const DRAWABLE = new Set([
  "path",
  "rect",
  "circle",
  "ellipse",
  "polygon",
  "polyline",
  "line",
]);
const MONO_FORBIDDEN = new Set([
  "mask",
  "clipPath",
  "use",
  "defs",
  "linearGradient",
  "radialGradient",
  "text",
  "tspan",
]);
const COLORED_FORBIDDEN = new Set(["mask", "text", "tspan"]);

function readVariants(slug) {
  const file = path.join(iconDirectory, `${slug}.js`);
  if (!fs.existsSync(file)) return null;
  const source = fs.readFileSync(file, "utf8");
  const label = source.match(/^\/\/ @thesvg\/react-native — (.+)$/m)?.[1];
  const data = source.match(/const _variants = (\{.*\});/s)?.[1];
  if (!label || !data) return null;
  return { label: label.trim(), variants: JSON.parse(data) };
}

function tags(tree) {
  const found = new Set();
  const walk = (node) => {
    if (typeof node === "string") return;
    found.add(node[0]);
    (node[2] ?? []).forEach(walk);
  };
  tree.children.forEach(walk);
  return found;
}

function usesOnly(tree, forbidden) {
  return [...tags(tree)].every((tag) => !forbidden.has(tag));
}

function parseViewBox(viewBox) {
  const [x, y, width, height] = String(viewBox)
    .trim()
    .split(/[\s,]+/)
    .map(Number);
  return { x, y, width, height };
}

/** Every paint (fill/stroke) that actually reaches a drawable shape. */
function effectivePaints(tree) {
  const paints = [];
  const walk = (node, fill, stroke) => {
    if (typeof node === "string") return;
    const props = node[1] ?? {};
    const nextFill = props.fill ?? fill;
    const nextStroke = props.stroke ?? stroke;
    if (DRAWABLE.has(node[0])) {
      if (nextFill && nextFill !== "none") paints.push(nextFill);
      if (nextStroke && nextStroke !== "none") paints.push(nextStroke);
    }
    (node[2] ?? []).forEach((child) => walk(child, nextFill, nextStroke));
  };
  tree.children.forEach((child) => walk(child, tree.fill ?? "#000", undefined));
  return paints;
}

function rgb(paint) {
  const value = paint.trim().toLowerCase();
  if (value === "currentcolor" || value === "black") return [0, 0, 0];
  if (value === "white") return [255, 255, 255];
  const hex = value.match(/^#([\da-f]{3,8})$/)?.[1];
  if (!hex) return null;
  const full =
    hex.length <= 4
      ? hex
          .slice(0, 3)
          .split("")
          .map((c) => c + c)
          .join("")
      : hex.slice(0, 6);
  return [0, 2, 4].map((i) => parseInt(full.slice(i, i + 2), 16));
}

function luminance(paint) {
  const channels = rgb(paint);
  if (!channels) return 0.5; // gradients and unknown paints count as visible
  const [r, g, b] = channels
    .map((v) => v / 255)
    .map((v) => (v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4));
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

/** The colored picker tile is a white plate, so the logo must show on white. */
function visibleOnWhite(tree) {
  return effectivePaints(tree).some((paint) => luminance(paint) < 0.85);
}

function singleInk(tree) {
  const paints = effectivePaints(tree).map((p) => p.trim().toLowerCase());
  return (
    paints.length > 0 &&
    new Set(paints).size === 1 &&
    !paints[0].startsWith("url(")
  );
}

/** Most used saturated paint: the brand color when only a mono mark fits. */
function brandColor(variants) {
  const counts = new Map();
  for (const key of ["default", "color", "light", "dark"]) {
    if (!variants[key]) continue;
    for (const paint of effectivePaints(variants[key])) {
      const channels = rgb(paint);
      if (!channels) continue;
      const spread = Math.max(...channels) - Math.min(...channels);
      if (spread < 40) continue; // greys, black and white are not brand hues
      const hex = `#${channels.map((c) => c.toString(16).padStart(2, "0")).join("")}`;
      counts.set(hex, (counts.get(hex) ?? 0) + 1);
    }
    if (counts.size) break;
  }
  return [...counts.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] ?? "#111111";
}

/** Points every visible paint at one ink (`currentColor` by default). */
function toMono(tree, ink = "currentColor") {
  const convert = (node) => {
    if (typeof node === "string") return node;
    const props = { ...(node[1] ?? {}) };
    for (const key of ["fill", "stroke"]) {
      if (props[key] !== undefined && props[key] !== "none") props[key] = ink;
    }
    delete props.style;
    return node[2] ? [node[0], props, node[2].map(convert)] : [node[0], props];
  };
  return {
    viewBox: tree.viewBox,
    fill: tree.fill === "none" ? "none" : ink,
    children: tree.children.map(convert),
  };
}

/** Prefixes gradient/clip ids so several logos can share one screen. */
function namespaceIds(tree, slug) {
  const prefix = `${slug}-`;
  // Only references are rewritten: `url(#id)` paints/clips and `#id` hrefs.
  // Plain colors such as `#F3BA2F` must stay untouched.
  const rewriteUrl = (value) =>
    typeof value === "string"
      ? value.replace(/url\(#([^)]+)\)/g, `url(#${prefix}$1)`)
      : value;
  const rewriteHref = (value) =>
    typeof value === "string"
      ? value.replace(/^#(.+)$/, `#${prefix}$1`)
      : value;
  const convert = (node) => {
    if (typeof node === "string") return node;
    const props = {};
    for (const [key, value] of Object.entries(node[1] ?? {})) {
      props[key] =
        key === "id"
          ? `${prefix}${value}`
          : key === "href" || key === "xlinkHref"
            ? rewriteHref(value)
            : key === "fill" ||
                key === "stroke" ||
                key === "clipPath" ||
                key === "mask"
              ? rewriteUrl(value)
              : value;
    }
    return node[2] ? [node[0], props, node[2].map(convert)] : [node[0], props];
  };
  return { ...tree, children: tree.children.map(convert) };
}

const NAMED_COLORS = new Set([
  "none",
  "transparent",
  "currentcolor",
  "black",
  "white",
  "red",
  "green",
  "blue",
  "yellow",
  "orange",
  "purple",
  "gray",
  "grey",
  "silver",
  "navy",
]);
const HEX_COLOR = /^#([\da-f]{3}|[\da-f]{4}|[\da-f]{6}|[\da-f]{8})$/i;
const RGB_COLOR =
  /^rgba?\(\s*[\d.]+%?\s*,\s*[\d.]+%?\s*,\s*[\d.]+%?\s*(,\s*[\d.]+%?\s*)?\)$/i;

/**
 * Lists anything react-native-svg cannot draw reliably. An unknown color
 * string or a dangling `url(#id)` renders as nothing on device, which would
 * leave an empty tile in the picker.
 */
function problems(tree) {
  const ids = new Set();
  const collect = (node) => {
    if (typeof node === "string") return;
    if (node[1]?.id !== undefined) ids.add(String(node[1].id));
    (node[2] ?? []).forEach(collect);
  };
  tree.children.forEach(collect);

  const issues = [];
  const reference = (value) =>
    String(value)
      .trim()
      .match(/^url\(#([^)]+)\)$/)?.[1];
  const checkPaint = (value, where) => {
    const text = String(value).trim();
    const ref = reference(text);
    if (ref !== undefined) {
      if (!ids.has(ref)) issues.push(`${where} -> missing #${ref}`);
    } else if (
      !HEX_COLOR.test(text) &&
      !RGB_COLOR.test(text) &&
      !NAMED_COLORS.has(text.toLowerCase())
    ) {
      issues.push(`${where}=${text}`);
    }
  };
  checkPaint(tree.fill, "root.fill");
  const walk = (node) => {
    if (typeof node === "string") return;
    const props = node[1] ?? {};
    for (const key of ["fill", "stroke", "stopColor", "color"])
      if (props[key] !== undefined) checkPaint(props[key], `${node[0]}.${key}`);
    for (const key of ["clipPath", "mask"]) {
      if (props[key] === undefined) continue;
      const ref = reference(props[key]);
      if (ref === undefined || !ids.has(ref))
        issues.push(`${node[0]}.${key}=${props[key]}`);
    }
    for (const key of ["href", "xlinkHref"])
      if (
        props[key] !== undefined &&
        !ids.has(String(props[key]).replace(/^#/, ""))
      )
        issues.push(`${node[0]}.${key}=${props[key]}`);
    (node[2] ?? []).forEach(walk);
  };
  tree.children.forEach(walk);
  return issues;
}

// ---------------------------------------------------------------------------
// Measuring the drawn artwork

const svgAttribute = (key) =>
  key === "href" || key === "xlinkHref"
    ? "href"
    : key.replace(/[A-Z]/g, (c) => `-${c.toLowerCase()}`);
const escapeAttribute = (value) =>
  String(value)
    .replace(/&/g, "&amp;")
    .replace(/"/g, "&quot;")
    .replace(/</g, "&lt;");
function svgNode(node) {
  if (typeof node === "string") return node;
  const attributes = Object.entries(node[1] ?? {})
    .filter(([key]) => /^[A-Za-z][\w-]*$/.test(key))
    .map(([key, value]) => `${svgAttribute(key)}="${escapeAttribute(value)}"`)
    .join(" ");
  return `<${node[0]} ${attributes}>${(node[2] ?? []).map(svgNode).join("")}</${node[0]}>`;
}

/**
 * Share of the tile that visibly contrasts with the white picker plate.
 * Catches pale logos (e.g. a light-grey mark) that are technically painted
 * but would look like an empty circle.
 */
function contrastOnWhite(tree) {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${RENDER_SIZE}" height="${RENDER_SIZE}" viewBox="${tree.viewBox}" fill="${tree.fill}" color="#111111">${tree.children
    .map(svgNode)
    .join("")}</svg>`;
  let image;
  try {
    image = new Resvg(svg, { background: "#ffffff" }).render();
  } catch {
    return 0;
  }
  const { pixels } = image;
  let visible = 0;
  for (let i = 0; i < pixels.length; i += 4) {
    const distance = Math.max(
      255 - pixels[i],
      255 - pixels[i + 1],
      255 - pixels[i + 2],
    );
    if (distance > 70) visible += 1;
  }
  return visible / (pixels.length / 4);
}
const MIN_CONTRAST_SHARE = 0.04;

/** Bounding box of painted pixels, in viewBox units, or null if empty. */
function contentBox(tree) {
  const box = parseViewBox(tree.viewBox);
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${RENDER_SIZE}" height="${RENDER_SIZE}" viewBox="${tree.viewBox}" preserveAspectRatio="none" fill="${tree.fill}" color="#000000">${tree.children
    .map(svgNode)
    .join("")}</svg>`;
  let image;
  try {
    image = new Resvg(svg).render();
  } catch {
    return null; // unparseable artwork is treated like an empty logo
  }
  const { pixels, width, height } = image;
  let minX = width;
  let minY = height;
  let maxX = -1;
  let maxY = -1;
  let painted = 0;
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      if (pixels[(y * width + x) * 4 + 3] < 24) continue;
      painted += 1;
      if (x < minX) minX = x;
      if (x > maxX) maxX = x;
      if (y < minY) minY = y;
      if (y > maxY) maxY = y;
    }
  }
  if (painted < width * height * 0.01 || maxX < 0) return null;
  const scaleX = box.width / width;
  const scaleY = box.height / height;
  return {
    x: box.x + minX * scaleX,
    y: box.y + minY * scaleY,
    width: (maxX - minX + 1) * scaleX,
    height: (maxY - minY + 1) * scaleY,
  };
}

const round = (value) => Math.round(value * 1000) / 1000;

/** A square viewBox hugging the artwork, so every tile fills alike. */
function croppedViewBox(content) {
  const side = Math.max(content.width, content.height) * (1 + CROP_PADDING * 2);
  const centerX = content.x + content.width / 2;
  const centerY = content.y + content.height / 2;
  return [centerX - side / 2, centerY - side / 2, side, side]
    .map(round)
    .join(" ");
}

function isLettering(slug, content) {
  if (WORDMARKS.has(slug)) return true;
  if (WIDE_MARKS.has(slug)) return false;
  // Lettering runs wide; tall artwork (an "N", a leaf) is a mark.
  const ratio = content.width / content.height;
  return ratio > MAX_CONTENT_ASPECT || ratio < MIN_CONTENT_ASPECT;
}

/**
 * The first candidate that draws cleanly and is a logo mark rather than
 * lettering, cropped to its artwork. Returns null when none qualifies.
 */
function firstMark(slug, candidates) {
  for (const tree of candidates) {
    if (!tree || problems(tree).length) continue;
    const box = contentBox(tree);
    if (box && !isLettering(slug, box))
      return { ...tree, viewBox: croppedViewBox(box) };
  }
  return null;
}

// ---------------------------------------------------------------------------

/** Single-ink candidates: the package's mono logo, else the default flattened. */
function monoCandidates(slug, variants) {
  const candidates = [];
  if (variants.mono && usesOnly(variants.mono, MONO_FORBIDDEN))
    candidates.push(toMono(variants.mono));
  const tree = variants.default;
  if (
    tree &&
    usesOnly(tree, MONO_FORBIDDEN) &&
    (singleInk(tree) || FLATTEN_OK.has(slug))
  )
    candidates.push(toMono(tree));
  return candidates;
}

const sameTree = (a, b) => JSON.stringify(a) === JSON.stringify(b);

const groups = [];
const skipped = [];
const missing = [];
const seen = new Set();
for (const [category, slugs] of Object.entries(CATEGORIES)) {
  const icons = [];
  for (const slug of slugs) {
    if (seen.has(slug)) continue;
    const entry = readVariants(slug);
    if (!entry) {
      missing.push(slug);
      continue;
    }
    const skip = (reason) => skipped.push(`${slug} (${reason})`);

    const mono = firstMark(slug, monoCandidates(slug, entry.variants));
    if (!mono) {
      skip("no single-color logo mark (only lettering or multi-color art)");
      continue;
    }

    // The picker shows the brand's own default logo. When that is lettering
    // or cannot show on a white tile (e.g. a white mark), the mono logo
    // mark is painted in the brand color instead.
    const original = entry.variants.default;
    let defaultMark =
      original &&
      usesOnly(original, COLORED_FORBIDDEN) &&
      visibleOnWhite(original)
        ? firstMark(slug, [namespaceIds(original, slug)])
        : null;
    if (defaultMark && contrastOnWhite(defaultMark) < MIN_CONTRAST_SHARE)
      defaultMark = null;
    const colored =
      defaultMark ??
      firstMark(slug, [toMono(mono, brandColor(entry.variants))]);
    if (!colored) {
      skip("no colored logo mark");
      continue;
    }

    seen.add(slug);
    const icon = { slug, label: entry.label, colored };
    // Store mono only when it is real extra artwork.
    if (!sameTree(mono, toMono(colored))) icon.mono = mono;
    icons.push(icon);
  }
  groups.push({ category, icons });
}

const lines = [
  "// Generated from @thesvg/react-native. Do not edit manually.",
  "// Run: node scripts/generate-brand-icons.mjs",
  "",
  'import type { BrandIconGroup } from "./brand-icon-types";',
  "",
  "export const BRAND_ICON_GROUPS: readonly BrandIconGroup[] = [",
  ...groups.map(
    (group) =>
      `{"category":${JSON.stringify(group.category)},"icons":[\n${group.icons
        .map((icon) => JSON.stringify(icon))
        .join(",\n")}\n]},`,
  ),
  "];",
  "",
];
fs.writeFileSync(outputPath, lines.join("\n"));

const total = groups.reduce((sum, group) => sum + group.icons.length, 0);
console.log(
  `Wrote ${total} brand icons to ${path.relative(projectRoot, outputPath)} (${Math.round(
    fs.statSync(outputPath).size / 1024,
  )} KB)`,
);
for (const group of groups)
  console.log(`  ${group.category}: ${group.icons.length}`);
if (missing.length)
  console.log(`Not in package (${missing.length}): ${missing.join(", ")}`);
if (skipped.length)
  console.log(`Skipped ${skipped.length}:\n  ${skipped.join("\n  ")}`);
