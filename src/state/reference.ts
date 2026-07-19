import { create } from "zustand";

export type ReferenceKind = "image" | "video";

interface ReferenceState {
  url: string | null;
  kind: ReferenceKind | null;
  opacity: number;
  setReference: (file: File) => void;
  setOpacity: (opacity: number) => void;
  clear: () => void;
}

/** Reference attachment shown in preview mode. Never part of the document or exports. */
export const useReference = create<ReferenceState>((set, get) => ({
  url: null,
  kind: null,
  opacity: 1,
  setReference: (file) => {
    const prev = get().url;
    if (prev) URL.revokeObjectURL(prev);
    set({
      url: URL.createObjectURL(file),
      kind: file.type.startsWith("video") ? "video" : "image",
    });
  },
  setOpacity: (opacity) => set({ opacity }),
  clear: () => {
    const prev = get().url;
    if (prev) URL.revokeObjectURL(prev);
    set({ url: null, kind: null });
  },
}));
