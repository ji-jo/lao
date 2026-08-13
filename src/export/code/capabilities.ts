import type { Background, ImageElement, Project, Stroke } from "@/model/types";
import { DEFAULT_P5_BY_KIND, type P5BrushId } from "@/engine/p5BrushPresets";
import { hasImageFilter } from "@/lib/image-filters";

/**
 * Presets that match freehand / geometric ribbons closely.
 * Everything else still exports as a vector path (approximated outline) —
 * SVG/React code export never embeds raster.
 */
export const VECTOR_BRUSH_PRESETS: ReadonlySet<P5BrushId> = new Set([
  "smooth",
  "calligraphy",
  "outline",
  "parallel",
  "dashed",
  "dotted",
  "dots",
  "pixel",
  "squares",
  "halftone",
  "ink",
  "brush",
  "rough",
  "sketchy",
]);

/** Code export is always vector paths — kept for API compatibility. */
export type StrokeExportMode = "vector" | "raster";

export interface ExportWarning {
  id: string;
  kind: "stroke" | "image" | "background" | "text";
  message: string;
}

export interface ProjectExportCapabilities {
  warnings: ExportWarning[];
  strokeModes: Map<string, StrokeExportMode>;
  /** Always false for code export (vector-only; no PNG embeds). */
  needsRasterFallback: boolean;
  needsTextLayout: boolean;
  needsPlaywright: boolean;
}

function defaultPreset(stroke: Stroke): P5BrushId | undefined {
  if (stroke.p5Brush) return stroke.p5Brush;
  if (stroke.brush === "ink" || stroke.brush === "pen" || stroke.brush === "marker") {
    return DEFAULT_P5_BY_KIND[stroke.brush];
  }
  return undefined;
}

/**
 * True when the stroke's canvas look is stamp/particle-heavy and the freehand
 * outline is only an approximation (still exported as `<path>`, never PNG).
 */
export function strokeNeedsVectorApprox(stroke: Stroke): boolean {
  if (stroke.grain) return true;
  const preset = defaultPreset(stroke);
  if (preset && !VECTOR_BRUSH_PRESETS.has(preset)) return true;
  if (stroke.p5Brush && !VECTOR_BRUSH_PRESETS.has(stroke.p5Brush)) return true;
  return false;
}

/** Per-stroke mode for SVG/React code export — always vector. */
export function strokeExportMode(_stroke: Stroke): StrokeExportMode {
  return "vector";
}

function backgroundOmitsRaster(bg: Background | undefined): boolean {
  if (!bg) return false;
  if (bg.kind === "shader") return true;
  if (bg.kind === "image") return true;
  return false;
}

function collectStrokes(project: Project): Stroke[] {
  const out: Stroke[] = [];
  for (const layer of project.layers) {
    for (const cel of layer.frames) {
      if (!cel) continue;
      out.push(...cel.strokes);
    }
  }
  return out;
}

function collectImages(project: Project): ImageElement[] {
  const out: ImageElement[] = [];
  for (const layer of project.layers) {
    for (const cel of layer.frames) {
      if (!cel?.images) continue;
      out.push(...cel.images);
    }
  }
  return out;
}

/** Scan a project and list vector approximations + omitted rasters. */
export function analyzeProjectExport(project: Project): ProjectExportCapabilities {
  const warnings: ExportWarning[] = [];
  const strokeModes = new Map<string, StrokeExportMode>();

  for (const s of collectStrokes(project)) {
    strokeModes.set(s.id, "vector");
    if (strokeNeedsVectorApprox(s)) {
      warnings.push({
        id: s.id,
        kind: "stroke",
        message: `Stroke uses brush "${s.p5Brush ?? s.brush}" — exported as freehand path (vector approximation)`,
      });
    }
  }

  for (const im of collectImages(project)) {
    warnings.push({
      id: im.id,
      kind: "image",
      message: "Image element — omitted from code export (vector-only)",
    });
  }

  if (backgroundOmitsRaster(project.background)) {
    const bg = project.background!;
    const detail =
      bg.kind === "shader"
        ? "Shader background"
        : hasImageFilter(bg)
          ? "Filtered image background"
          : "Image background";
    warnings.push({
      id: "background",
      kind: "background",
      message: `${detail} — omitted from code export (vector-only)`,
    });
  }

  const hasText = project.layers.some((l) =>
    l.frames.some((c) => c?.texts && c.texts.length > 0),
  );

  return {
    warnings,
    strokeModes,
    needsRasterFallback: false,
    needsTextLayout: hasText,
    // Text measurement prefers a canvas; headless can still emit without it.
    needsPlaywright: false,
  };
}
