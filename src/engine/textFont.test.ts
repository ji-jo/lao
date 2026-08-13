import { describe, expect, test } from "bun:test";
import {
  textCanvasFont,
  textUsesSyntheticBold,
  SYNTHETIC_BOLD_STROKE,
} from "@/engine/textFont";

describe("textFont", () => {
  test("bold requests weight 700 in the canvas font string", () => {
    const regular = textCanvasFont({
      fontFamily: "Geist",
      size: 48,
      bold: false,
    });
    const bold = textCanvasFont({
      fontFamily: "Geist",
      size: 48,
      bold: true,
    });
    expect(regular).toContain("400 ");
    expect(bold).toContain("700 ");
    expect(bold).not.toContain("italic");
  });

  test("synthetic bold mirrors the italic reliability path", () => {
    expect(textUsesSyntheticBold(true)).toBe(true);
    expect(textUsesSyntheticBold(false)).toBe(false);
    expect(SYNTHETIC_BOLD_STROKE).toBeGreaterThan(0);
  });
});
