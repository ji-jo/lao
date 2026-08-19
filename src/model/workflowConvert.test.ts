import { describe, expect, test } from "bun:test";
import { createEmptyProject, type Stroke } from "@/model/types";
import {
  animatronToStopMotion,
  convertProjectWorkflow,
  stopMotionToAnimatron,
} from "@/model/workflowConvert";
import { clipVisibleAt, strokeAtTime } from "@/engine/strokeProgress";

function ink(id: string, x = 0): Stroke {
  return {
    id,
    brush: "ink",
    color: "#fff",
    size: 4,
    seed: 1,
    jitter: false,
    points: [
      { x, y: 0, pressure: 0.5, t: 0 },
      { x: x + 10, y: 10, pressure: 0.5, t: 80 },
    ],
  };
}

describe("animatronToStopMotion", () => {
  test("flattens every visible path onto one layer and one frame", () => {
    const project = createEmptyProject();
    project.workflow = "animatron";
    project.layers = [
      {
        id: "l1",
        name: "Path 1",
        visible: true,
        isStatic: false,
        frames: [{ id: "f1", strokes: [ink("a", 0)] }],
      },
      {
        id: "l2",
        name: "Path 2",
        visible: true,
        isStatic: false,
        frames: [{ id: "f2", strokes: [ink("b", 40)] }],
      },
      {
        id: "hidden",
        name: "Path 3",
        visible: false,
        isStatic: false,
        frames: [{ id: "f3", strokes: [ink("c", 80)] }],
      },
    ];
    const out = animatronToStopMotion(project);
    expect(out.workflow).toBe("stopmotion");
    expect(out.frameCount).toBe(1);
    expect(out.layers).toHaveLength(1);
    const cel = out.layers[0]!.frames[0]!;
    expect(cel.strokes).toHaveLength(2);
    expect(cel.strokes.map((s) => s.points[0]!.x).sort()).toEqual([0, 40]);
    expect(cel.strokes.every((s) => s.clip === undefined)).toBe(true);
  });
});

describe("stopMotionToAnimatron", () => {
  test("one frame becomes one layer with pop-off clip (stop-motion feel)", () => {
    const project = createEmptyProject();
    project.workflow = "stopmotion";
    project.fps = 10;
    project.frameCount = 3;
    const s0 = ink("f0");
    const s2 = ink("f2", 50);
    project.layers = [
      {
        id: "sheet",
        name: "Layer 1",
        visible: true,
        isStatic: false,
        frames: [
          { id: "a", strokes: [s0] },
          null,
          { id: "c", strokes: [s2] },
        ],
      },
    ];
    const out = stopMotionToAnimatron(project);
    expect(out.workflow).toBe("animatron");
    expect(out.frameCount).toBe(3);
    expect(out.layers).toHaveLength(3);
    expect(out.layers.map((l) => l.name)).toEqual(["Frame 1", "Frame 2", "Frame 3"]);

    const clip0 = out.layers[0]!.frames[0]!.strokes[0]!.clip;
    const clip1 = out.layers[1]!.frames[0]!.strokes[0]!.clip;
    const clip2 = out.layers[2]!.frames[0]!.strokes[0]!.clip;
    expect(clip0).toMatchObject({ startMs: 0, durationMs: 100, hold: false });
    expect(clip1).toMatchObject({ startMs: 100, durationMs: 100, hold: false });
    expect(clip2).toMatchObject({ startMs: 200, durationMs: 100, hold: false });

    // Frame 2 is a hold of frame 1
    expect(out.layers[1]!.frames[0]!.strokes[0]!.points[0]!.x).toBe(0);

    const still = out.layers[0]!.frames[0]!.strokes[0]!;
    expect(still.points.every((p) => p.t === 0)).toBe(true);
    expect(strokeAtTime(still, 50)?.length).toBe(2);
    expect(strokeAtTime(still, 100)).toBeNull();
    expect(clipVisibleAt(clip0, 99)).toBe(true);
    expect(clipVisibleAt(clip0, 100)).toBe(false);
  });

  test("composites every visible stop-motion layer into that frame's Animatron layer", () => {
    const project = createEmptyProject();
    project.workflow = "stopmotion";
    project.frameCount = 1;
    project.layers = [
      {
        id: "back",
        name: "Back",
        visible: true,
        isStatic: false,
        frames: [{ id: "b", strokes: [ink("back")] }],
      },
      {
        id: "front",
        name: "Front",
        visible: true,
        isStatic: false,
        frames: [{ id: "f", strokes: [ink("front", 20)] }],
      },
    ];
    const out = stopMotionToAnimatron(project);
    expect(out.layers).toHaveLength(1);
    expect(out.layers[0]!.frames[0]!.strokes).toHaveLength(2);
  });
});

describe("convertProjectWorkflow", () => {
  test("routes by destination workflow", () => {
    const a = createEmptyProject();
    a.workflow = "animatron";
    a.layers[0]!.frames[0]!.strokes.push(ink("a"));
    const sm = convertProjectWorkflow(a, "stopmotion");
    expect(sm.workflow).toBe("stopmotion");
    expect(sm.frameCount).toBe(1);
    const back = convertProjectWorkflow(sm, "animatron");
    expect(back.workflow).toBe("animatron");
    expect(back.layers).toHaveLength(1);
  });
});
