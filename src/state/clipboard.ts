import { celForLayer } from "@/engine/layerCel";
import {
  type ImageElement,
  type Project,
  type Stroke,
  type TextAlign,
  type TextBlendMode,
  type TextCase,
  type TextElement,
  type TextPathSettings,
  type TextShadow,
} from "@/model/types";

/** In-app art clipboard — survives frame/layer switches, not reloads. */
export interface ArtClipboard {
  strokes: Stroke[];
  texts: TextElement[];
  images: ImageElement[];
}

let clip: ArtClipboard = emptyClipboard();

function emptyClipboard(): ArtClipboard {
  return { strokes: [], texts: [], images: [] };
}

function snapshotStroke(s: Stroke): Stroke {
  return {
    ...s,
    points: s.points.map((p) => ({ ...p })),
    bezierNodes: s.bezierNodes?.map((n) => ({
      ...n,
      handleIn: n.handleIn ? { ...n.handleIn } : undefined,
      handleOut: n.handleOut ? { ...n.handleOut } : undefined,
    })),
    shapeBox: s.shapeBox ? { ...s.shapeBox } : undefined,
    clip: s.clip ? { ...s.clip } : undefined,
  };
}

function snapshotText(t: TextElement): TextElement {
  return {
    ...t,
    path: t.path ? { ...t.path } : t.path,
    shadow: t.shadow ? { ...t.shadow } : t.shadow,
  };
}

function snapshotImage(im: ImageElement): ImageElement {
  return { ...im, clip: im.clip ? { ...im.clip } : im.clip };
}

export function collectArtByIds(
  project: Project,
  frameIndex: number,
  ids: readonly string[],
): ArtClipboard {
  const idSet = new Set(ids);
  const strokes: Stroke[] = [];
  const texts: TextElement[] = [];
  const images: ImageElement[] = [];
  if (!idSet.size) return { strokes, texts, images };

  for (const layer of project.layers) {
    const cel = celForLayer(project, layer, frameIndex);
    if (!cel) continue;
    for (const s of cel.strokes) {
      if (idSet.has(s.id)) strokes.push(s);
    }
    for (const t of cel.texts ?? []) {
      if (idSet.has(t.id)) texts.push(t);
    }
    for (const im of cel.images ?? []) {
      if (idSet.has(im.id)) images.push(im);
    }
  }
  return { strokes, texts, images };
}

export function clipboardIsEmpty(art: ArtClipboard): boolean {
  return art.strokes.length === 0 && art.texts.length === 0 && art.images.length === 0;
}

export function copyArt(payload: ArtClipboard) {
  clip = {
    strokes: payload.strokes.map(snapshotStroke),
    texts: payload.texts.map(snapshotText),
    images: payload.images.map(snapshotImage),
  };
}

/** Snapshot selected art onto the in-app clipboard. Returns false if nothing matched. */
export function copySelection(
  project: Project,
  frameIndex: number,
  ids: readonly string[],
): boolean {
  const art = collectArtByIds(project, frameIndex, ids);
  if (clipboardIsEmpty(art)) return false;
  copyArt(art);
  return true;
}

export function copyStrokes(source: Stroke[]) {
  copyArt({ strokes: source, texts: [], images: [] });
}

export function readClipboard(): ArtClipboard {
  return clip;
}

export function hasClipboard(): boolean {
  return !clipboardIsEmpty(clip);
}

export function normalizePastedPlainText(raw: string): string {
  return raw.replace(/\r\n/g, "\n").replace(/\r/g, "\n");
}

export function textElementFromPlain(
  plain: string,
  style: {
    x: number;
    y: number;
    fontFamily: string;
    size: number;
    color: string;
    bold?: boolean;
    italic?: boolean;
    align?: TextAlign;
    letterSpacing?: number;
    underline?: boolean;
    strikethrough?: boolean;
    textCase?: TextCase;
    opacity?: number;
    backgroundColor?: string | null;
    shadow?: TextShadow | null;
    blendMode?: TextBlendMode;
    path?: TextPathSettings | null;
    boxWidth?: number;
    typewriterSpeed?: number;
  },
): TextElement {
  return {
    id: crypto.randomUUID(),
    text: normalizePastedPlainText(plain),
    x: style.x,
    y: style.y,
    fontFamily: style.fontFamily,
    size: style.size,
    color: style.color,
    bold: style.bold,
    italic: style.italic,
    align: style.align,
    letterSpacing: style.letterSpacing,
    underline: style.underline,
    strikethrough: style.strikethrough,
    textCase: style.textCase,
    opacity: style.opacity,
    backgroundColor: style.backgroundColor,
    shadow: style.shadow,
    blendMode: style.blendMode,
    path: style.path,
    boxWidth: style.boxWidth,
    typewriterSpeed: style.typewriterSpeed,
  };
}
