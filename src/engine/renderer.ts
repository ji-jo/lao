import { getStroke } from "perfect-freehand";
import type { Stroke, StrokePoint, TextElement } from "@/model/types";
import { textFontStack } from "@/lib/google-fonts";
import { grainTile } from "@/engine/grain";
import { layoutText } from "@/engine/textLayout";
import { measureTextBox } from "@/engine/textGeometry";

export type RenderQuality = "draft" | "full";

export interface RenderOptions {
  quality: RenderQuality;
  /** optional per-frame displaced points (from the boil engine) keyed by stroke id */
  displaced?: Map<string, StrokePoint[]>;
  /** optional per-frame displaced bezier nodes keyed by stroke id */
  displacedBezier?: Map<string, import("@/model/types").BezierNode[]>;
  /** force every stroke to this color (onion-skin ghosts) */
  colorOverride?: string;
  /** optional id to skip rendering */
  skipId?: string;
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
    case "pen":
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

function applyGrain(
  ctx: CanvasRenderingContext2D,
  path: Path2D,
  stroke: Stroke,
  quality: RenderQuality,
) {
  ctx.save();
  ctx.clip(path);
  const tile = grainTile(stroke.seed);
  const pattern = ctx.createPattern(tile, "repeat");
  if (!pattern) {
    ctx.restore();
    return;
  }
  ctx.fillStyle = pattern;
  ctx.globalCompositeOperation = "multiply";
  ctx.globalAlpha = quality === "draft" ? 0.28 : 0.38;
  ctx.fill(path);
  ctx.restore();
}

export function renderStroke(
  ctx: CanvasRenderingContext2D,
  stroke: Stroke,
  opts: RenderOptions,
  livePoints?: StrokePoint[],
) {
  const points = livePoints ?? opts.displaced?.get(stroke.id) ?? stroke.points;
  const nodes = opts.displacedBezier?.get(stroke.id) ?? stroke.bezierNodes;
  const hasBezier = nodes && nodes.length > 0;
  if (points.length === 0 && !hasBezier) return;

  ctx.save();
  if (hasBezier) {
    ctx.strokeStyle = opts.colorOverride ?? stroke.color;
    ctx.lineWidth = stroke.size;
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
    
    const path = new Path2D();
    path.moveTo(nodes![0].x, nodes![0].y);
    for (let i = 0; i < nodes!.length - 1; i++) {
      const p1 = nodes![i].handleOut ?? { x: nodes![i].x, y: nodes![i].y };
      const p2 = nodes![i + 1].handleIn ?? { x: nodes![i + 1].x, y: nodes![i + 1].y };
      const p3 = { x: nodes![i + 1].x, y: nodes![i + 1].y };
      path.bezierCurveTo(p1.x, p1.y, p2.x, p2.y, p3.x, p3.y);
    }
    if (stroke.closed && nodes!.length > 1) {
      const p1 = nodes![nodes!.length - 1].handleOut ?? { x: nodes![nodes!.length - 1].x, y: nodes![nodes!.length - 1].y };
      const p2 = nodes![0].handleIn ?? { x: nodes![0].x, y: nodes![0].y };
      const p3 = { x: nodes![0].x, y: nodes![0].y };
      path.bezierCurveTo(p1.x, p1.y, p2.x, p2.y, p3.x, p3.y);
      path.closePath();
    }
    if (stroke.closed && stroke.fillColor && stroke.brush !== "eraser") {
      ctx.fillStyle = stroke.fillColor;
      ctx.fill(path);
    }
    ctx.stroke(path);
    ctx.restore();
    return;
  }

  // Closed shape fill under the ink ribbon (rect / diamond / circle pack).
  if (
    stroke.closed &&
    stroke.fillColor &&
    stroke.brush !== "eraser" &&
    points.length > 2
  ) {
    ctx.beginPath();
    ctx.moveTo(points[0].x, points[0].y);
    for (let i = 1; i < points.length; i++) {
      ctx.lineTo(points[i].x, points[i].y);
    }
    ctx.closePath();
    ctx.fillStyle = stroke.fillColor;
    ctx.globalAlpha = 1;
    ctx.fill();
  }

  if (stroke.brush === "eraser") {
    ctx.globalCompositeOperation = "destination-out";
    ctx.fillStyle = "#000";
  } else {
    ctx.fillStyle = opts.colorOverride ?? stroke.color;
    if (stroke.brush === "marker") ctx.globalAlpha = 0.55;
    if (stroke.brush === "pen") ctx.globalAlpha = 0.9;
  }

  if (points.length === 1) {
    // dot tap
    const p = points[0];
    ctx.beginPath();
    ctx.arc(p.x, p.y, (stroke.size / 2) * Math.max(p.pressure, 0.3), 0, Math.PI * 2);
    ctx.fill();
  } else {
    const path = outlinePath(points, stroke, opts.quality);
    ctx.fill(path);
    if (stroke.grain && stroke.brush !== "eraser") applyGrain(ctx, path, stroke, opts.quality);
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

export function renderTexts(
  ctx: CanvasRenderingContext2D,
  texts: TextElement[],
  opts: RenderOptions,
) {
  for (const text of texts) {
    if (opts.skipId && text.id === opts.skipId) continue;
    ctx.save();
    ctx.font = `${text.size}px ${textFontStack(text.fontFamily)}`;
    ctx.fillStyle = opts.colorOverride ?? text.color;
    ctx.textBaseline = "top";

    const { w, h, lines } = measureTextBox(ctx, text);
    const rot = text.rotation ?? 0;
    if (rot) {
      const cx = text.x + w / 2;
      const cy = text.y + h / 2;
      ctx.translate(cx, cy);
      ctx.rotate(rot);
      ctx.translate(-w / 2, -h / 2);
    } else {
      ctx.translate(text.x, text.y);
    }

    const letterSpacing = text.letterSpacing ?? 0;
    let y = 0;
    for (const line of lines) {
      if (letterSpacing) {
        const layout = layoutText(
          line,
          textFontStack(text.fontFamily),
          text.size,
          letterSpacing,
        );
        for (const glyph of layout.glyphs) {
          ctx.fillText(glyph.char, glyph.x, y);
        }
      } else {
        ctx.fillText(line, 0, y);
      }
      y += text.size;
    }
    ctx.restore();
  }
}
