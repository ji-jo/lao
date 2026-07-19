import { create } from "zustand";

export type AppMode = "draw" | "preview";

interface PlaybackState {
  mode: AppMode;
  playing: boolean;
  onionSkin: boolean;
  setMode: (mode: AppMode) => void;
  setPlaying: (playing: boolean) => void;
  togglePlaying: () => void;
  toggleOnionSkin: () => void;
}

export const usePlayback = create<PlaybackState>((set) => ({
  mode: "draw",
  playing: false,
  onionSkin: true,
  setMode: (mode) => set({ mode, playing: false }),
  setPlaying: (playing) => set({ playing }),
  togglePlaying: () => set((s) => ({ playing: !s.playing })),
  toggleOnionSkin: () => set((s) => ({ onionSkin: !s.onionSkin })),
}));
