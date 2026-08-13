import type { Project } from "@/model/types";
import { analyzeProjectExport } from "@/export/code/capabilities";
import {
  buildLaoScene,
  type BuildSceneOptions,
} from "@/export/code/sceneJson";
import { renderSceneToSvg } from "@/export/code/sceneRender";
import type { ReactExportMode, SceneLoop } from "@/export/code/exportMeta";

export type SvgPlayMode = "auto" | "scroll";

export interface EmitSvgOptions extends BuildSceneOptions {
  /**
   * React wrapper playback: `auto` runs SMIL on mount;
   * `scroll` scrubs SVG time from viewport scroll progress.
   * Ignored for plain SVG files (SMIL always autoplays).
   */
  playMode?: SvgPlayMode;
  reactMode?: ReactExportMode;
  loop?: SceneLoop;
}

export function emitProjectSvg(project: Project, opts: EmitSvgOptions = {}): string {
  const transparent = opts.transparent ?? false;
  const animated = opts.animated ?? opts.frame === undefined;
  const scene = buildLaoScene(project, {
    transparent,
    animated,
    frame: animated ? undefined : (opts.frame ?? 0),
    loop: opts.loop ?? "once",
    idPrefix: opts.idPrefix,
  });
  return renderSceneToSvg(scene);
}

export function emitStaticFrameSvg(
  project: Project,
  frame: number,
  opts: { transparent?: boolean; loop?: SceneLoop; idPrefix?: string } = {},
): string {
  return emitProjectSvg(project, {
    transparent: opts.transparent,
    animated: false,
    frame,
    loop: opts.loop,
    idPrefix: opts.idPrefix,
  });
}

export function describeProjectExport(project: Project) {
  return analyzeProjectExport(project);
}
