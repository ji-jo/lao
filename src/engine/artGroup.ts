import { celForLayer } from "@/engine/layerCel";
import type { Project } from "@/model/types";

export function indexArtGroups(
  project: Project,
  frameIndex: number,
): {
  groupOf: Map<string, string>;
  members: Map<string, string[]>;
} {
  const groupOf = new Map<string, string>();
  const members = new Map<string, string[]>();
  for (const layer of project.layers) {
    if (!layer.visible) continue;
    const cel = celForLayer(project, layer, frameIndex);
    if (!cel) continue;
    const items = [
      ...cel.strokes,
      ...(cel.texts ?? []),
      ...(cel.images ?? []),
    ];
    for (const it of items) {
      if (!it.groupId) continue;
      groupOf.set(it.id, it.groupId);
      const list = members.get(it.groupId) ?? [];
      list.push(it.id);
      members.set(it.groupId, list);
    }
  }
  return { groupOf, members };
}

/** Expand a click/marquee set so grouped members stay selected together. */
export function expandSelectionByGroups(
  ids: string[],
  project: Project,
  frameIndex: number,
): string[] {
  if (ids.length === 0) return ids;
  const { groupOf, members } = indexArtGroups(project, frameIndex);
  const out = new Set<string>();
  for (const id of ids) {
    const gid = groupOf.get(id);
    if (!gid) {
      out.add(id);
      continue;
    }
    for (const m of members.get(gid) ?? [id]) out.add(m);
  }
  return [...out];
}
