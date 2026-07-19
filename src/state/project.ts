import { create } from "zustand";
import {
  createEmptyProject,
  resolveCel,
  resolveCelIndex,
  type Frame,
  type Layer,
  type Project,
  type Stroke,
} from "@/model/types";
import { useTools } from "@/state/tools";

const MAX_UNDO = 100;

interface ProjectState {
  project: Project;
  layerIndex: number;
  frameIndex: number;
  undoStack: Project[];
  redoStack: Project[];

  setFrameIndex: (i: number) => void;
  setLayerIndex: (i: number) => void;
  stepFrame: (delta: number) => void;

  addStroke: (stroke: Stroke) => void;
  /** paste strokes into the current frame at their original coordinates; returns the new ids */
  pasteStrokes: (strokes: Stroke[]) => string[];
  deleteStrokes: (ids: string[]) => void;
  replaceStrokePoints: (strokeId: string, points: Stroke["points"]) => void;
  addKeyframe: () => void;
  duplicateFrameForward: () => void;
  deleteKeyframe: () => void;
  extendTimeline: (frames: number) => void;
  setProjectSettings: (
    patch: Partial<
      Pick<Project, "name" | "width" | "height" | "fps" | "frameCount" | "background">
    >,
  ) => void;
  addLayer: () => void;
  toggleLayerVisible: (layerIndex: number) => void;

  loadProject: (project: Project) => void;
  undo: () => void;
  redo: () => void;
}

function replaceLayer(project: Project, li: number, layer: Layer): Project {
  return { ...project, layers: project.layers.map((l, i) => (i === li ? layer : l)) };
}

function setCel(layer: Layer, fi: number, cel: Frame | null): Layer {
  const frames = layer.frames.slice();
  while (frames.length <= fi) frames.push(null);
  frames[fi] = cel;
  return { ...layer, frames };
}

function emptyCel(): Frame {
  return { id: crypto.randomUUID(), strokes: [] };
}

