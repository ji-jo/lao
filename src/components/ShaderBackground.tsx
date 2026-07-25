import {
  MeshGradient,
  GrainGradient,
  NeuroNoise,
  SmokeRing,
  Voronoi,
  Waves,
} from "@paper-design/shaders-react";
import { useEffect, useState } from "react";
import type { Background, ShaderPresetId } from "@/model/types";
import {
  getShaderExportState,
  subscribeShaderExport,
} from "@/export/shaderExport";

export const SHADER_PRESETS: { id: ShaderPresetId; label: string }[] = [
  { id: "mesh", label: "Mesh" },
  { id: "grain", label: "Grain" },
  { id: "neuro", label: "Neuro" },
  { id: "smoke", label: "Smoke" },
  { id: "voronoi", label: "Voronoi" },
  { id: "waves", label: "Waves" },
];

type ShaderBg = Extract<Background, { kind: "shader" }>;

/** animated shader layer — fills its parent; parent must be position:relative/absolute */
export function ShaderBackground({
  background,
  frame,
  speed,
}: {
  background: ShaderBg;
  /** deterministic time in ms (export); omit for live playback */
  frame?: number;
  /** override speed; pass 0 during export */
  speed?: number;
}) {
  const style = { position: "absolute", inset: 0, width: "100%", height: "100%" } as const;
  const colors = background.colors;
  const motion = {
    speed: speed ?? background.speed,
    frame,
  };
  switch (background.preset) {
    case "mesh":
      return <MeshGradient style={style} colors={colors} {...motion} />;
    case "grain":
      return <GrainGradient style={style} colors={colors} {...motion} />;
    case "neuro":
      return (
        <NeuroNoise style={style} colorFront={colors[0]} colorBack={colors[1]} {...motion} />
      );
    case "smoke":
      return <SmokeRing style={style} colors={colors} {...motion} />;
    case "voronoi":
      return <Voronoi style={style} colors={colors} {...motion} />;
    case "waves":
      return <Waves style={style} colorFront={colors[0]} colorBack={colors[1]} {...motion} />;
  }
}

export const SHADER_SNAPSHOT_ID = "lao-shader-snapshot";

/**
 * Hidden always-mounted shader instance. Export drives `frame` (ms) with speed=0
 * for deterministic per-frame backgrounds; live mode animates normally.
 */
export function ShaderSnapshotMount({
  background,
  aspect,
}: {
  background: ShaderBg;
  aspect: number;
}) {
  const [exportState, setExportState] = useState(getShaderExportState);
  useEffect(
    () => subscribeShaderExport(() => setExportState({ ...getShaderExportState() })),
    [],
  );

  const width = exportState.active ? exportState.width : 640;
  const height = exportState.active
    ? exportState.height
    : Math.round(width / Math.max(aspect, 0.05));

  return (
    <div
      id={SHADER_SNAPSHOT_ID}
      aria-hidden
      style={{
        position: "fixed",
        left: -10000,
        top: 0,
        width,
        height,
        pointerEvents: "none",
      }}
    >
      <ShaderBackground
        background={background}
        frame={exportState.active ? exportState.frameMs : undefined}
        speed={exportState.active ? 0 : undefined}
      />
    </div>
  );
}

export function getShaderSnapshotCanvas(): HTMLCanvasElement | null {
  return document.querySelector(`#${SHADER_SNAPSHOT_ID} canvas`);
}
