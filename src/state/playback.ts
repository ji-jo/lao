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
  onionColor: string;
  onionOpacity: number;
  onionRange: number;
  onionAutoDuplicate: boolean;
  onionPanelOpen: boolean;
  /** Loop playback back to frame 0 at the end (Paper timeline loop toggle) */
  loop: boolean;
  /** Animatron timeline-conjoined easing panel */
  animationPanelOpen: boolean;
  setMode: (mode: StageView) => void;
  setStage: (stage: StageView) => void;
  setWorkflow: (workflow: Workflow) => void;
  setPlaying: (playing: boolean) => void;
  togglePlaying: () => void;
  toggleOnionSkin: () => void;
  setOnionSkinProps: (props: Partial<Pick<PlaybackState, "onionColor" | "onionOpacity" | "onionRange" | "onionAutoDuplicate">>) => void;
  toggleOnionPanel: () => void;
  toggleLoop: () => void;
  setAnimationPanelOpen: (open: boolean) => void;
  toggleAnimationPanel: () => void;
}

export const usePlayback = create<PlaybackState>((set) => ({
  mode: "draw",
  stage: "draw",
  workflow: "stopmotion",
  playing: false,
  onionSkin: true,
  onionColor: "#e0504f",
  onionOpacity: 0.45,
  onionRange: 1,
  onionAutoDuplicate: true,
  onionPanelOpen: false,
  loop: true,
  animationPanelOpen: false,
  setMode: (mode) => set({ mode, stage: mode, playing: false }),
  setStage: (stage) => set({ stage, mode: stage, playing: false }),
  setWorkflow: (workflow) => set({ workflow, playing: false, animationPanelOpen: false }),
  setPlaying: (playing) => set({ playing }),
  togglePlaying: () => set((s) => ({ playing: !s.playing })),
  toggleOnionSkin: () => set((s) => ({ onionSkin: !s.onionSkin })),
  setOnionSkinProps: (props) => set(props),
  toggleOnionPanel: () => set((s) => ({ onionPanelOpen: !s.onionPanelOpen })),
  toggleLoop: () => set((s) => ({ loop: !s.loop })),
  setAnimationPanelOpen: (animationPanelOpen) => set({ animationPanelOpen }),
  toggleAnimationPanel: () =>
    set((s) => ({ animationPanelOpen: !s.animationPanelOpen })),
}));