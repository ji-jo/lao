import { describe, expect, test } from "bun:test";
import { Resvg } from "@resvg/resvg-js";
import { PNG } from "pngjs";
import { createEmptyProject, type Stroke, type StrokePoint } from "@/model/types";
import { paintProjectFrame } from "@/engine/paintFrame";
import { emitStaticFrameSvg } from "@/export/code/emitSvg";
import { strokeToPathD } from "@/export/code/svgGeometry";
import { flattenBezierNodes, pointsToBezierNodes } from "@/lib/bezier";
import {
  analyzeProjectExport,
  strokeExportMode,
  strokeNeedsVectorApprox,
} from "@/export/code/capabilities";

function inkStroke(
  partial: Partial<Stroke> & { points: StrokePoint[] },
): Stroke {
  return {
    id: partial.id ?? "s1",
    brush: "ink",
    color: "#000000",
    size: 8,
    seed: 1,
    jitter: false,
    ...partial,
  };
}

function makeProject(strokes: Stroke[], workflow: "stop-motion" | "animatron" = "stop-motion") {
  const project = createEmptyProject();
  project.width = 240;
  project.height = 240;
  project.frameCount = 4;
  project.fps = 12;
  project.workflow = workflow;
  project.background = { kind: "none" };
  project.layers = [
    {
      id: "layer-1",
      name: "Layer 1",
      visible: true,
      isStatic: false,
      frames: [
        { id: "f0", strokes, texts: [], images: [] },
        null,
        null,
        null,
      ],
    },
  ];
  return project;
}

function freehandPoints(): StrokePoint[] {
  return Array.from({ length: 12 }, (_, i) => ({
    x: 30 + i * 14,
    y: 80 + Math.sin(i / 2) * 24,
    pressure: 0.7,
    t: i * 10,
  }));
}

function rasterizeSvg(svg: string, width: number, height: number): Uint8Array {
  const resvg = new Resvg(svg, {
    fitTo: { mode: "width", value: width },
    background: "transparent",
  });
  const png = resvg.render().asPng();
  const parsed = PNG.sync.read(png);
  expect(parsed.width).toBe(width);
  expect(parsed.height).toBe(height);
  return parsed.data;
}

function rasterizeCanvas(
  width: number,
  height: number,
  paint: (ctx: CanvasRenderingContext2D) => void,
): Uint8Array {
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d")!;
  paint(ctx);
  return new Uint8Array(ctx.getImageData(0, 0, width, height).data);
}

function pixelMismatchFraction(a: Uint8Array, b: Uint8Array, threshold = 18): number {
  let mismatched = 0;
  const pixels = a.length / 4;
  for (let i = 0; i < pixels; i++) {
    const j = i * 4;
    const dr = Math.abs(a[j]! - b[j]!);
    const dg = Math.abs(a[j + 1]! - b[j + 1]!);
    const db = Math.abs(a[j + 2]! - b[j + 2]!);
    const da = Math.abs(a[j + 3]! - b[j + 3]!);
    if (dr + dg + db + da > threshold) mismatched++;
  }
  return mismatched / pixels;
}

const hasDom = typeof document !== "undefined";

