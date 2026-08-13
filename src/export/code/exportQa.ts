import type { LaoScene } from "@/export/code/sceneJson";
import { estimateGzipSize, recommendReactDelivery } from "@/export/code/exportMeta";

export interface ExportParityReport {
  width: number;
  height: number;
  viewBox: string;
  fps: number;
  frameCount: number;
  durationMs: number;
  loop: LaoScene["loop"];
  idPrefix: string;
  rawBytes: number;
  gzipBytes: number;
  usesSmil: boolean;
  recommendedReact: "inline-svg" | "external-svg";
  standaloneSvg: boolean;
}

export function inspectSvgExport(svg: string, scene: LaoScene): ExportParityReport {
  const rawBytes = new TextEncoder().encode(svg).length;
  return {
    width: scene.width,
    height: scene.height,
    viewBox: scene.viewBox,
    fps: scene.fps,
    frameCount: scene.frameCount,
    durationMs: scene.durationMs,
    loop: scene.loop,
    idPrefix: scene.idPrefix,
    rawBytes,
    gzipBytes: estimateGzipSize(rawBytes),
    usesSmil: /<animate\b|<set\b/.test(svg),
    recommendedReact: recommendReactDelivery(rawBytes),
    standaloneSvg:
      svg.includes("<?xml") &&
      svg.includes('xmlns="http://www.w3.org/2000/svg"') &&
      svg.includes("preserveAspectRatio") &&
      svg.includes("viewBox="),
  };
}

export function assertSceneParity(a: LaoScene, b: LaoScene): string[] {
  const errs: string[] = [];
  const keys = ["width", "height", "fps", "frameCount", "durationMs", "loop", "idPrefix", "viewBox"] as const;
  for (const k of keys) {
    if (a[k] !== b[k]) errs.push(`${k}: ${String(a[k])} !== ${String(b[k])}`);
  }
  return errs;
}
