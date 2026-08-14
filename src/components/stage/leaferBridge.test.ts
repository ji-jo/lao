import { describe, expect, test } from "bun:test";
import {
  canEditShapeWithLeafer,
  extrasAfterPathEdit,
  leaferCenterToShapeBox,
  leaferTextToCommit,
  oppositeResizeAlign,
  resizeBoxKeepingAlign,
  shapeBoxToLeaferCenter,
  textElementToLeaferProps,
} from "@/components/stage/leaferBridge";
import { bakeShapeGeometry } from "@/engine/shapeGeometry";

describe("leaferBridge", () => {
  test("textElementToLeaferProps maps rotation to degrees", () => {
    const props = textElementToLeaferProps(
      {
        text: "Hi",
        projectX: 10,
        projectY: 20,
        boxWidth: 120,
        rotation: Math.PI / 2,
      },
      {
        fontFamily: "Inter",
        textSize: 32,
        color: "#fff",
        letterSpacing: 1,
      },
    );
    expect(props.rotation).toBeCloseTo(90, 5);
    expect(props.width).toBe(120);
    expect(props.fontSize).toBe(32);
  });

  test("leaferTextToCommit maps degrees back to radians", () => {
    const result = leaferTextToCommit({
      text: "Hi",
      x: 1,
      y: 2,
      width: 80,
      rotation: 90,
    });
    expect(result?.rotation).toBeCloseTo(Math.PI / 2, 5);
    expect(result?.boxWidth).toBe(80);
  });

  test("empty text commits as null", () => {
    expect(leaferTextToCommit({ text: "   " })).toBeNull();
  });

  test("leaferTextToCommit keeps typed text and strips ZWSP", () => {
    const result = leaferTextToCommit({
      text: "Hello\u200b\nWorld",
      x: 10,
      y: 20,
      width: 100,
    });
    expect(result?.text).toBe("Hello\nWorld");
    expect(leaferTextToCommit({ text: "\u200b\n" })).toBeNull();
  });

  test("path edit detaches Leafer shapeBox so warps stick", () => {
    const arrow = {
      id: "a",
      brush: "ink" as const,
      color: "#fff",
      size: 4,
      points: [],
      seed: 1,
      shapeKind: "arrow" as const,
      shapeBox: { x: 0, y: 0, w: 100, h: 50 },
    };
    expect(canEditShapeWithLeafer(arrow)).toBe(true);
    const arrowDetach = extrasAfterPathEdit(arrow);
    expect(arrowDetach).toEqual({ shapeBox: undefined });
    expect(
      canEditShapeWithLeafer({ ...arrow, shapeBox: undefined }),
    ).toBe(false);

    const rect = { ...arrow, shapeKind: "rect" as const };
    expect(extrasAfterPathEdit(rect)).toEqual({
      shapeBox: undefined,
      shapeKind: undefined,
    });
  });
});
describe("bakeShapeGeometry", () => {
  test("keeps rect frame after rotation", () => {
    const baked = bakeShapeGeometry("rect", {
      x: 10,
      y: 10,
      w: 100,
      h: 50,
      rotationDeg: 45,
    });
    expect(baked.shapeBox.w).toBeCloseTo(100, 5);
    expect(baked.shapeBox.h).toBeCloseTo(50, 5);
    expect(baked.shapeBox.rotation).toBeCloseTo(Math.PI / 4, 5);
    expect(baked.points.length).toBeGreaterThan(4);
  });

  test("folds line rotation into endpoints", () => {
    const baked = bakeShapeGeometry("line", {
      x: 0,
      y: 0,
      w: 0,
      h: 0,
      dx: 100,
      dy: 0,
      rotationDeg: 90,
    });
    expect(baked.shapeBox.rotation ?? 0).toBe(0);
    expect(Math.abs(baked.shapeBox.w)).toBeLessThan(1e-6);
    expect(Math.abs(baked.shapeBox.h)).toBeCloseTo(100, 5);
  });

  test("one-sided width change keeps the unrotated left edge", () => {
    const box = { x: 10, y: 20, w: 100, h: 50 };
    const c = shapeBoxToLeaferCenter(box);
    // Dragging the right handle +20: center shifts +10, width becomes 120.
    const next = leaferCenterToShapeBox({
      x: c.x + 10,
      y: c.y,
      w: 120,
      h: 50,
      rotationDeg: 30,
    });
    expect(next.x).toBeCloseTo(10, 5);
    expect(next.y).toBeCloseTo(20, 5);
    expect(next.w).toBeCloseTo(120, 5);
    expect(next.h).toBeCloseTo(50, 5);
  });

  test("center origin round-trips to the unrotated top-left box", () => {
    const box = { x: 10, y: 20, w: 100, h: 50 };
    const c = shapeBoxToLeaferCenter(box);
    expect(c.x).toBeCloseTo(60, 5);
    expect(c.y).toBeCloseTo(45, 5);
    const back = leaferCenterToShapeBox({
      ...c,
      w: box.w,
      h: box.h,
      rotationDeg: 45,
    });
    expect(back.x).toBeCloseTo(10, 5);
    expect(back.y).toBeCloseTo(20, 5);
    const baked = bakeShapeGeometry("rect", back);
    const xs = baked.points.map((p) => p.x);
    const ys = baked.points.map((p) => p.y);
    const cx = (Math.min(...xs) + Math.max(...xs)) / 2;
    const cy = (Math.min(...ys) + Math.max(...ys)) / 2;
    expect(cx).toBeCloseTo(60, 1);
    expect(cy).toBeCloseTo(45, 1);
  });
});

