import { beforeEach, describe, expect, test } from "bun:test";
import { createEmptyProject, type Stroke } from "@/model/types";
import { useProject } from "@/state/project";
import { usePlayback } from "@/state/playback";
import { useWorkflowMemory } from "@/state/workflowMemory";

function ink(id: string): Stroke {
  return {
    id,
    brush: "ink",
    color: "#fff",
    size: 4,
    seed: 1,
    jitter: false,
    points: [
      { x: 0, y: 0, pressure: 0.5, t: 0 },
      { x: 8, y: 8, pressure: 0.5, t: 40 },
    ],
  };
}

describe("switchWorkflow", () => {
  beforeEach(() => {
    useWorkflowMemory.getState().clear();
  });

  test("one Animatron layer round-trips without splitting into Frame layers", () => {
    const project = createEmptyProject();
    project.workflow = "animatron";
    project.layers[0]!.name = "Path 1";
    project.layers[0]!.frames[0]!.strokes.push(ink("keep-me"));
    useProject.getState().loadProject(project);
    usePlayback.getState().setWorkflow("animatron");

    useProject.getState().switchWorkflow("stopmotion");
    expect(useProject.getState().project.layers).toHaveLength(1);

    useProject.getState().switchWorkflow("animatron");
    const back = useProject.getState().project;
    expect(back.layers).toHaveLength(1);
    expect(back.layers[0]!.frames[0]!.strokes[0]!.id).toBe("keep-me");
  });

  test("one Stop-motion layer becomes one Animatron layer (frames are clips)", () => {
    const sm = createEmptyProject();
    sm.workflow = "stopmotion";
    sm.frameCount = 3;
    sm.layers = [
      {
        id: "sheet",
        name: "Layer 1",
        visible: true,
        isStatic: false,
        frames: [
          { id: "a", strokes: [ink("a")], texts: [], images: [] },
          { id: "b", strokes: [ink("b")], texts: [], images: [] },
          { id: "c", strokes: [ink("c")], texts: [], images: [] },
        ],
      },
    ];
    useProject.getState().loadProject(sm);
    usePlayback.getState().setWorkflow("stopmotion");

    useProject.getState().switchWorkflow("animatron");
    const layers = useProject.getState().project.layers;
    expect(layers).toHaveLength(1);
    expect(layers[0]!.name).toBe("Layer 1");
    expect(layers[0]!.frames[0]!.strokes).toHaveLength(3);
  });

  test("Stop-motion animation converts even when Animatron memory has a doodle", () => {
    const sm = createEmptyProject();
    sm.workflow = "stopmotion";
    sm.frameCount = 3;
    sm.layers = [
      {
        id: "sheet",
        name: "Layer 1",
        visible: true,
        isStatic: false,
        frames: [
          { id: "a", strokes: [ink("a")], texts: [], images: [] },
          { id: "b", strokes: [ink("b")], texts: [], images: [] },
          { id: "c", strokes: [ink("c")], texts: [], images: [] },
        ],
      },
    ];
    useProject.getState().loadProject(sm);
    usePlayback.getState().setWorkflow("stopmotion");

    const doodle = createEmptyProject();
    doodle.workflow = "animatron";
    doodle.layers[0]!.frames[0]!.strokes.push(ink("doodle"));
    useWorkflowMemory.getState().remember("animatron", {
      project: doodle,
      layerIndex: 0,
      frameIndex: 0,
      undoStack: [],
      redoStack: [],
    });

    useProject.getState().switchWorkflow("animatron");
    const packed = useProject.getState().project.layers[0]!.frames[0]!.strokes;
    expect(useProject.getState().project.workflow).toBe("animatron");
    expect(packed).toHaveLength(3);
    expect(packed.every((s) => s.id !== "doodle")).toBe(true);
    expect(packed[0]!.clip?.hold).toBe(false);
    expect(packed[2]!.clip?.hold).toBe(true);
  });
});
