import { create } from "zustand";
import { celForLayer, selectableIdsInLayers } from "@/engine/layerCel";
import { expandSelectionByGroups } from "@/engine/artGroup";
import { useProject } from "@/state/project";

interface SelectionState {
  /** selected stroke ids within the current cel */
  ids: string[];
  /** selected node points */
  nodeIds: { strokeId: string; index: number }[];
  /** timeline layer indices (multi-select for batch delete) */
  layerIndices: number[];
  set: (ids: string[]) => void;
  toggle: (id: string) => void;
  setNodes: (nodes: { strokeId: string; index: number }[]) => void;
  toggleNode: (strokeId: string, index: number) => void;
  clear: () => void;
  clearNodes: () => void;
  selectAll: () => void;
  setLayerIndices: (indices: number[]) => void;
  selectAllLayers: () => void;
  /** select every drawable on the given timeline layers (keeps layerIndices) */
  selectAllInLayers: (indices?: number[]) => void;
  clearLayers: () => void;
  /** drop ids that no longer exist in the active cel */
  prune: () => void;
}

function currentCelSelectableIds(): string[] {
  const p = useProject.getState();
  const layer = p.project.layers[p.layerIndex];
  const cel = layer ? celForLayer(p.project, layer, p.frameIndex) : null;
  if (!cel) return [];
  const ids = cel.strokes.map((s) => s.id);
  if (cel.texts) {
    for (const t of cel.texts) ids.push(t.id);
  }
  if (cel.images) {
    for (const im of cel.images) ids.push(im.id);
  }
  return ids;
}

function allSelectableIds(): string[] {
  const p = useProject.getState();
  const n = p.project.layers.length;
  return selectableIdsInLayers(
    p.project,
    p.frameIndex,
    Array.from({ length: n }, (_, i) => i),
  );
}

export const useSelection = create<SelectionState>((set, get) => ({
  ids: [],
  nodeIds: [],
  layerIndices: [],
  set: (ids) => {
    const p = useProject.getState();
    const expanded = expandSelectionByGroups(ids, p.project, p.frameIndex);
    set({ ids: expanded, nodeIds: [], layerIndices: [] });
  },
  toggle: (id) => {
    const p = useProject.getState();
    const expanded = expandSelectionByGroups([id], p.project, p.frameIndex);
    set((s) => {
      const removing = s.ids.includes(id);
      const next = removing
        ? s.ids.filter((x) => !expanded.includes(x))
        : [...new Set([...s.ids, ...expanded])];
      return { ids: next, nodeIds: [], layerIndices: [] };
    });
  },
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
  selectAll: () =>
    set({ ids: currentCelSelectableIds(), nodeIds: [], layerIndices: [] }),
  setLayerIndices: (layerIndices) =>
    set({ layerIndices, ids: [], nodeIds: [] }),
  selectAllLayers: () => {
    get().selectAllInLayers(
      Array.from(
        { length: useProject.getState().project.layers.length },
        (_, i) => i,
      ),
    );
  },
  selectAllInLayers: (indices) => {
    const p = useProject.getState();
    const layerIndices =
      indices ??
      (get().layerIndices.length > 0
        ? get().layerIndices
        : Array.from({ length: p.project.layers.length }, (_, i) => i));
    const ids = selectableIdsInLayers(p.project, p.frameIndex, layerIndices);
    set({ ids, nodeIds: [], layerIndices });
  },
  clearLayers: () => set({ layerIndices: [] }),
  prune: () => {
    const valid = new Set(allSelectableIds());
    const nextIds = get().ids.filter((id) => valid.has(id));
    const nextNodes = get().nodeIds.filter((n) => valid.has(n.strokeId));
    const layerCount = useProject.getState().project.layers.length;
    const nextLayers = get().layerIndices.filter((i) => i >= 0 && i < layerCount);
    if (
      nextIds.length !== get().ids.length ||
      nextNodes.length !== get().nodeIds.length ||
      nextLayers.length !== get().layerIndices.length
    ) {
      set({ ids: nextIds, nodeIds: nextNodes, layerIndices: nextLayers });
    }
  },
}));

// selection can't outlive the cel it points into
useProject.subscribe((s, prev) => {
  if (s.frameIndex !== prev.frameIndex) {
    useSelection.getState().clear();
    return;
  }
  if (s.layerIndex !== prev.layerIndex) {
    useSelection.getState().clear();
    useSelection.getState().clearLayers();
    return;
  }
  if (s.project !== prev.project) {
    useSelection.getState().prune();
  }
});
