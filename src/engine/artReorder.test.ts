import { describe, expect, test } from "bun:test";
import { reorderByIds } from "@/engine/artReorder";

const items = (ids: string[]) => ids.map((id) => ({ id }));
const idsOf = (arr: { id: string }[]) => arr.map((it) => it.id);

describe("reorderByIds", () => {
  test("backward swaps with the previous unselected item", () => {
    const next = reorderByIds(items(["a", "b", "c"]), ["b"], "backward");
    expect(idsOf(next)).toEqual(["b", "a", "c"]);
  });

  test("forward swaps with the next unselected item", () => {
    const next = reorderByIds(items(["a", "b", "c"]), ["b"], "forward");
    expect(idsOf(next)).toEqual(["a", "c", "b"]);
  });

  test("back sends selection behind everything else, keeping relative order", () => {
    const next = reorderByIds(items(["a", "b", "c", "d"]), ["b", "d"], "back");
    expect(idsOf(next)).toEqual(["b", "d", "a", "c"]);
  });

  test("front sends selection on top, keeping relative order", () => {
    const next = reorderByIds(items(["a", "b", "c", "d"]), ["a", "c"], "front");
    expect(idsOf(next)).toEqual(["b", "d", "a", "c"]);
  });

  test("contiguous selection moves as a block one step backward", () => {
    const next = reorderByIds(items(["a", "b", "c", "d"]), ["b", "c"], "backward");
    expect(idsOf(next)).toEqual(["b", "c", "a", "d"]);
  });

  test("no-op at the back / front returns the same array", () => {
    const src = items(["a", "b", "c"]);
    expect(reorderByIds(src, ["a"], "backward")).toBe(src);
    expect(reorderByIds(src, ["c"], "forward")).toBe(src);
    expect(reorderByIds(src, ["a"], "back")).toBe(src);
    expect(reorderByIds(src, ["c"], "front")).toBe(src);
  });
});
