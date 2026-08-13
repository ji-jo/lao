/**
 * Brush pack presets (Ink / Pen / Marker).
 * Procedural stroke styles — no SVG/PNG tip stamping on the paint path.
 */

export const P5_BRUSH_IDS = [
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
] as const;

export type P5BrushId = (typeof P5_BRUSH_IDS)[number];

/** Draw modes that own a brush pack (matches tool dock Ink / Pen / Marker). */
export type DrawBrushKindForPack = "ink" | "pen" | "marker";

export const DEFAULT_P5_BY_KIND: Record<DrawBrushKindForPack, P5BrushId> = {
  ink: "smooth",
  pen: "calligraphy",
  marker: "spray",
};

export const DEFAULT_P5_BRUSH: P5BrushId = DEFAULT_P5_BY_KIND.ink;

export const P5_BRUSH_IDS_BY_KIND: Record<
  DrawBrushKindForPack,
  readonly P5BrushId[]
> = {
  /** Full freehand / expressive set. */
  ink: [
    "smooth",
    "calligraphy",
    "brush",
    "rough",
    "stipple",
    "sketchy",
    "ink",
    "airbrush",
    "chalk",
    "dots",
    "spray",
    "halftone",
  ],
  /** Cleaner / technical tips for shape stroke + pen memory. */
  pen: ["smooth", "calligraphy", "outline", "parallel", "dashed", "dotted", "pixel", "squares"],
  /** Broad / particle tips. */
  marker: ["spray", "dots", "chalk", "brush", "stipple", "airbrush"],
};

export const P5_BRUSHES: { id: P5BrushId; label: string }[] = [
  { id: "smooth", label: "Smooth" },
  { id: "calligraphy", label: "Calligraphy" },
  { id: "brush", label: "Brush" },
  { id: "rough", label: "Rough" },
  { id: "stipple", label: "Stipple" },
  { id: "sketchy", label: "Sketchy" },
  { id: "parallel", label: "Parallel" },
  { id: "outline", label: "Outline" },
  { id: "dashed", label: "Dashed" },
  { id: "dotted", label: "Dotted" },
  { id: "dots", label: "Dots" },
  { id: "spray", label: "Spray" },
  { id: "chalk", label: "Chalk" },
  { id: "ink", label: "Ink" },
  { id: "airbrush", label: "Airbrush" },
  { id: "pixel", label: "Pixel" },
  { id: "halftone", label: "Halftone" },
  { id: "squares", label: "Squares" },
];

const P5_LABEL = Object.fromEntries(
  P5_BRUSHES.map((b) => [b.id, b.label]),
) as Record<P5BrushId, string>;

/** Old .lao / stroke ids → current presets. */
export const LEGACY_P5_ALIASES: Record<string, P5BrushId> = {
  HB: "smooth",
  "2H": "smooth",
  "2B": "brush",
  cpencil: "sketchy",
  rotring: "smooth",
  pastel: "chalk",
  crayon: "chalk",
  charcoal: "chalk",
  pencil: "smooth",
  watercolor: "ink",
  acrylic: "brush",
  marker: "brush",
  wave: "rough",
  ribbon: "airbrush",
};

export function coerceP5Brush(
  value: string | undefined | null,
): P5BrushId | undefined {
  if (!value) return undefined;
  if ((P5_BRUSH_IDS as readonly string[]).includes(value)) {
    return value as P5BrushId;
  }
  return LEGACY_P5_ALIASES[value];
}

export function brushesForKind(
  kind: DrawBrushKindForPack,
): { id: P5BrushId; label: string }[] {
  return P5_BRUSH_IDS_BY_KIND[kind].map((id) => ({
    id,
    label: P5_LABEL[id],
  }));
}

export function kindForP5Brush(id: P5BrushId): DrawBrushKindForPack {
  if ((P5_BRUSH_IDS_BY_KIND.marker as readonly string[]).includes(id)) {
    return "marker";
  }
  if ((P5_BRUSH_IDS_BY_KIND.ink as readonly string[]).includes(id)) {
    return "ink";
  }
  if ((P5_BRUSH_IDS_BY_KIND.pen as readonly string[]).includes(id)) {
    return "pen";
  }
  return "ink";
}

export function isP5BrushId(value: string | undefined | null): value is P5BrushId {
  return !!value && (P5_BRUSH_IDS as readonly string[]).includes(value);
}

export function isP5BrushInKind(
  id: P5BrushId,
  kind: DrawBrushKindForPack,
): boolean {
  return (P5_BRUSH_IDS_BY_KIND[kind] as readonly string[]).includes(id);
}

/** @deprecated */
export function ensureCustomP5Brushes(
  _add?: (name: string, params: Record<string, unknown>) => void,
): void {}

export function __resetCustomP5BrushesForTests(): void {}
