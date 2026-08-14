import { describe, expect, test } from "bun:test";
import { findArtAtProject } from "@/engine/artHitTest";
import { createEmptyProject, type Stroke } from "@/model/types";

function rect(id: string, x: number, y: number, w: number, h: number): Stroke {
  return {
    id,
    brush: "ink",
    color: "#00f",
    size: 4,
    seed: 1,
    jitter: false,
    fillColor: "#00f",
    shapeKind: "rect",
    shapeBox: { x, y, w, h },
    points: [
      { x, y, pressure: 1, t: 0 },
      { x: x + w, y, pressure: 1, t: 1 },
      { x: x + w, y: y + h, pressure: 1, t: 2 },
      { x, y: y + h, pressure: 1, t: 3 },
    ],
  };
}

describe("findArtAtProject", () => {
  test("hits the fill of a closed rect, not only the stroke outline", () => {
    const project = createEmptyProject();
    project.workflow = "stopmotion";
    const a = rect("a", 0, 0, 100, 80);
    project.layers[0]!.frames[0] = {
      id: "f0",
      strokes: [a],
      texts: [],
      images: [],
    };
    const hit = findArtAtProject(project, 0, 50, 40, null);
    expect(hit?.id).toBe("a");
  });

  test("picks the topmost of two overlapping rects", () => {
    const project = createEmptyProject();
    project.workflow = "stopmotion";
    project.layers[0]!.frames[0] = {
      id: "f0",
      strokes: [rect("a", 0, 0, 100, 80), rect("b", 40, 30, 100, 80)],
      texts: [],
      images: [],
    };
    const hit = findArtAtProject(project, 0, 70, 50, null);
    expect(hit?.id).toBe("b");
  });
});
