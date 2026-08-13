import {
  MeshGradient,
  NeuroNoise,
  SmokeRing,
  GodRays,
  Warp,
  GrainGradient,
  Voronoi,
  Waves,
} from "@paper-design/shaders-react";
import { useEffect, useState } from "react";
import {
  getShaderExportState,
  subscribeShaderExport,
} from "@/export/shaderExport";
import {
  normalizeShaderPreset,
  resolvedShader,
  SHADER_PRESETS,
  type ShaderBg,
} from "@/lib/shader-presets";

export { SHADER_PRESETS };

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
  const style = {
    position: "absolute",
    inset: 0,
    width: "100%",
    height: "100%",
  } as const;

  const motion = {
    speed: speed ?? background.speed,
    frame,
  };

  // Legacy presets keep their original components so old .lao files look right.
  switch (background.preset) {
    case "grain":
      return (
        <GrainGradient style={style} colors={background.colors} {...motion} />
      );
    case "voronoi":
      return <Voronoi style={style} colors={background.colors} {...motion} />;
    case "waves":
      return (
        <Waves
          style={style}
          colorFront={background.colors[0]}
          colorBack={background.colors[1]}
          {...motion}
        />
      );
    case "neuro":
      return (
        <NeuroNoise
          style={style}
          colorFront={background.colors[0]}
          colorBack={background.colors[1]}
          {...motion}
        />
      );
    case "smoke":
      return <SmokeRing style={style} colors={background.colors} {...motion} />;
    default:
      break;
  }

  const resolved = resolvedShader(background);
  const { colors, params, namedColors } = resolved;
  const preset = normalizeShaderPreset(background.preset);

  switch (preset) {
    case "aurora":
      return (
        <GodRays
          style={style}
          colors={colors}
          colorBack={namedColors.back}
          colorBloom={namedColors.bloom}
          density={params.density}
          spotty={params.spotty}
          midSize={params.midSize}
          midIntensity={params.midIntensity}
          intensity={params.intensity}
          bloom={params.bloom}
          offsetX={params.offsetX}
          offsetY={params.offsetY}
          scale={params.scale}
          {...motion}
        />
      );
    case "plasma":
      return (
        <Warp
          style={style}
          colors={colors}
          proportion={params.proportion}
          softness={params.softness}
          distortion={params.distortion}
          swirl={params.swirl}
          swirlIterations={params.swirlIterations}
          shapeScale={params.shapeScale}
          shape="checks"
          scale={params.scale}
          {...motion}
        />
      );
    case "nebula":
      return (
        <NeuroNoise
          style={style}
          colorFront={colors[0]}
          colorMid={colors[1]}
          colorBack={colors[2] ?? "#000000"}
          brightness={params.brightness}
          contrast={params.contrast}
          scale={params.scale}
          {...motion}
        />
      );
    case "mesh":
      return (
        <MeshGradient
          style={style}
          colors={colors}
          distortion={params.distortion}
          swirl={params.swirl}
          grainMixer={params.grainMixer}
          grainOverlay={params.grainOverlay}
          scale={params.scale}
          {...motion}
        />
      );
    case "clouds":
      return (
        <SmokeRing
          style={style}
          colors={colors}
          colorBack={namedColors.back}
          noiseScale={params.noiseScale}
          noiseIterations={params.noiseIterations}
          radius={params.radius}
          thickness={params.thickness}
          innerShape={params.innerShape}
          scale={params.scale}
          {...motion}
        />
      );
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
    () =>
      subscribeShaderExport(() => setExportState({ ...getShaderExportState() })),
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
        // Keep in-viewport (opacity 0) — off-canvas mounts often pause WebGL.
        position: "fixed",
        left: 0,
        top: 0,
        width,
        height,
        opacity: 0,
        pointerEvents: "none",
        zIndex: -1,
        overflow: "hidden",
      }}
    >
      <ShaderBackground
        key={normalizeShaderPreset(background.preset)}
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
