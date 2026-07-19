import { describe, expect, test } from "bun:test";
import { displaceStroke, mulberry32, variantForFrame, BOIL_HOLD, BOIL_VARIANTS } from "./boil";
import type { Stroke } from "@/model/types";

function makeStroke(seed: number): Stroke {
  return {
    id: "s1",
    brush: "ink",
    color: "#fff",
    size: 6,
    seed,
    jitter: true,
    points: Array.from({ length: 40 }, (_, i) => ({
      x: i * 10,
      y: Math.sin(i / 5) * 50,
      pressure: 0.7,
      t: i * 8,
    })),
  };
}

describe("boil", () => {
  test("mulberry32 is deterministic", () => {
    const a = mulberry32(1234);
    const b = mulberry32(1234);
    for (let i = 0; i < 10; i++) expect(a()).toBe(b());
  });

  test("same seed + variant → identical displacement (preview matches export)", () => {
    const s = makeStroke(42);
    expect(displaceStroke(s, 1)).toEqual(displaceStroke(s, 1));
  });

  test("different variants → different displacement", () => {
    const s = makeStroke(42);
    const a = displaceStroke(s, 0);
    const b = displaceStroke(s, 1);
    expect(a.some((p, i) => p.x !== b[i].x || p.y !== b[i].y)).toBe(true);
  });

  test("different seeds → different displacement", () => {
    const a = displaceStroke(makeStroke(1), 0);
    const b = displaceStroke(makeStroke(2), 0);
    expect(a.some((p, i) => p.x !== b[i].x || p.y !== b[i].y)).toBe(true);
  });

  test("displacement is bounded by amplitude", () => {
    const s = makeStroke(7);
    const amp = 1.2 + s.size * 0.18 + 1e-9;
    for (let v = 0; v < BOIL_VARIANTS; v++) {
      const d = displaceStroke(s, v);
      d.forEach((p, i) => {
        expect(Math.abs(p.x - s.points[i].x)).toBeLessThanOrEqual(amp);
        expect(Math.abs(p.y - s.points[i].y)).toBeLessThanOrEqual(amp);
      });
    }
  });

  test("variant holds for BOIL_HOLD frames and cycles", () => {
    expect(variantForFrame(0)).toBe(variantForFrame(BOIL_HOLD - 1));
    expect(variantForFrame(0)).not.toBe(variantForFrame(BOIL_HOLD));
    expect(variantForFrame(0)).toBe(variantForFrame(BOIL_HOLD * BOIL_VARIANTS));
  });

  test("pressure and timing survive displacement untouched", () => {
    const s = makeStroke(9);
    const d = displaceStroke(s, 2);
    d.forEach((p, i) => {
      expect(p.pressure).toBe(s.points[i].pressure);
      expect(p.t).toBe(s.points[i].t);
    });
  });
});