describe("svgGeometry", () => {
  test("freehand stroke produces closed path d", () => {
    const s = inkStroke({ points: freehandPoints() });
    const d = strokeToPathD(s, s.points);
    expect(d.length).toBeGreaterThan(10);
    expect(d.startsWith("M")).toBe(true);
    expect(d.includes("Z")).toBe(true);
  });

  test("bezier pen path uses cubic segments", () => {
    const s = inkStroke({
      brush: "pen",
      points: [
        { x: 40, y: 40, pressure: 1, t: 0 },
        { x: 180, y: 180, pressure: 1, t: 1 },
      ],
      bezierNodes: [
        { x: 40, y: 40 },
        { x: 180, y: 180 },
      ],
    });
    const d = strokeToPathD(s, s.points);
    expect(d).toMatch(/[Cc]/);
  });

  test("path-edited ink brush exports a filled ribbon, not a cubic centerline", () => {
    const source: StrokePoint[] = Array.from({ length: 20 }, (_, i) => ({
      x: 40 + i * 8,
      y: 120,
      pressure: i < 10 ? 0.2 + i * 0.07 : 0.9 - (i - 10) * 0.06,
      t: i * 10,
    }));
    const { nodes } = pointsToBezierNodes(source, { strokeSize: 16 });
    const flat = flattenBezierNodes(nodes, false, 200, source);
    const s = inkStroke({
      p5Brush: "smooth",
      size: 16,
      points: flat,
      bezierNodes: nodes,
    });
    const d = strokeToPathD(s, s.points);
    expect(d.length).toBeGreaterThan(20);
    expect(d.includes("Z")).toBe(true);
    expect(d).not.toMatch(/[Cc]/);

    const nums = [...d.matchAll(/-?\d+\.?\d*/g)].map((m) => Number(m[0]));
    const ys = nums.filter((_, i) => i % 2 === 1);
    const minY = Math.min(...ys);
    const maxY = Math.max(...ys);
    // Pressure peaks mid-stroke (~0.9) vs ends (~0.2) → ribbon is taller in Y.
    expect(maxY - minY).toBeGreaterThan(8);
  });

  test("closed fill stroke includes fill polygon", () => {
    const pts: StrokePoint[] = [
      { x: 60, y: 60, pressure: 1, t: 0 },
      { x: 160, y: 60, pressure: 1, t: 1 },
      { x: 160, y: 140, pressure: 1, t: 2 },
      { x: 60, y: 140, pressure: 1, t: 3 },
    ];
    const s = inkStroke({
      closed: true,
      fillColor: "#ff0000",
      points: pts,
    });
    const d = strokeToPathD(s, pts);
    expect(d).toContain("Z");
  });
});

describe("capabilities", () => {
  test("default ink stroke is vector", () => {
    const s = inkStroke({ points: freehandPoints() });
    expect(strokeExportMode(s)).toBe("vector");
    expect(strokeNeedsVectorApprox(s)).toBe(false);
  });

  test("stipple preset is vector-approximated (never raster)", () => {
    const s = inkStroke({
      p5Brush: "stipple",
      points: freehandPoints(),
    });
    expect(strokeExportMode(s)).toBe("vector");
    expect(strokeNeedsVectorApprox(s)).toBe(true);
  });

  test("p5Brush ink (wash tip) exports as vector path", () => {
    const s = inkStroke({
      p5Brush: "ink",
      points: freehandPoints(),
    });
    expect(strokeExportMode(s)).toBe("vector");
    expect(strokeNeedsVectorApprox(s)).toBe(false);
  });

  test("analyzeProjectExport never requests raster fallback", () => {
    const project = makeProject([
      inkStroke({ id: "stip", p5Brush: "stipple", points: freehandPoints() }),
    ]);
    project.layers[0]!.frames[0]!.images = [
      {
        id: "img1",
        src: "data:image/png;base64,AAAA",
        x: 0,
        y: 0,
        w: 10,
        h: 10,
        naturalWidth: 10,
        naturalHeight: 10,
      },
    ];
    const caps = analyzeProjectExport(project);
    expect(caps.needsRasterFallback).toBe(false);
    expect(caps.needsPlaywright).toBe(false);
    expect(caps.strokeModes.get("stip")).toBe("vector");
    expect(caps.warnings.some((w) => w.message.includes("embedded as raster"))).toBe(
      false,
    );
    expect(caps.warnings.some((w) => w.kind === "image" && w.message.includes("omitted"))).toBe(
      true,
    );
    expect(
      caps.warnings.some((w) => w.kind === "stroke" && w.message.includes("freehand path")),
    ).toBe(true);
  });
});

