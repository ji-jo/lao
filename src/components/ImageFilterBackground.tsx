import type { CSSProperties } from "react";
import {
  PaperTexture,
  FlutedGlass,
  Water,
  ImageDithering,
} from "@paper-design/shaders-react";
import {
  resolvedImageFilter,
  type ImageBg,
} from "@/lib/image-filters";

const FILL: CSSProperties = {
  position: "absolute",
  inset: 0,
  width: "100%",
  height: "100%",
};

/**
 * Live paper-design image filter over `background.src`.
 * Parent must be position:relative/absolute with size.
 */
export function ImageFilterBackground({
  background,
  frame,
  speed,
}: {
  background: ImageBg;
  frame?: number;
  speed?: number;
}) {
  const { filter, params, namedColors, speed: defaultSpeed } =
    resolvedImageFilter(background);
  if (!filter || !background.src) return null;

  const motion = {
    speed: speed ?? defaultSpeed,
    frame,
  };
  // Paper image shaders only expose contain | cover.
  const fit = background.fit === "contain" ? "contain" : "cover";
  const image = background.src;

  switch (filter) {
    case "paper":
      return (
        <PaperTexture
          style={FILL}
          image={image}
          colorFront={namedColors.front}
          colorBack={namedColors.back}
          contrast={params.contrast}
          roughness={params.roughness}
          fiber={params.fiber}
          fiberSize={params.fiberSize}
          crumples={params.crumples}
          crumpleSize={params.crumpleSize}
          folds={params.folds}
          foldCount={params.foldCount}
          fade={params.fade}
          drops={params.drops}
          seed={params.seed}
          scale={params.scale}
          offsetX={params.offsetX}
          offsetY={params.offsetY}
          fit={fit}
          {...motion}
        />
      );
    case "fluted":
      return (
        <FlutedGlass
          style={FILL}
          image={image}
          colorBack={namedColors.back}
          colorShadow={namedColors.shadow}
          colorHighlight={namedColors.highlight}
          shadows={params.shadows}
          size={params.size}
          angle={params.angle}
          highlights={params.highlights}
          distortion={params.distortion}
          shift={params.shift}
          blur={params.blur}
          edges={params.edges}
          shape="lines"
          distortionShape="prism"
          scale={params.scale}
          offsetX={params.offsetX}
          offsetY={params.offsetY}
          fit={fit}
          {...motion}
        />
      );
    case "water":
      return (
        <Water
          style={FILL}
          image={image}
          colorBack={namedColors.back}
          colorHighlight={namedColors.highlight}
          highlights={params.highlights}
          layering={params.layering}
          edges={params.edges}
          waves={params.waves}
          caustic={params.caustic}
          size={params.size}
          scale={params.scale}
          offsetX={params.offsetX}
          offsetY={params.offsetY}
          fit={fit}
          {...motion}
        />
      );
    case "dither":
      return (
        <ImageDithering
          style={FILL}
          image={image}
          colorFront={namedColors.front}
          colorBack={namedColors.back}
          colorHighlight={namedColors.highlight}
          type="8x8"
          size={params.size}
          colorSteps={params.colorSteps}
          scale={params.scale}
          offsetX={params.offsetX}
          offsetY={params.offsetY}
          fit={fit}
          {...motion}
        />
      );
  }
}

export const IMAGE_FILTER_SNAPSHOT_ID = "lao-image-filter-snapshot";

/** Hidden live mount so draw/export can stamp the filtered WebGL canvas. */
export function ImageFilterSnapshotMount({
  background,
  aspect,
}: {
  background: ImageBg;
  aspect: number;
}) {
  const width = 640;
  const height = Math.round(width / Math.max(aspect, 0.05));
  return (
    <div
      id={IMAGE_FILTER_SNAPSHOT_ID}
      aria-hidden
      style={{
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
      <ImageFilterBackground
        key={`${background.filter}-${background.src.slice(0, 32)}`}
        background={background}
      />
    </div>
  );
}

export function getImageFilterSnapshotCanvas(): HTMLCanvasElement | null {
  return document.querySelector(`#${IMAGE_FILTER_SNAPSHOT_ID} canvas`);
}
