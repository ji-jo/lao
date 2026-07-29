import type { StrokePoint } from "@/model/types";
import type { ShapeToolId } from "@/state/tools";

export type ShapeBuildOpts = {
  /** Shift — square/circle aspect, or 45° snaps for line/arrow */
  constrain?: boolean;
  /** Alt — resize from center (Figma) */
  fromCenter?: boolean;
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

function arrowPoints(x0: number, y0: number, x1: number, y1: number): StrokePoint[] {
  const dx = x1 - x0;
  const dy = y1 - y0;
  const len = Math.hypot(dx, dy);
  if (len < 1e-6) return [pt(x0, y0, 0)];

  const ux = dx / len;
  const uy = dy / len;
  const headLen = Math.min(Math.max(len * 0.22, 10), 36);
  const headWidth = headLen * 0.55;
  const baseX = x1 - ux * headLen;
  const baseY = y1 - uy * headLen;
  const px = -uy;
  const py = ux;

  const out: StrokePoint[] = [pt(x0, y0, 0)];
  let t = sampleSegment(x0, y0, baseX, baseY, 0, out);
  // arrowhead outline: base-left → tip → base-right → base (closed head)
  const leftX = baseX + px * headWidth;
  const leftY = baseY + py * headWidth;
  const rightX = baseX - px * headWidth;
  const rightY = baseY - py * headWidth;
  t = sampleSegment(baseX, baseY, leftX, leftY, t, out);
  t = sampleSegment(leftX, leftY, x1, y1, t, out);
  t = sampleSegment(x1, y1, rightX, rightY, t, out);
  sampleSegment(rightX, rightY, baseX, baseY, t, out);
  return out;
}

/**
 * Build sampled stroke points for a shape rubber-band (preview === commit).
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

  if (kind === "line") {
    return {
      points: linePoints(frame.x0, frame.y0, frame.x1, frame.y1),
      closed: false,
    };
  }
  if (kind === "arrow") {
    return {
      points: arrowPoints(frame.x0, frame.y0, frame.x1, frame.y1),
      closed: false,
    };
  }

  const { x, y, w, h } = frame.box;
  if (w < 0.5 && h < 0.5) {
    return { points: [pt(x, y, 0)], closed };
  }

  if (kind === "rect") return { points: rectPoints(x, y, w, h), closed: true };
  if (kind === "diamond") return { points: diamondPoints(x, y, w, h), closed: true };
  return { points: ellipsePoints(x, y, w, h), closed: true };
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
