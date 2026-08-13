import { create } from "zustand";
import { ensureFontLoaded } from "@/lib/google-fonts";
import type {
  BrushKind,
  TextAlign,
  TextBlendMode,
  TextCase,
  TextPathSettings,
  TextShadow,
} from "@/model/types";
import {
  DEFAULT_P5_BY_KIND,
  coerceP5Brush,
  isP5BrushInKind,
  kindForP5Brush,
  type P5BrushId,
} from "@/engine/p5BrushPresets";
import { DEFAULT_TEXT_PATH } from "@/engine/textStyle";

export type { P5BrushId };
export {
  DEFAULT_P5_BRUSH,
  DEFAULT_P5_BY_KIND,
  P5_BRUSHES,
  brushesForKind,
  coerceP5Brush,
  isP5BrushId,
  isP5BrushInKind,
  kindForP5Brush,
} from "@/engine/p5BrushPresets";

/** Closed shapes for bucket + shapes pack */
export type ShapeToolId = "rect" | "diamond" | "circle" | "arrow" | "line";

export type ToolId =
  | "select"
  | "path"
  | BrushKind
  | "fill"
  | "text"
  | "hand"
  | "shapes"
  | ShapeToolId;

export function isBrushTool(tool: ToolId): tool is BrushKind {
  return tool === "ink" || tool === "pen" || tool === "marker" || tool === "eraser";
}

/** Draw brushes that can style shape strokes (no eraser). */
export type DrawBrushKind = Exclude<BrushKind, "eraser">;

export const DRAW_BRUSHES: {
  id: DrawBrushKind;
  label: string;
  shortcut: string;
}[] = [
  { id: "ink", label: "Ink", shortcut: "b" },
  { id: "pen", label: "Pen", shortcut: "p" },
  { id: "marker", label: "Marker", shortcut: "m" },
];

export function isDrawBrush(tool: ToolId): tool is DrawBrushKind {
  return tool === "ink" || tool === "pen" || tool === "marker";
}

export function isShapeTool(tool: ToolId): tool is ShapeToolId {
  return (
    tool === "rect" ||
    tool === "diamond" ||
    tool === "circle" ||
    tool === "arrow" ||
    tool === "line"
  );
}

/** Concrete shape tool currently armed for rubber-band create.
 * The generic `"shapes"` pack chip only opens the flyout — it must NOT steal
 * the stage (that blocked select/move while the chip looked "active"). */
export function activeShapeTool(
  tool: ToolId,
  _last: ShapeToolId,
): ShapeToolId | null {
  if (isShapeTool(tool)) return tool;
  return null;
}

