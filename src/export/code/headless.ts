import type { Project } from "@/model/types";
import { analyzeProjectExport } from "@/export/code/capabilities";
import { emitProjectReact } from "@/export/code/emitReact";
import { emitProjectSvg, type EmitSvgOptions } from "@/export/code/emitSvg";
import { emitProjectSceneJson } from "@/export/code/sceneJson";

export type CodeExportFormat = "svg" | "tsx" | "json";

export interface HeadlessExportOptions extends EmitSvgOptions {
  format?: CodeExportFormat;
  baseUrl?: string;
}

const DEFAULT_BASE = "http://127.0.0.1:5173";

/** Pure path — no canvas text measurement or raster fallback. */
export function canExportInNode(project: Project): boolean {
  const caps = analyzeProjectExport(project);
  return !caps.needsPlaywright;
}

export async function exportProjectCode(
  project: Project,
  opts: HeadlessExportOptions = {},
): Promise<string> {
  if (canExportInNode(project)) {
    return emitCodeInNode(project, opts);
  }
  return emitCodeViaBrowser(project, opts);
}

export function emitCodeInNode(
  project: Project,
  opts: HeadlessExportOptions = {},
): string {
  const format = opts.format ?? "svg";
  if (format === "tsx") {
    return emitProjectReact(project, opts);
  }
  if (format === "json") {
    return emitProjectSceneJson(project, opts);
  }
  return emitProjectSvg(project, opts);
}

export async function emitCodeViaBrowser(
  project: Project,
  opts: HeadlessExportOptions = {},
): Promise<string> {
  const { chromium } = await import("playwright");
  const baseUrl = opts.baseUrl ?? DEFAULT_BASE;
  const browser = await chromium.launch({ headless: true });
  try {
    const page = await browser.newPage();
    await page.goto(baseUrl, { waitUntil: "networkidle", timeout: 60_000 });
    const format = opts.format ?? "svg";
    const payload = {
      project,
      opts: {
        transparent: opts.transparent,
        frame: opts.frame,
        animated: opts.animated,
      },
      format,
    };
    const result = await page.evaluate(async (data) => {
      const w = window as Window & {
        __laoExport?: {
          emitProjectSvg: (p: unknown, o?: unknown) => string;
          emitProjectReact: (p: unknown, o?: unknown) => string;
          emitProjectSceneJson?: (p: unknown, o?: unknown) => string;
        };
      };
      const exp = w.__laoExport;
      if (!exp) throw new Error("__laoExport bridge missing — reload dev server");
      if (data.format === "tsx") {
        return exp.emitProjectReact(data.project, data.opts);
      }
      if (data.format === "json") {
        if (!exp.emitProjectSceneJson) throw new Error("JSON export bridge missing");
        return exp.emitProjectSceneJson(data.project, data.opts);
      }
      return exp.emitProjectSvg(data.project, data.opts);
    }, payload);
    return result;
  } finally {
    await browser.close();
  }
}

export function describeProject(project: Project) {
  return analyzeProjectExport(project);
}
