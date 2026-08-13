import type { Stroke } from "@/model/types";
import type { ShapeBox } from "@/engine/shapeGeometry";

export type { ShapeBox };

/** Stage fit: project → screen. */
export type StageFit = { scale: number; ox: number; oy: number };

export type TextEditSession = {
  id?: string;
  text: string;
  projectX: number;
  projectY: number;
  boxWidth?: number;
  rotation?: number;
};

export type TextCommitResult = {
  text: string;
  projectX: number;
  projectY: number;
  boxWidth?: number;
  rotation?: number;
};

export function textElementToLeaferProps(
  session: TextEditSession,
  tools: {
    fontFamily: string;
    textSize: number;
    color: string;
    textBold?: boolean;
    textItalic?: boolean;
    textAlign?: "left" | "center" | "right";
    letterSpacing: number;
    textOpacity?: number;
  },
) {
  return {
    text: session.text || "",
    x: session.projectX,
    y: session.projectY,
    width: session.boxWidth ?? 160,
    fontSize: tools.textSize,
    fontFamily: tools.fontFamily,
    fontWeight: tools.textBold ? 700 : 400,
    fontStyle: tools.textItalic ? "italic" : "normal",
    fill: tools.color,
    letterSpacing: tools.letterSpacing || 0,
    rotation: ((session.rotation ?? 0) * 180) / Math.PI,
    textAlign: tools.textAlign ?? "left",
    verticalAlign: "top" as const,
    opacity: (tools.textOpacity ?? 100) / 100,
    editable: true,
    draggable: true,
  };
}

export function leaferTextToCommit(node: {
  text?: string | number;
  x?: number;
  y?: number;
  width?: number;
  rotation?: number;
}): TextCommitResult | null {
  // Leafer TextEditor inserts ZWSP after soft newlines — strip before empty check.
  const text = String(node.text ?? "")
    .replace(/\u200b/g, "")
    .replace(/\r\n?/g, "\n")
    .trim();
  if (!text) return null;
  return {
    text: String(node.text ?? "")
      .replace(/\u200b/g, "")
      .replace(/\r\n?/g, "\n")
      .replace(/^\n+|\n+$/g, ""),
    projectX: Number(node.x) || 0,
    projectY: Number(node.y) || 0,
    boxWidth: Math.max(40, Number(node.width) || 160),
    rotation: (((Number(node.rotation) || 0) * Math.PI) / 180) || undefined,
  };
}

/** Shape-tool strokes remount as Leafer primitives for select/transform.
 * Requires a live `shapeBox` — path-tool edits clear it so node warps stick. */
export function canEditShapeWithLeafer(stroke: Stroke): boolean {
  return !!stroke.shapeKind && !!stroke.shapeBox;
}

/**
 * Path-tool point edits leave `shapeBox` stale. Leafer select remounts from that
 * box and rebakes the original geometry — snap-back. Detach parametric editing;
 * keep `shapeKind: "arrow"` so the canvas tip still draws without a box.
 */
export function extrasAfterPathEdit(
  stroke: Stroke,
): { shapeBox?: undefined; shapeKind?: undefined } | undefined {
  if (!stroke.shapeKind) return undefined;
  if (stroke.shapeKind === "arrow") {
    return { shapeBox: undefined };
  }
  return { shapeBox: undefined, shapeKind: undefined };
}

/** Closed shapes use an AABB Leafer Rect proxy for transform. */
export function canProxyClosedShape(stroke: Stroke): boolean {
  return !!stroke.closed && stroke.points.length > 2;
}

export function strokeAABB(stroke: Stroke): {
  x: number;
  y: number;
  w: number;
  h: number;
} {
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (const p of stroke.points) {
    if (p.x < minX) minX = p.x;
    if (p.y < minY) minY = p.y;
    if (p.x > maxX) maxX = p.x;
    if (p.y > maxY) maxY = p.y;
  }
  if (!Number.isFinite(minX)) return { x: 0, y: 0, w: 1, h: 1 };
  return {
    x: minX,
    y: minY,
    w: Math.max(1, maxX - minX),
    h: Math.max(1, maxY - minY),
  };
}

