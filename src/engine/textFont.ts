import type { TextElement } from "@/model/types";
import { textFontStack } from "@/lib/google-fonts";

/** Upright canvas font — italic/bold use synthetic drawing (reliable across faces). */
export function textCanvasFont(
  text: Pick<TextElement, "fontFamily" | "size" | "bold" | "italic">,
): string {
  // Still request 700 so faces that honor canvas weight look right; synthetic
  // stroke covers Geist / variable faces that silently stay at 400.
  const weight = text.bold ? "700 " : "400 ";
  const size = Math.max(0.5, text.size);
  // Never request CSS `italic` here — many variable faces (Geist) have no italic
  // axis, and Canvas2D silently falls back to regular. Skew instead.
  return `normal ${weight}${size}px ${textFontStack(text.fontFamily)}`;
}

/** Shear factor for fake-italic (negative = lean right). */
export const SYNTHETIC_ITALIC_SKEW = -0.28;

/**
 * Stroke width as a fraction of font size for faux-bold.
 * Canvas2D often ignores weight on variable fonts until a later paint —
 * stroke always thickens immediately (same reliability story as italic skew).
 */
export const SYNTHETIC_BOLD_STROKE = 0.055;

export function textUsesSyntheticItalic(italic: boolean | undefined): boolean {
  return !!italic;
}

export function textUsesSyntheticBold(bold: boolean | undefined): boolean {
  return !!bold;
}

/** Fill (+ optional faux-bold stroke) a text run at (x, y). */
export function fillTextStyled(
  ctx: CanvasRenderingContext2D,
  text: string,
  x: number,
  y: number,
  size: number,
  bold: boolean | undefined,
): void {
  if (textUsesSyntheticBold(bold)) {
    ctx.save();
    // Kill drop-shadow on the stroke pass so it doesn't double-bloom.
    ctx.shadowColor = "transparent";
    ctx.lineWidth = Math.max(0.75, size * SYNTHETIC_BOLD_STROKE);
    ctx.lineJoin = "round";
    ctx.miterLimit = 2;
    ctx.strokeStyle = ctx.fillStyle;
    ctx.strokeText(text, x, y);
    ctx.restore();
  }
  ctx.fillText(text, x, y);
}

type WarmOpts = {
  /** Called once the face (or weight) is ready — use to dirty the stage. */
  onReady?: () => void;
};

const warmed = new Set<string>();

/** Warm the face so the first bold/size paint isn't missing glyphs. */
export function warmTextFont(
  text: Pick<TextElement, "fontFamily" | "size" | "bold">,
  opts?: WarmOpts,
): void {
  if (typeof document === "undefined" || !document.fonts?.load) return;
  const base = { ...text, italic: false as const };
  const specs = [
    textCanvasFont({ ...base, bold: false }),
    textCanvasFont({ ...base, bold: true }),
  ];
  for (const spec of specs) {
    if (warmed.has(spec)) continue;
    warmed.add(spec);
    void document.fonts.load(spec).then(() => {
      opts?.onReady?.();
    });
  }
}
