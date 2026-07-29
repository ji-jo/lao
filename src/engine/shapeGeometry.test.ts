import { describe, expect, test } from "bun:test";
import {
  buildShapePoints,
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

  test("arrow has a tip near the end point", () => {
    const { points } = buildShapePoints("arrow", 0, 0, 100, 0);
    const tip = points.reduce((best, p) => (p.x > best.x ? p : best), points[0]);
    expect(tip.x).toBeCloseTo(100, 0);
  });

  test("drag significance threshold", () => {
    expect(shapeDragSignificant(0, 0, 1, 1)).toBe(false);
    expect(shapeDragSignificant(0, 0, 10, 0)).toBe(true);
  });
});
