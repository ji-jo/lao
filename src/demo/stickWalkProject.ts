/**
 * Stop-motion demo: stick-figure walk cycle.
 * Used by scripts/make-web-demos.mjs to load into the full lao UI.
 */
import type { Frame, Project, Stroke, StrokePoint } from "@/model/types";

export type DemoAspect = "1x1" | "4x3";

export const STICK_FPS = 12;
/** ~2s loop of an 8-pose cycle held 3 frames each */
export const STICK_FRAMES = 24;

const INK = "#1a1a1c";
const BG = "#f4f1ea";

type Pt = { x: number; y: number };

function pt(x: number, y: number, t = 0, pressure = 0.9): StrokePoint {
  return { x, y, pressure, t };
}

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
    out.push(pt(x0 + (x1 - x0) * u, y0 + (y1 - y0) * u, t0 + u));
  }
  return t0 + 1;
}

function line(a: Pt, b: Pt, spacing = 4): StrokePoint[] {
  const out: StrokePoint[] = [pt(a.x, a.y, 0)];
  sampleSegment(a.x, a.y, b.x, b.y, 0, out, spacing);
  return out;
}

function circle(c: Pt, r: number, spacing = 3): StrokePoint[] {
  const circ = 2 * Math.PI * r;
  const steps = Math.max(12, Math.ceil(circ / spacing));
  const out: StrokePoint[] = [];
  for (let i = 0; i <= steps; i++) {
    const a = (i / steps) * Math.PI * 2 - Math.PI / 2;
    out.push(pt(c.x + Math.cos(a) * r, c.y + Math.sin(a) * r, i / steps));
  }
  return out;
}

