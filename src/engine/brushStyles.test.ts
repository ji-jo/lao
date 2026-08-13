import { describe, expect, test } from "bun:test";
import { paintPackBrush } from "@/engine/brushStyles";
import type { P5BrushId } from "@/engine/p5BrushPresets";
import { P5_BRUSH_IDS } from "@/engine/p5BrushPresets";
import type { Stroke, StrokePoint } from "@/model/types";

function hasCanvas2d() {
  if (typeof document === "undefined") return false;
  const ctx = document.createElement("canvas").getContext("2d");
  return !!ctx && typeof ctx.fillRect === "function";
}

function makePoints(): StrokePoint[] {
  return Array.from({ length: 24 }, (_, i) => ({
    x: 40 + i * 8,
    y: 60 + Math.sin(i / 3) * 18,
    pressure: 0.75,
    t: i * 16,
  }));
}

function litStats(preset: P5BrushId | undefined) {
  const canvas = document.createElement("canvas");
  canvas.width = 280;
  canvas.height = 140;
  const ctx = canvas.getContext("2d")!;
  ctx.fillStyle = "#111";
  ctx.fillRect(0, 0, 280, 140);
  const stroke: Stroke = {
    id: "t",
    brush: "ink",
    p5Brush: preset,
    color: "#e7e7ea",
    size: 10,
    points: makePoints(),
    seed: 42,
    jitter: false,
  };
  paintPackBrush(ctx, stroke, stroke.points, stroke.color, "full");
  const img = ctx.getImageData(0, 0, 280, 140);
  let lit = 0;
  let sumR = 0;
  for (let i = 0; i < img.data.length; i += 4) {
    const d =
      Math.abs(img.data[i] - 17) +
      Math.abs(img.data[i + 1] - 17) +
      Math.abs(img.data[i + 2] - 17);
    if (d > 40) {
      lit++;
      sumR += img.data[i];
    }
  }
  return { lit, avgR: lit ? sumR / lit : 0 };
}

function litWithPressure(preset: P5BrushId, pressure: number) {
  const canvas = document.createElement("canvas");
  canvas.width = 280;
  canvas.height = 140;
  const ctx = canvas.getContext("2d")!;
  ctx.fillStyle = "#111";
  ctx.fillRect(0, 0, 280, 140);
  const points = makePoints().map((p) => ({ ...p, pressure }));
  const stroke: Stroke = {
    id: "t",
    brush: "ink",
    p5Brush: preset,
    color: "#e7e7ea",
    size: 10,
    points,
    seed: 42,
    jitter: false,
  };
  paintPackBrush(ctx, stroke, points, stroke.color, "full");
  const img = ctx.getImageData(0, 0, 280, 140);
  let lit = 0;
  for (let i = 0; i < img.data.length; i += 4) {
    const d =
      Math.abs(img.data[i] - 17) +
      Math.abs(img.data[i + 1] - 17) +
      Math.abs(img.data[i + 2] - 17);
    if (d > 40) lit++;
  }
  return lit;
}

describe("brushStyles", () => {
  test("presets produce visibly different coverage", () => {
    if (!hasCanvas2d()) {
      return;
    }
    const byId: Record<string, number> = {};
    for (const id of P5_BRUSH_IDS) {
      byId[id] = litStats(id).lit;
      expect(byId[id]).toBeGreaterThan(0);
    }
    // Soft spray covers more than thin smooth
    expect(byId.spray).toBeGreaterThan(byId.smooth);
    expect(byId.chalk).toBeGreaterThan(byId.smooth * 0.5);
    expect(byId.airbrush).toBeGreaterThan(0);
    expect(byId.dots).toBeGreaterThan(0);
    // Lattice dots should read differently from dense stipple flecks
    expect(Math.abs(byId.dots - byId.stipple)).toBeGreaterThan(5);
    expect(Math.abs(byId.dashed - byId.dotted)).toBeGreaterThan(10);
  });

  test("legacy HB coerces and paints", () => {
    if (!hasCanvas2d()) {
      return;
    }
    const canvas = document.createElement("canvas");
    canvas.width = 280;
    canvas.height = 140;
    const ctx = canvas.getContext("2d")!;
    ctx.fillStyle = "#111";
    ctx.fillRect(0, 0, 280, 140);
    const stroke: Stroke = {
      id: "t",
      brush: "ink",
      // @ts-expect-error legacy id stored in old .lao files
      p5Brush: "HB",
      color: "#e7e7ea",
      size: 10,
      points: makePoints(),
      seed: 7,
      jitter: false,
    };
    paintPackBrush(ctx, stroke, stroke.points, stroke.color, "full");
    const img = ctx.getImageData(0, 0, 280, 140);
    let lit = 0;
    for (let i = 0; i < img.data.length; i += 4) {
      const d =
        Math.abs(img.data[i] - 17) +
        Math.abs(img.data[i + 1] - 17) +
        Math.abs(img.data[i + 2] - 17);
      if (d > 40) lit++;
    }
    expect(lit).toBeGreaterThan(0);
  });

  test("smooth / chalk / ink respond to pressure", () => {
    if (!hasCanvas2d()) {
      return;
    }
    for (const id of ["smooth", "chalk", "ink"] as const) {
      const soft = litWithPressure(id, 0.2);
      const hard = litWithPressure(id, 0.95);
      expect(hard).toBeGreaterThan(soft);
    }
  });

  test("calligraphy differs from smooth (flat nib)", () => {
    if (!hasCanvas2d()) {
      return;
    }
    // Path with direction changes so the chisel tip thickens/thins.
    const points = Array.from({ length: 48 }, (_, i) => ({
      x: 40 + i * 4,
      y: 70 + Math.sin(i / 2.5) * 40,
      pressure: 0.85,
      t: i * 16,
    }));
    function paint(preset: P5BrushId) {
      const canvas = document.createElement("canvas");
      canvas.width = 280;
      canvas.height = 140;
      const ctx = canvas.getContext("2d")!;
      ctx.fillStyle = "#111";
      ctx.fillRect(0, 0, 280, 140);
      const stroke: Stroke = {
        id: "t",
        brush: "ink",
        p5Brush: preset,
        color: "#e7e7ea",
        size: 14,
        points,
        seed: 9,
        jitter: false,
      };
      paintPackBrush(ctx, stroke, points, stroke.color, "full");
      const img = ctx.getImageData(0, 0, 280, 140);
      let lit = 0;
      for (let i = 0; i < img.data.length; i += 4) {
        const d =
          Math.abs(img.data[i] - 17) +
          Math.abs(img.data[i + 1] - 17) +
          Math.abs(img.data[i + 2] - 17);
        if (d > 40) lit++;
      }
      return lit;
    }
    const smooth = paint("smooth");
    const cal = paint("calligraphy");
    expect(cal).toBeGreaterThan(0);
    expect(Math.abs(cal - smooth)).toBeGreaterThan(80);
  });
});
