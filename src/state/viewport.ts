import { create } from "zustand";

const MIN_ZOOM = 0.25;
const MAX_ZOOM = 4;
const ZOOM_STEP = 1.15;

interface ViewportState {
  /** multiplier on fit-to-screen scale */
  zoom: number;
  /** screen-space pan offset in px (applied after centering) */
  panX: number;
  panY: number;
  setZoom: (zoom: number) => void;
  zoomBy: (factor: number) => void;
  zoomIn: () => void;
  zoomOut: () => void;
  panBy: (dx: number, dy: number) => void;
  setPan: (panX: number, panY: number) => void;
  resetZoom: () => void;
  resetView: () => void;
}

function clampZoom(zoom: number): number {
  return Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, zoom));
}

export const useViewport = create<ViewportState>((set, get) => ({
  zoom: 1,
  panX: 0,
  panY: 0,
  setZoom: (zoom) => set({ zoom: clampZoom(zoom) }),
  zoomBy: (factor) => get().setZoom(get().zoom * factor),
  zoomIn: () => get().zoomBy(ZOOM_STEP),
  zoomOut: () => get().zoomBy(1 / ZOOM_STEP),
  panBy: (dx, dy) => {
    const { panX, panY } = get();
    set({ panX: panX + dx, panY: panY + dy });
  },
  setPan: (panX, panY) => set({ panX, panY }),
  resetZoom: () => set({ zoom: 1, panX: 0, panY: 0 }),
  resetView: () => set({ zoom: 1, panX: 0, panY: 0 }),
}));

export { MIN_ZOOM, MAX_ZOOM, ZOOM_STEP };
