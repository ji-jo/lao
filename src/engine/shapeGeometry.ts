import type { StrokePoint } from "@/model/types";
import type { ShapeToolId } from "@/state/tools";

export type ShapeBuildOpts = {
  /** Shift — square/circle aspect, or 45° snaps for line/arrow */
  constrain?: boolean;
  /** Alt — resize from center (Figma) */
  fromCenter?: boolean;
  /** Corner radius for rect (project px). */
  cornerRadius?: number;
  /** iOS-style continuous corners when true. */
  squircle?: boolean;
  /** Corner smoothing 0–1 (only when squircle). */
  cornerSmoothing?: number;
};

export function isClosedShape(kind: ShapeToolId): boolean {
  return kind === "rect" || kind === "diamond" || kind === "circle";
}

function pt(x: number, y: number, t: number): StrokePoint {
  return { x, y, pressure: 0.85, t };
}

function sampleSegment(
  x0: number,
  y0: number,
  x1: number,
  y1: number,
  t0: number,
  out: StrokePoint[],
  spacing = 4,
): number {
  const dist = Math.hypot(x1 - x0, y1 - y0);
  const steps = Math.max(1, Math.ceil(dist / spacing));
  for (let i = 1; i <= steps; i++) {
    const u = i / steps;
    out.push(pt(x0 + (x1 - x0) * u, y0 + (y1 - y0) * u, t0 + u));
  }
  return t0 + 1;
}

/** Re-stamp point `t` in ms along arc length for Animatron draw-on clips. */
function stampDrawOnTiming(
  points: StrokePoint[],
  durationMs: number,
): StrokePoint[] {
  if (points.length === 0) return points;
  if (points.length === 1) return [{ ...points[0]!, t: 0 }];
  const dist = [0];
  let total = 0;
  for (let i = 1; i < points.length; i++) {
    total += Math.hypot(
      points[i]!.x - points[i - 1]!.x,
      points[i]!.y - points[i - 1]!.y,
    );
    dist.push(total);
  }
  const dur = Math.max(80, durationMs);
  if (total < 1e-6) {
    return points.map((p, i) => ({
      ...p,
      t: i === 0 ? 0 : dur,
    }));
  }
  return points.map((p, i) => ({
    ...p,
    t: (dist[i]! / total) * dur,
  }));
}

/** Target draw-on duration from perimeter (px → ms). */
function shapeDrawDurationMs(points: StrokePoint[]): number {
  let total = 0;
  for (let i = 1; i < points.length; i++) {
    total += Math.hypot(
      points[i]!.x - points[i - 1]!.x,
      points[i]!.y - points[i - 1]!.y,
    );
  }
  // ~1.5 ms/px, clamp so tiny shapes still read as an animate clip.
  return Math.max(600, Math.min(4000, Math.round(total * 1.5)));
}

/** Snap line angle to 45° increments when Shift is held. */
export function constrainLineEnd(
  x0: number,
  y0: number,
  x1: number,
  y1: number,
): { x: number; y: number } {
  const dx = x1 - x0;
  const dy = y1 - y0;
  const len = Math.hypot(dx, dy);
  if (len < 1e-6) return { x: x1, y: y1 };
  const angle = Math.atan2(dy, dx);
  const snapped = Math.round(angle / (Math.PI / 4)) * (Math.PI / 4);
  return {
    x: x0 + Math.cos(snapped) * len,
    y: y0 + Math.sin(snapped) * len,
  };
}

/**
 * Resolve the rubber-band box from pointer start → current (Figma semantics).
 * Closed shapes use a bounding box; line/arrow use endpoints.
 */
