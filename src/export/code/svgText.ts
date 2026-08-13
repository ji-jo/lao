import type { TextElement } from "@/model/types";
import { textFontStack } from "@/lib/google-fonts";
import { layoutText } from "@/engine/textLayout";
import { measureTextBox } from "@/engine/textGeometry";
import { textDisplayString, textOpacity01 } from "@/engine/textStyle";
import { tag } from "@/export/code/svgDoc";

function googleFontImport(family: string): string | null {
  if (!family || ["Geist", "Geist Mono", "Inter"].includes(family)) return null;
  const param = family.trim().replace(/\s+/g, "+");
  return `@import url('https://fonts.googleapis.com/css2?family=${param}:wght@400;700&display=swap');`;
}

export function collectFontImports(texts: TextElement[]): string {
  const families = new Set<string>();
  for (const t of texts) {
    if (t.fontFamily) families.add(t.fontFamily);
  }
  const imports: string[] = [];
  for (const f of families) {
    const css = googleFontImport(f);
    if (css) imports.push(css);
  }
  return imports.join("\n");
}

function getMeasureCtx(): CanvasRenderingContext2D | null {
  if (typeof document === "undefined") return null;
  const canvas = document.createElement("canvas");
  return canvas.getContext("2d");
}

export function textElementToSvg(
  text: TextElement,
  content?: string,
  ctx?: CanvasRenderingContext2D | null,
): string {
  const display = content ?? textDisplayString(text);
  if (!display) return "";

  const measureCtx = ctx ?? getMeasureCtx();
  if (!measureCtx) {
    return tag("text", {
      x: text.x,
      y: text.y + text.size,
      fill: text.color,
      "font-family": textFontStack(text.fontFamily),
      "font-size": text.size,
    }, escapeXml(display));
  }

  const displayEl = content ? { ...text, text: content } : { ...text, text: display };
  const { w, h, lines } = measureTextBox(measureCtx, displayEl);
  const opacity = textOpacity01(text);
  const family = textFontStack(text.fontFamily);
  const align = text.align ?? "left";
  const anchor =
    align === "center" ? "middle" : align === "right" ? "end" : "start";
  const rot = text.rotation ?? 0;
  const transform =
    rot !== 0
      ? `translate(${text.x} ${text.y}) rotate(${(rot * 180) / Math.PI})`
      : undefined;

  const letterSpacing = text.letterSpacing ?? 0;
  let y = rot !== 0 ? 0 : text.y;
  const tspans: string[] = [];
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]!;
    let lineX = rot !== 0 ? -w / 2 : text.x;
    const lineWidth = letterSpacing
      ? layoutText(line, family, text.size, letterSpacing).totalWidth
      : measureCtx.measureText(line).width;
    if (align === "center") lineX += (w - lineWidth) / 2;
    else if (align === "right") lineX += w - lineWidth;

    if (letterSpacing) {
      const layout = layoutText(line, family, text.size, letterSpacing);
      for (const glyph of layout.glyphs) {
        tspans.push(
          tag("tspan", {
            x: lineX + glyph.x,
            y: y + text.size,
            dy: i === 0 && tspans.length === 0 ? 0 : undefined,
          }, glyph.char),
        );
      }
    } else {
      tspans.push(
        tag("tspan", {
          x: lineX,
          y: y + text.size,
          dy: i === 0 ? 0 : text.size * 1.2,
        }, line),
      );
    }
    y += text.size * 1.2;
  }

  return tag("text", {
    x: rot !== 0 ? -w / 2 : undefined,
    y: rot !== 0 ? -h / 2 : undefined,
    fill: text.color,
    "font-family": family,
    "font-size": text.size,
    "font-weight": text.bold ? "700" : "400",
    "font-style": text.italic ? "italic" : "normal",
    "text-anchor": anchor,
    opacity: opacity < 1 ? opacity : undefined,
    transform,
  }, tspans.join(""));
}

function escapeXml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}
