import type { Background, ShaderPresetId } from "@/model/types";

export type ShaderBg = Extract<Background, { kind: "shader" }>;

/** UI chips — Paper 27K-0 order. */
export const SHADER_PRESETS: { id: ShaderPresetId; label: string }[] = [
  { id: "aurora", label: "Aurora" },
  { id: "plasma", label: "Plasma Fluid" },
  { id: "nebula", label: "Nebula" },
  { id: "mesh", label: "Mesh Gradient" },
  { id: "clouds", label: "Clouds" },
];

export type ShaderSliderDef = {
  key: string;
  label: string;
  min: number;
  max: number;
  step: number;
};

type ShaderDefaults = {
  colors: string[];
  speed: number;
  params: Record<string, number>;
  namedColors: Record<string, string>;
  sliders: ShaderSliderDef[];
};

/** Fresh defaults when picking a preset (from @paper-design/shaders-react presets). */
export const SHADER_DEFAULTS: Record<ShaderPresetId, ShaderDefaults> = {
  aurora: {
    // GodRays · Ether
    colors: ["#148effa6", "#c4dffebe", "#232a47"],
    speed: 1,
    namedColors: { back: "#090f1d", bloom: "#ffffff" },
    params: {
      density: 0.03,
      spotty: 0.77,
      midSize: 0.1,
      midIntensity: 0.6,
      intensity: 0.6,
      bloom: 0.6,
      offsetX: -0.6,
      offsetY: 0,
      scale: 1,
    },
    sliders: [
      { key: "intensity", label: "Intensity", min: 0, max: 1, step: 0.01 },
      { key: "density", label: "Density", min: 0, max: 1, step: 0.01 },
      { key: "spotty", label: "Spotty", min: 0, max: 1, step: 0.01 },
      { key: "bloom", label: "Bloom", min: 0, max: 1, step: 0.01 },
      { key: "midSize", label: "Mid size", min: 0, max: 1, step: 0.01 },
      { key: "midIntensity", label: "Mid intensity", min: 0, max: 1, step: 0.01 },
    ],
  },
  plasma: {
    // Warp · Default
    colors: ["#121212", "#9470ff", "#121212", "#8838ff"],
    speed: 1,
    namedColors: {},
    params: {
      proportion: 0.45,
      softness: 1,
      distortion: 0.25,
      swirl: 0.8,
      swirlIterations: 10,
      shapeScale: 0.1,
      scale: 1,
    },
    sliders: [
      { key: "distortion", label: "Distortion", min: 0, max: 1, step: 0.01 },
      { key: "swirl", label: "Swirl", min: 0, max: 1, step: 0.01 },
      { key: "softness", label: "Softness", min: 0, max: 1, step: 0.01 },
      { key: "proportion", label: "Proportion", min: 0, max: 1, step: 0.01 },
      { key: "swirlIterations", label: "Swirl layers", min: 0, max: 20, step: 1 },
      { key: "shapeScale", label: "Shape scale", min: 0, max: 1, step: 0.01 },
    ],
  },
  nebula: {
    // NeuroNoise · Default
    colors: ["#ffffff", "#47a6ff", "#000000"],
    speed: 1,
    namedColors: {},
    params: {
      brightness: 0.05,
      contrast: 0.3,
      scale: 1,
    },
    sliders: [
      { key: "brightness", label: "Brightness", min: 0, max: 1, step: 0.01 },
      { key: "contrast", label: "Contrast", min: 0, max: 1, step: 0.01 },
      { key: "scale", label: "Scale", min: 0.01, max: 4, step: 0.01 },
    ],
  },
  mesh: {
    // MeshGradient · Default
    colors: ["#e0eaff", "#241d9a", "#f75092", "#9f50d3"],
    speed: 1,
    namedColors: {},
    params: {
      distortion: 0.8,
      swirl: 0.1,
      grainMixer: 0,
      grainOverlay: 0,
      scale: 1,
    },
    sliders: [
      { key: "distortion", label: "Distortion", min: 0, max: 1, step: 0.01 },
      { key: "swirl", label: "Swirl", min: 0, max: 1, step: 0.01 },
      { key: "grainMixer", label: "Grain mix", min: 0, max: 1, step: 0.01 },
      { key: "grainOverlay", label: "Grain overlay", min: 0, max: 1, step: 0.01 },
    ],
  },
  clouds: {
    // SmokeRing · Cloud
    colors: ["#ffffff"],
    speed: 0.5,
    namedColors: { back: "#81ADEC" },
    params: {
      noiseScale: 3,
      noiseIterations: 8,
      radius: 0.5,
      thickness: 0.65,
      innerShape: 0.85,
      scale: 2.5,
    },
    sliders: [
      { key: "thickness", label: "Thickness", min: 0.01, max: 1, step: 0.01 },
      { key: "radius", label: "Radius", min: 0, max: 1, step: 0.01 },
      { key: "innerShape", label: "Inner shape", min: 0, max: 4, step: 0.01 },
      { key: "noiseScale", label: "Noise scale", min: 0.01, max: 5, step: 0.01 },
      { key: "noiseIterations", label: "Noise layers", min: 1, max: 8, step: 1 },
      { key: "scale", label: "Scale", min: 0.01, max: 4, step: 0.01 },
    ],
  },
};

/** Legacy preset ids → current Paper chips (old .lao files). */
const LEGACY_MAP: Record<string, ShaderPresetId> = {
  grain: "mesh",
  neuro: "nebula",
  smoke: "clouds",
  voronoi: "plasma",
  waves: "aurora",
};

export function normalizeShaderPreset(id: string): ShaderPresetId {
  if (id in SHADER_DEFAULTS) return id as ShaderPresetId;
  return LEGACY_MAP[id] ?? "mesh";
}

export function makeShaderBackground(preset: ShaderPresetId): ShaderBg {
  const d = SHADER_DEFAULTS[preset];
  return {
    kind: "shader",
    preset,
    colors: [...d.colors],
    speed: d.speed,
    params: { ...d.params },
    namedColors: { ...d.namedColors },
  };
}

export function resolvedShader(bg: ShaderBg): {
  preset: ShaderPresetId;
  colors: string[];
  speed: number;
  params: Record<string, number>;
  namedColors: Record<string, string>;
} {
  const preset = normalizeShaderPreset(bg.preset);
  const d = SHADER_DEFAULTS[preset];
  return {
    preset,
    colors: bg.colors?.length ? bg.colors : d.colors,
    speed: bg.speed,
    params: { ...d.params, ...bg.params },
    namedColors: { ...d.namedColors, ...bg.namedColors },
  };
}

export function paramValue(bg: ShaderBg, key: string): number {
  const { params } = resolvedShader(bg);
  return params[key] ?? 0;
}
