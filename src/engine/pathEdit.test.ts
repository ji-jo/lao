import { describe, expect, test } from "bun:test";
import { handleIndices, straightLinePoints, warpPoints, distanceToPoints } from "./pathEdit";
import type { StrokePoint } from "@/model/types";

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

  test("distanceToPoints finds nearest sample", () => {
    expect(distanceToPoints(pts(10), 5, 3)).toBeCloseTo(3);
  });
});
