import type { Project } from "@/model/types";
import { analyzeProjectExport } from "@/export/code/capabilities";
import { buildLaoScene, type BuildSceneOptions } from "@/export/code/sceneJson";
import { renderSceneToSvg } from "@/export/code/sceneRender";

export type SvgPlayMode = "auto" | "scroll";

export interface EmitSvgOptions extends BuildSceneOptions {
  /**
   * React wrapper playback: `auto` runs SMIL on mount;
   * `scroll` scrubs SVG time from viewport scroll progress.
   * Ignored for plain SVG files (SMIL always autoplays).
   */
  playMode?: SvgPlayMode;
}

export function emitProjectSvg(project: Project, opts: EmitSvgOptions = {}): string {
  const transparent = opts.transparent ?? false;
  const animated = opts.animated ?? opts.frame === undefined;
  const scene = buildLaoScene(project, {
    transparent,
    animated,
    frame: animated ? undefined : (opts.frame ?? 0),
  });
  return renderSceneToSvg(scene);
}

export function emitStaticFrameSvg(
  project: Project,
  frame: number,
  opts: { transparent?: boolean } = {},
): string {
  return emitProjectSvg(project, {
    transparent: opts.transparent,
    animated: false,
    frame,
  });
}

export function describeProjectExport(project: Project) {
  return analyzeProjectExport(project);
}
