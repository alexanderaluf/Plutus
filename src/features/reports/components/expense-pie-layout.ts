import type { ConsumptionCategory } from "@/data/selectors/consumption-report-selectors";

const TAU = Math.PI * 2;
const normalize = (angle: number) => ((angle % TAU) + TAU) % TAU;

/** Try every interval in which midpoint side assignments remain unchanged. */
function balancedRotation(midpoints: number[]) {
  if (!midpoints.length) return 0;
  const boundaries = midpoints
    .flatMap((angle) => [
      normalize(Math.PI / 2 - angle),
      normalize((3 * Math.PI) / 2 - angle),
    ])
    .sort((a, b) => a - b);
  const candidates = [
    0,
    ...boundaries.flatMap((start, index) => {
      const end =
        index + 1 < boundaries.length
          ? boundaries[index + 1]
          : boundaries[0] + TAU;
      return [0.25, 0.5, 0.75].map((fraction) =>
        normalize(start + (end - start) * fraction),
      );
    }),
  ];
  let best = { rotation: 0, score: Infinity };
  for (const rotation of candidates) {
    const sides = [false, true].map((right) =>
      midpoints
        .map((angle) => angle + rotation)
        .filter((angle) => Math.cos(angle) >= 0 === right)
        .map(Math.sin)
        .sort((a, b) => a - b),
    );
    const distribution = sides.reduce(
      (sum, side) =>
        sum +
        side.reduce((score, y, index) => {
          const target =
            side.length === 1 ? 0 : -0.7 + (index / (side.length - 1)) * 1.4;
          return score + (y - target) ** 2;
        }, 0),
      0,
    );
    const score =
      Math.abs(sides[0].length - sides[1].length) * 1000 +
      distribution +
      Math.min(rotation, TAU - rotation) * 0.005;
    if (score < best.score) best = { rotation, score };
  }
  return best.rotation;
}

/** Pixel-sized corner radii shrink with tiny slices rather than swallowing them. */
function roundedSector(
  point: (radius: number, angle: number) => { x: number; y: number },
  outer: number,
  inner: number,
  start: number,
  end: number,
  single: boolean,
) {
  const sweep = end - start;
  const pad = single ? 0 : Math.min(0.025, sweep * 0.12);
  const from = start + pad;
  const to = end - pad;
  const corner = single
    ? 0
    : Math.min(6, (outer - inner) / 3, (inner * (to - from)) / 4);
  const outerInset = outer ? corner / outer : 0;
  const innerInset = inner ? corner / inner : 0;
  const coord = (radius: number, angle: number) => {
    const p = point(radius, angle);
    return `${p.x} ${p.y}`;
  };
  const mid = (from + to) / 2;
  return [
    `M ${coord(outer, from + outerInset)}`,
    `A ${outer} ${outer} 0 0 1 ${coord(outer, mid)}`,
    `A ${outer} ${outer} 0 0 1 ${coord(outer, to - outerInset)}`,
    `Q ${coord(outer, to)} ${coord(outer - corner, to)}`,
    `L ${coord(inner + corner, to)}`,
    `Q ${coord(inner, to)} ${coord(inner, to - innerInset)}`,
    `A ${inner} ${inner} 0 0 0 ${coord(inner, mid)}`,
    `A ${inner} ${inner} 0 0 0 ${coord(inner, from + innerInset)}`,
    `Q ${coord(inner, from)} ${coord(inner + corner, from)}`,
    `L ${coord(outer - corner, from)}`,
    `Q ${coord(outer, from)} ${coord(outer, from + outerInset)} Z`,
  ].join(" ");
}

/** Labels remain in bounded gutters; rotation balances their distribution. */
export function expensePieLayout(
  slices: ConsumptionCategory[],
  width: number,
  fontScale: number,
) {
  const inset = 4;
  const labelWidth = Math.min(88, width * 0.2);
  const labelHeight = Math.ceil(48 * Math.max(1, fontScale) + 8);
  const gap = 14;
  const outer = Math.max(0, (width - 2 * (inset + labelWidth + gap)) / 2);
  const inner = outer * 0.54;
  const angles = slices.map((slice, index) => {
    const start =
      -Math.PI / 2 +
      slices
        .slice(0, index)
        .reduce((sum, item) => sum + (item.share / 100) * TAU, 0);
    const end = start + (slice.share / 100) * TAU;
    return { slice, start, end, angle: (start + end) / 2 };
  });
  const rotation = balancedRotation(angles.map((arc) => arc.angle));
  const rotated = angles.map((arc) => ({
    ...arc,
    start: arc.start + rotation,
    end: arc.end + rotation,
    angle: arc.angle + rotation,
    right: Math.cos(arc.angle + rotation) >= 0,
  }));
  const maxColumn = Math.max(
    rotated.filter((arc) => arc.right).length,
    rotated.filter((arc) => !arc.right).length,
  );
  const height = Math.max(outer * 2 + 40, maxColumn * (labelHeight + 10) + 16);
  const centerX = width / 2;
  const centerY = height / 2;
  const point = (radius: number, angle: number) => ({
    x: centerX + radius * Math.cos(angle),
    y: centerY + radius * Math.sin(angle),
  });
  const arcs = rotated.map(({ slice, start, end, angle, right }) => ({
    slice,
    right,
    start,
    end,
    edge: point(outer + 2, angle),
    path: roundedSector(point, outer, inner, start, end, slices.length === 1),
  }));
  const labels = [false, true].flatMap((right) => {
    const side = arcs
      .filter((arc) => arc.right === right)
      .sort((a, b) => a.edge.y - b.edge.y);
    const span = Math.max(outer * 1.4, (side.length - 1) * (labelHeight + 10));
    return side.map((arc, index) => {
      const x = right ? width - inset - labelWidth : inset;
      const labelCenter =
        side.length === 1
          ? centerY
          : centerY - span / 2 + (span * index) / (side.length - 1);
      const y = labelCenter - labelHeight / 2;
      const kneeX = centerX + (right ? 1 : -1) * (outer + 6);
      const endX = right ? x - 3 : x + labelWidth + 3;
      return {
        ...arc,
        x,
        y,
        width: labelWidth,
        height: labelHeight,
        connectorPath: `M ${arc.edge.x} ${arc.edge.y} L ${kneeX} ${arc.edge.y} L ${endX} ${labelCenter}`,
      };
    });
  });
  return {
    width,
    height,
    centerX,
    centerY,
    outer,
    inner,
    arcs,
    labels,
    rotation,
  };
}