interface ToolsState {
  tool: ToolId;
  /** Last concrete shape from the pack — used when tool is the generic `"shapes"`. */
  lastShapeTool: ShapeToolId;
  color: string;
  /** closed-shape fill (stroke uses `color`) */
  fillColor: string;
  size: number;
  textSize: number;
  fontFamily: string;
  textBold: boolean;
  textItalic: boolean;
  textAlign: TextAlign;
  letterSpacing: number;
  textUnderline: boolean;
  textStrikethrough: boolean;
  textCase: TextCase;
  textOpacity: number;
  textBackgroundColor: string | null;
  textShadow: TextShadow | null;
  textBlendMode: TextBlendMode;
  textPath: TextPathSettings;
  /** New Animatron text uses typewriter reveal when true. */
  textTypewriter: boolean;
  /** Characters per second for new / dock-controlled typewriter text. */
  textTypewriterSpeed: number;
  /** drawing starts a keyframe automatically; OFF routes strokes to a static layer */
  autoKey: boolean;
  /** new strokes get the boil/jitter flag by default */
  jitterByDefault: boolean;
  /** new strokes get paper grain texture by default (best on pencil) */
  grainByDefault: boolean;
  /** Last ink/pen/marker — used for shape stroke style + tool segment. */
  lastBrushKind: DrawBrushKind;
  /** Last p5.brush preset from the Brushes pack (synced to active draw mode). */
  lastP5Brush: P5BrushId;
  /** Remembered preset per Ink / Pen / Marker so mode switches restore the chip. */
  lastP5ByKind: Record<DrawBrushKind, P5BrushId>;
  /** Brush style — wavelength (px), corners (0–100), smoothing (0–20). */
  brushWavelength: number;
  brushCorners: number;
  brushSmoothing: number;
  /** Default corner radius for new rect shapes (project px). */
  cornerRadius: number;
  /** Default iOS-style squircle for new rect shapes. */
  squircle: boolean;
  /** Default corner smoothing 0–1 when squircle is on. */
  cornerSmoothing: number;
  /** shapes flyout open on main dock */
  shapesOpen: boolean;
  /** Bumps when a bucket fill starts — remounts the droplet icon anim. */
  fillPulse: number;
  setTool: (tool: ToolId) => void;
  setLastBrushKind: (brush: DrawBrushKind) => void;
  setLastP5Brush: (brush: P5BrushId | string) => void;
  bumpFillPulse: () => void;
  setColor: (color: string) => void;
  setFillColor: (color: string) => void;
  setSize: (size: number) => void;
  setBrushWavelength: (n: number) => void;
  setBrushCorners: (n: number) => void;
  setBrushSmoothing: (n: number) => void;
  setCornerRadius: (radius: number) => void;
  setSquircle: (on: boolean) => void;
  setCornerSmoothing: (v: number) => void;
  setTextSize: (size: number) => void;
  setFontFamily: (fontFamily: string) => void;
  setTextBold: (bold: boolean) => void;
  setTextItalic: (italic: boolean) => void;
  setTextAlign: (align: TextAlign) => void;
  setLetterSpacing: (spacing: number) => void;
  setTextUnderline: (v: boolean) => void;
  setTextStrikethrough: (v: boolean) => void;
  setTextCase: (v: TextCase) => void;
  setTextOpacity: (v: number) => void;
  setTextBackgroundColor: (v: string | null) => void;
  setTextShadow: (v: TextShadow | null) => void;
  setTextBlendMode: (v: TextBlendMode) => void;
  setTextPath: (v: TextPathSettings) => void;
  patchTextPath: (patch: Partial<TextPathSettings>) => void;
  setTextTypewriter: (on: boolean) => void;
  setTextTypewriterSpeed: (cps: number) => void;
  toggleAutoKey: () => void;
  toggleJitterByDefault: () => void;
  toggleGrainByDefault: () => void;
  setShapesOpen: (open: boolean) => void;
}

