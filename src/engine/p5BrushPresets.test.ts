import { describe, expect, test } from "bun:test";
import {
  P5_BRUSH_IDS,
  P5_BRUSHES,
  P5_BRUSH_IDS_BY_KIND,
  brushesForKind,
  kindForP5Brush,
  isP5BrushId,
  coerceP5Brush,
  ensureCustomP5Brushes,
  __resetCustomP5BrushesForTests,
} from "@/engine/p5BrushPresets";

describe("p5BrushPresets", () => {
  test("lists the 18 procedural presets", () => {
    expect([...P5_BRUSH_IDS]).toEqual([
      "smooth",
      "calligraphy",
      "brush",
      "rough",
      "stipple",
      "sketchy",
      "parallel",
      "outline",
      "dashed",
      "dotted",
      "dots",
      "spray",
      "chalk",
      "ink",
      "airbrush",
      "pixel",
      "halftone",
      "squares",
    ]);
    expect(P5_BRUSHES.map((b) => b.id)).toEqual([...P5_BRUSH_IDS]);
  });

  test("isP5BrushId + coerceP5Brush", () => {
    expect(isP5BrushId("smooth")).toBe(true);
    expect(isP5BrushId("HB")).toBe(false);
    expect(isP5BrushId(undefined)).toBe(false);
    expect(coerceP5Brush("HB")).toBe("smooth");
    expect(coerceP5Brush("pastel")).toBe("chalk");
    expect(coerceP5Brush("airbrush")).toBe("airbrush");
    expect(coerceP5Brush("ribbon")).toBe("airbrush");
    expect(coerceP5Brush("watercolor")).toBe("ink");
    expect(coerceP5Brush("wave")).toBe("rough");
    expect(coerceP5Brush("dots")).toBe("dots");
    expect(coerceP5Brush("nope")).toBeUndefined();
  });

  test("Ink / Pen / Marker packs cover all presets", () => {
    expect(P5_BRUSH_IDS_BY_KIND.ink).toContain("spray");
    expect(P5_BRUSH_IDS_BY_KIND.ink).toContain("dots");
    expect(P5_BRUSH_IDS_BY_KIND.ink).toContain("airbrush");
    expect(P5_BRUSH_IDS_BY_KIND.ink).toContain("halftone");
    expect(P5_BRUSH_IDS_BY_KIND.ink).not.toContain("wave" as never);
    expect(P5_BRUSH_IDS_BY_KIND.ink).not.toContain("ribbon" as never);
    expect(P5_BRUSH_IDS_BY_KIND.pen).toContain("outline");
    expect(P5_BRUSH_IDS_BY_KIND.pen).toContain("pixel");
    expect(P5_BRUSH_IDS_BY_KIND.marker).toEqual([
      "spray",
      "dots",
      "chalk",
      "brush",
      "stipple",
      "airbrush",
    ]);
    const cover = new Set([
      ...P5_BRUSH_IDS_BY_KIND.ink,
      ...P5_BRUSH_IDS_BY_KIND.pen,
      ...P5_BRUSH_IDS_BY_KIND.marker,
    ]);
    expect(cover).toEqual(new Set(P5_BRUSH_IDS));
    expect(kindForP5Brush("smooth")).toBe("ink");
    expect(kindForP5Brush("outline")).toBe("pen");
    expect(kindForP5Brush("spray")).toBe("marker");
    expect(kindForP5Brush("dots")).toBe("marker");
    expect(brushesForKind("pen").map((b) => b.id)).toContain("dashed");
  });

  test("ensureCustomP5Brushes is a no-op", () => {
    __resetCustomP5BrushesForTests();
    const names: string[] = [];
    ensureCustomP5Brushes((name) => {
      names.push(name);
    });
    ensureCustomP5Brushes((name) => {
      names.push(name);
    });
    expect(names).toEqual([]);
  });
});
