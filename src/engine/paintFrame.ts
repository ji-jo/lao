import {
  resolveCel,
  type ImageElement,
  type MorphClip,
  type Project,
  type Stroke,
  type TextElement,
} from "@/model/types";
import { renderStrokes, renderTexts } from "@/engine/renderer";
import { renderImages } from "@/engine/canvasImage";
import {
  boilDisplacement,
  displaceStroke,
  variantForFrame,
} from "@/engine/boil";
import {
  clipFadeOpacity,
  clipVisibleAt,
  compositionTimeMs,
  sampleBezierY,
  animatronStrokesAtTime,
  textContentAtTime,
} from "@/engine/strokeProgress";
import { PATH_MAKER_ENABLED } from "@/lib/mvpFlags";
import {
  applyMotionPoseToPoint,
  layerMotionAt,
  mergeDisplaced,
  motionDisplacement,
} from "@/engine/motionPath";
import { tweenFrames } from "@/engine/tween";

let celCanvas: HTMLCanvasElement | OffscreenCanvas | null = null;

function getCelCanvas(w: number, h: number) {
  if (!celCanvas) {
    celCanvas =
      typeof OffscreenCanvas !== "undefined"
        ? new OffscreenCanvas(w, h)
        : document.createElement("canvas");
  }
  if (celCanvas.width !== w) celCanvas.width = w;
  if (celCanvas.height !== h) celCanvas.height = h;
  return celCanvas;
}

function strokesForFrame(
  project: Project,
  layerStrokes: Stroke[],
  timeMs: number,
): Stroke[] {
  if (project.workflow !== "animatron") return layerStrokes;
  return animatronStrokesAtTime(layerStrokes, timeMs);
}

function morphProgress(clip: MorphClip, timeMs: number): number | null {
  if (timeMs < clip.startMs) return null; // before — hide morph layer (show A via normal paint)
  if (timeMs >= clip.startMs + clip.durationMs) return 1;
  const raw = clip.durationMs > 0 ? (timeMs - clip.startMs) / clip.durationMs : 1;
  return clip.easing ? sampleBezierY(raw, clip.easing.bezier) : raw;
}

function layerCelForMorph(project: Project, layerId: string) {
  const layer = project.layers.find((l) => l.id === layerId);
  if (!layer) return null;
  return layer.frames.find((f) => f) ?? null;
}

/** Morph clips that are actively interpolating at timeMs (0 < u < 1). */
function activeMorphs(
  project: Project,
  timeMs: number,
): Array<{ clip: MorphClip; u: number }> {
  if (!project.morphs?.length) return [];
  const out: Array<{ clip: MorphClip; u: number }> = [];
  for (const clip of project.morphs) {
    const u = morphProgress(clip, timeMs);
    if (u == null || u <= 0 || u >= 1) continue;
    out.push({ clip, u });
  }
  return out;
}

function poseImages(
  images: ImageElement[] | undefined,
  motion: ReturnType<typeof layerMotionAt>,
): ImageElement[] | undefined {
  if (!images?.length || !motion) return images;
  return images.map((im) => {
    const hit = motion.get(im.id);
    if (!hit) return im;
    const tl = applyMotionPoseToPoint({ x: im.x, y: im.y }, hit.assignment.anchor, hit.pose);
    return {
      ...im,
      x: tl.x,
      y: tl.y,
      rotation: (im.rotation ?? 0) + hit.pose.angleRad,
    };
  });
}

function poseTexts(
  texts: TextElement[] | undefined,
  motion: ReturnType<typeof layerMotionAt>,
): TextElement[] | undefined {
  if (!texts?.length || !motion) return texts;
  return texts.map((t) => {
    const hit = motion.get(t.id);
    if (!hit) return t;
    const p = applyMotionPoseToPoint({ x: t.x, y: t.y }, hit.assignment.anchor, hit.pose);
    return {
      ...t,
      x: p.x,
      y: p.y,
      rotation: (t.rotation ?? 0) + hit.pose.angleRad,
    };
  });
}

/**
 * Paint one timeline frame of the whole project at full quality with boil
 * applied — the single source of truth for preview playback AND export.
 */
