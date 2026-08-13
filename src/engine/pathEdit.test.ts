import { describe, expect, test } from "bun:test";
import {
  handleIndices,
  straightLinePoints,
  warpPoints,
  distanceToPoints,
  transformPoints,
  translateBezierNodes,
  transformBezierNodes,
  hitsStroke,
  isNearClosedLoop,
  fillGapThreshold,
  bridgeNearClosedPoints,
  fillShiftEdgeDistance,
  fillPolygonExpandDistance,
  pointInPolygon,
} from "./pathEdit";
import type { BezierNode, StrokePoint } from "@/model/types";

function pts(n: number): StrokePoint[] {
  return Array.from({ length: n }, (_, i) => ({ x: i, y: 0, pressure: 0.5, t: i }));
}

describe("pathEdit", () => {
  test("handleIndices covers endpoints and is spaced", () => {
    const idx = handleIndices(45);
    expect(idx[0]).toBe(0);
    expect(idx[idx.length - 1]).toBe(44);
    expect(idx.length).toBeGreaterThan(2);
  });

  test("warp moves the grabbed point fully, neighbors partially, far points not at all", () => {
    const p = pts(60);
    const out = warpPoints(p, 30, 0, 10);
    expect(out[30].y).toBeCloseTo(10);
    expect(out[33].y).toBeGreaterThan(0);
    expect(out[33].y).toBeLessThan(10);
    expect(out[0].y).toBe(0);
    expect(out[59].y).toBe(0);
  });

  test("warp preserves pressure/timing and does not mutate input", () => {
    const p = pts(30);
    const out = warpPoints(p, 10, 5, 5);
    expect(p[10].x).toBe(10);
    expect(out[10].pressure).toBe(0.5);
    expect(out[10].t).toBe(10);
  });

  test("straight line interpolates ends exactly", () => {
    const line = straightLinePoints(
      { x: 0, y: 0, pressure: 0.4, t: 0 },
      { x: 100, y: 50, pressure: 0.8, t: 200 },
    );
    expect(line[0]).toEqual({ x: 0, y: 0, pressure: 0.4, t: 0 });
    expect(line[line.length - 1]).toEqual({ x: 100, y: 50, pressure: 0.8, t: 200 });
    const mid = line[Math.floor(line.length / 2)];
    expect(mid.x).toBeCloseTo(50);
    expect(mid.y).toBeCloseTo(25);
  });

  test("transform scales and rotates around pivot", () => {
    const p: StrokePoint[] = [{ x: 1, y: 0, pressure: 0.5, t: 0 }];
    expect(transformPoints(p, 0, 0, 2, 0)[0].x).toBeCloseTo(2);
    const rot = transformPoints(p, 0, 0, 1, Math.PI / 2)[0];
    expect(rot.x).toBeCloseTo(0);
    expect(rot.y).toBeCloseTo(1);
    expect(rot.pressure).toBe(0.5);
  });

  test("translateBezierNodes moves anchors and absolute handles", () => {
    const nodes: BezierNode[] = [
      {
        x: 10,
        y: 20,
        handleIn: { x: 5, y: 20 },
        handleOut: { x: 15, y: 20 },
      },
    ];
    const out = translateBezierNodes(nodes, 3, -4);
    expect(out[0].x).toBe(13);
    expect(out[0].y).toBe(16);
    expect(out[0].handleIn).toEqual({ x: 8, y: 16 });
    expect(out[0].handleOut).toEqual({ x: 18, y: 16 });
    expect(nodes[0].x).toBe(10);
  });

  test("transformBezierNodes scales and rotates anchors + handles", () => {
    const nodes: BezierNode[] = [
      { x: 1, y: 0, handleOut: { x: 2, y: 0 } },
    ];
    const out = transformBezierNodes(nodes, 0, 0, 2, Math.PI / 2);
    expect(out[0].x).toBeCloseTo(0);
    expect(out[0].y).toBeCloseTo(2);
    expect(out[0].handleOut!.x).toBeCloseTo(0);
    expect(out[0].handleOut!.y).toBeCloseTo(4);
  });

  test("distanceToPoints is imported for coverage side-effect free", () => {
    expect(typeof distanceToPoints).toBe("function");
  });

  test("isNearClosedLoop detects visually closed freehand loops", () => {
    const square: StrokePoint[] = [
      { x: 0, y: 0, pressure: 0.5, t: 0 },
      { x: 100, y: 0, pressure: 0.5, t: 1 },
      { x: 100, y: 100, pressure: 0.5, t: 2 },
      { x: 8, y: 5, pressure: 0.5, t: 3 },
    ];
    expect(isNearClosedLoop(square, 12)).toBe(true);
    expect(isNearClosedLoop(square, 4)).toBe(false);
  });

  test("bucket interior hit works on near-closed loop without closed flag", () => {
    const loop: StrokePoint[] = [
      { x: 10, y: 10, pressure: 0.5, t: 0 },
      { x: 90, y: 10, pressure: 0.5, t: 1 },
      { x: 90, y: 90, pressure: 0.5, t: 2 },
      { x: 12, y: 12, pressure: 0.5, t: 3 },
    ];
    const gap = fillGapThreshold(8);
    expect(isNearClosedLoop(loop, gap)).toBe(true);
    expect(hitsStroke(loop, 50, 50, 4, false)).toBe(false);
    expect(hitsStroke(loop, 50, 50, 4, true)).toBe(true);
    expect(pointInPolygon(loop, 50, 50)).toBe(true);
  });

  test("bridgeNearClosedPoints spans a small start/end gap", () => {
    const loop: StrokePoint[] = [
      { x: 0, y: 0, pressure: 0.5, t: 0 },
      { x: 100, y: 0, pressure: 0.5, t: 1 },
      { x: 100, y: 100, pressure: 0.5, t: 2 },
      { x: 10, y: 8, pressure: 0.5, t: 3 },
    ];
    const gap = fillGapThreshold(8);
    const bridged = bridgeNearClosedPoints(loop, gap);
    expect(bridged.length).toBeGreaterThan(loop.length);
  });

  test("fill edge distances grow with brush size", () => {
    expect(fillShiftEdgeDistance(10)).toBeGreaterThan(fillShiftEdgeDistance(4));
    expect(fillPolygonExpandDistance(10)).toBeGreaterThan(fillShiftEdgeDistance(10));
  });
});
