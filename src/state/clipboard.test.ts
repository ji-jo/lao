import { describe, expect, test } from "bun:test";
import {
  createEmptyProject,
  type Stroke,
  type TextElement,
} from "@/model/types";
import {
  collectArtByIds,
  copySelection,
  hasClipboard,
  normalizePastedPlainText,
  readClipboard,
  textElementFromPlain,
} from "@/state/clipboard";
import { useProject } from "@/state/project";
import { useSelection } from "@/state/selection";

function stroke(id: string, x: number): Stroke {
  return {
    id,
    brush: "ink",
    color: "#000",
    size: 4,
    points: [
      { x, y: 0, pressure: 1, t: 0 },
      { x: x + 10, y: 0, pressure: 1, t: 1 },
    ],
    seed: 1,
    jitter: false,
  };
}

function textEl(id: string, x = 40): TextElement {
  return {
    id,
    text: "Hello",
    x,
    y: 20,
    fontFamily: "Geist",
    size: 24,
    color: "#111",
  };
}

describe("cut / paste art", () => {
  test("copySelection snapshots strokes and paste restores at the same coords", () => {
    const project = createEmptyProject();
    project.workflow = "stopmotion";
    project.layers = [
      {
        id: "l0",
        name: "Layer 1",
        visible: true,
        isStatic: false,
        frames: [{ id: "f0", strokes: [stroke("a", 40)], texts: [], images: [] }],
      },
    ];
    useProject.getState().loadProject(project);
    expect(copySelection(useProject.getState().project, 0, ["a"])).toBe(true);
    expect(hasClipboard()).toBe(true);
    expect(readClipboard().strokes[0]!.id).toBe("a");

    const newIds = useProject.getState().pasteArt(readClipboard());
    expect(newIds).toHaveLength(1);
    const cel = useProject.getState().project.layers[0]!.frames[0]!;
    expect(cel.strokes).toHaveLength(2);
    expect(cel.strokes[1]!.id).toBe(newIds[0]);
    expect(cel.strokes[1]!.points[0]!.x).toBe(40);
  });

  test("cut removes the original and paste puts it back", () => {
    const project = createEmptyProject();
    project.workflow = "stopmotion";
    project.layers = [
      {
        id: "l0",
        name: "Layer 1",
        visible: true,
        isStatic: false,
        frames: [{ id: "f0", strokes: [stroke("a", 12)], texts: [], images: [] }],
      },
    ];
    useProject.getState().loadProject(project);
    copySelection(useProject.getState().project, 0, ["a"]);
    useProject.getState().deleteStrokes(["a"]);
    useSelection.getState().clear();

    const afterCut = useProject.getState().project.layers[0]!.frames[0]!;
    expect(afterCut.strokes).toHaveLength(0);

    const newIds = useProject.getState().pasteArt(readClipboard());
    const afterPaste = useProject.getState().project.layers[0]!.frames[0]!;
    expect(afterPaste.strokes).toHaveLength(1);
    expect(afterPaste.strokes[0]!.id).toBe(newIds[0]);
    expect(afterPaste.strokes[0]!.id).not.toBe("a");
    expect(afterPaste.strokes[0]!.points[0]!.x).toBe(12);
  });

  test("copySelection snapshots a TextElement and paste restores at the same coords", () => {
    const project = createEmptyProject();
    project.workflow = "stopmotion";
    project.layers = [
      {
        id: "l0",
        name: "Layer 1",
        visible: true,
        isStatic: false,
        frames: [{ id: "f0", strokes: [], texts: [textEl("t1", 88)], images: [] }],
      },
    ];
    useProject.getState().loadProject(project);
    expect(copySelection(useProject.getState().project, 0, ["t1"])).toBe(true);
    expect(readClipboard().texts).toHaveLength(1);
    expect(readClipboard().texts[0]!.id).toBe("t1");
    expect(readClipboard().texts[0]!.text).toBe("Hello");
    expect(readClipboard().texts[0]!.x).toBe(88);

    const newIds = useProject.getState().pasteArt(readClipboard());
    expect(newIds).toHaveLength(1);
    const cel = useProject.getState().project.layers[0]!.frames[0]!;
    expect(cel.texts).toHaveLength(2);
    expect(cel.texts![1]!.id).toBe(newIds[0]);
    expect(cel.texts![1]!.id).not.toBe("t1");
    expect(cel.texts![1]!.x).toBe(88);
    expect(cel.texts![1]!.text).toBe("Hello");
  });

  test("cut removes the TextElement and paste puts it back with a new id", () => {
    const project = createEmptyProject();
    project.workflow = "stopmotion";
    project.layers = [
      {
        id: "l0",
        name: "Layer 1",
        visible: true,
        isStatic: false,
        frames: [{ id: "f0", strokes: [], texts: [textEl("t1", 16)], images: [] }],
      },
    ];
    useProject.getState().loadProject(project);
    expect(copySelection(useProject.getState().project, 0, ["t1"])).toBe(true);
    useProject.getState().deleteStrokes(["t1"]);
    useSelection.getState().clear();

    const afterCut = useProject.getState().project.layers[0]!.frames[0]!;
    expect(afterCut.texts ?? []).toHaveLength(0);

    const newIds = useProject.getState().pasteArt(readClipboard());
    const afterPaste = useProject.getState().project.layers[0]!.frames[0]!;
    expect(afterPaste.texts).toHaveLength(1);
    expect(afterPaste.texts![0]!.id).toBe(newIds[0]);
    expect(afterPaste.texts![0]!.id).not.toBe("t1");
    expect(afterPaste.texts![0]!.x).toBe(16);
    expect(afterPaste.texts![0]!.y).toBe(20);
  });

  test("Animatron: collect/copy finds text on frames[0] while the playhead is later", () => {
    const project = createEmptyProject();
    project.workflow = "animatron";
    project.layers = [
      {
        id: "l0",
        name: "Layer 1",
        visible: true,
        isStatic: false,
        frames: [{ id: "f0", strokes: [], texts: [textEl("t1", 50)], images: [] }],
      },
    ];
    const art = collectArtByIds(project, 8, ["t1"]);
    expect(art.texts).toHaveLength(1);
    expect(art.texts[0]!.id).toBe("t1");
    expect(copySelection(project, 8, ["t1"])).toBe(true);
    expect(readClipboard().texts[0]!.text).toBe("Hello");
  });

  test("Animatron: paste lands on the painted cel, not a new sparse frame", () => {
    const project = createEmptyProject();
    project.workflow = "animatron";
    project.frameCount = 24;
    project.layers = [
      {
        id: "l0",
        name: "Layer 1",
        visible: true,
        isStatic: false,
        frames: [{ id: "f0", strokes: [], texts: [textEl("t1", 12)], images: [] }],
      },
    ];
    useProject.getState().loadProject(project);
    useProject.setState({ frameIndex: 8 });
    expect(copySelection(useProject.getState().project, 8, ["t1"])).toBe(true);
    useProject.getState().deleteStrokes(["t1"]);
    expect(useProject.getState().project.layers[0]!.frames[0]!.texts ?? []).toHaveLength(0);

    const newIds = useProject.getState().pasteArt(readClipboard());
    const layer = useProject.getState().project.layers[0]!;
    expect(layer.frames[8]).toBeFalsy();
    expect(layer.frames[0]!.texts).toHaveLength(1);
    expect(layer.frames[0]!.texts![0]!.id).toBe(newIds[0]);
    expect(layer.frames[0]!.texts![0]!.x).toBe(12);
  });
});

