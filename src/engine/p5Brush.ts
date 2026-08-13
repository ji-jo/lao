/**
 * Offscreen p5.brush (standalone) → Canvas2D stamp.
 * Preview and export share this path so boil seeds stay deterministic.
 */

import * as brush from "p5.brush/standalone";
import type { Stroke, StrokePoint } from "@/model/types";
import {
  ensureCustomP5Brushes,
  isP5BrushId,
  type P5BrushId,
} from "@/engine/p5BrushPresets";

export type { P5BrushId };
export {
  DEFAULT_P5_BRUSH,
  P5_BRUSH_IDS,
  P5_BRUSHES,
  isP5BrushId,
} from "@/engine/p5BrushPresets";

type BrushApi = typeof brush;

let glCanvas: HTMLCanvasElement | null = null;
let glW = 0;
let glH = 0;
let ready = false;
let warned = false;

/**
 * p5.brush `clear()` uses clearColor(1,1,1,0). With premultiplied WebGL,
 * `drawImage(glCanvas → existing 2D dest)` turns those pixels opaque white.
 * Always copy GL → a freshly cleared 2D canvas first, then blit that.
 */
let transferCanvas: HTMLCanvasElement | null = null;
let transferCtx: CanvasRenderingContext2D | null = null;

const stampCache = new Map<string, HTMLCanvasElement>();
const CACHE_LIMIT = 48;

function canUseWebGL2(): boolean {
  if (typeof document === "undefined") return false;
  try {
    const probe = document.createElement("canvas");
    return !!probe.getContext("webgl2");
  } catch {
    return false;
  }
}

/**
 * Project-space size of the destination. Stage draft canvases are half-res
 * with `setTransform(DRAFT_SCALE,…)`, so `canvas.width` is NOT project width.
 */
export function projectSizeFromCtx(ctx: CanvasRenderingContext2D): {
  width: number;
  height: number;
} {
  const t = ctx.getTransform();
  const sx = Math.abs(t.a) || 1;
  const sy = Math.abs(t.d) || 1;
  return {
    width: Math.max(1, Math.round(ctx.canvas.width / sx)),
    height: Math.max(1, Math.round(ctx.canvas.height / sy)),
  };
}

function ensureSurface(width: number, height: number): boolean {
  if (!canUseWebGL2()) {
    if (!warned) {
      warned = true;
      console.warn("[lao] p5.brush needs WebGL2 — falling back to freehand");
    }
    return false;
  }

  const w = Math.max(1, Math.round(width));
  const h = Math.max(1, Math.round(height));

  if (!glCanvas) {
    glCanvas = document.createElement("canvas");
    glCanvas.width = w;
    glCanvas.height = h;
    glCanvas.style.cssText =
      "position:fixed;left:-99999px;top:0;width:1px;height:1px;pointer-events:none;opacity:0;";
    document.body.appendChild(glCanvas);
    try {
      brush.load(glCanvas);
    } catch (err) {
      console.warn("[lao] p5.brush.load failed", err);
      return false;
    }
    ensureCustomP5Brushes(brush.add.bind(brush) as BrushApi["add"]);
    // Scale tip weights roughly with artboard size (library default is for ~200–800 canvases).
    brush.scaleBrushes(Math.max(1, Math.min(w, h) / 200));
    ready = true;
    glW = w;
    glH = h;
    return true;
  }

  if (glW !== w || glH !== h) {
    glCanvas.width = w;
    glCanvas.height = h;
    try {
      brush.load(glCanvas);
    } catch (err) {
      console.warn("[lao] p5.brush.reload failed", err);
      return false;
    }
    brush.scaleBrushes(Math.max(1, Math.min(w, h) / 200));
    glW = w;
    glH = h;
    stampCache.clear();
    transferCanvas = null;
    transferCtx = null;
  }

  return ready;
}

function brushSizeMultiplier(size: number): number {
  return Math.max(0.2, size / 8);
}

function toSplinePoints(points: StrokePoint[]): [number, number, number][] {
  return points.map((p) => [p.x, p.y, Math.max(0.05, Math.min(1, p.pressure))]);
}

function cacheKey(
  stroke: Stroke,
  points: StrokePoint[],
  color: string,
  quality: "draft" | "full",
): string {
  const last = points[points.length - 1];
  return [
    stroke.id,
    stroke.p5Brush,
    stroke.seed,
    stroke.size,
    color,
    quality,
    points.length,
    last ? `${last.x.toFixed(1)},${last.y.toFixed(1)},${last.pressure.toFixed(2)}` : "",
  ].join("|");
}

function trimCache() {
  if (stampCache.size <= CACHE_LIMIT) return;
  const drop = stampCache.size - CACHE_LIMIT;
  let i = 0;
  for (const key of stampCache.keys()) {
    stampCache.delete(key);
    if (++i >= drop) break;
  }
}

