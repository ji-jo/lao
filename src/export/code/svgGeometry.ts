import type { BezierNode, Stroke, StrokePoint } from "@/model/types";
import { flattenBezierNodes } from "@/lib/bezier";
import { packBrushOutline, type RenderQuality } from "@/engine/brushStyles";

const COORD_PRECISION = 1;
const RDP_EPSILON = 0.85;

export function roundCoord(n: number): number {
  return Math.round(n * 10 ** COORD_PRECISION) / 10 ** COORD_PRECISION;
}

export function fmtCoord(n: number): string {
  const r = roundCoord(n);
  if (Object.is(r, -0)) return "0";
  return String(r);
}

function fmt(n: number): string {
  return fmtCoord(n);
}

function distPointToSeg(
  px: number,
  py: number,
  ax: number,
  ay: number,
  bx: number,
  by: number,
): number {
  const dx = bx - ax;
  const dy = by - ay;
  const len2 = dx * dx + dy * dy;
  if (len2 < 1e-12) {
    const ex = px - ax;
    const ey = py - ay;
    return Math.hypot(ex, ey);
  }
  let t = ((px - ax) * dx + (py - ay) * dy) / len2;
  t = Math.max(0, Math.min(1, t));
  return Math.hypot(px - (ax + t * dx), py - (ay + t * dy));
}

/** Ramer–Douglas–Peucker — drops colinear outline samples. */
export function simplifyPolyline(
  points: Array<[number, number]>,
  epsilon = RDP_EPSILON,
): Array<[number, number]> {
  if (points.length < 3) return points.slice();
  const stack: Array<[number, number]> = [[0, points.length - 1]];
  const keep = new Uint8Array(points.length);
  keep[0] = 1;
  keep[points.length - 1] = 1;
  while (stack.length) {
    const [start, end] = stack.pop()!;
    const a = points[start]!;
    const b = points[end]!;
    let maxD = 0;
    let maxI = start;
    for (let i = start + 1; i < end; i++) {
      const p = points[i]!;
      const d = distPointToSeg(p[0], p[1], a[0], a[1], b[0], b[1]);
      if (d > maxD) {
        maxD = d;
        maxI = i;
      }
    }
    if (maxD > epsilon) {
      keep[maxI] = 1;
      if (maxI - start > 1) stack.push([start, maxI]);
      if (end - maxI > 1) stack.push([maxI, end]);
    }
  }
  const out: Array<[number, number]> = [];
  for (let i = 0; i < points.length; i++) {
    if (keep[i]) out.push(points[i]!);
  }
  return out;
}

function pair(dx: number, dy: number): string {
  const y = fmt(dy);
  return `${fmt(dx)}${y.startsWith("-") ? y : ` ${y}`}`;
}

/** Compact relative path (`M` + implicit `l` pairs). */
export function compactPolylinePathD(
  points: Array<[number, number]>,
  close = false,
): string {
  if (points.length === 0) return "";
  const pts = simplifyPolyline(points);
  const x0 = pts[0]![0];
  const y0 = pts[0]![1];
  let d = `M${fmt(x0)} ${fmt(y0)}`;
  if (pts.length === 1) {
    return close ? `${d}Z` : d;
  }
  d += "l";
  let px = x0;
  let py = y0;
  for (let i = 1; i < pts.length; i++) {
    const x = pts[i]![0];
    const y = pts[i]![1];
    if (i > 1) d += " ";
    d += pair(x - px, y - py);
    px = x;
    py = y;
  }
  if (close) d += "Z";
  return d;
}

/** Compact cubic path from bezier nodes (1 decimal, relative `c`). */
export function compactBezierPathD(nodes: BezierNode[], closed?: boolean): string {
  if (nodes.length === 0) return "";
  const x0 = nodes[0]!.x;
  const y0 = nodes[0]!.y;
  let d = `M${fmt(x0)} ${fmt(y0)}`;
  let px = x0;
  let py = y0;
  const segs = closed && nodes.length > 1 ? nodes.length : nodes.length - 1;
  for (let i = 0; i < segs; i++) {
    const a = nodes[i]!;
    const b = nodes[(i + 1) % nodes.length]!;
    const p1 = a.handleOut ?? { x: a.x, y: a.y };
    const p2 = b.handleIn ?? { x: b.x, y: b.y };
    const p3 = b;
    if (i === 0) d += "c";
    else d += " ";
    d += `${pair(p1.x - px, p1.y - py)} ${pair(p2.x - px, p2.y - py)} ${pair(p3.x - px, p3.y - py)}`;
    px = p3.x;
    py = p3.y;
  }
  if (closed && nodes.length > 1) d += "Z";
  return d;
}

/** Match renderer freehandOptions for export parity. */
export function freehandOptions(stroke: Stroke, quality: RenderQuality = "full") {
  const base = {
    size: stroke.size,
    simulatePressure: false,
    last: true,
  };
  switch (stroke.brush) {
    case "ink":
      return {
        ...base,
        thinning: 0.65,
        smoothing: 0.5,
        streamline: quality === "draft" ? 0.3 : 0.5,
      };
    case "pen":
      return {
        ...base,
        size: Math.max(stroke.size * 0.5, 1),
        thinning: 0.3,
        smoothing: 0.4,
        streamline: 0.3,
      };
    case "marker":
      return {
        ...base,
        size: stroke.size * 2,
        thinning: 0.1,
        smoothing: 0.6,
        streamline: 0.5,
      };
    case "eraser":
      return {
        ...base,
        size: stroke.size * 2.5,
        thinning: 0.1,
        smoothing: 0.5,
        streamline: 0.4,
      };
  }
}

export function polylineToPathD(points: Array<[number, number]>, close = false): string {
  return compactPolylinePathD(points, close);
}

export function bezierNodesToPathD(nodes: BezierNode[], closed?: boolean): string {
  return compactBezierPathD(nodes, closed);
}

/** Closed ribbon / nib outline — same envelope the canvas pack brush paints. */
export function strokeOutlinePathD(
  stroke: Stroke,
  points: StrokePoint[],
  quality: RenderQuality = "full",
): string {
  if (points.length === 0) return "";
  const outline = packBrushOutline(stroke, points, quality);
  if (outline.length < 2) return "";
  return polylineToPathD(outline, true);
}

/** Open centerline for draw-on mask animation. */
export function strokeCenterlinePathD(points: StrokePoint[]): string {
  if (points.length === 0) return "";
  return compactPolylinePathD(points.map((p) => [p.x, p.y]));
}

export function strokeToPathD(
  stroke: Stroke,
  points: StrokePoint[],
  nodes?: BezierNode[] | null,
  quality: RenderQuality = "full",
): string {
  const bez = nodes ?? stroke.bezierNodes;
  const geometricPen = stroke.brush === "pen" && !stroke.p5Brush;
  if (bez && bez.length > 0 && geometricPen) {
    return bezierNodesToPathD(bez, stroke.closed);
  }
  const ribbonPts =
    points.length > 1
      ? points
      : bez && bez.length > 0
        ? flattenBezierNodes(bez, stroke.closed, undefined, stroke.points)
        : points;
  return strokeOutlinePathD(stroke, ribbonPts, quality);
}
