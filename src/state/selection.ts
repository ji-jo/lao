import { create } from "zustand";
import { resolveCel } from "@/model/types";
import { useProject } from "@/state/project";

interface SelectionState {
  /** selected stroke ids within the current cel */
  ids: string[];
  /** selected node points */
  nodeIds: { strokeId: string; index: number }[];
  set: (ids: string[]) => void;
  toggle: (id: string) => void;
  setNodes: (nodes: { strokeId: string; index: number }[]) => void;
  toggleNode: (strokeId: string, index: number) => void;
  clear: () => void;
  clearNodes: () => void;
  selectAll: () => void;
  /** drop ids that no longer exist in the active cel */
  prune: () => void;
}

function currentCelStrokeIds(): string[] {
  const p = useProject.getState();
  const layer = p.project.layers[p.layerIndex];
  const cel = layer ? resolveCel(layer, p.frameIndex) : null;
  return cel ? cel.strokes.map((s) => s.id) : [];
}

export const useSelection = create<SelectionState>((set, get) => ({
  ids: [],
  nodeIds: [],
  set: (ids) => set({ ids, nodeIds: [] }),
  toggle: (id) =>
    set((s) => ({
      ids: s.ids.includes(id) ? s.ids.filter((x) => x !== id) : [...s.ids, id],
      nodeIds: [],
    })),
  setNodes: (nodeIds) => set({ nodeIds }),
  toggleNode: (strokeId, index) =>
    set((s) => {
      const exists = s.nodeIds.some((n) => n.strokeId === strokeId && n.index === index);
      return {
        nodeIds: exists
          ? s.nodeIds.filter((n) => !(n.strokeId === strokeId && n.index === index))
          : [...s.nodeIds, { strokeId, index }],
      };
    }),
  clear: () => set({ ids: [], nodeIds: [] }),
  clearNodes: () => set({ nodeIds: [] }),
  selectAll: () => set({ ids: currentCelStrokeIds(), nodeIds: [] }),
  prune: () => {
    const valid = new Set(currentCelStrokeIds());
    const nextIds = get().ids.filter((id) => valid.has(id));
    const nextNodes = get().nodeIds.filter((n) => valid.has(n.strokeId));
    if (nextIds.length !== get().ids.length || nextNodes.length !== get().nodeIds.length) {
      set({ ids: nextIds, nodeIds: nextNodes });
    }
  },
}));

// selection can't outlive the cel it points into
useProject.subscribe((s, prev) => {
  if (s.frameIndex !== prev.frameIndex || s.layerIndex !== prev.layerIndex) {
    useSelection.getState().clear();
    return;
  }
  if (s.project !== prev.project) {
    useSelection.getState().prune();
  }
});
