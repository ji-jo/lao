import type {
  Layer,
  MotionAssignment,
  MotionPath,
  ProjectWorkflow,
  StrokePoint,
} from "@/model/types";
import { sampleBezierY } from "@/engine/strokeProgress";
import { transformPoints, translatePoints } from "@/engine/pathEdit";

/**
 * Motion-path engine: rides a group of elements along a pen-authored guide.
 * Everything here is a pure function of (assignment, path, time) so preview
 * === export and boil (applied afterwards on the posed points) stays seeded.
 */

export interface MotionPose {
  /** translation applied to the whole group (project px) */
  dx: number;
  dy: number;
  /** extra rotation around the moved anchor (radians); 0 unless orient */
  angleRad: number;
}

export const IDENTITY_POSE: MotionPose = { dx: 0, dy: 0, angleRad: 0 };

type ArcSample = { x: number; y: number; angle: number; s: number };

export interface MotionArcTable {
  samples: ArcSample[];
  total: number;
}

/** Cumulative arc-length table over a guide polyline (tangent per sample). */
export function buildMotionArcTable(points: StrokePoint[]): MotionArcTable {
  const samples: ArcSample[] = [];
  let s = 0;
  for (let i = 0; i < points.length; i++) {
    const p = points[i];
    const prev = i > 0 ? points[i - 1] : null;
    if (prev) s += Math.hypot(p.x - prev.x, p.y - prev.y);
    // Tangent from the segment behind (forward for the first point).
    const a = prev ?? p;
    const b = prev ? p : points[1] ?? p;
    const angle =
      a === b ? 0 : Math.atan2(b.y - a.y, b.x - a.x);
    samples.push({ x: p.x, y: p.y, angle, s });
  }
  return { samples, total: samples.length ? samples[samples.length - 1].s : 0 };
}

/** Point + tangent at arc distance `dist` (clamped to the path ends). */
export function sampleMotionTable(
  table: MotionArcTable,
  dist: number,
): { x: number; y: number; angle: number } {
  const { samples, total } = table;
  if (!samples.length) return { x: 0, y: 0, angle: 0 };
  if (samples.length === 1 || total <= 0) {
    const p = samples[0];
    return { x: p.x, y: p.y, angle: p.angle };
  }
  const d = Math.max(0, Math.min(total, dist));
  let lo = 0;
  let hi = samples.length - 1;
  while (lo < hi) {
    const mid = (lo + hi) >> 1;
    if (samples[mid].s < d) lo = mid + 1;
    else hi = mid;
  }
  const i = Math.max(1, lo);
  const a = samples[i - 1];
  const b = samples[i];
  const span = b.s - a.s || 1;
  const f = (d - a.s) / span;
  // Tangent of the segment we're on (not lerped through 0-length samples).
  const angle = Math.atan2(b.y - a.y, b.x - a.x);
  return {
    x: a.x + (b.x - a.x) * f,
    y: a.y + (b.y - a.y) * f,
    angle,
  };
}

/**
 * Timing progress 0..1 for an assignment. Animatron reads ms; stop-motion
 * reads the frame range. Holds at 0 before the window and 1 after (the group
 * parks at B). Eased by the assignment's cubic bezier.
 */
export function motionProgress(
  assignment: MotionAssignment,
  timeMs: number,
  frame: number,
  workflow: ProjectWorkflow,
): number {
  let raw: number;
  if (
    workflow === "stopmotion" &&
    assignment.startFrame != null &&
    assignment.endFrame != null
  ) {
    const span = assignment.endFrame - assignment.startFrame;
    raw = span > 0 ? (frame - assignment.startFrame) / span : frame >= assignment.startFrame ? 1 : 0;
  } else {
    raw =
      assignment.durationMs > 0
        ? (timeMs - assignment.startMs) / assignment.durationMs
        : timeMs >= assignment.startMs
          ? 1
          : 0;
  }
  const clamped = Math.max(0, Math.min(1, raw));
  return assignment.easing
    ? sampleBezierY(clamped, assignment.easing.bezier)
    : clamped;
}

/**
 * Pose for the group at progress u. Displacement pins the anchor to the path
 * point at u; when the guide starts on the anchor (Path Maker default) the
 * group doesn't jump at u=0. Orient adds tangent rotation relative to the
 * tangent at u=0, so the drawn orientation is the rest orientation.
 */
