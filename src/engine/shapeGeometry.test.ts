import { describe, expect, test } from "bun:test";
import {
  arrowHeadCorners,
  buildShapePoints,
  bakeShapeGeometry,
  constrainLineEnd,
  isClosedShape,
  resolveShapeFrame,
  shapeDragSignificant,
} from "./shapeGeometry";

describe("shapeGeometry", () => {
  test("closed kinds", () => {
    expect(isClosedShape("rect")).toBe(true);
    expect(isClosedShape("circle")).toBe(true);
    expect(isClosedShape("line")).toBe(false);
    expect(isClosedShape("arrow")).toBe(false);
  });

  test("shift constrains rect to square", () => {
    const frame = resolveShapeFrame("rect", 0, 0, 40, 10, { constrain: true });
    expect(frame.box.w).toBe(40);
    expect(frame.box.h).toBe(40);
  });

  test("alt grows rect from center", () => {
    const frame = resolveShapeFrame("rect", 100, 100, 140, 120, {
      fromCenter: true,
    });
    expect(frame.box.x).toBe(60);
    expect(frame.box.y).toBe(80);
    expect(frame.box.w).toBe(80);
    expect(frame.box.h).toBe(40);
  });

  test("line shift snaps to 45°", () => {
    const end = constrainLineEnd(0, 0, 10, 1);
    expect(Math.abs(end.y)).toBeLessThan(1e-9);
    expect(end.x).toBeCloseTo(Math.hypot(10, 1), 5);
  });

  test("rect points close the loop", () => {
    const { points, closed } = buildShapePoints("rect", 0, 0, 20, 10);
    expect(closed).toBe(true);
    expect(points.length).toBeGreaterThan(4);
    const first = points[0];
    const last = points[points.length - 1];
    expect(last.x).toBeCloseTo(first.x, 5);
    expect(last.y).toBeCloseTo(first.y, 5);
  });

  test("circle samples a full ellipse", () => {
    const { points, closed } = buildShapePoints("circle", 0, 0, 40, 40);
    expect(closed).toBe(true);
    expect(points.length).toBeGreaterThan(30);
  });

  test("arrow is an open shaft with tip at the end point", () => {
    const { points, closed } = buildShapePoints("arrow", 0, 0, 100, 0);
    expect(closed).toBe(false);
    const tip = points[points.length - 1]!;
    expect(tip.x).toBeCloseTo(100, 0);
    expect(tip.y).toBeCloseTo(0, 5);
    expect(tip.t).toBeGreaterThan(500);
  });

  test("arrow head corners form a tip triangle", () => {
    const head = arrowHeadCorners(0, 0, 100, 0, 4);
    expect(head).not.toBeNull();
    expect(head![0]!.x).toBeCloseTo(100, 5);
    expect(head![1]!.x).toBeLessThan(100);
    expect(head![2]!.x).toBeLessThan(100);
  });

  test("diagonal line bake keeps both axes", () => {
    const baked = bakeShapeGeometry("line", {
      x: 10,
      y: 20,
      w: 0,
      h: 0,
      dx: 40,
      dy: 30,
      rotationDeg: 0,
    });
    expect(baked.shapeBox.w).toBeCloseTo(40, 5);
    expect(baked.shapeBox.h).toBeCloseTo(30, 5);
    const last = baked.points[baked.points.length - 1]!;
    expect(last.x).toBeCloseTo(50, 0);
    expect(last.y).toBeCloseTo(50, 0);
  });

  test("drag significance threshold", () => {
    expect(shapeDragSignificant(0, 0, 1, 1)).toBe(false);
    expect(shapeDragSignificant(0, 0, 10, 0)).toBe(true);
  });
});
