import { create } from "zustand";
import { createEmptyProject, type Project, type Stroke } from "@/model/types";

interface StrokeRef {
  layerIndex: number;
  frameIndex: number;
  stroke: Stroke;
}

interface ProjectState {
  project: Project;
  layerIndex: number;
  frameIndex: number;
  undoStack: StrokeRef[];
  redoStack: StrokeRef[];
  addStroke: (stroke: Stroke) => void;
  undo: () => void;
  redo: () => void;
}

function withStroke(project: Project, ref: StrokeRef, add: boolean): Project {
  const layers = project.layers.map((layer, li) => {
    if (li !== ref.layerIndex) return layer;
    const frames = layer.frames.map((frame, fi) => {
      if (fi !== ref.frameIndex || !frame) return frame;
      return {
        ...frame,
        strokes: add
          ? [...frame.strokes, ref.stroke]
          : frame.strokes.filter((s) => s.id !== ref.stroke.id),
      };
    });
    return { ...layer, frames };
  });
  return { ...project, layers };
}

export const useProject = create<ProjectState>((set) => ({
  project: createEmptyProject(),
  layerIndex: 0,
  frameIndex: 0,
  undoStack: [],
  redoStack: [],

  addStroke: (stroke) =>
    set((s) => {
      const ref = { layerIndex: s.layerIndex, frameIndex: s.frameIndex, stroke };
      return {
        project: withStroke(s.project, ref, true),
        undoStack: [...s.undoStack, ref],
        redoStack: [],
      };
    }),

  undo: () =>
    set((s) => {
      const ref = s.undoStack[s.undoStack.length - 1];
      if (!ref) return s;
      return {
        project: withStroke(s.project, ref, false),
        undoStack: s.undoStack.slice(0, -1),
        redoStack: [...s.redoStack, ref],
      };
    }),

  redo: () =>
    set((s) => {
      const ref = s.redoStack[s.redoStack.length - 1];
      if (!ref) return s;
      return {
        project: withStroke(s.project, ref, true),
        undoStack: [...s.undoStack, ref],
        redoStack: s.redoStack.slice(0, -1),
      };
    }),
}));
