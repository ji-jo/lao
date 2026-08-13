import { Rect } from "leafer-ui";
import type { ImageElement } from "@/model/types";

/**
 * Leafer proxy for a canvas ImageElement.
 * Shows the real bitmap while selected (transform chrome). StageCanvas also
 * paints the same src so the image survives after leaving the select tool.
 */
export function makeEditableImageFromElement(el: ImageElement): Rect {
  const rotDeg = ((el.rotation ?? 0) * 180) / Math.PI;
  return new Rect({
    x: el.x,
    y: el.y,
    width: Math.max(1, el.w),
    height: Math.max(1, el.h),
    rotation: rotDeg,
    opacity: el.opacity ?? 1,
    editable: !el.locked,
    hittable: true,
    fill: {
      type: "image",
      url: el.src,
      mode: "stretch",
    },
    stroke: "transparent",
    strokeWidth: 0,
  });
}

export function bakeEditableImage(node: Rect): {
  x: number;
  y: number;
  w: number;
  h: number;
  rotation: number;
} {
  const rotDeg = Number(node.rotation) || 0;
  // Match Leafer editor rotateGap (5°) so dock / commit stay in sync.
  const snappedDeg = Math.round(rotDeg / 5) * 5;
  const sx = Math.abs(Number(node.scaleX) || 1);
  const sy = Math.abs(Number(node.scaleY) || 1);
  return {
    x: Number(node.x) || 0,
    y: Number(node.y) || 0,
    w: Math.max(1, (Number(node.width) || 1) * sx),
    h: Math.max(1, (Number(node.height) || 1) * sy),
    rotation: (snappedDeg * Math.PI) / 180,
  };
}
