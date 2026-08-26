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
  /**
   * Live composition clock in ms while Draw-stage playback is running.
   * Sub-frame so Animatron draw-on isn't quantized to the stop-motion fps grid.
   * `null` when paused — paint from `frameIndex` instead.
   */
  timeMs: number | null;
  /** Animatron timeline-conjoined easing panel */
  animationPanelOpen: boolean;
  /** Animatron draw stage: show every layer’s complete paths on the canvas */
  showFullStrokes: boolean;
  setMode: (mode: StageView) => void;
  setStage: (stage: StageView) => void;
  setWorkflow: (workflow: Workflow) => void;
  setPlaying: (playing: boolean) => void;
  togglePlaying: () => void;
  toggleOnionSkin: () => void;
  setOnionSkinProps: (props: Partial<Pick<PlaybackState, "onionColor" | "onionOpacity" | "onionRange" | "onionAutoDuplicate">>) => void;
  toggleOnionPanel: () => void;
  toggleLoop: () => void;
  setTimeMs: (timeMs: number | null) => void;
  setAnimationPanelOpen: (open: boolean) => void;
  toggleAnimationPanel: () => void;
  toggleShowFullStrokes: () => void;
  setShowFullStrokes: (show: boolean) => void;
}

export const usePlayback = create<PlaybackState>((set) => ({
  mode: "draw",
  stage: "draw",
  workflow: "animatron",
  playing: false,
  onionSkin: true,
  onionColor: "#e0504f",
  onionOpacity: 0.45,
  onionRange: 1,
  onionAutoDuplicate: true,
  onionPanelOpen: false,
  loop: true,
  timeMs: null,
  animationPanelOpen: false,
  showFullStrokes: false,
  setMode: (mode) => set({ mode, stage: mode, playing: false, timeMs: null }),
  setStage: (stage) => set({ stage, mode: stage, playing: false, timeMs: null }),
  setWorkflow: (workflow) =>
    set({ workflow, playing: false, animationPanelOpen: false, timeMs: null }),
  setPlaying: (playing) =>
    set(playing ? { playing } : { playing: false, timeMs: null }),
  togglePlaying: () =>
    set((s) =>
      s.playing ? { playing: false, timeMs: null } : { playing: true },
    ),
  toggleOnionSkin: () => set((s) => ({ onionSkin: !s.onionSkin })),
  setOnionSkinProps: (props) => set(props),
  toggleOnionPanel: () => set((s) => ({ onionPanelOpen: !s.onionPanelOpen })),
  toggleLoop: () => set((s) => ({ loop: !s.loop })),
  setTimeMs: (timeMs) => set({ timeMs }),
  setAnimationPanelOpen: (animationPanelOpen) => set({ animationPanelOpen }),
  toggleAnimationPanel: () =>
    set((s) => ({ animationPanelOpen: !s.animationPanelOpen })),
  toggleShowFullStrokes: () =>
    set((s) => ({ showFullStrokes: !s.showFullStrokes })),
  setShowFullStrokes: (showFullStrokes) => set({ showFullStrokes }),
}));