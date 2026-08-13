import { describe, expect, test } from "bun:test";
import { DEFAULT_CLIP_EASING, type Stroke, type StrokePoint } from "@/model/types";
import {
  clipFadeOpacity,
  strokeAtTime,
  strokeDurationMs,
  textContentAtTime,
  textProgressAtTime,
  truncateStrokePoints,
  truncateTextByProgress,
  typewriterDurationMs,
  retimeStrokePoints,
  strokeWithClipPoints,
} from "@/engine/strokeProgress";
import type { TextElement } from "@/model/types";

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

describe("retimeStrokePoints", () => {
  test("assigns monotonic t along length", () => {
    const pts = [
      { x: 0, y: 0, pressure: 1, t: 0 },
      { x: 100, y: 0, pressure: 1, t: 0 },
    ];
    const out = retimeStrokePoints(pts, 200);
    expect(out[0].t).toBe(0);
    expect(out[1].t).toBe(200);
  });
});

describe("strokeWithClipPoints", () => {
  test("drops bezierNodes for partial clip slice", () => {
    const s = stroke({
      points: pts(0, 50, 100),
      bezierNodes: [{ x: 0, y: 0 }, { x: 2, y: 0 }],
    });
    const partial = truncateStrokePoints(s.points, 50);
    const out = strokeWithClipPoints(s, partial);
    expect(out.bezierNodes).toBeUndefined();
    expect(out.points).toEqual(partial);
  });
});

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

describe("clipFadeOpacity", () => {
  test("DEFAULT easing holds after clip end — finished paths must never vanish from export", () => {
    // regression: fadeOutFrames defaulted to 4, so clipFadeOpacity clamped
    // every finished Animatron path to 0 forever ("previous layers missing")
    const s = stroke({
      points: pts(0, 100),
      clip: { startMs: 0, durationMs: 500, easing: { ...DEFAULT_CLIP_EASING } },
    });
    expect(DEFAULT_CLIP_EASING.fadeOutFrames).toBe(0);
    expect(clipFadeOpacity(s, 501, 12)).toBe(1);
    expect(clipFadeOpacity(s, 10_000, 12)).toBe(1);
  });

  test("explicit fade-out is an opt-in exit: 0 after clip end", () => {
    const s = stroke({
      points: pts(0, 100),
      clip: {
        startMs: 0,
        durationMs: 500,
        easing: { ...DEFAULT_CLIP_EASING, fadeOutFrames: 4 },
      },
    });
    expect(clipFadeOpacity(s, 10_000, 12)).toBe(0);
  });
});

describe("textProgressAtTime / truncateTextByProgress", () => {
  const sample: TextElement = {
    id: "t1",
    text: "Hello",
    x: 0,
    y: 0,
    fontFamily: "Inter",
    size: 24,
    color: "#fff",
    clip: { startMs: 100, durationMs: 400 },
  };

  test("hidden before clip", () => {
    expect(textProgressAtTime(sample, 50)).toBeNull();
    expect(textContentAtTime(sample, 50)).toBeNull();
  });

  test("partial during clip", () => {
    const p = textProgressAtTime(sample, 300);
    expect(p).toBeGreaterThan(0);
    expect(p!).toBeLessThan(1);
    expect(truncateTextByProgress("Hello", 0.4)).toBe("He");
    expect(textContentAtTime(sample, 300)).toBe(
      truncateTextByProgress("Hello", p!),
    );
  });

  test("full after clip", () => {
    expect(textProgressAtTime(sample, 600)).toBe(1);
    expect(textContentAtTime(sample, 600)).toBe("Hello");
  });

  test("typewriterSpeed reveals by characters per second", () => {
    const typed: TextElement = { ...sample, typewriterSpeed: 10 };
    // 100ms into clip → 1 char
    expect(textContentAtTime(typed, 200)).toBe("H");
    // 250ms → 3 chars
    expect(textContentAtTime(typed, 350)).toBe("Hel");
    // speed 0 → instant full
    expect(textContentAtTime({ ...sample, typewriterSpeed: 0 }, 150)).toBe(
      "Hello",
    );
  });

  test("typewriterDurationMs scales with length and speed", () => {
    expect(typewriterDurationMs("Hi", 10)).toBe(200);
    expect(typewriterDurationMs("", 10)).toBe(80);
  });
});
