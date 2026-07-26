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

export type ExportFormat = "mp4" | "webm" | "gif" | "apng";

export interface ExportOptions {
  /** omit background — strokes only (WebM alpha / GIF / APNG transparency) */
  transparent?: boolean;
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
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d", { willReadFrequently: format === "gif" || format === "apng" })!;
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
    if (format === "apng") {
      return encodeApng(canvas, frameCount, fps, paint, onProgress);
    }

    if (format === "gif") {
      const gif = GIFEncoder();
      const delay = Math.round(1000 / fps);
      for (let f = 0; f < frameCount; f++) {
        await paint(f);
        const { data } = ctx.getImageData(0, 0, width, height);
        const palette = quantize(data, transparent ? 255 : 256, {
          format: transparent ? "rgba4444" : "rgb565",
          oneBitAlpha: transparent ? 128 : false,
        });
        const index = applyPalette(data, palette);
        gif.writeFrame(index, width, height, {
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
    const source = new CanvasSource(canvas, {
      codec: isMp4 ? "avc" : "vp9",
      bitrate: QUALITY_HIGH,
      ...(transparent && !isMp4
        ? { transform: { alpha: "keep" as const } }
        : {}),
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
