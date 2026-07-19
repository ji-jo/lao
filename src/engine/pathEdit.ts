import type { StrokePoint } from "@/model/types";

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
