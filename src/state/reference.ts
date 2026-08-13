import { create } from "zustand";
import type { BackgroundFit } from "@/model/types";

export type ReferenceKind = "image" | "video";
export type ReferenceFit = BackgroundFit;

interface ReferenceState {
  url: string | null;
  kind: ReferenceKind | null;
  /** 0…1 — ghost over the artboard / preview */
  opacity: number;
  /** Same Type chips as canvas background image */
  fit: ReferenceFit;
  zoom: number;
  position: { x: number; y: number };
  setReference: (file: File) => void;
  setOpacity: (opacity: number) => void;
  setFit: (fit: ReferenceFit) => void;
  setZoom: (zoom: number) => void;
  setPosition: (position: { x: number; y: number }) => void;
  clear: () => void;
}

/** Session reference overlay. Never part of the document or exports. */
export const useReference = create<ReferenceState>((set, get) => ({
  url: null,
  kind: null,
  opacity: 0.35,
  fit: "contain",
  zoom: 1,
  position: { x: 0.5, y: 0.5 },
  setReference: (file) => {
    const prev = get().url;
    if (prev) URL.revokeObjectURL(prev);
    set({
      url: URL.createObjectURL(file),
      kind: file.type.startsWith("video") ? "video" : "image",
    });
  },
  setOpacity: (opacity) =>
    set({ opacity: Math.min(1, Math.max(0, opacity)) }),
  setFit: (fit) => set({ fit }),
  setZoom: (zoom) => set({ zoom: Math.min(3, Math.max(0.5, zoom)) }),
  setPosition: (position) => set({ position }),
  clear: () => {
    const prev = get().url;
    if (prev) URL.revokeObjectURL(prev);
    set({ url: null, kind: null });
  },
}));
