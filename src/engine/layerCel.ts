import {
  resolveCel,
  type Frame,
  type Layer,
  type Project,
} from "@/model/types";

/** Cel content for a layer at the current timeline frame (Animatron = sparse path cel). */
export function celForLayer(
  project: Project,
  layer: Layer,
  frameIndex: number,
): Frame | null {
  if (project.workflow === "animatron") {
    return layer.frames.find((f) => f) ?? null;
  }
  return resolveCel(layer, frameIndex);
}

/** Selectable element ids on the given layers at `frameIndex`. */
export function selectableIdsInLayers(
  project: Project,
  frameIndex: number,
  layerIndices: number[],
): string[] {
  const ids: string[] = [];
  for (const li of layerIndices) {
    const layer = project.layers[li];
    if (!layer?.visible) continue;
    const cel = celForLayer(project, layer, frameIndex);
    if (!cel) continue;
    for (const s of cel.strokes) ids.push(s.id);
    for (const t of cel.texts ?? []) ids.push(t.id);
    for (const im of cel.images ?? []) ids.push(im.id);
  }
  return ids;
}
