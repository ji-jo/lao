import {
  resolveCel,
  resolveCelIndex,
  type Frame,
  type Layer,
  type MorphClip,
  type Project,
  type Stroke,
  type StrokePoint,
  type TextElement,
} from "@/model/types";
import {
  boilDisplacement,
  displaceStroke,
  variantForFrame,
} from "@/engine/boil";
import {
  clipFadeOpacity,
  strokeAtTime,
  strokeWithClipPoints,
} from "@/engine/strokeProgress";
import {
  applyMotionPoseToPoint,
  layerMotionAt,
  mergeDisplaced,
  motionDisplacement,
} from "@/engine/motionPath";
import { tweenFrames } from "@/engine/tween";
import { PATH_MAKER_ENABLED } from "@/lib/mvpFlags";
import { expandPolygonOutward, fillPolygonExpandDistance } from "@/engine/pathEdit";
import { parseCssGradient } from "@/engine/background";
import { bezierNodesToPathD, compactPolylinePathD, strokeCenterlinePathD, strokeToPathD } from "@/export/code/svgGeometry";
import { boilPathValues, clipFadeData } from "@/export/code/svgAnimation";
import { collectFontImports, textElementToSvg } from "@/export/code/svgText";
import { exportIdPrefix, formatExportUsage, type SceneLoop } from "@/export/code/exportMeta";

export const LAO_SCENE_FORMAT = "lao-scene" as const;

export interface BuildSceneOptions {
  transparent?: boolean;
  frame?: number;
  animated?: boolean;
  loop?: SceneLoop;
  idPrefix?: string;
}

export type SceneBackground =
  | { kind: "color"; color: string }
  | {
      kind: "gradient";
      shape: "linear" | "radial";
      stops: Array<{ color: string; at: number }>;
    };

export interface SceneMaskDef {
  id: string;
  kind: "drawOn" | "eraser";
  centerline?: string;
  strokeWidth?: number;
  beginSec?: number;
  durSec?: number;
  easing?: [number, number, number, number];
  cuts?: string[];
}

export interface ScenePath {
  id: string;
  d: string;
  fill: string;
  fillD?: string;
  fillColor?: string;
  boil?: { values: string[]; durSec: number };
  maskId?: string;
  fade?: { keyTimes: string; values: string; durSec: number };
  opacity?: number;
}

export interface SceneGroup {
  id: string;
  layerId?: string;
  celIndex?: number;
  morphId?: string;
  display?: "inline" | "none";
  exposure?: { from: number; to: number };
  maskId?: string;
  paths: ScenePath[];
  texts: string[];
}

export interface LaoSceneFormats {
  svg: { standalone: true; usesSmil: boolean };
  react: { modes: ["inline-svg", "external-svg"] };
  json: { schemaVersion: 1; browserRenderable: false };
}

export interface LaoScene {
  format: typeof LAO_SCENE_FORMAT;
  version: 1;
  /** How an AI agent should treat this file. JSON is not a browser document. */
  usage: string;
  width: number;
  height: number;
  viewBox: string;
  fps: number;
  frameCount: number;
  durationMs: number;
  loop: SceneLoop;
  /** Prefix on every id so multiple exports can share a page. */
  idPrefix: string;
  formats: LaoSceneFormats;
  background: SceneBackground | null;
  fontCss?: string;
  defs: SceneMaskDef[];
  groups: SceneGroup[];
}

let maskCounter = 0;
function nextMaskId(prefix: string): string {
  maskCounter += 1;
  return `${prefix}-m${maskCounter}`;
}

function resetMaskCounter(): void {
  maskCounter = 0;
}

function strokesForFrame(project: Project, frame: number, layerStrokes: Stroke[]): Stroke[] {
  if (project.workflow !== "animatron") return layerStrokes;
  const timeMs = (frame / Math.max(project.fps, 1)) * 1000;
  const out: Stroke[] = [];
  for (const s of layerStrokes) {
    const pts = strokeAtTime(s, timeMs);
    if (!pts || pts.length === 0) continue;
    out.push(strokeWithClipPoints(s, pts));
  }
  return out;
}

