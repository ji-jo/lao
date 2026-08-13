import type { StrokePoint } from "@/model/types";

/** Live Leafer transform preview so canvas ink follows the purple editor box. */
export type ShapeLivePreview = {
  id: string;
  points: StrokePoint[];
  shapeBox: { x: number; y: number; w: number; h: number; rotation?: number };
};

let shapeLivePreview: ShapeLivePreview | null = null;
const listeners = new Set<() => void>();

export function setShapeLivePreview(next: ShapeLivePreview | null): void {
  if (next && next.points.length < 1) next = null;
  shapeLivePreview = next;
  for (const fn of listeners) fn();
}

export function getShapeLivePreview(): ShapeLivePreview | null {
  return shapeLivePreview;
}

export function subscribeShapeLivePreview(fn: () => void): () => void {
  listeners.add(fn);
  return () => {
    listeners.delete(fn);
  };
}
