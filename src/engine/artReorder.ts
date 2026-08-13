export type ArtReorderWhere = "forward" | "backward" | "front" | "back";

/** Later in the array paints on top. `forward` = toward front, `backward` = toward back. */
export function reorderByIds<T extends { id: string }>(
  items: T[],
  ids: readonly string[],
  where: ArtReorderWhere,
): T[] {
  if (!items.length || !ids.length) return items;
  const idSet = new Set(ids);
  const selected = items.filter((it) => idSet.has(it.id));
  if (!selected.length) return items;

  if (where === "front") {
    const next = [...items.filter((it) => !idSet.has(it.id)), ...selected];
    return sameOrder(items, next) ? items : next;
  }
  if (where === "back") {
    const next = [...selected, ...items.filter((it) => !idSet.has(it.id))];
    return sameOrder(items, next) ? items : next;
  }

  const next = items.slice();
  if (where === "forward") {
    for (let i = next.length - 2; i >= 0; i--) {
      if (idSet.has(next[i]!.id) && !idSet.has(next[i + 1]!.id)) {
        [next[i], next[i + 1]] = [next[i + 1]!, next[i]!];
      }
    }
  } else {
    for (let i = 1; i < next.length; i++) {
      if (idSet.has(next[i]!.id) && !idSet.has(next[i - 1]!.id)) {
        [next[i], next[i - 1]] = [next[i - 1]!, next[i]!];
      }
    }
  }
  return sameOrder(items, next) ? items : next;
}

function sameOrder<T extends { id: string }>(a: T[], b: T[]): boolean {
  if (a === b) return true;
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i++) {
    if (a[i]!.id !== b[i]!.id) return false;
  }
  return true;
}
