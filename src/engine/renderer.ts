import { getStroke } from "perfect-freehand";
import type { Stroke, StrokePoint, TextElement } from "@/model/types";
import { textFontStack } from "@/lib/google-fonts";
import { layoutText } from "@/engine/textLayout";
import { measureTextBox } from "@/engine/textGeometry";
import { layoutTextOnPath } from "@/engine/textPath";
import {
  blendToComposite,
  textDisplayString,
  textOpacity01,
} from "@/engine/textStyle";
import { textCanvasFont, textUsesSyntheticItalic, SYNTHETIC_ITALIC_SKEW, warmTextFont, fillTextStyled } from "@/engine/textFont";
import { paintPackBrush } from "@/engine/brushStyles";
import { expandPolygonOutward, fillPolygonExpandDistance } from "@/engine/pathEdit";
import { flattenBezierNodes } from "@/lib/bezier";
import {
  arrowHeadCorners,
  arrowTipReached,
} from "@/engine/shapeGeometry";

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
  /** if true, render erasers as black masks instead of using destination-out */
  eraseAsMask?: boolean;
  /** fired when a text face/weight finishes loading — stage should dirty */
  onFontReady?: () => void;
  /** live pointer stroke — use cheaper draft sampling (export still `full`) */
  live?: boolean;
}

