import type { Bezier4, Stroke, StrokePoint } from "@/model/types";

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

/** Sample cubic-bezier Y for progress u in 0..1 (CSS-like easing). */
export function sampleBezierY(u: number, bezier: Bezier4): number {
  const t = Math.min(1, Math.max(0, u));
  const [x1, y1, x2, y2] = bezier;
  let s = t;
  for (let i = 0; i < 6; i++) {
    const u1 = 1 - s;
    const bx = 3 * u1 * u1 * s * x1 + 3 * u1 * s * s * x2 + s * s * s;
    const dx =
      3 * u1 * u1 * x1 + 6 * u1 * s * (x2 - x1) + 3 * s * s * (1 - x2);
    if (Math.abs(dx) < 1e-6) break;
    s -= (bx - t) / dx;
    s = Math.min(1, Math.max(0, s));
  }
  const u2 = 1 - s;
  return 3 * u2 * u2 * s * y1 + 3 * u2 * s * s * y2 + s * s * s;
}

/**
 * Visibility + progressive points for a stroke at composition timeMs.
 * Before clip.startMs → hidden. During clip → draw-on by point t (eased).
 * After start+duration → full stroke (held).
 */
export function strokeAtTime(
  stroke: Stroke,
  timeMs: number,
): StrokePoint[] | null {
  const clip = stroke.clip;
  if (!clip) {
    return stroke.points;
  }
  if (timeMs < clip.startMs) return null;
  const localT = timeMs - clip.startMs;
  if (localT >= clip.durationMs) return stroke.points;
  const rawProgress = clip.durationMs > 0 ? localT / clip.durationMs : 1;
  const eased = clip.easing
    ? sampleBezierY(rawProgress, clip.easing.bezier)
    : rawProgress;
  const targetT = eased * strokeDurationMs(stroke);
  return truncateStrokePoints(stroke.points, targetT);
}

/** Fade opacity for a clipped stroke at timeMs (1 = fully opaque). */
export function clipFadeOpacity(
  stroke: Stroke,
  timeMs: number,
  fps: number,
): number {
  const clip = stroke.clip;
  if (!clip?.easing) return 1;
  const { fadeInFrames, fadeOutFrames } = clip.easing;
  const fadeInMs = (fadeInFrames / Math.max(fps, 1)) * 1000;
  const fadeOutMs = (fadeOutFrames / Math.max(fps, 1)) * 1000;
  const start = clip.startMs;
  const end = clip.startMs + clip.durationMs;
  if (timeMs < start) return 0;
  if (fadeInMs > 0 && timeMs < start + fadeInMs) {
    return Math.min(1, (timeMs - start) / fadeInMs);
  }
  if (fadeOutMs > 0 && timeMs > end - fadeOutMs) {
    return Math.min(1, Math.max(0, (end - timeMs) / fadeOutMs));
  }
  return 1;
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
