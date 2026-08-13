import type { Project, Stroke, StrokePoint } from "@/model/types";
import { renderStrokes } from "@/engine/renderer";
import { strokeToPathD } from "@/export/code/svgGeometry";
import { tag } from "@/export/code/svgDoc";

export function canvasToPngDataUrl(canvas: HTMLCanvasElement): string {
  return canvas.toDataURL("image/png");
}

/** Paint strokes into a transparent canvas at project resolution. */
export function paintStrokesToCanvas(
  project: Project,
  strokes: Stroke[],
  displaced: Map<string, StrokePoint[]>,
): HTMLCanvasElement {
  const canvas = document.createElement("canvas");
  canvas.width = project.width;
  canvas.height = project.height;
  const ctx = canvas.getContext("2d")!;
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  renderStrokes(ctx, strokes, {
    quality: "full",
    displaced,
    eraseAsMask: false,
  });
  return canvas;
}

export function emitRasterImage(
  dataUrl: string,
  width: number,
  height: number,
  x = 0,
  y = 0,
): string {
  return tag("image", {
    x,
    y,
    width,
    height,
    href: dataUrl,
    preserveAspectRatio: "none",
  });
}

export function rasterizeStrokeBatch(
  project: Project,
  strokes: Stroke[],
  displaced: Map<string, StrokePoint[]>,
): string {
  const canvas = paintStrokesToCanvas(project, strokes, displaced);
  return emitRasterImage(
    canvasToPngDataUrl(canvas),
    project.width,
    project.height,
  );
}

/** White canvas mask with black eraser ribbons — equivalent to destination-out. */
export function eraserMaskDef(
  maskId: string,
  eraserStrokes: Stroke[],
  displaced: Map<string, StrokePoint[]>,
): string {
  const cuts = eraserStrokes
    .map((s) => {
      const pts = displaced.get(s.id) ?? s.points;
      const d = strokeToPathD(s, pts);
      if (!d) return "";
      return tag("path", { d, fill: "black" });
    })
    .join("");
  return tag(
    "mask",
    { id: maskId },
    tag("rect", { width: "100%", height: "100%", fill: "white" }) + cuts,
  );
}

export function wrapWithEraserMask(
  body: string,
  maskId: string,
  eraserStrokes: Stroke[],
  displaced: Map<string, StrokePoint[]>,
): { defs: string; body: string } {
  if (!body || eraserStrokes.length === 0) return { defs: "", body };
  const defs = eraserMaskDef(maskId, eraserStrokes, displaced);
  return {
    defs,
    body: tag("g", { mask: `url(#${maskId})` }, body),
  };
}
