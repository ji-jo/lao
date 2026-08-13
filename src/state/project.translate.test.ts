import { describe, expect, test } from "bun:test";
import { createEmptyProject, type Stroke } from "@/model/types";
import { useProject } from "@/state/project";
import { useSelection } from "@/state/selection";

function stroke(id: string, x: number, y: number): Stroke {
  return {
    id,
    brush: "ink",
    color: "#000",
    size: 4,
    points: [
      { x, y, pressure: 1, t: 0 },
      { x: x + 40, y: y + 20, pressure: 1, t: 1 },
    ],
  };
}

describe("translateStrokes across layers", () => {
  test("moves strokes on every layer in one commit", () => {
    const project = createEmptyProject();
    project.workflow = "animatron";
    project.layers = [
      {
        id: "l0",
        name: "Path 1",
        visible: true,
        isStatic: false,
        frames: [{ strokes: [stroke("a", 10, 10)], texts: [], images: [] }],
      },
      {
        id: "l1",
        name: "Path 2",
        visible: true,
        isStatic: false,
        frames: [{ strokes: [stroke("b", 50, 50)], texts: [], images: [] }],
      },
    ];

    useProject.getState().loadProject(project);
    useSelection.getState().selectAllLayers();

    const ids = useSelection.getState().ids;
    expect(ids).toContain("a");
    expect(ids).toContain("b");

    useProject.getState().translateStrokes(ids, 5, 7);

    const next = useProject.getState().project;
    const a = next.layers[0].frames[0]!.strokes[0].points[0];
    const b = next.layers[1].frames[0]!.strokes[0].points[0];
    expect(a.x).toBe(15);
    expect(a.y).toBe(17);
    expect(b.x).toBe(55);
    expect(b.y).toBe(57);
  });
});