export function shapeBoxFromStroke(stroke: Stroke): ShapeBox {
  if (stroke.shapeBox) return { ...stroke.shapeBox };
  const box = strokeAABB(stroke);
  return { x: box.x, y: box.y, w: box.w, h: box.h, rotation: 0 };
}

/** Editor rotates around center — Leafer x/y is the box center, shapeBox is top-left. */
export function shapeBoxToLeaferCenter(box: {
  x: number;
  y: number;
  w: number;
  h: number;
}): { x: number; y: number } {
  return { x: box.x + box.w / 2, y: box.y + box.h / 2 };
}

export function leaferCenterToShapeBox(geo: {
  x: number;
  y: number;
  w: number;
  h: number;
  rotationDeg: number;
}): { x: number; y: number; w: number; h: number; rotationDeg: number } {
  return {
    x: geo.x - geo.w / 2,
    y: geo.y - geo.h / 2,
    w: geo.w,
    h: geo.h,
    rotationDeg: geo.rotationDeg,
  };
}

/** Leafer Direction9: TL T TR R BR B BL L center. */
export type ResizePinAlign =
  | "top-left"
  | "top"
  | "top-right"
  | "left"
  | "center"
  | "right"
  | "bottom-left"
  | "bottom"
  | "bottom-right";

/** Opposite edge/corner of a resize handle. Alt / around:center pins the middle. */
export function oppositeResizeAlign(
  direction: number,
  fromCenter: boolean,
): ResizePinAlign {
  if (fromCenter || direction === 8) return "center";
  switch (direction) {
    case 0:
      return "bottom-right";
    case 1:
      return "bottom";
    case 2:
      return "bottom-left";
    case 3:
      return "left";
    case 4:
      return "top-left";
    case 5:
      return "top";
    case 6:
      return "top-right";
    case 7:
      return "right";
    default:
      return "center";
  }
}

function pinOffset(
  align: ResizePinAlign,
  w: number,
  h: number,
): { x: number; y: number } {
  const nx = align.includes("left") ? -0.5 : align.includes("right") ? 0.5 : 0;
  const ny = align.includes("top") ? -0.5 : align.includes("bottom") ? 0.5 : 0;
  return { x: nx * w, y: ny * h };
}

/**
 * New unrotated top-left box after a size change, keeping `align` fixed in
 * world space (works while rotated). `rotation` is radians.
 */
export function resizeBoxKeepingAlign(
  box: { x: number; y: number; w: number; h: number; rotation?: number },
  nextW: number,
  nextH: number,
  align: ResizePinAlign,
): { x: number; y: number; w: number; h: number; rotation?: number } {
  const w = Math.max(1, nextW);
  const h = Math.max(1, nextH);
  const rot = box.rotation ?? 0;
  const cx = box.x + box.w / 2;
  const cy = box.y + box.h / 2;
  const cos = Math.cos(rot);
  const sin = Math.sin(rot);
  const pin0 = pinOffset(align, box.w, box.h);
  const pinWorldX = cx + pin0.x * cos - pin0.y * sin;
  const pinWorldY = cy + pin0.x * sin + pin0.y * cos;
  const pin1 = pinOffset(align, w, h);
  const cx2 = pinWorldX - (pin1.x * cos - pin1.y * sin);
  const cy2 = pinWorldY - (pin1.x * sin + pin1.y * cos);
  return {
    x: cx2 - w / 2,
    y: cy2 - h / 2,
    w,
    h,
    rotation: box.rotation,
  };
}

export function applyFitToGroup(
  group: { x?: number; y?: number; scaleX?: number; scaleY?: number },
  fit: StageFit,
) {
  const s = fit.scale > 0 ? fit.scale : 1;
  group.x = fit.ox;
  group.y = fit.oy;
  group.scaleX = s;
  group.scaleY = s;
}

export type TextElementClipLike = Pick<
  import("@/model/types").TextElement,
  "clip"
>;