function drawOnGl(
  preset: P5BrushId,
  color: string,
  size: number,
  seed: number,
  points: StrokePoint[],
  quality: "draft" | "full",
): boolean {
  if (!glCanvas || !ensureSurface(glW || 1, glH || 1)) return false;

  ensureCustomP5Brushes(brush.add.bind(brush) as BrushApi["add"]);

  let pts = points;
  if (quality === "draft" && pts.length > 64) {
    const step = Math.ceil(pts.length / 48);
    const sampled: StrokePoint[] = [];
    for (let i = 0; i < pts.length; i += step) sampled.push(pts[i]);
    const last = pts[pts.length - 1];
    if (sampled[sampled.length - 1] !== last) sampled.push(last);
    pts = sampled;
  }

  brush.seed(seed);
  brush.noiseSeed(seed);
  // Transparent clear — never a solid fill (that painted the white box).
  brush.clear();
  brush.push();
  brush.translate(-glW / 2, -glH / 2);
  brush.set(preset, color, brushSizeMultiplier(size));

  if (pts.length === 1) {
    const p = pts[0];
    brush.beginStroke("curve", p.x, p.y);
    brush.move(p.x + 0.01, p.y, Math.max(0.05, p.pressure));
    brush.endStroke(p.x + 0.01, p.y);
  } else {
    brush.spline(toSplinePoints(pts), quality === "draft" ? 0.35 : 0.5);
  }

  brush.pop();
  brush.render();
  return true;
}

/** Copy WebGL → cleared 2D so (1,1,1,0) becomes real transparency. */
function glToTransfer2d(): HTMLCanvasElement | null {
  if (!glCanvas) return null;
  if (
    !transferCanvas ||
    !transferCtx ||
    transferCanvas.width !== glW ||
    transferCanvas.height !== glH
  ) {
    transferCanvas = document.createElement("canvas");
    transferCanvas.width = glW;
    transferCanvas.height = glH;
    transferCtx = transferCanvas.getContext("2d", { alpha: true, willReadFrequently: true });
    if (!transferCtx) return null;
  }
  transferCtx.setTransform(1, 0, 0, 1, 0, 0);
  transferCtx.clearRect(0, 0, glW, glH);
  transferCtx.drawImage(glCanvas, 0, 0);
  // Chrome keeps an invalid premultiplied GPU buffer from clearColor(1,1,1,0);
  // drawImage of that onto any dest paints opaque white. CPU round-trip fixes it.
  const img = transferCtx.getImageData(0, 0, glW, glH);
  transferCtx.putImageData(img, 0, 0);
  return transferCanvas;
}

/** Blit stamp into ctx in project units (respects DRAFT_SCALE transform). */
function blitStamp(
  ctx: CanvasRenderingContext2D,
  source: CanvasImageSource,
  projectW: number,
  projectH: number,
) {
  ctx.drawImage(source, 0, 0, glW, glH, 0, 0, projectW, projectH);
}

/**
 * Stamp a p5.brush stroke into a 2D context. Returns false if unavailable
 * (caller should fall back to perfect-freehand).
 *
 * `opts.width` / `opts.height` must be **project** pixels, not the draft
 * backing-store size.
 */
export function stampP5Stroke(
  ctx: CanvasRenderingContext2D,
  stroke: Stroke,
  points: StrokePoint[],
  opts: {
    color: string;
    quality: "draft" | "full";
    width: number;
    height: number;
    /** Skip cache (live stroke while drawing). */
    live?: boolean;
  },
): boolean {
  if (!stroke.p5Brush || !isP5BrushId(stroke.p5Brush)) return false;
  if (points.length === 0) return false;
  if (!ensureSurface(opts.width, opts.height)) return false;

  const key = cacheKey(stroke, points, opts.color, opts.quality);
  if (!opts.live) {
    const hit = stampCache.get(key);
    if (hit) {
      blitStamp(ctx, hit, opts.width, opts.height);
      return true;
    }
  }

  if (!drawOnGl(stroke.p5Brush, opts.color, stroke.size, stroke.seed, points, opts.quality)) {
    return false;
  }

  const transfer = glToTransfer2d();
  if (!transfer) return false;

  if (opts.live) {
    blitStamp(ctx, transfer, opts.width, opts.height);
    return true;
  }

  const stamp = document.createElement("canvas");
  stamp.width = glW;
  stamp.height = glH;
  const sctx = stamp.getContext("2d", { alpha: true });
  if (!sctx) {
    blitStamp(ctx, transfer, opts.width, opts.height);
    return true;
  }
  sctx.clearRect(0, 0, glW, glH);
  sctx.drawImage(transfer, 0, 0);
  stampCache.set(key, stamp);
  trimCache();
  blitStamp(ctx, stamp, opts.width, opts.height);
  return true;
}

/** Drop cached stamps (e.g. after project resize). */
export function clearP5StampCache(): void {
  stampCache.clear();
}

export function strokeUsesP5Brush(stroke: Stroke): boolean {
  return (
    stroke.brush !== "eraser" &&
    !!stroke.p5Brush &&
    isP5BrushId(stroke.p5Brush) &&
    !(stroke.bezierNodes && stroke.bezierNodes.length > 0)
  );
}
