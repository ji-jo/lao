import type { BezierNode, StrokePoint } from "@/model/types";
import { fillGapThreshold, isNearClosedLoop } from "@/engine/pathEdit";
import { retimeStrokePoints } from "@/engine/strokeProgress";

type XY = { x: number; y: number };

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
export function flattenBezierNodes(
  nodes: BezierNode[],
  closed?: boolean,
  durationMs?: number,
): StrokePoint[] {
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

  return retimeStrokePoints(points, durationMs);
}

function perpendicularDistance(point: XY, lineStart: XY, lineEnd: XY): number {
  const dx = lineEnd.x - lineStart.x;
  const dy = lineEnd.y - lineStart.y;
  const lenSq = dx * dx + dy * dy;
  if (lenSq === 0) return Math.hypot(point.x - lineStart.x, point.y - lineStart.y);
  const t = Math.max(
    0,
    Math.min(1, ((point.x - lineStart.x) * dx + (point.y - lineStart.y) * dy) / lenSq),
  );
  const px = lineStart.x + t * dx;
  const py = lineStart.y + t * dy;
  return Math.hypot(point.x - px, point.y - py);
}

/** Ramer–Douglas–Peucker polyline simplification (project px tolerance). */
export function simplifyPolyline(points: XY[], tolerance: number): XY[] {
  if (points.length <= 2) return points.map((p) => ({ ...p }));

  let maxDist = 0;
  let index = 0;
  const end = points.length - 1;
  for (let i = 1; i < end; i++) {
    const d = perpendicularDistance(points[i], points[0], points[end]);
    if (d > maxDist) {
      maxDist = d;
      index = i;
    }
  }

  if (maxDist > tolerance) {
    const left = simplifyPolyline(points.slice(0, index + 1), tolerance);
    const right = simplifyPolyline(points.slice(index), tolerance);
    return [...left.slice(0, -1), ...right];
  }
  return [{ ...points[0] }, { ...points[end] }];
}

function tangentAt(pts: XY[], i: number, closed: boolean): XY {
  const n = pts.length;
  const prev = closed ? pts[(i - 1 + n) % n] : pts[Math.max(0, i - 1)];
  const next = closed ? pts[(i + 1) % n] : pts[Math.min(n - 1, i + 1)];
  const dx = next.x - prev.x;
  const dy = next.y - prev.y;
  const len = Math.hypot(dx, dy) || 1;
  return { x: dx / len, y: dy / len };
}

/**
 * Fit a sparse cubic-bezier path through a dense freehand polyline so the Path
 * tool can edit brush strokes like Illustrator / Figma vector paths.
 */
export function pointsToBezierNodes(
  points: StrokePoint[],
  opts?: { closed?: boolean; tolerance?: number; strokeSize?: number },
): { nodes: BezierNode[]; closed: boolean } {
  if (points.length === 0) return { nodes: [], closed: false };
  if (points.length === 1) {
    return { nodes: [{ x: points[0].x, y: points[0].y }], closed: false };
  }

  const size = opts?.strokeSize ?? 8;
  const gap = fillGapThreshold(size);
  let closed = opts?.closed ?? isNearClosedLoop(points, gap);

  let work: XY[] = points.map((p) => ({ x: p.x, y: p.y }));
  if (closed && work.length > 2) {
    const first = work[0]!;
    const last = work[work.length - 1]!;
    if (Math.hypot(first.x - last.x, first.y - last.y) <= gap) {
      work = work.slice(0, -1);
    }
  }

  let tolerance = opts?.tolerance ?? Math.max(3, size * 0.35);
  let simplified = simplifyPolyline(work, tolerance);
  while (simplified.length > 72 && tolerance < size * 4) {
    tolerance *= 1.45;
    simplified = simplifyPolyline(work, tolerance);
  }

  const n = simplified.length;
  if (n === 0) return { nodes: [], closed: false };
  if (n === 1) return { nodes: [{ x: simplified[0].x, y: simplified[0].y }], closed };

  const alpha = 0.34;
  const nodes: BezierNode[] = [];

  for (let i = 0; i < n; i++) {
    const pt = simplified[i]!;
    const tang = tangentAt(simplified, i, closed);
    const prevIdx = closed ? (i - 1 + n) % n : i - 1;
    const nextIdx = closed ? (i + 1) % n : i + 1;

    let handleIn: XY | undefined;
    let handleOut: XY | undefined;

    if (!closed && i === 0) {
      const next = simplified[nextIdx]!;
      const d = Math.hypot(next.x - pt.x, next.y - pt.y);
      handleOut = { x: pt.x + tang.x * d * alpha, y: pt.y + tang.y * d * alpha };
    } else if (!closed && i === n - 1) {
      const prev = simplified[prevIdx]!;
      const d = Math.hypot(pt.x - prev.x, pt.y - prev.y);
      handleIn = { x: pt.x - tang.x * d * alpha, y: pt.y - tang.y * d * alpha };
    } else {
      const prev = simplified[prevIdx]!;
      const next = simplified[nextIdx]!;
      const dPrev = Math.hypot(pt.x - prev.x, pt.y - prev.y);
      const dNext = Math.hypot(next.x - pt.x, next.y - pt.y);
      handleIn = { x: pt.x - tang.x * dPrev * alpha, y: pt.y - tang.y * dPrev * alpha };
      handleOut = { x: pt.x + tang.x * dNext * alpha, y: pt.y + tang.y * dNext * alpha };
    }

    nodes.push({
      x: pt.x,
      y: pt.y,
      handleIn,
      handleOut,
    });
  }

  return { nodes, closed };
}

/** Toggle a bezier anchor between corner (no handles) and smooth (symmetric tangents). */
export function toggleBezierNodeCorner(nodes: BezierNode[], index: number, closed = false): BezierNode[] {
  const out = nodes.map((n) => ({
    ...n,
    handleIn: n.handleIn ? { ...n.handleIn } : undefined,
    handleOut: n.handleOut ? { ...n.handleOut } : undefined,
  }));
  const node = out[index];
  if (!node) return out;

  const hasHandles = node.handleIn || node.handleOut;
  if (hasHandles) {
    node.handleIn = undefined;
    node.handleOut = undefined;
    return out;
  }

  const pts = out.map((n) => ({ x: n.x, y: n.y }));
  const tang = tangentAt(pts, index, closed);
  const n = pts.length;
  const prevIdx = closed ? (index - 1 + n) % n : Math.max(0, index - 1);
  const nextIdx = closed ? (index + 1) % n : Math.min(n - 1, index + 1);
  const prev = pts[prevIdx]!;
  const next = pts[nextIdx]!;
  const dPrev = Math.hypot(node.x - prev.x, node.y - prev.y);
  const dNext = Math.hypot(next.x - node.x, next.y - node.y);
  const alpha = 0.34;
  if (!closed && index > 0) {
    node.handleIn = {
      x: node.x - tang.x * dPrev * alpha,
      y: node.y - tang.y * dPrev * alpha,
    };
  } else if (closed) {
    node.handleIn = {
      x: node.x - tang.x * dPrev * alpha,
      y: node.y - tang.y * dPrev * alpha,
    };
  }
  if (!closed && index < n - 1) {
    node.handleOut = {
      x: node.x + tang.x * dNext * alpha,
      y: node.y + tang.y * dNext * alpha,
    };
  } else if (closed) {
    node.handleOut = {
      x: node.x + tang.x * dNext * alpha,
      y: node.y + tang.y * dNext * alpha,
    };
  }
  return out;
}
