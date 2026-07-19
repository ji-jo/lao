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

export interface Project {
  version: 1;
  name: string;
  width: number;
  height: number;
  fps: number;
  /** total timeline length in frames */
  frameCount: number;
  layers: Layer[];
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
