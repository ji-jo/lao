import { getStroke } from "perfect-freehand";
import type { Stroke, StrokePoint } from "@/model/types";

export type RenderQuality = "draft" | "full";

export interface RenderOptions {
  quality: RenderQuality;
  /** optional per-frame displaced points (from the boil engine) keyed by stroke id */
  displaced?: Map<string, StrokePoint[]>;
  /** force every stroke to this color (onion-skin ghosts) */
  colorOverride?: string;
}

/** perfect-freehand options per brush — thinning drives the pressure taper */
function freehandOptions(stroke: Stroke, quality: RenderQuality) {
  const base = {
    size: stroke.size,
    simulatePressure: false,
    last: true,
  };
  switch (stroke.brush) {
    case "ink":
      return { ...base, thinning: 0.65, smoothing: 0.5, streamline: quality === "draft" ? 0.3 : 0.5 };
    case "pencil":
      return { ...base, size: Math.max(stroke.size * 0.5, 1), thinning: 0.3, smoothing: 0.4, streamline: 0.3 };
    case "marker":
      return { ...base, size: stroke.size * 2, thinning: 0.1, smoothing: 0.6, streamline: 0.5 };
    case "eraser":
      return { ...base, size: stroke.size * 2.5, thinning: 0.1, smoothing: 0.5, streamline: 0.4 };
  }
}

function outlinePath(points: StrokePoint[], stroke: Stroke, quality: RenderQuality): Path2D {
  const outline = getStroke(
    points.map((p) => [p.x, p.y, p.pressure]),
    freehandOptions(stroke, quality),
  );
  const path = new Path2D();
  if (outline.length < 2) return path;
  path.moveTo(outline[0][0], outline[0][1]);
  for (let i = 1; i < outline.length; i++) path.lineTo(outline[i][0], outline[i][1]);
  path.closePath();
  return path;
}

export function renderStroke(
  ctx: CanvasRenderingContext2D,
  stroke: Stroke,
  opts: RenderOptions,
  livePoints?: StrokePoint[],
) {
  const points = livePoints ?? opts.displaced?.get(stroke.id) ?? stroke.points;
  if (points.length === 0) return;

  ctx.save();
  if (stroke.brush === "eraser") {
    ctx.globalCompositeOperation = "destination-out";
    ctx.fillStyle = "#000";
  } else {
    ctx.fillStyle = opts.colorOverride ?? stroke.color;
    if (stroke.brush === "marker") ctx.globalAlpha = 0.55;
    if (stroke.brush === "pencil") ctx.globalAlpha = 0.9;
  }

  if (points.length === 1) {
    // dot tap
    const p = points[0];
    ctx.beginPath();
    ctx.arc(p.x, p.y, (stroke.size / 2) * Math.max(p.pressure, 0.3), 0, Math.PI * 2);
    ctx.fill();
  } else {
    ctx.fill(outlinePath(points, stroke, opts.quality));
  }
  ctx.restore();
}

export function renderStrokes(
  ctx: CanvasRenderingContext2D,
  strokes: Stroke[],
  opts: RenderOptions,
) {
  for (const stroke of strokes) renderStroke(ctx, stroke, opts);
}