describe("paste plain text from outside", () => {
  test("normalizePastedPlainText converts CRLF to LF", () => {
    expect(normalizePastedPlainText("a\r\nb\rc")).toBe("a\nb\nc");
  });

  test("textElementFromPlain builds a text object at the given coords", () => {
    const el = textElementFromPlain("Hello from OS", {
      x: 100,
      y: 80,
      fontFamily: "Inter",
      size: 64,
      color: "#e7e7ea",
      boxWidth: 240,
    });
    expect(el.id.length).toBeGreaterThan(0);
    expect(el.text).toBe("Hello from OS");
    expect(el.x).toBe(100);
    expect(el.y).toBe(80);
    expect(el.size).toBe(64);
    expect(el.boxWidth).toBe(240);
  });

  test("addTextElement accepts a pasted plain-text element", () => {
    const project = createEmptyProject();
    project.workflow = "stopmotion";
    useProject.getState().loadProject(project);
    const el = textElementFromPlain("Pasted", {
      x: 10,
      y: 20,
      fontFamily: "Inter",
      size: 32,
      color: "#fff",
    });
    useProject.getState().addTextElement(el);
    const texts = useProject.getState().project.layers[0]!.frames[0]!.texts ?? [];
    expect(texts.some((t) => t.id === el.id && t.text === "Pasted")).toBe(true);
  });
});