describe("animated animatron export", () => {
  test("emits strokes whose clip starts after frame 0", async () => {
    const { emitProjectSvg } = await import("@/export/code/emitSvg");
    const strokes = [
      inkStroke({
        id: "late",
        points: freehandPoints(),
        clip: { startMs: 500, durationMs: 800 },
      }),
    ];
    const project = makeProject(strokes, "animatron");
    const svg = emitProjectSvg(project, { animated: true, transparent: true });
    expect(svg).toContain("path");
    expect(svg).toContain("d=");
    expect(svg).not.toMatch(/data-layer="[^"]*"\/>/);
  });

  test("stipple / particle brushes emit paths, never <image>", async () => {
    const { emitProjectSvg } = await import("@/export/code/emitSvg");
    const strokes = [
      inkStroke({
        id: "stip",
        p5Brush: "stipple",
        points: freehandPoints(),
      }),
    ];
    const project = makeProject(strokes, "animatron");
    const svg = emitProjectSvg(project, { animated: true, transparent: true });
    expect(svg).toMatch(/<path/);
    expect(svg).not.toMatch(/<image\b/);
    expect(svg).not.toMatch(/data:image\/png/);
  });

  test("image elements are omitted from code export", async () => {
    const { emitProjectSvg } = await import("@/export/code/emitSvg");
    const project = makeProject([inkStroke({ points: freehandPoints() })]);
    project.layers[0]!.frames[0]!.images = [
      {
        id: "img1",
        src: "data:image/png;base64,iVBORw0KGgo=",
        x: 10,
        y: 10,
        w: 40,
        h: 40,
        naturalWidth: 40,
        naturalHeight: 40,
      },
    ];
    const svg = emitStaticFrameSvg(project, 0, { transparent: true });
    expect(svg).not.toMatch(/<image\b/);
    expect(svg).toMatch(/<path/);
  });

  test("transparent SVG omits the fallback background rect", async () => {
    const { emitProjectSvg } = await import("@/export/code/emitSvg");
    const project = makeProject([inkStroke({ points: freehandPoints() })]);
    const svg = emitProjectSvg(project, { animated: true, transparent: true });
    expect(svg).not.toContain("#141416");
    expect(svg).toMatch(/<path/);
  });

  test("opaque SVG paints a background fill", async () => {
    const { emitProjectSvg } = await import("@/export/code/emitSvg");
    const project = makeProject([inkStroke({ points: freehandPoints() })]);
    const svg = emitProjectSvg(project, { animated: false, transparent: false, frame: 0 });
    expect(svg).toContain("#141416");
  });

  test("dense freehand SVG stays under a size budget", async () => {
    const { emitProjectSvg } = await import("@/export/code/emitSvg");
    const pts: StrokePoint[] = Array.from({ length: 80 }, (_, i) => ({
      x: 20 + i * 2.2,
      y: 80 + Math.sin(i / 3) * 40,
      pressure: 0.6,
      t: i * 8,
    }));
    const project = makeProject(
      [
        inkStroke({ id: "long", jitter: true, points: pts }),
        inkStroke({
          id: "late",
          points: pts,
          clip: { startMs: 200, durationMs: 600 },
        }),
      ],
      "animatron",
    );
    project.frameCount = 24;
    const svg = emitProjectSvg(project, { animated: true, transparent: true });
    expect(svg.length).toBeLessThan(80_000);
  });
});