export function resolveShapeFrame(
  kind: ShapeToolId,
  x0: number,
  y0: number,
  x1: number,
  y1: number,
  opts: ShapeBuildOpts = {},
): {
  x0: number;
  y0: number;
  x1: number;
  y1: number;
  /** axis-aligned box covering the shape (for closed kinds) */
  box: { x: number; y: number; w: number; h: number };
} {
  let ax = x0;
  let ay = y0;
  let bx = x1;
  let by = y1;

  if (!isClosedShape(kind)) {
    if (opts.constrain) {
      const snapped = constrainLineEnd(ax, ay, bx, by);
      bx = snapped.x;
      by = snapped.y;
    }
    if (opts.fromCenter) {
      ax = x0 - (bx - x0);
      ay = y0 - (by - y0);
    }
    const minX = Math.min(ax, bx);
    const minY = Math.min(ay, by);
    return {
      x0: ax,
      y0: ay,
      x1: bx,
      y1: by,
      box: {
        x: minX,
        y: minY,
        w: Math.abs(bx - ax),
        h: Math.abs(by - ay),
      },
    };
  }

  let dx = bx - ax;
  let dy = by - ay;

  if (opts.constrain) {
    const s = Math.max(Math.abs(dx), Math.abs(dy));
    dx = Math.sign(dx || 1) * s;
    dy = Math.sign(dy || 1) * s;
  }

  if (opts.fromCenter) {
    const halfW = dx;
    const halfH = dy;
    const x = ax - halfW;
    const y = ay - halfH;
    const w = Math.abs(halfW) * 2;
    const h = Math.abs(halfH) * 2;
    return {
      x0: ax,
      y0: ay,
      x1: ax + dx,
      y1: ay + dy,
      box: { x, y, w, h },
    };
  }

  const x = dx >= 0 ? ax : ax + dx;
  const y = dy >= 0 ? ay : ay + dy;
  return {
    x0: ax,
    y0: ay,
    x1: ax + dx,
    y1: ay + dy,
    box: { x, y, w: Math.abs(dx), h: Math.abs(dy) },
  };
}

function rectPoints(x: number, y: number, w: number, h: number): StrokePoint[] {
  const out: StrokePoint[] = [pt(x, y, 0)];
  let t = 0;
  t = sampleSegment(x, y, x + w, y, t, out);
  t = sampleSegment(x + w, y, x + w, y + h, t, out);
  t = sampleSegment(x + w, y + h, x, y + h, t, out);
  sampleSegment(x, y + h, x, y, t, out);
  return out;
}

/**
 * Sample a corner from (ax,ay)→(bx,by) around pivot (cx,cy).
 * `n=2` is a circular quarter; higher n → squircle / continuous corner.
 */
function sampleCorner(
  cx: number,
  cy: number,
  ax: number,
  ay: number,
  bx: number,
  by: number,
  n: number,
  t0: number,
  out: StrokePoint[],
  steps = 10,
): number {
  const rx = Math.hypot(ax - cx, ay - cy);
  const ry = Math.hypot(bx - cx, by - cy);
  if (rx < 1e-6 || ry < 1e-6) {
    out.push(pt(bx, by, t0 + 1));
    return t0 + 1;
  }
  const a0 = Math.atan2(ay - cy, ax - cx);
  let a1 = Math.atan2(by - cy, bx - cx);
  // Ensure we travel the short quarter (≤ π/2 + epsilon)
  let delta = a1 - a0;
  while (delta <= -Math.PI) delta += Math.PI * 2;
  while (delta > Math.PI) delta -= Math.PI * 2;
  for (let i = 1; i <= steps; i++) {
    const u = i / steps;
    const a = a0 + delta * u;
    // Superellipse blend in local corner space
    const ca = Math.cos(a - a0);
    const sa = Math.sin(a - a0);
    const px = Math.sign(ca) * Math.pow(Math.abs(ca), 2 / n) * rx;
    const py = Math.sign(sa) * Math.pow(Math.abs(sa), 2 / n) * ry;
    // Rotate local (px,py) from a0 basis into world
    const wx = cx + Math.cos(a0) * px - Math.sin(a0) * py;
    const wy = cy + Math.sin(a0) * px + Math.cos(a0) * py;
    out.push(pt(wx, wy, t0 + u));
  }
  return t0 + 1;
}

/** Rounded / squircle rect. `smoothing` 0 = circular corners, 1 = continuous. */
function roundedRectPoints(
  x: number,
  y: number,
  w: number,
  h: number,
  radius: number,
  smoothing = 0,
): StrokePoint[] {
  const r = Math.max(0, Math.min(radius, Math.min(w, h) / 2));
  if (r < 0.5) return rectPoints(x, y, w, h);
  const n = 2 + Math.max(0, Math.min(1, smoothing)) * 3;
  const x0 = x;
  const y0 = y;
  const x1 = x + w;
  const y1 = y + h;

  const out: StrokePoint[] = [pt(x0 + r, y0, 0)];
  let t = 0;
  // top edge
  t = sampleSegment(x0 + r, y0, x1 - r, y0, t, out);
  // top-right corner
  t = sampleCorner(x1 - r, y0 + r, x1 - r, y0, x1, y0 + r, n, t, out);
  // right edge
  t = sampleSegment(x1, y0 + r, x1, y1 - r, t, out);
  // bottom-right
  t = sampleCorner(x1 - r, y1 - r, x1, y1 - r, x1 - r, y1, n, t, out);
  // bottom
  t = sampleSegment(x1 - r, y1, x0 + r, y1, t, out);
  // bottom-left
  t = sampleCorner(x0 + r, y1 - r, x0 + r, y1, x0, y1 - r, n, t, out);
  // left
  t = sampleSegment(x0, y1 - r, x0, y0 + r, t, out);
  // top-left
  sampleCorner(x0 + r, y0 + r, x0, y0 + r, x0 + r, y0, n, t, out);
  return out;
}

