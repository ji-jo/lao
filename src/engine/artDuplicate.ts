import { flattenBezierNodes } from "@/lib/bezier";
import {
  translateBezierNodes,
  translatePoints,
} from "@/engine/pathEdit";
import { strokeDurationMs } from "@/engine/strokeProgress";
import type { ImageElement, Stroke, TextElement } from "@/model/types";

/** Offset so the copy is visible on top of the original (matches text Duplicate). */
export const ART_DUPLICATE_OFFSET = 16;

export function cloneStrokeAtOffset(
  stroke: Stroke,
  dx: number,
  dy: number,
): Stroke {
  const { groupId: _drop, ...rest } = stroke;
  const next: Stroke = {
    ...rest,
    id: crypto.randomUUID(),
    seed: ((stroke.seed >>> 0) + 0x9e3779b9) >>> 0 || 1,
    points: translatePoints(stroke.points, dx, dy),
  };
  if (stroke.clip) next.clip = { ...stroke.clip };
  if (stroke.bezierNodes?.length) {
    next.bezierNodes = translateBezierNodes(stroke.bezierNodes, dx, dy);
    const durationHint = stroke.clip?.durationMs ?? strokeDurationMs(stroke.points);
    next.points = flattenBezierNodes(
      next.bezierNodes,
      stroke.closed,
      durationHint > 0 ? durationHint : undefined,
    );
  }
  if (stroke.shapeBox) {
    next.shapeBox = {
      ...stroke.shapeBox,
      x: stroke.shapeBox.x + dx,
      y: stroke.shapeBox.y + dy,
    };
  }
  return next;
}

export function cloneTextAtOffset(
  text: TextElement,
  dx: number,
  dy: number,
): TextElement {
  const { groupId: _drop, ...rest } = text;
  return {
    ...rest,
    id: crypto.randomUUID(),
    x: text.x + dx,
    y: text.y + dy,
    path: text.path ? { ...text.path } : text.path,
    shadow: text.shadow ? { ...text.shadow } : text.shadow,
  };
}

export function cloneImageAtOffset(
  image: ImageElement,
  dx: number,
  dy: number,
): ImageElement {
  const { groupId: _drop, ...rest } = image;
  return {
    ...rest,
    id: crypto.randomUUID(),
    x: image.x + dx,
    y: image.y + dy,
  };
}
