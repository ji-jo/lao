import {
  type Frame,
  type ImageElement,
  type Layer,
  type Project,
  type ProjectWorkflow,
  type Stroke,
  type StrokeClip,
  type TextElement,
} from "@/model/types";
import {
  clipVisibleAt,
  strokeAtTime,
  strokeWithClipPoints,
  textContentAtTime,
} from "@/engine/strokeProgress";

/** Instant pop — no fade, no draw-on easing. */
const POP_EASING = {
  bezier: [0, 0, 1, 1] as [number, number, number, number],
  fadeInFrames: 0,
  fadeOutFrames: 0,
  _userSet: true as const,
};

function newId(): string {
  return crypto.randomUUID();
}

function remapGroupId(
  old: string | undefined,
  map: Map<string, string>,
): string | undefined {
  if (!old) return undefined;
  const hit = map.get(old);
  if (hit) return hit;
  const next = newId();
  map.set(old, next);
  return next;
}

function copyStroke(stroke: Stroke, groups: Map<string, string>, clip?: StrokeClip): Stroke {
  const next: Stroke = {
    ...stroke,
    id: newId(),
    points: stroke.points.map((p) => ({ ...p })),
    groupId: remapGroupId(stroke.groupId, groups),
  };
  if (stroke.bezierNodes) {
    next.bezierNodes = stroke.bezierNodes.map((n) => ({
      ...n,
      handleIn: n.handleIn ? { ...n.handleIn } : undefined,
      handleOut: n.handleOut ? { ...n.handleOut } : undefined,
    }));
  }
  if (stroke.shapeBox) next.shapeBox = { ...stroke.shapeBox };
  if (clip) next.clip = clip;
  else delete next.clip;
  return next;
}

function copyText(
  text: TextElement,
  groups: Map<string, string>,
  clip?: StrokeClip,
): TextElement {
  const next: TextElement = {
    ...text,
    id: newId(),
    groupId: remapGroupId(text.groupId, groups),
    path: text.path ? { ...text.path } : text.path,
    shadow: text.shadow ? { ...text.shadow } : text.shadow,
  };
  if (clip) {
    next.clip = clip;
    next.typewriterSpeed = 0;
  } else {
    delete next.clip;
  }
  return next;
}

function copyImage(
  image: ImageElement,
  groups: Map<string, string>,
  clip?: StrokeClip,
): ImageElement {
  const next: ImageElement = {
    ...image,
    id: newId(),
    groupId: remapGroupId(image.groupId, groups),
  };
  if (clip) next.clip = clip;
  else delete next.clip;
  return next;
}

function celHasArt(cel: Frame | null): boolean {
  if (!cel) return false;
  return (
    cel.strokes.length > 0 ||
    (cel.texts != null && cel.texts.length > 0) ||
    (cel.images != null && cel.images.length > 0)
  );
}

function projectShell(project: Project, workflow: ProjectWorkflow): Omit<Project, "layers" | "frameCount"> {
  const { layers: _l, frameCount: _f, morphs: _m, ...rest } = project;
  return { ...rest, workflow };
}

function frameMs(fps: number): number {
  return 1000 / Math.max(1, fps);
}

/**
 * Snapshot of what Animatron actually paints at a timeline frame
 * (draw-on, fades, hold:false pop-off).
 */
function bakeAnimatronFrame(project: Project, frameIndex: number): Frame {
  const timeMs = (frameIndex / Math.max(1, project.fps)) * 1000;
  const groups = new Map<string, string>();
  const strokes: Stroke[] = [];
  const texts: TextElement[] = [];
  const images: ImageElement[] = [];
  for (const layer of project.layers) {
    if (!layer.visible) continue;
    const cel = layer.frames.find((f) => f) ?? null;
    if (!cel) continue;
    for (const s of cel.strokes) {
      const pts = strokeAtTime(s, timeMs);
      if (!pts || pts.length === 0) continue;
      const sliced = strokeWithClipPoints(s, pts);
      strokes.push(copyStroke(sliced, groups));
    }
    for (const t of cel.texts ?? []) {
      const content = textContentAtTime(t, timeMs);
      if (content == null || content === "") continue;
      const copied = copyText(content === t.text ? t : { ...t, text: content }, groups);
      texts.push(copied);
    }
    for (const im of cel.images ?? []) {
      if (!clipVisibleAt(im.clip, timeMs)) continue;
      images.push(copyImage(im, groups));
    }
  }
  return { id: newId(), strokes, texts, images };
}

/**
 * Animatron → Stop-motion: one layer, one cel per timeline frame.
 * Bakes draw-on so playback still animates (flipbook), without path-layers.
 */
