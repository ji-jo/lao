import type { Stroke } from "@/model/types";

/** In-app stroke clipboard — survives frame/layer switches, not reloads. */
let strokes: Stroke[] = [];

export function copyStrokes(source: Stroke[]) {
  // snapshot points so later edits to the originals can't leak in
  strokes = source.map((s) => ({ ...s, points: s.points.map((p) => ({ ...p })) }));
}

export function readClipboard(): Stroke[] {
  return strokes;
}

export function hasClipboard(): boolean {
  return strokes.length > 0;
}
