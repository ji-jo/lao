import type { Bezier4, Stroke, StrokeClip, StrokePoint, TextElement } from "@/model/types";

/** Last recorded `t` on a stroke (or bare point list), or 0. */
export function strokeDurationMs(strokeOrPoints: Stroke | StrokePoint[]): number {
  const pts = Array.isArray(strokeOrPoints)
    ? strokeOrPoints
    : strokeOrPoints?.points;
  if (!pts?.length) return 0;
  return Math.max(0, pts[pts.length - 1]?.t ?? 0);
}

/**
 * Assign monotonic draw-on `t` (ms) along a polyline by arc length.
 * Used when bezier flattening or path edits replace `points` without timing.
 */
export function retimeStrokePoints(
  points: StrokePoint[],
  durationMs?: number,
): StrokePoint[] {
  if (!points.length) return points;
  if (points.length === 1) {
    return [{ ...points[0], t: 0 }];
  }

  const prior = strokeDurationMs({ ...dummyStroke(), points });
  const ms =
    durationMs ??
    (prior > 0 ? prior : Math.max(80, Math.round(points.length * 8)));

  let totalLen = 0;
  const cum: number[] = [0];
  for (let i = 1; i < points.length; i++) {
    totalLen += Math.hypot(
      points[i].x - points[i - 1].x,
      points[i].y - points[i - 1].y,
    );
    cum.push(totalLen);
  }

  if (totalLen <= 1e-9) {
    return points.map((p, i) => ({
      ...p,
      t: (i / (points.length - 1)) * ms,
    }));
  }

  return points.map((p, i) => ({
    ...p,
    t: (cum[i] / totalLen) * ms,
  }));
}

/** Type stub for strokeDurationMs on bare point arrays. */
function dummyStroke(): Stroke {
  return {
    id: "",
    brush: "ink",
    color: "#000",
    size: 1,
    points: [],
    seed: 0,
    jitter: false,
  };
}

/**
 * Apply clip-truncated points for paint. Drops `bezierNodes` while the stroke
 * is still drawing on so the renderer follows the partial polyline, not the
 * full cubic path.
 */
export function strokeWithClipPoints(stroke: Stroke, pts: StrokePoint[]): Stroke {
  if (pts === stroke.points) return stroke;
  const fullEnd = stroke.points[stroke.points.length - 1]?.t ?? 0;
  const clipEnd = pts[pts.length - 1]?.t ?? 0;
  const partial =
    pts.length < stroke.points.length ||
    (fullEnd > 0 && clipEnd < fullEnd - 0.5);
  return {
    ...stroke,
    points: pts,
    bezierNodes: partial && stroke.bezierNodes ? undefined : stroke.bezierNodes,
  };
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

type ClipBearer = { clip?: StrokeClip };

/** Fade opacity for a clipped stroke/text at timeMs (1 = fully opaque). */
export function clipFadeOpacity(
  item: ClipBearer,
  timeMs: number,
  fps: number,
): number {
  const clip = item.clip;
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

/**
 * Draw-on progress for text at composition timeMs.
 * null = hidden (before clip). 0..1 during clip. 1 after (held).
 * Prefer `textContentAtTime` for painting — this stays for legacy callers/tests.
 */
export function textProgressAtTime(
  text: TextElement,
  timeMs: number,
): number | null {
  const clip = text.clip;
  if (!clip) return 1;
  if (timeMs < clip.startMs) return null;
  const localT = timeMs - clip.startMs;
  if (localT >= clip.durationMs) return 1;
  const speed = text.typewriterSpeed;
  if (speed === 0) return 1;
  if (speed != null && speed > 0) {
    const chars = Array.from(text.text);
    if (!chars.length) return 1;
    return Math.min(1, (localT / 1000) * speed / chars.length);
  }
  const rawProgress = clip.durationMs > 0 ? localT / clip.durationMs : 1;
  return clip.easing
    ? sampleBezierY(rawProgress, clip.easing.bezier)
    : rawProgress;
}

/** Reveal the first `progress` fraction of grapheme clusters. */
export function truncateTextByProgress(text: string, progress: number): string {
  if (progress >= 1) return text;
  if (progress <= 0) return "";
  const chars = Array.from(text);
  if (!chars.length) return "";
  const n = Math.max(1, Math.ceil(chars.length * progress));
  return chars.slice(0, n).join("");
}

/** Clip duration needed to type `text` at `cps` characters per second. */
export function typewriterDurationMs(text: string, cps: number): number {
  const n = Array.from(text).length;
  if (cps <= 0 || n === 0) return 80;
  return Math.max(80, Math.ceil((n / cps) * 1000));
}

/**
 * Visible text string at composition timeMs.
 * null = hidden (before clip). Matches paintProjectFrame / StageCanvas / export.
 */
export function textContentAtTime(
  text: TextElement,
  timeMs: number,
): string | null {
  const clip = text.clip;
  if (!clip) return text.text;
  if (timeMs < clip.startMs) return null;
  const localT = timeMs - clip.startMs;
  if (localT >= clip.durationMs) return text.text;

  const speed = text.typewriterSpeed;
  if (speed === 0) return text.text;
  if (speed != null && speed > 0) {
    const chars = Array.from(text.text);
    if (!chars.length) return "";
    const n = Math.min(chars.length, Math.ceil((localT / 1000) * speed));
    return chars.slice(0, n).join("");
  }

  const progress = textProgressAtTime(text, timeMs);
  if (progress == null) return null;
  if (progress >= 1) return text.text;
  return truncateTextByProgress(text.text, progress);
}

/** End time of the latest clip across items (ms). */
export function projectClipEndMs(items: ClipBearer[]): number {
  let end = 0;
  for (const s of items) {
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

/** Strokes + texts + images that can carry Animatron clips. */
export function allProjectClipItems(
  layers: {
    frames: (
      | {
          strokes: Stroke[];
          texts?: TextElement[];
          images?: import("@/model/types").ImageElement[];
        }
      | null
    )[];
  }[],
): ClipBearer[] {
  const out: ClipBearer[] = [];
  for (const layer of layers) {
    const cel = layer.frames.find((f) => f) ?? null;
    if (!cel) continue;
    out.push(...cel.strokes);
    if (cel.texts) out.push(...cel.texts);
    if (cel.images) out.push(...cel.images);
  }
  return out;
}
