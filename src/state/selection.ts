import { create } from "zustand";
import { resolveCel } from "@/model/types";
import { useProject } from "@/state/project";

interface SelectionState {
  /** selected stroke ids within the current cel */
  ids: string[];
  set: (ids: string[]) => void;
  toggle: (id: string) => void;
  clear: () => void;
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
  set: (ids) => set({ ids }),
  toggle: (id) =>
    set((s) => ({
      ids: s.ids.includes(id) ? s.ids.filter((x) => x !== id) : [...s.ids, id],
    })),
  clear: () => set({ ids: [] }),
  selectAll: () => set({ ids: currentCelStrokeIds() }),
  prune: () => {
    const valid = new Set(currentCelStrokeIds());
    const next = get().ids.filter((id) => valid.has(id));
    if (next.length !== get().ids.length) set({ ids: next });
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