function hashId(id: string): number {
  let h = 2166136261;
  for (let i = 0; i < id.length; i++) {
    h ^= id.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

function mkStroke(id: string, points: StrokePoint[], size: number): Stroke {
  return {
    id,
    brush: "ink",
    color: INK,
    size,
    points,
    seed: hashId(id),
    jitter: true,
  };
}

type Pose = {
  hip: Pt;
  head: Pt;
  shoulder: Pt;
  lHand: Pt;
  rHand: Pt;
  lFoot: Pt;
  rFoot: Pt;
};

function buildPoses(cx: number, cy: number, s: number): Pose[] {
  const hipY = cy + s * 0.05;
  const headY = cy - s * 0.72;
  const shoulderY = cy - s * 0.38;
  const ground = cy + s * 0.95;

  return [
    {
      hip: { x: cx, y: hipY },
      head: { x: cx + s * 0.02, y: headY },
      shoulder: { x: cx, y: shoulderY },
      lHand: { x: cx + s * 0.42, y: cy + s * 0.05 },
      rHand: { x: cx - s * 0.38, y: cy + s * 0.12 },
      lFoot: { x: cx - s * 0.38, y: ground },
      rFoot: { x: cx + s * 0.42, y: ground },
    },
    {
      hip: { x: cx, y: hipY + s * 0.06 },
      head: { x: cx + s * 0.04, y: headY + s * 0.05 },
      shoulder: { x: cx, y: shoulderY + s * 0.05 },
      lHand: { x: cx + s * 0.28, y: cy + s * 0.18 },
      rHand: { x: cx - s * 0.22, y: cy + s * 0.22 },
      lFoot: { x: cx - s * 0.18, y: ground },
      rFoot: { x: cx + s * 0.22, y: ground - s * 0.02 },
    },
    {
      hip: { x: cx, y: hipY },
      head: { x: cx + s * 0.02, y: headY },
      shoulder: { x: cx, y: shoulderY },
      lHand: { x: cx + s * 0.08, y: cy + s * 0.2 },
      rHand: { x: cx - s * 0.08, y: cy + s * 0.2 },
      lFoot: { x: cx - s * 0.02, y: ground },
      rFoot: { x: cx + s * 0.05, y: ground - s * 0.22 },
    },
    {
      hip: { x: cx, y: hipY - s * 0.02 },
      head: { x: cx, y: headY - s * 0.02 },
      shoulder: { x: cx, y: shoulderY - s * 0.02 },
      lHand: { x: cx - s * 0.2, y: cy + s * 0.12 },
      rHand: { x: cx + s * 0.32, y: cy + s * 0.08 },
      lFoot: { x: cx + s * 0.28, y: ground - s * 0.12 },
      rFoot: { x: cx - s * 0.12, y: ground },
    },
    {
      hip: { x: cx, y: hipY },
      head: { x: cx - s * 0.02, y: headY },
      shoulder: { x: cx, y: shoulderY },
      lHand: { x: cx - s * 0.42, y: cy + s * 0.05 },
      rHand: { x: cx + s * 0.38, y: cy + s * 0.12 },
      lFoot: { x: cx + s * 0.38, y: ground },
      rFoot: { x: cx - s * 0.42, y: ground },
    },
    {
      hip: { x: cx, y: hipY + s * 0.06 },
      head: { x: cx - s * 0.04, y: headY + s * 0.05 },
      shoulder: { x: cx, y: shoulderY + s * 0.05 },
      lHand: { x: cx - s * 0.28, y: cy + s * 0.18 },
      rHand: { x: cx + s * 0.22, y: cy + s * 0.22 },
      lFoot: { x: cx + s * 0.18, y: ground },
      rFoot: { x: cx - s * 0.22, y: ground - s * 0.02 },
    },
    {
      hip: { x: cx, y: hipY },
      head: { x: cx - s * 0.02, y: headY },
      shoulder: { x: cx, y: shoulderY },
      lHand: { x: cx - s * 0.08, y: cy + s * 0.2 },
      rHand: { x: cx + s * 0.08, y: cy + s * 0.2 },
      lFoot: { x: cx + s * 0.02, y: ground },
      rFoot: { x: cx - s * 0.05, y: ground - s * 0.22 },
    },
    {
      hip: { x: cx, y: hipY - s * 0.02 },
      head: { x: cx, y: headY - s * 0.02 },
      shoulder: { x: cx, y: shoulderY - s * 0.02 },
      lHand: { x: cx + s * 0.2, y: cy + s * 0.12 },
      rHand: { x: cx - s * 0.32, y: cy + s * 0.08 },
      lFoot: { x: cx - s * 0.28, y: ground - s * 0.12 },
      rFoot: { x: cx + s * 0.12, y: ground },
    },
  ];
}

function poseToStrokes(pose: Pose, frame: number, headR: number, size: number): Stroke[] {
  const id = `f${frame}`;
  return [
    mkStroke(`${id}-head`, circle(pose.head, headR), size * 0.95),
    mkStroke(`${id}-spine`, line(pose.head, pose.hip), size),
    mkStroke(`${id}-larm`, line(pose.shoulder, pose.lHand), size * 0.9),
    mkStroke(`${id}-rarm`, line(pose.shoulder, pose.rHand), size * 0.9),
    mkStroke(`${id}-lleg`, line(pose.hip, pose.lFoot), size),
    mkStroke(`${id}-rleg`, line(pose.hip, pose.rFoot), size),
  ];
}

export function canvasSizeForAspect(aspect: DemoAspect): { width: number; height: number } {
  if (aspect === "1x1") return { width: 1080, height: 1080 };
  return { width: 1280, height: 960 };
}

export function createStickWalkProject(aspect: DemoAspect = "4x3"): Project {
  const { width, height } = canvasSizeForAspect(aspect);
  const cx = width / 2;
  const cy = height / 2;
  const s = Math.min(width, height) * 0.28;
  const headR = s * 0.16;
  const strokeSize = Math.max(6, Math.round(s * 0.045));
  const poses = buildPoses(cx, cy, s);

  const frames: (Frame | null)[] = [];
  for (let i = 0; i < STICK_FRAMES; i++) {
    const poseIdx = Math.floor(i / 3) % poses.length;
    const pose = poses[poseIdx]!;
    frames.push({
      id: `cel-${i}`,
      strokes: poseToStrokes(pose, i, headR, strokeSize),
      texts: [],
      images: [],
    });
  }

  return {
    version: 1,
    name: `Stick Walk (${aspect})`,
    width,
    height,
    fps: STICK_FPS,
    frameCount: STICK_FRAMES,
    workflow: "stopmotion",
    background: { kind: "color", color: BG },
    boil: {
      amplitude: 1.1,
      jitter: 0.4,
      intensity: 0.5,
      speed: 1,
      variety: 3,
    },
    layers: [
      {
        id: "layer-stick",
        name: "Stick",
        visible: true,
        isStatic: false,
        frames,
      },
    ],
  };
}
