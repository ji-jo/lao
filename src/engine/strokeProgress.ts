import type { Stroke, StrokePoint } from "@/model/types";

/** Last recorded `t` on a stroke, or 0. */
export function strokeDurationMs(stroke: Stroke): number {
  const pts = stroke.points;
  if (!pts.length) return 0;
  return Math.max(0, pts[pts.length - 1]?.t ?? 0);
}

/**
 * Progressive draw-on: keep points with t <= localT (ms into this stroke).
 * Always keeps at least the first point once drawing has started (localT >= 0).
 */
export function truncateStrokePoints(
  points: StrokePoint[],
  localT: number,
): StrokePoint[] {
  if (!points.length) return points;
  if (localT < 0) return [];
  const out: StrokePoint[] = [];
  for (const p of points) {
    if (p.t <= localT) out.push(p);
    else break;
  }
  if (out.length === 0 && points[0]) return [points[0]];
  return out;
}

/**
 * Visibility + progressive points for a stroke at composition timeMs.
 * Before clip.startMs → hidden. During clip → draw-on by point t.
 * After start+duration → full stroke (held).
 */
export function strokeAtTime(
  stroke: Stroke,
  timeMs: number,
): StrokePoint[] | null {
  const clip = stroke.clip;
  if (!clip) {
    // no clip metadata → always fully visible (stop-motion)
    return stroke.points;
  }
  if (timeMs < clip.startMs) return null;
  const localT = timeMs - clip.startMs;
  if (localT >= clip.durationMs) return stroke.points;
  return truncateStrokePoints(stroke.points, localT);
}

/** End time of the latest clip across all layers (ms). */
export function projectClipEndMs(strokes: Stroke[]): number {
  let end = 0;
  for (const s of strokes) {
    if (!s.clip) continue;
    end = Math.max(end, s.clip.startMs + s.clip.durationMs);
  }
  return end;
}

/** Collect every stroke in the project (all layers, frame 0 / held). */
export function allProjectStrokes(
  layers: { frames: ({ strokes: Stroke[] } | null)[]; isStatic: boolean }[],
): Stroke[] {
  const out: Stroke[] = [];
  for (const layer of layers) {
    const cel = layer.frames.find((f) => f) ?? null;
    if (cel) out.push(...cel.strokes);
  }
  return out;
}
