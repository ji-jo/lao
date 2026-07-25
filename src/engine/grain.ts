import { mulberry32 } from "@/engine/boil";

const tileCache = new Map<number, HTMLCanvasElement>();

/** Seeded 64×64 grayscale grain tile — deterministic per stroke seed. */
export function grainTile(seed: number): HTMLCanvasElement {
  const key = seed >>> 0;
  let tile = tileCache.get(key);
  if (tile) return tile;

  tile = document.createElement("canvas");
  tile.width = 64;
  tile.height = 64;
  const ctx = tile.getContext("2d")!;
  const rand = mulberry32(key);
  const img = ctx.createImageData(64, 64);
  for (let i = 0; i < img.data.length; i += 4) {
    const v = 96 + (rand() - 0.5) * 110;
    const c = Math.max(0, Math.min(255, v));
    img.data[i] = c;
    img.data[i + 1] = c;
    img.data[i + 2] = c;
    img.data[i + 3] = 255;
  }
  ctx.putImageData(img, 0, 0);
  tileCache.set(key, tile);
  return tile;
}