function morphProgress(
  clip: { startMs: number; durationMs: number; easing?: { bezier: [number, number, number, number] } },
  timeMs: number,
): number | null {
  if (timeMs < clip.startMs) return null;
  if (timeMs >= clip.startMs + clip.durationMs) return 1;
  const raw = clip.durationMs > 0 ? (timeMs - clip.startMs) / clip.durationMs : 1;
  if (!clip.easing) return raw;
  const [, y1, , y2] = clip.easing.bezier;
  const t = raw;
  return 3 * (1 - t) * (1 - t) * t * y1 + 3 * (1 - t) * t * t * y2 + t * t * t;
}

function activeMorphs(project: Project, timeMs: number) {
  if (!project.morphs?.length) return [];
  const out: Array<{ clip: MorphClip; u: number }> = [];
  for (const clip of project.morphs) {
    const u = morphProgress(clip, timeMs);
    if (u == null || u <= 0 || u >= 1) continue;
    out.push({ clip, u });
  }
  return out;
}

function morphHideLayers(project: Project, timeMs: number): Set<string> {
  const morphHide = new Set<string>();
  if (!PATH_MAKER_ENABLED) return morphHide;
  for (const { clip } of activeMorphs(project, timeMs)) {
    morphHide.add(clip.fromLayerId);
    morphHide.add(clip.toLayerId);
  }
  for (const clip of project.morphs ?? []) {
    const u = morphProgress(clip, timeMs);
    if (u === 1) morphHide.add(clip.fromLayerId);
    if (u == null) morphHide.add(clip.toLayerId);
  }
  return morphHide;
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

function strokeFillPathD(stroke: Stroke, points: StrokePoint[]): string | null {
  if (!stroke.closed || !stroke.fillColor || stroke.brush === "eraser") return null;
  const bez = stroke.bezierNodes;
  if (bez && bez.length > 0) {
    return bezierNodesToPathD(bez, true);
  }
  if (points.length < 3) return null;
  const fillPts = stroke.shapeKind
    ? points
    : expandPolygonOutward(points, fillPolygonExpandDistance(stroke.size));
  return compactPolylinePathD(
    fillPts.map((p) => [p.x, p.y] as [number, number]),
    true,
  );
}

function sceneBackground(project: Project, transparent: boolean): SceneBackground | null {
  if (transparent) return null;
  const bg = project.background ?? { kind: "none" as const };
  switch (bg.kind) {
    case "color":
      return { kind: "color", color: bg.color };
    case "gradient": {
      const parsed = bg.css ? parseCssGradient(bg.css) : null;
      const stops =
        parsed?.stops ??
        [
          { color: bg.from, at: 0 },
          { color: bg.to, at: 1 },
        ];
      if (!stops?.length) return { kind: "color", color: "#141416" };
      return {
        kind: "gradient",
        shape: parsed?.shape === "radial" || bg.shape === "radial" ? "radial" : "linear",
        stops,
      };
    }
    case "none":
    case "image":
    case "shader":
      return { kind: "color", color: "#141416" };
    default:
      return { kind: "color", color: "#141416" };
  }
}

function celVisibilitySegments(layer: Layer, frameCount: number) {
  const segments: Array<{ from: number; to: number; cel: Frame; celIndex: number }> = [];
  let from = 0;
  let prevIdx: number | null = null;
  let prevCel: Frame | null = null;
  for (let f = 0; f <= frameCount; f++) {
    const idx = f < frameCount ? resolveCelIndex(layer, f) : null;
    const cel = idx === null ? null : layer.frames[idx];
    if (f === 0) {
      prevIdx = idx;
      prevCel = cel;
      from = 0;
      continue;
    }
    if (idx !== prevIdx) {
      if (prevCel && prevIdx !== null) {
        segments.push({ from, to: f, cel: prevCel, celIndex: prevIdx });
      }
      from = f;
      prevIdx = idx;
      prevCel = cel;
    }
  }
  return segments;
}

function layerCelForMorph(project: Project, layerId: string) {
  const layer = project.layers.find((l) => l.id === layerId);
  if (!layer) return null;
  return layer.frames.find((f) => f) ?? null;
}

function buildPath(
  stroke: Stroke,
  points: StrokePoint[],
  project: Project,
  frame: number,
  animated: boolean,
  idPrefix: string,
  defs: SceneMaskDef[],
): ScenePath | null {
  if (stroke.brush === "eraser") return null;
  const d = strokeToPathD(stroke, points);
  if (!d) return null;

  const path: ScenePath = {
    id: `${idPrefix}-p`,
    d,
    fill: stroke.color,
  };
  const fillD = strokeFillPathD(stroke, points);
  if (fillD && stroke.fillColor) {
    path.fillD = fillD;
    path.fillColor = stroke.fillColor;
  }

  const drawOn =
    animated &&
    project.workflow === "animatron" &&
    stroke.clip &&
    stroke.clip.durationMs > 0;
  if (drawOn && stroke.clip) {
    const centerline = strokeCenterlinePathD(stroke.points);
    if (centerline) {
      const maskId = nextMaskId(idPrefix);
      defs.push({
        id: maskId,
        kind: "drawOn",
        centerline,
        strokeWidth: stroke.size * 2.5,
        beginSec: stroke.clip.startMs / 1000,
        durSec: stroke.clip.durationMs / 1000,
        easing: stroke.clip.easing?.bezier ?? [0, 0, 1, 1],
      });
      path.maskId = maskId;
    }
  }

  if (animated && stroke.jitter) {
    const boil = boilPathValues(stroke, points, project);
    if (boil) path.boil = boil;
  }

  if (animated && project.workflow === "animatron" && stroke.clip) {
    const fade = clipFadeData(stroke.clip, project.fps, project.frameCount);
    if (fade) path.fade = fade;
  } else if (!animated && project.workflow === "animatron" && stroke.clip) {
    const timeMs = (frame / Math.max(project.fps, 1)) * 1000;
    const alpha = clipFadeOpacity(stroke, timeMs, project.fps);
    if (alpha < 1) path.opacity = alpha;
  }

  return path;
}

function walkStrokes(
  project: Project,
  strokes: Stroke[],
  displaced: Map<string, StrokePoint[]>,
  frame: number,
  animated: boolean,
  idPrefix: string,
  measureCtx: CanvasRenderingContext2D | null,
  texts: TextElement[] | undefined,
  defs: SceneMaskDef[],
): { paths: ScenePath[]; texts: string[]; eraserMaskId?: string } {
  const paths: ScenePath[] = [];
  const textMarkup: string[] = [];
  let eraserMaskId: string | undefined;
  const eraserCuts: string[] = [];

  for (const s of strokes) {
    if (s.brush === "eraser") {
      const pts = displaced.get(s.id) ?? s.points;
      const d = strokeToPathD(s, pts);
      if (d) eraserCuts.push(d);
      continue;
    }
    const pts = displaced.get(s.id) ?? s.points;
    const path = buildPath(s, pts, project, frame, animated, `${idPrefix}-${s.id}`, defs);
    if (path) paths.push(path);
  }

  if (eraserCuts.length && paths.length + textMarkup.length > 0) {
    eraserMaskId = nextMaskId(`${idPrefix}-er`);
    defs.push({ id: eraserMaskId, kind: "eraser", cuts: eraserCuts });
  }

  if (texts?.length) {
    for (const t of texts) {
      const markup = textElementToSvg(t, undefined, measureCtx);
      if (markup) textMarkup.push(markup);
    }
  }

  return { paths, texts: textMarkup, eraserMaskId };
}

function emitLayerGroup(
  project: Project,
  layer: Layer,
  cel: Frame,
  frame: number,
  animated: boolean,
  idPrefix: string,
  measureCtx: CanvasRenderingContext2D | null,
  defs: SceneMaskDef[],
  visibility?: { from: number; to: number },
): SceneGroup | null {
  const workflow = project.workflow ?? "animatron";
  const timeMs = (frame / Math.max(project.fps, 1)) * 1000;
  const strokes =
    animated && workflow === "animatron"
      ? cel.strokes
      : strokesForFrame(project, frame, cel.strokes);
  const motion = PATH_MAKER_ENABLED
    ? layerMotionAt(layer, timeMs, frame, workflow)
    : null;
  const posedTexts = poseTexts(cel.texts, motion);

  let displaced = new Map<string, StrokePoint[]>();
  if (!(animated && workflow === "animatron")) {
    const motionDisp = motionDisplacement(
      layer,
      strokes,
      timeMs,
      frame,
      workflow,
      motion,
    );
    let boilMap = boilDisplacement(strokes, frame, project.boil);
    if (motionDisp) {
      const variant = variantForFrame(frame, project.boil);
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
    displaced = mergeDisplaced(motionDisp, boilMap) ?? new Map();
  }

  const content = walkStrokes(
    project,
    strokes,
    displaced,
    frame,
    animated,
    idPrefix,
    measureCtx,
    posedTexts,
    defs,
  );
  if (content.paths.length === 0 && content.texts.length === 0) return null;

  const group: SceneGroup = {
    id: idPrefix,
    layerId: layer.id,
    paths: content.paths,
    texts: content.texts,
  };
  if (content.eraserMaskId) group.maskId = content.eraserMaskId;
  if (animated && visibility && workflow !== "animatron") {
    group.exposure = { from: visibility.from, to: visibility.to };
    group.display = visibility.from === 0 ? "inline" : "none";
  }
  return group;
}

export function buildLaoScene(project: Project, opts: BuildSceneOptions = {}): LaoScene {
  resetMaskCounter();
  const transparent = opts.transparent ?? false;
  const animated = opts.animated ?? opts.frame === undefined;
  const frame = opts.frame ?? 0;
  const { width, height, fps, frameCount } = project;
  const workflow = project.workflow ?? "animatron";
  const loop = opts.loop ?? "once";
  const idPrefix =
    opts.idPrefix ?? exportIdPrefix(project.name, width, height, fps);
  const defs: SceneMaskDef[] = [];
  const groups: SceneGroup[] = [];
  let fontCss = "";

  const finish = (): LaoScene => {
    const used = new Set<string>();
    for (const g of groups) {
      if (g.maskId) used.add(g.maskId);
      for (const p of g.paths) if (p.maskId) used.add(p.maskId);
    }
    return {
      format: LAO_SCENE_FORMAT,
      version: 1,
      usage: formatExportUsage("json"),
      width,
      height,
      viewBox: `0 0 ${width} ${height}`,
      fps,
      frameCount,
      durationMs: (frameCount / Math.max(fps, 1)) * 1000,
      loop,
      idPrefix,
      formats: {
        svg: { standalone: true, usesSmil: animated },
        react: { modes: ["inline-svg", "external-svg"] },
        json: { schemaVersion: 1, browserRenderable: false },
      },
      background: sceneBackground(project, transparent),
      fontCss: fontCss || undefined,
      defs: defs.filter((d) => used.has(d.id)),
      groups,
    };
  };

  const measureCtx =
    typeof document !== "undefined"
      ? document.createElement("canvas").getContext("2d")
      : null;

  if (!animated) {
    const timeMs = (frame / Math.max(fps, 1)) * 1000;
    const morphHide = morphHideLayers(project, timeMs);
    const allTexts: TextElement[] = [];
    for (const layer of project.layers) {
      if (!layer.visible || morphHide.has(layer.id)) continue;
      const cel =
        workflow === "animatron"
          ? layer.frames.find((f) => f) ?? null
          : resolveCel(layer, frame);
      if (cel?.texts) allTexts.push(...cel.texts);
    }
    fontCss = collectFontImports(allTexts);

    for (const layer of project.layers) {
      if (!layer.visible || morphHide.has(layer.id)) continue;
      const cel =
        workflow === "animatron"
          ? layer.frames.find((f) => f) ?? null
          : resolveCel(layer, frame);
      if (
        !cel ||
        (cel.strokes.length === 0 &&
          (!cel.texts || cel.texts.length === 0) &&
          (!cel.images || cel.images.length === 0))
      ) {
        continue;
      }
      const group = emitLayerGroup(
        project,
        layer,
        cel,
        frame,
        false,
        `${idPrefix}-l-${layer.id}`,
        measureCtx,
        defs,
      );
      if (group) groups.push(group);
    }

    for (const { clip, u } of activeMorphs(project, timeMs)) {
      const celA = layerCelForMorph(project, clip.fromLayerId);
      const celB = layerCelForMorph(project, clip.toLayerId);
      if (!celA || !celB) continue;
      const { strokes } = tweenFrames(celA, celB, u);
      if (!strokes.length) continue;
      const boilMap = boilDisplacement(strokes, frame, project.boil);
      const dummyLayer = project.layers.find((l) => l.id === clip.fromLayerId);
      if (!dummyLayer) continue;
      const content = walkStrokes(
        project,
        strokes,
        boilMap,
        frame,
        false,
        `${idPrefix}-morph-${clip.id}`,
        measureCtx,
        undefined,
        defs,
      );
      if (content.paths.length) {
        groups.push({
          id: `${idPrefix}-morph-${clip.id}`,
          morphId: clip.id,
          paths: content.paths,
          texts: content.texts,
          maskId: content.eraserMaskId,
        });
      }
    }

    return finish();
  }

  const allTexts: TextElement[] = [];
  for (const layer of project.layers) {
    for (const cel of layer.frames) {
      if (cel?.texts) allTexts.push(...cel.texts);
    }
  }
  fontCss = collectFontImports(allTexts);

  for (const layer of project.layers) {
    if (!layer.visible) continue;

    if (workflow === "animatron") {
      const cel = layer.frames.find((f) => f) ?? null;
      if (!cel) continue;
      const group = emitLayerGroup(
        project,
        layer,
        cel,
        0,
        true,
        `${idPrefix}-l-${layer.id}`,
        measureCtx,
        defs,
      );
      if (group) groups.push(group);
      continue;
    }

    const segments = celVisibilitySegments(layer, frameCount);
    for (const seg of segments) {
      const group = emitLayerGroup(
        project,
        layer,
        seg.cel,
        seg.from,
        true,
        `${idPrefix}-l-${layer.id}-c${seg.celIndex}`,
        measureCtx,
        defs,
        { from: seg.from, to: seg.to },
      );
      if (group) {
        group.celIndex = seg.celIndex;
        groups.push(group);
      }
    }
  }

  return finish();
}

export function parseLaoScene(json: unknown): LaoScene {
  const doc = json as Partial<LaoScene>;
  if (doc.format !== LAO_SCENE_FORMAT) throw new Error("Not a lao-scene file");
  if (doc.version !== 1) throw new Error(`Unsupported lao-scene version: ${doc.version}`);
  if (typeof doc.width !== "number" || !Array.isArray(doc.groups)) {
    throw new Error("Corrupt lao-scene file");
  }
  const width = doc.width;
  const height = typeof doc.height === "number" ? doc.height : width;
  const fps = typeof doc.fps === "number" ? doc.fps : 12;
  const frameCount = typeof doc.frameCount === "number" ? doc.frameCount : 1;
  const durationMs =
    typeof doc.durationMs === "number"
      ? doc.durationMs
      : (frameCount / Math.max(fps, 1)) * 1000;
  const idPrefix =
    typeof doc.idPrefix === "string" && doc.idPrefix
      ? doc.idPrefix
      : exportIdPrefix("anim", width, height, fps);
  return {
    format: LAO_SCENE_FORMAT,
    version: 1,
    usage: doc.usage ?? formatExportUsage("json"),
    width,
    height,
    viewBox: doc.viewBox ?? `0 0 ${width} ${height}`,
    fps,
    frameCount,
    durationMs,
    loop: doc.loop === "infinite" || doc.loop === "ping-pong" ? doc.loop : "once",
    idPrefix,
    formats: doc.formats ?? {
      svg: { standalone: true, usesSmil: true },
      react: { modes: ["inline-svg", "external-svg"] },
      json: { schemaVersion: 1, browserRenderable: false },
    },
    background: doc.background ?? null,
    fontCss: doc.fontCss,
    defs: doc.defs ?? [],
    groups: doc.groups,
  };
}

export function emitProjectSceneJson(
  project: Project,
  opts: BuildSceneOptions = {},
): string {
  return JSON.stringify(buildLaoScene(project, opts), null, 2);
}

export function sceneByteLength(scene: LaoScene): number {
  return new TextEncoder().encode(JSON.stringify(scene)).length;
}
