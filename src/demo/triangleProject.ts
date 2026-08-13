/**
 * Demo-only Animatron project: equilateral triangle draw-on at 1282×914.
 */
import type { Project, Stroke, StrokePoint } from "@/model/types";

export const DEMO_W = 1282;
export const DEMO_H = 914;
export const DEMO_FPS = 24;
/** ~3.5s: draw (~1.6s) then hold */
export const DEMO_FRAMES = 84;

function sampleSegment(
  x0: number,
  y0: number,
  x1: number,
  y1: number,
  t0: number,
  out: StrokePoint[],
  spacing = 4,
): number {
  const dist = Math.hypot(x1 - x0, y1 - y0);
  const steps = Math.max(1, Math.ceil(dist / spacing));
  for (let i = 1; i <= steps; i++) {
    const u = i / steps;
    out.push({
      x: x0 + (x1 - x0) * u,
      y: y0 + (y1 - y0) * u,
      pressure: 0.85,
      t: t0 + u,
    });
  }
  return t0 + 1;
}

function stampDrawOnTiming(
  points: StrokePoint[],
  durationMs: number,
): StrokePoint[] {
  if (points.length <= 1) {
    return points.map((p, i) => ({ ...p, t: i === 0 ? 0 : durationMs }));
  }
  const dist = [0];
  let total = 0;
  for (let i = 1; i < points.length; i++) {
    total += Math.hypot(
      points[i]!.x - points[i - 1]!.x,
      points[i]!.y - points[i - 1]!.y,
    );
    dist.push(total);
  }
  const dur = Math.max(80, durationMs);
  if (total < 1e-6) {
    return points.map((p, i) => ({
      ...p,
      t: i === 0 ? 0 : dur,
    }));
  }
  return points.map((p, i) => ({
    ...p,
    t: (dist[i]! / total) * dur,
  }));
}

export function buildTrianglePoints(
  w = DEMO_W,
  h = DEMO_H,
): StrokePoint[] {
  const cx = w / 2;
  const cy = h / 2 + 20;
  const r = Math.min(w, h) * 0.28;
  const top = { x: cx, y: cy - r };
  const bl = {
    x: cx - r * Math.cos(Math.PI / 6),
    y: cy + r * Math.sin(Math.PI / 6),
  };
  const br = {
    x: cx + r * Math.cos(Math.PI / 6),
    y: cy + r * Math.sin(Math.PI / 6),
  };
  const out: StrokePoint[] = [
    { x: top.x, y: top.y, pressure: 0.85, t: 0 },
  ];
  let t = 0;
  t = sampleSegment(top.x, top.y, br.x, br.y, t, out);
  t = sampleSegment(br.x, br.y, bl.x, bl.y, t, out);
  sampleSegment(bl.x, bl.y, top.x, top.y, t, out);
  return out;
}

export function createTriangleDemoProject(): Project {
  const drawMs = 1600;
  const points = stampDrawOnTiming(buildTrianglePoints(), drawMs);
  const stroke: Stroke = {
    id: "triangle-stroke",
    brush: "ink",
    color: "#f4f4f5",
    size: 10,
    points,
    seed: 42,
    jitter: true,
    closed: true,
    fillColor: "rgba(244,244,245,0.08)",
    clip: {
      startMs: 200,
      durationMs: drawMs,
      easing: {
        bezier: [0.44, 0, 0.56, 1],
        fadeInFrames: 2,
        fadeOutFrames: 0,
        presetId: "smooth",
        _userSet: true,
      },
    },
  };

  return {
    version: 1,
    name: "Triangle Animatron Demo",
    width: DEMO_W,
    height: DEMO_H,
    fps: DEMO_FPS,
    frameCount: DEMO_FRAMES,
    workflow: "animatron",
    background: { kind: "color", color: "#141416" },
    boil: {
      amplitude: 1.2,
      jitter: 0.45,
      intensity: 0.55,
      speed: 1,
      variety: 3,
    },
    layers: [
      {
        id: "layer-triangle",
        name: "Triangle",
        visible: true,
        isStatic: false,
        frames: [
          {
            id: "cel-0",
            strokes: [stroke],
            texts: [],
            images: [],
          },
        ],
      },
    ],
  };
}
