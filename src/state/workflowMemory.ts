import { create } from "zustand";
import type { Project, ProjectWorkflow } from "@/model/types";

export interface WorkflowSnapshot {
  project: Project;
  layerIndex: number;
  frameIndex: number;
  undoStack: Project[];
  redoStack: Project[];
}

interface WorkflowMemoryState {
  snapshots: Partial<Record<ProjectWorkflow, WorkflowSnapshot>>;
  remember: (workflow: ProjectWorkflow, snapshot: WorkflowSnapshot) => void;
  take: (workflow: ProjectWorkflow) => WorkflowSnapshot | undefined;
  hydrate: (projects: Partial<Record<ProjectWorkflow, Project>> | undefined) => void;
  clear: () => void;
  /** Inactive-mode documents for .lao / autosave. */
  projectsForSave: (
    active: ProjectWorkflow,
  ) => Partial<Record<ProjectWorkflow, Project>>;
}

const MODES: ProjectWorkflow[] = ["stopmotion", "animatron"];

export const useWorkflowMemory = create<WorkflowMemoryState>((set, get) => ({
  snapshots: {},
  remember: (workflow, snapshot) =>
    set((s) => ({ snapshots: { ...s.snapshots, [workflow]: snapshot } })),
  take: (workflow) => get().snapshots[workflow],
  hydrate: (projects) => {
    if (!projects) {
      set({ snapshots: {} });
      return;
    }
    const snapshots: Partial<Record<ProjectWorkflow, WorkflowSnapshot>> = {};
    for (const key of MODES) {
      const project = projects[key];
      if (!project) continue;
      snapshots[key] = {
        project,
        layerIndex: 0,
        frameIndex: 0,
        undoStack: [],
        redoStack: [],
      };
    }
    set({ snapshots });
  },
  clear: () => set({ snapshots: {} }),
  projectsForSave: (active) => {
    const out: Partial<Record<ProjectWorkflow, Project>> = {};
    for (const key of MODES) {
      if (key === active) continue;
      const snap = get().snapshots[key];
      if (snap) out[key] = snap.project;
    }
    return out;
  },
}));
