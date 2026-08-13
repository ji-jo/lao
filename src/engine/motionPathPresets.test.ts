import { describe, expect, test } from "bun:test";
import {
  buildPresetBezierNodes,
  createPresetMotionPath,
  MOTION_PATH_PRESETS,
  syncMotionPathPoints,
} from "@/engine/motionPathPresets";
import { motionPathUsable } from "@/engine/motionPath";

describe("motionPathPresets", () => {
  test("every preset has a label", () => {
    expect(MOTION_PATH_PRESETS.length).toBeGreaterThanOrEqual(4);
    for (const p of MOTION_PATH_PRESETS) {
      expect(p.label.length).toBeGreaterThan(0);
    }
  });

  test("straight produces editable nodes from A to B", () => {
    const nodes = buildPresetBezierNodes("straight", { x: 0, y: 0 }, { x: 100, y: 0 });
    expect(nodes.length).toBeGreaterThanOrEqual(2);
    expect(nodes[0].x).toBe(0);
    expect(nodes[nodes.length - 1].x).toBe(100);
  });

  test("presets produce usable motion paths", () => {
    for (const p of MOTION_PATH_PRESETS) {
      const path = createPresetMotionPath(p.id, { x: 50, y: 50 });
      expect(motionPathUsable(path)).toBe(true);
      expect(path.bezierNodes.length).toBeGreaterThanOrEqual(2);
    }
  });

  test("syncMotionPathPoints rebuilds polyline after node edit", () => {
    const path = createPresetMotionPath("straight", { x: 0, y: 0 }, { x: 100, y: 0 });
    const edited = {
      ...path,
      bezierNodes: path.bezierNodes.map((n, i) =>
        i === path.bezierNodes.length - 1 ? { ...n, x: 200, y: 0 } : n,
      ),
    };
    const synced = syncMotionPathPoints(edited);
    expect(synced.points[synced.points.length - 1].x).toBeCloseTo(200, 0);
  });
});