describe("resizeBoxKeepingAlign", () => {
  const box = { x: 10, y: 20, w: 100, h: 50 };

  test("right handle keeps the left edge", () => {
    expect(oppositeResizeAlign(3, false)).toBe("left");
    const next = resizeBoxKeepingAlign(box, 120, 50, "left");
    expect(next.x).toBeCloseTo(10, 5);
    expect(next.y).toBeCloseTo(20, 5);
    expect(next.w).toBeCloseTo(120, 5);
    expect(next.h).toBeCloseTo(50, 5);
  });

  test("left handle keeps the right edge", () => {
    const next = resizeBoxKeepingAlign(box, 80, 50, "right");
    expect(next.x + next.w).toBeCloseTo(110, 5);
    expect(next.y).toBeCloseTo(20, 5);
    expect(next.w).toBeCloseTo(80, 5);
  });

  test("top handle keeps the bottom edge", () => {
    expect(oppositeResizeAlign(1, false)).toBe("bottom");
    const next = resizeBoxKeepingAlign(box, 100, 70, "bottom");
    expect(next.x).toBeCloseTo(10, 5);
    expect(next.y + next.h).toBeCloseTo(70, 5);
    expect(next.h).toBeCloseTo(70, 5);
  });

  test("alt / center keeps the midpoint", () => {
    expect(oppositeResizeAlign(3, true)).toBe("center");
    const next = resizeBoxKeepingAlign(box, 120, 50, "center");
    expect(next.x).toBeCloseTo(0, 5);
    expect(next.y).toBeCloseTo(20, 5);
    expect(next.x + next.w / 2).toBeCloseTo(60, 5);
  });

  test("rotated right-handle resize keeps the local left edge in world space", () => {
    const rot = Math.PI / 2;
    const start = { ...box, rotation: rot };
    const next = resizeBoxKeepingAlign(start, 120, 50, "left");
    const cos = Math.cos(rot);
    const sin = Math.sin(rot);
    const startLeft = {
      x: 60 + (-50) * cos - 0 * sin,
      y: 45 + (-50) * sin + 0 * cos,
    };
    const nextCx = next.x + next.w / 2;
    const nextCy = next.y + next.h / 2;
    const nextLeft = {
      x: nextCx + (-60) * cos - 0 * sin,
      y: nextCy + (-60) * sin + 0 * cos,
    };
    expect(nextLeft.x).toBeCloseTo(startLeft.x, 5);
    expect(nextLeft.y).toBeCloseTo(startLeft.y, 5);
  });
});
