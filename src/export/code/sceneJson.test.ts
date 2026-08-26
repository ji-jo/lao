import { describe, expect, test } from "bun:test";
import { createEmptyProject, type Stroke, type StrokePoint } from "@/model/types";
import { makeDotsBackground } from "@/lib/dots-background";
import {
  buildLaoScene,
  emitProjectSceneJson,
  parseLaoScene,
} from "@/export/code/sceneJson";
import { compactPolylinePathD, simplifyPolyline } from "@/export/code/svgGeometry";

function pts(n: number): StrokePoint[] {
  return Array.from({ length: n }, (_, i) => ({
    x: 10 + i * 4,
    y: 40 + Math.sin(i / 4) * 20,
    pressure: 0.7,
    t: i * 10,
  }));
}

function stroke(partial: Partial<Stroke> & { points: StrokePoint[] }): Stroke {
  return {
    id: partial.id ?? "s",
    brush: "ink",
    color: "#111111",
    size: 6,
    seed: 1,
    jitter: false,
    ...partial,
  };
}

test("RDP drops colinear samples", () => {
  const line: Array<[number, number]> = [
    [0, 0],
    [1, 0],
    [2, 0],
    [3, 0],
    [4, 0],
  ];
  const simple = simplifyPolyline(line, 0.2);
  expect(simple.length).toBe(2);
});

test("compact polyline uses relative lineto", () => {
  const d = compactPolylinePathD(
    [
      [10, 10],
      [12, 11],
      [14, 10],
    ],
    false,
  );
  expect(d.startsWith("M")).toBe(true);
  expect(d).toContain("l");
  expect(d).not.toMatch(/\sL\s/);
});

test("parseLaoScene rejects the wrong format", () => {
  expect(() => parseLaoScene({ format: "lao", version: 1 })).toThrow(/Not a lao-scene/);
});

test("buildLaoScene emits compressed paths without raw points", () => {
  const project = createEmptyProject();
  project.width = 320;
  project.height = 180;
  project.frameCount = 12;
  project.fps = 12;
  project.workflow = "animatron";
  project.background = { kind: "none" };
  project.layers = [
    {
      id: "layer-1",
      name: "Layer 1",
      visible: true,
      isStatic: false,
      frames: [
        {
          id: "f0",
          strokes: [stroke({ id: "ink", points: pts(40), jitter: true })],
          texts: [],
          images: [],
        },
      ],
    },
  ];
  const scene = buildLaoScene(project, { animated: true, transparent: true });
  const json = emitProjectSceneJson(project, { animated: true, transparent: true });
  expect(json).not.toContain('"pressure"');
  expect(scene.loop).toBe("once");
  expect(scene.viewBox).toBe("0 0 320 180");
  expect(scene.frameCount).toBe(12);
  expect(scene.groups[0]!.paths[0]!.d.length).toBeGreaterThan(8);
  expect(scene.groups[0]!.paths[0]!.boil?.values.length).toBeGreaterThan(1);
  expect(json.length).toBeLessThan(scene.groups[0]!.paths[0]!.d.length * 80);
});

test("buildLaoScene keeps dots backgrounds as a vector pattern", () => {
  const project = createEmptyProject();
  project.background = makeDotsBackground({
    color: "#fafafa",
    dotColor: "#222222",
    size: 3,
    gapX: 16,
    gapY: 20,
    gapLinked: false,
    pattern: "hex",
  });
  const scene = buildLaoScene(project, { transparent: false });
  expect(scene.background).toMatchObject({
    kind: "dots",
    color: "#fafafa",
    dotColor: "#222222",
    size: 3,
    gapX: 16,
    gapY: 20,
    pattern: "hex",
  });
});
