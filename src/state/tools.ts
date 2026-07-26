import { create } from "zustand";
import { ensureFontLoaded } from "@/lib/google-fonts";
import type { BrushKind } from "@/model/types";

/** Closed shapes for bucket + shapes pack */
export type ShapeToolId = "rect" | "diamond" | "circle" | "arrow" | "line";

export type ToolId =
  | "select"
  | BrushKind
  | "fill"
  | "text"
  | "hand"
  | "shapes"
  | ShapeToolId;

export function isBrushTool(tool: ToolId): tool is BrushKind {
  return tool === "ink" || tool === "pencil" || tool === "marker" || tool === "eraser";
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

interface ToolsState {
  tool: ToolId;
  color: string;
  /** closed-shape fill (stroke uses `color`) */
  fillColor: string;
  size: number;
  /** text tool typeface */
  fontFamily: string;
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
  setFontFamily: (fontFamily: string) => void;
  toggleAutoKey: () => void;
  toggleJitterByDefault: () => void;
  toggleGrainByDefault: () => void;
  setShapesOpen: (open: boolean) => void;
}

export const useTools = create<ToolsState>((set) => ({
  tool: "ink",
  color: "#e7e7ea",
  fillColor: "#40608E",
  size: 6,
  fontFamily: "Geist",
  autoKey: true,
  jitterByDefault: true,
  grainByDefault: false,
  shapesOpen: false,
  setTool: (tool) =>
    set({
      tool,
      shapesOpen: tool === "shapes" || isShapeTool(tool) ? true : false,
    }),
  setColor: (color) => set({ color }),
  setFillColor: (fillColor) => set({ fillColor }),
  setSize: (size) => set({ size }),
  setFontFamily: (fontFamily) => {
    ensureFontLoaded(fontFamily);
    set({ fontFamily });
  },
  toggleAutoKey: () => set((s) => ({ autoKey: !s.autoKey })),
  toggleJitterByDefault: () => set((s) => ({ jitterByDefault: !s.jitterByDefault })),
  toggleGrainByDefault: () => set((s) => ({ grainByDefault: !s.grainByDefault })),
  setShapesOpen: (shapesOpen) => set({ shapesOpen }),
}));
