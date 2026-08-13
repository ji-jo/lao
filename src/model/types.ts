/** Core document model — retained vector everywhere (powers jitter, editing, export). */

export type BrushKind = "pen" | "ink" | "marker" | "eraser";

export interface BezierNode {
  x: number;
  y: number;
  handleIn?: { x: number; y: number };
  handleOut?: { x: number; y: number };
}

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
  /** Explicitly set by the user, skipping legacy migration overrides */
  _userSet?: boolean;
}

export const DEFAULT_CLIP_EASING: ClipEasing = {
  bezier: [0.44, 0, 0.56, 1],
  fadeInFrames: 4,
  /**
   * MUST default to 0. `clipFadeOpacity` treats any fade-out as "the stroke
   * leaves the scene at clip end" — opacity stays 0 forever after. With a
   * non-zero default, every finished Animatron path vanished from playback and
   * export while the draw canvas still showed it (the "previous layers missing
   * in export" bug). Paths hold after their clip (see `strokeAtTime`); fading
   * out is an explicit per-project choice in the Animation panel.
   */
  fadeOutFrames: 0,
  presetId: "smooth",
};

/**
 * The pre-fix stamped default (fadeOut 4) that made every finished path vanish.
 * `loadProject` rewrites exactly this combination back to hold — it was never
 * a deliberate user choice, just what `addStroke` stamped on every clip.
 */
export function isLegacyVanishingEasing(easing: ClipEasing): boolean {
  if (easing._userSet) return false;
  return (
    easing.presetId === "smooth" &&
    easing.fadeInFrames === 4 &&
    easing.fadeOutFrames === 4
  );
}

export interface Stroke {
  id: string;
  brush: BrushKind;
  /**
   * Brush-pack preset (smooth, calligraphy, spray, chalk, …).
   * Painted procedurally via brushStyles; legacy ids (HB, watercolor, wave, …) coerce at paint time.
   */
  p5Brush?: import("@/engine/p5BrushPresets").P5BrushId;
  color: string;
  /** base size in project px */
  size: number;
  /** Wave / dash / stipple period in project px (default 12). */
  brushWavelength?: number;
  /** Corner softness 0–100 (default 100). */
  brushCorners?: number;
  /** Path smoothing 0–20 scale (default 9). */
  brushSmoothing?: number;
  points: StrokePoint[];
  /** seed for deterministic boil/jitter */
  seed: number;
  /** whether this stroke boils in animate/preview mode */
  jitter: boolean;
  /** textured grain fill (pencil-style paper noise) */
  grain?: boolean;
  /** Animatron clip timing (ignored in stop-motion paint) */
  clip?: StrokeClip;
  /** Vector path anchor points (for pen tool) */
  bezierNodes?: BezierNode[];
  /** Whether the vector path forms a closed loop */
  closed?: boolean;
  /** Optional solid fill for closed shapes (stroke uses `color`) */
  fillColor?: string;
  /**
   * Set when created by a shape tool — lets the Leafer overlay remount a
   * semantic Rect/Ellipse/Polygon/Line for edit instead of the StageCanvas bbox.
   */
  shapeKind?: "rect" | "diamond" | "circle" | "arrow" | "line";
  /**
   * Local frame for Leafer remount (project px). Closed shapes: AABB.
   * Line/arrow: origin + delta (`w`/`h` = end − start). `rotation` in radians.
   */
  shapeBox?: { x: number; y: number; w: number; h: number; rotation?: number };
  /** Corner radius for rect shapes (project px). Ignored when 0 / unset. */
  cornerRadius?: number;
  /** iOS-style continuous corner (squircle) when true — pairs with cornerSmoothing. */
  squircle?: boolean;
  /** Corner smoothing 0–1 when squircle is on (0 = circular, 1 = continuous). */
  cornerSmoothing?: number;
}

export type TextAlign = "left" | "center" | "right";
export type TextCase = "none" | "upper" | "lower" | "title";
export type TextPathShape = "none" | "circle" | "arch" | "wave" | "scurve";
export type TextPathPosition = "top" | "center" | "bottom";
export type TextPathDirection = "cw" | "ccw";
export type TextBlendMode =
  | "normal"
  | "multiply"
  | "screen"
  | "overlay"
  | "darken"
  | "lighten";

export interface TextShadow {
  color: string;
  blur: number;
  offsetX: number;
  offsetY: number;
}

export interface TextPathSettings {
  shape: TextPathShape;
  /** Horizontal alignment along the path */
  align: TextAlign;
  position: TextPathPosition;
  direction: TextPathDirection;
  /** Offset along the path, −100…100 */
  offset: number;
}

