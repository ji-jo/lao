import { describe, expect, test, beforeAll, afterAll } from "bun:test";
import { layoutTextOnPath } from "@/engine/textPath";
import type { TextElement } from "@/model/types";

/** Bun has no DOM — stub only when missing; always tear down so canvas tests stay real. */
let installedStub = false;

beforeAll(() => {
  const g = globalThis as typeof globalThis & { document?: Document };
  if (g.document) return;
  installedStub = true;
  g.document = {
    createElement: () => {
      let size = 16;
      return {
        getContext: () => ({
          get font() {
            return `${size}px Inter`;
          },
          set font(v: string) {
            const m = /(\d+(?:\.\d+)?)px/.exec(v);
            if (m) size = Number(m[1]);
          },
          measureText: (text: string) => ({ width: text.length * size * 0.5 }),
        }),
      };
    },
  } as unknown as Document;
});

afterAll(() => {
  if (!installedStub) return;
  delete (globalThis as typeof globalThis & { document?: Document }).document;
  installedStub = false;
});

function makeText(partial: Partial<TextElement> & Pick<TextElement, "text">): TextElement {
  return {
    id: "t1",
    x: 0,
    y: 0,
    fontFamily: "Inter",
    size: 48,
    color: "#000",
    ...partial,
  };
}

describe("layoutTextOnPath", () => {
  test("none / missing returns null", () => {
    expect(layoutTextOnPath(makeText({ text: "hi" }), 200, 48)).toBeNull();
    expect(
      layoutTextOnPath(
        makeText({
          text: "hi",
          path: { shape: "none", align: "left", position: "top", direction: "cw", offset: 0 },
        }),
        200,
        48,
      ),
    ).toBeNull();
  });

  test("wave places glyphs in left-to-right order with advancing x", () => {
    const glyphs = layoutTextOnPath(
      makeText({
        text: "hello",
        path: {
          shape: "wave",
          align: "left",
          position: "center",
          direction: "cw",
          offset: 0,
        },
      }),
      320,
      120,
    );
    expect(glyphs).not.toBeNull();
    expect(glyphs!.length).toBeGreaterThanOrEqual(5);
    // Centers should generally progress along +x for an open L→R path
    for (let i = 1; i < glyphs!.length; i++) {
      expect(glyphs![i].x).toBeGreaterThan(glyphs![i - 1].x - 2);
    }
  });

  test("arch keeps neighboring glyphs close (no wrap scatter)", () => {
    const glyphs = layoutTextOnPath(
      makeText({
        text: "sa",
        size: 64,
        path: {
          shape: "arch",
          align: "left",
          position: "top",
          direction: "cw",
          offset: 0,
        },
      }),
      200,
      100,
    )!;
    expect(glyphs.length).toBe(2);
    const dx = Math.abs(glyphs[1].x - glyphs[0].x);
    const dy = Math.abs(glyphs[1].y - glyphs[0].y);
    expect(Math.hypot(dx, dy)).toBeLessThan(120);
  });
});
