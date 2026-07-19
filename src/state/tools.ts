import { create } from "zustand";
import type { BrushKind } from "@/model/types";

export type ToolId = "select" | BrushKind;

interface ToolsState {
  tool: ToolId;
  color: string;
  size: number;
  /** drawing starts a keyframe automatically; OFF routes strokes to a static layer */
  autoKey: boolean;
  /** new strokes get the boil/jitter flag by default */
  jitterByDefault: boolean;
  setTool: (tool: ToolId) => void;
  setColor: (color: string) => void;
  setSize: (size: number) => void;
  toggleAutoKey: () => void;
  toggleJitterByDefault: () => void;
}

export const useTools = create<ToolsState>((set) => ({
  tool: "ink",
  color: "#e7e7ea",
  size: 6,
  autoKey: true,
  jitterByDefault: true,
  setTool: (tool) => set({ tool }),
  setColor: (color) => set({ color }),
  setSize: (size) => set({ size }),
  toggleAutoKey: () => set((s) => ({ autoKey: !s.autoKey })),
  toggleJitterByDefault: () => set((s) => ({ jitterByDefault: !s.jitterByDefault })),
}));
