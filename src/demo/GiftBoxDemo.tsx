/**
 * Preview-style (debug / Remotion Player) interactive gift-box demo.
 * Same surface as lao PreviewStage — playable proof that anybody can animate.
 */
import { Player } from "@remotion/player";
import { AbsoluteFill, useCurrentFrame } from "remotion";
import { useEffect, useMemo, useRef } from "react";
import type { Project } from "@/model/types";
import { paintProjectFrame } from "@/engine/paintFrame";
import { paintBackground } from "@/engine/background";
import {
  createGiftBoxDemoProject,
  DEMO_FPS,
  DEMO_FRAMES,
  DEMO_H,
  DEMO_W,
} from "@/demo/giftBoxProject";

function DemoComposition({ project }: { project: Project }) {
  const frame = useCurrentFrame();
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    ctx.clearRect(0, 0, project.width, project.height);
    paintBackground(ctx, project, {});
    paintProjectFrame(ctx, project, frame, { clear: false });
  }, [project, frame]);

  return (
    <AbsoluteFill style={{ background: "#141416" }}>
      <canvas
        ref={canvasRef}
        width={project.width}
        height={project.height}
        style={{ width: "100%", height: "100%", display: "block" }}
      />
    </AbsoluteFill>
  );
}

export default function GiftBoxDemo() {
  const project = useMemo(() => createGiftBoxDemoProject(), []);

  return (
    <div
      style={{
        position: "relative",
        display: "flex",
        height: "100%",
        width: "100%",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        gap: 18,
        background: "#0b0b0d",
      }}
    >
      <div
        style={{
          color: "rgba(244,244,245,0.55)",
          fontFamily: "Geist, Inter, system-ui, sans-serif",
          fontSize: 13,
          letterSpacing: 0.4,
        }}
      >
        lao · gift box stop-motion demo
      </div>
      <div
        style={{
          width: "100%",
          maxWidth: "min(96vw, 1282px)",
          overflow: "hidden",
          borderRadius: 16,
          border: "1px solid rgba(255,255,255,0.08)",
          boxShadow: "0 24px 80px rgba(0,0,0,0.55)",
        }}
      >
        <Player
          acknowledgeRemotionLicense
          component={DemoComposition}
          inputProps={{ project }}
          durationInFrames={DEMO_FRAMES}
          compositionWidth={DEMO_W}
          compositionHeight={DEMO_H}
          fps={DEMO_FPS}
          loop
          autoPlay
          controls
          style={{ width: "100%" }}
        />
      </div>
    </div>
  );
}
