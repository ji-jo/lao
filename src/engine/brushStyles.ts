/**
 * Procedural brush pack — Canvas2D only, no tip PNG/SVG stamping.
 * Presets match the reference brush set (Smooth … Squares).
 *
 * Stage paints at `draft` every frame; export uses `full`. Draft keeps the
 * same look with cheaper ops + a bbox stamp cache for committed strokes.
 */

import { getStroke } from "perfect-freehand";
import { mulberry32 } from "@/engine/boil";
import { grainTile } from "@/engine/grain";
import { coerceP5Brush, type P5BrushId } from "@/engine/p5BrushPresets";
import type { Stroke, StrokePoint } from "@/model/types";

export type RenderQuality = "draft" | "full";

type RibbonOpts = {
  size: number;
  thinning: number;
  smoothing: number;
  streamline: number;
  simulatePressure: boolean;
  last: boolean;
};

type StyleParams = {
  wavelength: number;
  corners: number;
  smoothing: number;
};

/** Particle / multi-pass presets — stamp-cached on draft once points stabilize. */
const HEAVY_DRAFT_PRESETS: ReadonlySet<string> = new Set([
  "smooth",
  "calligraphy",
  "brush",
  "rough",
  "stipple",
  "sketchy",
  "parallel",
  "outline",
  "dashed",
  "dotted",
  "dots",
  "spray",
  "chalk",
  "ink",
  "airbrush",
  "pixel",
  "halftone",
  "squares",
]);

type DraftStamp = {
  canvas: HTMLCanvasElement;
  x: number;
  y: number;
  w: number;
  h: number;
};

const draftStampCache = new Map<string, DraftStamp>();
const DRAFT_CACHE_LIMIT = 80;

/** Soft radial tips for airbrush — keyed by radius bucket + color. */
const airbrushTipCache = new Map<string, HTMLCanvasElement>();
const AIRBRUSH_TIP_LIMIT = 48;

export function clearBrushDraftCache(): void {
  draftStampCache.clear();
  airbrushTipCache.clear();
}

