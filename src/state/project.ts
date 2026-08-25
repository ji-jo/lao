import { create } from "zustand";
import {
  createEmptyProject,
  isLegacyVanishingEasing,
  projectHasArt,
  resolveCel,
  resolveCelIndex,
  DEFAULT_CLIP_EASING,
  type ClipEasing,
  type Frame,
  type Layer,
  type MorphClip,
  type MotionAssignment,
  type MotionPath,
  type Project,
  type ProjectWorkflow,
  type Stroke,
  type StrokeClip,
  type TextElement,
  type ImageElement,
} from "@/model/types";
import { useTools } from "@/state/tools";
import { usePlayback } from "@/state/playback";
import { useWorkflowMemory } from "@/state/workflowMemory";
import {
  convertProjectWorkflow,
  firstVisibleWorkflowFrame,
} from "@/model/workflowConvert";
import { translatePoints, transformPoints, translateBezierNodes, transformBezierNodes } from "@/engine/pathEdit";
import { measureTextBox, transformTextElement } from "@/engine/textGeometry";
import { extrasAfterPathEdit } from "@/components/stage/leaferBridge";
import { flattenBezierNodes, pointsToBezierNodes } from "@/lib/bezier";
import { clearBrushDraftCache } from "@/engine/brushStyles";
import {
  ART_DUPLICATE_OFFSET,
  cloneImageAtOffset,
  cloneStrokeAtOffset,
  cloneTextAtOffset,
} from "@/engine/artDuplicate";
import {
  reorderByIds,
  type ArtReorderWhere,
} from "@/engine/artReorder";
import {
  allProjectClipItems,
  projectClipEndMs,
  retimeStrokePoints,
  strokeDurationMs,
  typewriterDurationMs,
} from "@/engine/strokeProgress";
import { generateInbetweenFrames } from "@/engine/tween";
import { syncMotionPathPoints } from "@/engine/motionPathPresets";
const MAX_UNDO = 100;
const MIN_CLIP_MS = 80;

/**
 * Which cel to mutate for an edit.
 * Animatron path layers are sparse (`frames[0]` only). Advancing the playhead
 * for clip timing must NOT trigger stop-motion "held exposure" clone/no-op —
 * that made every move after create preview then snap back to frames[0].
 */
function resolveEditTarget(
  project: Project,
  layer: Layer,
  frameIndex: number,
): {
  readIndex: number;
  writeIndex: number;
  cloneFromHeld: boolean;
} | null {
  if (project.workflow === "animatron") {
    const idx = layer.frames.findIndex((f) => f !== null);
    if (idx < 0) return null;
    return { readIndex: idx, writeIndex: idx, cloneFromHeld: false };
  }
  const celIndex = resolveCelIndex(layer, layer.isStatic ? 0 : frameIndex);
  if (celIndex === null) return null;
  const isHeld = celIndex !== frameIndex && !layer.isStatic;
  const pb = usePlayback.getState();
  const tools = useTools.getState();
  const shouldClone =
    tools.autoKey && (!pb.onionSkin || pb.onionAutoDuplicate);
  if (isHeld && !shouldClone) {
    // Previously returned null — path/node live previews then snapped back on
    // pointer-up because replaceStrokePoints / convertStrokeToBezier no-op'd.
    // Edit the keyframe that feeds this hold (what the user is looking at).
    return { readIndex: celIndex, writeIndex: celIndex, cloneFromHeld: false };
  }
  return {
    readIndex: celIndex,
    writeIndex: isHeld ? frameIndex : celIndex,
    cloneFromHeld: isHeld,
  };
}

/** Shared offscreen ctx for measuring text during transforms. */
let measureCtx: CanvasRenderingContext2D | null = null;

function patchArtGroupIds(
  project: Project,
  frameIndex: number,
  ids: string[],
  groupId: string | undefined,
): Project | null {
  const idSet = new Set(ids);
  let anyChanged = false;
  const layers = project.layers.map((layer) => {
    const target = resolveEditTarget(project, layer, frameIndex);
    if (!target) return layer;
    const cel = layer.frames[target.readIndex];
    if (!cel) return layer;
    let changed = false;
    const stamp = <T extends { id: string; groupId?: string }>(item: T): T => {
      if (!idSet.has(item.id)) return item;
      if (!groupId) {
        if (!item.groupId) return item;
        changed = true;
        const { groupId: _drop, ...rest } = item;
        return rest as T;
      }
      if (item.groupId === groupId) return item;
      changed = true;
      return { ...item, groupId };
    };
    const strokes = cel.strokes.map(stamp);
    const texts = cel.texts?.map(stamp);
    const images = cel.images?.map(stamp);
    if (!changed) return layer;
    anyChanged = true;
    const writeCel = target.cloneFromHeld
      ? { ...cloneCel(cel), strokes, texts, images }
      : { ...cel, strokes, texts, images };
    return setCel(layer, target.writeIndex, writeCel);
  });
  return anyChanged ? { ...project, layers } : null;
}
function getMeasureCtx(): CanvasRenderingContext2D {
  if (!measureCtx) {
    measureCtx = document.createElement("canvas").getContext("2d")!;
  }
  return measureCtx;
}

/**
 * Files saved before the fade-out fix carry the old stamped default easing
 * (smooth / 4 in / 4 out) on every Animatron clip — which `clipFadeOpacity`
 * reads as "vanish forever after the clip ends", so finished paths dropped out
 * of playback and export. Rewrite exactly that stamped combination to hold
 * (fadeOut 0); anything else is a deliberate setting and passes through.
 */
function migrateLegacyVanishingClips(project: Project): Project {
  let touched = false;
  const layers = project.layers.map((layer) => {
    const frames = layer.frames.map((cel) => {
      if (!cel) return cel;
      let changed = false;
      const strokes = cel.strokes.map((s) => {
        if (!s.clip?.easing || !isLegacyVanishingEasing(s.clip.easing)) return s;
        touched = true;
        changed = true;
        return {
          ...s,
          clip: { ...s.clip, easing: { ...s.clip.easing, fadeOutFrames: 0 } },
        };
      });
      return changed ? { ...cel, strokes } : cel;
    });
    return frames === layer.frames ? layer : { ...layer, frames };
  });
  return touched ? { ...project, layers } : project;
}

interface ProjectState {
  project: Project;
  layerIndex: number;
  frameIndex: number;
  undoStack: Project[];
  redoStack: Project[];
  /** Animatron easing — applies to every clipped stroke; used for new paths too */
  clipEasing: ClipEasing;

  setFrameIndex: (i: number) => void;
  setLayerIndex: (i: number) => void;
  stepFrame: (delta: number) => void;

