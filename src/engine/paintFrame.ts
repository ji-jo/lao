import { resolveCel, type Project, type Stroke } from "@/model/types";
import { renderStrokes, renderTexts } from "@/engine/renderer";
import { boilDisplacement } from "@/engine/boil";
import { clipFadeOpacity, strokeAtTime } from "@/engine/strokeProgress";

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
 */
export function paintProjectFrame(
  ctx: CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D,
  project: Project,
  frame: number,
  opts: { clear?: boolean } = {},
) {
  const { width, height, fps } = project;
  if (opts.clear !== false) ctx.clearRect(0, 0, width, height);

  const scratch = getCelCanvas(width, height);
  const scratchCtx = scratch.getContext("2d") as CanvasRenderingContext2D;
  const timeMs = (frame / Math.max(fps, 1)) * 1000;

  for (const layer of project.layers) {
    if (!layer.visible) continue;
    const cel =
      project.workflow === "animatron"
        ? layer.frames.find((f) => f) ?? null
        : resolveCel(layer, frame);
    if (!cel || (cel.strokes.length === 0 && (!cel.texts || cel.texts.length === 0))) continue;
    const strokes = strokesForFrame(project, frame, cel.strokes);
    const hasContent = strokes.length > 0 || (cel.texts && cel.texts.length > 0);
    if (!hasContent) continue;

    if (project.workflow === "animatron") {
      for (const s of strokes) {
        const alpha = clipFadeOpacity(s, timeMs, fps);
        if (alpha <= 0) continue;
        scratchCtx.clearRect(0, 0, width, height);
        renderStrokes(scratchCtx, [s], {
          quality: "full",
          displaced: boilDisplacement([s], frame, project.boil),
        });
        ctx.save();
        ctx.globalAlpha = alpha;
        ctx.drawImage(scratch, 0, 0);
        ctx.restore();
      }
      if (cel.texts && cel.texts.length > 0) {
        scratchCtx.clearRect(0, 0, width, height);
        renderTexts(scratchCtx, cel.texts, { quality: "full" });
        ctx.drawImage(scratch, 0, 0);
      }
    } else {
      scratchCtx.clearRect(0, 0, width, height);
      renderStrokes(scratchCtx, strokes, {
        quality: "full",
        displaced: boilDisplacement(strokes, frame, project.boil),
      });
      if (cel.texts) renderTexts(scratchCtx, cel.texts, { quality: "full" });
      ctx.drawImage(scratch, 0, 0);
    }
  }
}
