import { Ellipse, Line, Polygon, Rect } from "leafer-ui";
import type { Stroke } from "@/model/types";
import {
  bakeShapeGeometry,
  type ShapeBakeResult,
} from "@/engine/shapeGeometry";
import {
  shapeBoxFromStroke,
  shapeBoxToLeaferCenter,
  leaferCenterToShapeBox,
} from "@/components/stage/leaferBridge";
import type { ShapeToolId } from "@/state/tools";

export type EditableShapeProxy = Rect | Ellipse | Line | Polygon;

/** Editor rotates around center; x/y must be the box center so bake matches canvas. */
const CENTER_XFORM = { origin: "center" as const, around: "center" as const };

/** Mount a Leafer primitive that matches a shape-tool stroke. */
export function makeEditableShapeFromStroke(
  stroke: Stroke,
): EditableShapeProxy | null {
  const kind = stroke.shapeKind;
  if (!kind) return null;
  const box = shapeBoxFromStroke(stroke);
  const rotDeg = ((box.rotation ?? 0) * 180) / Math.PI;
  const strokeColor = stroke.color;
  const strokeWidth = Math.max(0.5, stroke.size);

  if (kind === "circle") {
    // Canvas paints the ink; Leafer is transform chrome only (opacity ~0).
    const c = shapeBoxToLeaferCenter(box);
    return new Ellipse({
      x: c.x,
      y: c.y,
      width: Math.max(1, box.w),
      height: Math.max(1, box.h),
      fill: "transparent",
      stroke: strokeColor,
      strokeWidth: Math.max(strokeWidth, 8),
      rotation: rotDeg,
      opacity: 0.001,
      editable: true,
      hittable: true,
      ...CENTER_XFORM,
    });
  }
  if (kind === "diamond") {
    const rw = Math.max(1, box.w);
    const rh = Math.max(1, box.h);
    const c = shapeBoxToLeaferCenter(box);
    return new Polygon({
      x: c.x,
      y: c.y,
      width: rw,
      height: rh,
      fill: "transparent",
      stroke: strokeColor,
      strokeWidth: Math.max(strokeWidth, 8),
      rotation: rotDeg,
      opacity: 0.001,
      points: [
        { x: rw / 2, y: 0 },
        { x: rw, y: rh / 2 },
        { x: rw / 2, y: rh },
        { x: 0, y: rh / 2 },
      ],
      editable: true,
      hittable: true,
      ...CENTER_XFORM,
    });
  }
  if (kind === "line" || kind === "arrow") {
    // Leafer Line encodes direction as width + rotation via `toPoint`.
    // Never pass `rotation: 0` afterward — that wipes the angle.
    // Canvas paints the ink (and arrow head); Leafer is transform chrome only.
    const dx = box.w;
    const dy = box.h;
    const len = Math.hypot(dx, dy);
    const extra = (box.rotation ?? 0) * (180 / Math.PI);
    const line = new Line({
      x: box.x,
      y: box.y,
      // Visible enough for editor hit bounds — fully transparent collapses
      // width to 0 on select and bakes the stroke into a dot.
      stroke: strokeColor,
      strokeWidth: Math.max(strokeWidth, 8),
      opacity: 0.001,
      editable: true,
      hittable: true,
    });
    if (len < 1e-6) {
      line.width = 1;
      line.rotation = 0;
    } else if (extra) {
      const ang = (Math.atan2(dy, dx) * 180) / Math.PI + extra;
      line.width = len;
      line.rotation = ang;
    } else {
      line.toPoint = { x: dx, y: dy };
    }
    return line;
  }
  const c = shapeBoxToLeaferCenter(box);
  return new Rect({
    x: c.x,
    y: c.y,
    width: Math.max(1, box.w),
    height: Math.max(1, box.h),
    fill: "transparent",
    stroke: strokeColor,
    strokeWidth: Math.max(strokeWidth, 8),
    rotation: rotDeg,
    opacity: 0.001,
    cornerRadius: Math.max(0, stroke.cornerRadius ?? 0),
    editable: true,
    hittable: true,
    ...CENTER_XFORM,
  });
}

/** Bake Leafer node transform back into stroke points + shapeBox. */
export function bakeEditableShape(
  kind: ShapeToolId,
  node: EditableShapeProxy,
  corners?: {
    cornerRadius?: number;
    squircle?: boolean;
    cornerSmoothing?: number;
  },
): ShapeBakeResult {
  const rotDeg = Number(node.rotation) || 0;
  const sx = Math.abs(Number((node as { scaleX?: number }).scaleX) || 1);
  const sy = Math.abs(Number((node as { scaleY?: number }).scaleY) || 1);

  if (kind === "line" || kind === "arrow") {
    const line = node as Line;
    const x0 = Number(line.x) || 0;
    const y0 = Number(line.y) || 0;
    // toPoint getter already applies rotation — do not also pass rotationDeg
    // into bakeShapeGeometry (that double-rotates and collapses diagonals).
    const len = (Number(line.width) || 0) * ((sx + sy) / 2);
    const rad = (rotDeg * Math.PI) / 180;
    return bakeShapeGeometry(kind, {
      x: x0,
      y: y0,
      w: 0,
      h: 0,
      dx: Math.cos(rad) * len,
      dy: Math.sin(rad) * len,
      rotationDeg: 0,
    });
  }

  return bakeShapeGeometry(kind, {
    ...leaferCenterToShapeBox({
      x: Number(node.x) || 0,
      y: Number(node.y) || 0,
      w: Math.max(1, (Number(node.width) || 1) * sx),
      h: Math.max(1, (Number(node.height) || 1) * sy),
      rotationDeg: rotDeg,
    }),
    cornerRadius: corners?.cornerRadius,
    squircle: corners?.squircle,
    cornerSmoothing: corners?.cornerSmoothing,
  });
}
