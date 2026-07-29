import type { ClipEasing, Layer, Stroke, StrokeClip } from "@/model/types";
import { DEFAULT_CLIP_EASING } from "@/model/types";
import { strokeDurationMs } from "@/engine/strokeProgress";

/** Mirror of private MIN_CLIP_MS in project.ts — floor for restored animate duration. */
const MIN_CLIP_MS = 80;

/** Session memory of startMs before a line was made static (survives re-toggle). */
const rememberedStartMs = new Map<string, number>();

/** A static line is on screen for the whole composition (zero-duration clip at t=0). */
export function isStaticLine(stroke: Stroke | undefined | null): boolean {
  if (!stroke) return false;
  const clip = stroke.clip;
  if (!clip) return true;
  return clip.startMs === 0 && clip.durationMs === 0;
}

/** Animatron layer-per-path: strokes on the single cel. */
export function lineStrokesOf(layer: Layer): Stroke[] {
  const cel = layer.frames.find((f) => f) ?? null;
  return cel?.strokes ?? [];
}

export function layerIsStaticLine(layer: Layer): boolean {
  const strokes = lineStrokesOf(layer);
  if (strokes.length === 0) return false;
  return strokes.every(isStaticLine);
}

/** Clip payload that keeps a stroke fully visible from frame 0 with no fade. */
export function staticClipPayload(easing?: ClipEasing): StrokeClip {
  const base = easing ?? DEFAULT_CLIP_EASING;
  return {
    startMs: 0,
    durationMs: 0,
    easing: {
      ...base,
      bezier: [...base.bezier] as ClipEasing["bezier"],
      fadeInFrames: 0,
      fadeOutFrames: 0,
      _userSet: true,
    },
  };
}

/**
 * Restore an animate clip from a stroke's recorded point timing.
 * Remembers the previous startMs for the session when going static → animate.
 */
export function animateClipPayload(
  stroke: Stroke,
  easing?: ClipEasing,
): StrokeClip {
  const base = easing ?? stroke.clip?.easing ?? DEFAULT_CLIP_EASING;
  const startMs = rememberedStartMs.get(stroke.id) ?? stroke.clip?.startMs ?? 0;
  const durationMs = Math.max(MIN_CLIP_MS, strokeDurationMs(stroke));
  return {
    startMs,
    durationMs,
    easing: {
      ...base,
      bezier: [...base.bezier] as ClipEasing["bezier"],
      // restore a sensible fade-in if the static payload zeroed it
      fadeInFrames: base.fadeInFrames > 0 ? base.fadeInFrames : DEFAULT_CLIP_EASING.fadeInFrames,
      fadeOutFrames: base.fadeOutFrames,
      _userSet: true,
    },
  };
}

/** Call before writing a static clip so Animate can restore startMs. */
export function rememberClipStart(stroke: Stroke) {
  if (stroke.clip && !(stroke.clip.startMs === 0 && stroke.clip.durationMs === 0)) {
    rememberedStartMs.set(stroke.id, stroke.clip.startMs);
  }
}
