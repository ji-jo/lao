/** Core document model — retained vector everywhere (powers jitter, editing, export). */

export type BrushKind = "pencil" | "ink" | "marker" | "eraser";

export interface StrokePoint {
  x: number;
  y: number;
  /** 0..1 — real pen pressure, or synthesized from velocity for mouse/trackpad. */
  pressure: number;
  /** ms since stroke start */
  t: number;
}

export interface StrokeClip {
  /** ms from composition start when this path begins */
  startMs: number;
  /** ms duration of the draw-on / hold window */
  durationMs: number;
  /** optional Animatron easing + fade (preview === export) */
  easing?: ClipEasing;
}

/** Cubic bezier easing [x1,y1,x2,y2] — Animatron clip timing curves */
export type Bezier4 = [number, number, number, number];

export interface ClipEasing {
  bezier: Bezier4;
  fadeInFrames: number;
  fadeOutFrames: number;
  presetId?: string;
}

export const DEFAULT_CLIP_EASING: ClipEasing = {
  bezier: [0.44, 0, 0.56, 1],
  fadeInFrames: 4,
  fadeOutFrames: 4,
  presetId: "smooth",
};

export interface Stroke {
  id: string;
  brush: BrushKind;
  color: string;
  /** base size in project px */
  size: number;
  points: StrokePoint[];
  /** seed for deterministic boil/jitter */
  seed: number;
  /** whether this stroke boils in animate/preview mode */
  jitter: boolean;
  /** textured grain fill (pencil-style paper noise) */
  grain?: boolean;
  /** Animatron clip timing (ignored in stop-motion paint) */
  clip?: StrokeClip;
}

export interface Frame {
  id: string;
  strokes: Stroke[];
}

export interface Layer {
  id: string;
  name: string;
  visible: boolean;
  /** static layers hold their content across the whole timeline (Auto-Key OFF target) */
  isStatic: boolean;
  /** exposure sheet: frames[i] is the cel shown at timeline frame i; null = hold previous */
  frames: (Frame | null)[];
}

export type BackgroundFit = "fill" | "cover" | "contain" | "crop";
/** Paper image-filter chips on the Image background tab. */
export type ImageFilterId = "paper" | "fluted" | "water" | "dither";

/** Paper 27K-0 shader chips. */
export type ShaderPresetId =
  | "aurora"
  | "plasma"
  | "nebula"
  | "mesh"
  | "clouds";

/** Older .lao files may still carry these ids — rendered for compatibility. */
export type LegacyShaderPresetId =
  | "grain"
  | "neuro"
  | "smoke"
  | "voronoi"
  | "waves";

export type Background =
  | { kind: "none" }
  | { kind: "color"; color: string }
  | {
      kind: "gradient";
      shape: "linear" | "radial";
      from: string;
      to: string;
      angle: number;
      /** Full CSS gradient from the picker (preserves stops). Preferred when set. */
      css?: string;
    }
  /** src is a data URL so the image travels inside the .lao file */
  | {
      kind: "image";
      src: string;
      fit: BackgroundFit;
      /**
       * Focal point in the artboard (0–1). Used as object-position for
       * cover/contain/crop. Defaults to center when omitted.
       */
      position?: { x: number; y: number };
      /** Extra scale on top of fit (1 = 100%). Defaults to 1 when omitted. */
      zoom?: number;
      /** Optional @paper-design/shaders-react image filter. */
      filter?: ImageFilterId;
      filterParams?: Record<string, number>;
      namedColors?: Record<string, string>;
      /** UI: Auto keeps project size; match sets canvas to image pixels. */
      resolution?: "auto" | "match";
    }
  | {
      kind: "shader";
      preset: ShaderPresetId | LegacyShaderPresetId;
      colors: string[];
      speed: number;
      /** Numeric uniforms for the active paper shader (distortion, swirl, …). */
      params?: Record<string, number>;
      /** Named solids beyond `colors` (back, bloom, …). */
      namedColors?: Record<string, string>;
    };

export type ProjectWorkflow = "stopmotion" | "animatron";

/**
 * Project-wide line-boil knobs. Omitted fields fall back to DEFAULT_BOIL in
 * the engine so older .lao files keep the classic shimmer.
 */
export interface BoilSettings {
  /** Displacement strength multiplier (0–2). */
  amplitude: number;
  /** Spatial frequency of the wobble (0–1) — higher = tighter ripples. */
  jitter: number;
  /** Extra punch on displacement (0–1). */
  intensity: number;
  /** Variant cycle rate (0.25–3) — higher = faster shimmer. */
  speed: number;
  /** Distinct boil poses in the cycle (2–8). */
  variety: number;
}

export const DEFAULT_BOIL: BoilSettings = {
  amplitude: 1,
  jitter: 0.5,
  intensity: 0.5,
  speed: 1,
  variety: 3,
};

export interface Project {
  version: 1;
  name: string;
  width: number;
  height: number;
  fps: number;
  /** total timeline length in frames */
  frameCount: number;
  layers: Layer[];
  background?: Background;
  /** which editor workflow owns this document; default stopmotion when missing */
  workflow?: ProjectWorkflow;
  /** Line-boil look (preview === export). */
  boil?: BoilSettings;
}

/**
 * Exposure-sheet resolution: the cel shown at timeline frame `i` is the
 * nearest keyframe at or before `i` (a "hold"). Static layers always show
 * their first cel.
 */
export function resolveCelIndex(layer: Layer, i: number): number | null {
  if (layer.isStatic) return layer.frames[0] ? 0 : null;
  for (let k = Math.min(i, layer.frames.length - 1); k >= 0; k--) {
    if (layer.frames[k]) return k;
  }
  return null;
}

export function resolveCel(layer: Layer, i: number): Frame | null {
  const idx = resolveCelIndex(layer, i);
  return idx === null ? null : layer.frames[idx];
}

export function createEmptyProject(): Project {
  return {
    version: 1,
    name: "untitled",
    width: 1920,
    height: 1080,
    fps: 12,
    frameCount: 24,
    layers: [
      {
        id: crypto.randomUUID(),
        name: "Layer 1",
        visible: true,
        isStatic: false,
        frames: [{ id: crypto.randomUUID(), strokes: [] }],
      },
    ],
  };
}
