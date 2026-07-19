import { useEffect, useRef } from "react";
import { useCurrentFrame } from "remotion";
import type { Project } from "@/model/types";
import { paintProjectFrame } from "@/engine/paintFrame";

export interface LaoCompositionProps {
  project: Project;
}

/**
 * Remotion composition: paints the project's resolved frame (full quality,
 * boil applied) onto a project-resolution canvas each frame.
 */
export function LaoComposition({ project }: LaoCompositionProps) {
  const frame = useCurrentFrame();
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    paintProjectFrame(ctx, project, frame);
  }, [project, frame]);

  return (
    <div style={{ width: "100%", height: "100%", background: "#141416" }}>
      <canvas
        ref={canvasRef}
        width={project.width}
        height={project.height}
        style={{ width: "100%", height: "100%", display: "block" }}
      />
    </div>
  );
}
