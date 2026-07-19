import {
  MeshGradient,
  GrainGradient,
  NeuroNoise,
  SmokeRing,
  Voronoi,
  Waves,
} from "@paper-design/shaders-react";
import type { Background, ShaderPresetId } from "@/model/types";

export const SHADER_PRESETS: { id: ShaderPresetId; label: string }[] = [
  { id: "mesh", label: "Mesh" },
  { id: "grain", label: "Grain" },
  { id: "neuro", label: "Neuro" },
  { id: "smoke", label: "Smoke" },
  { id: "voronoi", label: "Voronoi" },
  { id: "waves", label: "Waves" },
];

/** animated shader layer — fills its parent; parent must be position:relative/absolute */
export function ShaderBackground({
  background,
}: {
  background: Extract<Background, { kind: "shader" }>;
}) {
  const style = { position: "absolute", inset: 0, width: "100%", height: "100%" } as const;
  const colors = background.colors;
  const speed = background.speed;
  switch (background.preset) {
    case "mesh":
      return <MeshGradient style={style} colors={colors} speed={speed} />;
    case "grain":
      return <GrainGradient style={style} colors={colors} speed={speed} />;
    case "neuro":
      return <NeuroNoise style={style} colorFront={colors[0]} colorBack={colors[1]} speed={speed} />;
    case "smoke":
      return <SmokeRing style={style} colors={colors} speed={speed} />;
    case "voronoi":
      return <Voronoi style={style} colors={colors} speed={speed} />;
    case "waves":
      return <Waves style={style} colorFront={colors[0]} colorBack={colors[1]} />;
  }
}

export const SHADER_SNAPSHOT_ID = "lao-shader-snapshot";

/**
 * Hidden always-mounted shader instance. The export pipeline stamps its
 * WebGL canvas into each encoded frame (best-effort snapshot — shaders
 * animate in real time, not timeline time).
 */
export function ShaderSnapshotMount({
  background,
  aspect,
}: {
  background: Extract<Background, { kind: "shader" }>;
  aspect: number;
}) {
  const width = 640;
  return (
    <div
      id={SHADER_SNAPSHOT_ID}
      aria-hidden
      style={{
        position: "fixed",
        left: -10000,
        top: 0,
        width,
        height: Math.round(width / Math.max(aspect, 0.05)),
        pointerEvents: "none",
      }}
    >
      <ShaderBackground background={background} />
    </div>
  );
}

export function getShaderSnapshotCanvas(): HTMLCanvasElement | null {
  return document.querySelector(`#${SHADER_SNAPSHOT_ID} canvas`);
}