export function paintProjectFrame(
  ctx: CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D,
  project: Project,
  frame: number,
  opts: { clear?: boolean; timeMs?: number } = {},
) {
  const { width, height, fps } = project;
  if (opts.clear !== false) ctx.clearRect(0, 0, width, height);

  const scratch = getCelCanvas(width, height);
  const scratchCtx = scratch.getContext("2d") as CanvasRenderingContext2D;
  const timeMs = compositionTimeMs(fps, frame, opts.timeMs);
  const artFrame = Math.floor((timeMs / 1000) * Math.max(fps, 1) + 1e-6);
  const workflow = project.workflow ?? "animatron";
  const morphing = PATH_MAKER_ENABLED ? activeMorphs(project, timeMs) : [];
  const morphHide = new Set<string>();
  for (const { clip } of morphing) {
    morphHide.add(clip.fromLayerId);
    morphHide.add(clip.toLayerId);
  }
  // After morph completes, hide A and show B only (B paints normally).
  if (PATH_MAKER_ENABLED) {
    for (const clip of project.morphs ?? []) {
      const u = morphProgress(clip, timeMs);
      if (u === 1) morphHide.add(clip.fromLayerId);
      if (u == null) morphHide.add(clip.toLayerId);
    }
  }

  for (const layer of project.layers) {
    if (!layer.visible) continue;
    if (morphHide.has(layer.id)) continue;

    const cel =
      workflow === "animatron"
        ? layer.frames.find((f) => f) ?? null
        : resolveCel(layer, artFrame);
    if (
      !cel ||
      (cel.strokes.length === 0 &&
        (!cel.texts || cel.texts.length === 0) &&
        (!cel.images || cel.images.length === 0))
    ) {
      continue;
    }
    const strokes = strokesForFrame(project, cel.strokes, timeMs);
    const motion = PATH_MAKER_ENABLED
      ? layerMotionAt(layer, timeMs, artFrame, workflow)
      : null;
    const posedImages = poseImages(
      workflow === "animatron"
        ? cel.images?.filter((im) => clipVisibleAt(im.clip, timeMs))
        : cel.images,
      motion,
    );
    const posedTexts = poseTexts(cel.texts, motion);
    const hasContent =
      strokes.length > 0 ||
      (posedTexts && posedTexts.length > 0) ||
      (posedImages && posedImages.length > 0);
    if (!hasContent) continue;

    const motionDisp = motionDisplacement(
      layer,
      strokes,
      timeMs,
      artFrame,
      workflow,
      motion,
    );
    // Boil on posed points so seeds stay stable relative to the riding art.
    let boilMap = boilDisplacement(strokes, artFrame, project.boil);
    if (motionDisp) {
      const variant = variantForFrame(artFrame, project.boil);
      boilMap = new Map();
      for (const s of strokes) {
        const posedPts = motionDisp.get(s.id);
        const posed = posedPts ? { ...s, points: posedPts } : s;
        if (posed.jitter) {
          boilMap.set(s.id, displaceStroke(posed, variant, project.boil));
        } else if (posedPts) {
          boilMap.set(s.id, posedPts);
        }
      }
    }
    const displaced = mergeDisplaced(motionDisp, boilMap);

    if (workflow === "animatron") {
      for (const s of strokes) {
        const alpha = clipFadeOpacity(s, timeMs, fps);
        if (alpha <= 0) continue;
        scratchCtx.clearRect(0, 0, width, height);
        renderStrokes(scratchCtx, [s], {
          quality: "full",
          displaced,
          eraseAsMask: true,
        });
        ctx.save();
        ctx.globalAlpha = alpha;
        if (s.brush === "eraser") {
          ctx.globalCompositeOperation = "destination-out";
        }
        ctx.drawImage(scratch, 0, 0);
        ctx.restore();
      }
      if (posedImages?.length) {
        scratchCtx.clearRect(0, 0, width, height);
        renderImages(scratchCtx, posedImages);
        ctx.drawImage(scratch, 0, 0);
      }
      if (posedTexts && posedTexts.length > 0) {
        for (const t of posedTexts) {
          const content = textContentAtTime(t, timeMs);
          if (content == null) continue;
          const alpha = clipFadeOpacity(t, timeMs, fps);
          if (alpha <= 0) continue;
          const drawn = content === t.text ? t : { ...t, text: content };
          if (!drawn.text) continue;
          scratchCtx.clearRect(0, 0, width, height);
          renderTexts(scratchCtx, [drawn], { quality: "full" });
          ctx.save();
          ctx.globalAlpha = alpha;
          ctx.drawImage(scratch, 0, 0);
          ctx.restore();
        }
      }
    } else {
      scratchCtx.clearRect(0, 0, width, height);
      if (posedImages?.length) renderImages(scratchCtx, posedImages);
      renderStrokes(scratchCtx, strokes, {
        quality: "full",
        displaced,
      });
      if (posedTexts) renderTexts(scratchCtx, posedTexts, { quality: "full" });
      ctx.drawImage(scratch, 0, 0);
    }
  }

  // Live morph clips (Animatron): paint tweened strokes between A and B.
  for (const { clip, u } of morphing) {
    const celA = layerCelForMorph(project, clip.fromLayerId);
    const celB = layerCelForMorph(project, clip.toLayerId);
    if (!celA || !celB) continue;
    const { strokes } = tweenFrames(celA, celB, u);
    if (!strokes.length) continue;
    scratchCtx.clearRect(0, 0, width, height);
    renderStrokes(scratchCtx, strokes, {
      quality: "full",
      displaced: boilDisplacement(strokes, artFrame, project.boil),
    });
    ctx.drawImage(scratch, 0, 0);
  }
}
