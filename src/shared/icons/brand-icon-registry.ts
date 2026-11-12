import type {
  BrandIcon,
  BrandSvgNode,
  BrandSvgTree,
} from "./brand-icon-types";
import { BRAND_ICON_GROUPS } from "./brand-icons";

/** Persisted icon names for brand logos look like `brand:visa`. */
export const BRAND_ICON_PREFIX = "brand:";

const brandIconsBySlug = new Map<string, BrandIcon>(
  BRAND_ICON_GROUPS.flatMap((group) => group.icons).map((icon) => [
    icon.slug,
    icon,
  ]),
);

export function brandIconName(slug: string) {
  return `${BRAND_ICON_PREFIX}${slug}`;
}

export function getBrandIcon(name: string): BrandIcon | undefined {
  return name.startsWith(BRAND_ICON_PREFIX)
    ? brandIconsBySlug.get(name.slice(BRAND_ICON_PREFIX.length))
    : undefined;
}

/** True only for brand icons bundled in this build. */
export function isBrandIconName(name: string) {
  return getBrandIcon(name) !== undefined;
}

function toCurrentColor(node: BrandSvgNode): BrandSvgNode {
  if (typeof node === "string") return node;
  const props = { ...node[1] };
  for (const key of ["fill", "stroke"] as const)
    if (props[key] !== undefined && props[key] !== "none")
      props[key] = "currentColor";
  return node.length === 3
    ? [node[0], props, node[2].map(toCurrentColor)]
    : [node[0], props];
}

const derivedMonoTrees = new WeakMap<BrandIcon, BrandSvgTree>();

/**
 * The single-ink logo used across the app. The generator omits it when it
 * is just the colored logo in one ink, so it is derived (once) here.
 */
export function brandMonoTree(icon: BrandIcon): BrandSvgTree {
  if (icon.mono) return icon.mono;
  let tree = derivedMonoTrees.get(icon);
  if (!tree) {
    tree = {
      viewBox: icon.colored.viewBox,
      fill: icon.colored.fill === "none" ? "none" : "currentColor",
      children: icon.colored.children.map(toCurrentColor),
    };
    derivedMonoTrees.set(icon, tree);
  }
  return tree;
}
