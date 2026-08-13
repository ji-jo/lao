import { describe, expect, test } from "bun:test";
import type { Frame, Stroke, StrokePoint } from "@/model/types";
import {
  alignStrokeDirection,
  generateInbetweenFrames,
  interpolatePointsRotationAware,
  matchStrokes,
  resamplePolyline,
  tweenFrames,
  tweenStrokesAt,
} from "@/engine/tween";

function pts(coords: Array<[number, number]>): StrokePoint[] {
  return coords.map(([x, y], i) => ({ x, y, pressure: 0.8, t: i * 10 }));
}

function stroke(id: string, coords: Array<[number, number]>, partial: Partial<Stroke> = {}): Stroke {
  return {
    id,
    brush: "ink",
    color: "#000000",
    size: 4,
    seed: 1,
    jitter: false,
    points: pts(coords),
    ...partial,
  };
}

describe("resamplePolyline", () => {
  test("returns exact count", () => {
    const out = resamplePolyline(pts([[0, 0], [100, 0]]), 11);
    expect(out).toHaveLength(11);
    expect(out[0].x).toBeCloseTo(0, 5);
    expect(out[10].x).toBeCloseTo(100, 5);
    expect(out[5].x).toBeCloseTo(50, 5);
  });
});

describe("alignStrokeDirection", () => {
  test("flips reversed stroke to match", () => {
    const from = pts([[0, 0], [10, 0], [20, 0]]);
    const to = pts([[20, 1], [10, 1], [0, 1]]);
    const aligned = alignStrokeDirection(from, to);
    expect(aligned[0].x).toBeCloseTo(0, 5);
    expect(aligned[aligned.length - 1].x).toBeCloseTo(20, 5);
  });
});

describe("interpolatePointsRotationAware", () => {
  test("pure translation mid-point is halfway", () => {
    const a = pts([[0, 0], [10, 0]]);
    const b = pts([[20, 0], [30, 0]]);
    const mid = interpolatePointsRotationAware(a, b, 0.5);
    expect(mid[0].x).toBeCloseTo(10, 5);
    expect(mid[1].x).toBeCloseTo(20, 5);
  });

  test("90° swing keeps segment length", () => {
    const a = pts([[0, 0], [100, 0]]);
    const b = pts([[0, 0], [0, 100]]);
    const mid = interpolatePointsRotationAware(a, b, 0.5);
    const len = Math.hypot(mid[1].x - mid[0].x, mid[1].y - mid[0].y);
    expect(len).toBeCloseTo(100, 3);
  });
});

describe("matchStrokes", () => {
  test("pairs by proximity", () => {
    const from = [stroke("a", [[0, 0], [10, 0]]), stroke("b", [[100, 0], [110, 0]])];
    const to = [stroke("c", [[102, 1], [112, 1]]), stroke("d", [[1, 1], [11, 1]])];
    const { pairs, unmatchedFrom, unmatchedTo } = matchStrokes(from, to);
    expect(pairs).toHaveLength(2);
    expect(unmatchedFrom).toHaveLength(0);
    expect(unmatchedTo).toHaveLength(0);
    const pairA = pairs.find((p) => p.from.id === "a");
    expect(pairA?.to.id).toBe("d");
  });
});

describe("tweenFrames", () => {
  test("u=0 returns A, u=1 returns B", () => {
    const a: Frame = { id: "a", strokes: [stroke("s1", [[0, 0], [10, 0]])] };
    const b: Frame = { id: "b", strokes: [stroke("s2", [[50, 0], [60, 0]])] };
    expect(tweenFrames(a, b, 0).strokes[0].points[0].x).toBeCloseTo(0, 5);
    expect(tweenFrames(a, b, 1).strokes[0].points[0].x).toBeCloseTo(50, 5);
  });

  test("mid tween is deterministic", () => {
    const a = [stroke("s1", [[0, 0], [10, 0]], { color: "#000000" })];
    const b = [stroke("s2", [[20, 0], [30, 0]], { color: "#000000" })];
    const m1 = tweenStrokesAt(a, b, 0.5);
    const m2 = tweenStrokesAt(a, b, 0.5);
    expect(m1[0].points[0].x).toBeCloseTo(m2[0].points[0].x, 8);
    expect(m1[0].points[0].x).toBeCloseTo(10, 3);
  });
});

describe("generateInbetweenFrames", () => {
  test("creates N exclusive in-betweens", () => {
    const a: Frame = { id: "a", strokes: [stroke("s1", [[0, 0], [10, 0]])] };
    const b: Frame = { id: "b", strokes: [stroke("s2", [[100, 0], [110, 0]])] };
    const mids = generateInbetweenFrames(a, b, 3);
    expect(mids).toHaveLength(3);
    expect(mids[0].strokes[0].points[0].x).toBeGreaterThan(0);
    expect(mids[0].strokes[0].points[0].x).toBeLessThan(100);
    expect(mids[1].id).not.toBe(mids[0].id);
  });
});
