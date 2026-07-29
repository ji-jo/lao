import type { TextElement } from "@/model/types";
import { textFontStack } from "@/lib/google-fonts";
import { layoutText } from "@/engine/textLayout";

export type TextBox = { w: number; h: number; lines: string[] };

function measureLineWidth(
  ctx: CanvasRenderingContext2D,
  line: string,
  fontFamily: string,
  size: number,
  letterSpacing: number,
): number {
  if (letterSpacing) {
    return layoutText(line, textFontStack(fontFamily), size, letterSpacing).totalWidth;
  }
  return ctx.measureText(line).width;
}

/** Soft-wrap a paragraph to maxWidth (project px). Preserves explicit `\n`. */
export function wrapTextLines(
  ctx: CanvasRenderingContext2D,
  text: string,
  fontFamily: string,
  size: number,
  letterSpacing: number,
  maxWidth: number | undefined,
): string[] {
  const paragraphs = text.split("\n");
  if (maxWidth == null || !(maxWidth > 0)) return paragraphs;

  ctx.font = `${size}px ${textFontStack(fontFamily)}`;
  const out: string[] = [];

  for (const para of paragraphs) {
    if (!para) {
      out.push("");
      continue;
    }
    const words = para.split(/(\s+)/);
    let line = "";
    for (const word of words) {
      const next = line + word;
      const w = measureLineWidth(ctx, next, fontFamily, size, letterSpacing);
      if (line && w > maxWidth) {
        out.push(line.replace(/\s+$/, ""));
        line = word.replace(/^\s+/, "");
      } else {
        line = next;
      }
    }
    if (line || para === "") out.push(line);
  }
  return out.length ? out : [""];
}

export function measureTextBox(
  ctx: CanvasRenderingContext2D,
  text: TextElement,
): TextBox {
  const letterSpacing = text.letterSpacing ?? 0;
  ctx.font = `${text.size}px ${textFontStack(text.fontFamily)}`;
  const lines = wrapTextLines(
    ctx,
    text.text,
    text.fontFamily,
    text.size,
    letterSpacing,
    text.boxWidth,
  );
  let w = 0;
  for (const line of lines) {
    const lw = measureLineWidth(ctx, line, text.fontFamily, text.size, letterSpacing);
    if (lw > w) w = lw;
  }
  if (text.boxWidth != null && text.boxWidth > 0) w = text.boxWidth;
  const h = text.size * Math.max(1, lines.length);
  return { w, h, lines };
}

/** Axis-aligned bounds of a (possibly rotated) text box. */
export function textAABB(
  ctx: CanvasRenderingContext2D,
  text: TextElement,
): { minX: number; minY: number; maxX: number; maxY: number } {
  const { w, h } = measureTextBox(ctx, text);
  const rot = text.rotation ?? 0;
  if (!rot) {
    return { minX: text.x, minY: text.y, maxX: text.x + w, maxY: text.y + h };
  }
  const cx = text.x + w / 2;
  const cy = text.y + h / 2;
  const cos = Math.cos(rot);
  const sin = Math.sin(rot);
  const corners = [
    { x: -w / 2, y: -h / 2 },
    { x: w / 2, y: -h / 2 },
    { x: w / 2, y: h / 2 },
    { x: -w / 2, y: h / 2 },
  ];
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (const c of corners) {
    const x = cx + c.x * cos - c.y * sin;
    const y = cy + c.x * sin + c.y * cos;
    if (x < minX) minX = x;
    if (y < minY) minY = y;
    if (x > maxX) maxX = x;
    if (y > maxY) maxY = y;
  }
  return { minX, minY, maxX, maxY };
}

export function hitTextBox(
  ctx: CanvasRenderingContext2D,
  text: TextElement,
  x: number,
  y: number,
  pad = 4,
): boolean {
  const { w, h } = measureTextBox(ctx, text);
  const rot = text.rotation ?? 0;
  const cx = text.x + w / 2;
  const cy = text.y + h / 2;
  const dx = x - cx;
  const dy = y - cy;
  const cos = Math.cos(-rot);
  const sin = Math.sin(-rot);
  const lx = dx * cos - dy * sin + w / 2;
  const ly = dx * sin + dy * cos + h / 2;
  return lx >= -pad && lx <= w + pad && ly >= -pad && ly <= h + pad;
}

/** Scale + rotate text around a pivot (center-aware). */
export function transformTextElement(
  text: TextElement,
  box: { w: number; h: number },
  pivotX: number,
  pivotY: number,
  scale: number,
  rotationRad: number,
): TextElement {
  const rot0 = text.rotation ?? 0;
  const w0 = box.w;
  const h0 = box.h;
  const cx = text.x + w0 / 2;
  const cy = text.y + h0 / 2;

  let x = (cx - pivotX) * scale;
  let y = (cy - pivotY) * scale;
  const cos = Math.cos(rotationRad);
  const sin = Math.sin(rotationRad);
  const ncx = x * cos - y * sin + pivotX;
  const ncy = x * sin + y * cos + pivotY;

  const newSize = Math.max(0.5, text.size * scale);
  const newW = w0 * scale;
  const newH = h0 * scale;

  return {
    ...text,
    x: ncx - newW / 2,
    y: ncy - newH / 2,
    size: newSize,
    boxWidth:
      text.boxWidth != null && text.boxWidth > 0
        ? Math.max(8, text.boxWidth * scale)
        : text.boxWidth,
    rotation: rot0 + rotationRad,
  };
}