export function motionPoseAt(
  table: MotionArcTable,
  assignment: Pick<MotionAssignment, "anchor" | "reverse" | "orient">,
  u: number,
): MotionPose {
  if (!table.samples.length) return IDENTITY_POSE;
  const uu = assignment.reverse ? 1 - u : u;
  const startDist = assignment.reverse ? table.total : 0;
  const p = sampleMotionTable(table, uu * table.total);
  const p0 = sampleMotionTable(table, startDist);
  const dx = p.x - assignment.anchor.x;
  const dy = p.y - assignment.anchor.y;
  // Orient rotates by the tangent change since departure, so the drawn
  // orientation is the rest orientation (no jump at u=0, reversed or not).
  const angleRad = assignment.orient ? normalizeAngle(p.angle - p0.angle) : 0;
  return { dx, dy, angleRad };
}

function normalizeAngle(a: number): number {
  let r = a;
  while (r > Math.PI) r -= Math.PI * 2;
  while (r < -Math.PI) r += Math.PI * 2;
  return r;
}

/** Apply a pose to stroke points: translate, then rotate around the moved anchor. */
export function applyMotionPose(
  points: StrokePoint[],
  anchor: { x: number; y: number },
  pose: MotionPose,
): StrokePoint[] {
  if (pose.dx === 0 && pose.dy === 0 && pose.angleRad === 0) return points;
  const moved = translatePoints(points, pose.dx, pose.dy);
  if (pose.angleRad === 0) return moved;
  return transformPoints(
    moved,
    anchor.x + pose.dx,
    anchor.y + pose.dy,
    1,
    pose.angleRad,
  );
}

/** Apply a pose to a single point (image / text origin). */
export function applyMotionPoseToPoint(
  pt: { x: number; y: number },
  anchor: { x: number; y: number },
  pose: MotionPose,
): { x: number; y: number } {
  const x = pt.x + pose.dx;
  const y = pt.y + pose.dy;
  if (pose.angleRad === 0) return { x, y };
  const px = anchor.x + pose.dx;
  const py = anchor.y + pose.dy;
  const cos = Math.cos(pose.angleRad);
  const sin = Math.sin(pose.angleRad);
  const rx = (x - px) * cos - (y - py) * sin + px;
  const ry = (x - px) * sin + (y - py) * cos + py;
  return { x: rx, y: ry };
}

export interface ResolvedMotion {
  assignment: MotionAssignment;
  pose: MotionPose;
}

/**
 * Resolve every motion assignment on a layer at (timeMs | frame) into a map of
 * targetId → { assignment, pose }. Later assignments win on id collisions.
 */
export function layerMotionAt(
  layer: Layer,
  timeMs: number,
  frame: number,
  workflow: ProjectWorkflow,
): Map<string, ResolvedMotion> | null {
  const assignments = layer.motionAssignments;
  if (!assignments?.length || !layer.motionPaths?.length) return null;
  const paths = new Map(layer.motionPaths.map((p) => [p.id, p]));
  let out: Map<string, ResolvedMotion> | null = null;
  for (const a of assignments) {
    const path = paths.get(a.pathId);
    if (!path || path.points.length === 0) continue;
    const table = buildMotionArcTable(path.points);
    const u = motionProgress(a, timeMs, frame, workflow);
    const pose = motionPoseAt(table, a, u);
    if (!out) out = new Map();
    for (const id of a.targetIds) out.set(id, { assignment: a, pose });
  }
  return out;
}

/** Guide path validity — at least two distinct points to ride along. */
export function motionPathUsable(path: MotionPath): boolean {
  return path.points.length >= 2;
}

/**
 * Build a `displaced` map for strokes that ride a motion path this frame.
 * Pass a precomputed `resolved` map to avoid rebuilding arc tables twice.
 */
export function motionDisplacement(
  layer: Layer,
  strokes: { id: string; points: StrokePoint[] }[],
  timeMs: number,
  frame: number,
  workflow: ProjectWorkflow,
  resolved?: Map<string, ResolvedMotion> | null,
): Map<string, StrokePoint[]> | null {
  const map = resolved !== undefined ? resolved : layerMotionAt(layer, timeMs, frame, workflow);
  if (!map) return null;
  let out: Map<string, StrokePoint[]> | null = null;
  for (const s of strokes) {
    const hit = map.get(s.id);
    if (!hit) continue;
    if (!out) out = new Map();
    out.set(s.id, applyMotionPose(s.points, hit.assignment.anchor, hit.pose));
  }
  return out;
}

/** Merge motion + boil: motion first, then boil overwrites with jitter of posed points. */
export function mergeDisplaced(
  base: Map<string, StrokePoint[]> | null | undefined,
  overlay: Map<string, StrokePoint[]> | null | undefined,
): Map<string, StrokePoint[]> | undefined {
  if (!base && !overlay) return undefined;
  if (!base) return overlay ?? undefined;
  if (!overlay) return base;
  const out = new Map(base);
  for (const [k, v] of overlay) out.set(k, v);
  return out;
}
