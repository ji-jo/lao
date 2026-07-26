import {
  DEFAULT_BOIL,
  type BoilSettings,
  type Stroke,
  type StrokePoint,
} from "@/model/types";

/**
 * Line-boil engine. Strokes with `jitter: true` get their points displaced by
 * seeded smooth noise. The timeline maps to a small cycle of variants held
 * for a few frames each ("on 2s") — the classic hand-drawn shimmer.
 * Deterministic per (stroke.seed, variant, settings): preview and export match.
 */

export const BOIL_VARIANTS = 3;
export const BOIL_HOLD = 2; // default frames per variant at speed = 1

/** deterministic PRNG (mulberry32) */
export function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function resolveBoil(settings?: Partial<BoilSettings> | null): BoilSettings {
  if (!settings) return { ...DEFAULT_BOIL };
  return {
    amplitude: clamp(settings.amplitude ?? DEFAULT_BOIL.amplitude, 0, 2),
    jitter: clamp(settings.jitter ?? DEFAULT_BOIL.jitter, 0, 1),
    intensity: clamp(settings.intensity ?? DEFAULT_BOIL.intensity, 0, 1),
    speed: clamp(settings.speed ?? DEFAULT_BOIL.speed, 0.25, 3),
    variety: Math.round(clamp(settings.variety ?? DEFAULT_BOIL.variety, 2, 8)),
  };
}

function clamp(n: number, min: number, max: number) {
  return Math.min(max, Math.max(min, n));
}

/** Frames each variant is held — shorter when speed is higher. */
export function boilHoldFrames(settings?: Partial<BoilSettings> | null): number {
  const b = resolveBoil(settings);
  return Math.max(1, Math.round(BOIL_HOLD / b.speed));
}

export function boilVariantCount(settings?: Partial<BoilSettings> | null): number {
  return resolveBoil(settings).variety;
}

export function variantForFrame(
  frame: number,
  settings?: Partial<BoilSettings> | null,
): number {
  const hold = boilHoldFrames(settings);
  const variants = boilVariantCount(settings);
  return Math.floor(frame / hold) % variants;
}

/** amplitude in project px — scales with brush size + boil knobs */
export function boilAmplitudePx(
  stroke: Stroke,
  settings?: Partial<BoilSettings> | null,
): number {
  const b = resolveBoil(settings);
  const base = 1.2 + stroke.size * 0.18;
  // intensity 0.5 → 1× (classic); 0 → soft, 1 → punchy
  const intensityMul = 0.4 + b.intensity * 1.2;
  return base * b.amplitude * intensityMul;
}

/** Points between noise control handles — lower when spatial jitter is high. */
function boilWavelength(settings?: Partial<BoilSettings> | null): number {
  const b = resolveBoil(settings);
  // jitter 0 → 18, 0.5 → 9, 1 → 4 (matches classic WAVELENGTH=9 at default)
  return Math.max(3, Math.round(18 - b.jitter * 14));
}

/**
 * Displace a stroke's points for one boil variant. Control offsets are drawn
 * from the seeded PRNG every wavelength points and interpolated smoothly
 * between, so lines wobble organically instead of buzzing per-point.
 */
export function displaceStroke(
  stroke: Stroke,
  variant: number,
  settings?: Partial<BoilSettings> | null,
): StrokePoint[] {
  const rng = mulberry32((stroke.seed ^ Math.imul(variant + 1, 0x9e3779b9)) >>> 0);
  const amp = boilAmplitudePx(stroke, settings);
  const wavelength = boilWavelength(settings);
  const n = stroke.points.length;
  if (n === 0) return stroke.points;

  const controls = Math.max(Math.ceil(n / wavelength) + 1, 2);
  const cx: number[] = [];
  const cy: number[] = [];
  for (let i = 0; i < controls; i++) {
    cx.push((rng() * 2 - 1) * amp);
    cy.push((rng() * 2 - 1) * amp);
  }

  const out: StrokePoint[] = new Array(n);
  for (let i = 0; i < n; i++) {
    const t = (i / wavelength) % 1;
    const k = Math.floor(i / wavelength);
    const smooth = t * t * (3 - 2 * t); // smoothstep between controls
    const dx = cx[k]! + (cx[k + 1]! - cx[k]!) * smooth;
    const dy = cy[k]! + (cy[k + 1]! - cy[k]!) * smooth;
    const p = stroke.points[i]!;
    out[i] = { x: p.x + dx, y: p.y + dy, pressure: p.pressure, t: p.t };
  }
  return out;
}

/** displacement map for a whole cel at a given timeline frame */
export function boilDisplacement(
  strokes: Stroke[],
  frame: number,
  settings?: Partial<BoilSettings> | null,
): Map<string, StrokePoint[]> {
  const variant = variantForFrame(frame, settings);
  const map = new Map<string, StrokePoint[]>();
  for (const stroke of strokes) {
    if (stroke.jitter) map.set(stroke.id, displaceStroke(stroke, variant, settings));
  }
  return map;
}
