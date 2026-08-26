import { describe, expect, test } from "bun:test";
import { createEmptyProject, type Stroke } from "@/model/types";
import { usePlayback } from "@/state/playback";
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

describe("empty cel (addKeyframe)", () => {
  test("wipes a keyed cell even when onion auto-duplicate is on", () => {
    const project = createEmptyProject();
    project.workflow = "stopmotion";
    project.layers = [
      {
        id: "l0",
        name: "Layer 1",
        visible: true,
        isStatic: false,
        frames: [
          {
            id: "f0",
            strokes: [stroke("a")],
            texts: [
              {
                id: "t0",
                text: "hi",
                x: 0,
                y: 0,
                fontFamily: "Inter",
                size: 24,
                color: "#000",
              },
            ],
            images: [],
          },
        ],
      },
    ];
    useProject.getState().loadProject(project);
    usePlayback.getState().setOnionSkinProps({ onionAutoDuplicate: true });
    usePlayback.setState({ onionSkin: true });

    useProject.getState().addKeyframe();

    expect(useProject.getState().project.layers[0]!.frames[0]).toBeNull();
  });

  test("on a hold, inserts a blank key so the previous drawing does not show through", () => {
    const project = createEmptyProject();
    project.workflow = "stopmotion";
    project.frameCount = 4;
    project.layers = [
      {
        id: "l0",
        name: "Layer 1",
        visible: true,
        isStatic: false,
        frames: [{ id: "f0", strokes: [stroke("a")], texts: [], images: [] }],
      },
    ];
    useProject.getState().loadProject(project);
    useProject.setState({ frameIndex: 2 });
    usePlayback.getState().setOnionSkinProps({ onionAutoDuplicate: true });
    usePlayback.setState({ onionSkin: true });

    useProject.getState().addKeyframe();

    const layer = useProject.getState().project.layers[0]!;
    expect(layer.frames[0]!.strokes).toHaveLength(1);
    const blank = layer.frames[2];
    expect(blank).toBeTruthy();
    expect(blank!.strokes).toEqual([]);
    expect(blank!.id).not.toBe(layer.frames[0]!.id);
  });
});
