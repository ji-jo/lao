/**
 * Cross-layer art pick (project space) — shared by StageCanvas + Leafer overlay.
 */
import { flattenBezierNodes } from "@/lib/bezier";
import { hitsStroke, pointsBounds } from "@/engine/pathEdit";
import { hitTestImage } from "@/engine/canvasImage";
import { hitTextBox } from "@/engine/textGeometry";
import {
  resolveCel,
  type ImageElement,
  type Project,
  type Stroke,
} from "@/model/types";

export type ArtHit = {
  id: string;
  layerId: string;
  kind: "text" | "image" | "stroke";
};

/** Topmost selectable art across visible layers at (x, y) in project space. */
export function findArtAtProject(
  project: Project,
  frameIndex: number,
  x: number,
  y: number,
  measureCtx: CanvasRenderingContext2D | null,
): ArtHit | null {
  const animatron = project.workflow === "animatron";
  for (let i = project.layers.length - 1; i >= 0; i--) {
    const layer = project.layers[i];
    if (!layer?.visible) continue;
    const cel = animatron
      ? (layer.frames.find((f) => f) ?? null)
      : resolveCel(layer, frameIndex);
    if (!cel) continue;
    if (cel.texts && measureCtx) {
      for (let j = cel.texts.length - 1; j >= 0; j--) {
        const t = cel.texts[j]!;
        if (hitTextBox(measureCtx, t, x, y)) {
          return { id: t.id, layerId: layer.id, kind: "text" };
        }
      }
    }
    if (cel.images) {
      for (let j = cel.images.length - 1; j >= 0; j--) {
        const im = cel.images[j]!;
        if (hitTestImage(im, x, y)) {
          return { id: im.id, layerId: layer.id, kind: "image" };
        }
      }
    }
    for (let j = cel.strokes.length - 1; j >= 0; j--) {
      const s = cel.strokes[j]!;
      const hitPts = s.bezierNodes?.length
        ? flattenBezierNodes(s.bezierNodes, s.closed)
        : s.points;
      if (!hitPts?.length) continue;
      if (hitsStroke(hitPts, x, y, Math.max(s.size * 1.5, 12), s.closed)) {
        return { id: s.id, layerId: layer.id, kind: "stroke" };
      }
    }
  }
  return null;
}

/**
 * True when (x,y) is on the selected shape or near Leafer transform chrome
 * (bbox + rotate handle padding in project space).
 */
export function hitsShapeEditChrome(
  stroke: Stroke,
  x: number,
  y: number,
  viewScale: number,
): boolean {
  const hitPts = stroke.bezierNodes?.length
    ? flattenBezierNodes(stroke.bezierNodes, stroke.closed)
    : stroke.points;
  if (hitPts?.length) {
    const threshold = Math.max(stroke.size * 1.5, 12);
    if (hitsStroke(hitPts, x, y, threshold, stroke.closed)) return true;
  }
  // ~editor handles + rotate knob in screen px → project space
  const pad = 56 / Math.max(viewScale, 0.001);
  const box = stroke.shapeBox;
  if (box) {
    const kind = stroke.shapeKind;
    if (kind === "line" || kind === "arrow") {
      // shapeBox is start + signed delta — AABB of the segment, not a rect.
      const x0 = box.x;
      const y0 = box.y;
      const x1 = box.x + box.w;
      const y1 = box.y + box.h;
      return (
        x >= Math.min(x0, x1) - pad &&
        x <= Math.max(x0, x1) + pad &&
        y >= Math.min(y0, y1) - pad &&
        y <= Math.max(y0, y1) + pad
      );
    }
    const left = box.w >= 0 ? box.x : box.x + box.w;
    const top = box.h >= 0 ? box.y : box.y + box.h;
    const w = Math.abs(box.w);
    const h = Math.abs(box.h);
    return pointInRotatedRect(
      x,
      y,
      left - pad,
      top - pad,
      w + pad * 2,
      h + pad * 2,
      box.rotation ?? 0,
    );
  }
  if (hitPts?.length) {
    const b = pointsBounds(hitPts);
    if (!b) return false;
    return (
      x >= b.minX - pad &&
      x <= b.maxX + pad &&
      y >= b.minY - pad &&
      y <= b.maxY + pad
    );
  }
  return false;
}

/** True when (x,y) is on the image or near its transform chrome. */
export function hitsImageEditChrome(
  image: ImageElement,
  x: number,
  y: number,
  viewScale: number,
): boolean {
  if (hitTestImage(image, x, y)) return true;
  const pad = 40 / Math.max(viewScale, 0.001);
  return pointInRotatedRect(
    x,
    y,
    image.x - pad,
    image.y - pad,
    image.w + pad * 2,
    image.h + pad * 2,
    image.rotation ?? 0,
  );
}

function pointInRotatedRect(
  px: number,
  py: number,
  x: number,
  y: number,
  w: number,
  h: number,
  rotationRad: number,
): boolean {
  const cx = x + w / 2;
  const cy = y + h / 2;
  const dx = px - cx;
  const dy = py - cy;
  const c = Math.cos(-rotationRad);
  const s = Math.sin(-rotationRad);
  const lx = dx * c - dy * s;
  const ly = dx * s + dy * c;
  return Math.abs(lx) <= w / 2 && Math.abs(ly) <= h / 2;
}
