import {
  BufferTarget,
  CanvasSource,
  Mp4OutputFormat,
  Output,
  QUALITY_HIGH,
  WebMOutputFormat,
} from "mediabunny";
import { GIFEncoder, quantize, applyPalette } from "gifenc";
import type { Project } from "@/model/types";
import { paintProjectFrame } from "@/engine/paintFrame";
import { paintBackground, loadBackgroundImage } from "@/engine/background";
import { getShaderSnapshotCanvas } from "@/components/ShaderBackground";
import { getImageFilterSnapshotCanvas } from "@/components/ImageFilterBackground";
import { hasImageFilter } from "@/lib/image-filters";
import {
  endShaderExport,
  setShaderExportFrame,
  waitForShaderRender,
} from "@/export/shaderExport";
import { encodeApng } from "@/export/apng";

export type ExportFormat = "mp4" | "webm" | "gif" | "apng" | "png";

export interface ExportOptions {
  /** omit background — strokes only (WebM/PNG/GIF/APNG transparency) */
  transparent?: boolean;
  /**
   * Output size in px; defaults to the project canvas size. The scene is
   * always painted in project space and uniformly scaled to this box, so the
   * caller must keep the project's aspect ratio (the export dialog derives
   * these from Quality × canvas aspect). Never resize `project.width/height`
   * to change export resolution — strokes are stored in canvas coordinates,
   * so that crops the drawing instead of scaling it.
   */
  width?: number;
  height?: number;
  /** Still PNG: which timeline frame to composite. Defaults to 0. */
  frame?: number;
}

const FALLBACK_BACKGROUND = "#141416";

/**
 * Render every timeline frame at full quality (boil baked) and encode.
 * MP4/WebM go through mediabunny (WebCodecs, hardware-accelerated);
 * GIF/APNG through gifenc / hand-rolled APNG.
 */
export async function exportProject(
  project: Project,
  format: ExportFormat,
  onProgress?: (fraction: number) => void,
  opts: ExportOptions = {},
): Promise<Blob> {
  const { width, height, fps, frameCount } = project;
  const transparent = opts.transparent ?? false;
  const outW = Math.max(2, Math.round(opts.width ?? width));
  const outH = Math.max(2, Math.round(opts.height ?? height));
  const canvas = document.createElement("canvas");
  canvas.width = outW;
  canvas.height = outH;
  const ctx = canvas.getContext("2d", {
    alpha: true,
    willReadFrequently: format === "gif" || format === "apng",
  })!;
  // paint in project space, scaled once to the output box — clearRect/fillRect
  // below use project coords and still cover the full canvas through this
  ctx.scale(outW / width, outH / height);
  const shaderBg = !transparent && project.background?.kind === "shader";

  if (project.background?.kind === "image") {
    await loadBackgroundImage(project.background.src).catch(() => undefined);
  }

  async function resolveShaderCanvas(frame: number): Promise<HTMLCanvasElement | null> {
    if (!shaderBg || !project.background || project.background.kind !== "shader") return null;
    const frameMs = (frame / Math.max(fps, 1)) * 1000 * project.background.speed;
    setShaderExportFrame(frameMs, width, height);
    await waitForShaderRender();
    return getShaderSnapshotCanvas();
  }

  async function paint(frame: number) {
    ctx.clearRect(0, 0, width, height);
    if (!transparent) {
      const shaderCanvas = shaderBg ? await resolveShaderCanvas(frame) : null;
      const imageFilterCanvas = hasImageFilter(project.background)
        ? getImageFilterSnapshotCanvas()
        : null;
      const hasBg = paintBackground(ctx, project, {
        shaderCanvas,
        imageFilterCanvas,
      });
      if (!hasBg) {
        ctx.fillStyle = FALLBACK_BACKGROUND;
        ctx.fillRect(0, 0, width, height);
      }
    }
    paintProjectFrame(ctx, project, frame, { clear: false });
  }

  try {
    if (format === "png") {
      const frame = Math.min(
        Math.max(0, Math.round(opts.frame ?? 0)),
        Math.max(0, frameCount - 1),
      );
      await paint(frame);
      onProgress?.(1);
      const blob = await new Promise<Blob>((resolve, reject) => {
        canvas.toBlob(
          (b) => (b ? resolve(b) : reject(new Error("Failed to encode PNG"))),
          "image/png",
        );
      });
      return blob;
    }

    if (format === "apng") {
      return encodeApng(canvas, frameCount, fps, paint, onProgress);
    }

    if (format === "gif") {
      const gif = GIFEncoder();
      const delay = Math.round(1000 / fps);
      for (let f = 0; f < frameCount; f++) {
        await paint(f);
        // getImageData ignores the transform — read the real output pixels
        const { data } = ctx.getImageData(0, 0, outW, outH);
        const palette = quantize(data, transparent ? 255 : 256, {
          format: transparent ? "rgba4444" : "rgb565",
          oneBitAlpha: transparent ? 128 : false,
        });
        const index = applyPalette(data, palette);
        gif.writeFrame(index, outW, outH, {
          palette,
          delay,
          transparent: transparent || undefined,
          transparentIndex: transparent ? 0 : undefined,
        });
        onProgress?.((f + 1) / frameCount);
        await new Promise((r) => setTimeout(r, 0));
      }
      gif.finish();
      return new Blob([gif.bytes()], { type: "image/gif" });
    }

    const isMp4 = format === "mp4";
    const output = new Output({
      format: isMp4 ? new Mp4OutputFormat() : new WebMOutputFormat(),
      target: new BufferTarget(),
    });
    const keepAlpha = Boolean(transparent && !isMp4);
    const source = new CanvasSource(canvas, {
      codec: isMp4 ? "avc" : "vp9",
      bitrate: QUALITY_HIGH,
      alpha: keepAlpha ? "keep" : "discard",
      ...(keepAlpha ? { transform: { alpha: "keep" as const } } : {}),
    });
    output.addVideoTrack(source, { frameRate: fps });
    await output.start();

    const dur = 1 / fps;
    for (let f = 0; f < frameCount; f++) {
      await paint(f);
      await source.add(f * dur, dur);
      onProgress?.((f + 1) / frameCount);
    }
    source.close();
    await output.finalize();

    const buffer = output.target.buffer!;
    return new Blob([buffer], { type: isMp4 ? "video/mp4" : "video/webm" });
  } finally {
    if (shaderBg) endShaderExport();
  }
}

export function downloadBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}