function diamondPoints(x: number, y: number, w: number, h: number): StrokePoint[] {
  const cx = x + w / 2;
  const cy = y + h / 2;
  const top = { x: cx, y };
  const right = { x: x + w, y: cy };
  const bottom = { x: cx, y: y + h };
  const left = { x, y: cy };
  const out: StrokePoint[] = [pt(top.x, top.y, 0)];
  let t = 0;
  t = sampleSegment(top.x, top.y, right.x, right.y, t, out);
  t = sampleSegment(right.x, right.y, bottom.x, bottom.y, t, out);
  t = sampleSegment(bottom.x, bottom.y, left.x, left.y, t, out);
  sampleSegment(left.x, left.y, top.x, top.y, t, out);
  return out;
}

function ellipsePoints(x: number, y: number, w: number, h: number): StrokePoint[] {
  const cx = x + w / 2;
  const cy = y + h / 2;
  const rx = w / 2;
  const ry = h / 2;
  const peri = Math.PI * (3 * (rx + ry) - Math.sqrt((3 * rx + ry) * (rx + 3 * ry)));
  const n = Math.max(32, Math.ceil(peri / 4));
  const out: StrokePoint[] = [];
  for (let i = 0; i <= n; i++) {
    const a = (i / n) * Math.PI * 2;
    out.push(pt(cx + Math.cos(a) * rx, cy + Math.sin(a) * ry, i / n));
  }
  return out;
}

function linePoints(x0: number, y0: number, x1: number, y1: number): StrokePoint[] {
  const out: StrokePoint[] = [pt(x0, y0, 0)];
  sampleSegment(x0, y0, x1, y1, 0, out);
  return out;
}

/** Filled triangular arrow head (tip + two wings). Drawn by the canvas renderer. */
export function arrowHeadCorners(
  x0: number,
  y0: number,
  x1: number,
  y1: number,
  strokeSize = 4,
): Array<{ x: number; y: number }> | null {
  const dx = x1 - x0;
  const dy = y1 - y0;
  const len = Math.hypot(dx, dy);
  if (len < 1e-6) return null;

  const ux = dx / len;
  const uy = dy / len;
  const headLen = Math.min(
    Math.max(len * 0.22, Math.max(10, strokeSize * 2.2)),
    42,
  );
  const headWidth = headLen * 0.55;
  const baseX = x1 - ux * headLen;
  const baseY = y1 - uy * headLen;
  const px = -uy;
  const py = ux;
  return [
    { x: x1, y: y1 },
    { x: baseX + px * headWidth, y: baseY + py * headWidth },
    { x: baseX - px * headWidth, y: baseY - py * headWidth },
  ];
}

/** Shaft only — tip is (x1,y1); head is painted separately over the tip. */
function arrowPoints(x0: number, y0: number, x1: number, y1: number): StrokePoint[] {
  return linePoints(x0, y0, x1, y1);
}

/** True when progressive points have reached the arrow tip (draw-on complete enough). */
export function arrowTipReached(
  points: StrokePoint[],
  tipX: number,
  tipY: number,
  tol: number,
): boolean {
  const last = points[points.length - 1];
  if (!last) return false;
  return Math.hypot(last.x - tipX, last.y - tipY) <= tol;
}

/**
 * Build sampled stroke points for a shape rubber-band (preview === commit).
 * Point `t` is stamped in ms along the perimeter for Animatron draw-on.
 */
export function buildShapePoints(
  kind: ShapeToolId,
  startX: number,
  startY: number,
  endX: number,
  endY: number,
  opts: ShapeBuildOpts = {},
): { points: StrokePoint[]; closed: boolean } {
  const frame = resolveShapeFrame(kind, startX, startY, endX, endY, opts);
  const closed = isClosedShape(kind);

  let points: StrokePoint[];
  if (kind === "line") {
    points = linePoints(frame.x0, frame.y0, frame.x1, frame.y1);
  } else if (kind === "arrow") {
    points = arrowPoints(frame.x0, frame.y0, frame.x1, frame.y1);
  } else {
    const { x, y, w, h } = frame.box;
    if (w < 0.5 && h < 0.5) {
      points = [pt(x, y, 0)];
    } else if (kind === "rect") {
      const radius = opts.cornerRadius ?? 0;
      const smoothing = opts.squircle ? (opts.cornerSmoothing ?? 0.6) : 0;
      points = roundedRectPoints(x, y, w, h, radius, smoothing);
    } else if (kind === "diamond") {
      points = diamondPoints(x, y, w, h);
    } else {
      points = ellipsePoints(x, y, w, h);
    }
  }

  const timed = stampDrawOnTiming(points, shapeDrawDurationMs(points));
  return { points: timed, closed };
}