export const useTools = create<ToolsState>((set) => ({
  tool: "ink",
  lastShapeTool: "rect",
  lastBrushKind: "ink",
  lastP5Brush: DEFAULT_P5_BY_KIND.ink,
  lastP5ByKind: { ...DEFAULT_P5_BY_KIND },
  brushWavelength: 12,
  brushCorners: 100,
  brushSmoothing: 9,
  color: "#e7e7ea",
  fillColor: "#40608E",
  size: 8,
  cornerRadius: 0,
  squircle: false,
  cornerSmoothing: 0.6,
  textSize: 64,
  fontFamily: "Inter",
  textBold: false,
  textItalic: false,
  textAlign: "left",
  letterSpacing: 0,
  textUnderline: false,
  textStrikethrough: false,
  textCase: "none",
  textOpacity: 100,
  textBackgroundColor: null,
  textShadow: null,
  textBlendMode: "normal",
  textPath: { ...DEFAULT_TEXT_PATH },
  textTypewriter: true,
  textTypewriterSpeed: 16,
  autoKey: true,
  jitterByDefault: true,
  grainByDefault: false,
  shapesOpen: false,
  fillPulse: 0,
  setTool: (tool) =>
    set((s) => {
      if (!isDrawBrush(tool)) {
        return {
          tool,
          lastShapeTool: isShapeTool(tool) ? tool : s.lastShapeTool,
          shapesOpen: tool === "shapes" || (isShapeTool(tool) && s.shapesOpen),
        };
      }
      const remembered = s.lastP5ByKind[tool];
      const lastP5Brush = isP5BrushInKind(remembered, tool)
        ? remembered
        : DEFAULT_P5_BY_KIND[tool];
      return {
        tool,
        lastBrushKind: tool,
        lastP5Brush,
        lastShapeTool: s.lastShapeTool,
        shapesOpen: false,
      };
    }),
  setLastBrushKind: (lastBrushKind) =>
    set((s) => {
      const remembered = s.lastP5ByKind[lastBrushKind];
      const lastP5Brush = isP5BrushInKind(remembered, lastBrushKind)
        ? remembered
        : DEFAULT_P5_BY_KIND[lastBrushKind];
      return { lastBrushKind, lastP5Brush };
    }),
  setLastP5Brush: (brush) =>
    set((s) => {
      const lastP5Brush = coerceP5Brush(brush) ?? DEFAULT_P5_BY_KIND.ink;
      const kind = isP5BrushInKind(lastP5Brush, s.lastBrushKind)
        ? s.lastBrushKind
        : kindForP5Brush(lastP5Brush);
      return {
        lastP5Brush,
        lastBrushKind: kind,
        lastP5ByKind: { ...s.lastP5ByKind, [kind]: lastP5Brush },
      };
    }),
  setColor: (color) => set({ color }),
  setFillColor: (fillColor) => set({ fillColor }),
  setSize: (size) => set({ size }),
  setBrushWavelength: (brushWavelength) =>
    set({ brushWavelength: Math.max(2, Math.min(64, brushWavelength)) }),
  setBrushCorners: (brushCorners) =>
    set({ brushCorners: Math.max(0, Math.min(100, brushCorners)) }),
  setBrushSmoothing: (brushSmoothing) =>
    set({ brushSmoothing: Math.max(0, Math.min(20, brushSmoothing)) }),
  setCornerRadius: (cornerRadius) =>
    set({ cornerRadius: Math.max(0, cornerRadius) }),
  setSquircle: (squircle) => set({ squircle }),
  setCornerSmoothing: (cornerSmoothing) =>
    set({ cornerSmoothing: Math.max(0, Math.min(1, cornerSmoothing)) }),
  setTextSize: (textSize) => set({ textSize }),
  setFontFamily: (fontFamily) => {
    ensureFontLoaded(fontFamily);
    set({ fontFamily });
  },
  setTextBold: (textBold) => set({ textBold }),
  setTextItalic: (textItalic) => set({ textItalic }),
  setTextAlign: (textAlign) => set({ textAlign }),
  setLetterSpacing: (letterSpacing) => set({ letterSpacing }),
  setTextUnderline: (textUnderline) => set({ textUnderline }),
  setTextStrikethrough: (textStrikethrough) => set({ textStrikethrough }),
  setTextCase: (textCase) => set({ textCase }),
  setTextOpacity: (textOpacity) => set({ textOpacity }),
  setTextBackgroundColor: (textBackgroundColor) => set({ textBackgroundColor }),
  setTextShadow: (textShadow) => set({ textShadow }),
  setTextBlendMode: (textBlendMode) => set({ textBlendMode }),
  setTextPath: (textPath) => set({ textPath }),
  patchTextPath: (patch) =>
    set((s) => ({ textPath: { ...s.textPath, ...patch } })),
  setTextTypewriter: (textTypewriter) => set({ textTypewriter }),
  setTextTypewriterSpeed: (textTypewriterSpeed) =>
    set({
      textTypewriterSpeed: Math.max(1, Math.min(120, Math.round(textTypewriterSpeed))),
    }),
  toggleAutoKey: () => set((s) => ({ autoKey: !s.autoKey })),
  toggleJitterByDefault: () =>
    set((s) => ({ jitterByDefault: !s.jitterByDefault })),
  toggleGrainByDefault: () =>
    set((s) => ({ grainByDefault: !s.grainByDefault })),
  setShapesOpen: (shapesOpen) => set({ shapesOpen }),
  bumpFillPulse: () => set((s) => ({ fillPulse: s.fillPulse + 1 })),
}));
