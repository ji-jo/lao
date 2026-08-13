import type { TextElement, TextPathSettings, TextPathShape } from "@/model/types";
import { layoutText } from "@/engine/textLayout";
import { textFontStack } from "@/lib/google-fonts";
import { textDisplayString } from "@/engine/textStyle";

export type PathGlyph = {
  char: string;
  /** Baseline-center position in local text-box coords */
  x: number;
  y: number;
  angle: number;
};

type PathPoint = { x: number; y: number; angle: number };

/** Vertical amplitude for open paths (arch / wave / s-curve). */
export function pathAmplitude(fontSize: number): number {
  return Math.max(12, fontSize * 0.55);
}

/**
 * Point on a unit path spanning width `w` (x from 0…w).
 * `u` is 0…1 along the path (not arc length).
 * Open paths are centered vertically around `originY`.
 */
function pathPointAt(
  shape: Exclude<TextPathShape, "none">,
  u: number,
  w: number,
  amp: number,
  originY: number,
): PathPoint {
  const t = Math.max(0, Math.min(1, u));

  if (shape === "circle") {
    // Top-start; full circle with diameter = w (fits in [0,w]×[0,w]).
    const r = Math.max(8, w / 2);
    const cx = w / 2;
    const cy = r;
    const a = -Math.PI / 2 + t * Math.PI * 2;
    return {
      x: cx + Math.cos(a) * r,
      y: cy + Math.sin(a) * r,
      angle: a + Math.PI / 2,
    };
  }

  if (shape === "arch") {
    // Upward bow (smaller y at center). Chord = w, sagitta = amp.
    const x = t * w;
    // dy/dx of circular arch approx via parabola: y = originY - 4*amp*t*(1-t)
    const y = originY - 4 * amp * t * (1 - t);
    const dydx = (-4 * amp * (1 - 2 * t)) / Math.max(1, w);
    return { x, y, angle: Math.atan(dydx) };
  }

  if (shape === "wave") {
    const x = t * w;
    const y = originY + Math.sin(t * Math.PI * 2) * amp;
    const dydx = (Math.cos(t * Math.PI * 2) * amp * Math.PI * 2) / Math.max(1, w);
    return { x, y, angle: Math.atan(dydx) };
  }

  // scurve — smooth S (cubic ease through center)
  const x = t * w;
  // Smoothstep S: y' continuous
  const s = t * t * (3 - 2 * t);
  const y = originY + (s * 2 - 1) * amp + Math.sin(t * Math.PI * 2) * amp * 0.35;
  const eps = 1 / 512;
  const t2 = Math.min(1, t + eps);
  const s2 = t2 * t2 * (3 - 2 * t2);
  const y2 =
    originY + (s2 * 2 - 1) * amp + Math.sin(t2 * Math.PI * 2) * amp * 0.35;
  const dydx = (y2 - y) / (eps * Math.max(1, w));
  return { x, y, angle: Math.atan(dydx) };
}

type ArcSample = PathPoint & { s: number };

function buildArcTable(
  shape: Exclude<TextPathShape, "none">,
  w: number,
  amp: number,
  originY: number,
  reverse: boolean,
  steps = 256,
): ArcSample[] {
  const table: ArcSample[] = [];
  let s = 0;
  let prev: PathPoint | null = null;
  for (let i = 0; i <= steps; i++) {
    const uRaw = i / steps;
    const u = reverse ? 1 - uRaw : uRaw;
    const p = pathPointAt(shape, u, w, amp, originY);
    if (prev) {
      const dx = p.x - prev.x;
      const dy = p.y - prev.y;
      s += Math.hypot(dx, dy);
    }
    // When reversed, tangent flips
    const angle = reverse ? p.angle + Math.PI : p.angle;
    table.push({ x: p.x, y: p.y, angle, s });
    prev = p;
  }
  return table;
}

