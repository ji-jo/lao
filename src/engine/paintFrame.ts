import { resolveCel, type Project, type Stroke } from "@/model/types";
import { renderStrokes } from "@/engine/renderer";
import { boilDisplacement } from "@/engine/boil";
import { strokeAtTime } from "@/engine/strokeProgress";

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

function strokesForFrame(project: Project, frame: number, layerStrokes: Stroke[]): Stroke[] {
  if (project.workflow !== "animatron") return layerStrokes;
  const timeMs = (frame / Math.max(project.fps, 1)) * 1000;
  const out: Stroke[] = [];
  for (const s of layerStrokes) {
    const pts = strokeAtTime(s, timeMs);
    if (!pts || pts.length === 0) continue;
    out.push(pts === s.points ? s : { ...s, points: pts });
  }
  return out;
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
  opts: { clear?: boolean } = {},
) {
  const { width, height } = project;
  if (opts.clear !== false) ctx.clearRect(0, 0, width, height);

  const scratch = getCelCanvas(width, height);
  const scratchCtx = scratch.getContext("2d") as CanvasRenderingContext2D;

  for (const layer of project.layers) {
    if (!layer.visible) continue;
    // Animatron: art lives on each layer's first cel; stop-motion uses exposure
    const cel =
      project.workflow === "animatron"
        ? layer.frames.find((f) => f) ?? null
        : resolveCel(layer, frame);
    if (!cel || cel.strokes.length === 0) continue;
    const strokes = strokesForFrame(project, frame, cel.strokes);
    if (!strokes.length) continue;
    scratchCtx.clearRect(0, 0, width, height);
    renderStrokes(scratchCtx, strokes, {
      quality: "full",
      displaced: boilDisplacement(strokes, frame),
    });
    ctx.drawImage(scratch, 0, 0);
  }
}