export function animatronToStopMotion(project: Project): Project {
  const count = Math.max(1, project.frameCount);
  const frames: (Frame | null)[] = [];
  let lastArt = -1;
  for (let i = 0; i < count; i++) {
    const cel = bakeAnimatronFrame(project, i);
    if (celHasArt(cel)) {
      frames.push(cel);
      lastArt = i;
    } else {
      // empty keyframe so a gap does not hold the previous drawing
      frames.push({ id: newId(), strokes: [], texts: [], images: [] });
    }
  }
  const frameCount = lastArt < 0 ? 1 : lastArt + 1;
  const layer: Layer = {
    id: newId(),
    name: "Layer 1",
    visible: true,
    isStatic: false,
    frames: frames.slice(0, frameCount),
  };
  return {
    ...projectShell(project, "stopmotion"),
    frameCount,
    layers: [layer],
  };
}

function popClip(startFrame: number, fps: number, last: boolean, untilFrame: number): StrokeClip {
  const ms = frameMs(fps);
  const startMs = startFrame * ms;
  const durationMs = Math.max(ms, (untilFrame - startFrame) * ms);
  return {
    startMs,
    durationMs,
    // Last pose holds so the timeline end is not a blank frame.
    hold: last,
    easing: { ...POP_EASING, bezier: [...POP_EASING.bezier] },
  };
}

/** Instant full stroke (no draw-on) for the clip window. */
function stillStroke(stroke: Stroke, groups: Map<string, string>, clip: StrokeClip): Stroke {
  const next = copyStroke(stroke, groups, clip);
  next.points = next.points.map((p) => ({ ...p, t: 0 }));
  return next;
}

function layerKeyframeIndices(layer: Layer, frameCount: number): number[] {
  const count = Math.max(1, frameCount);
  if (layer.isStatic) {
    return celHasArt(layer.frames[0] ?? null) ? [0] : [];
  }
  const keys: number[] = [];
  for (let i = 0; i < count; i++) {
    if (celHasArt(layer.frames[i] ?? null)) keys.push(i);
  }
  return keys;
}

function packLayerIntoAnimatron(
  layer: Layer,
  fps: number,
  frameCount: number,
): Layer | null {
  const keys = layerKeyframeIndices(layer, frameCount);
  if (keys.length === 0) return null;
  const groups = new Map<string, string>();
  const strokes: Stroke[] = [];
  const texts: TextElement[] = [];
  const images: ImageElement[] = [];
  for (let k = 0; k < keys.length; k++) {
    const i = keys[k]!;
    const until = keys[k + 1] ?? frameCount;
    const clip = popClip(i, fps, k === keys.length - 1, until);
    const cel = layer.frames[i]!;
    for (const s of cel.strokes) strokes.push(stillStroke(s, groups, clip));
    for (const t of cel.texts ?? []) texts.push(copyText(t, groups, clip));
    for (const im of cel.images ?? []) images.push(copyImage(im, groups, clip));
  }
  return {
    id: newId(),
    name: layer.name,
    visible: layer.visible,
    isStatic: false,
    frames: [{ id: newId(), strokes, texts, images }],
  };
}

/**
 * Stop-motion → Animatron: one SM layer = one Animatron layer.
 * Keyframes become clips on that layer (not a new layer per frame).
 */
export function stopMotionToAnimatron(project: Project): Project {
  const fps = Math.max(1, project.fps);
  const count = Math.max(1, project.frameCount);
  const layers: Layer[] = [];
  for (const layer of project.layers) {
    if (!layer.visible) continue;
    const packed = packLayerIntoAnimatron(layer, fps, count);
    if (packed) layers.push(packed);
  }
  if (layers.length === 0) {
    layers.push({
      id: newId(),
      name: "Layer 1",
      visible: true,
      isStatic: false,
      frames: [{ id: newId(), strokes: [], texts: [], images: [] }],
    });
  }
  return {
    ...projectShell(project, "animatron"),
    frameCount: count,
    layers,
  };
}

/** Playhead frame that actually shows converted Animatron art. */
export function firstVisibleWorkflowFrame(project: Project): number {
  if (project.workflow !== "animatron") return 0;
  let minStart = Infinity;
  for (const layer of project.layers) {
    const cel = layer.frames.find((f) => f) ?? null;
    if (!cel) continue;
    const items = [
      ...cel.strokes,
      ...(cel.texts ?? []),
      ...(cel.images ?? []),
    ];
    for (const item of items) {
      const start = item.clip?.startMs ?? 0;
      if (start < minStart) minStart = start;
    }
  }
  if (!Number.isFinite(minStart)) return 0;
  const fps = Math.max(1, project.fps);
  return Math.max(0, Math.min(project.frameCount - 1, Math.floor((minStart / 1000) * fps)));
}

/** Convert `project` into `to`. `from` defaults to `project.workflow`. */
export function convertProjectWorkflow(
  project: Project,
  to: ProjectWorkflow,
  from: ProjectWorkflow = project.workflow ?? "animatron",
): Project {
  if (from === to) {
    return { ...project, workflow: to };
  }
  return to === "stopmotion"
    ? animatronToStopMotion(project)
    : stopMotionToAnimatron(project);
}