/** perfect-freehand options for eraser / fallback ribbons */
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
    const color = opts.colorOverride ?? stroke.color;
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
    // Pen tool is a uniform vector stroke. Ink / marker / pack brushes keep
    // the pressure ribbon after Path (A) / Select (V) bezier edits.
    const ribbonPts =
      livePoints && livePoints.length > 1
        ? livePoints
        : (() => {
            const displacedPts = opts.displaced?.get(stroke.id);
            if (displacedPts && displacedPts.length > 1) return displacedPts;
            if (points.length > 1) return points;
            return flattenBezierNodes(
              nodes!,
              stroke.closed,
              undefined,
              stroke.points,
            );
          })();
    // Pen tool is a uniform vector stroke. Ink / marker / pack brushes must
    // keep the pressure ribbon after Path (A) / Select (V) bezier edits.
    const asRibbon = stroke.brush !== "pen" || !!stroke.p5Brush;
    if (asRibbon && ribbonPts.length > 0) {
      if (stroke.brush === "eraser") {
        if (!opts.eraseAsMask) {
          ctx.globalCompositeOperation = "destination-out";
        }
        ctx.fillStyle = "#000";
        ctx.fill(outlinePath(ribbonPts, stroke, opts.quality));
        ctx.restore();
        return;
      }
      paintPackBrush(ctx, stroke, ribbonPts, color, opts.quality, opts.live);
      ctx.restore();
      return;
    }
    ctx.strokeStyle = color;
    ctx.lineWidth = stroke.size;
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
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
    const fillPts = stroke.shapeKind
      ? points
      : expandPolygonOutward(points, fillPolygonExpandDistance(stroke.size));
    ctx.beginPath();
    ctx.moveTo(fillPts[0].x, fillPts[0].y);
    for (let i = 1; i < fillPts.length; i++) {
      ctx.lineTo(fillPts[i].x, fillPts[i].y);
    }
    ctx.closePath();
    ctx.fillStyle = stroke.fillColor;
    ctx.globalAlpha = 1;
    ctx.fill();
  }

  if (stroke.brush === "eraser") {
    if (!opts.eraseAsMask) {
      ctx.globalCompositeOperation = "destination-out";
    }
    ctx.fillStyle = "#000";
    if (points.length === 1) {
      const p = points[0];
      ctx.beginPath();
      ctx.arc(p.x, p.y, (stroke.size / 2) * Math.max(p.pressure, 0.3) * 2.5, 0, Math.PI * 2);
      ctx.fill();
    } else {
      const path = outlinePath(points, stroke, opts.quality);
      ctx.fill(path);
    }
    ctx.restore();
    return;
  }

  paintPackBrush(
    ctx,
    stroke,
    points,
    opts.colorOverride ?? stroke.color,
    opts.quality,
    opts.live,
  );

  // Arrow head is a filled triangle (not Leafer endArrow — plugin not installed).
  if (stroke.shapeKind === "arrow" && points.length >= 2) {
    const box = stroke.shapeBox;
    const x0 = box ? box.x : points[0]!.x;
    const y0 = box ? box.y : points[0]!.y;
    const x1 = box ? box.x + box.w : points[points.length - 1]!.x;
    const y1 = box ? box.y + box.h : points[points.length - 1]!.y;
    const tol = Math.max(6, stroke.size * 1.5);
    if (arrowTipReached(points, x1, y1, tol)) {
      const head = arrowHeadCorners(x0, y0, x1, y1, stroke.size);
      if (head) {
        ctx.beginPath();
        ctx.moveTo(head[0]!.x, head[0]!.y);
        ctx.lineTo(head[1]!.x, head[1]!.y);
        ctx.lineTo(head[2]!.x, head[2]!.y);
        ctx.closePath();
        ctx.fillStyle = opts.colorOverride ?? stroke.color;
        ctx.globalAlpha = 1;
        ctx.fill();
      }
    }
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
    warmTextFont(text, opts.onFontReady ? { onReady: opts.onFontReady } : undefined);
    ctx.font = textCanvasFont(text);
    ctx.fillStyle = opts.colorOverride ?? text.color;
    ctx.textBaseline = "top";
    ctx.globalAlpha = textOpacity01(text);
    ctx.globalCompositeOperation = blendToComposite(text.blendMode);

    const display = { ...text, text: textDisplayString(text) };
    const { w, h, lines } = measureTextBox(ctx, display);
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

    if (text.backgroundColor) {
      ctx.save();
      ctx.globalCompositeOperation = "source-over";
      ctx.fillStyle = text.backgroundColor;
      ctx.fillRect(-4, -4, w + 8, h + 8);
      ctx.restore();
      ctx.fillStyle = opts.colorOverride ?? text.color;
    }

    if (text.shadow) {
      ctx.shadowColor = text.shadow.color;
      ctx.shadowBlur = text.shadow.blur;
      ctx.shadowOffsetX = text.shadow.offsetX;
      ctx.shadowOffsetY = text.shadow.offsetY;
    }

    const synthItalic = textUsesSyntheticItalic(text.italic);

    const pathGlyphs = layoutTextOnPath(display, w, h);
    if (pathGlyphs) {
      ctx.textAlign = "center";
      ctx.textBaseline = "alphabetic";
      for (const g of pathGlyphs) {
        ctx.save();
        ctx.translate(g.x, g.y);
        ctx.rotate(g.angle);
        if (synthItalic) ctx.transform(1, 0, SYNTHETIC_ITALIC_SKEW, 1, 0, 0);
        fillTextStyled(ctx, g.char, 0, 0, text.size, text.bold);
        ctx.restore();
      }
      ctx.restore();
      continue;
    }

    ctx.textAlign = "left";
    ctx.textBaseline = "top";
    if (synthItalic) {
      // Shear around the top-left; nudge so the box stays roughly in place
      ctx.transform(1, 0, SYNTHETIC_ITALIC_SKEW, 1, -SYNTHETIC_ITALIC_SKEW * (h * 0.35), 0);
    }
    const letterSpacing = text.letterSpacing ?? 0;
    const align = text.align ?? "left";
    let y = 0;
    for (const line of lines) {
      let lineX = 0;
      const lineWidth = letterSpacing
        ? layoutText(
            line,
            textFontStack(text.fontFamily),
            text.size,
            letterSpacing,
          ).totalWidth
        : ctx.measureText(line).width;
      if (align === "center") lineX = (w - lineWidth) / 2;
      else if (align === "right") lineX = w - lineWidth;

      if (letterSpacing) {
        const layout = layoutText(
          line,
          textFontStack(text.fontFamily),
          text.size,
          letterSpacing,
        );
        for (const glyph of layout.glyphs) {
          fillTextStyled(ctx, glyph.char, lineX + glyph.x, y, text.size, text.bold);
        }
      } else {
        fillTextStyled(ctx, line, lineX, y, text.size, text.bold);
      }

      if (text.underline || text.strikethrough) {
        ctx.save();
        ctx.shadowColor = "transparent";
        ctx.strokeStyle = opts.colorOverride ?? text.color;
        ctx.lineWidth = Math.max(1, text.size * 0.06);
        if (text.underline) {
          const uy = y + text.size * 0.92;
          ctx.beginPath();
          ctx.moveTo(lineX, uy);
          ctx.lineTo(lineX + lineWidth, uy);
          ctx.stroke();
        }
        if (text.strikethrough) {
          const sy = y + text.size * 0.5;
          ctx.beginPath();
          ctx.moveTo(lineX, sy);
          ctx.lineTo(lineX + lineWidth, sy);
          ctx.stroke();
        }
        ctx.restore();
      }
      y += text.size;
    }
    ctx.restore();
  }
}
