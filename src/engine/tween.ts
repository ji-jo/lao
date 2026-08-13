import type { Frame, Stroke, StrokePoint } from "@/model/types";

/**
 * Deterministic stroke-to-stroke tween / morph engine.
 * No AI — pure geometry: match strokes, resample by arc length, interpolate
 * with rotation-aware segment reconstruction so limbs keep length mid-swing.
 */

const DEFAULT_SAMPLE_COUNT = 48;

export type TweenStrokePair = {
  from: Stroke;
  to: Stroke;
  /** resampled point counts (aligned) */
  fromPts: StrokePoint[];
  toPts: StrokePoint[];
};

export type TweenResult = {
  strokes: Stroke[];
  /** strokes from A with no match — fade out via opacity hint */
  fadingOut: Stroke[];
  /** strokes from B with no match — fade in via opacity hint */
  fadingIn: Stroke[];
};

function strokeLength(points: StrokePoint[]): number {
  let s = 0;
  for (let i = 1; i < points.length; i++) {
    s += Math.hypot(points[i].x - points[i - 1].x, points[i].y - points[i - 1].y);
  }
  return s;
}

function centroid(points: StrokePoint[]): { x: number; y: number } {
  if (!points.length) return { x: 0, y: 0 };
  let x = 0;
  let y = 0;
  for (const p of points) {
    x += p.x;
    y += p.y;
  }
  return { x: x / points.length, y: y / points.length };
}

/** Resample a polyline to exactly `count` points by arc length. */
export function resamplePolyline(
  points: StrokePoint[],
  count: number,
): StrokePoint[] {
  const n = Math.max(2, count);
  if (!points.length) {
    return Array.from({ length: n }, () => ({ x: 0, y: 0, pressure: 0.5, t: 0 }));
  }
  if (points.length === 1) {
    return Array.from({ length: n }, (_, i) => ({
      ...points[0],
      t: i,
    }));
  }

  const segLens: number[] = [0];
  let total = 0;
  for (let i = 1; i < points.length; i++) {
    total += Math.hypot(
      points[i].x - points[i - 1].x,
      points[i].y - points[i - 1].y,
    );
    segLens.push(total);
  }
  if (total <= 1e-9) {
    return Array.from({ length: n }, (_, i) => ({
      ...points[0],
      t: i,
    }));
  }

  const out: StrokePoint[] = [];
  for (let i = 0; i < n; i++) {
    const target = (i / (n - 1)) * total;
    let lo = 0;
    let hi = segLens.length - 1;
    while (lo < hi) {
      const mid = (lo + hi) >> 1;
      if (segLens[mid] < target) lo = mid + 1;
      else hi = mid;
    }
    const idx = Math.max(1, lo);
    const s0 = segLens[idx - 1];
    const s1 = segLens[idx];
    const span = s1 - s0 || 1;
    const f = (target - s0) / span;
    const a = points[idx - 1];
    const b = points[idx];
    out.push({
      x: a.x + (b.x - a.x) * f,
      y: a.y + (b.y - a.y) * f,
      pressure: a.pressure + (b.pressure - a.pressure) * f,
      t: a.t + (b.t - a.t) * f,
    });
  }
  return out;
}

/**
 * Flip `to` point order if that better matches `from` (start-point distance).
 * Prevents morph flip when the user drew strokes in opposite directions.
 */
export function alignStrokeDirection(
  from: StrokePoint[],
  to: StrokePoint[],
): StrokePoint[] {
  if (from.length < 2 || to.length < 2) return to;
  const dSame =
    Math.hypot(from[0].x - to[0].x, from[0].y - to[0].y) +
    Math.hypot(
      from[from.length - 1].x - to[to.length - 1].x,
      from[from.length - 1].y - to[to.length - 1].y,
    );
  const dFlip =
    Math.hypot(from[0].x - to[to.length - 1].x, from[0].y - to[to.length - 1].y) +
    Math.hypot(from[from.length - 1].x - to[0].x, from[from.length - 1].y - to[0].y);
  if (dFlip < dSame) {
    return [...to].reverse().map((p, i, arr) => ({
      ...p,
      t: arr[arr.length - 1 - i]?.t ?? p.t,
    }));
  }
  return to;
}

/** Cost for matching stroke A to stroke B (lower = better). */
function matchCost(a: Stroke, b: Stroke): number {
  const ca = centroid(a.points);
  const cb = centroid(b.points);
  const dist = Math.hypot(ca.x - cb.x, ca.y - cb.y);
  const la = strokeLength(a.points);
  const lb = strokeLength(b.points);
  const lenRatio = Math.abs(la - lb) / Math.max(la, lb, 1);
  const sizeDiff = Math.abs(a.size - b.size) / Math.max(a.size, b.size, 1);
  return dist + lenRatio * 80 + sizeDiff * 40;
}

