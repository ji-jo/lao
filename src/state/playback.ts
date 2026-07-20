import { create } from "zustand";

/** Stage view: edit canvas vs Remotion preview */
export type StageView = "draw" | "preview";
/** Top-level workflow: exposure sheet vs path-clip Animatron */
export type Workflow = "stopmotion" | "animatron";

interface PlaybackState {
  /** @deprecated use `stage` — kept as alias during migration */
  mode: StageView;
  stage: StageView;
  workflow: Workflow;
  playing: boolean;
  onionSkin: boolean;
  setMode: (mode: StageView) => void;
  setStage: (stage: StageView) => void;
  setWorkflow: (workflow: Workflow) => void;
  setPlaying: (playing: boolean) => void;
  togglePlaying: () => void;
  toggleOnionSkin: () => void;
}

export const usePlayback = create<PlaybackState>((set) => ({
  mode: "draw",
  stage: "draw",
  workflow: "stopmotion",
  playing: false,
  onionSkin: true,
  setMode: (mode) => set({ mode, stage: mode, playing: false }),
  setStage: (stage) => set({ stage, mode: stage, playing: false }),
  setWorkflow: (workflow) => set({ workflow, playing: false }),
  setPlaying: (playing) => set({ playing }),
  togglePlaying: () => set((s) => ({ playing: !s.playing })),
  toggleOnionSkin: () => set((s) => ({ onionSkin: !s.onionSkin })),
}));
