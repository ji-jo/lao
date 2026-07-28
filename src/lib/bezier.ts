import type { BezierNode, StrokePoint } from "@/model/types";

/**
 * Evaluate a cubic bezier curve at parameter t (0..1)
 */
function evaluateCubicBezier(
  p0: { x: number; y: number },
  p1: { x: number; y: number },
  p2: { x: number; y: number },
  p3: { x: number; y: number },
  t: number
): { x: number; y: number } {
  const u = 1 - t;
  const tt = t * t;
  const uu = u * u;
  const uuu = uu * u;
  const ttt = tt * t;

  let x = uuu * p0.x;
  x += 3 * uu * t * p1.x;
  x += 3 * u * tt * p2.x;
  x += ttt * p3.x;

  let y = uuu * p0.y;
  y += 3 * uu * t * p1.y;
  y += 3 * u * tt * p2.y;
  y += ttt * p3.y;

  return { x, y };
}

export function splitCubicBezier(
  p0: { x: number; y: number },
  p1: { x: number; y: number },
  p2: { x: number; y: number },
  p3: { x: number; y: number },
  t: number
): [
  { p0: { x: number; y: number }, p1: { x: number; y: number }, p2: { x: number; y: number }, p3: { x: number; y: number } },
  { p0: { x: number; y: number }, p1: { x: number; y: number }, p2: { x: number; y: number }, p3: { x: number; y: number } }
] {
  const p01 = { x: p0.x + (p1.x - p0.x) * t, y: p0.y + (p1.y - p0.y) * t };
  const p12 = { x: p1.x + (p2.x - p1.x) * t, y: p1.y + (p2.y - p1.y) * t };
  const p23 = { x: p2.x + (p3.x - p2.x) * t, y: p2.y + (p3.y - p2.y) * t };

  const p012 = { x: p01.x + (p12.x - p01.x) * t, y: p01.y + (p12.y - p01.y) * t };
  const p123 = { x: p12.x + (p23.x - p12.x) * t, y: p12.y + (p23.y - p12.y) * t };

  const p0123 = { x: p012.x + (p123.x - p012.x) * t, y: p012.y + (p123.y - p012.y) * t };

  return [
    { p0, p1: p01, p2: p012, p3: p0123 },
    { p0: p0123, p1: p123, p2: p23, p3 }
  ];
}

export function projectToCubicBezier(
  p: { x: number; y: number },
  p0: { x: number; y: number },
  p1: { x: number; y: number },
  p2: { x: number; y: number },
  p3: { x: number; y: number }
): { t: number; dist: number } {
  let minDt = Infinity;
  let bestT = 0;
  for (let step = 0; step <= 20; step++) {
    const t = step / 20;
    const pt = evaluateCubicBezier(p0, p1, p2, p3, t);
    const d = Math.hypot(pt.x - p.x, pt.y - p.y);
    if (d < minDt) {
      minDt = d;
      bestT = t;
    }
  }
  const t0 = Math.max(0, bestT - 0.05);
  const t1 = Math.min(1, bestT + 0.05);
  for (let step = 0; step <= 20; step++) {
    const t = t0 + (t1 - t0) * (step / 20);
    const pt = evaluateCubicBezier(p0, p1, p2, p3, t);
    const d = Math.hypot(pt.x - p.x, pt.y - p.y);
    if (d < minDt) {
      minDt = d;
      bestT = t;
    }
  }
  return { t: bestT, dist: minDt };
}

/**
 * Flattens a list of BezierNodes into a dense array of StrokePoints.
 * This is used for hit-testing and bounding boxes.
 */
export function flattenBezierNodes(nodes: BezierNode[], closed?: boolean): StrokePoint[] {
  if (nodes.length === 0) return [];
  if (nodes.length === 1) return [{ x: nodes[0].x, y: nodes[0].y, pressure: 1, t: 0 }];

  const points: StrokePoint[] = [];
  const resolution = 10; // Number of segments per bezier curve

  for (let i = 0; i < nodes.length - 1; i++) {
    const nodeA = nodes[i];
    const nodeB = nodes[i + 1];

    const p0 = { x: nodeA.x, y: nodeA.y };
    const p1 = nodeA.handleOut ?? p0;
    const p2 = nodeB.handleIn ?? { x: nodeB.x, y: nodeB.y };
    const p3 = { x: nodeB.x, y: nodeB.y };

    for (let step = 0; step < resolution; step++) {
      const t = step / resolution;
      const pt = evaluateCubicBezier(p0, p1, p2, p3, t);
      points.push({ x: pt.x, y: pt.y, pressure: 1, t: 0 });
    }
  }

  if (closed && nodes.length > 1) {
    const nodeA = nodes[nodes.length - 1];
    const nodeB = nodes[0];
    const p0 = { x: nodeA.x, y: nodeA.y };
    const p1 = nodeA.handleOut ?? p0;
    const p2 = nodeB.handleIn ?? { x: nodeB.x, y: nodeB.y };
    const p3 = { x: nodeB.x, y: nodeB.y };

    for (let step = 0; step < resolution; step++) {
      const t = step / resolution;
      const pt = evaluateCubicBezier(p0, p1, p2, p3, t);
      points.push({ x: pt.x, y: pt.y, pressure: 1, t: 0 });
    }
  }

  // Add the final point
  const last = closed ? nodes[0] : nodes[nodes.length - 1];
  points.push({ x: last.x, y: last.y, pressure: 1, t: 0 });

  return points;
}
