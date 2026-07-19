import { resolveCel, type Project } from "@/model/types";
import { renderStrokes } from "@/engine/renderer";
import { boilDisplacement } from "@/engine/boil";

let celCanvas: HTMLCanvasElement | OffscreenCanvas | null = null;

function getCelCanvas(w: number, h: number) {
  if (!celCanvas) {
    celCanvas =
      typeof OffscreenCanvas !== "undefined"
        ? new OffscreenCanvas(w, h)
        : document.createElement("canvas");
  }
  if (celCanvas.width !== w) celCanvas.width = w;
  if (celCanvas.height !== h) celCanvas.height = h;
  return celCanvas;
}

/**
 * Paint one timeline frame of the whole project at full quality with boil
 * applied — the single source of truth for preview playback AND export.
 * The context is expected to be project-resolution (width×height).
 * Background is left transparent; callers fill if they need opaque output.
 */
export function paintProjectFrame(
  ctx: CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D,
  project: Project,
  frame: number,
) {
  const { width, height } = project;
  ctx.clearRect(0, 0, width, height);

  const scratch = getCelCanvas(width, height);
  const scratchCtx = scratch.getContext("2d") as CanvasRenderingContext2D;

  for (const layer of project.layers) {
    if (!layer.visible) continue;
    const cel = resolveCel(layer, frame);
    if (!cel || cel.strokes.length === 0) continue;
    scratchCtx.clearRect(0, 0, width, height);
    renderStrokes(scratchCtx, cel.strokes, {
      quality: "full",
      displaced: boilDisplacement(cel.strokes, frame),
    });
    ctx.drawImage(scratch, 0, 0);
  }
}
