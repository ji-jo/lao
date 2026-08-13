import type { BezierNode, StrokePoint } from "@/model/types";

/**
 * Path-editing math for the select tool: warp handles let a duplicated frame's
 * strokes be nudged with precision instead of redrawn — the stop-motion loop.
 */

/** screen-pixel radius for grabbing a handle */
export const HANDLE_HIT_PX = 9;

/** spacing (in points) between editable handles along a stroke */
const HANDLE_STEP = 10;

/** indices of the draggable handles for a stroke of n points */
export function handleIndices(n: number): number[] {
  if (n === 0) return [];
  if (n === 1) return [0];
  const out: number[] = [];
  for (let i = 0; i < n - 1; i += HANDLE_STEP) out.push(i);
  out.push(n - 1);
  return out;
}

function smoothstep(u: number): number {
  return u * u * (3 - 2 * u);
}

/**
 * Move the point at handleIndex by (dx, dy); neighbors follow with a smooth
 * falloff so the line bends organically instead of kinking.
 */
export function warpPoints(
  points: StrokePoint[],
  handleIndex: number,
  dx: number,
  dy: number,
): StrokePoint[] {
  const n = points.length;
  const range = Math.max(6, Math.round(n / 5));
  return points.map((p, i) => {
    const d = Math.abs(i - handleIndex);
    if (d >= range) return p;
    const w = smoothstep(1 - d / range);
    return { ...p, x: p.x + dx * w, y: p.y + dy * w };
  });
}

/** Translate every point by (dx, dy). */
export function translatePoints(
  points: StrokePoint[],
  dx: number,
  dy: number,
): StrokePoint[] {
  if (dx === 0 && dy === 0) return points;
  return points.map((p) => ({ ...p, x: p.x + dx, y: p.y + dy }));
}

/** Scale + rotate every point around a pivot (project space). */
export function transformPoints(
  points: StrokePoint[],
  pivotX: number,
  pivotY: number,
  scale: number,
  rotationRad: number,
): StrokePoint[] {
  if (scale === 1 && rotationRad === 0) return points;
  const cos = Math.cos(rotationRad);
  const sin = Math.sin(rotationRad);
  return points.map((p) => {
    let x = (p.x - pivotX) * scale;
    let y = (p.y - pivotY) * scale;
    const rx = x * cos - y * sin;
    const ry = x * sin + y * cos;
    return { ...p, x: rx + pivotX, y: ry + pivotY };
  });
}

function mapAbsPoint(
  x: number,
  y: number,
  pivotX: number,
  pivotY: number,
  scale: number,
  cos: number,
  sin: number,
): { x: number; y: number } {
  let dx = (x - pivotX) * scale;
  let dy = (y - pivotY) * scale;
  return {
    x: dx * cos - dy * sin + pivotX,
    y: dx * sin + dy * cos + pivotY,
  };
}

/** Translate pen/vector bezier nodes (anchors + absolute handles). */
export function translateBezierNodes(
  nodes: BezierNode[],
  dx: number,
  dy: number,
): BezierNode[] {
  if (dx === 0 && dy === 0) return nodes;
  return nodes.map((n) => ({
    x: n.x + dx,
    y: n.y + dy,
    handleIn: n.handleIn
      ? { x: n.handleIn.x + dx, y: n.handleIn.y + dy }
      : undefined,
    handleOut: n.handleOut
      ? { x: n.handleOut.x + dx, y: n.handleOut.y + dy }
      : undefined,
  }));
}

/** Scale + rotate bezier nodes around a pivot (anchors + absolute handles). */
export function transformBezierNodes(
  nodes: BezierNode[],
  pivotX: number,
  pivotY: number,
  scale: number,
  rotationRad: number,
): BezierNode[] {
  if (scale === 1 && rotationRad === 0) return nodes;
  const cos = Math.cos(rotationRad);
  const sin = Math.sin(rotationRad);
  return nodes.map((n) => {
    const a = mapAbsPoint(n.x, n.y, pivotX, pivotY, scale, cos, sin);
    return {
      x: a.x,
      y: a.y,
      handleIn: n.handleIn
        ? mapAbsPoint(
            n.handleIn.x,
            n.handleIn.y,
            pivotX,
            pivotY,
            scale,
            cos,
            sin,
          )
        : undefined,
      handleOut: n.handleOut
        ? mapAbsPoint(
            n.handleOut.x,
            n.handleOut.y,
            pivotX,
            pivotY,
            scale,
            cos,
            sin,
          )
        : undefined,
    };
  });
}

export function boundsCenter(bounds: {
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
}): { x: number; y: number } {
  return {
    x: (bounds.minX + bounds.maxX) / 2,
    y: (bounds.minY + bounds.maxY) / 2,
  };
}

/** Axis-aligned bbox of points in project space; null if empty. */
export function pointsBounds(
  points: StrokePoint[],
): { minX: number; minY: number; maxX: number; maxY: number } | null {
  if (!points.length) return null;
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (const p of points) {
    if (!Number.isFinite(p.x) || !Number.isFinite(p.y)) continue;
    if (p.x < minX) minX = p.x;
    if (p.y < minY) minY = p.y;
    if (p.x > maxX) maxX = p.x;
    if (p.y > maxY) maxY = p.y;
  }
  if (!Number.isFinite(minX)) return null;
  return { minX, minY, maxX, maxY };
}

