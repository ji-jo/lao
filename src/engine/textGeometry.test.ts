import { describe, expect, test } from "bun:test";
import {
  hitTextBox,
  measureTextBox,
  transformTextElement,
  wrapTextLines,
} from "@/engine/textGeometry";
import type { TextElement } from "@/model/types";

/** Minimal canvas stub — char width ≈ 0.5 * fontSize. */
function stubCtx(fontSize = 20): CanvasRenderingContext2D {
  let size = fontSize;
  return {
    get font() {
      return `${size}px Inter`;
    },
    set font(v: string) {
      const m = /(\d+(?:\.\d+)?)px/.exec(v);
      if (m) size = Number(m[1]);
    },
    measureText(text: string) {
      return { width: text.length * size * 0.5 } as TextMetrics;
    },
  } as CanvasRenderingContext2D;
}

function sampleText(over: Partial<TextElement> = {}): TextElement {
  return {
    id: "t1",
    text: "Hello world",
    x: 100,
    y: 50,
    fontFamily: "Inter",
    size: 24,
    color: "#fff",
    ...over,
  };
}

describe("textGeometry", () => {
  test("wrapTextLines soft-wraps to maxWidth", () => {
    const c = stubCtx(20);
    const lines = wrapTextLines(c, "one two three four", "Inter", 20, 0, 40);
    expect(lines.length).toBeGreaterThan(1);
  });

  test("measureTextBox uses boxWidth when set", () => {
    const c = stubCtx(24);
    const box = measureTextBox(c, sampleText({ boxWidth: 80 }));
    expect(box.w).toBe(80);
    expect(box.lines.length).toBeGreaterThan(0);
  });

  test("hitTextBox respects rotation", () => {
    const c = stubCtx(24);
    const t = sampleText({ rotation: Math.PI / 2, boxWidth: 100 });
    const { w, h } = measureTextBox(c, t);
    const cx = t.x + w / 2;
    const cy = t.y + h / 2;
    expect(hitTextBox(c, t, cx, cy)).toBe(true);
    expect(hitTextBox(c, t, cx + w + h + 40, cy)).toBe(false);
  });

  test("transformTextElement accumulates rotation around center", () => {
    const c = stubCtx(24);
    const t = sampleText({ boxWidth: 120 });
    const box = measureTextBox(c, t);
    const cx = t.x + box.w / 2;
    const cy = t.y + box.h / 2;
    const next = transformTextElement(t, box, cx, cy, 1, Math.PI / 4);
    expect(next.rotation ?? 0).toBeCloseTo(Math.PI / 4, 5);
    const nextBox = measureTextBox(c, next);
    const ncx = next.x + nextBox.w / 2;
    const ncy = next.y + nextBox.h / 2;
    expect(ncx).toBeCloseTo(cx, 4);
    expect(ncy).toBeCloseTo(cy, 4);
  });
});
