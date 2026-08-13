import { describe, expect, test } from "bun:test";
import {
  flattenBezierNodes,
  pointsToBezierNodes,
  simplifyPolyline,
  toggleBezierNodeCorner,
} from "./bezier";

describe("bezier path editing", () => {
  test("simplifyPolyline reduces dense polylines", () => {
    const dense = Array.from({ length: 50 }, (_, i) => ({ x: i, y: 0 }));
    const simple = simplifyPolyline(dense, 2);
    expect(simple.length).toBeLessThan(dense.length);
    expect(simple[0]).toEqual({ x: 0, y: 0 });
    expect(simple[simple.length - 1]).toEqual({ x: 49, y: 0 });
  });

  test("pointsToBezierNodes fits a closed loop with sparse anchors", () => {
    const r = 80;
    const pts = Array.from({ length: 64 }, (_, i) => {
      const a = (i / 64) * Math.PI * 2;
      return { x: 200 + Math.cos(a) * r, y: 200 + Math.sin(a) * r, pressure: 1, t: 0 };
    });
    const { nodes, closed } = pointsToBezierNodes(pts, { strokeSize: 24 });
    expect(closed).toBe(true);
    expect(nodes.length).toBeGreaterThan(3);
    expect(nodes.length).toBeLessThan(pts.length);
    const flat = flattenBezierNodes(nodes, closed, 500);
    expect(flat.length).toBeGreaterThan(10);
    expect(flat[0].t).toBe(0);
    expect(flat[flat.length - 1].t).toBe(500);
  });

  test("toggleBezierNodeCorner removes and restores handles", () => {
    const nodes = [
      { x: 0, y: 0, handleOut: { x: 10, y: 0 } },
      { x: 100, y: 0, handleIn: { x: 90, y: 0 } },
    ];
    const corner = toggleBezierNodeCorner(nodes, 0, false);
    expect(corner[0].handleIn).toBeUndefined();
    expect(corner[0].handleOut).toBeUndefined();
    const smooth = toggleBezierNodeCorner(corner, 0, false);
    expect(smooth[0].handleOut).toBeDefined();
  });
});