describe("react export", () => {
  test("React emit is a self-contained inline SVG component", async () => {
    const { emitProjectReact } = await import("@/export/code/emitReact");
    const project = makeProject(
      [
        inkStroke({
          points: freehandPoints(),
          clip: {
            startMs: 0,
            durationMs: 400,
            easing: { bezier: [0.44, 0, 0.56, 1], fadeInFrames: 0, fadeOutFrames: 0 },
          },
        }),
      ],
      "animatron",
    );
    project.name = "hello clip";
    const tsx = emitProjectReact(project, { animated: true, transparent: true });
    expect(tsx).not.toContain("fetch(");
    expect(tsx).not.toContain(".json");
    expect(tsx).not.toContain("fonts.googleapis.com");
    expect(tsx).toContain("className");
    expect(tsx).toContain("viewBox");
    expect(tsx).toContain("<path");
    expect(tsx).toContain("<animate");
    expect(tsx).toContain("strokeLinecap");
    expect(tsx).toContain("strokeDashoffset");
    expect(tsx).toContain("paused?: boolean");
    expect(tsx).toContain("playbackRate?: number");
    expect(tsx).toContain("export default LaoHelloclip");
  });

  test("React emit accepts className and uses a responsive viewBox", async () => {
    const { emitProjectReact } = await import("@/export/code/emitReact");
    const project = makeProject([inkStroke({ points: freehandPoints() })]);
    const tsx = emitProjectReact(project, { animated: false, transparent: true, frame: 0 });
    expect(tsx).toContain("className?: string");
    expect(tsx).toContain('viewBox={"0 0 240 240"}');
    expect(tsx).toContain('width: "100%"');
    expect(tsx).toContain("preserveAspectRatio");
    expect(tsx).not.toMatch(/\bsrc\s*[:=]/);
  });

  test("scene JSON round-trips path count", async () => {
    const { buildLaoScene, parseLaoScene, emitProjectSceneJson } = await import(
      "@/export/code/sceneJson"
    );
    const project = makeProject(
      [
        inkStroke({ id: "a", points: freehandPoints() }),
        inkStroke({
          id: "b",
          points: freehandPoints(),
          clip: { startMs: 400, durationMs: 500 },
        }),
      ],
      "animatron",
    );
    const json = emitProjectSceneJson(project, { animated: true, transparent: true });
    const scene = parseLaoScene(JSON.parse(json));
    expect(scene.format).toBe("lao-scene");
    expect(scene.version).toBe(1);
    expect(scene.background).toBeNull();
    expect(scene.loop).toBe("once");
    expect(scene.viewBox).toBe("0 0 240 240");
    expect(scene.frameCount).toBe(4);
    expect(scene.usage).toMatch(/not browser-renderable/i);
    expect(scene.idPrefix.startsWith("lao-")).toBe(true);
    const pathCount = scene.groups.reduce((n, g) => n + g.paths.length, 0);
    expect(pathCount).toBe(2);
    const rebuilt = buildLaoScene(project, { animated: true, transparent: true });
    expect(rebuilt.groups.length).toBe(scene.groups.length);
    expect(rebuilt.durationMs).toBe(scene.durationMs);
    expect(rebuilt.idPrefix).toBe(scene.idPrefix);
  });

  test("SVG, React, and JSON share duration, loop, and prefixed ids", async () => {
    const { emitProjectSvg } = await import("@/export/code/emitSvg");
    const { emitProjectReact } = await import("@/export/code/emitReact");
    const { buildLaoScene, emitProjectSceneJson, parseLaoScene } = await import(
      "@/export/code/sceneJson"
    );
    const project = makeProject(
      [inkStroke({ points: freehandPoints(), clip: { startMs: 0, durationMs: 400 } })],
      "animatron",
    );
    const opts = { animated: true, transparent: true, loop: "infinite" as const };
    const scene = buildLaoScene(project, opts);
    const svg = emitProjectSvg(project, opts);
    const tsx = emitProjectReact(project, opts);
    const json = parseLaoScene(JSON.parse(emitProjectSceneJson(project, opts)));
    expect(svg).toContain("<?xml");
    expect(svg).toContain("preserveAspectRatio=\"xMidYMid meet\"");
    expect(svg).toContain(`data-lao-loop="infinite"`);
    expect(svg).toContain(scene.idPrefix);
    expect(svg).toContain("repeatCount=\"indefinite\"");
    expect(tsx).toContain("loop = \"infinite\"");
    expect(tsx).toContain(scene.idPrefix);
    expect(json.durationMs).toBe(scene.durationMs);
    expect(json.loop).toBe("infinite");
    expect(json.idPrefix).toBe(scene.idPrefix);
    expect(json.formats.json.browserRenderable).toBe(false);
    expect(json.formats.svg.standalone).toBe(true);
  });

  test("external React emit ships a sibling SVG loader", async () => {
    const { emitProjectReactFiles } = await import("@/export/code/emitReact");
    const project = makeProject([inkStroke({ points: freehandPoints() })]);
    project.name = "hello clip";
    const files = emitProjectReactFiles(project, {
      animated: true,
      transparent: true,
      reactMode: "external-svg",
    });
    expect(files.svgFileName).toBe("LaoHelloclip.svg");
    expect(files.svg).toContain("<?xml");
    expect(files.svg).toContain("<path");
    expect(files.tsx).toContain('type="image/svg+xml"');
    expect(files.tsx).toContain("./LaoHelloclip.svg");
    expect(files.tsx).toContain("export default LaoHelloclip");
    expect(files.tsx).not.toContain("<path");
    expect(files.tsx).not.toContain("framer");
  });
});

