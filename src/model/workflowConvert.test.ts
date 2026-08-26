import { describe, expect, test } from "bun:test";
import { createEmptyProject, type Stroke } from "@/model/types";
import {
  animatronToStopMotion,
  convertProjectWorkflow,
  projectHasTimelineMotion,
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
  test("bakes onto one layer with a cel per timeline frame (not path-layers)", () => {
    const project = createEmptyProject();
    project.workflow = "animatron";
    project.fps = 10;
    project.frameCount = 4;
    project.layers = [
      {
        id: "l1",
        name: "Path 1",
        visible: true,
        isStatic: false,
        frames: [
          {
            id: "f1",
            strokes: [
              {
                ...ink("a", 0),
                clip: { startMs: 0, durationMs: 100 },
              },
            ],
          },
        ],
      },
      {
        id: "l2",
        name: "Path 2",
        visible: true,
        isStatic: false,
        frames: [
          {
            id: "f2",
            strokes: [
              {
                ...ink("b", 40),
                clip: { startMs: 200, durationMs: 100 },
              },
            ],
          },
        ],
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
    expect(out.layers).toHaveLength(1);
    expect(out.frameCount).toBe(4);
    const frames = out.layers[0]!.frames;
    expect(frames).toHaveLength(4);
    // t=0: first path has started (at least a point); second path still hidden
    expect(frames[0]!.strokes.length).toBeGreaterThan(0);
    expect(frames[0]!.strokes.every((s) => s.points[0]!.x === 0)).toBe(true);
    // t=200ms (frame 2): both paths held/full
    expect(frames[2]!.strokes).toHaveLength(2);
    expect(frames[2]!.strokes.every((s) => s.clip === undefined)).toBe(true);
  });

  test("empty Animatron keeps the timeline length in Stop-motion", () => {
    const project = createEmptyProject();
    project.workflow = "animatron";
    project.frameCount = 24;
    const out = animatronToStopMotion(project);
    expect(out.frameCount).toBe(24);
    expect(out.layers[0]!.frames).toHaveLength(24);
    expect(out.layers[0]!.frames.every((f) => f === null)).toBe(true);
  });
});

describe("stopMotionToAnimatron", () => {
  test("keeps one Animatron layer per Stop-motion layer (clips, not extra layers)", () => {
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
    expect(out.layers).toHaveLength(1);
    expect(out.layers[0]!.name).toBe("Layer 1");
    const packed = out.layers[0]!.frames[0]!.strokes;
    expect(packed).toHaveLength(2);
    expect(packed[0]!.clip).toMatchObject({ startMs: 0, durationMs: 200, hold: false });
    expect(packed[1]!.clip).toMatchObject({ startMs: 200, hold: true });
    expect(strokeAtTime(packed[0]!, 50)?.length).toBe(2);
    expect(strokeAtTime(packed[0]!, 200)).toBeNull();
    expect(clipVisibleAt(packed[0]!.clip, 199)).toBe(true);
    expect(strokeAtTime(packed[1]!, 250)?.length).toBe(2);
  });

  test("two Stop-motion layers stay two Animatron layers", () => {
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
    expect(out.layers).toHaveLength(2);
    expect(out.layers.map((l) => l.name)).toEqual(["Back", "Front"]);
    expect(out.layers[0]!.frames[0]!.strokes).toHaveLength(1);
    expect(out.layers[1]!.frames[0]!.strokes).toHaveLength(1);
  });
});

describe("projectHasTimelineMotion", () => {
  test("a still drawing is not motion", () => {
    const project = createEmptyProject();
    project.workflow = "stopmotion";
    project.frameCount = 3;
    project.layers = [
      {
        id: "sheet",
        name: "Layer 1",
        visible: true,
        isStatic: false,
        frames: [{ id: "a", strokes: [ink("a")] }, null, null],
      },
    ];
    expect(projectHasTimelineMotion(project)).toBe(false);
  });

  test("changing stop-motion cels are motion", () => {
    const project = createEmptyProject();
    project.workflow = "stopmotion";
    project.frameCount = 3;
    project.layers = [
      {
        id: "sheet",
        name: "Layer 1",
        visible: true,
        isStatic: false,
        frames: [
          { id: "a", strokes: [ink("a")] },
          { id: "b", strokes: [ink("b", 40)] },
          { id: "c", strokes: [ink("c", 80)] },
        ],
      },
    ];
    expect(projectHasTimelineMotion(project)).toBe(true);
  });
});

describe("convertProjectWorkflow", () => {
  test("routes by destination workflow", () => {
    const a = createEmptyProject();
    a.workflow = "animatron";
    a.layers[0]!.frames[0]!.strokes.push(ink("a"));
    const sm = convertProjectWorkflow(a, "stopmotion");
    expect(sm.workflow).toBe("stopmotion");
    expect(sm.layers).toHaveLength(1);
    expect(sm.frameCount).toBeGreaterThanOrEqual(1);
    const back = convertProjectWorkflow(sm, "animatron");
    expect(back.workflow).toBe("animatron");
    expect(back.layers).toHaveLength(1);
    expect(
      back.layers.some((l) => (l.frames.find((f) => f)?.strokes.length ?? 0) > 0),
    ).toBe(true);
  });
});
