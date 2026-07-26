import type { Background, BackgroundFit, ImageFilterId } from "@/model/types";

export type ImageBg = Extract<Background, { kind: "image" }>;

/** UI chips — None = plain image (no paper filter). */
export const IMAGE_FILTER_CHIPS: {
  id: ImageFilterId | "none";
  label: string;
}[] = [
  { id: "none", label: "None" },
  { id: "paper", label: "Paper" },
  { id: "fluted", label: "Fluted Glass" },
  { id: "water", label: "Water" },
  { id: "dither", label: "Image Dithering" },
];

export const IMAGE_FIT_OPTIONS: { id: BackgroundFit; label: string }[] = [
  { id: "fill", label: "Fill" },
  { id: "cover", label: "Cover" },
  { id: "contain", label: "Contain" },
  { id: "crop", label: "Crop" },
];

export type ImageFilterSliderDef = {
  key: string;
  label: string;
  min: number;
  max: number;
  step: number;
};

type FilterDefaults = {
  params: Record<string, number>;
  namedColors: Record<string, string>;
  sliders: ImageFilterSliderDef[];
  speed: number;
};

export const IMAGE_FILTER_DEFAULTS: Record<ImageFilterId, FilterDefaults> = {
  paper: {
    speed: 0,
    namedColors: { front: "#9fadbc", back: "#ffffff" },
    params: {
      scale: 0.6,
      contrast: 0.3,
      roughness: 0.4,
      fiber: 0.3,
      fiberSize: 0.2,
      crumples: 0.3,
      crumpleSize: 0.35,
      folds: 0.65,
      foldCount: 5,
      fade: 0,
      drops: 0.2,
      seed: 5.8,
      offsetX: 0,
      offsetY: 0,
    },
    sliders: [
      { key: "scale", label: "Scale", min: 0.01, max: 4, step: 0.01 },
      { key: "contrast", label: "Contrast", min: 0, max: 1, step: 0.01 },
      { key: "roughness", label: "Roughness", min: 0, max: 1, step: 0.01 },
      { key: "fiber", label: "Fiber", min: 0, max: 1, step: 0.01 },
      { key: "crumples", label: "Crumples", min: 0, max: 1, step: 0.01 },
      { key: "folds", label: "Folds", min: 0, max: 1, step: 0.01 },
      { key: "offsetX", label: "X Position", min: -1, max: 1, step: 0.01 },
      { key: "offsetY", label: "Y Position", min: -1, max: 1, step: 0.01 },
    ],
  },
  fluted: {
    speed: 0,
    namedColors: {
      back: "#00000000",
      shadow: "#000000",
      highlight: "#ffffff",
    },
    params: {
      scale: 1,
      shadows: 0.25,
      size: 0.5,
      angle: 0,
      highlights: 0.1,
      distortion: 0.5,
      shift: 0,
      blur: 0,
      edges: 0.25,
      offsetX: 0,
      offsetY: 0,
    },
    sliders: [
      { key: "scale", label: "Scale", min: 0.01, max: 4, step: 0.01 },
      { key: "distortion", label: "Distortion", min: 0, max: 1, step: 0.01 },
      { key: "size", label: "Size", min: 0, max: 1, step: 0.01 },
      { key: "blur", label: "Blur", min: 0, max: 1, step: 0.01 },
      { key: "shadows", label: "Shadows", min: 0, max: 1, step: 0.01 },
      { key: "highlights", label: "Highlights", min: 0, max: 1, step: 0.01 },
      { key: "offsetX", label: "X Position", min: -1, max: 1, step: 0.01 },
      { key: "offsetY", label: "Y Position", min: -1, max: 1, step: 0.01 },
    ],
  },
  water: {
    speed: 1,
    namedColors: { back: "#909090", highlight: "#ffffff" },
    params: {
      scale: 0.8,
      highlights: 0.07,
      layering: 0.5,
      edges: 0.8,
      waves: 0.3,
      caustic: 0.1,
      size: 1,
      offsetX: 0,
      offsetY: 0,
    },
    sliders: [
      { key: "scale", label: "Scale", min: 0.01, max: 4, step: 0.01 },
      { key: "waves", label: "Waves", min: 0, max: 1, step: 0.01 },
      { key: "caustic", label: "Caustic", min: 0, max: 1, step: 0.01 },
      { key: "highlights", label: "Highlights", min: 0, max: 1, step: 0.01 },
      { key: "layering", label: "Layering", min: 0, max: 1, step: 0.01 },
      { key: "size", label: "Size", min: 0.01, max: 3, step: 0.01 },
      { key: "offsetX", label: "X Position", min: -1, max: 1, step: 0.01 },
      { key: "offsetY", label: "Y Position", min: -1, max: 1, step: 0.01 },
    ],
  },
  dither: {
    speed: 0,
    namedColors: {
      front: "#94ffaf",
      back: "#000c38",
      highlight: "#eaff94",
    },
    params: {
      scale: 1,
      size: 2,
      colorSteps: 2,
      offsetX: 0,
      offsetY: 0,
    },
    sliders: [
      { key: "scale", label: "Scale", min: 0.01, max: 4, step: 0.01 },
      { key: "size", label: "Size", min: 0.5, max: 8, step: 0.1 },
      { key: "colorSteps", label: "Color steps", min: 2, max: 8, step: 1 },
      { key: "offsetX", label: "X Position", min: -1, max: 1, step: 0.01 },
      { key: "offsetY", label: "Y Position", min: -1, max: 1, step: 0.01 },
    ],
  },
};