export const useProject = create<ProjectState>((set, get) => {
  /** history-recording update */
  function commit(next: Project) {
    set((s) => ({
      project: next,
      undoStack: [...s.undoStack.slice(-MAX_UNDO + 1), s.project],
      redoStack: [],
    }));
  }

  return {
    project: createEmptyProject(),
    layerIndex: 0,
    frameIndex: 0,
    undoStack: [],
    redoStack: [],

    setFrameIndex: (i) =>
      set((s) => ({ frameIndex: Math.max(0, Math.min(i, s.project.frameCount - 1)) })),
    setLayerIndex: (i) =>
      set((s) => ({ layerIndex: Math.max(0, Math.min(i, s.project.layers.length - 1)) })),
    stepFrame: (delta) =>
      set((s) => {
        const n = s.project.frameCount;
        return { frameIndex: ((s.frameIndex + delta) % n + n) % n };
      }),

    addStroke: (stroke) => {
      const s = get();
      const { autoKey } = useTools.getState();
      let { project, layerIndex, frameIndex } = s;
      let layer = project.layers[layerIndex];
      if (!layer) return;

      if (!autoKey && !layer.isStatic) {
        // Auto-key OFF: route the stroke to a static (held) layer
        let staticIndex = project.layers.findIndex((l) => l.isStatic);
        if (staticIndex === -1) {
          const staticLayer: Layer = {
            id: crypto.randomUUID(),
            name: "Static",
            visible: true,
            isStatic: true,
            frames: [emptyCel()],
          };
          project = { ...project, layers: [...project.layers, staticLayer] };
          staticIndex = project.layers.length - 1;
        }
        layerIndex = staticIndex;
        layer = project.layers[layerIndex];
        frameIndex = 0;
      }

      // Auto-key: drawing on a held/empty slot creates a keyframe there
      let celIndex = layer.isStatic ? 0 : frameIndex;
      let cel = layer.frames[celIndex] ?? null;
      if (!cel) {
        if (layer.isStatic) {
          cel = emptyCel();
        } else if (autoKey || resolveCelIndex(layer, frameIndex) === null) {
          cel = emptyCel();
        } else {
          // draw onto the held cel (extends the exposure's artwork)
          celIndex = resolveCelIndex(layer, frameIndex)!;
          cel = layer.frames[celIndex]!;
        }
      }
      const nextCel: Frame = { ...cel, strokes: [...cel.strokes, stroke] };
      commit(replaceLayer(project, layerIndex, setCel(layer, celIndex, nextCel)));
    },

    pasteStrokes: (strokes) => {
      if (strokes.length === 0) return [];
      const { project, layerIndex, frameIndex } = get();
      const layer = project.layers[layerIndex];
      if (!layer) return [];
      const fi = layer.isStatic ? 0 : frameIndex;
      const pasted = strokes.map((s) => ({
        ...s,
        id: crypto.randomUUID(),
        points: s.points.map((p) => ({ ...p })),
      }));
      // paste into the keyframe at this slot; if the slot is empty or held,
      // start a fresh cel here — the paste is what you're placing
      const existing = layer.frames[fi] ?? null;
      const cel: Frame = existing
        ? { ...existing, strokes: [...existing.strokes, ...pasted] }
        : { id: crypto.randomUUID(), strokes: pasted };
      commit(replaceLayer(project, layerIndex, setCel(layer, fi, cel)));
      return pasted.map((s) => s.id);
    },

    deleteStrokes: (ids) => {
      const { project, layerIndex, frameIndex } = get();
      const layer = project.layers[layerIndex];
      if (!layer) return;
      const celIndex = resolveCelIndex(layer, layer.isStatic ? 0 : frameIndex);
      if (celIndex === null) return;
      const cel = layer.frames[celIndex]!;
      const strokes = cel.strokes.filter((s) => !ids.includes(s.id));
      if (strokes.length === cel.strokes.length) return;
      commit(replaceLayer(project, layerIndex, setCel(layer, celIndex, { ...cel, strokes })));
    },

    replaceStrokePoints: (strokeId, points) => {
      const { project, layerIndex, frameIndex } = get();
      const layer = project.layers[layerIndex];
      if (!layer) return;
      const celIndex = resolveCelIndex(layer, layer.isStatic ? 0 : frameIndex);
      if (celIndex === null) return;
      const cel = layer.frames[celIndex]!;
      if (!cel.strokes.some((s) => s.id === strokeId)) return;
      const strokes = cel.strokes.map((s) => (s.id === strokeId ? { ...s, points } : s));
      commit(replaceLayer(project, layerIndex, setCel(layer, celIndex, { ...cel, strokes })));
    },

    addKeyframe: () => {
      const { project, layerIndex, frameIndex } = get();
      const layer = project.layers[layerIndex];
      if (!layer || layer.isStatic || layer.frames[frameIndex]) return;
      commit(replaceLayer(project, layerIndex, setCel(layer, frameIndex, emptyCel())));
    },

    /** duplicate the current cel onto the next frame and move there — the core draw→flip→fix loop */
    duplicateFrameForward: () => {
      const s = get();
      const { project, layerIndex, frameIndex } = s;
      const layer = project.layers[layerIndex];
      if (!layer || layer.isStatic) return;
      const cel = resolveCel(layer, frameIndex);
      const target = frameIndex + 1;
      const copy: Frame = cel
        ? { id: crypto.randomUUID(), strokes: cel.strokes.map((st) => ({ ...st, id: crypto.randomUUID() })) }
        : emptyCel();
      let next = replaceLayer(project, layerIndex, setCel(layer, target, copy));
      if (target >= next.frameCount) next = { ...next, frameCount: target + 1 };
      commit(next);
      set({ frameIndex: target });
    },

    deleteKeyframe: () => {
      const { project, layerIndex, frameIndex } = get();
      const layer = project.layers[layerIndex];
      const fi = layer?.isStatic ? 0 : frameIndex;
      if (!layer || !layer.frames[fi]) return;
      commit(replaceLayer(project, layerIndex, setCel(layer, fi, null)));
    },

    extendTimeline: (frames) => {
      const { project } = get();
      commit({ ...project, frameCount: project.frameCount + frames });
    },

    setProjectSettings: (patch) => {
      const { project } = get();
      commit({ ...project, ...patch });
    },

    addLayer: () => {
      const { project } = get();
      const layer: Layer = {
        id: crypto.randomUUID(),
        name: `Layer ${project.layers.length + 1}`,
        visible: true,
        isStatic: false,
        frames: [emptyCel()],
      };
      commit({ ...project, layers: [...project.layers, layer] });
      set({ layerIndex: project.layers.length });
    },

    toggleLayerVisible: (li) => {
      const { project } = get();
      const layer = project.layers[li];
      if (!layer) return;
      commit(replaceLayer(project, li, { ...layer, visible: !layer.visible }));
    },

    loadProject: (project) =>
      set({
        project,
        layerIndex: 0,
        frameIndex: 0,
        undoStack: [],
        redoStack: [],
      }),

    undo: () =>
      set((s) => {
        const prev = s.undoStack[s.undoStack.length - 1];
        if (!prev) return s;
        return {
          project: prev,
          undoStack: s.undoStack.slice(0, -1),
          redoStack: [...s.redoStack, s.project],
          layerIndex: Math.min(s.layerIndex, prev.layers.length - 1),
          frameIndex: Math.min(s.frameIndex, prev.frameCount - 1),
        };
      }),

    redo: () =>
      set((s) => {
        const next = s.redoStack[s.redoStack.length - 1];
        if (!next) return s;
        return {
          project: next,
          undoStack: [...s.undoStack, s.project],
          redoStack: s.redoStack.slice(0, -1),
          layerIndex: Math.min(s.layerIndex, next.layers.length - 1),
          frameIndex: Math.min(s.frameIndex, next.frameCount - 1),
        };
      }),
  };
});