/**
 * Greedy bipartite matching (Hungarian-lite): pair each A stroke to best unused B.
 * Unmatched strokes returned separately.
 */
export function matchStrokes(
  from: Stroke[],
  to: Stroke[],
): { pairs: Array<{ from: Stroke; to: Stroke }>; unmatchedFrom: Stroke[]; unmatchedTo: Stroke[] } {
  const usedTo = new Set<number>();
  const pairs: Array<{ from: Stroke; to: Stroke }> = [];
  const unmatchedFrom: Stroke[] = [];

  // Prefer pairing in draw order when sizes are similar, else by cost.
  const fromIdx = from.map((_, i) => i);
  fromIdx.sort((i, j) => {
    // Keep relative order for similar-length drawings.
    return i - j;
  });

  for (const i of fromIdx) {
    const a = from[i];
    let bestJ = -1;
    let bestCost = Infinity;
    for (let j = 0; j < to.length; j++) {
      if (usedTo.has(j)) continue;
      const c = matchCost(a, to[j]);
      if (c < bestCost) {
        bestCost = c;
        bestJ = j;
      }
    }
    // Reject absurd matches (very far + very different length).
    if (bestJ < 0 || bestCost > 2000) {
      unmatchedFrom.push(a);
      continue;
    }
    usedTo.add(bestJ);
    pairs.push({ from: a, to: to[bestJ] });
  }

  const unmatchedTo: Stroke[] = [];
  for (let j = 0; j < to.length; j++) {
    if (!usedTo.has(j)) unmatchedTo.push(to[j]);
  }
  return { pairs, unmatchedFrom, unmatchedTo };
}

/**
 * Rotation-aware interpolate: rebuild polyline from lerped segment angles+lengths
 * starting from lerped origin. Keeps limb length during arcs.
 */
export function interpolatePointsRotationAware(
  from: StrokePoint[],
  to: StrokePoint[],
  u: number,
): StrokePoint[] {
  const n = Math.min(from.length, to.length);
  if (n === 0) return [];
  if (n === 1) {
    return [
      {
        x: from[0].x + (to[0].x - from[0].x) * u,
        y: from[0].y + (to[0].y - from[0].y) * u,
        pressure: from[0].pressure + (to[0].pressure - from[0].pressure) * u,
        t: from[0].t + (to[0].t - from[0].t) * u,
      },
    ];
  }

  const out: StrokePoint[] = [];
  let x = from[0].x + (to[0].x - from[0].x) * u;
  let y = from[0].y + (to[0].y - from[0].y) * u;
  out.push({
    x,
    y,
    pressure: from[0].pressure + (to[0].pressure - from[0].pressure) * u,
    t: from[0].t + (to[0].t - from[0].t) * u,
  });

  for (let i = 1; i < n; i++) {
    const afx = from[i].x - from[i - 1].x;
    const afy = from[i].y - from[i - 1].y;
    const atx = to[i].x - to[i - 1].x;
    const aty = to[i].y - to[i - 1].y;
    const lenA = Math.hypot(afx, afy);
    const lenB = Math.hypot(atx, aty);
    const angA = Math.atan2(afy, afx);
    const angB = Math.atan2(aty, atx);
    let dAng = angB - angA;
    while (dAng > Math.PI) dAng -= Math.PI * 2;
    while (dAng < -Math.PI) dAng += Math.PI * 2;
    const ang = angA + dAng * u;
    const len = lenA + (lenB - lenA) * u;
    x += Math.cos(ang) * len;
    y += Math.sin(ang) * len;
    out.push({
      x,
      y,
      pressure: from[i].pressure + (to[i].pressure - from[i].pressure) * u,
      t: from[i].t + (to[i].t - from[i].t) * u,
    });
  }
  return out;
}

function lerpHexColor(a: string, b: string, u: number): string {
  const pa = parseColor(a);
  const pb = parseColor(b);
  if (!pa || !pb) return u < 0.5 ? a : b;
  const r = Math.round(pa.r + (pb.r - pa.r) * u);
  const g = Math.round(pa.g + (pb.g - pa.g) * u);
  const bl = Math.round(pa.b + (pb.b - pa.b) * u);
  const alpha = pa.a + (pb.a - pa.a) * u;
  if (alpha >= 0.999) {
    return `#${[r, g, bl].map((n) => n.toString(16).padStart(2, "0")).join("")}`;
  }
  return `rgba(${r},${g},${bl},${Math.round(alpha * 1000) / 1000})`;
}

