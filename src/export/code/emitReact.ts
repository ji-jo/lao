import type { Project } from "@/model/types";
import type { EmitSvgOptions, SvgPlayMode } from "@/export/code/emitSvg";
import { emitProjectSvg } from "@/export/code/emitSvg";
import { buildLaoScene } from "@/export/code/sceneJson";
import { prettyJsx, svgToJsx } from "@/export/code/svgToJsx";
import {
  formatExportUsage,
  recommendReactDelivery,
  INLINE_SVG_WARN_BYTES,
  type ReactExportMode,
  type SceneLoop,
} from "@/export/code/exportMeta";

function safeComponentName(name: string, fallback = "LaoAnimation"): string {
  const cleaned = (name || fallback).replace(/[^\w]/g, "") || fallback;
  if (/^[A-Z]/.test(cleaned)) return cleaned;
  return `Lao${cleaned.charAt(0).toUpperCase()}${cleaned.slice(1)}`;
}

function extractSvgRoot(jsx: string): { inner: string; viewBox: string } {
  const trimmed = jsx.trim();
  const open = trimmed.match(/^<svg\b([^>]*)>/);
  const innerMatch = trimmed.match(/^<svg\b[^>]*>([\s\S]*)<\/svg>\s*$/);
  const attrs = open?.[1] ?? "";
  const vb = attrs.match(/viewBox=\{("([^"]*)"|'([^']*)')\}/);
  const viewBox = vb?.[2] ?? vb?.[3] ?? "";
  return { inner: innerMatch?.[1] ?? "", viewBox };
}

function indentBlock(jsx: string, spaces: number): string {
  const pad = " ".repeat(spaces);
  return jsx
    .split("\n")
    .map((line) => (line.length ? pad + line : line))
    .join("\n");
}

function fileHeader(opts: {
  durationMs: number;
  loop: SceneLoop;
  width: number;
  height: number;
  fps: number;
  frameCount: number;
  mode: ReactExportMode;
  heavy?: boolean;
}): string {
  const dur = `${(opts.durationMs / 1000).toFixed(3).replace(/0+$/, "").replace(/\.$/, "")}s`;
  const warn = opts.heavy
    ? "\n * WARNING: Inline SVG is large — prefer External SVG mode for web delivery."
    : "";
  return `/**
 * ${formatExportUsage("tsx")}
 * Canvas ${opts.width}×${opts.height} · ${opts.fps} fps · ${opts.frameCount} frames · ${dur} · loop: ${opts.loop}
 * Mode: ${opts.mode}. Props: className, loop, paused, playbackRate.${warn}
 */`;
}

function playbackHook(durationSec: number, bakedLoop: SceneLoop, loopType: string): string {
  return `  const ref = useRef<SVGSVGElement>(null);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const durationSec = ${JSON.stringify(durationSec)};
    const anims = () => Array.from(el.querySelectorAll("animate, set")) as SVGAnimationElement[];
    if (loop === "infinite") {
      anims().forEach((n) => n.setAttribute("repeatCount", "indefinite"));
    } else if (loop === "once") {
      anims().forEach((n) => {
        n.removeAttribute("repeatCount");
        n.setAttribute("fill", "freeze");
      });
    }
    el.setCurrentTime?.(0);
    const spanFor = (mode: ${loopType}) =>
      Math.max((mode === "ping-pong" ? durationSec * 2 : durationSec) || 1, 0.001);
    if (playMode === "scroll") {
      el.pauseAnimations?.();
      const scrub = () => {
        const rect = el.getBoundingClientRect();
        const vh = window.innerHeight || 1;
        const p = Math.min(1, Math.max(0, (vh - rect.top) / (vh + rect.height || 1)));
        el.setCurrentTime?.(p * spanFor(loop ?? ${JSON.stringify(bakedLoop)}));
      };
      scrub();
      window.addEventListener("scroll", scrub, { passive: true });
      window.addEventListener("resize", scrub);
      return () => {
        window.removeEventListener("scroll", scrub);
        window.removeEventListener("resize", scrub);
      };
    }
    if (paused) {
      el.pauseAnimations?.();
      return;
    }
    el.unpauseAnimations?.();
    if (playbackRate !== 1) {
      el.pauseAnimations?.();
      let t0 = performance.now();
      let t = 0;
      let raf = 0;
      const tick = (now: number) => {
        t += ((now - t0) / 1000) * playbackRate;
        t0 = now;
        const loopMode = loop ?? ${JSON.stringify(bakedLoop)};
        const span = spanFor(loopMode);
        if (loopMode === "once") t = Math.min(span, t);
        else t = t % span;
        el.setCurrentTime?.(t);
        raf = requestAnimationFrame(tick);
      };
      raf = requestAnimationFrame(tick);
      return () => cancelAnimationFrame(raf);
    }
  }, [loop, paused, playbackRate, playMode]);`;
}

function propsInterface(name: string, bakedLoop: SceneLoop): string {
  return `export type ${name}Loop = "once" | "infinite" | "ping-pong";
export type ${name}PlayMode = "auto" | "scroll";

export interface ${name}Props {
  className?: string;
  /** Baked default is ${JSON.stringify(bakedLoop)}. Infinite/once can be toggled at runtime. */
  loop?: ${name}Loop;
  paused?: boolean;
  playbackRate?: number;
  playMode?: ${name}PlayMode;
}`;
}

/** Self-contained React — same scene as SVG/JSON. No Framer, no Lao runtime. */
export function emitProjectReact(
  project: Project,
  opts: EmitSvgOptions = {},
  componentName?: string,
): string {
  const files = emitProjectReactFiles(project, opts, componentName);
  return files.tsx;
}

export function emitProjectReactFiles(
  project: Project,
  opts: EmitSvgOptions = {},
  componentName?: string,
): {
  tsx: string;
  tsxFileName: string;
  svg?: string;
  svgFileName?: string;
  recommendedMode: ReactExportMode;
  byteLength: number;
} {
  const name = safeComponentName(componentName || project.name, "LaoAnimation");
  const scene = buildLaoScene(project, opts);
  const svg = emitProjectSvg(project, opts);
  const byteLength = new TextEncoder().encode(svg).length;
  const recommendedMode = recommendReactDelivery(byteLength);
  const mode: ReactExportMode = opts.reactMode ?? "inline-svg";
  const loop: SceneLoop = opts.loop ?? scene.loop;
  const playMode: SvgPlayMode = opts.playMode ?? "auto";
  const durationSec = scene.durationMs / 1000;
  const header = fileHeader({
    durationMs: scene.durationMs,
    loop,
    width: scene.width,
    height: scene.height,
    fps: scene.fps,
    frameCount: scene.frameCount,
    mode,
    heavy: mode === "inline-svg" && byteLength >= INLINE_SVG_WARN_BYTES,
  });
  const svgFileName = `${name}.svg`;

  if (mode === "external-svg") {
    const tsx = `${header}
import type { FC } from "react";

${propsInterface(name, loop)}

/** Loads the sibling SVG (SMIL). Keep ${JSON.stringify(svgFileName)} next to this file.
 *  loop / paused / playbackRate apply to Inline SVG mode only — this <object> plays the SVG as exported. */
export const ${name}: FC<${name}Props> = ({
  className,
  src = ${JSON.stringify("./" + svgFileName)},
}: ${name}Props & { src?: string }) => (
  <object
    data={src}
    type="image/svg+xml"
    className={className}
    aria-label=${JSON.stringify(project.name || name)}
    style={{ width: "100%", height: "auto", display: "block" }}
  />
);

export default ${name};
`;
    return {
      tsx,
      tsxFileName: `${name}.tsx`,
      svg,
      svgFileName,
      recommendedMode,
      byteLength,
    };
  }

  const jsx = svgToJsx(svg);
  const { inner, viewBox } = extractSvgRoot(jsx);
  const prettyInner = prettyJsx(inner.trim(), 2);

  const tsx = `${header}
import { useEffect, useRef, type FC } from "react";

${propsInterface(name, loop)}

export const ${name}: FC<${name}Props> = ({
  className,
  loop = ${JSON.stringify(loop)},
  paused = false,
  playbackRate = 1,
  playMode = ${JSON.stringify(playMode)},
}) => {
${playbackHook(durationSec, loop, `${name}Loop`)}

  return (
    <svg
      ref={ref}
      className={className}
      xmlns="http://www.w3.org/2000/svg"
      width={${scene.width}}
      height={${scene.height}}
      viewBox={${JSON.stringify(viewBox || scene.viewBox)}}
      fill="none"
      preserveAspectRatio="xMidYMid meet"
      style={{ width: "100%", height: "auto", display: "block" }}
      data-lao-duration-ms={${scene.durationMs}}
      data-lao-loop={loop}
    >
${indentBlock(prettyInner, 6)}
    </svg>
  );
};

export default ${name};
`;

  return {
    tsx,
    tsxFileName: `${name}.tsx`,
    recommendedMode,
    byteLength,
  };
}