/** True when the drag is large enough to commit (avoids click-noise dots). */
export function shapeDragSignificant(
  startX: number,
  startY: number,
  endX: number,
  endY: number,
  minPx = 3,
): boolean {
  return Math.hypot(endX - startX, endY - startY) >= minPx;
}

export type ShapeBox = {
  x: number;
  y: number;
  w: number;
  h: number;
  rotation?: number;
};

export type ShapeBakeResult = {
  points: StrokePoint[];
  shapeBox: ShapeBox;
};

function rotatePointsAround(
  points: StrokePoint[],
  cx: number,
  cy: number,
  rotationRad: number,
): StrokePoint[] {
  if (!rotationRad) return points;
  const cos = Math.cos(rotationRad);
  const sin = Math.sin(rotationRad);
  return points.map((p) => {
    const x = p.x - cx;
    const y = p.y - cy;
    return {
      ...p,
      x: cx + x * cos - y * sin,
      y: cy + x * sin + y * cos,
    };
  });
}

/** Pure geometry bake for Leafer shape commits (no Leafer runtime). */
export function bakeShapeGeometry(
  kind: ShapeToolId,
  geo: {
    x: number;
    y: number;
    w: number;
    h: number;
    rotationDeg?: number;
    dx?: number;
    dy?: number;
    cornerRadius?: number;
    squircle?: boolean;
    cornerSmoothing?: number;
  },
): ShapeBakeResult {
  const rot = ((geo.rotationDeg ?? 0) * Math.PI) / 180;

  if (kind === "line" || kind === "arrow") {
    let x0 = geo.x;
    let y0 = geo.y;
    let dx = geo.dx ?? geo.w;
    let dy = geo.dy ?? geo.h;
    let x1 = x0 + dx;
    let y1 = y0 + dy;
    if (rot) {
      const cx = (x0 + x1) / 2;
      const cy = (y0 + y1) / 2;
      const cos = Math.cos(rot);
      const sin = Math.sin(rot);
      const r0x = cx + (x0 - cx) * cos - (y0 - cy) * sin;
      const r0y = cy + (x0 - cx) * sin + (y0 - cy) * cos;
      const r1x = cx + (x1 - cx) * cos - (y1 - cy) * sin;
      const r1y = cy + (x1 - cx) * sin + (y1 - cy) * cos;
      x0 = r0x;
      y0 = r0y;
      x1 = r1x;
      y1 = r1y;
      dx = x1 - x0;
      dy = y1 - y0;
    }
    return {
      points: buildShapePoints(kind, x0, y0, x1, y1).points,
      shapeBox: { x: x0, y: y0, w: dx, h: dy, rotation: 0 },
    };
  }

  const x = geo.x;
  const y = geo.y;
  const w = Math.max(1, geo.w);
  const h = Math.max(1, geo.h);
  const { points: local } = buildShapePoints(kind, x, y, x + w, y + h, {
    cornerRadius: geo.cornerRadius,
    squircle: geo.squircle,
    cornerSmoothing: geo.cornerSmoothing,
  });
  const cx = x + w / 2;
  const cy = y + h / 2;
  return {
    points: rotatePointsAround(local, cx, cy, rot),
    shapeBox: { x, y, w, h, rotation: rot || undefined },
  };
}

/** Rebuild rect stroke points from shapeBox + corner settings (for dock edits). */
export function rebuildRectPointsFromStroke(stroke: {
  shapeBox?: { x: number; y: number; w: number; h: number; rotation?: number };
  cornerRadius?: number;
  squircle?: boolean;
  cornerSmoothing?: number;
}): StrokePoint[] | null {
  const box = stroke.shapeBox;
  if (!box || box.w < 0.5 || box.h < 0.5) return null;
  // shapeBox.rotation is stored in radians.
  const baked = bakeShapeGeometry("rect", {
    x: box.x,
    y: box.y,
    w: box.w,
    h: box.h,
    rotationDeg: ((box.rotation ?? 0) * 180) / Math.PI,
    cornerRadius: stroke.cornerRadius ?? 0,
    squircle: stroke.squircle,
    cornerSmoothing: stroke.cornerSmoothing,
  });
  return baked.points;
}
