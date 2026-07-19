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
}

export const useSelection = create<SelectionState>((set) => ({
  ids: [],
  set: (ids) => set({ ids }),
  toggle: (id) =>
    set((s) => ({
      ids: s.ids.includes(id) ? s.ids.filter((x) => x !== id) : [...s.ids, id],
    })),
  clear: () => set({ ids: [] }),
  selectAll: () => {
    const p = useProject.getState();
    const layer = p.project.layers[p.layerIndex];
    const cel = layer ? resolveCel(layer, p.frameIndex) : null;
    set({ ids: cel ? cel.strokes.map((s) => s.id) : [] });
  },
}));

// selection can't outlive the cel it points into
useProject.subscribe((s, prev) => {
  if (s.frameIndex !== prev.frameIndex || s.layerIndex !== prev.layerIndex) {
    useSelection.getState().clear();
  }
});