if (hasDom) {
  describe("svg export parity", () => {
    test("static frame SVG matches paintProjectFrame for freehand ink", () => {
      const strokes = [inkStroke({ id: "ink", points: freehandPoints() })];
      const project = makeProject(strokes);
      const frame = 0;
      const svg = emitStaticFrameSvg(project, frame, { transparent: true });
      const fromSvg = rasterizeSvg(svg, project.width, project.height);
      const fromCanvas = rasterizeCanvas(project.width, project.height, (ctx) => {
        paintProjectFrame(ctx, project, frame);
      });
      const mismatch = pixelMismatchFraction(fromSvg, fromCanvas, 24);
      expect(mismatch).toBeLessThan(0.04);
    });

    test("path-edited ink SVG matches canvas pressure ribbon, not a cubic tube", () => {
      const source: StrokePoint[] = Array.from({ length: 24 }, (_, i) => ({
        x: 28 + i * 8,
        y: 120,
        pressure: i < 12 ? 0.18 + i * 0.06 : 0.9 - (i - 12) * 0.055,
        t: i * 8,
      }));
      const { nodes } = pointsToBezierNodes(source, { strokeSize: 18 });
      const flat = flattenBezierNodes(nodes, false, 200, source);
      const strokes = [
        inkStroke({
          id: "ink",
          p5Brush: "smooth",
          size: 18,
          points: flat,
          bezierNodes: nodes,
        }),
      ];
      const project = makeProject(strokes);
      const svg = emitStaticFrameSvg(project, 0, { transparent: true });
      expect(svg).not.toMatch(/[Cc][\d. ,-]+[Cc]/);
      const fromSvg = rasterizeSvg(svg, project.width, project.height);
      const fromCanvas = rasterizeCanvas(project.width, project.height, (ctx) => {
        paintProjectFrame(ctx, project, 0);
      });
      const mismatch = pixelMismatchFraction(fromSvg, fromCanvas, 24);
      expect(mismatch).toBeLessThan(0.05);
    });

    test("static frame SVG matches paint for closed fill rect", () => {
      const pts: StrokePoint[] = [
        { x: 50, y: 50, pressure: 1, t: 0 },
        { x: 170, y: 50, pressure: 1, t: 1 },
        { x: 170, y: 150, pressure: 1, t: 2 },
        { x: 50, y: 150, pressure: 1, t: 3 },
      ];
      const strokes = [
        inkStroke({
          id: "rect",
          closed: true,
          fillColor: "#e11d48",
          points: pts,
        }),
      ];
      const project = makeProject(strokes);
      const svg = emitStaticFrameSvg(project, 0, { transparent: true });
      const fromSvg = rasterizeSvg(svg, project.width, project.height);
      const fromCanvas = rasterizeCanvas(project.width, project.height, (ctx) => {
        paintProjectFrame(ctx, project, 0);
      });
      const mismatch = pixelMismatchFraction(fromSvg, fromCanvas, 28);
      expect(mismatch).toBeLessThan(0.06);
    });
  });
}
