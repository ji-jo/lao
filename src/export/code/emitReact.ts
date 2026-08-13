import type { Project } from "@/model/types";
import type { EmitSvgOptions, SvgPlayMode } from "@/export/code/emitSvg";
import { emitProjectSvg } from "@/export/code/emitSvg";
import { prettyJsx, svgToJsx } from "@/export/code/svgToJsx";

function safeComponentName(name: string, fallback = "LaoAnimation"): string {
  const cleaned = (name || fallback).replace(/[^\w]/g, "") || fallback;
  if (/^[A-Z]/.test(cleaned)) return cleaned;
  return `Lao${cleaned.charAt(0).toUpperCase()}${cleaned.slice(1)}`;
}

function extractSvgRoot(jsx: string): {
  inner: string;
  viewBox: string;
} {
  const open = jsx.match(/^<svg\b([^>]*)>/);
  const innerMatch = jsx.match(/^<svg\b[^>]*>([\s\S]*)<\/svg>\s*$/);
  const attrs = open?.[1] ?? "";
  const vb = attrs.match(/viewBox=\{("([^"]*)"|'([^']*)')\}/);
  const viewBox = vb?.[2] ?? vb?.[3] ?? "0 0 1 1";
  return { inner: innerMatch?.[1] ?? "", viewBox };
}

function indentBlock(jsx: string, spaces: number): string {
  const pad = " ".repeat(spaces);
  return jsx
    .split("\n")
    .map((line) => (line.length ? pad + line : line))
    .join("\n");
}

/** Self-contained React TSX — inline SVG JSX only. No fetch, no JSON, no public URLs. */
export function emitProjectReact(
  project: Project,
  opts: EmitSvgOptions = {},
  componentName?: string,
): string {
  const name = safeComponentName(componentName ?? "LaoAnimation");
  const svg = emitProjectSvg(project, opts);
  const jsx = svgToJsx(svg);
  const { inner, viewBox } = extractSvgRoot(jsx);
  const prettyInner = prettyJsx(inner.trim(), 2);
  const playMode: SvgPlayMode = opts.playMode ?? "auto";
  const durationSec = project.frameCount / Math.max(project.fps, 1);

  if (playMode === "scroll") {
    return `import { useEffect, useRef, type FC } from "react";

export interface ${name}Props {
  className?: string;
}

export const ${name}: FC<${name}Props> = ({ className }) => {
  const ref = useRef<SVGSVGElement>(null);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const durationSec = ${JSON.stringify(durationSec)};
    el.pauseAnimations?.();
    const scrub = () => {
      const rect = el.getBoundingClientRect();
      const vh = window.innerHeight || 1;
      const p = Math.min(1, Math.max(0, (vh - rect.top) / (vh + rect.height || 1)));
      el.setCurrentTime?.(p * durationSec);
    };
    scrub();
    window.addEventListener("scroll", scrub, { passive: true });
    window.addEventListener("resize", scrub);
    return () => {
      window.removeEventListener("scroll", scrub);
      window.removeEventListener("resize", scrub);
    };
  }, []);

  return (
    <svg
      ref={ref}
      className={className}
      xmlns="http://www.w3.org/2000/svg"
      viewBox={${JSON.stringify(viewBox)}}
      fill="none"
      preserveAspectRatio="xMidYMid meet"
      style={{ width: "100%", height: "auto", display: "block" }}
    >
${indentBlock(prettyInner, 6)}
    </svg>
  );
};

export default ${name};
`;
  }

  return `import type { FC } from "react";

export interface ${name}Props {
  className?: string;
}

export const ${name}: FC<${name}Props> = ({ className }) => (
  <svg
    className={className}
    xmlns="http://www.w3.org/2000/svg"
    viewBox={${JSON.stringify(viewBox)}}
    fill="none"
    preserveAspectRatio="xMidYMid meet"
    style={{ width: "100%", height: "auto", display: "block" }}
  >
${indentBlock(prettyInner, 4)}
  </svg>
);

export default ${name};
`;
}

export function emitProjectReactFiles(
  project: Project,
  opts: EmitSvgOptions = {},
  componentName = "LaoAnimation",
): { tsx: string; tsxFileName: string } {
  const tsx = emitProjectReact(project, opts, componentName);
  return { tsx, tsxFileName: `${safeComponentName(componentName)}.tsx` };
}
