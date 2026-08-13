import { describe, expect, test } from "bun:test";
import type { MotionAssignment, StrokePoint } from "@/model/types";
import {
  applyMotionPose,
  buildMotionArcTable,
  motionPathUsable,
  motionPoseAt,
  motionProgress,
  sampleMotionTable,
} from "@/engine/motionPath";

function pts(coords: Array<[number, number]>): StrokePoint[] {
  return coords.map(([x, y], i) => ({ x, y, pressure: 1, t: i * 10 }));
}

const baseAssignment = (
  partial: Partial<MotionAssignment> = {},
): MotionAssignment => ({
  id: "a1",
  pathId: "p1",
  targetIds: ["s1"],
  anchor: { x: 0, y: 0 },
  startMs: 0,
  durationMs: 1000,
  ...partial,
});

describe("buildMotionArcTable", () => {
  test("accumulates length along a horizontal line", () => {
    const table = buildMotionArcTable(pts([[0, 0], [100, 0], [200, 0]]));
    expect(table.total).toBeCloseTo(200, 5);
    expect(table.samples).toHaveLength(3);
    expect(table.samples[2].s).toBeCloseTo(200, 5);
  });

  test("empty path has zero length", () => {
    expect(buildMotionArcTable([]).total).toBe(0);
  });
});

describe("sampleMotionTable", () => {
  test("samples midpoint of a straight path", () => {
    const table = buildMotionArcTable(pts([[0, 0], [100, 0]]));
    const mid = sampleMotionTable(table, 50);
    expect(mid.x).toBeCloseTo(50, 5);
    expect(mid.y).toBeCloseTo(0, 5);
    expect(mid.angle).toBeCloseTo(0, 5);
  });

  test("clamps beyond ends", () => {
    const table = buildMotionArcTable(pts([[0, 0], [100, 0]]));
    expect(sampleMotionTable(table, -10).x).toBeCloseTo(0, 5);
    expect(sampleMotionTable(table, 999).x).toBeCloseTo(100, 5);
  });
});

describe("motionProgress", () => {
  test("animatron eases and clamps", () => {
    const a = baseAssignment({ durationMs: 1000 });
    expect(motionProgress(a, -100, 0, "animatron")).toBe(0);
    expect(motionProgress(a, 500, 0, "animatron")).toBeCloseTo(0.5, 5);
    expect(motionProgress(a, 2000, 0, "animatron")).toBe(1);
  });

  test("stop-motion uses frame range", () => {
    const a = baseAssignment({ startFrame: 2, endFrame: 6 });
    expect(motionProgress(a, 0, 2, "stopmotion")).toBe(0);
    expect(motionProgress(a, 0, 4, "stopmotion")).toBeCloseTo(0.5, 5);
    expect(motionProgress(a, 0, 6, "stopmotion")).toBe(1);
  });
});

describe("motionPoseAt", () => {
  test("pins anchor to path start at u=0 when path starts at anchor", () => {
    const table = buildMotionArcTable(pts([[10, 20], [110, 20]]));
    const pose = motionPoseAt(table, {
      anchor: { x: 10, y: 20 },
      reverse: false,
      orient: false,
    }, 0);
    expect(pose.dx).toBeCloseTo(0, 5);
    expect(pose.dy).toBeCloseTo(0, 5);
  });

  test("moves anchor to path end at u=1", () => {
    const table = buildMotionArcTable(pts([[10, 20], [110, 20]]));
    const pose = motionPoseAt(table, {
      anchor: { x: 10, y: 20 },
      reverse: false,
      orient: false,
    }, 1);
    expect(pose.dx).toBeCloseTo(100, 5);
    expect(pose.dy).toBeCloseTo(0, 5);
  });

  test("reverse travels B→A", () => {
    const table = buildMotionArcTable(pts([[0, 0], [100, 0]]));
    const pose = motionPoseAt(table, {
      anchor: { x: 100, y: 0 },
      reverse: true,
      orient: false,
    }, 1);
    expect(pose.dx).toBeCloseTo(-100, 5);
  });

  test("orient is identity at u=0", () => {
    const table = buildMotionArcTable(pts([[0, 0], [100, 0], [100, 100]]));
    const pose = motionPoseAt(table, {
      anchor: { x: 0, y: 0 },
      reverse: false,
      orient: true,
    }, 0);
    expect(pose.angleRad).toBeCloseTo(0, 5);
  });
});

describe("applyMotionPose", () => {
  test("translates points by pose", () => {
    const out = applyMotionPose(
      pts([[0, 0], [10, 0]]),
      { x: 0, y: 0 },
      { dx: 5, dy: 3, angleRad: 0 },
    );
    expect(out[0].x).toBeCloseTo(5, 5);
    expect(out[0].y).toBeCloseTo(3, 5);
    expect(out[1].x).toBeCloseTo(15, 5);
  });
});

describe("motionPathUsable", () => {
  test("requires at least two points", () => {
    expect(motionPathUsable({ id: "p", bezierNodes: [], points: pts([[0, 0]]) })).toBe(false);
    expect(
      motionPathUsable({
        id: "p",
        bezierNodes: [],
        points: pts([[0, 0], [1, 0]]),
      }),
    ).toBe(true);
  });
});
