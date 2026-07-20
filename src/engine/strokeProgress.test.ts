import { describe, expect, test } from "bun:test";
import type { Stroke, StrokePoint } from "@/model/types";
import {
  strokeAtTime,
  strokeDurationMs,
  truncateStrokePoints,
} from "@/engine/strokeProgress";

function pts(...ts: number[]): StrokePoint[] {
  return ts.map((t, i) => ({ x: i, y: 0, pressure: 0.5, t }));
}

function stroke(partial: Partial<Stroke> & { points: StrokePoint[] }): Stroke {
  return {
    id: "s1",
    brush: "ink",
    color: "#fff",
    size: 4,
    seed: 1,
    jitter: false,
    ...partial,
  };
}

describe("truncateStrokePoints", () => {
  test("keeps points up to localT", () => {
    const p = pts(0, 10, 20, 30);
    expect(truncateStrokePoints(p, 20).map((x) => x.t)).toEqual([0, 10, 20]);
  });

  test("before start keeps first point once localT >= 0", () => {
    const p = pts(0, 10);
    expect(truncateStrokePoints(p, 0)).toHaveLength(1);
  });

  test("negative localT hides all", () => {
    expect(truncateStrokePoints(pts(0, 10), -1)).toEqual([]);
  });
});

describe("strokeAtTime", () => {
  test("no clip → always full", () => {
    const s = stroke({ points: pts(0, 50) });
    expect(strokeAtTime(s, 0)?.length).toBe(2);
  });

  test("before start hidden", () => {
    const s = stroke({
      points: pts(0, 100),
      clip: { startMs: 200, durationMs: 100 },
    });
    expect(strokeAtTime(s, 199)).toBeNull();
  });

  test("during clip progressive", () => {
    const s = stroke({
      points: pts(0, 50, 100),
      clip: { startMs: 0, durationMs: 100 },
    });
    expect(strokeAtTime(s, 50)?.map((p) => p.t)).toEqual([0, 50]);
  });

  test("after duration full hold", () => {
    const s = stroke({
      points: pts(0, 50, 100),
      clip: { startMs: 10, durationMs: 100 },
    });
    expect(strokeAtTime(s, 200)?.length).toBe(3);
  });
});

describe("strokeDurationMs", () => {
  test("last point t", () => {
    expect(strokeDurationMs(stroke({ points: pts(0, 40, 90) }))).toBe(90);
  });
});
