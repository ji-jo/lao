import {
  resolveCel,
  type Frame,
  type ImageElement,
  type Layer,
  type Project,
  type ProjectWorkflow,
  type Stroke,
  type StrokeClip,
  type TextElement,
} from "@/model/types";

/** Linear step — conversion clips are pop-on / pop-off, not eased draw-on. */
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

function flattenVisibleCels(project: Project): Frame {
  const groups = new Map<string, string>();
  const strokes: Stroke[] = [];
  const texts: TextElement[] = [];
  const images: ImageElement[] = [];
  for (const layer of project.layers) {
    if (!layer.visible) continue;
    const cel = layer.frames.find((f) => f) ?? null;
    if (!celHasArt(cel)) continue;
    for (const s of cel!.strokes) strokes.push(copyStroke(s, groups));
    for (const t of cel!.texts ?? []) texts.push(copyText(t, groups));
    for (const im of cel!.images ?? []) images.push(copyImage(im, groups));
  }
  return { id: newId(), strokes, texts, images };
}

/**
 * Animatron → Stop-motion: every visible path flattened onto a single cel.
 * One layer, one frame — not one layer per Animatron path.
 */
export function animatronToStopMotion(project: Project): Project {
  const cel = flattenVisibleCels(project);
  const layer: Layer = {
    id: newId(),
    name: "Layer 1",
    visible: true,
    isStatic: false,
    frames: [cel],
  };
  return {
    ...projectShell(project, "stopmotion"),
    frameCount: 1,
    layers: [layer],
  };
}

function frameMs(fps: number): number {
  return 1000 / Math.max(1, fps);
}

function popClip(frameIndex: number, fps: number): StrokeClip {
  const ms = frameMs(fps);
  return {
    startMs: frameIndex * ms,
    durationMs: ms,
    hold: false,
    easing: { ...POP_EASING, bezier: [...POP_EASING.bezier] },
  };
}

/** Instant full stroke (no draw-on) for the clip window. */
function stillStroke(stroke: Stroke, groups: Map<string, string>, clip: StrokeClip): Stroke {
  const next = copyStroke(stroke, groups, clip);
  next.points = next.points.map((p) => ({ ...p, t: 0 }));
  return next;
}

function compositeStopMotionFrame(project: Project, frameIndex: number): Frame {
  const groups = new Map<string, string>();
  const clip = popClip(frameIndex, project.fps);
  const strokes: Stroke[] = [];
  const texts: TextElement[] = [];
  const images: ImageElement[] = [];
  for (const layer of project.layers) {
    if (!layer.visible) continue;
    const cel = resolveCel(layer, frameIndex);
    if (!celHasArt(cel)) continue;
    for (const s of cel!.strokes) strokes.push(stillStroke(s, groups, clip));
    for (const t of cel!.texts ?? []) texts.push(copyText(t, groups, clip));
    for (const im of cel!.images ?? []) images.push(copyImage(im, groups, clip));
  }
  return { id: newId(), strokes, texts, images };
}

/**
 * Stop-motion → Animatron: one timeline frame becomes one layer.
 * Art pops on fully for that frame (no draw-on) then pops off — flipbook feel.
 */
export function stopMotionToAnimatron(project: Project): Project {
  const count = Math.max(1, project.frameCount);
  const layers: Layer[] = [];
  for (let i = 0; i < count; i++) {
    const cel = compositeStopMotionFrame(project, i);
    if (!celHasArt(cel)) continue;
    layers.push({
      id: newId(),
      name: `Frame ${i + 1}`,
      visible: true,
      isStatic: false,
      frames: [cel],
    });
  }
  if (layers.length === 0) {
    layers.push({
      id: newId(),
      name: "Frame 1",
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

/** Convert `project` into `to`. Same workflow → cloned shell with the flag set. */
export function convertProjectWorkflow(project: Project, to: ProjectWorkflow): Project {
  const from = project.workflow ?? "animatron";
  if (from === to) {
    return { ...project, workflow: to };
  }
  return to === "stopmotion"
    ? animatronToStopMotion(project)
    : stopMotionToAnimatron(project);
}
