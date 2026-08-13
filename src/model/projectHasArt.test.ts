import { describe, expect, test } from "bun:test";
import { createEmptyProject, projectHasArt, type Stroke } from "@/model/types";

function stroke(): Stroke {
  return {
    id: "s1",
    brush: "ink",
    color: "#000",
    size: 4,
    points: [{ x: 0, y: 0, pressure: 0.5, t: 0 }],
    seed: 1,
    jitter: 0,
  };
}

describe("projectHasArt", () => {
  test("empty project has no art", () => {
    expect(projectHasArt(createEmptyProject())).toBe(false);
  });

  test("extra empty layers still count as no art", () => {
    const project = createEmptyProject();
    project.layers.push({
      id: "l2",
      name: "Layer 2",
      visible: true,
      isStatic: false,
      frames: [{ id: "f2", strokes: [] }],
    });
    expect(projectHasArt(project)).toBe(false);
  });

  test("a stroke is art", () => {
    const project = createEmptyProject();
    project.layers[0]!.frames[0]!.strokes.push(stroke());
    expect(projectHasArt(project)).toBe(true);
  });

  test("text or image is art", () => {
    const withText = createEmptyProject();
    withText.layers[0]!.frames[0]!.texts = [
      {
        id: "t1",
        text: "hi",
        x: 0,
        y: 0,
        size: 24,
        fontFamily: "Inter",
        color: "#fff",
      },
    ];
    expect(projectHasArt(withText)).toBe(true);

    const withImage = createEmptyProject();
    withImage.layers[0]!.frames[0]!.images = [
      {
        id: "i1",
        src: "data:image/png;base64,xx",
        x: 0,
        y: 0,
        w: 10,
        h: 10,
        naturalWidth: 10,
        naturalHeight: 10,
      },
    ];
    expect(projectHasArt(withImage)).toBe(true);
  });
});
