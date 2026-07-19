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

export type ExportFormat = "mp4" | "webm" | "gif";

const FALLBACK_BACKGROUND = "#141416";

/**
 * Render every timeline frame at full quality (boil baked) and encode.
 * MP4/WebM go through mediabunny (WebCodecs, hardware-accelerated);
 * GIF through gifenc with a per-frame palette.
 */
export async function exportProject(
  project: Project,
  format: ExportFormat,
  onProgress?: (fraction: number) => void,
): Promise<Blob> {
  const { width, height, fps, frameCount } = project;
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d", { willReadFrequently: format === "gif" })!;

  // decode the background image up front so every frame gets it
  if (project.background?.kind === "image") {
    await loadBackgroundImage(project.background.src).catch(() => undefined);
  }
  const shaderCanvas =
    project.background?.kind === "shader" ? getShaderSnapshotCanvas() : null;

  function paint(frame: number) {
    ctx.clearRect(0, 0, width, height);
    const hasBg = paintBackground(ctx, project, { shaderCanvas });
    if (!hasBg) {
      ctx.fillStyle = FALLBACK_BACKGROUND;
      ctx.fillRect(0, 0, width, height);
    }
    paintProjectFrame(ctx, project, frame, { clear: false });
  }

  if (format === "gif") {
    const gif = GIFEncoder();
    const delay = Math.round(1000 / fps);
    for (let f = 0; f < frameCount; f++) {
      paint(f);
      const { data } = ctx.getImageData(0, 0, width, height);
      const palette = quantize(data, 256);
      const index = applyPalette(data, palette);
      gif.writeFrame(index, width, height, { palette, delay });
      onProgress?.((f + 1) / frameCount);
      await new Promise((r) => setTimeout(r, 0)); // keep the UI alive
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
  });
  output.addVideoTrack(source, { frameRate: fps });
  await output.start();

  const dur = 1 / fps;
  for (let f = 0; f < frameCount; f++) {
    paint(f);
    await source.add(f * dur, dur);
    onProgress?.((f + 1) / frameCount);
  }
  source.close();
  await output.finalize();

  const buffer = output.target.buffer!;
  return new Blob([buffer], { type: isMp4 ? "video/mp4" : "video/webm" });
}

export function downloadBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}
