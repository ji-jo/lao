import { describe, expect, test } from "bun:test";
import { createEmptyProject, type Stroke, type StrokePoint } from "@/model/types";
import { expandSelectionByGroups } from "@/engine/artGroup";

function pts(): StrokePoint[] {
  return [
    { x: 0, y: 0, pressure: 1, t: 0 },
    { x: 10, y: 0, pressure: 1, t: 1 },
  ];
}

function stroke(id: string, groupId?: string): Stroke {
  return {
    id,
    brush: "ink",
    color: "#fff",
    size: 4,
    seed: 1,
    jitter: false,
    points: pts(),
    groupId,
  };
}

describe("artGroup", () => {
  test("expandSelectionByGroups pulls in siblings with the same groupId", () => {
    const project = createEmptyProject();
    project.layers[0]!.frames[0] = {
      id: "f",
      strokes: [stroke("a", "g1"), stroke("b", "g1"), stroke("c")],
    };
    expect(expandSelectionByGroups(["a"], project, 0).sort()).toEqual(["a", "b"]);
    expect(expandSelectionByGroups(["c"], project, 0)).toEqual(["c"]);
    expect(expandSelectionByGroups([], project, 0)).toEqual([]);
  });
});
