import type { Project, Stroke, StrokePoint } from "@/model/types";
import {
  boilHoldFrames,
  boilVariantCount,
  displaceStroke,
} from "@/engine/boil";
import { strokeDurationMs } from "@/engine/strokeProgress";
import { strokeCenterlinePathD, strokeToPathD } from "@/export/code/svgGeometry";
import { tag } from "@/export/code/svgDoc";

function cubicBezierKeySplines(bezier: [number, number, number, number]): string {
  const [x1, y1, x2, y2] = bezier;
  return `${x1} ${y1} ${x2} ${y2}`;
}

/** Discrete boil cycle values (already compressed path `d`s). */
export function boilPathValues(
  stroke: Stroke,
  points: StrokePoint[],
  project: Project,
): { values: string[]; durSec: number } | null {
  if (!stroke.jitter) return null;
  const fps = Math.max(1, project.fps);
  const hold = boilHoldFrames(project.boil);
  const variants = boilVariantCount(project.boil);
  const values: string[] = [];
  for (let v = 0; v < variants; v++) {
    const displaced = displaceStroke({ ...stroke, points }, v, project.boil);
    values.push(strokeToPathD(stroke, displaced));
  }
  return { values, durSec: (variants * hold) / fps };
}

/** SMIL discrete boil cycle on path d. */
export function boilPathAnimation(
  stroke: Stroke,
  points: StrokePoint[],
  project: Project,
): string {
  const data = boilPathValues(stroke, points, project);
  if (!data) return "";
  return tag("animate", {
    attributeName: "d",
    calcMode: "discrete",
    values: data.values.join(";"),
    dur: `${data.durSec}s`,
    repeatCount: "indefinite",
  });
}

export interface ClipFadeKeys {
  keyTimes: string;
  values: string;
  durSec: number;
}

/** Opacity keyframes from clip fade in/out frames. */
export function clipFadeData(
  clip: { startMs: number; durationMs: number; easing?: { fadeInFrames: number; fadeOutFrames: number } },
  fps: number,
  totalFrames: number,
): ClipFadeKeys | null {
  const fadeInFrames = clip.easing?.fadeInFrames ?? 0;
  const fadeOutFrames = clip.easing?.fadeOutFrames ?? 0;
  if (fadeInFrames <= 0 && fadeOutFrames <= 0) return null;

  const frames = Math.max(totalFrames, 1);
  const startFrame = (clip.startMs / 1000) * fps;
  const endFrame = startFrame + (clip.durationMs / 1000) * fps;
  const fadeInEnd = startFrame + fadeInFrames;
  const fadeOutStart = endFrame - fadeOutFrames;
  const totalDur = frames / fps;

  type Key = { t: number; v: number };
  const keys: Key[] = [];
  const pushKey = (frame: number, v: number) => {
    const t = Math.min(1, Math.max(0, frame / frames));
    const prev = keys[keys.length - 1];
    if (prev && Math.abs(prev.t - t) < 1e-6) {
      prev.v = v;
      return;
    }
    if (prev && t < prev.t) return;
    keys.push({ t, v });
  };

  if (fadeInFrames > 0) {
    pushKey(0, 0);
    pushKey(startFrame, 0);
    pushKey(fadeInEnd, 1);
  } else {
    pushKey(0, startFrame > 0 ? 0 : 1);
    pushKey(startFrame, 1);
  }

  if (fadeOutFrames > 0) {
    pushKey(fadeOutStart, 1);
    pushKey(endFrame, 0);
  }

  pushKey(frames, keys[keys.length - 1]?.v ?? 1);
  if (keys[0]?.t !== 0) keys.unshift({ t: 0, v: keys[0]?.v ?? 0 });
  if (keys[keys.length - 1]?.t !== 1) keys.push({ t: 1, v: keys[keys.length - 1]?.v ?? 1 });

  return {
    keyTimes: keys.map((k) => k.t.toFixed(4)).join(";"),
    values: keys.map((k) => String(k.v)).join(";"),
    durSec: totalDur,
  };
}

export function clipFadeAnimation(
  clip: { startMs: number; durationMs: number; easing?: { fadeInFrames: number; fadeOutFrames: number } },
  fps: number,
  totalFrames: number,
): string | null {
  const data = clipFadeData(clip, fps, totalFrames);
  if (!data) return null;
  return tag("animate", {
    attributeName: "opacity",
    keyTimes: data.keyTimes,
    values: data.values,
    dur: `${data.durSec}s`,
    fill: "freeze",
  });
}

/** Draw-on via centerline mask + stroke-dashoffset (full stroke path underneath). */
export function drawOnMaskGroup(
  stroke: Stroke,
  fullPoints: StrokePoint[],
  maskId: string,
  pathId: string,
): { defs: string; group: string } | null {
  const clip = stroke.clip;
  if (!clip || clip.durationMs <= 0) return null;

  const centerline = strokeCenterlinePathD(fullPoints);
  if (!centerline) return null;

  const maxWidth = stroke.size * 2.5;
  const startSec = clip.startMs / 1000;
  const durSec = clip.durationMs / 1000;
  const easing = clip.easing?.bezier ?? [0, 0, 1, 1];

  // Base dashoffset 0 = fully revealed if SMIL never starts (common when
  // markup is injected via React dangerouslySetInnerHTML). The animate
  // still draws on from 100→0 when the SMIL engine runs.
  const maskPath = tag("path", {
    id: `${maskId}-line`,
    d: centerline,
    fill: "none",
    stroke: "white",
    "stroke-width": maxWidth,
    "stroke-linecap": "round",
    "stroke-linejoin": "round",
    pathLength: "100",
    "stroke-dasharray": "100",
    "stroke-dashoffset": "0",
  }, tag("animate", {
    attributeName: "stroke-dashoffset",
    values: "100;0",
    begin: `${startSec}s`,
    dur: `${durSec}s`,
    fill: "freeze",
    calcMode: "spline",
    keySplines: cubicBezierKeySplines(easing),
    keyTimes: "0;1",
  }));

  const mask = tag("mask", { id: maskId }, tag("rect", {
    width: "100%",
    height: "100%",
    fill: "black",
  }) + maskPath);

  const path = tag("path", {
    id: pathId,
    d: strokeToPathD(stroke, fullPoints),
    fill: stroke.brush === "eraser" ? "#000" : stroke.color,
    mask: `url(#${maskId})`,
  });

  return { defs: mask, group: path };
}

/** Stop-motion exposure: show/hide group at frame boundaries. */
export function exposureDisplayAnimation(
  visibleFromFrame: number,
  visibleToFrame: number,
  fps: number,
): string {
  const t0 = visibleFromFrame / fps;
  const t1 = visibleToFrame / fps;
  return tag("set", {
    attributeName: "display",
    to: "none",
    begin: `${t1}s`,
    fill: "freeze",
  }) + tag("set", {
    attributeName: "display",
    to: "inline",
    begin: `${t0}s`,
    fill: "freeze",
  });
}

export function strokeDurationSec(stroke: Stroke): number {
  return strokeDurationMs(stroke) / 1000;
}
