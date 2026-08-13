import { create } from "zustand";
import type { BezierNode } from "@/model/types";
import type { MotionPathPresetId } from "@/engine/motionPathPresets";

/**
 * Path Maker session state — drafting a motion guide on the Draw stage.
 * Guides are not strokes; commits go through project.addMotionPath / Assignment.
 */

export type PathMakerMode = "idle" | "draw" | "preset";

interface PathMakerState {
  panelOpen: boolean;
  mode: PathMakerMode;
  /** Live pen nodes while drawing a custom path */
  draftNodes: BezierNode[];
  /** Selected assignment id for editing (null = create new) */
  editingAssignmentId: string | null;
  /** Last preset chip (for re-apply) */
  lastPreset: MotionPathPresetId;
  durationMs: number;
  reverse: boolean;
  orient: boolean;
  /** stop-motion frame span */
  startFrame: number;
  endFrame: number;
  setPanelOpen: (open: boolean) => void;
  togglePanel: () => void;
  setMode: (mode: PathMakerMode) => void;
  setDraftNodes: (nodes: BezierNode[]) => void;
  addDraftNode: (node: BezierNode) => void;
  /** Patch the last draft node (handle drag while placing, like pen). */
  updateLastDraftNode: (patch: Partial<BezierNode>) => void;
  clearDraft: () => void;
  setEditingAssignmentId: (id: string | null) => void;
  setLastPreset: (id: MotionPathPresetId) => void;
  setDurationMs: (ms: number) => void;
  setReverse: (v: boolean) => void;
  setOrient: (v: boolean) => void;
  setStartFrame: (n: number) => void;
  setEndFrame: (n: number) => void;
}

export const usePathMaker = create<PathMakerState>((set) => ({
  panelOpen: false,
  mode: "idle",
  draftNodes: [],
  editingAssignmentId: null,
  lastPreset: "straight",
  durationMs: 1000,
  reverse: false,
  orient: true,
  startFrame: 0,
  endFrame: 6,
  setPanelOpen: (panelOpen) =>
    set((s) => ({
      panelOpen,
      mode: panelOpen ? s.mode : "idle",
      draftNodes: panelOpen ? s.draftNodes : [],
    })),
  togglePanel: () =>
    set((s) => ({
      panelOpen: !s.panelOpen,
      mode: s.panelOpen ? "idle" : s.mode,
      draftNodes: s.panelOpen ? [] : s.draftNodes,
    })),
  setMode: (mode) => set({ mode, draftNodes: mode === "draw" ? [] : [] }),
  setDraftNodes: (draftNodes) => set({ draftNodes }),
  addDraftNode: (node) =>
    set((s) => ({ draftNodes: [...s.draftNodes, node], mode: "draw" })),
  updateLastDraftNode: (patch) =>
    set((s) => {
      if (!s.draftNodes.length) return s;
      const draftNodes = s.draftNodes.slice();
      const last = draftNodes[draftNodes.length - 1]!;
      draftNodes[draftNodes.length - 1] = {
        ...last,
        ...patch,
        handleIn: patch.handleIn !== undefined ? patch.handleIn : last.handleIn,
        handleOut:
          patch.handleOut !== undefined ? patch.handleOut : last.handleOut,
      };
      return { draftNodes };
    }),
  clearDraft: () => set({ draftNodes: [], mode: "idle" }),
  setEditingAssignmentId: (editingAssignmentId) => set({ editingAssignmentId }),
  setLastPreset: (lastPreset) => set({ lastPreset }),
  setDurationMs: (durationMs) => set({ durationMs: Math.max(80, durationMs) }),
  setReverse: (reverse) => set({ reverse }),
  setOrient: (orient) => set({ orient }),
  setStartFrame: (startFrame) => set({ startFrame: Math.max(0, startFrame) }),
  setEndFrame: (endFrame) => set({ endFrame: Math.max(0, endFrame) }),
}));
