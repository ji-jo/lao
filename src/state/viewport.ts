import { create } from "zustand";

const MIN_ZOOM = 0.25;
const MAX_ZOOM = 4;
const ZOOM_STEP = 1.15;

interface ViewportState {
  /** multiplier on fit-to-screen scale */
  zoom: number;
  setZoom: (zoom: number) => void;
  zoomBy: (factor: number) => void;
  zoomIn: () => void;
  zoomOut: () => void;
  resetZoom: () => void;
}

export const useViewport = create<ViewportState>((set, get) => ({
  zoom: 1,
  setZoom: (zoom) => set({ zoom: Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, zoom)) }),
  zoomBy: (factor) => get().setZoom(get().zoom * factor),
  zoomIn: () => get().zoomBy(ZOOM_STEP),
  zoomOut: () => get().zoomBy(1 / ZOOM_STEP),
  resetZoom: () => set({ zoom: 1 }),
}));

export { MIN_ZOOM, MAX_ZOOM };
