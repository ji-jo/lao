import type { DotsBackground, DotsOrigin, DotsPattern, DotsShape } from "@/model/types";

export type DotsBg = DotsBackground;

export type ResolvedDots = {
  kind: "dots";
  color: string;
  dotColor: string;
  size: number;
  gapX: number;
  gapY: number;
  gapLinked: boolean;
  offsetX: number;
  offsetY: number;
  opacity: number;
  shape: DotsShape;
  pattern: DotsPattern;
  rotation: number;
  softness: number;
  origin: DotsOrigin;
};

export const DEFAULT_DOTS: ResolvedDots = {
  kind: "dots",
  color: "#FFFFFF",
  dotColor: "#C8C8C8",
  size: 2,
  gapX: 24,
  gapY: 24,
  gapLinked: true,
  offsetX: 0,
  offsetY: 0,
  opacity: 1,
  shape: "circle",
  pattern: "grid",
  rotation: 0,
  softness: 0,
  origin: "center",
};

const SHAPES: readonly DotsShape[] = ["circle", "square", "diamond"];
const PATTERNS: readonly DotsPattern[] = ["grid", "hex"];
const ORIGINS: readonly DotsOrigin[] = ["center", "corner"];

function clamp(n: number, min: number, max: number): number {
  if (!Number.isFinite(n)) return min;
  return Math.min(max, Math.max(min, n));
}

function asShape(v: unknown): DotsShape {
  return SHAPES.includes(v as DotsShape) ? (v as DotsShape) : DEFAULT_DOTS.shape;
}

function asPattern(v: unknown): DotsPattern {
  return PATTERNS.includes(v as DotsPattern)
    ? (v as DotsPattern)
    : DEFAULT_DOTS.pattern;
}

function asOrigin(v: unknown): DotsOrigin {
  return ORIGINS.includes(v as DotsOrigin) ? (v as DotsOrigin) : DEFAULT_DOTS.origin;
}

export function makeDotsBackground(
  patch: Partial<Omit<DotsBackground, "kind">> = {},
): DotsBackground {
  return resolveDots({ ...DEFAULT_DOTS, ...patch, kind: "dots" });
}

export function resolveDots(bg: DotsBackground): ResolvedDots {
  const gapLinked = bg.gapLinked ?? DEFAULT_DOTS.gapLinked;
  let gapX = clamp(bg.gapX ?? DEFAULT_DOTS.gapX, 2, 400);
  let gapY = clamp(bg.gapY ?? DEFAULT_DOTS.gapY, 2, 400);
  if (gapLinked) gapY = gapX;
  return {
    kind: "dots",
    color: bg.color || DEFAULT_DOTS.color,
    dotColor: bg.dotColor || DEFAULT_DOTS.dotColor,
    size: clamp(bg.size ?? DEFAULT_DOTS.size, 0.5, 128),
    gapX,
    gapY,
    gapLinked,
    offsetX: clamp(bg.offsetX ?? DEFAULT_DOTS.offsetX, -400, 400),
    offsetY: clamp(bg.offsetY ?? DEFAULT_DOTS.offsetY, -400, 400),
    opacity: clamp(bg.opacity ?? DEFAULT_DOTS.opacity, 0, 1),
    shape: asShape(bg.shape),
    pattern: asPattern(bg.pattern),
    rotation: clamp(bg.rotation ?? DEFAULT_DOTS.rotation, -180, 180),
    softness: clamp(bg.softness ?? DEFAULT_DOTS.softness, 0, 1),
    origin: asOrigin(bg.origin),
  };
}

export function dotsTileSize(d: ResolvedDots): { w: number; h: number } {
  if (d.pattern === "hex") return { w: d.gapX, h: d.gapY * 2 };
  return { w: d.gapX, h: d.gapY };
}

/** Lattice points that belong to one repeating tile (unwrapped). */
export function dotsHomePoints(d: ResolvedDots): Array<{ x: number; y: number }> {
  const { w } = dotsTileSize(d);
  if (d.pattern === "hex") {
    return [
      { x: w / 2, y: d.gapY / 2 },
      { x: 0, y: d.gapY + d.gapY / 2 },
    ];
  }
  return [{ x: w / 2, y: d.gapY / 2 }];
}

/**
 * Home dots plus 8-neighborhood copies so overflow wraps correctly inside
 * a clipped pattern tile (opaque or translucent).
 */
export function dotsStampPoints(d: ResolvedDots): Array<{ x: number; y: number }> {
  const { w, h } = dotsTileSize(d);
  const home = dotsHomePoints(d);
  const out: Array<{ x: number; y: number }> = [];
  for (const p of home) {
    for (let dy = -1; dy <= 1; dy++) {
      for (let dx = -1; dx <= 1; dx++) {
        out.push({ x: p.x + dx * w, y: p.y + dy * h });
      }
    }
  }
  return out;
}

/** Pattern origin in project px (user offset + optional centered leftover). */
export function dotsPatternOrigin(
  d: ResolvedDots,
  canvasW: number,
  canvasH: number,
): { x: number; y: number } {
  const { w, h } = dotsTileSize(d);
  let x = d.offsetX;
  let y = d.offsetY;
  if (d.origin === "center") {
    x += ((canvasW % w) + w) % w / 2;
    y += ((canvasH % h) + h) % h / 2;
  }
  return { x, y };
}

export const DOTS_SHAPES: { id: DotsShape; label: string }[] = [
  { id: "circle", label: "Circle" },
  { id: "square", label: "Square" },
  { id: "diamond", label: "Diamond" },
];

export const DOTS_PATTERNS: { id: DotsPattern; label: string }[] = [
  { id: "grid", label: "Grid" },
  { id: "hex", label: "Hex" },
];

export const DOTS_ORIGINS: { id: DotsOrigin; label: string }[] = [
  { id: "center", label: "Center" },
  { id: "corner", label: "Corner" },
];
