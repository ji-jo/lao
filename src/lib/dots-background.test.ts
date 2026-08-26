import { describe, expect, test } from "bun:test";
import {
  DEFAULT_DOTS,
  dotsHomePoints,
  dotsPatternOrigin,
  dotsStampPoints,
  dotsTileSize,
  makeDotsBackground,
  resolveDots,
} from "./dots-background";

describe("dots background", () => {
  test("makeDotsBackground starts from defaults", () => {
    const bg = makeDotsBackground();
    expect(bg.kind).toBe("dots");
    expect(bg.color).toBe(DEFAULT_DOTS.color);
    expect(bg.dotColor).toBe(DEFAULT_DOTS.dotColor);
    expect(bg.size).toBe(DEFAULT_DOTS.size);
    expect(bg.gapX).toBe(DEFAULT_DOTS.gapX);
    expect(bg.gapY).toBe(DEFAULT_DOTS.gapY);
    expect(bg.pattern).toBe("grid");
    expect(bg.shape).toBe("circle");
  });

  test("resolveDots clamps and fills omitted fields", () => {
    const d = resolveDots({
      kind: "dots",
      color: "#111111",
      dotColor: "#ff0000",
      size: 999,
      gapX: 1,
      gapY: 1,
      opacity: 4,
      rotation: 400,
      softness: -1,
    });
    expect(d.size).toBe(128);
    expect(d.gapX).toBe(2);
    expect(d.gapY).toBe(2);
    expect(d.opacity).toBe(1);
    expect(d.rotation).toBe(180);
    expect(d.softness).toBe(0);
    expect(d.origin).toBe("center");
    expect(d.shape).toBe("circle");
  });

  test("linked gaps force gapY = gapX", () => {
    const d = resolveDots({
      kind: "dots",
      color: "#fff",
      dotColor: "#000",
      size: 2,
      gapX: 32,
      gapY: 8,
      gapLinked: true,
    });
    expect(d.gapX).toBe(32);
    expect(d.gapY).toBe(32);
  });

  test("unlinked gaps stay independent", () => {
    const d = resolveDots({
      kind: "dots",
      color: "#fff",
      dotColor: "#000",
      size: 2,
      gapX: 32,
      gapY: 8,
      gapLinked: false,
    });
    expect(d.gapX).toBe(32);
    expect(d.gapY).toBe(8);
  });

  test("grid tile is gapX × gapY with one home dot", () => {
    const d = resolveDots(makeDotsBackground({ gapX: 20, gapY: 10, gapLinked: false }));
    expect(dotsTileSize(d)).toEqual({ w: 20, h: 10 });
    expect(dotsHomePoints(d)).toEqual([{ x: 10, y: 5 }]);
    expect(dotsStampPoints(d)).toHaveLength(9);
  });

  test("hex tile is two rows with a staggered home", () => {
    const d = resolveDots(
      makeDotsBackground({ gapX: 20, gapY: 10, gapLinked: false, pattern: "hex" }),
    );
    expect(dotsTileSize(d)).toEqual({ w: 20, h: 20 });
    const homes = dotsHomePoints(d);
    expect(homes).toHaveLength(2);
    expect(homes[0]).toEqual({ x: 10, y: 5 });
    expect(homes[1]).toEqual({ x: 0, y: 15 });
    expect(dotsStampPoints(d)).toHaveLength(18);
  });

  test("center origin splits leftover on both edges", () => {
    const d = resolveDots(makeDotsBackground({ gapX: 24, gapY: 24, offsetX: 0, offsetY: 0 }));
    const o = dotsPatternOrigin(d, 100, 50);
    expect(o.x).toBeCloseTo((100 % 24) / 2, 5);
    expect(o.y).toBeCloseTo((50 % 24) / 2, 5);
  });

  test("corner origin is just the user offset", () => {
    const d = resolveDots(
      makeDotsBackground({ origin: "corner", offsetX: 3, offsetY: -2 }),
    );
    expect(dotsPatternOrigin(d, 1920, 1080)).toEqual({ x: 3, y: -2 });
  });
});