function colorWithAlpha(color: string, alpha: number): string {
  const a = Math.min(1, Math.max(0, alpha));
  if (color.startsWith("#")) {
    let h = color.slice(1);
    if (h.length === 3 || h.length === 4) {
      h = h
        .slice(0, 3)
        .split("")
        .map((c) => c + c)
        .join("");
    } else if (h.length >= 6) {
      h = h.slice(0, 6);
    }
    if (h.length === 6) {
      const r = parseInt(h.slice(0, 2), 16);
      const g = parseInt(h.slice(2, 4), 16);
      const b = parseInt(h.slice(4, 6), 16);
      return `rgba(${r},${g},${b},${a})`;
    }
  }
  const m = /^rgba?\(\s*([\d.]+)\s*,\s*([\d.]+)\s*,\s*([\d.]+)/i.exec(color);
  if (m) return `rgba(${m[1]},${m[2]},${m[3]},${a})`;
  return color;
}

/**
 * Cached soft tip matching reference airbrush: dense core (~25%),
 * wide Gaussian-ish feather to transparent (hardness 0).
 */
function airbrushTip(radiusPx: number, color: string): HTMLCanvasElement {
  const r = Math.max(3, Math.round(radiusPx));
  const key = `${r}|${color}`;
  const hit = airbrushTipCache.get(key);
  if (hit) return hit;

  const d = r * 2;
  const tip = document.createElement("canvas");
  tip.width = d;
  tip.height = d;
  const tctx = tip.getContext("2d")!;
  const g = tctx.createRadialGradient(r, r, 0, r, r, r);
  // Profile tuned to the reference soft stroke (core → long soft falloff).
  g.addColorStop(0, colorWithAlpha(color, 1));
  g.addColorStop(0.18, colorWithAlpha(color, 0.78));
  g.addColorStop(0.38, colorWithAlpha(color, 0.38));
  g.addColorStop(0.58, colorWithAlpha(color, 0.14));
  g.addColorStop(0.78, colorWithAlpha(color, 0.04));
  g.addColorStop(1, colorWithAlpha(color, 0));
  tctx.fillStyle = g;
  tctx.beginPath();
  tctx.arc(r, r, r, 0, Math.PI * 2);
  tctx.fill();

  airbrushTipCache.set(key, tip);
  if (airbrushTipCache.size > AIRBRUSH_TIP_LIMIT) {
    const first = airbrushTipCache.keys().next().value;
    if (first !== undefined) airbrushTipCache.delete(first);
  }
  return tip;
}

function trimDraftCache() {
  if (draftStampCache.size <= DRAFT_CACHE_LIMIT) return;
  const drop = draftStampCache.size - DRAFT_CACHE_LIMIT;
  let i = 0;
  for (const key of draftStampCache.keys()) {
    draftStampCache.delete(key);
    if (++i >= drop) break;
  }
}

function styleOf(stroke: Stroke): StyleParams {
  return {
    wavelength: Math.max(2, stroke.brushWavelength ?? 12),
    corners: Math.min(1, Math.max(0, (stroke.brushCorners ?? 100) / 100)),
    smoothing: Math.min(0.95, Math.max(0.05, (stroke.brushSmoothing ?? 9) / 20)),
  };
}

function meanPressure(points: StrokePoint[]): number {
  if (points.length === 0) return 0.5;
  let s = 0;
  for (const p of points) s += p.pressure;
  return Math.min(1, Math.max(0.08, s / points.length));
}

/** Drop near-duplicate samples — big win on long live strokes. */
function thinPoints(points: StrokePoint[], minDist: number): StrokePoint[] {
  if (points.length <= 3 || minDist <= 0) return points;
  const out: StrokePoint[] = [points[0]];
  for (let i = 1; i < points.length - 1; i++) {
    const prev = out[out.length - 1];
    const p = points[i];
    if (Math.hypot(p.x - prev.x, p.y - prev.y) >= minDist) out.push(p);
  }
  out.push(points[points.length - 1]);
  return out;
}

function strokeBounds(
  points: StrokePoint[],
  pad: number,
): { x: number; y: number; w: number; h: number } {
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (const p of points) {
    if (p.x < minX) minX = p.x;
    if (p.y < minY) minY = p.y;
    if (p.x > maxX) maxX = p.x;
    if (p.y > maxY) maxY = p.y;
  }
  if (!Number.isFinite(minX)) return { x: 0, y: 0, w: 1, h: 1 };
  return {
    x: Math.floor(minX - pad),
    y: Math.floor(minY - pad),
    w: Math.max(1, Math.ceil(maxX - minX + pad * 2)),
    h: Math.max(1, Math.ceil(maxY - minY + pad * 2)),
  };
}

function draftCacheKey(
  stroke: Stroke,
  preset: P5BrushId,
  points: StrokePoint[],
  color: string,
): string {
  const n = points.length;
  const a = points[0];
  const b = points[n >> 1];
  const c = points[n - 1];
  return [
    stroke.id,
    preset,
    color,
    stroke.size,
    stroke.seed,
    stroke.brushWavelength ?? 12,
    stroke.brushCorners ?? 100,
    stroke.brushSmoothing ?? 9,
    n,
    a.x | 0,
    a.y | 0,
    b.x | 0,
    b.y | 0,
    c.x | 0,
    c.y | 0,
  ].join("|");
}

function ribbonPath(points: StrokePoint[], opts: RibbonOpts): Path2D {
  const outline = getStroke(
    points.map((p) => [p.x, p.y, p.pressure]),
    opts,
  );
  const path = new Path2D();
  if (outline.length < 2) return path;
  path.moveTo(outline[0][0], outline[0][1]);
  for (let i = 1; i < outline.length; i++) path.lineTo(outline[i][0], outline[i][1]);
  path.closePath();
  return path;
}

function fillRibbon(
  ctx: CanvasRenderingContext2D,
  points: StrokePoint[],
  opts: RibbonOpts,
  alpha: number,
) {
  if (points.length === 0) return;
  if (points.length === 1) {
    const p = points[0];
    ctx.globalAlpha = alpha;
    ctx.beginPath();
    ctx.arc(
      p.x,
      p.y,
      (opts.size / 2) * Math.max(p.pressure, 0.28),
      0,
      Math.PI * 2,
    );
    ctx.fill();
    return;
  }
  ctx.globalAlpha = alpha;
  ctx.fill(ribbonPath(points, opts));
}

function clipGrain(
  ctx: CanvasRenderingContext2D,
  path: Path2D,
  seed: number,
  strength: number,
) {
  if (strength <= 0.01) return;
  ctx.save();
  ctx.clip(path);
  const tile = grainTile(seed);
  const pattern = ctx.createPattern(tile, "repeat");
  if (pattern) {
    ctx.fillStyle = pattern;
    ctx.globalCompositeOperation = "multiply";
    ctx.globalAlpha = strength;
    ctx.fill(path);
  }
  ctx.restore();
}

/** Skip grain on draft — createPattern + clip is too costly per frame. */
function clipGrainIfFull(
  ctx: CanvasRenderingContext2D,
  path: Path2D,
  seed: number,
  strength: number,
  quality: RenderQuality,
) {
  if (quality !== "full") return;
  clipGrain(ctx, path, seed, strength);
}

function offsetPoints(
  points: StrokePoint[],
  amount: number,
  seed: number,
  jitter = 0,
): StrokePoint[] {
  if (points.length === 0) return points;
  const rand = mulberry32(seed >>> 0);
  const out: StrokePoint[] = [];
  for (let i = 0; i < points.length; i++) {
    const prev = points[Math.max(0, i - 1)];
    const next = points[Math.min(points.length - 1, i + 1)];
    let tx = next.x - prev.x;
    let ty = next.y - prev.y;
    const len = Math.hypot(tx, ty) || 1;
    tx /= len;
    ty /= len;
    const nx = -ty;
    const ny = tx;
    const j = jitter * (rand() - 0.5) * 2;
    out.push({
      ...points[i],
      x: points[i].x + nx * (amount + j),
      y: points[i].y + ny * (amount + j),
    });
  }
  return out;
}

/** Walk the polyline, invoking fn at arc-length samples. */
function alongPath(
  points: StrokePoint[],
  step: number,
  fn: (x: number, y: number, pressure: number, tangX: number, tangY: number, dist: number) => void,
) {
  if (points.length === 0 || step <= 0) return;
  if (points.length === 1) {
    fn(points[0].x, points[0].y, points[0].pressure, 1, 0, 0);
    return;
  }
  let carry = 0;
  let total = 0;
  for (let i = 1; i < points.length; i++) {
    const a = points[i - 1];
    const b = points[i];
    const dx = b.x - a.x;
    const dy = b.y - a.y;
    const len = Math.hypot(dx, dy) || 1;
    const tx = dx / len;
    const ty = dy / len;
    let d = carry;
    while (d < len) {
      const t = d / len;
      fn(
        a.x + dx * t,
        a.y + dy * t,
        a.pressure + (b.pressure - a.pressure) * t,
        tx,
        ty,
        total + d,
      );
      d += step;
    }
    carry = d - len;
    total += len;
  }
}

function paintSmooth(
  ctx: CanvasRenderingContext2D,
  stroke: Stroke,
  points: StrokePoint[],
  quality: RenderQuality,
  style: StyleParams,
) {
  const avg = meanPressure(points);
  fillRibbon(
    ctx,
    points,
    {
      size: Math.max(stroke.size * 0.95, 1.2),
      thinning: 0.72,
      smoothing: style.smoothing,
      streamline: 0.35 + style.corners * 0.35,
      simulatePressure: false,
      last: true,
    },
    0.88 + avg * 0.12,
  );
  void quality;
}

/** Flat-nib calligraphy — fixed-angle tip sweeps thick/thin by direction. */
function paintCalligraphy(
  ctx: CanvasRenderingContext2D,
  stroke: Stroke,
  points: StrokePoint[],
  quality: RenderQuality,
  style: StyleParams,
) {
  const avg = meanPressure(points);
  // Classic chisel tip: ~45°. Corners softens toward a rounder ribbon.
  const nib = Math.PI / 4;
  const half = Math.max(stroke.size * (0.55 + avg * 0.45), 1.5);
  const nx = Math.cos(nib);
  const ny = Math.sin(nib);

  if (points.length < 2) {
    const p = points[0];
    if (!p) return;
    ctx.globalAlpha = 0.95;
    ctx.beginPath();
    ctx.moveTo(p.x + nx * half, p.y + ny * half);
    ctx.lineTo(p.x - nx * half, p.y - ny * half);
    ctx.lineWidth = Math.max(stroke.size * 0.35, 1);
    ctx.lineCap = "round";
    ctx.stroke();
    return;
  }

  // Soft corners → blend toward a pressure ribbon so it still reads calligraphic.
  if (style.corners < 0.35) {
    const warped = points.map((p, i) => {
      const prev = points[Math.max(0, i - 1)];
      const next = points[Math.min(points.length - 1, i + 1)];
      const ang = Math.atan2(next.y - prev.y, next.x - prev.x);
      // Thick when traveling across the nib, thin when along it.
      const across = Math.abs(Math.sin(ang - nib));
      return {
        ...p,
        pressure: Math.min(1, 0.12 + across * 0.95) * (0.55 + p.pressure * 0.45),
      };
    });
    fillRibbon(
      ctx,
      warped,
      {
        size: stroke.size * 1.6,
        thinning: 0.82,
        smoothing: style.smoothing,
        streamline: 0.35,
        simulatePressure: false,
        last: true,
      },
      0.95,
    );
    void quality;
    return;
  }

  const left: { x: number; y: number }[] = [];
  const right: { x: number; y: number }[] = [];
  for (let i = 0; i < points.length; i++) {
    const p = points[i];
    const w = half * (0.55 + p.pressure * 0.55);
    left.push({ x: p.x + nx * w, y: p.y + ny * w });
    right.push({ x: p.x - nx * w, y: p.y - ny * w });
  }

  const path = new Path2D();
  path.moveTo(left[0].x, left[0].y);
  for (let i = 1; i < left.length; i++) path.lineTo(left[i].x, left[i].y);
  for (let i = right.length - 1; i >= 0; i--) path.lineTo(right[i].x, right[i].y);
  path.closePath();
  ctx.globalAlpha = 0.95;
  ctx.fill(path);
  void quality;
}

/** Dry bristle brush. */
function paintBrush(
  ctx: CanvasRenderingContext2D,
  stroke: Stroke,
  points: StrokePoint[],
  quality: RenderQuality,
  style: StyleParams,
) {
  const avg = meanPressure(points);
  const rand = mulberry32(stroke.seed >>> 0);
  const n = quality === "draft" ? 3 : 7;
  const span = stroke.size * 1.45;
  for (let i = 0; i < n; i++) {
    const t = i / Math.max(1, n - 1);
    if (rand() < 0.1) continue;
    const off = (t - 0.5) * span + (rand() - 0.5) * stroke.size * 0.06;
    fillRibbon(
      ctx,
      offsetPoints(points, off, stroke.seed + i * 31, stroke.size * 0.05),
      {
        size: Math.max(stroke.size * (0.26 + (1 - Math.abs(t - 0.5)) * 0.18), 1),
        thinning: 0.5,
        smoothing: style.smoothing * 0.9,
        streamline: 0.32,
        simulatePressure: false,
        last: true,
      },
      0.55 + avg * 0.35,
    );
  }
}

/** High-frequency jagged edge. */
function paintRough(
  ctx: CanvasRenderingContext2D,
  stroke: Stroke,
  points: StrokePoint[],
  quality: RenderQuality,
  style: StyleParams,
) {
  const avg = meanPressure(points);
  const rand = mulberry32(stroke.seed >>> 0);
  const amp = stroke.size * (0.35 + (1 - style.corners) * 0.4);
  const wl = style.wavelength;
  const jagged = points.map((p, i) => {
    const prev = points[Math.max(0, i - 1)];
    const next = points[Math.min(points.length - 1, i + 1)];
    let tx = next.x - prev.x;
    let ty = next.y - prev.y;
    const len = Math.hypot(tx, ty) || 1;
    const nx = -ty / len;
    const ny = tx / len;
    const wave = Math.sin(i * (Math.PI * 2) / Math.max(2, wl * 0.35)) * amp;
    const j = (rand() - 0.5) * amp * 0.6;
    return { ...p, x: p.x + nx * (wave + j), y: p.y + ny * (wave + j) };
  });
  const opts: RibbonOpts = {
    size: stroke.size * (0.9 + avg * 0.25),
    thinning: 0.55,
    smoothing: Math.max(0.08, style.smoothing * 0.35),
    streamline: 0.12,
    simulatePressure: false,
    last: true,
  };
  if (jagged.length >= 2) {
    const path = ribbonPath(jagged, opts);
    ctx.globalAlpha = 0.9;
    ctx.fill(path);
    clipGrainIfFull(ctx, path, stroke.seed, 0.32, quality);
  } else {
    fillRibbon(ctx, jagged, opts, 0.9);
  }
}

/**
 * Stipple — dense irregular fleck cloud (organic, clustered).
 * Contrast with Dots / Spray: random packing, tiny varied flecks, no lattice.
 */
function paintStipple(
  ctx: CanvasRenderingContext2D,
  stroke: Stroke,
  points: StrokePoint[],
  quality: RenderQuality,
  style: StyleParams,
) {
  const rand = mulberry32(stroke.seed >>> 0);
  const draft = quality === "draft";
  // Floor size so 8px still reads as a stipple band, not dust.
  const band = Math.max(stroke.size * 1.35, 8);
  const step = draft
    ? Math.max(band * 0.42, 2.2)
    : Math.max(band * 0.11, 0.85);
  const minR = Math.max(band * 0.07, 0.7);
  alongPath(points, step, (x, y, pressure) => {
    const dots = draft
      ? 5 + Math.floor(pressure * 3)
      : 14 + Math.floor(pressure * 12);
    for (let k = 0; k < dots; k++) {
      // Cluster toward center with long irregular tails (organic, not a ring)
      const ang = rand() * Math.PI * 2;
      const cluster = Math.pow(rand(), 0.55);
      const rad = cluster * band * (0.55 + pressure * 0.55);
      const r =
        minR *
        (0.35 + rand() * 1.35) *
        (0.55 + pressure * 0.55) *
        (0.7 + (1 - cluster) * 0.5);
      ctx.globalAlpha = 0.35 + rand() * 0.55;
      ctx.beginPath();
      ctx.arc(
        x + Math.cos(ang) * rad + (rand() - 0.5) * band * 0.08,
        y + Math.sin(ang) * rad + (rand() - 0.5) * band * 0.08,
        r,
        0,
        Math.PI * 2,
      );
      ctx.fill();
    }
  });
  void style;
}

/**
 * Dry sketch / charcoal — organic taper, porous grit, frayed edges.
 * Matches dry-media reference (no tidy parallel ribbon / hatch grid).
 */
function paintSketchy(
  ctx: CanvasRenderingContext2D,
  stroke: Stroke,
  points: StrokePoint[],
  quality: RenderQuality,
  style: StyleParams,
) {
  const avg = meanPressure(points);
  const rand = mulberry32(stroke.seed >>> 0);
  const size = Math.max(stroke.size, 3.5);

  // Boost end taper: lower pressure near stroke ends
  const tapered = points.map((p, i) => {
    const u = points.length <= 1 ? 0.5 : i / (points.length - 1);
    const end = Math.min(u, 1 - u) * 2; // 0 at ends → 1 in middle
    const envelope = 0.18 + Math.pow(end, 0.65) * 0.9;
    return {
      ...p,
      pressure: Math.min(1, p.pressure * envelope * (0.75 + avg * 0.35)),
    };
  });

  // Soft porous body
  {
    const opts: RibbonOpts = {
      size: size * 1.55 * (0.75 + avg * 0.4),
      thinning: 0.78,
      smoothing: Math.max(0.12, style.smoothing * 0.4),
      streamline: 0.22,
      simulatePressure: false,
      last: true,
    };
    if (tapered.length >= 2) {
      const path = ribbonPath(tapered, opts);
      ctx.globalAlpha = 0.45 + avg * 0.25;
      ctx.fill(path);
      clipGrainIfFull(ctx, path, stroke.seed, 0.62, quality);
    } else {
      fillRibbon(ctx, tapered, opts, 0.55);
    }
  }

  // Dry bristle strands — irregular offsets, some broken (frayed edge)
  const n = quality === "draft" ? 3 : 9;
  const span = size * 1.15;
  for (let i = 0; i < n; i++) {
    const t = i / Math.max(1, n - 1);
    if (rand() < 0.14) continue; // missing bristle
    const off = (t - 0.5) * span + (rand() - 0.5) * size * 0.22;
    // Fray: edge strands are thinner + lower alpha
    const edge = Math.abs(t - 0.5) * 2;
    const strandPts = offsetPoints(
      tapered,
      off,
      stroke.seed + i * 23,
      size * (0.08 + edge * 0.2),
    ).map((p, idx) => {
      // Occasional skip near ends → streaky tips
      const u = tapered.length <= 1 ? 0.5 : idx / (tapered.length - 1);
      if ((u < 0.12 || u > 0.88) && rand() < 0.35) {
        return { ...p, pressure: p.pressure * 0.15 };
      }
      return p;
    });
    fillRibbon(
      ctx,
      strandPts,
      {
        size: Math.max(size * (0.22 - edge * 0.08), 0.9),
        thinning: 0.82,
        smoothing: Math.max(0.06, style.smoothing * 0.25),
        streamline: 0.1,
        simulatePressure: false,
        last: true,
      },
      (0.5 + avg * 0.35) * (1 - edge * 0.35),
    );
  }

  // Grit / flecks along frayed edges (full only — too costly live)
  if (quality === "full") {
    const step = Math.max(size * 0.4, 2);
    alongPath(tapered, step, (x, y, pressure, tx, ty) => {
      if (rand() > 0.55 + pressure * 0.25) return;
      const nx = -ty;
      const ny = tx;
      const flecks = 1 + Math.floor(rand() * 3);
      for (let k = 0; k < flecks; k++) {
        const side = (rand() < 0.5 ? -1 : 1) * size * (0.35 + rand() * 0.85);
        ctx.globalAlpha = 0.15 + rand() * 0.35;
        ctx.beginPath();
        ctx.arc(
          x + nx * side + (rand() - 0.5) * size * 0.3,
          y + ny * side + (rand() - 0.5) * size * 0.3,
          0.35 + rand() * size * 0.12,
          0,
          Math.PI * 2,
        );
        ctx.fill();
      }
    });
  }
}

function paintParallel(
  ctx: CanvasRenderingContext2D,
  stroke: Stroke,
  points: StrokePoint[],
  _quality: RenderQuality,
  style: StyleParams,
) {
  const gap = Math.max(stroke.size * 0.55, 2);
  const opts: RibbonOpts = {
    size: Math.max(stroke.size * 0.35, 1),
    thinning: 0.65,
    smoothing: style.smoothing,
    streamline: 0.4 + style.corners * 0.25,
    simulatePressure: false,
    last: true,
  };
  fillRibbon(ctx, offsetPoints(points, -gap / 2, stroke.seed, 0), opts, 0.95);
  fillRibbon(ctx, offsetPoints(points, gap / 2, stroke.seed ^ 3, 0), opts, 0.95);
}

/** Hollow tube — stroke the ribbon outline. */
function paintOutline(
  ctx: CanvasRenderingContext2D,
  stroke: Stroke,
  points: StrokePoint[],
  _quality: RenderQuality,
  style: StyleParams,
) {
  if (points.length < 2) {
    fillRibbon(
      ctx,
      points,
      {
        size: stroke.size,
        thinning: 0.5,
        smoothing: style.smoothing,
        streamline: 0.4,
        simulatePressure: false,
        last: true,
      },
      0.9,
    );
    return;
  }
  const path = ribbonPath(points, {
    size: stroke.size * 1.4,
    thinning: 0.25,
    smoothing: style.smoothing,
    streamline: 0.45 + style.corners * 0.2,
    simulatePressure: false,
    last: true,
  });
  ctx.globalAlpha = 0.95;
  ctx.lineWidth = Math.max(stroke.size * 0.22, 1);
  ctx.lineJoin = "round";
  ctx.lineCap = "round";
  ctx.stroke(path);
}

function paintDashed(
  ctx: CanvasRenderingContext2D,
  stroke: Stroke,
  points: StrokePoint[],
  quality: RenderQuality,
  style: StyleParams,
) {
  const dash = Math.max(stroke.size * 1.8, style.wavelength * 0.85);
  const gap = Math.max(stroke.size * 1.1, style.wavelength * 0.55);
  const period = dash + gap;
  const half = Math.max(stroke.size * 0.55, 1.2);
  const samples: StrokePoint[] = [];
  alongPath(
    points,
    quality === "draft" ? Math.max(half * 0.8, 2) : Math.max(half * 0.45, 1.2),
    (x, y, pressure, _tx, _ty, dist) => {
      const phase = dist % period;
      if (phase > dash) return;
      samples.push({ x, y, pressure, t: dist });
    },
  );
  // Group contiguous samples into dash ribbons
  let run: StrokePoint[] = [];
  const flush = () => {
    if (run.length === 0) return;
    fillRibbon(
      ctx,
      run,
      {
        size: stroke.size * 1.05,
        thinning: 0.2,
        smoothing: 0.25,
        streamline: 0.15,
        simulatePressure: false,
        last: true,
      },
      0.95,
    );
    run = [];
  };
  for (let i = 0; i < samples.length; i++) {
    if (run.length === 0) {
      run.push(samples[i]);
      continue;
    }
    const prev = samples[i - 1];
    const cur = samples[i];
    if (Math.hypot(cur.x - prev.x, cur.y - prev.y) > half * 2.5) flush();
    run.push(cur);
  }
  flush();
}

function paintDotted(
  ctx: CanvasRenderingContext2D,
  stroke: Stroke,
  points: StrokePoint[],
  _quality: RenderQuality,
  style: StyleParams,
) {
  const step = Math.max(stroke.size * 1.35, style.wavelength * 0.7);
  const r = Math.max(stroke.size * 0.48, 1.2);
  alongPath(points, step, (x, y, pressure) => {
    ctx.globalAlpha = 0.75 + pressure * 0.25;
    ctx.beginPath();
    ctx.arc(x, y, r * (0.65 + pressure * 0.45), 0, Math.PI * 2);
    ctx.fill();
  });
}

/**
 * Dots — discrete round particles on a regular lattice along the path.
 * Contrast with Stipple / Spray: even spacing, clear gaps, consistent size.
 */
function paintDots(
  ctx: CanvasRenderingContext2D,
  points: StrokePoint[],
  stroke: Stroke,
  quality: RenderQuality,
) {
  const rand = mulberry32((stroke.seed ^ 0x5f3759df) >>> 0);
  const draft = quality === "draft";
  const size = Math.max(stroke.size, 3.5);
  const spacing = Math.max(size * (draft ? 1.55 : 1.35), draft ? 5.5 : 4.2);
  const rDot = Math.max(size * 0.28, 1.35);
  const rowGap = size * 0.85;

  alongPath(points, spacing, (px, py, pressure, tx, ty, dist) => {
    const nx = -ty;
    const ny = tx;
    const stagger = Math.floor(dist / spacing) % 2 === 1 ? spacing * 0.5 : 0;
    const rows = draft ? [-1, 0, 1] : [-1.5, -0.5, 0.5, 1.5];
    const scale = 0.7 + pressure * 0.45;
    for (const row of rows) {
      const j = (rand() - 0.5) * size * 0.12;
      const x = px + nx * row * rowGap + tx * stagger + j * nx;
      const y = py + ny * row * rowGap + ty * stagger + j * ny;
      const r = rDot * scale * (0.9 + rand() * 0.15);
      ctx.globalAlpha = 0.55 + pressure * 0.35;
      ctx.beginPath();
      ctx.arc(x, y, r, 0, Math.PI * 2);
      ctx.fill();
    }
  });
}

/**
 * Spray — aerosol grit matching spray-paint reference: dense core axis,
 * conical scatter, soft density falloff, tiny crisp particles (no blur).
 */
function paintSpray(
  ctx: CanvasRenderingContext2D,
  points: StrokePoint[],
  stroke: Stroke,
  quality: RenderQuality,
) {
  const rand = mulberry32((stroke.seed ^ 0xa5a5a5a5) >>> 0);
  const draft = quality === "draft";
  const size = Math.max(stroke.size, 4);
  const spacing = draft
    ? Math.max(size * 0.55, 3.2)
    : Math.max(size * 0.22, 1.4);
  const reach = size * 2.4;
  const halfW = size * 1.85;

  alongPath(points, spacing, (px, py, pressure, tx, ty) => {
    const nx = -ty;
    const ny = tx;
    const count = draft
      ? 14 + Math.floor(pressure * 16)
      : 48 + Math.floor(pressure * 55);
    for (let k = 0; k < count; k++) {
      const depth = Math.pow(rand(), 0.62);
      const g = (rand() + rand() + rand() + rand() - 2) * 0.5;
      const cone = 0.12 + depth * 0.88;
      const across = g * halfW * cone * (0.65 + pressure * 0.5);
      const forward = depth * reach * (0.75 + pressure * 0.4);
      const edge = Math.min(1, Math.abs(across) / (halfW * cone + 0.001));
      if (rand() < edge * edge * 0.72) continue;
      if (rand() < depth * depth * 0.35) continue;

      const x = px + tx * forward + nx * across;
      const y = py + ty * forward + ny * across;
      const r =
        (0.3 + rand() * 0.75) * Math.max(size * (draft ? 0.07 : 0.055), 0.45);
      ctx.globalAlpha =
        (0.4 + rand() * 0.55) *
        (1 - edge * 0.7) *
        (1 - depth * 0.35) *
        (0.45 + pressure * 0.55);
      ctx.beginPath();
      ctx.arc(x, y, r, 0, Math.PI * 2);
      ctx.fill();
    }
  });
}

/**
 * Board chalk — dense dry flecks/clusters with porous gaps and crumbly edges.
 * Full: rotated irregular flakes. Draft: same density feel via cheaper fillRects.
 */
function paintChalk(
  ctx: CanvasRenderingContext2D,
  stroke: Stroke,
  points: StrokePoint[],
  quality: RenderQuality,
  style: StyleParams,
) {
  const avg = meanPressure(points);
  const rand = mulberry32(stroke.seed >>> 0);
  const size = Math.max(stroke.size, 6.5);
  const halfW = size * (1.05 + avg * 0.4) * (0.85 + style.corners * 0.2);
  const draft = quality === "draft";

  function flakeFull(x: number, y: number, s: number, a: number) {
    ctx.globalAlpha = a;
    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(rand() * Math.PI);
    if (rand() < 0.55) {
      ctx.fillRect(-s * 0.7, -s * 0.35, s * 1.4, s * 0.7);
    } else {
      ctx.beginPath();
      ctx.ellipse(0, 0, s * (0.6 + rand() * 0.5), s * (0.35 + rand() * 0.4), 0, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.restore();
  }

  // Draft: no save/restore/rotate — still particulate chalk, far cheaper
  function flakeDraft(x: number, y: number, s: number, a: number) {
    ctx.globalAlpha = a;
    ctx.fillRect(x - s * 0.7, y - s * 0.35, s * 1.4, s * 0.7);
  }

  const flake = draft ? flakeDraft : flakeFull;
  const step = draft
    ? Math.max(size * 0.38, 2.2)
    : Math.max(size * 0.09, 0.65);

  alongPath(points, step, (x, y, pressure, tx, ty) => {
    const nx = -ty;
    const ny = tx;
    const count = draft
      ? 5 + Math.floor(pressure * 4)
      : 18 + Math.floor(pressure * 18);

    for (let k = 0; k < count; k++) {
      const u = (rand() + rand() + rand()) / 3;
      const signed = (u - 0.5) * 2;
      const across = signed * halfW * (0.55 + pressure * 0.55);
      const along = (rand() - 0.5) * size * 0.55;
      const edge = Math.abs(signed);
      if (rand() < (draft ? 0.08 : 0.1) + edge * 0.18) continue;
      const px = x + nx * across + tx * along;
      const py = y + ny * across + ty * along;
      const s =
        (0.55 + rand() * 1.25) *
        Math.max(size * (draft ? 0.16 : 0.1), draft ? 1.1 : 0.75) *
        (1.05 - edge * 0.3) *
        (0.7 + pressure * 0.45);
      const a =
        (0.5 + rand() * 0.5) * (0.65 + pressure * 0.4) * (1 - edge * 0.2);
      flake(px, py, s, a);
    }

    if (!draft && rand() < 0.55) {
      const crumbs = 2 + Math.floor(rand() * 3);
      for (let c = 0; c < crumbs; c++) {
        const side = (rand() < 0.5 ? -1 : 1) * halfW * (0.85 + rand() * 0.55);
        flakeFull(
          x + nx * side + tx * (rand() - 0.5) * size,
          y + ny * side + ty * (rand() - 0.5) * size,
          (0.4 + rand() * 1.0) * Math.max(size * 0.08, 0.55),
          0.35 + rand() * 0.4,
        );
      }
    }
  });
}

/** Wet ink — translucent bleed + opaque core flow + pooling. */
function paintInk(
  ctx: CanvasRenderingContext2D,
  stroke: Stroke,
  points: StrokePoint[],
  quality: RenderQuality,
  style: StyleParams,
) {
  const avg = meanPressure(points);
  const rand = mulberry32(stroke.seed >>> 0);
  const size = Math.max(stroke.size, 3);
  const soft = Math.min(0.92, style.smoothing + 0.2);
  const stream = 0.4 + style.corners * 0.25;

  // 1) Soft translucent wash / bleed under the stroke
  const washLayers = quality === "draft" ? 1 : 3;
  for (let i = 0; i < washLayers; i++) {
    const ox = (rand() - 0.5) * size * (0.55 + avg * 0.5);
    const oy = (rand() - 0.5) * size * (0.55 + avg * 0.5);
    fillRibbon(
      ctx,
      points.map((p) => ({ ...p, x: p.x + ox, y: p.y + oy })),
      {
        size: size * (2.1 + i * 0.55) * (0.65 + avg * 0.5),
        thinning: 0.28,
        smoothing: soft,
        streamline: stream,
        simulatePressure: false,
        last: true,
      },
      (0.08 + i * 0.04) * (0.55 + avg * 0.5),
    );
  }

  // 2) Semi-opaque mid body — uneven wet edge
  const body = points.map((p, i) => {
    const prev = points[Math.max(0, i - 1)];
    const next = points[Math.min(points.length - 1, i + 1)];
    let tx = next.x - prev.x;
    let ty = next.y - prev.y;
    const len = Math.hypot(tx, ty) || 1;
    const nx = -ty / len;
    const ny = tx / len;
    const wobble = (rand() - 0.5) * size * 0.18 * (0.4 + p.pressure);
    return {
      ...p,
      x: p.x + nx * wobble,
      y: p.y + ny * wobble,
      pressure: Math.min(1, p.pressure * (0.75 + rand() * 0.35)),
    };
  });
  fillRibbon(
    ctx,
    body,
    {
      size: size * 1.35 * (0.7 + avg * 0.45),
      thinning: 0.55,
      smoothing: soft * 0.9,
      streamline: stream * 0.85,
      simulatePressure: false,
      last: true,
    },
    0.38 + avg * 0.28,
  );

  // 3) Opaque dark core — the “ink line” sitting in the wash
  const coreN = quality === "draft" ? 1 : 3;
  for (let i = 0; i < coreN; i++) {
    const off = (i - (coreN - 1) / 2) * size * 0.12;
    fillRibbon(
      ctx,
      offsetPoints(points, off, stroke.seed + i * 41, size * 0.04),
      {
        size: Math.max(size * (0.42 - i * 0.06) * (0.65 + avg * 0.5), 1.2),
        thinning: 0.72,
        smoothing: soft * 0.75,
        streamline: 0.35,
        simulatePressure: false,
        last: true,
      },
      0.72 + avg * 0.22 - i * 0.08,
    );
  }

  // 4) Wet edge ridges + ink pools where pressure spikes / path bends
  if (quality === "full" && points.length > 2) {
    const step = Math.max(size * 0.7, 4);
    alongPath(points, step, (x, y, pressure, tx, ty, dist) => {
      const bend =
        Math.abs(Math.sin(dist * 0.08 + stroke.seed * 0.001)) * 0.5 + pressure * 0.5;
      if (rand() < 0.35 + bend * 0.4) {
        const nx = -ty;
        const ny = tx;
        const side = (rand() < 0.5 ? -1 : 1) * size * (0.35 + rand() * 0.55);
        ctx.globalAlpha = 0.12 + rand() * 0.22;
        ctx.beginPath();
        ctx.ellipse(
          x + nx * side,
          y + ny * side,
          size * (0.18 + rand() * 0.28) * (0.5 + pressure),
          size * (0.08 + rand() * 0.12),
          Math.atan2(ty, tx),
          0,
          Math.PI * 2,
        );
        ctx.fill();
      }
      // Dense pool on heavy pressure
      if (pressure > 0.72 && rand() < 0.28) {
        ctx.globalAlpha = 0.35 + rand() * 0.35;
        ctx.beginPath();
        ctx.arc(
          x + (rand() - 0.5) * size * 0.2,
          y + (rand() - 0.5) * size * 0.2,
          size * (0.2 + rand() * 0.25) * pressure,
          0,
          Math.PI * 2,
        );
        ctx.fill();
      }
    });
  }
}

/**
 * Airbrush — soft radial stamps matching the reference: dense core,
 * ~4×-wide feather, hardness 0, seamless overlap (no hard ribbon edge).
 */
function paintAirbrush(
  ctx: CanvasRenderingContext2D,
  stroke: Stroke,
  points: StrokePoint[],
  quality: RenderQuality,
  style: StyleParams,
) {
  const draft = quality === "draft";
  const size = Math.max(stroke.size, 3.5);
  // Soft radius ≈ 2× size → total glow width ~4× a hard core of size.
  const radius = size * (1.85 + style.corners * 0.25);
  const color =
    typeof ctx.fillStyle === "string" && ctx.fillStyle
      ? ctx.fillStyle
      : stroke.color;
  const tip = airbrushTip(radius, color);
  const d = tip.width;
  // Tight spacing so stamps fuse into a continuous soft tube (no scallops).
  const spacing = draft
    ? Math.max(radius * 0.32, 2.2)
    : Math.max(radius * 0.16, 1.2);
  // Low flow — density builds along the path like real airbrush.
  const baseFlow = draft ? 0.2 : 0.14;

  ctx.save();
  ctx.globalCompositeOperation = "source-over";
  alongPath(points, spacing, (x, y, pressure) => {
    const flow = baseFlow * (0.55 + pressure * 0.7);
    const scale = 0.88 + pressure * 0.22;
    const rw = d * scale;
    ctx.globalAlpha = flow;
    ctx.drawImage(tip, x - rw / 2, y - rw / 2, rw, rw);
  });
  ctx.restore();
}

/** Axis-aligned pixel steps. */
function paintPixel(
  ctx: CanvasRenderingContext2D,
  stroke: Stroke,
  points: StrokePoint[],
  _quality: RenderQuality,
  style: StyleParams,
) {
  const cell = Math.max(2, Math.round(stroke.size * 0.85));
  const seen = new Set<string>();
  alongPath(points, Math.max(cell * 0.4, 1), (x, y, pressure) => {
    const gx = Math.floor(x / cell) * cell;
    const gy = Math.floor(y / cell) * cell;
    const key = `${gx},${gy}`;
    if (seen.has(key)) return;
    seen.add(key);
    ctx.globalAlpha = 0.7 + pressure * 0.3;
    ctx.fillRect(gx, gy, cell, cell);
  });
  void style;
}

/** Halftone — dots sized by pressure / distance from stroke centerline envelope. */
function paintHalftone(
  ctx: CanvasRenderingContext2D,
  stroke: Stroke,
  points: StrokePoint[],
  quality: RenderQuality,
  style: StyleParams,
) {
  const step =
    quality === "draft"
      ? Math.max(stroke.size * 0.9, 4)
      : Math.max(stroke.size * 0.45, 2);
  alongPath(points, step, (x, y, pressure, tx, ty) => {
    const nx = -ty;
    const ny = tx;
    const rows = quality === "draft" ? 1 : 3;
    for (let r = -rows; r <= rows; r++) {
      const fall = 1 - Math.abs(r) / (rows + 0.5);
      const rad = Math.max(0.4, stroke.size * 0.22 * fall * (0.45 + pressure * 0.7));
      ctx.globalAlpha = 0.25 + fall * 0.55 * pressure;
      ctx.beginPath();
      ctx.arc(
        x + nx * r * step * 0.55,
        y + ny * r * step * 0.55,
        rad,
        0,
        Math.PI * 2,
      );
      ctx.fill();
    }
  });
  void style;
}

function paintSquares(
  ctx: CanvasRenderingContext2D,
  stroke: Stroke,
  points: StrokePoint[],
  _quality: RenderQuality,
  style: StyleParams,
) {
  const step = Math.max(stroke.size * 1.25, style.wavelength * 0.65);
  const s = Math.max(stroke.size * 0.7, 2);
  alongPath(points, step, (x, y, pressure, tx, ty) => {
    const ang = Math.atan2(ty, tx);
    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(ang);
    ctx.globalAlpha = 0.75 + pressure * 0.25;
    ctx.fillRect(-s / 2, -s / 2, s, s);
    ctx.restore();
  });
}

function paintPreset(
  ctx: CanvasRenderingContext2D,
  id: P5BrushId,
  stroke: Stroke,
  points: StrokePoint[],
  quality: RenderQuality,
) {
  const style = styleOf(stroke);
  switch (id) {
    case "smooth":
      paintSmooth(ctx, stroke, points, quality, style);
      return;
    case "calligraphy":
      paintCalligraphy(ctx, stroke, points, quality, style);
      return;
    case "brush":
      paintBrush(ctx, stroke, points, quality, style);
      return;
    case "rough":
      paintRough(ctx, stroke, points, quality, style);
      return;
    case "stipple":
      paintStipple(ctx, stroke, points, quality, style);
      return;
    case "sketchy":
      paintSketchy(ctx, stroke, points, quality, style);
      return;
    case "parallel":
      paintParallel(ctx, stroke, points, quality, style);
      return;
    case "outline":
      paintOutline(ctx, stroke, points, quality, style);
      return;
    case "dashed":
      paintDashed(ctx, stroke, points, quality, style);
      return;
    case "dotted":
      paintDotted(ctx, stroke, points, quality, style);
      return;
    case "dots":
      paintDots(ctx, points, stroke, quality);
      return;
    case "spray":
      paintSpray(ctx, points, stroke, quality);
      return;
    case "chalk":
      paintChalk(ctx, stroke, points, quality, style);
      return;
    case "ink":
      paintInk(ctx, stroke, points, quality, style);
      return;
    case "airbrush":
      paintAirbrush(ctx, stroke, points, quality, style);
      return;
    case "pixel":
      paintPixel(ctx, stroke, points, quality, style);
      return;
    case "halftone":
      paintHalftone(ctx, stroke, points, quality, style);
      return;
    case "squares":
      paintSquares(ctx, stroke, points, quality, style);
      return;
  }
}

export function paintPackBrush(
  ctx: CanvasRenderingContext2D,
  stroke: Stroke,
  points: StrokePoint[],
  color: string,
  quality: RenderQuality,
  live = false,
) {
  const preset = coerceP5Brush(stroke.p5Brush) as P5BrushId | undefined;
  ctx.fillStyle = color;
  ctx.strokeStyle = color;
  const style = styleOf(stroke);

  // Thin dense pointer samples on draft — more aggressive while the stroke is live.
  const minDist =
    quality === "draft"
      ? live
        ? Math.max(stroke.size * 0.65, 2.8)
        : Math.max(stroke.size * 0.4, 1.8)
      : 0;
  const pts = minDist > 0 ? thinPoints(points, minDist) : points;
  const avg = meanPressure(pts);

  if (!preset) {
    if (stroke.brush === "pen") {
      fillRibbon(
        ctx,
        pts,
        {
          size: Math.max(stroke.size * 0.5, 1),
          thinning: 0.55,
          smoothing: style.smoothing,
          streamline: 0.3,
          simulatePressure: false,
          last: true,
        },
        0.75 + avg * 0.22,
      );
      return;
    }
    if (stroke.brush === "marker") {
      fillRibbon(
        ctx,
        pts,
        {
          size: stroke.size * 2 * (0.75 + avg * 0.35),
          thinning: 0.28,
          smoothing: style.smoothing,
          streamline: 0.5,
          simulatePressure: false,
          last: true,
        },
        0.4 + avg * 0.25,
      );
      return;
    }
    fillRibbon(
      ctx,
      pts,
      {
        size: stroke.size,
        thinning: 0.7,
        smoothing: style.smoothing,
        streamline: quality === "draft" ? 0.3 : 0.5,
        simulatePressure: false,
        last: true,
      },
      1,
    );
    if (stroke.grain && quality === "full" && pts.length >= 2) {
      clipGrain(
        ctx,
        ribbonPath(pts, {
          size: stroke.size,
          thinning: 0.7,
          smoothing: style.smoothing,
          streamline: 0.5,
          simulatePressure: false,
          last: true,
        }),
        stroke.seed,
        0.28,
      );
    }
    return;
  }

  // Committed brushes: paint once into a bbox stamp, blit thereafter.
  // Skip while live (points change every move), boiling, or very short strokes.
  if (
    quality === "draft" &&
    !live &&
    !stroke.jitter &&
    HEAVY_DRAFT_PRESETS.has(preset) &&
    pts.length >= 4
  ) {
    const key = draftCacheKey(stroke, preset, pts, color);
    let stamp = draftStampCache.get(key);
    if (!stamp) {
      const pad = Math.max(
        stroke.size *
          (preset === "airbrush" || preset === "spray" ? 5.5 : 3.5),
        24,
      );
      const b = strokeBounds(pts, pad);
      // Cap stamp size so a canvas-spanning stroke can't allocate a monster buffer
      const maxSide = 2048;
      const scale =
        b.w > maxSide || b.h > maxSide
          ? Math.min(maxSide / b.w, maxSide / b.h)
          : 1;
      const cw = Math.max(1, Math.ceil(b.w * scale));
      const ch = Math.max(1, Math.ceil(b.h * scale));
      const canvas = document.createElement("canvas");
      canvas.width = cw;
      canvas.height = ch;
      const sctx = canvas.getContext("2d");
      if (sctx) {
        sctx.setTransform(scale, 0, 0, scale, -b.x * scale, -b.y * scale);
        sctx.fillStyle = color;
        sctx.strokeStyle = color;
        paintPreset(sctx, preset, stroke, pts, "draft");
        stamp = { canvas, x: b.x, y: b.y, w: b.w, h: b.h };
        draftStampCache.set(key, stamp);
        trimDraftCache();
      }
    }
    if (stamp) {
      ctx.drawImage(stamp.canvas, stamp.x, stamp.y, stamp.w, stamp.h);
      return;
    }
  }

  paintPreset(ctx, preset, stroke, pts, quality);
}