function parseColor(c: string): { r: number; g: number; b: number; a: number } | null {
  const hex = c.trim();
  if (hex.startsWith("#")) {
    const h = hex.slice(1);
    if (h.length === 3) {
      return {
        r: parseInt(h[0] + h[0], 16),
        g: parseInt(h[1] + h[1], 16),
        b: parseInt(h[2] + h[2], 16),
        a: 1,
      };
    }
    if (h.length === 6 || h.length === 8) {
      return {
        r: parseInt(h.slice(0, 2), 16),
        g: parseInt(h.slice(2, 4), 16),
        b: parseInt(h.slice(4, 6), 16),
        a: h.length === 8 ? parseInt(h.slice(6, 8), 16) / 255 : 1,
      };
    }
  }
  const m = hex.match(
    /rgba?\(\s*([\d.]+)\s*,\s*([\d.]+)\s*,\s*([\d.]+)(?:\s*,\s*([\d.]+))?\s*\)/i,
  );
  if (m) {
    return {
      r: +m[1],
      g: +m[2],
      b: +m[3],
      a: m[4] !== undefined ? +m[4] : 1,
    };
  }
  return null;
}

function interpolateStroke(from: Stroke, to: Stroke, u: number, sampleCount: number): Stroke {
  const fromPts = resamplePolyline(from.points, sampleCount);
  let toPts = resamplePolyline(to.points, sampleCount);
  toPts = alignStrokeDirection(fromPts, toPts);
  const points = interpolatePointsRotationAware(fromPts, toPts, u);
  return {
    ...from,
    id: `${from.id}__tween__${to.id}`,
    color: lerpHexColor(from.color, to.color, u),
    size: from.size + (to.size - from.size) * u,
    fillColor:
      from.fillColor && to.fillColor
        ? lerpHexColor(from.fillColor, to.fillColor, u)
        : u < 0.5
          ? from.fillColor
          : to.fillColor,
    points,
    // Drop shape semantics — points are the source of truth mid-tween.
    shapeKind: undefined,
    shapeBox: undefined,
    bezierNodes: undefined,
    clip: undefined,
  };
}

/**
 * Tween two frames at progress u ∈ [0,1].
 * Matched strokes morph; unmatched fade via size/pressure (caller may also alpha).
 */
export function tweenFrames(
  frameA: Frame,
  frameB: Frame,
  u: number,
  opts?: { sampleCount?: number },
): TweenResult {
  const uu = Math.max(0, Math.min(1, u));
  const sampleCount = opts?.sampleCount ?? DEFAULT_SAMPLE_COUNT;
  const { pairs, unmatchedFrom, unmatchedTo } = matchStrokes(
    frameA.strokes,
    frameB.strokes,
  );

  const strokes: Stroke[] = pairs.map(({ from, to }) =>
    interpolateStroke(from, to, uu, sampleCount),
  );

  // Fade unmatched: shrink pressure/size toward zero.
  const fadingOut = unmatchedFrom.map((s) => ({
    ...s,
    id: `${s.id}__out`,
    size: s.size * (1 - uu),
    points: s.points.map((p) => ({ ...p, pressure: p.pressure * (1 - uu) })),
    clip: undefined,
  }));
  const fadingIn = unmatchedTo.map((s) => ({
    ...s,
    id: `${s.id}__in`,
    size: s.size * uu,
    points: s.points.map((p) => ({ ...p, pressure: p.pressure * uu })),
    clip: undefined,
  }));

  if (uu <= 0) {
    return { strokes: frameA.strokes.map((s) => ({ ...s })), fadingOut: [], fadingIn: [] };
  }
  if (uu >= 1) {
    return { strokes: frameB.strokes.map((s) => ({ ...s })), fadingOut: [], fadingIn: [] };
  }

  return {
    strokes: [...strokes, ...fadingOut.filter((s) => s.size > 0.15), ...fadingIn.filter((s) => s.size > 0.15)],
    fadingOut,
    fadingIn,
  };
}

/** Convenience: just the stroke list at progress u. */
export function tweenStrokesAt(
  from: Stroke[],
  to: Stroke[],
  u: number,
  opts?: { sampleCount?: number },
): Stroke[] {
  return tweenFrames(
    { id: "a", strokes: from },
    { id: "b", strokes: to },
    u,
    opts,
  ).strokes;
}

/**
 * Generate N in-between frames (exclusive of A and B) for stop-motion bake.
 * Returns cels with new ids, ready to insert between keyframes.
 */
export function generateInbetweenFrames(
  frameA: Frame,
  frameB: Frame,
  count: number,
  opts?: { sampleCount?: number },
): Frame[] {
  const n = Math.max(0, Math.floor(count));
  const out: Frame[] = [];
  for (let i = 1; i <= n; i++) {
    const u = i / (n + 1);
    const { strokes } = tweenFrames(frameA, frameB, u, opts);
    out.push({
      id: crypto.randomUUID(),
      strokes: strokes.map((s) => ({
        ...s,
        id: crypto.randomUUID(),
        points: s.points.map((p) => ({ ...p })),
        seed: (s.seed + i * 9973) >>> 0,
      })),
      texts: [],
      images: [],
    });
  }
  return out;
}