  addStroke: (stroke: Stroke) => void;
  addTextElement: (text: TextElement) => void;
  updateTextElement: (id: string, patch: Partial<TextElement>) => void;
  /** Place image on a new layer (MVP §25) and select it. */
  addImageElement: (image: ImageElement) => void;
  /** Place image on the active edit cel (bucket fill pockets). */
  addImageToActiveCel: (image: ImageElement) => void;
  updateImageElement: (id: string, patch: Partial<ImageElement>) => void;
  /** Patch color / fill / size on strokes in the active cel (one undo step). */
  updateStrokes: (
    ids: string[],
    patch: Partial<
      Pick<
        Stroke,
        | "color"
        | "fillColor"
        | "size"
        | "jitter"
        | "grain"
        | "brush"
        | "p5Brush"
        | "points"
        | "closed"
        | "shapeBox"
        | "cornerRadius"
        | "squircle"
        | "cornerSmoothing"
      >
    >,
  ) => void;
  removeTextElement: (id: string) => void;
  /** Reorder text in its cel: forward/backward one step, or to front/back. */
  reorderTextElement: (
    id: string,
    where: "forward" | "backward" | "front" | "back",
  ) => void;
  /** Reorder selected strokes / texts / images within each cel (later = in front). */
  reorderArt: (ids: string[], where: ArtReorderWhere) => void;
  /** Duplicate text at a slight offset; returns new id or null. */
  duplicateTextElement: (id: string) => string | null;
  /** Alt+click duplicate: clone selected art on the same layers, offset, new ids. */
  duplicateArt: (ids: string[], dx?: number, dy?: number) => string[];
  /** paste art into the current frame at original coordinates; returns the new ids */
  pasteArt: (art: {
    strokes: Stroke[];
    texts?: TextElement[];
    images?: ImageElement[];
  }) => string[];
  /** paste strokes into the current frame at their original coordinates; returns the new ids */
  pasteStrokes: (strokes: Stroke[]) => string[];
  deleteStrokes: (ids: string[]) => void;
  deleteNodes: (nodeIds: { strokeId: string; index: number }[]) => void;
  /** Freehand / brush strokes → editable cubic-bezier path for the Path tool. */
  convertStrokeToBezier: (strokeId: string) => void;
  replaceStrokePoints: (
    strokeId: string,
    points: Stroke["points"],
    bezierNodes?: Stroke["bezierNodes"],
    extras?: {
      shapeBox?: Stroke["shapeBox"];
      shapeKind?: Stroke["shapeKind"];
    },
  ) => void;
  /** translate many strokes in one undo step */
  translateStrokes: (ids: string[], dx: number, dy: number) => void;
  /** scale + rotate many strokes around a pivot in one undo step */
  transformStrokes: (
    ids: string[],
    pivotX: number,
    pivotY: number,
    scale: number,
    rotationRad: number,
  ) => void;
  /** Bind selected art into one group (Ctrl+G). */
  groupSelection: (ids: string[]) => void;
  /** Clear groupId on selected art (Ctrl+Shift+G). */
  ungroupSelection: (ids: string[]) => void;
  updateStrokeClip: (strokeId: string, clip: StrokeClip) => void;
  /** Broadcast easing to every stroke clip on every layer (and remember for new paths). */
  applyClipEasing: (easing: ClipEasing) => void;
  /** Path Maker — add/update/remove motion guides + assignments on a layer. */
  addMotionPath: (layerId: string, path: MotionPath) => void;
  updateMotionPath: (layerId: string, path: MotionPath) => void;
  /** Live drag of guide nodes — no undo; commit with updateMotionPath on up. */
  updateMotionPathLive: (layerId: string, path: MotionPath) => void;
  removeMotionPath: (layerId: string, pathId: string) => void;
  addMotionAssignment: (layerId: string, assignment: MotionAssignment) => void;
  updateMotionAssignment: (
    layerId: string,
    assignmentId: string,
    patch: Partial<MotionAssignment>,
  ) => void;
  removeMotionAssignment: (layerId: string, assignmentId: string) => void;
  /** Animatron live morph clips */
  addMorphClip: (clip: MorphClip) => void;
  updateMorphClip: (clipId: string, patch: Partial<MorphClip>) => void;
  removeMorphClip: (clipId: string) => void;
  /**
   * Stop-motion: bake N in-between cels between two keyframe indices on the
   * active layer. Inserts after `fromFrame` and shifts later frames.
   */
  generateInbetweens: (fromFrame: number, toFrame: number, count: number) => void;
  addKeyframe: () => void;
  duplicateFrameForward: () => void;
  deleteKeyframe: () => void;
  /** Grow/shrink timeline length by delta (negative shrinks; min 1). */
  extendTimeline: (frames: number) => void;
  /** Remove one exposure index from every layer and shrink frameCount. */
  removeFrameAt: (index: number) => void;
  setProjectSettings: (
    patch: Partial<
      Pick<
        Project,
        | "name"
        | "width"
        | "height"
        | "fps"
        | "frameCount"
        | "background"
        | "workflow"
        | "boil"
      >
    >,
  ) => void;
  /**
   * Live background tweak (e.g. image position drag) — updates project without
   * pushing undo. Pair with a single setProjectSettings on pointer-up.
   */
  setBackgroundLive: (background: Project["background"]) => void;
  /** Live boil scrub — no undo spam while dragging. */
  setBoilLive: (boil: NonNullable<Project["boil"]>) => void;
  addLayer: () => void;
  deleteLayer: (layerIndex: number) => void;
  /** Remove many timeline layers in one undo step (keeps at least one). */
  deleteLayers: (layerIndices: number[]) => void;
  reorderLayer: (from: number, to: number) => void;
  toggleLayerVisible: (layerIndex: number) => void;

  loadProject: (project: Project) => void;
  /** Swap Animatron ↔ Stop-motion, remembering each mode's document. */
  switchWorkflow: (next: ProjectWorkflow) => void;
  undo: () => void;
  redo: () => void;
}

function replaceLayer(project: Project, li: number, layer: Layer): Project {
  return { ...project, layers: project.layers.map((l, i) => (i === li ? layer : l)) };
}

function setCel(layer: Layer, fi: number, cel: Frame | null): Layer {
  const frames = layer.frames.slice();
  while (frames.length <= fi) frames.push(null);
  frames[fi] = cel;
  return { ...layer, frames };
}

function emptyCel(): Frame {
  return { id: crypto.randomUUID(), strokes: [], texts: [], images: [] };
}

function cloneCel(cel: Frame): Frame {
  return {
    id: crypto.randomUUID(),
    strokes: cel.strokes.map((st) => ({
      ...st,
      points: st.points.map((p) => ({ ...p })),
      clip: st.clip ? { ...st.clip } : undefined,
      bezierNodes: st.bezierNodes ? st.bezierNodes.map(n => ({...n})) : undefined,
    })),
    texts: cel.texts ? cel.texts.map(t => ({ ...t })) : [],
    images: cel.images ? cel.images.map((im) => ({ ...im })) : [],
  };
}

function ensureAnimatronLength(project: Project): Project {
  let endMs = projectClipEndMs(allProjectClipItems(project.layers));
  for (const layer of project.layers) {
    for (const a of layer.motionAssignments ?? []) {
      endMs = Math.max(endMs, a.startMs + a.durationMs);
    }
  }
  for (const m of project.morphs ?? []) {
    endMs = Math.max(endMs, m.startMs + m.durationMs);
  }
  // Need a frame whose timeMs >= endMs so strokeAtTime returns the full stroke.
  // i >= endMs/1000*fps → frameCount >= ceil(...) + 1.
  const fps = Math.max(1, project.fps);
  const need = Math.max(
    project.frameCount,
    Math.ceil((endMs / 1000) * fps) + 1,
  );
  if (need === project.frameCount) return project;
  return { ...project, frameCount: need };
}

/** Playhead frame at or past clip end (full stroke visible under strokeAtTime). */
function frameIndexAtOrPastMs(project: Project, timeMs: number): number {
  const fps = Math.max(1, project.fps);
  const fi = Math.ceil((timeMs / 1000) * fps);
  return Math.min(project.frameCount - 1, Math.max(0, fi));
}

function nextAnimatronClipStart(project: Project): number {
  return projectClipEndMs(allProjectClipItems(project.layers));
}

