import type { Stroke, StrokePoint } from "@/model/types";

/**
 * Line-boil engine. Strokes with `jitter: true` get their points displaced by
 * seeded smooth noise. The timeline maps to a small cycle of variants held
 * for BOIL_HOLD frames each ("on 2s") — the classic hand-drawn shimmer.
 * Deterministic per (stroke.seed, variant): preview and baked export match.
 */

export const BOIL_VARIANTS = 3;
export const BOIL_HOLD = 2; // frames per variant

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

export function variantForFrame(frame: number): number {
  return Math.floor(frame / BOIL_HOLD) % BOIL_VARIANTS;
}

/** amplitude in project px — scales gently with brush size */
function boilAmplitude(stroke: Stroke): number {
  return 1.2 + stroke.size * 0.18;
}

const WAVELENGTH = 9; // points per noise control offset

/**
 * Displace a stroke's points for one boil variant. Control offsets are drawn
 * from the seeded PRNG every WAVELENGTH points and interpolated smoothly
 * between, so lines wobble organically instead of buzzing per-point.
 */
export function displaceStroke(stroke: Stroke, variant: number): StrokePoint[] {
  const rng = mulberry32((stroke.seed ^ Math.imul(variant + 1, 0x9e3779b9)) >>> 0);
  const amp = boilAmplitude(stroke);
  const n = stroke.points.length;
  if (n === 0) return stroke.points;

  const controls = Math.max(Math.ceil(n / WAVELENGTH) + 1, 2);
  const cx: number[] = [];
  const cy: number[] = [];
  for (let i = 0; i < controls; i++) {
    cx.push((rng() * 2 - 1) * amp);
    cy.push((rng() * 2 - 1) * amp);
  }

  const out: StrokePoint[] = new Array(n);
  for (let i = 0; i < n; i++) {
    const t = (i / WAVELENGTH) % 1;
    const k = Math.floor(i / WAVELENGTH);
    const smooth = t * t * (3 - 2 * t); // smoothstep between controls
    const dx = cx[k] + (cx[k + 1] - cx[k]) * smooth;
    const dy = cy[k] + (cy[k + 1] - cy[k]) * smooth;
    const p = stroke.points[i];
    out[i] = { x: p.x + dx, y: p.y + dy, pressure: p.pressure, t: p.t };
  }
  return out;
}

/** displacement map for a whole cel at a given timeline frame */
export function boilDisplacement(
  strokes: Stroke[],
  frame: number,
): Map<string, StrokePoint[]> {
  const variant = variantForFrame(frame);
  const map = new Map<string, StrokePoint[]>();
  for (const stroke of strokes) {
    if (stroke.jitter) map.set(stroke.id, displaceStroke(stroke, variant));
  }
  return map;
}
