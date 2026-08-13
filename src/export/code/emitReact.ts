import type { Project } from "@/model/types";
import type { EmitSvgOptions, SvgPlayMode } from "@/export/code/emitSvg";
import { emitProjectSceneJson } from "@/export/code/sceneJson";

function safeFileBase(name: string): string {
  const trimmed = (name || "animation").trim() || "animation";
  return trimmed.replace(/[^\w.-]+/g, "-");
}

/** Self-contained React player — fetches compact JSON, does not inline SVG. */
export function emitProjectReact(
  project: Project,
  opts: EmitSvgOptions = {},
  componentName = "LaoAnimation",
): string {
  const jsonFile = `./${safeFileBase(project.name)}.json`;
  return emitLaoPlayerSource({
    componentName,
    defaultSrc: jsonFile,
    defaultPlayMode: opts.playMode ?? "auto",
  });
}

export function emitProjectReactFiles(
  project: Project,
  opts: EmitSvgOptions = {},
  componentName = "LaoAnimation",
): { tsx: string; json: string; jsonFileName: string; tsxFileName: string } {
  const base = safeFileBase(project.name);
  const json = emitProjectSceneJson(project, {
    transparent: opts.transparent,
    animated: opts.animated,
    frame: opts.frame,
  });
  const tsx = emitLaoPlayerSource({
    componentName,
    defaultSrc: `./${base}.json`,
    defaultPlayMode: opts.playMode ?? "auto",
  });
  return {
    tsx,
    json,
    jsonFileName: `${base}.json`,
    tsxFileName: `${componentName}.tsx`,
  };
}

