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

describe("switchWorkflow memory", () => {
  beforeEach(() => {
    useWorkflowMemory.getState().clear();
    const project = createEmptyProject();
    project.workflow = "animatron";
    project.layers[0]!.name = "Path 1";
    project.layers[0]!.frames[0]!.strokes.push(ink("keep-me"));
    useProject.getState().loadProject(project);
    usePlayback.getState().setWorkflow("animatron");
  });

  test("first visit converts; return restores the original Animatron art", () => {
    const originalId = useProject.getState().project.layers[0]!.frames[0]!.strokes[0]!.id;
    expect(originalId).toBe("keep-me");

    useProject.getState().switchWorkflow("stopmotion");
    expect(usePlayback.getState().workflow).toBe("stopmotion");
    expect(useProject.getState().project.workflow).toBe("stopmotion");
    expect(useProject.getState().project.frameCount).toBe(1);
    expect(useProject.getState().project.layers).toHaveLength(1);

    useProject.getState().switchWorkflow("animatron");
    expect(usePlayback.getState().workflow).toBe("animatron");
    const back = useProject.getState().project;
    expect(back.workflow).toBe("animatron");
    expect(back.layers[0]!.frames[0]!.strokes[0]!.id).toBe("keep-me");
  });

  test("edits in Stop-motion survive a round trip back", () => {
    useProject.getState().switchWorkflow("stopmotion");
    useProject.getState().addStroke(ink("sm-only"));
    const smCount = useProject
      .getState()
      .project.layers[0]!.frames[0]!.strokes.length;

    useProject.getState().switchWorkflow("animatron");
    expect(
      useProject.getState().project.layers[0]!.frames[0]!.strokes[0]!.id,
    ).toBe("keep-me");

    useProject.getState().switchWorkflow("stopmotion");
    expect(useProject.getState().project.layers[0]!.frames[0]!.strokes.length).toBe(
      smCount,
    );
    expect(
      useProject
        .getState()
        .project.layers[0]!.frames[0]!.strokes.some((s) => s.id === "sm-only"),
    ).toBe(true);
  });
});
