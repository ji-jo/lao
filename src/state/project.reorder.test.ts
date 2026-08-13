import { describe, expect, test } from "bun:test";
import { createEmptyProject, type Stroke } from "@/model/types";
import { useProject } from "@/state/project";

function stroke(id: string): Stroke {
  return {
    id,
    brush: "ink",
    color: "#000",
    size: 4,
    points: [
      { x: 0, y: 0, pressure: 1, t: 0 },
      { x: 10, y: 0, pressure: 1, t: 1 },
    ],
    seed: 1,
    jitter: false,
  };
}

describe("reorderArt", () => {
  test("moves a stroke one step toward the front", () => {
    const project = createEmptyProject();
    project.layers = [
      {
        id: "l0",
        name: "Layer 1",
        visible: true,
        isStatic: false,
        frames: [
          {
            strokes: [stroke("a"), stroke("b"), stroke("c")],
            texts: [],
            images: [],
          },
        ],
      },
    ];
    useProject.getState().loadProject(project);
    useProject.getState().reorderArt(["b"], "forward");
    const ids = useProject
      .getState()
      .project.layers[0].frames[0]!.strokes.map((s) => s.id);
    expect(ids).toEqual(["a", "c", "b"]);
  });

  test("sends selected strokes to the back", () => {
    const project = createEmptyProject();
    project.layers = [
      {
        id: "l0",
        name: "Layer 1",
        visible: true,
        isStatic: false,
        frames: [
          {
            strokes: [stroke("a"), stroke("b"), stroke("c")],
            texts: [],
            images: [],
          },
        ],
      },
    ];
    useProject.getState().loadProject(project);
    useProject.getState().reorderArt(["c"], "back");
    const ids = useProject
      .getState()
      .project.layers[0].frames[0]!.strokes.map((s) => s.id);
    expect(ids).toEqual(["c", "a", "b"]);
  });
});