export interface TextElement {
  id: string;
  text: string;
  x: number;
  y: number;
  fontFamily: string;
  size: number;
  color: string;
  bold?: boolean;
  italic?: boolean;
  align?: TextAlign;
  letterSpacing?: number;
  underline?: boolean;
  strikethrough?: boolean;
  textCase?: TextCase;
  /** 0–100; default 100 */
  opacity?: number;
  /** Solid fill behind the text box; omit / null = none */
  backgroundColor?: string | null;
  shadow?: TextShadow | null;
  blendMode?: TextBlendMode;
  path?: TextPathSettings | null;
  /** Fixed box width in project px — text soft-wraps to fit when set */
  boxWidth?: number;
  /** Rotation in radians (around the box center) */
  rotation?: number;
  /** Animatron clip timing (ignored in stop-motion paint) */
  clip?: StrokeClip;
  /**
   * Typewriter reveal rate (characters / second) while the clip runs.
   * - omit — legacy: reveal by eased clip progress (fraction of duration)
   * - `0` — show full text as soon as the clip starts
   * - `>0` — reveal by elapsed time × speed (preview === export)
   */
  typewriterSpeed?: number;
}

/**
 * Placed image on the artboard (Camera / Add image). Persisted in .lao.
 * Transform is Figma-like: free scale (squeeze/extend), rotate, lock, aspect lock.
 */
export interface ImageElement {
  id: string;
  /** data URL (or blob URL during session before save) */
  src: string;
  x: number;
  y: number;
  w: number;
  h: number;
  /** radians, around box center */
  rotation?: number;
  /** 0–1, default 1 */
  opacity?: number;
  /** prevent transform / dock edits */
  locked?: boolean;
  /** keep w/h ratio while scaling from dock / Shift */
  lockAspect?: boolean;
  naturalWidth: number;
  naturalHeight: number;
  /** Animatron clip timing (ignored in stop-motion paint) */
  clip?: StrokeClip;
}

export interface Frame {
  id: string;
  strokes: Stroke[];
  texts?: TextElement[];
  images?: ImageElement[];
}

/**
 * A motion guide: a pen-authored path that art rides along. Guides live on the
 * Draw stage only — never painted in Preview/export.
 */
export interface MotionPath {
  id: string;
  /** editable pen anchor nodes (authoring) */
  bezierNodes: BezierNode[];
  /** flattened polyline — arc-length sampled at animation time */
  points: StrokePoint[];
}

/**
 * Binds a group of elements (strokes / texts / images by id) to a MotionPath.
 * The group's `anchor` point is pinned to the path: progress 0 puts the anchor
 * at the path's A end, progress 1 at the B end (swapped by `reverse`).
 * Animatron times in ms (startMs/durationMs); stop-motion in frames
 * (startFrame/endFrame). Deterministic: pose is a pure function of time.
 */
export interface MotionAssignment {
  id: string;
  pathId: string;
  targetIds: string[];
  /** group point pinned to the path, in project px */
  anchor: { x: number; y: number };
  startMs: number;
  durationMs: number;
  /** stop-motion timing (frames); used when workflow is stopmotion */
  startFrame?: number;
  endFrame?: number;
  easing?: ClipEasing;
  /** travel B→A instead of A→B */
  reverse?: boolean;
  /** rotate the group to follow the path tangent */
  orient?: boolean;
}

/**
 * Animatron live morph: tween layer A's drawing into layer B's over the clip
 * window. A holds before startMs, interpolates during, B takes over after.
 */
export interface MorphClip {
  id: string;
  fromLayerId: string;
  toLayerId: string;
  startMs: number;
  durationMs: number;
  easing?: ClipEasing;
}

export interface Layer {
  id: string;
  name: string;
  visible: boolean;
  /** static layers hold their content across the whole timeline (Auto-Key OFF target) */
  isStatic: boolean;
  /** exposure sheet: frames[i] is the cel shown at timeline frame i; null = hold previous */
  frames: (Frame | null)[];
  /** motion guides authored on this layer (Path Maker) */
  motionPaths?: MotionPath[];
  /** bindings of this layer's elements to motion guides */
  motionAssignments?: MotionAssignment[];
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
  /** which editor workflow owns this document; default animatron when missing on new projects */
  workflow?: ProjectWorkflow;
  /** Line-boil look (preview === export). */
  boil?: BoilSettings;
  /** Animatron live morph clips (layer A → layer B). */
  morphs?: MorphClip[];
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
    workflow: "animatron",
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

/** True if the session has any authored art (not just empty layers / settings). */
export function projectHasArt(project: Project): boolean {
  if (project.morphs && project.morphs.length > 0) return true;
  return project.layers.some((l) => {
    if (l.motionPaths && l.motionPaths.length > 0) return true;
    return l.frames.some(
      (f) =>
        !!f &&
        (f.strokes.length > 0 ||
          (f.texts != null && f.texts.length > 0) ||
          (f.images != null && f.images.length > 0)),
    );
  });
}