export function makeEmptyImageBackground(
  fit: BackgroundFit = "cover",
): ImageBg {
  return {
    kind: "image",
    src: "",
    fit,
    resolution: "auto",
  };
}

export function applyImageFilter(
  bg: ImageBg,
  filter: ImageFilterId,
): ImageBg {
  const d = IMAGE_FILTER_DEFAULTS[filter];
  return {
    ...bg,
    filter,
    filterParams: { ...d.params },
    namedColors: { ...d.namedColors },
  };
}

/** Clear filter — plain image only. */
export function clearImageFilter(bg: ImageBg): ImageBg {
  return {
    kind: "image",
    src: bg.src,
    fit: bg.fit,
    position: bg.position,
    zoom: bg.zoom,
    resolution: bg.resolution,
  };
}

/** Focal point for object-position / drawImageFitted (center default). */
export function imagePosition(bg: ImageBg): { x: number; y: number } {
  return bg.position ?? { x: 0.5, y: 0.5 };
}

/** Extra scale on top of fit (1 = 100%). */
export function imageZoom(bg: ImageBg): number {
  return bg.zoom ?? 1;
}

export function cssObjectFit(fit: BackgroundFit): string {
  switch (fit) {
    case "fill":
      return "fill";
    case "contain":
      return "contain";
    case "crop":
      return "none";
    case "cover":
    default:
      return "cover";
  }
}

export function resolvedImageFilter(bg: ImageBg): {
  filter: ImageFilterId | null;
  params: Record<string, number>;
  namedColors: Record<string, string>;
  speed: number;
} {
  if (!bg.filter || !bg.src || !(bg.filter in IMAGE_FILTER_DEFAULTS)) {
    return { filter: null, params: {}, namedColors: {}, speed: 0 };
  }
  const d = IMAGE_FILTER_DEFAULTS[bg.filter];
  return {
    filter: bg.filter,
    params: { ...d.params, ...bg.filterParams },
    namedColors: { ...d.namedColors, ...bg.namedColors },
    speed: d.speed,
  };
}

export function imageFilterParam(bg: ImageBg, key: string): number {
  return resolvedImageFilter(bg).params[key] ?? 0;
}

export function hasImageFilter(bg: Background | undefined): boolean {
  return (
    bg?.kind === "image" && !!bg.src && !!bg.filter && bg.filter in IMAGE_FILTER_DEFAULTS
  );
}
