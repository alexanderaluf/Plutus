import { createElement, memo, type ComponentType, type ReactNode } from "react";
import Svg, {
  Circle,
  ClipPath,
  Defs,
  Ellipse,
  G,
  Line,
  LinearGradient,
  Path,
  Polygon,
  Polyline,
  RadialGradient,
  Rect,
  Stop,
  Use,
} from "react-native-svg";

import type {
  BrandSvgNode,
  BrandSvgTree,
} from "@/shared/icons/brand-icon-types";

const TAGS: Record<string, ComponentType<object>> = {
  circle: Circle,
  clipPath: ClipPath,
  defs: Defs,
  ellipse: Ellipse,
  g: G,
  line: Line,
  linearGradient: LinearGradient,
  path: Path,
  polygon: Polygon,
  polyline: Polyline,
  radialGradient: RadialGradient,
  rect: Rect,
  stop: Stop,
  use: Use,
} as Record<string, ComponentType<object>>;

function renderNode(node: BrandSvgNode, key: number): ReactNode {
  if (typeof node === "string") return node;
  const Component = TAGS[node[0]];
  if (!Component) return null;
  return createElement(
    Component,
    { key, ...node[1] },
    node[2]?.map(renderNode),
  );
}

/**
 * Renders a generated brand tree. `color` resolves every `currentColor`
 * paint, which is how mono brand marks pick up the record color.
 */
export const BrandSvg = memo(function BrandSvg({
  tree,
  size,
  color,
}: {
  tree: BrandSvgTree;
  size: number;
  color: string;
}) {
  return (
    <Svg
      color={color}
      fill={tree.fill}
      height={size}
      viewBox={tree.viewBox}
      width={size}
    >
      {tree.children.map(renderNode)}
    </Svg>
  );
});