export function emitLaoPlayerSource(opts: {
  componentName: string;
  defaultSrc: string;
  defaultPlayMode: SvgPlayMode;
}): string {
  const { componentName, defaultSrc, defaultPlayMode } = opts;
  return `import { useEffect, useRef, useState, type FC } from "react";

export type LaoPlayMode = "auto" | "scroll";

export interface LaoScene {
  format: "lao-scene";
  version: 1;
  width: number;
  height: number;
  fps: number;
  durationMs: number;
  background: null | { kind: "color"; color: string } | {
    kind: "gradient";
    shape: "linear" | "radial";
    stops: Array<{ color: string; at: number }>;
  };
  fontCss?: string;
  defs: Array<{
    id: string;
    kind: "drawOn" | "eraser";
    centerline?: string;
    strokeWidth?: number;
    beginSec?: number;
    durSec?: number;
    easing?: [number, number, number, number];
    cuts?: string[];
  }>;
  groups: Array<{
    id: string;
    layerId?: string;
    celIndex?: number;
    morphId?: string;
    display?: "inline" | "none";
    exposure?: { from: number; to: number };
    maskId?: string;
    paths: Array<{
      id: string;
      d: string;
      fill: string;
      fillD?: string;
      fillColor?: string;
      boil?: { values: string[]; durSec: number };
      maskId?: string;
      fade?: { keyTimes: string; values: string; durSec: number };
      opacity?: number;
    }>;
    texts: string[];
  }>;
}

export interface ${componentName}Props {
  /** URL of a lao-scene JSON file (keep this off the JS bundle). */
  src?: string;
  scene?: LaoScene;
  width?: number;
  height?: number;
  className?: string;
  playMode?: LaoPlayMode;
  paused?: boolean;
}

function esc(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

function tag(name: string, attrs: Record<string, string | number | undefined | null>, inner?: string): string {
  const a = Object.entries(attrs)
    .filter(([, v]) => v !== undefined && v !== null)
    .map(([k, v]) => \` \${k}="\${esc(String(v))}"\`)
    .join("");
  if (!inner) return \`<\${name}\${a}/>\`;
  return \`<\${name}\${a}>\${inner}</\${name}>\`;
}

function renderScene(scene: LaoScene): { inner: string; durationSec: number } {
  let defs = "";
  let body = "";
  const bg = scene.background;
  if (bg?.kind === "color") {
    body += tag("rect", { width: scene.width, height: scene.height, fill: bg.color });
  } else if (bg?.kind === "gradient") {
    const stops = bg.stops.map((s) => tag("stop", { offset: \`\${Math.round(s.at * 100)}%\`, "stop-color": s.color })).join("");
    defs += bg.shape === "radial"
      ? tag("radialGradient", { id: "bg", cx: "50%", cy: "50%", r: "70%" }, stops)
      : tag("linearGradient", { id: "bg", x1: "0%", y1: "0%", x2: "100%", y2: "100%" }, stops);
    body += tag("rect", { width: scene.width, height: scene.height, fill: "url(#bg)" });
  }
  for (const def of scene.defs) {
    if (def.kind === "eraser") {
      const cuts = (def.cuts ?? []).map((d) => tag("path", { d, fill: "black" })).join("");
      defs += tag("mask", { id: def.id }, tag("rect", { width: "100%", height: "100%", fill: "white" }) + cuts);
    } else {
      const e = def.easing ?? [0, 0, 1, 1];
      const line = tag("path", {
        d: def.centerline, fill: "none", stroke: "white",
        "stroke-width": def.strokeWidth ?? 8, "stroke-linecap": "round", "stroke-linejoin": "round",
        pathLength: "100", "stroke-dasharray": "100", "stroke-dashoffset": "0",
      }, tag("animate", {
        attributeName: "stroke-dashoffset", values: "100;0",
        begin: \`\${def.beginSec ?? 0}s\`, dur: \`\${def.durSec ?? 0}s\`, fill: "freeze",
        calcMode: "spline", keySplines: \`\${e[0]} \${e[1]} \${e[2]} \${e[3]}\`, keyTimes: "0;1",
      }));
      defs += tag("mask", { id: def.id }, tag("rect", { width: "100%", height: "100%", fill: "black" }) + line);
    }
  }
  for (const g of scene.groups) {
    let inner = "";
    for (const p of g.paths) {
      let path = "";
      if (p.fillD && p.fillColor) path += tag("path", { d: p.fillD, fill: p.fillColor });
      const boil = p.boil ? tag("animate", {
        attributeName: "d", calcMode: "discrete", values: p.boil.values.join(";"),
        dur: \`\${p.boil.durSec}s\`, repeatCount: "indefinite",
      }) : "";
      path += tag("path", { id: p.id, d: p.d, fill: p.fill, mask: p.maskId ? \`url(#\${p.maskId})\` : undefined }, boil || undefined);
      if (p.fade) {
        path = tag("g", {}, path + tag("animate", {
          attributeName: "opacity", keyTimes: p.fade.keyTimes, values: p.fade.values,
          dur: \`\${p.fade.durSec}s\`, fill: "freeze",
        }));
      } else if (p.opacity !== undefined) {
        path = tag("g", { opacity: p.opacity }, path);
      }
      inner += path;
    }
    inner += (g.texts ?? []).join("");
    if (g.exposure) {
      const t0 = g.exposure.from / scene.fps;
      const t1 = g.exposure.to / scene.fps;
      inner += tag("set", { attributeName: "display", to: "none", begin: \`\${t1}s\`, fill: "freeze" });
      inner += tag("set", { attributeName: "display", to: "inline", begin: \`\${t0}s\`, fill: "freeze" });
    }
    body += tag("g", {
      id: g.id, "data-layer": g.layerId, "data-cel": g.celIndex, "data-morph": g.morphId,
      display: g.display, mask: g.maskId ? \`url(#\${g.maskId})\` : undefined,
    }, inner);
  }
  const style = scene.fontCss ? \`<style>\${scene.fontCss}</style>\` : "";
  return { inner: \`\${style}<defs>\${defs}</defs>\${body}\`, durationSec: scene.durationMs / 1000 };
}

export const ${componentName}: FC<${componentName}Props> = ({
  src = ${JSON.stringify(defaultSrc)},
  scene: sceneProp,
  width,
  height,
  className,
  playMode = ${JSON.stringify(defaultPlayMode)},
  paused = false,
}) => {
  const ref = useRef<SVGSVGElement>(null);
  const [scene, setScene] = useState<LaoScene | null>(sceneProp ?? null);

  useEffect(() => {
    if (sceneProp) { setScene(sceneProp); return; }
    if (!src) return;
    let cancelled = false;
    fetch(src).then((r) => r.json()).then((json) => { if (!cancelled) setScene(json as LaoScene); }).catch(() => {});
    return () => { cancelled = true; };
  }, [src, sceneProp]);

  const durationSec = scene ? scene.durationMs / 1000 : 0;
  const w = width ?? scene?.width;
  const h = height ?? scene?.height;

  useEffect(() => {
    const el = ref.current;
    if (!el || !scene) return;
    el.innerHTML = renderScene(scene).inner;
    if (playMode === "scroll") {
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
    }
    el.unpauseAnimations?.();
    el.setCurrentTime?.(0);
    try {
      el.querySelectorAll("animate, animateMotion, set").forEach((node) => {
        (node as SVGAnimationElement & { beginElement?: () => void }).beginElement?.();
      });
    } catch { /* ignore */ }
    if (paused) el.pauseAnimations?.();
    else el.unpauseAnimations?.();
  }, [scene, playMode, paused, durationSec]);

  return (
    <svg
      ref={ref}
      className={className}
      xmlns="http://www.w3.org/2000/svg"
      width={w}
      height={h}
      viewBox={scene ? \`0 0 \${scene.width} \${scene.height}\` : undefined}
      fill="none"
      data-lao-duration={durationSec}
      data-lao-play-mode={playMode}
    />
  );
};

export default ${componentName};
`;
}
