/** Shared export timing — baked into SVG SMIL, JSON, and React from one scene. */

export type SceneLoop = "once" | "infinite" | "ping-pong";
export type ReactExportMode = "inline-svg" | "external-svg";

export const INLINE_SVG_WARN_BYTES = 48_000;
export const INLINE_SVG_HEAVY_BYTES = 120_000;

export function exportIdPrefix(name: string, width: number, height: number, fps: number): string {
  const slug =
    (name || "anim")
      .replace(/[^\w]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 16) || "anim";
  let h = 2166136261;
  const s = `${slug}:${width}x${height}@${fps}`;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  const tag = (h >>> 0).toString(36).slice(0, 4);
  return `lao-${slug}-${tag}`;
}

export function pingPongValues(values: string): string {
  const parts = values.split(";");
  if (parts.length < 2) return values;
  return [...parts, ...parts.slice(0, -1).reverse()].join(";");
}

export function smilRepeatAttrs(
  loop: SceneLoop,
  values: string,
  durSec: number,
): { values: string; dur: string; repeatCount?: string; fill?: string } {
  if (loop === "ping-pong") {
    return {
      values: pingPongValues(values),
      dur: `${durSec * 2}s`,
      repeatCount: "indefinite",
      fill: "freeze",
    };
  }
  if (loop === "infinite") {
    return {
      values,
      dur: `${durSec}s`,
      repeatCount: "indefinite",
      fill: "freeze",
    };
  }
  return { values, dur: `${durSec}s`, fill: "freeze" };
}

export function recommendReactDelivery(byteLength: number): "inline-svg" | "external-svg" {
  return byteLength >= INLINE_SVG_WARN_BYTES ? "external-svg" : "inline-svg";
}

export function estimateGzipSize(byteLength: number): number {
  return Math.max(1, Math.round(byteLength * 0.32));
}

export function formatExportUsage(kind: "svg" | "tsx" | "json"): string {
  if (kind === "svg") {
    return "Standalone SVG. Open in a browser. No React, Lao runtime, or JS required. Uses SMIL.";
  }
  if (kind === "tsx") {
    return "Ordinary React/TSX. No Framer, Lao player, or editor runtime. Same artwork as the SVG export.";
  }
  return "Lao scene IR — not browser-renderable. Use it to inspect, edit, or regenerate SVG/React. See docs/LAO_SCENE.md.";
}