function sampleAtLength(table: ArcSample[], dist: number): PathPoint {
  const total = table[table.length - 1]?.s ?? 0;
  if (total <= 0) return table[0] ?? { x: 0, y: 0, angle: 0 };
  let d = dist;
  // Clamp open paths; circle can wrap
  d = Math.max(0, Math.min(total, d));

  let lo = 0;
  let hi = table.length - 1;
  while (lo < hi) {
    const mid = (lo + hi) >> 1;
    if (table[mid].s < d) lo = mid + 1;
    else hi = mid;
  }
  const i = Math.max(1, lo);
  const a = table[i - 1];
  const b = table[i];
  const span = b.s - a.s || 1;
  const f = (d - a.s) / span;
  return {
    x: a.x + (b.x - a.x) * f,
    y: a.y + (b.y - a.y) * f,
    angle: a.angle + (b.angle - a.angle) * f,
  };
}

function sampleAtLengthWrapped(table: ArcSample[], dist: number): PathPoint {
  const total = table[table.length - 1]?.s ?? 0;
  if (total <= 0) return table[0] ?? { x: 0, y: 0, angle: 0 };
  let d = ((dist % total) + total) % total;
  return sampleAtLength(table, d);
}

function positionOffset(
  position: TextPathSettings["position"],
  fontSize: number,
): number {
  // Perpendicular offset from the path (negative = above path in local +angle frame).
  if (position === "top") return -fontSize * 0.15;
  if (position === "bottom") return fontSize * 0.75;
  return fontSize * 0.35; // center / on-path
}

/**
 * Place glyphs along a path spanning the text box width.
 * Returns null when path is off.
 */
export function layoutTextOnPath(
  text: TextElement,
  boxW: number,
  _boxH: number,
): PathGlyph[] | null {
  const path = text.path;
  if (!path || path.shape === "none") return null;

  const display = textDisplayString(text).replace(/\n/g, " ").trimEnd();
  if (!display) return [];

  const letterSpacing = text.letterSpacing ?? 0;
  const layout = layoutText(
    display,
    textFontStack(text.fontFamily),
    text.size,
    letterSpacing,
  );
  if (!layout.glyphs.length) return [];

  const w = Math.max(boxW, layout.totalWidth, 8);
  const amp = pathAmplitude(text.size);
  // Open paths sit in a vertical band; circle is a square [0,w]×[0,w].
  const originY =
    path.shape === "circle" ? w / 2 : amp + text.size * 0.5;
  const reverse = path.direction === "ccw";
  const table = buildArcTable(path.shape, w, amp, originY, reverse);
  const pathLen = table[table.length - 1]?.s ?? w;
  const total = layout.totalWidth;

  // Align the text run along the path, then apply offset (% of path length).
  let start = 0;
  const align = path.align ?? "left";
  if (align === "center") start = (pathLen - total) / 2;
  else if (align === "right") start = pathLen - total;
  start += ((path.offset ?? 0) / 100) * pathLen;

  const nudge = positionOffset(path.position, text.size);
  const wrap = path.shape === "circle";
  const out: PathGlyph[] = [];

  for (const g of layout.glyphs) {
    if (!g.char.trim() && g.char !== " ") {
      // still advance spaces so gaps follow the path
    }
    const dist = start + g.x + g.width / 2;
    const sample = wrap
      ? sampleAtLengthWrapped(table, dist)
      : sampleAtLength(table, dist);

    const cos = Math.cos(sample.angle);
    const sin = Math.sin(sample.angle);
    // Nudge along the normal (perpendicular to tangent)
    const px = sample.x - sin * nudge;
    const py = sample.y + cos * nudge;

    out.push({
      char: g.char,
      x: px,
      y: py,
      angle: sample.angle,
    });
  }
  return out;
}

/** Bounds height needed to fit a path shape for a given font size / box width. */
export function pathLayoutHeight(
  fontSize: number,
  shape: TextPathShape,
  boxW = 0,
): number {
  if (shape === "none") return fontSize;
  if (shape === "circle") {
    const diam = Math.max(boxW, fontSize * 2, 8);
    return diam;
  }
  const amp = pathAmplitude(fontSize);
  return amp * 2 + fontSize * 1.2;
}
