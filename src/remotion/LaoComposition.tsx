import { useEffect, useRef } from "react";
import { useCurrentFrame } from "remotion";
import type { Project } from "@/model/types";
import { paintProjectFrame } from "@/engine/paintFrame";
import { paintBackground } from "@/engine/background";
import { ShaderBackground } from "@/components/ShaderBackground";
import { ImageFilterBackground } from "@/components/ImageFilterBackground";
import { hasImageFilter } from "@/lib/image-filters";

export interface LaoCompositionProps {
  project: Project;
}

/**
 * Remotion composition: paints the project's resolved frame (full quality,
 * boil applied) onto a project-resolution canvas each frame. Shader /
 * image-filter backgrounds render as a live DOM layer beneath the canvas;
 * other background kinds are painted into the canvas itself.
 */
export function LaoComposition({ project }: LaoCompositionProps) {
  const frame = useCurrentFrame();
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const isShader = project.background?.kind === "shader";
  const isImageFilter = hasImageFilter(project.background);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    function paint() {
      if (!ctx) return;
      ctx.clearRect(0, 0, project.width, project.height);
      if (!isShader && !isImageFilter) {
        paintBackground(ctx, project, { onImageReady: paint });
      }
      paintProjectFrame(ctx, project, frame, { clear: false });
    }
    paint();
  }, [project, frame, isShader, isImageFilter]);

  return (
    <div style={{ position: "relative", width: "100%", height: "100%", background: "#141416" }}>
      {isShader && project.background?.kind === "shader" && (
        <ShaderBackground background={project.background} />
      )}
      {isImageFilter && project.background?.kind === "image" && (
        <ImageFilterBackground background={project.background} />
      )}
      <canvas
        ref={canvasRef}
        width={project.width}
        height={project.height}
        style={{ position: "absolute", inset: 0, width: "100%", height: "100%", display: "block" }}
      />
    </div>
  );
}