/** Shift+draw: replace the freehand path with an interpolated straight line. */
export function straightLinePoints(from: StrokePoint, to: StrokePoint): StrokePoint[] {
  const STEPS = 24;
  const out: StrokePoint[] = [];
  for (let i = 0; i <= STEPS; i++) {
    const u = i / STEPS;
    out.push({
      x: from.x + (to.x - from.x) * u,
      y: from.y + (to.y - from.y) * u,
      pressure: from.pressure + (to.pressure - from.pressure) * u,
      t: from.t + (to.t - from.t) * u,
    });
  }
  return out;
}

/** distance from a point to the nearest sample of a stroke's polyline */
export function distanceToPoints(points: StrokePoint[], x: number, y: number): number {
  let best = Infinity;
  for (const p of points) {
    const d = Math.hypot(p.x - x, p.y - y);
    if (d < best) best = d;
  }
  return best;
}

/** True when the first and last samples are close enough to read as a closed loop. */
export function isNearClosedLoop(
  points: Array<{ x: number; y: number }>,
  gapThreshold: number,
): boolean {
  if (points.length < 3) return false;
  const first = points[0]!;
  const last = points[points.length - 1]!;
  return Math.hypot(first.x - last.x, first.y - last.y) <= gapThreshold;
}

/** Gap (project px) within which a freehand loop counts as enclosed for bucket fill. */
export function fillGapThreshold(strokeSize: number): number {
  return Math.max(strokeSize, 16);
}

/** Shift edge — expand fill boundary outward toward ink (project px). */
export function fillShiftEdgeDistance(strokeSize: number): number {
  return strokeSize * 0.52;
}

/** Feather — reach into soft / anti-aliased ink pixels (project px). */
export function fillFeatherDistance(strokeSize: number): number {
  return Math.max(1.5, strokeSize * 0.24);
}

/** Combined polygon expansion for vector fill under ink ribbon. */
export function fillPolygonExpandDistance(strokeSize: number): number {
  return fillShiftEdgeDistance(strokeSize) + fillFeatherDistance(strokeSize) * 0.4;
}

/** Insert samples across a small start/end gap so ink + bucket see a closed loop. */
export function bridgeNearClosedPoints(
  points: StrokePoint[],
  gapThreshold: number,
): StrokePoint[] {
  if (points.length < 3) return points;
  const first = points[0]!;
  const last = points[points.length - 1]!;
  const gap = Math.hypot(first.x - last.x, first.y - last.y);
  if (gap <= 1) {
    const out = points.slice();
    out[out.length - 1] = { ...last, x: first.x, y: first.y };
    return out;
  }
  if (gap > gapThreshold) return points;
  const steps = Math.max(2, Math.min(12, Math.ceil(gap / 3)));
  const bridged = points.slice();
  for (let i = 1; i <= steps; i++) {
    const t = i / (steps + 1);
    bridged.push({
      ...last,
      x: last.x + (first.x - last.x) * t,
      y: last.y + (first.y - last.y) * t,
      t: last.t + i * 0.001,
    });
  }
  return bridged;
}

/** Expand a closed polygon outward so interior fills reach ink ribbon edges. */
export function expandPolygonOutward(
  points: StrokePoint[],
  distance: number,
): StrokePoint[] {
  const n = points.length;
  if (n < 3 || distance <= 0) return points;
  const winding = polygonSignedArea(points) >= 0 ? 1 : -1;
  const out: StrokePoint[] = [];
  for (let i = 0; i < n; i++) {
    const prev = points[(i - 1 + n) % n]!;
    const curr = points[i]!;
    const next = points[(i + 1) % n]!;
    const ax = curr.x - prev.x;
    const ay = curr.y - prev.y;
    const bx = next.x - curr.x;
    const by = next.y - curr.y;
    const al = Math.hypot(ax, ay) || 1;
    const bl = Math.hypot(bx, by) || 1;
    let nx = -ay / al - by / bl;
    let ny = ax / al + bx / bl;
    const nl = Math.hypot(nx, ny) || 1;
    nx = (nx / nl) * distance * winding;
    ny = (ny / nl) * distance * winding;
    out.push({ ...curr, x: curr.x + nx, y: curr.y + ny });
  }
  return out;
}

function polygonSignedArea(points: StrokePoint[]): number {
  let a = 0;
  for (let i = 0, j = points.length - 1; i < points.length; j = i++) {
    a += points[j].x * points[i].y - points[i].x * points[j].y;
  }
  return a * 0.5;
}

/** Ray-cast point-in-polygon (for closed shape fill hits). */
export function pointInPolygon(
  points: Array<{ x: number; y: number }>,
  x: number,
  y: number,
): boolean {
  if (points.length < 3) return false;
  let inside = false;
  for (let i = 0, j = points.length - 1; i < points.length; j = i++) {
    const xi = points[i].x;
    const yi = points[i].y;
    const xj = points[j].x;
    const yj = points[j].y;
    if ((yi > y) !== (yj > y) && x < ((xj - xi) * (y - yi)) / (yj - yi + 0) + xi) {
      inside = !inside;
    }
  }
  return inside;
}

/** Edge proximity and closed-fill interior hit for select / hover. */
export function hitsStroke(
  points: StrokePoint[],
  x: number,
  y: number,
  threshold: number,
  closed?: boolean,
): boolean {
  if (!points.length) return false;
  if (distanceToPoints(points, x, y) <= threshold) return true;
  if (closed && pointInPolygon(points, x, y)) return true;
  return false;
}
