import { describe, expect, test } from "bun:test";
import {
  ART_DUPLICATE_OFFSET,
  cloneStrokeAtOffset,
} from "@/engine/artDuplicate";
import { createEmptyProject, type Stroke } from "@/model/types";
import { useProject } from "@/state/project";

function rectStroke(id: string): Stroke {
  return {
    id,
    brush: "ink",
    color: "#00f",
    size: 4,
    points: [
      { x: 10, y: 20, pressure: 1, t: 0 },
      { x: 110, y: 20, pressure: 1, t: 1 },
      { x: 110, y: 70, pressure: 1, t: 2 },
      { x: 10, y: 70, pressure: 1, t: 3 },
    ],
    seed: 7,
    jitter: false,
    shapeKind: "rect",
    shapeBox: { x: 10, y: 20, w: 100, h: 50 },
    fillColor: "#00f",
  };
}

describe("cloneStrokeAtOffset", () => {
  test("new id, new seed, offset points and shapeBox, drops groupId", () => {
    const src = { ...rectStroke("a"), groupId: "g1" };
    const copy = cloneStrokeAtOffset(src, ART_DUPLICATE_OFFSET, ART_DUPLICATE_OFFSET);
    expect(copy.id).not.toBe("a");
    expect(copy.seed).not.toBe(7);
    expect(copy.groupId).toBeUndefined();
    expect(copy.points[0]!.x).toBeCloseTo(26, 5);
    expect(copy.points[0]!.y).toBeCloseTo(36, 5);
    expect(copy.shapeBox?.x).toBeCloseTo(26, 5);
    expect(copy.shapeBox?.y).toBeCloseTo(36, 5);
    expect(copy.shapeBox?.w).toBe(100);
    expect(src.points[0]!.x).toBe(10);
  });
});

describe("duplicateArt", () => {
  test("adds a cloned stroke on the same layer and returns the new id", () => {
    const project = createEmptyProject();
    project.workflow = "stopmotion";
    project.layers = [
      {
        id: "l0",
        name: "Layer 1",
        visible: true,
        isStatic: false,
        frames: [{ id: "f0", strokes: [rectStroke("a")], texts: [], images: [] }],
      },
    ];
    useProject.getState().loadProject(project);
    const newIds = useProject.getState().duplicateArt(["a"]);
    expect(newIds).toHaveLength(1);
    const layer = useProject.getState().project.layers[0]!;
    const cel = layer.frames[0]!;
    expect(cel.strokes).toHaveLength(2);
    expect(cel.strokes[1]!.id).toBe(newIds[0]);
    expect(cel.strokes[1]!.shapeBox?.x).toBe(10 + ART_DUPLICATE_OFFSET);
  });
});
