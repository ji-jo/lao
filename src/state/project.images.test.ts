import { beforeEach, describe, expect, test } from "bun:test";
import { createEmptyProject, type ImageElement, type Stroke } from "@/model/types";
import { useProject } from "@/state/project";
import { usePlayback } from "@/state/playback";

function tinyStroke(): Stroke {
  return {
    id: crypto.randomUUID(),
    brush: "ink",
    color: "#fff",
    size: 4,
    seed: 1,
    jitter: true,
    points: [
      { x: 0, y: 0, pressure: 0.5, t: 0 },
      { x: 10, y: 10, pressure: 0.5, t: 16 },
    ],
  };
}

function tinyImage(): ImageElement {
  return {
    id: crypto.randomUUID(),
    src: "data:image/png;base64,aa",
    x: 10,
    y: 10,
    w: 100,
    h: 80,
    naturalWidth: 100,
    naturalHeight: 80,
  };
}

describe("addStroke preserves canvas images (Animatron)", () => {
  beforeEach(() => {
    const empty = createEmptyProject();
    empty.workflow = "animatron";
    useProject.getState().loadProject(empty);
    usePlayback.getState().setWorkflow("animatron");
  });

  test("drawing on an image layer does not wipe the image", () => {
    const image = tinyImage();
    useProject.getState().addImageElement(image);

    const before = useProject.getState();
    const beforeCel =
      before.project.layers[before.layerIndex]?.frames.find((f) => f) ?? null;
    expect(beforeCel?.images?.some((im) => im.id === image.id)).toBe(true);

    useProject.getState().addStroke(tinyStroke());

    const after = useProject.getState();
    const imageLayer = after.project.layers.find((l) =>
      l.frames.some((f) => f?.images?.some((im) => im.id === image.id)),
    );
    expect(imageLayer).toBeTruthy();

    const strokeLayer = after.project.layers.find((l) =>
      l.frames.some((f) => f?.strokes.some((s) => s.points.length > 0)),
    );
    expect(strokeLayer).toBeTruthy();
    expect(strokeLayer!.id).not.toBe(imageLayer!.id);
  });
});