export const useProject = create<ProjectState>((set, get) => {
  /** history-recording update */
  function commit(next: Project) {
    set((s) => ({
      project: next,
      undoStack: [...s.undoStack.slice(-MAX_UNDO + 1), s.project],
      redoStack: [],
    }));
  }

  function addStrokeAnimatron(stroke: Stroke) {
    const s = get();
    let { project } = s;
    const { autoKey } = useTools.getState();
    const durationMs = Math.max(MIN_CLIP_MS, strokeDurationMs(stroke));
    const startMs = autoKey ? nextAnimatronClipStart(project) : 0;
    const clipped: Stroke = {
      ...stroke,
      clip: { startMs, durationMs, easing: { ...s.clipEasing } },
    };

    const active = project.layers[s.layerIndex];
    const activeCel = active?.frames.find((f) => f) ?? null;
    // Image / text layers look "empty" for strokes but still have content —
    // never replace their frames or the bitmap/text vanishes on first draw.
    const celHasArt =
      !!activeCel &&
      (activeCel.strokes.length > 0 ||
        (activeCel.texts?.length ?? 0) > 0 ||
        (activeCel.images?.length ?? 0) > 0);
    const activeEmpty = !!active && !celHasArt;

    if (activeEmpty && active) {
      // reuse the empty active layer for the first path
      const layer: Layer = {
        ...active,
        name: active.name.startsWith("Layer") ? `Path 1` : active.name,
        isStatic: false,
        frames: [
          {
            id: crypto.randomUUID(),
            strokes: [clipped],
            texts: [],
            images: [],
          },
        ],
      };
      project = ensureAnimatronLength({
        ...replaceLayer(project, s.layerIndex, layer),
        workflow: "animatron",
      });
      commit(project);
      usePlayback.getState().setWorkflow("animatron");
      // Scrub past clip end so strokeAtTime shows the full path (not a 1-pt "dot").
      const endMs = clipped.clip!.startMs + clipped.clip!.durationMs;
      set({ frameIndex: frameIndexAtOrPastMs(project, endMs) });
      return;
    }

    // insert new layer immediately below the previous path's layer
    // (keeps image/text layers intact when they were the active target)
    const insertAt = Math.min(s.layerIndex + 1, project.layers.length);
    const layer: Layer = {
      id: crypto.randomUUID(),
      name: `Path ${project.layers.length + 1}`,
      visible: true,
      isStatic: false,
      frames: [
        {
          id: crypto.randomUUID(),
          strokes: [clipped],
          texts: [],
          images: [],
        },
      ],
    };
    const layers = [
      ...project.layers.slice(0, insertAt),
      layer,
      ...project.layers.slice(insertAt),
    ];
    project = ensureAnimatronLength({
      ...project,
      layers,
      workflow: "animatron",
    });
    commit(project);
    const endMs = clipped.clip!.startMs + clipped.clip!.durationMs;
    set({
      layerIndex: insertAt,
      frameIndex: frameIndexAtOrPastMs(project, endMs),
    });
    usePlayback.getState().setWorkflow("animatron");
  }

  return {
    project: createEmptyProject(),
    layerIndex: 0,
    frameIndex: 0,
    undoStack: [],
    redoStack: [],
    clipEasing: { ...DEFAULT_CLIP_EASING },

    setFrameIndex: (i) =>
      set((s) => ({ frameIndex: Math.max(0, Math.min(i, s.project.frameCount - 1)) })),
    setLayerIndex: (i) =>
      set((s) => ({ layerIndex: Math.max(0, Math.min(i, s.project.layers.length - 1)) })),
    stepFrame: (delta) =>
      set((s) => {
        const n = s.project.frameCount;
        return { frameIndex: ((s.frameIndex + delta) % n + n) % n };
      }),

    addStroke: (stroke) => {
      if (usePlayback.getState().workflow === "animatron") {
        addStrokeAnimatron(stroke);
        return;
      }

      const s = get();
      const { autoKey } = useTools.getState();
      let { project, layerIndex, frameIndex } = s;
      let layer = project.layers[layerIndex];
      if (!layer) return;

      if (!autoKey && !layer.isStatic) {
        // Auto-key OFF: route the stroke to a static (held) layer
        let staticIndex = project.layers.findIndex((l) => l.isStatic);
        if (staticIndex === -1) {
          const staticLayer: Layer = {
            id: crypto.randomUUID(),
            name: "Static",
            visible: true,
            isStatic: true,
            frames: [emptyCel()],
          };
          project = { ...project, layers: [...project.layers, staticLayer] };
          staticIndex = project.layers.length - 1;
        }
        layerIndex = staticIndex;
        layer = project.layers[layerIndex];
        frameIndex = 0;
      }

      // Auto-key: drawing on a held/empty slot creates a keyframe there
      let celIndex = layer.isStatic ? 0 : frameIndex;
      let cel = layer.frames[celIndex] ?? null;
      if (!cel) {
        if (layer.isStatic) {
          cel = emptyCel();
        } else if (autoKey || resolveCelIndex(layer, frameIndex) === null) {
          // seed from held cel so prior art stays (flipbook expectation)
          const heldIdx = resolveCelIndex(layer, frameIndex);
          const pb = usePlayback.getState();
          const shouldClone = autoKey && (!pb.onionSkin || pb.onionAutoDuplicate);
          if (heldIdx !== null && shouldClone) {
            cel = cloneCel(layer.frames[heldIdx]!);
          } else {
            cel = emptyCel();
          }
        } else {
          // draw onto the held cel (extends the exposure's artwork)
          celIndex = resolveCelIndex(layer, frameIndex)!;
          cel = layer.frames[celIndex]!;
        }
      }
      const nextCel: Frame = { ...cel, strokes: [...cel.strokes, stroke] };
      commit(replaceLayer(project, layerIndex, setCel(layer, celIndex, nextCel)));
    },

    addTextElement: (text) => {
      const s = get();
      const active = s.project.layers[s.layerIndex];
      if (!active) return;

      // Animatron: always the painted cel (frames.find). Stop-motion: exposure
      // sheet via resolveEditTarget. Writing to scrubbed frameIndex made text
      // commit succeed while the stage still painted frames[0] without it.
      const target = resolveEditTarget(s.project, active, s.frameIndex);
      if (!target) return;

      const tools = useTools.getState();
      const animatron =
        s.project.workflow === "animatron" ||
        usePlayback.getState().workflow === "animatron";
      let stamped = text;
      if (animatron && !text.clip) {
        const cps = tools.textTypewriter ? tools.textTypewriterSpeed : 0;
        const durationMs = Math.max(
          MIN_CLIP_MS,
          cps > 0 ? typewriterDurationMs(text.text, cps) : 1000,
        );
        stamped = {
          ...text,
          typewriterSpeed: text.typewriterSpeed ?? cps,
          clip: {
            startMs: tools.autoKey ? nextAnimatronClipStart(s.project) : 0,
            durationMs,
            easing: { ...s.clipEasing },
          },
        };
      }

      const cel = active.frames[target.readIndex]!;
      const texts = [...(cel.texts || []), stamped];
      const writeCel = target.cloneFromHeld
        ? { ...cloneCel(cel), texts }
        : { ...cel, texts };
      let next = replaceLayer(
        s.project,
        s.layerIndex,
        setCel(active, target.writeIndex, writeCel),
      );
      if (animatron) {
        next = ensureAnimatronLength({ ...next, workflow: "animatron" });
      }
      commit(next);
      if (animatron && stamped.clip) {
        const endMs = stamped.clip.startMs + stamped.clip.durationMs;
        set({ frameIndex: frameIndexAtOrPastMs(next, endMs) });
      }
    },

    addImageElement: (image) => {
      const s = get();
      const fi = Math.max(0, s.frameIndex);
      const animatron = usePlayback.getState().workflow === "animatron";
      const stamped: ImageElement =
        animatron && !image.clip
          ? {
              ...image,
              clip: {
                startMs: nextAnimatronClipStart(s.project),
                durationMs: Math.max(MIN_CLIP_MS, 1000),
                easing: { ...s.clipEasing },
              },
            }
          : image;
      const layer: Layer = {
        id: crypto.randomUUID(),
        name: `Image ${s.project.layers.length + 1}`,
        visible: true,
        isStatic: false,
        frames: Array.from({ length: Math.max(1, s.project.frameCount) }, (_, i) =>
          i === fi
            ? { id: crypto.randomUUID(), strokes: [], texts: [], images: [stamped] }
            : null,
        ),
      };
      // Ensure frame slot exists
      while (layer.frames.length <= fi) layer.frames.push(null);
      if (!layer.frames[fi]) {
        layer.frames[fi] = {
          id: crypto.randomUUID(),
          strokes: [],
          texts: [],
          images: [stamped],
        };
      }
      const next = animatron
        ? ensureAnimatronLength({ ...s.project, layers: [...s.project.layers, layer] })
        : { ...s.project, layers: [...s.project.layers, layer] };
      commit(next);
      set({ layerIndex: s.project.layers.length, frameIndex: fi });
    },

    addImageToActiveCel: (image) => {
      const s = get();
      const layer = s.project.layers[s.layerIndex];
      if (!layer) return;
      const target = resolveEditTarget(s.project, layer, s.frameIndex);
      if (!target) return;
      const cel = layer.frames[target.readIndex];
      if (!cel) return;
      const animatron =
        s.project.workflow === "animatron" ||
        usePlayback.getState().workflow === "animatron";
      const stamped: ImageElement =
        animatron && !image.clip
          ? {
              ...image,
              clip: {
                startMs: nextAnimatronClipStart(s.project),
                durationMs: Math.max(MIN_CLIP_MS, 1000),
                easing: { ...s.clipEasing },
              },
            }
          : image;
      const writeCel = target.cloneFromHeld
        ? {
            ...cloneCel(cel),
            images: [...(cel.images ?? []), stamped],
          }
        : {
            ...cel,
            images: [...(cel.images ?? []), stamped],
          };
      commit(
        replaceLayer(
          s.project,
          s.layerIndex,
          setCel(layer, target.writeIndex, writeCel),
        ),
      );
    },

    updateImageElement: (id, patch) => {
      const s = get();
      let found = false;
      let nextProject = { ...s.project, layers: [...s.project.layers] };

      for (let li = 0; li < nextProject.layers.length; li++) {
        const layer = nextProject.layers[li]!;
        let newFrames = [...layer.frames];
        let layerChanged = false;

        for (let fi = 0; fi < newFrames.length; fi++) {
          const cel = newFrames[fi];
          if (!cel?.images?.length) continue;
          const idx = cel.images.findIndex((im) => im.id === id);
          if (idx === -1) continue;
          const cur = cel.images[idx]!;
          const nextImages = [...cel.images];
          nextImages[idx] = { ...cur, ...patch };
          newFrames[fi] = { ...cel, images: nextImages };
          layerChanged = true;
          found = true;
        }
        if (layerChanged) {
          nextProject.layers[li] = { ...layer, frames: newFrames };
        }
      }
      if (found) commit(nextProject);
    },

    updateTextElement: (id, patch) => {
      const s = get();
      let found = false;
      let nextProject = { ...s.project, layers: [...s.project.layers] };
      
      for (let li = 0; li < nextProject.layers.length; li++) {
        const layer = nextProject.layers[li];
        let newFrames = [...layer.frames];
        let layerChanged = false;
        
        for (let fi = 0; fi < newFrames.length; fi++) {
          const cel = newFrames[fi];
          if (!cel || !cel.texts) continue;
          
          const textIdx = cel.texts.findIndex(t => t.id === id);
          if (textIdx !== -1) {
            const nextTexts = [...cel.texts];
            nextTexts[textIdx] = { ...nextTexts[textIdx], ...patch };
            newFrames[fi] = { ...cel, texts: nextTexts };
            layerChanged = true;
            found = true;
          }
        }
        if (layerChanged) {
          nextProject.layers[li] = { ...layer, frames: newFrames };
        }
      }
      if (found) commit(nextProject);
    },

    updateStrokes: (ids, patch) => {
      if (!ids.length) return;
      const idSet = new Set(ids);
      const { project, layerIndex, frameIndex } = get();
      const pb = usePlayback.getState();
      const tools = useTools.getState();
      const animatron = project.workflow === "animatron";

      let nextProject = project;
      let anyChanged = false;

      // Patch matching strokes on every layer — Animatron keeps one path per layer.
      for (let li = 0; li < nextProject.layers.length; li++) {
        const layer = nextProject.layers[li]!;
        const celIndex = animatron
          ? layer.frames.findIndex((f) => f !== null)
          : resolveCelIndex(
              layer,
              layer.isStatic ? 0 : li === layerIndex ? frameIndex : frameIndex,
            );
        if (celIndex === null || celIndex < 0) continue;

        const isHeld =
          !animatron &&
          li === layerIndex &&
          celIndex !== frameIndex &&
          !layer.isStatic;
        const shouldClone =
          tools.autoKey && (!pb.onionSkin || pb.onionAutoDuplicate);
        if (isHeld && !shouldClone) continue;

        const cel = layer.frames[celIndex]!;
        if (!cel.strokes.some((s) => idSet.has(s.id))) continue;

        let changed = false;
        const strokes = cel.strokes.map((s) => {
          if (!idSet.has(s.id)) return s;
          const nextPatch = { ...patch };
          const closedAfter = patch.closed ?? s.closed;
          if (!closedAfter) delete nextPatch.fillColor;
          if (Object.keys(nextPatch).length === 0) return s;
          changed = true;
          return { ...s, ...nextPatch };
        });
        if (!changed) continue;
        anyChanged = true;

        const writeFi = isHeld ? frameIndex : celIndex;
        const writeCel = isHeld
          ? { ...cloneCel(cel), strokes }
          : { ...cel, strokes };
        nextProject = replaceLayer(
          nextProject,
          li,
          setCel(layer, writeFi, writeCel),
        );
      }

      if (anyChanged) commit(nextProject);
    },

    removeTextElement: (id) => {
      const s = get();
      let found = false;
      let nextProject = { ...s.project, layers: [...s.project.layers] };
      
      for (let li = 0; li < nextProject.layers.length; li++) {
        const layer = nextProject.layers[li];
        let newFrames = [...layer.frames];
        let layerChanged = false;
        
        for (let fi = 0; fi < newFrames.length; fi++) {
          const cel = newFrames[fi];
          if (!cel || !cel.texts) continue;
          
          const textIdx = cel.texts.findIndex(t => t.id === id);
          if (textIdx !== -1) {
            const nextTexts = [...cel.texts];
            nextTexts.splice(textIdx, 1);
            newFrames[fi] = { ...cel, texts: nextTexts };
            layerChanged = true;
            found = true;
          }
        }
        if (layerChanged) {
          nextProject.layers[li] = { ...layer, frames: newFrames };
        }
      }
      if (found) commit(nextProject);
    },

    reorderTextElement: (id, where) => {
      get().reorderArt([id], where);
    },

    reorderArt: (ids, where) => {
      if (!ids.length) return;
      const { project, frameIndex } = get();
      let nextProject = project;
      let anyChanged = false;

      for (let li = 0; li < nextProject.layers.length; li++) {
        const layer = nextProject.layers[li];
        const target = resolveEditTarget(nextProject, layer, frameIndex);
        if (!target) continue;
        const cel = layer.frames[target.readIndex];
        if (!cel) continue;

        const strokes = reorderByIds(cel.strokes, ids, where);
        const texts = cel.texts
          ? reorderByIds(cel.texts, ids, where)
          : undefined;
        const images = cel.images
          ? reorderByIds(cel.images, ids, where)
          : undefined;
        if (
          strokes === cel.strokes &&
          texts === cel.texts &&
          images === cel.images
        ) {
          continue;
        }

        const writeCel = target.cloneFromHeld
          ? { ...cloneCel(cel), strokes, texts, images }
          : { ...cel, strokes, texts, images };
        nextProject = replaceLayer(
          nextProject,
          li,
          setCel(nextProject.layers[li], target.writeIndex, writeCel),
        );
        anyChanged = true;
      }
      if (anyChanged) commit(nextProject);
    },

    duplicateTextElement: (id) => {
      const s = get();
      const { project, layerIndex, frameIndex } = s;
      const layer = project.layers[layerIndex];
      if (!layer) return null;
      const animatron = project.workflow === "animatron";
      const celIndex = animatron
        ? layer.frames.findIndex((f) => f !== null)
        : resolveCelIndex(layer, layer.isStatic ? 0 : frameIndex);
      if (celIndex === null || celIndex < 0) return null;
      const cel = layer.frames[celIndex];
      if (!cel?.texts) return null;
      const src = cel.texts.find((t) => t.id === id);
      if (!src) return null;
      const newId = crypto.randomUUID();
      const copy: TextElement = {
        ...src,
        id: newId,
        x: src.x + 16,
        y: src.y + 16,
        path: src.path ? { ...src.path } : src.path,
        shadow: src.shadow ? { ...src.shadow } : src.shadow,
      };
      const nextCel = { ...cel, texts: [...cel.texts, copy] };
      commit(replaceLayer(project, layerIndex, setCel(layer, celIndex, nextCel)));
      return newId;
    },

    duplicateArt: (ids, dx = ART_DUPLICATE_OFFSET, dy = ART_DUPLICATE_OFFSET) => {
      if (!ids.length) return [];
      const idSet = new Set(ids);
      const { project, frameIndex } = get();
      const newIds: string[] = [];
      let nextProject = project;
      let any = false;

      for (let li = 0; li < nextProject.layers.length; li++) {
        const layer = nextProject.layers[li];
        const target = resolveEditTarget(nextProject, layer, frameIndex);
        if (!target) continue;
        const cel = layer.frames[target.readIndex];
        if (!cel) continue;

        const extraStrokes: Stroke[] = [];
        const extraTexts: TextElement[] = [];
        const extraImages: ImageElement[] = [];
        for (const s of cel.strokes) {
          if (!idSet.has(s.id)) continue;
          const copy = cloneStrokeAtOffset(s, dx, dy);
          extraStrokes.push(copy);
          newIds.push(copy.id);
        }
        for (const t of cel.texts ?? []) {
          if (!idSet.has(t.id)) continue;
          const copy = cloneTextAtOffset(t, dx, dy);
          extraTexts.push(copy);
          newIds.push(copy.id);
        }
        for (const im of cel.images ?? []) {
          if (!idSet.has(im.id)) continue;
          const copy = cloneImageAtOffset(im, dx, dy);
          extraImages.push(copy);
          newIds.push(copy.id);
        }
        if (!extraStrokes.length && !extraTexts.length && !extraImages.length) {
          continue;
        }

        const writeCel = target.cloneFromHeld ? cloneCel(cel) : { ...cel };
        writeCel.strokes = [...writeCel.strokes, ...extraStrokes];
        writeCel.texts = [...(writeCel.texts ?? []), ...extraTexts];
        writeCel.images = [...(writeCel.images ?? []), ...extraImages];
        nextProject = replaceLayer(
          nextProject,
          li,
          setCel(nextProject.layers[li], target.writeIndex, writeCel),
        );
        any = true;
      }
      if (any) commit(nextProject);
      return newIds;
    },

    pasteArt: (art) => {
      const strokesIn = art.strokes ?? [];
      const textsIn = art.texts ?? [];
      const imagesIn = art.images ?? [];
      if (!strokesIn.length && !textsIn.length && !imagesIn.length) return [];

      const { project, layerIndex, frameIndex } = get();
      const layer = project.layers[layerIndex];
      if (!layer) return [];
      const target = resolveEditTarget(project, layer, frameIndex);
      const writeIndex =
        target?.writeIndex ?? (layer.isStatic ? 0 : frameIndex);
      const readIndex = target?.readIndex ?? writeIndex;

      const pastedStrokes = strokesIn.map((s) => {
        const { groupId: _drop, ...rest } = s;
        return {
          ...rest,
          id: crypto.randomUUID(),
          points: s.points.map((p) => ({ ...p })),
        };
      });
      const pastedTexts = textsIn.map((t) => {
        const { groupId: _drop, ...rest } = t;
        return {
          ...rest,
          id: crypto.randomUUID(),
          path: t.path ? { ...t.path } : t.path,
          shadow: t.shadow ? { ...t.shadow } : t.shadow,
        };
      });
      const pastedImages = imagesIn.map((im) => {
        const { groupId: _drop, ...rest } = im;
        return { ...rest, id: crypto.randomUUID() };
      });
      const newIds = [
        ...pastedStrokes.map((s) => s.id),
        ...pastedTexts.map((t) => t.id),
        ...pastedImages.map((im) => im.id),
      ];

      const existing = layer.frames[readIndex] ?? null;
      const base = existing
        ? target?.cloneFromHeld
          ? cloneCel(existing)
          : { ...existing }
        : emptyCel();
      const cel: Frame = {
        ...base,
        strokes: [...base.strokes, ...pastedStrokes],
        texts: [...(base.texts ?? []), ...pastedTexts],
        images: [...(base.images ?? []), ...pastedImages],
      };
      commit(replaceLayer(project, layerIndex, setCel(layer, writeIndex, cel)));
      return newIds;
    },

    pasteStrokes: (strokes) => get().pasteArt({ strokes }),

    deleteStrokes: (ids) => {
      if (!ids.length) return;
      const idSet = new Set(ids);
      const { project, frameIndex, layerIndex } = get();
      let nextProject = project;
      let anyChanged = false;
      const dropLayers = new Set<number>();

      for (let li = 0; li < nextProject.layers.length; li++) {
        const layer = nextProject.layers[li];
        const target = resolveEditTarget(nextProject, layer, frameIndex);
        if (!target) continue;
        const cel = layer.frames[target.readIndex];
        if (!cel) continue;

        const strokes = cel.strokes.filter((s) => !idSet.has(s.id));
        const texts = cel.texts?.filter((t) => !idSet.has(t.id));
        const images = cel.images?.filter((im) => !idSet.has(im.id));
        const removedImage =
          (cel.images?.length ?? 0) > 0 &&
          (images?.length ?? 0) < (cel.images?.length ?? 0);
        if (
          strokes.length === cel.strokes.length &&
          (!cel.texts || texts?.length === cel.texts.length) &&
          (!cel.images || images?.length === cel.images.length)
        ) {
          continue;
        }
        anyChanged = true;

        if (
          removedImage &&
          strokes.length === 0 &&
          !(texts?.length) &&
          !(images?.length) &&
          nextProject.layers.length - dropLayers.size > 1
        ) {
          dropLayers.add(li);
          continue;
        }

        const writeCel = target.cloneFromHeld
          ? { ...cloneCel(cel), strokes, texts, images }
          : { ...cel, strokes, texts, images };
        nextProject = replaceLayer(
          nextProject,
          li,
          setCel(nextProject.layers[li], target.writeIndex, writeCel),
        );
      }
      if (!anyChanged) return;

      let nextLayerIndex = layerIndex;
      if (dropLayers.size) {
        const layers = nextProject.layers.filter((_, i) => !dropLayers.has(i));
        nextProject = { ...nextProject, layers };
        const removedBefore = [...dropLayers].filter((i) => i < layerIndex).length;
        nextLayerIndex = Math.min(
          Math.max(0, layerIndex - removedBefore),
          Math.max(0, layers.length - 1),
        );
      }
      commit(nextProject);
      if (nextLayerIndex !== get().layerIndex) {
        set({ layerIndex: nextLayerIndex });
      }
    },

    convertStrokeToBezier: (strokeId) => {
      const { project, frameIndex } = get();
      for (let li = 0; li < project.layers.length; li++) {
        const layer = project.layers[li];
        const target = resolveEditTarget(project, layer, frameIndex);
        if (!target) continue;
        const cel = layer.frames[target.readIndex];
        if (!cel) continue;
        const stroke = cel.strokes.find((s) => s.id === strokeId);
        if (!stroke || stroke.bezierNodes?.length || stroke.points.length < 2) {
          continue;
        }

        const { nodes, closed } = pointsToBezierNodes(stroke.points, {
          closed: stroke.closed,
          strokeSize: stroke.size,
        });
        if (nodes.length < 2) continue;

        const durationHint =
          stroke.clip?.durationMs ?? strokeDurationMs(stroke.points);
        const points = flattenBezierNodes(
          nodes,
          closed || stroke.closed,
          durationHint > 0 ? durationHint : undefined,
        );
        const extras = extrasAfterPathEdit(stroke);
        const strokes = cel.strokes.map((s) => {
          if (s.id !== strokeId) return s;
          const next: Stroke = {
            ...s,
            points,
            bezierNodes: nodes,
            closed: closed || s.closed || undefined,
          };
          if (s.clip) {
            next.clip = {
              ...s.clip,
              durationMs: Math.max(MIN_CLIP_MS, strokeDurationMs(points)),
            };
          }
          if (extras) {
            if ("shapeBox" in extras) {
              if (extras.shapeBox === undefined) delete next.shapeBox;
              else next.shapeBox = extras.shapeBox;
            }
            if ("shapeKind" in extras) {
              if (extras.shapeKind === undefined) delete next.shapeKind;
              else next.shapeKind = extras.shapeKind;
            }
          }
          return next;
        });

        const writeCel = target.cloneFromHeld
          ? { ...cloneCel(cel), strokes }
          : { ...cel, strokes };
        commit(
          replaceLayer(
            project,
            li,
            setCel(layer, target.writeIndex, writeCel),
          ),
        );
        return;
      }
    },

    deleteNodes: (nodeIds) => {
      const { project, layerIndex, frameIndex } = get();
      const layer = project.layers[layerIndex];
      if (!layer) return;
      const target = resolveEditTarget(project, layer, frameIndex);
      if (!target) return;

      const cel = layer.frames[target.readIndex]!;

      const toDelete = new Map<string, Set<number>>();
      for (const { strokeId, index } of nodeIds) {
        if (!toDelete.has(strokeId)) toDelete.set(strokeId, new Set());
        toDelete.get(strokeId)!.add(index);
      }

      let changed = false;
      const strokes = cel.strokes
        .map((s) => {
          const delSet = toDelete.get(s.id);
          if (!delSet) return s;
          changed = true;
          if (s.bezierNodes) {
            const newNodes = s.bezierNodes.filter((_, i) => !delSet.has(i));
            const durationHint =
              s.clip?.durationMs ?? strokeDurationMs(s.points);
            const newPoints = flattenBezierNodes(
              newNodes,
              s.closed,
              durationHint > 0 ? durationHint : undefined,
            );
            const next: Stroke = {
              ...s,
              bezierNodes: newNodes,
              points: newPoints,
            };
            if (s.clip) {
              next.clip = {
                ...s.clip,
                durationMs: Math.max(MIN_CLIP_MS, strokeDurationMs(newPoints)),
              };
            }
            return next;
          }
          return { ...s, points: s.points.filter((_, i) => !delSet.has(i)) };
        })
        .filter((s) =>
          s.bezierNodes ? s.bezierNodes.length > 0 : s.points.length > 0,
        );

      if (!changed) return;

      const writeCel = target.cloneFromHeld
        ? { ...cloneCel(cel), strokes }
        : { ...cel, strokes };
      commit(
        replaceLayer(
          project,
          layerIndex,
          setCel(layer, target.writeIndex, writeCel),
        ),
      );
    },

    replaceStrokePoints: (strokeId, points, bezierNodes, extras) => {
      const { project, layerIndex, frameIndex } = get();
      const layer = project.layers[layerIndex];
      if (!layer) return;
      const target = resolveEditTarget(project, layer, frameIndex);
      if (!target) return;

      const cel = layer.frames[target.readIndex]!;
      if (!cel.strokes.some((s) => s.id === strokeId)) return;
      const strokes = cel.strokes.map((s) => {
        if (s.id !== strokeId) return s;
        const durationHint =
          s.clip?.durationMs ?? strokeDurationMs(s.points);
        const timedPoints = bezierNodes
          ? retimeStrokePoints(
              points,
              durationHint > 0 ? durationHint : undefined,
            )
          : points;
        const next: Stroke = {
          ...s,
          points: timedPoints,
          ...(bezierNodes ? { bezierNodes } : {}),
        };
        if (s.clip) {
          next.clip = {
            ...s.clip,
            durationMs: Math.max(MIN_CLIP_MS, strokeDurationMs(timedPoints)),
          };
        }
        if (extras) {
          if ("shapeBox" in extras) {
            if (extras.shapeBox === undefined) delete next.shapeBox;
            else next.shapeBox = extras.shapeBox;
          }
          if ("shapeKind" in extras) {
            if (extras.shapeKind === undefined) delete next.shapeKind;
            else next.shapeKind = extras.shapeKind;
          }
        }
        return next;
      });

      const writeCel = target.cloneFromHeld
        ? { ...cloneCel(cel), strokes }
        : { ...cel, strokes };
      commit(
        replaceLayer(
          project,
          layerIndex,
          setCel(layer, target.writeIndex, writeCel),
        ),
      );
    },

    translateStrokes: (ids, dx, dy) => {
      if (!ids.length || (dx === 0 && dy === 0)) return;
      const { project, frameIndex } = get();
      const idSet = new Set(ids);
      let nextProject = project;
      let anyChanged = false;

      for (let li = 0; li < nextProject.layers.length; li++) {
        const layer = nextProject.layers[li];
        const target = resolveEditTarget(nextProject, layer, frameIndex);
        if (!target) continue;
        const cel = layer.frames[target.readIndex];
        if (!cel) continue;

        let changed = false;
        const strokes = cel.strokes.map((s) => {
          if (!idSet.has(s.id)) return s;
          changed = true;
          const next: typeof s = {
            ...s,
            points: translatePoints(s.points, dx, dy),
          };
          if (s.bezierNodes?.length) {
            next.bezierNodes = translateBezierNodes(s.bezierNodes, dx, dy);
            const durationHint =
              s.clip?.durationMs ?? strokeDurationMs(s.points);
            next.points = flattenBezierNodes(
              next.bezierNodes,
              s.closed,
              durationHint > 0 ? durationHint : undefined,
            );
          }
          if (s.shapeBox) {
            next.shapeBox = {
              ...s.shapeBox,
              x: s.shapeBox.x + dx,
              y: s.shapeBox.y + dy,
            };
          }
          return next;
        });
        const texts = cel.texts
          ? cel.texts.map((t) => {
              if (!idSet.has(t.id)) return t;
              changed = true;
              return { ...t, x: t.x + dx, y: t.y + dy };
            })
          : undefined;
        const images = cel.images
          ? cel.images.map((im) => {
              if (!idSet.has(im.id)) return im;
              changed = true;
              return { ...im, x: im.x + dx, y: im.y + dy };
            })
          : undefined;
        if (!changed) continue;

        const writeCel = target.cloneFromHeld
          ? { ...cloneCel(cel), strokes, texts, images }
          : { ...cel, strokes, texts, images };
        nextProject = replaceLayer(
          nextProject,
          li,
          setCel(nextProject.layers[li], target.writeIndex, writeCel),
        );
        anyChanged = true;
      }
      if (anyChanged) commit(nextProject);
    },

    transformStrokes: (ids, pivotX, pivotY, scale, rotationRad) => {
      if (!ids.length || (scale === 1 && rotationRad === 0)) return;
      const { project, frameIndex } = get();
      const idSet = new Set(ids);
      const mctx = getMeasureCtx();
      let nextProject = project;
      let anyChanged = false;

      for (let li = 0; li < nextProject.layers.length; li++) {
        const layer = nextProject.layers[li];
        const target = resolveEditTarget(nextProject, layer, frameIndex);
        if (!target) continue;
        const cel = layer.frames[target.readIndex];
        if (!cel) continue;

        let changed = false;
        const strokes = cel.strokes.map((s) => {
          if (!idSet.has(s.id)) return s;
          changed = true;
          const next: typeof s = {
            ...s,
            points: transformPoints(s.points, pivotX, pivotY, scale, rotationRad),
            size: Math.max(0.5, s.size * scale),
          };
          if (s.bezierNodes?.length) {
            next.bezierNodes = transformBezierNodes(
              s.bezierNodes,
              pivotX,
              pivotY,
              scale,
              rotationRad,
            );
            next.points = flattenBezierNodes(
              next.bezierNodes,
              s.closed,
              (s.clip?.durationMs ?? strokeDurationMs(s.points)) > 0
                ? s.clip?.durationMs ?? strokeDurationMs(s.points)
                : undefined,
            );
          }
          if (s.shapeBox) {
            const box = s.shapeBox;
            if (s.shapeKind === "line" || s.shapeKind === "arrow") {
              const [p0] = transformPoints(
                [{ x: box.x, y: box.y, pressure: 0, t: 0 }],
                pivotX,
                pivotY,
                scale,
                rotationRad,
              );
              const [p1] = transformPoints(
                [
                  {
                    x: box.x + box.w,
                    y: box.y + box.h,
                    pressure: 0,
                    t: 0,
                  },
                ],
                pivotX,
                pivotY,
                scale,
                rotationRad,
              );
              next.shapeBox = {
                x: p0!.x,
                y: p0!.y,
                w: p1!.x - p0!.x,
                h: p1!.y - p0!.y,
                rotation: 0,
              };
            } else {
              const cx = box.x + box.w / 2;
              const cy = box.y + box.h / 2;
              const [c] = transformPoints(
                [{ x: cx, y: cy, pressure: 0, t: 0 }],
                pivotX,
                pivotY,
                scale,
                rotationRad,
              );
              next.shapeBox = {
                x: c!.x - (box.w * scale) / 2,
                y: c!.y - (box.h * scale) / 2,
                w: Math.max(1, box.w * scale),
                h: Math.max(1, box.h * scale),
                rotation: (box.rotation ?? 0) + rotationRad || undefined,
              };
            }
          }
          return next;
        });
        const texts = cel.texts
          ? cel.texts.map((t) => {
              if (!idSet.has(t.id)) return t;
              changed = true;
              const box = measureTextBox(mctx, t);
              return transformTextElement(
                t,
                box,
                pivotX,
                pivotY,
                scale,
                rotationRad,
              );
            })
          : undefined;
        const images = cel.images
          ? cel.images.map((im) => {
              if (!idSet.has(im.id)) return im;
              changed = true;
              const cx = im.x + im.w / 2;
              const cy = im.y + im.h / 2;
              const [c] = transformPoints(
                [{ x: cx, y: cy, pressure: 0, t: 0 }],
                pivotX,
                pivotY,
                scale,
                rotationRad,
              );
              const nw = Math.max(1, im.w * scale);
              const nh = Math.max(1, im.h * scale);
              return {
                ...im,
                x: c!.x - nw / 2,
                y: c!.y - nh / 2,
                w: nw,
                h: nh,
                rotation: (im.rotation ?? 0) + rotationRad,
              };
            })
          : undefined;
        if (!changed) continue;

        const writeCel = target.cloneFromHeld
          ? { ...cloneCel(cel), strokes, texts, images }
          : { ...cel, strokes, texts, images };
        nextProject = replaceLayer(
          nextProject,
          li,
          setCel(nextProject.layers[li], target.writeIndex, writeCel),
        );
        anyChanged = true;
      }
      if (anyChanged) commit(nextProject);
    },

    groupSelection: (ids) => {
      const unique = [...new Set(ids)].filter(Boolean);
      if (unique.length < 2) return;
      const { project, frameIndex } = get();
      const next = patchArtGroupIds(
        project,
        frameIndex,
        unique,
        crypto.randomUUID(),
      );
      if (next) commit(next);
    },

    ungroupSelection: (ids) => {
      const unique = [...new Set(ids)].filter(Boolean);
      if (!unique.length) return;
      const { project, frameIndex } = get();
      const next = patchArtGroupIds(project, frameIndex, unique, undefined);
      if (next) commit(next);
    },

    updateStrokeClip: (strokeId, clip) => {
      const { project } = get();
      let found = false;
      const layers = project.layers.map((layer) => {
        const frames = layer.frames.map((cel) => {
          if (!cel) return cel;
          const strokes = cel.strokes.map((s) => {
            if (s.id !== strokeId) return s;
            found = true;
            return {
              ...s,
              clip: {
                ...s.clip,
                ...clip,
                easing: clip.easing ?? s.clip?.easing,
              },
            };
          });
          return strokes === cel.strokes ? cel : { ...cel, strokes };
        });
        return { ...layer, frames };
      });
      if (!found) return;
      commit(ensureAnimatronLength({ ...project, layers }));
    },

    applyClipEasing: (easing) => {
      const { project } = get();
      const nextEasing = { ...easing, bezier: [...easing.bezier] as ClipEasing["bezier"] };
      let touched = false;
      const layers = project.layers.map((layer) => {
        let layerChanged = false;
        const frames = layer.frames.map((cel) => {
          if (!cel) return cel;
          let changed = false;
          const strokes = cel.strokes.map((s) => {
            if (!s.clip) return s;
            touched = true;
            changed = true;
            return { ...s, clip: { ...s.clip, easing: { ...nextEasing } } };
          });
          if (changed) layerChanged = true;
          return changed ? { ...cel, strokes } : cel;
        });
        return layerChanged ? { ...layer, frames } : layer;
      });
      set({ clipEasing: nextEasing });
      if (touched) commit(ensureAnimatronLength({ ...project, layers }));
    },

    addMotionPath: (layerId, path) => {
      const { project } = get();
      const li = project.layers.findIndex((l) => l.id === layerId);
      if (li < 0) return;
      const layer = project.layers[li]!;
      const synced = syncMotionPathPoints(path);
      commit(
        replaceLayer(project, li, {
          ...layer,
          motionPaths: [...(layer.motionPaths ?? []), synced],
        }),
      );
    },

    updateMotionPath: (layerId, path) => {
      const { project } = get();
      const li = project.layers.findIndex((l) => l.id === layerId);
      if (li < 0) return;
      const layer = project.layers[li]!;
      const paths = layer.motionPaths ?? [];
      if (!paths.some((p) => p.id === path.id)) return;
      const synced = syncMotionPathPoints(path);
      commit(
        replaceLayer(project, li, {
          ...layer,
          motionPaths: paths.map((p) => (p.id === path.id ? synced : p)),
        }),
      );
    },

    /** Live node drag — updates bezierNodes only (no flatten / no undo). */
    updateMotionPathLive: (layerId, path) => {
      const { project } = get();
      const li = project.layers.findIndex((l) => l.id === layerId);
      if (li < 0) return;
      const layer = project.layers[li]!;
      const paths = layer.motionPaths ?? [];
      if (!paths.some((p) => p.id === path.id)) return;
      set({
        project: replaceLayer(project, li, {
          ...layer,
          motionPaths: paths.map((p) =>
            p.id === path.id
              ? {
                  ...p,
                  bezierNodes: path.bezierNodes.map((n) => ({
                    ...n,
                    handleIn: n.handleIn ? { ...n.handleIn } : undefined,
                    handleOut: n.handleOut ? { ...n.handleOut } : undefined,
                  })),
                }
              : p,
          ),
        }),
      });
    },

    removeMotionPath: (layerId, pathId) => {
      const { project } = get();
      const li = project.layers.findIndex((l) => l.id === layerId);
      if (li < 0) return;
      const layer = project.layers[li]!;
      commit(
        replaceLayer(project, li, {
          ...layer,
          motionPaths: (layer.motionPaths ?? []).filter((p) => p.id !== pathId),
          motionAssignments: (layer.motionAssignments ?? []).filter(
            (a) => a.pathId !== pathId,
          ),
        }),
      );
    },

    addMotionAssignment: (layerId, assignment) => {
      const { project } = get();
      const li = project.layers.findIndex((l) => l.id === layerId);
      if (li < 0) return;
      const layer = project.layers[li]!;
      let next = replaceLayer(project, li, {
        ...layer,
        motionAssignments: [...(layer.motionAssignments ?? []), { ...assignment }],
      });
      next = ensureAnimatronLength(next);
      // Also grow frameCount for stop-motion endFrame
      if (assignment.endFrame != null) {
        next = {
          ...next,
          frameCount: Math.max(next.frameCount, assignment.endFrame + 1),
        };
      }
      commit(next);
    },

    updateMotionAssignment: (layerId, assignmentId, patch) => {
      const { project } = get();
      const li = project.layers.findIndex((l) => l.id === layerId);
      if (li < 0) return;
      const layer = project.layers[li]!;
      const list = layer.motionAssignments ?? [];
      if (!list.some((a) => a.id === assignmentId)) return;
      const nextList = list.map((a) =>
        a.id === assignmentId ? { ...a, ...patch } : a,
      );
      let next = replaceLayer(project, li, {
        ...layer,
        motionAssignments: nextList,
      });
      next = ensureAnimatronLength(next);
      const maxEnd = nextList.reduce(
        (m, a) => Math.max(m, a.endFrame ?? 0),
        0,
      );
      if (maxEnd > 0) {
        next = { ...next, frameCount: Math.max(next.frameCount, maxEnd + 1) };
      }
      commit(next);
    },

    removeMotionAssignment: (layerId, assignmentId) => {
      const { project } = get();
      const li = project.layers.findIndex((l) => l.id === layerId);
      if (li < 0) return;
      const layer = project.layers[li]!;
      commit(
        replaceLayer(project, li, {
          ...layer,
          motionAssignments: (layer.motionAssignments ?? []).filter(
            (a) => a.id !== assignmentId,
          ),
        }),
      );
    },

    addMorphClip: (clip) => {
      const { project } = get();
      let next: Project = {
        ...project,
        morphs: [...(project.morphs ?? []), { ...clip }],
      };
      next = ensureAnimatronLength(next);
      // Morph end also extends timeline
      const endMs = clip.startMs + clip.durationMs;
      const need = Math.ceil((endMs / 1000) * next.fps) + 1;
      if (need > next.frameCount) next = { ...next, frameCount: need };
      commit(next);
    },

    updateMorphClip: (clipId, patch) => {
      const { project } = get();
      const morphs = project.morphs ?? [];
      if (!morphs.some((m) => m.id === clipId)) return;
      const nextMorphs = morphs.map((m) =>
        m.id === clipId ? { ...m, ...patch } : m,
      );
      let next: Project = { ...project, morphs: nextMorphs };
      next = ensureAnimatronLength(next);
      const endMs = nextMorphs.reduce(
        (m, c) => Math.max(m, c.startMs + c.durationMs),
        0,
      );
      const need = Math.ceil((endMs / 1000) * next.fps) + 1;
      if (need > next.frameCount) next = { ...next, frameCount: need };
      commit(next);
    },

    removeMorphClip: (clipId) => {
      const { project } = get();
      commit({
        ...project,
        morphs: (project.morphs ?? []).filter((m) => m.id !== clipId),
      });
    },

    generateInbetweens: (fromFrame, toFrame, count) => {
      const { project, layerIndex } = get();
      const layer = project.layers[layerIndex];
      if (!layer || layer.isStatic) return;
      if (fromFrame < 0 || toFrame <= fromFrame) return;
      const celA = layer.frames[fromFrame];
      const celB = layer.frames[toFrame];
      if (!celA || !celB) return;
      const mids = generateInbetweenFrames(celA, celB, count);
      if (!mids.length) return;

      const frames = layer.frames.slice();
      const rebuilt: (Frame | null)[] = [];
      for (let i = 0; i <= fromFrame; i++) {
        rebuilt.push(frames[i] ?? null);
      }
      for (const mid of mids) rebuilt.push(mid);
      for (let i = toFrame; i < frames.length; i++) {
        rebuilt.push(frames[i] ?? null);
      }
      const added = mids.length;
      const nextCount = Math.max(project.frameCount + added, rebuilt.length);
      while (rebuilt.length < nextCount) rebuilt.push(null);

      commit({
        ...replaceLayer(project, layerIndex, { ...layer, frames: rebuilt }),
        frameCount: nextCount,
      });
    },

    addKeyframe: () => {
      const { project, layerIndex, frameIndex } = get();
      const layer = project.layers[layerIndex];
      if (!layer) return;
      const fi = layer.isStatic ? 0 : frameIndex;
      // Always a blank key — onion auto-duplicate is for drawing on a hold,
      // not for the Empty cel button (that was leaving the previous drawing).
      commit(replaceLayer(project, layerIndex, setCel(layer, fi, emptyCel())));
    },

    /** duplicate the current cel onto the next frame and move there — the core draw→flip→draw loop */
    duplicateFrameForward: () => {
      const s = get();
      const { project, layerIndex, frameIndex } = s;
      const layer = project.layers[layerIndex];
      if (!layer || layer.isStatic) return;
      const cel = resolveCel(layer, frameIndex);
      const target = frameIndex + 1;
      const copy: Frame = cel ? cloneCel(cel) : emptyCel();
      let next = replaceLayer(project, layerIndex, setCel(layer, target, copy));
      if (target >= next.frameCount) next = { ...next, frameCount: target + 1 };
      commit(next);
      set({ frameIndex: target });
    },

    deleteKeyframe: () => {
      const { project, layerIndex, frameIndex } = get();
      const layer = project.layers[layerIndex];
      const fi = layer?.isStatic ? 0 : frameIndex;
      if (!layer || !layer.frames[fi]) return;
      commit(replaceLayer(project, layerIndex, setCel(layer, fi, null)));
    },

    extendTimeline: (frames) => {
      const { project, frameIndex } = get();
      if (frames === 0) return;
      const nextCount = Math.max(1, project.frameCount + frames);
      if (nextCount === project.frameCount) return;

      let next: Project = { ...project, frameCount: nextCount };
      if (nextCount < project.frameCount) {
        next = {
          ...next,
          layers: next.layers.map((layer) =>
            layer.isStatic
              ? layer
              : { ...layer, frames: layer.frames.slice(0, nextCount) },
          ),
        };
      }
      commit(next);
      if (frameIndex >= nextCount) {
        set({ frameIndex: nextCount - 1 });
      }
    },

    removeFrameAt: (index) => {
      const { project, frameIndex } = get();
      if (project.frameCount <= 1) return;
      if (index < 0 || index >= project.frameCount) return;

      const layers = project.layers.map((layer) => {
        if (layer.isStatic) return layer;
        const frames = layer.frames.slice();
        if (index < frames.length) frames.splice(index, 1);
        return { ...layer, frames };
      });
      const nextCount = project.frameCount - 1;
      commit({ ...project, layers, frameCount: nextCount });
      set({
        frameIndex: Math.min(
          frameIndex > index ? frameIndex - 1 : frameIndex,
          nextCount - 1,
        ),
      });
    },

    setProjectSettings: (patch) => {
      const { project } = get();
      commit({ ...project, ...patch });
    },

    setBackgroundLive: (background) => {
      const { project } = get();
      set({ project: { ...project, background } });
    },

    setBoilLive: (boil) => {
      const { project } = get();
      set({ project: { ...project, boil } });
    },

    addLayer: () => {
      const { project } = get();
      const layer: Layer = {
        id: crypto.randomUUID(),
        name: `Layer ${project.layers.length + 1}`,
        visible: true,
        isStatic: false,
        frames: [emptyCel()],
      };
      commit({ ...project, layers: [...project.layers, layer] });
      set({ layerIndex: project.layers.length });
    },

    deleteLayer: (li) => {
      const { project, layerIndex } = get();
      if (project.layers.length <= 1) return;
      if (li < 0 || li >= project.layers.length) return;
      const layers = project.layers.filter((_, i) => i !== li);
      commit({ ...project, layers });
      set({
        layerIndex: Math.min(layerIndex >= li ? Math.max(0, layerIndex - 1) : layerIndex, layers.length - 1),
      });
    },

    deleteLayers: (indices) => {
      const { project, layerIndex } = get();
      if (project.layers.length <= 1) return;
      const toRemove = new Set(
        indices.filter((i) => i >= 0 && i < project.layers.length),
      );
      if (toRemove.size === 0) return;
      if (toRemove.size >= project.layers.length) {
        const keep = Math.min(layerIndex, project.layers.length - 1);
        toRemove.delete(keep);
      }
      if (toRemove.size === 0) return;

      const layers = project.layers.filter((_, i) => !toRemove.has(i));
      let removedBefore = 0;
      for (let i = 0; i < layerIndex; i++) {
        if (toRemove.has(i)) removedBefore++;
      }
      let nextLayerIndex = layerIndex - removedBefore;
      if (toRemove.has(layerIndex)) {
        nextLayerIndex = Math.max(0, Math.min(nextLayerIndex, layers.length - 1));
      }
      commit({ ...project, layers });
      set({
        layerIndex: Math.max(0, Math.min(nextLayerIndex, layers.length - 1)),
      });
    },

    reorderLayer: (from, to) => {
      const { project } = get();
      if (from === to || from < 0 || to < 0 || from >= project.layers.length || to >= project.layers.length)
        return;
      const layers = project.layers.slice();
      const [item] = layers.splice(from, 1);
      layers.splice(to, 0, item);
      commit({ ...project, layers });
      set({ layerIndex: to });
    },

    toggleLayerVisible: (li) => {
      const { project } = get();
      const layer = project.layers[li];
      if (!layer) return;
      commit(replaceLayer(project, li, { ...layer, visible: !layer.visible }));
    },

    loadProject: (project) => {
      useWorkflowMemory.getState().clear();
      clearBrushDraftCache();
      set({
        project: migrateLegacyVanishingClips(project),
        layerIndex: 0,
        frameIndex: 0,
        undoStack: [],
        redoStack: [],
      });
      usePlayback.getState().setWorkflow(project.workflow ?? "animatron");
    },

    switchWorkflow: (next) => {
      const s = get();
      const from: ProjectWorkflow = usePlayback.getState().workflow;
      if (from === next) return;

      useWorkflowMemory.getState().remember(from, {
        project: s.project,
        layerIndex: s.layerIndex,
        frameIndex: s.frameIndex,
        undoStack: s.undoStack,
        redoStack: s.redoStack,
      });

      const remembered = useWorkflowMemory.getState().take(next);
      const restore = !!(remembered && projectHasArt(remembered.project));
      const incoming = restore
        ? remembered!.project
        : convertProjectWorkflow({ ...s.project, workflow: from }, next, from);

      clearBrushDraftCache();
      const project = migrateLegacyVanishingClips(incoming);
      set({
        project,
        layerIndex: restore
          ? Math.max(
              0,
              Math.min(remembered!.layerIndex, project.layers.length - 1),
            )
          : 0,
        frameIndex: restore
          ? Math.max(
              0,
              Math.min(remembered!.frameIndex, project.frameCount - 1),
            )
          : firstVisibleWorkflowFrame(project),
        undoStack: restore ? remembered!.undoStack : [],
        redoStack: restore ? remembered!.redoStack : [],
      });
      usePlayback.getState().setWorkflow(next);
    },

    undo: () =>
      set((s) => {
        const prev = s.undoStack[s.undoStack.length - 1];
        if (!prev) return s;
        return {
          project: prev,
          undoStack: s.undoStack.slice(0, -1),
          redoStack: [...s.redoStack, s.project],
          layerIndex: Math.min(s.layerIndex, prev.layers.length - 1),
          frameIndex: Math.min(s.frameIndex, prev.frameCount - 1),
        };
      }),

    redo: () =>
      set((s) => {
        const next = s.redoStack[s.redoStack.length - 1];
        if (!next) return s;
        return {
          project: next,
          undoStack: [...s.undoStack, s.project],
          redoStack: s.redoStack.slice(0, -1),
          layerIndex: Math.min(s.layerIndex, next.layers.length - 1),
          frameIndex: Math.min(s.frameIndex, next.frameCount - 1),
        };
      }),
  };
});
