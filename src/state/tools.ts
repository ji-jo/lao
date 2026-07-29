import { create } from "zustand";
import { ensureFontLoaded } from "@/lib/google-fonts";
import type { BrushKind } from "@/model/types";

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

export function isShapeTool(tool: ToolId): tool is ShapeToolId {
  return (
    tool === "rect" ||
    tool === "diamond" ||
    tool === "circle" ||
    tool === "arrow" ||
    tool === "line"
  );
}

/** Drawable shape while pack is open (`"shapes"`) or a concrete shape tool is active. */
export function activeShapeTool(
  tool: ToolId,
  last: ShapeToolId,
): ShapeToolId | null {
  if (isShapeTool(tool)) return tool;
  if (tool === "shapes") return last;
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
  letterSpacing: number;
  /** drawing starts a keyframe automatically; OFF routes strokes to a static layer */
  autoKey: boolean;
  /** new strokes get the boil/jitter flag by default */
  jitterByDefault: boolean;
  /** new strokes get paper grain texture by default (best on pencil) */
  grainByDefault: boolean;
  /** shapes flyout open on main dock */
  shapesOpen: boolean;
  setTool: (tool: ToolId) => void;
  setColor: (color: string) => void;
  setFillColor: (color: string) => void;
  setSize: (size: number) => void;
  setTextSize: (size: number) => void;
  setFontFamily: (fontFamily: string) => void;
  setLetterSpacing: (spacing: number) => void;
  toggleAutoKey: () => void;
  toggleJitterByDefault: () => void;
  toggleGrainByDefault: () => void;
  setShapesOpen: (open: boolean) => void;
}

export const useTools = create<ToolsState>((set) => ({
  tool: "ink",
  lastShapeTool: "rect",
  color: "#e7e7ea",
  fillColor: "#40608E",
  size: 8,
  textSize: 64,
  fontFamily: "Inter",
  letterSpacing: 0,
  autoKey: true,
  jitterByDefault: true,
  grainByDefault: false,
  shapesOpen: false,
  setTool: (tool) =>
    set((s) => ({
      tool,
      lastShapeTool: isShapeTool(tool) ? tool : s.lastShapeTool,
      // Generic chip opens the pack; picking a concrete shape keeps it open if
      // already open (so the highlight is visible). Other tools close it.
      shapesOpen: tool === "shapes" || (isShapeTool(tool) && s.shapesOpen),
    })),
  setColor: (color) => set({ color }),
  setFillColor: (fillColor) => set({ fillColor }),
  setSize: (size) => set({ size }),
  setTextSize: (textSize) => set({ textSize }),
  setFontFamily: (fontFamily) => {
    ensureFontLoaded(fontFamily);
    set({ fontFamily });
  },
  setLetterSpacing: (letterSpacing) => set({ letterSpacing }),
  toggleAutoKey: () => set((s) => ({ autoKey: !s.autoKey })),
  toggleJitterByDefault: () => set((s) => ({ jitterByDefault: !s.jitterByDefault })),
  toggleGrainByDefault: () => set((s) => ({ grainByDefault: !s.grainByDefault })),
  setShapesOpen: (shapesOpen) => set({ shapesOpen }),
}));
