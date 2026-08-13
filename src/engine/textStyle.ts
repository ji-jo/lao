import type { TextCase, TextElement, TextPathSettings } from "@/model/types";

export const DEFAULT_TEXT_PATH: TextPathSettings = {
  shape: "none",
  align: "left",
  position: "top",
  direction: "cw",
  offset: 0,
};

export function applyTextCase(raw: string, textCase: TextCase | undefined): string {
  if (!textCase || textCase === "none") return raw;
  if (textCase === "upper") return raw.toUpperCase();
  if (textCase === "lower") return raw.toLowerCase();
  // title / sentence: capitalize first letter of each word
  return raw.replace(/\w\S*/g, (w) => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase());
}

export function textDisplayString(text: TextElement): string {
  return applyTextCase(text.text, text.textCase);
}

export function textOpacity01(text: TextElement): number {
  const o = text.opacity;
  if (o == null) return 1;
  return Math.max(0, Math.min(1, o / 100));
}

export function blendToComposite(
  mode: TextElement["blendMode"],
): GlobalCompositeOperation {
  switch (mode) {
    case "multiply":
      return "multiply";
    case "screen":
      return "screen";
    case "overlay":
      return "overlay";
    case "darken":
      return "darken";
    case "lighten":
      return "lighten";
    default:
      return "source-over";
  }
}
