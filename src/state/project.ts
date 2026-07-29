import { create } from "zustand";
import {
  createEmptyProject,
  isLegacyVanishingEasing,
  resolveCel,
  resolveCelIndex,
  DEFAULT_CLIP_EASING,
  type ClipEasing,
  type Frame,
  type Layer,
  type Project,
  type Stroke,
  type StrokeClip,
  type TextElement,
} from "@/model/types";
import { useTools } from "@/state/tools";
import { usePlayback } from "@/state/playback";
import { translatePoints, transformPoints } from "@/engine/pathEdit";
import { measureTextBox, transformTextElement } from "@/engine/textGeometry";
import { flattenBezierNodes } from "@/lib/bezier";
import {
  allProjectStrokes,
  projectClipEndMs,
  strokeDurationMs,
} from "@/engine/strokeProgress";

const MAX_UNDO = 100;
const MIN_CLIP_MS = 80;

/** Shared offscreen ctx for measuring text during transforms. */
let measureCtx: CanvasRenderingContext2D | null = null;
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
  /** Patch color / fill / size on strokes in the active cel (one undo step). */
  updateStrokes: (
    ids: string[],
    patch: Partial<Pick<Stroke, "color" | "fillColor" | "size" | "jitter" | "grain">>,
  ) => void;
  removeTextElement: (id: string) => void;
  /** paste strokes into the current frame at their original coordinates; returns the new ids */
  pasteStrokes: (strokes: Stroke[]) => string[];
  deleteStrokes: (ids: string[]) => void;
  deleteNodes: (nodeIds: { strokeId: string; index: number }[]) => void;
  replaceStrokePoints: (strokeId: string, points: Stroke["points"], bezierNodes?: Stroke["bezierNodes"]) => void;
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
  updateStrokeClip: (strokeId: string, clip: StrokeClip) => void;
  /** Broadcast easing to every stroke clip on every layer (and remember for new paths). */
  applyClipEasing: (easing: ClipEasing) => void;
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
  reorderLayer: (from: number, to: number) => void;
  toggleLayerVisible: (layerIndex: number) => void;

  loadProject: (project: Project) => void;
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
  return { id: crypto.randomUUID(), strokes: [], texts: [] };
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
  };
}

function ensureAnimatronLength(project: Project): Project {
  const endMs = projectClipEndMs(allProjectStrokes(project.layers));
  const need = Math.max(project.frameCount, Math.ceil(endMs / 1000 * project.fps) + 1);
  if (need === project.frameCount) return project;
  return { ...project, frameCount: need };
}

function nextAnimatronClipStart(project: Project): number {
  return projectClipEndMs(allProjectStrokes(project.layers));
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
    const activeEmpty = !!active && (!activeCel || activeCel.strokes.length === 0);

    if (activeEmpty && active) {
      // reuse the empty active layer for the first path
      const layer: Layer = {
        ...active,
        name: active.name.startsWith("Layer") ? `Path 1` : active.name,
        isStatic: false,
        frames: [{ id: crypto.randomUUID(), strokes: [clipped] }],
      };
      project = ensureAnimatronLength({
        ...replaceLayer(project, s.layerIndex, layer),
        workflow: "animatron",
      });
      commit(project);
      usePlayback.getState().setWorkflow("animatron");
      return;
    }

    // insert new layer immediately below the previous path's layer
    const insertAt = Math.min(s.layerIndex + 1, project.layers.length);
    const layer: Layer = {
      id: crypto.randomUUID(),
      name: `Path ${project.layers.length + 1}`,
      visible: true,
      isStatic: false,
      frames: [{ id: crypto.randomUUID(), strokes: [clipped] }],
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
    set({ layerIndex: insertAt });
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

      const { autoKey } = useTools.getState();
      let fIdx = autoKey ? s.frameIndex : resolveCelIndex(active, s.frameIndex) ?? s.frameIndex;
      if (active.isStatic && usePlayback.getState().workflow !== "animatron") {
        fIdx = 0;
      }
      const cel = active.frames[fIdx] ?? emptyCel();
      const nextCel = { ...cel, texts: [...(cel.texts || []), text] };
      const layer = setCel(active, fIdx, nextCel);
      commit(replaceLayer(s.project, s.layerIndex, layer));
      if (autoKey) set({ frameIndex: s.frameIndex });
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
      const { project, layerIndex, frameIndex } = get();
      const layer = project.layers[layerIndex];
      if (!layer) return;
      const pb = usePlayback.getState();
      const tools = useTools.getState();
      const animatron = project.workflow === "animatron";
      const celIndex = animatron
        ? layer.frames.findIndex((f) => f !== null)
        : resolveCelIndex(layer, layer.isStatic ? 0 : frameIndex);
      if (celIndex === null || celIndex < 0) return;

      const isHeld = !animatron && celIndex !== frameIndex && !layer.isStatic;
      const shouldClone = tools.autoKey && (!pb.onionSkin || pb.onionAutoDuplicate);
      if (isHeld && !shouldClone) return;

      const cel = layer.frames[celIndex]!;
      let changed = false;
      const strokes = cel.strokes.map((s) => {
        if (!ids.includes(s.id)) return s;
        const nextPatch = { ...patch };
        if (!s.closed) delete nextPatch.fillColor;
        if (Object.keys(nextPatch).length === 0) return s;
        changed = true;
        return { ...s, ...nextPatch };
      });
      if (!changed) return;

      if (isHeld) {
        commit(
          replaceLayer(
            project,
            layerIndex,
            setCel(layer, frameIndex, { ...cloneCel(cel), strokes }),
          ),
        );
      } else {
        commit(
          replaceLayer(
            project,
            layerIndex,
            setCel(layer, celIndex, { ...cel, strokes }),
          ),
        );
      }
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

    pasteStrokes: (strokes) => {
      if (strokes.length === 0) return [];
      const { project, layerIndex, frameIndex } = get();
      const layer = project.layers[layerIndex];
      if (!layer) return [];
      const fi = layer.isStatic ? 0 : frameIndex;
      const pasted = strokes.map((s) => ({
        ...s,
        id: crypto.randomUUID(),
        points: s.points.map((p) => ({ ...p })),
      }));
      // paste into the keyframe at this slot; if the slot is empty or held,
      // start a fresh cel here — the paste is what you're placing
      const existing = layer.frames[fi] ?? null;
      const cel: Frame = existing
        ? { ...existing, strokes: [...existing.strokes, ...pasted] }
        : { id: crypto.randomUUID(), strokes: pasted };
      commit(replaceLayer(project, layerIndex, setCel(layer, fi, cel)));
      return pasted.map((s) => s.id);
    },

    deleteStrokes: (ids) => {
      const { project, layerIndex, frameIndex } = get();
      const layer = project.layers[layerIndex];
      if (!layer) return;
      const pb = usePlayback.getState();
      const tools = useTools.getState();
      const celIndex = resolveCelIndex(layer, layer.isStatic ? 0 : frameIndex);
      if (celIndex === null) return;
      
      const isHeld = celIndex !== frameIndex && !layer.isStatic;
      const shouldClone = tools.autoKey && (!pb.onionSkin || pb.onionAutoDuplicate);
      if (isHeld && !shouldClone) return; // Cannot edit held cel if auto-key is off/prevented

      const cel = layer.frames[celIndex]!;
      const strokes = cel.strokes.filter((s) => !ids.includes(s.id));
      const texts = cel.texts?.filter((t) => !ids.includes(t.id));
      if (strokes.length === cel.strokes.length && (!cel.texts || texts?.length === cel.texts.length)) return;
      
      if (isHeld) {
        commit(replaceLayer(project, layerIndex, setCel(layer, frameIndex, { ...cloneCel(cel), strokes, texts })));
      } else {
        commit(replaceLayer(project, layerIndex, setCel(layer, celIndex, { ...cel, strokes, texts })));
      }
    },

    deleteNodes: (nodeIds) => {
      const { project, layerIndex, frameIndex } = get();
      const layer = project.layers[layerIndex];
      if (!layer) return;
      const pb = usePlayback.getState();
      const tools = useTools.getState();
      const celIndex = resolveCelIndex(layer, layer.isStatic ? 0 : frameIndex);
      if (celIndex === null) return;
      
      const isHeld = celIndex !== frameIndex && !layer.isStatic;
      const shouldClone = tools.autoKey && (!pb.onionSkin || pb.onionAutoDuplicate);
      if (isHeld && !shouldClone) return;

      const cel = layer.frames[celIndex]!;
      
      const toDelete = new Map<string, Set<number>>();
      for (const { strokeId, index } of nodeIds) {
        if (!toDelete.has(strokeId)) toDelete.set(strokeId, new Set());
        toDelete.get(strokeId)!.add(index);
      }
      
      let changed = false;
      const strokes = cel.strokes.map(s => {
        const delSet = toDelete.get(s.id);
        if (!delSet) return s;
        changed = true;
        if (s.bezierNodes) {
          const newNodes = s.bezierNodes.filter((_, i) => !delSet.has(i));
          const newPoints = flattenBezierNodes(newNodes, s.closed);
          return { ...s, bezierNodes: newNodes, points: newPoints };
        }
        return { ...s, points: s.points.filter((_, i) => !delSet.has(i)) };
      }).filter(s => (s.bezierNodes ? s.bezierNodes.length > 0 : s.points.length > 0));
      
      if (!changed) return;
      
      if (isHeld) {
        commit(replaceLayer(project, layerIndex, setCel(layer, frameIndex, { ...cloneCel(cel), strokes })));
      } else {
        commit(replaceLayer(project, layerIndex, setCel(layer, celIndex, { ...cel, strokes })));
      }
    },

    replaceStrokePoints: (strokeId, points, bezierNodes) => {
      const { project, layerIndex, frameIndex } = get();
      const layer = project.layers[layerIndex];
      if (!layer) return;
      const pb = usePlayback.getState();
      const tools = useTools.getState();
      const celIndex = resolveCelIndex(layer, layer.isStatic ? 0 : frameIndex);
      if (celIndex === null) return;
      
      const isHeld = celIndex !== frameIndex && !layer.isStatic;
      const shouldClone = tools.autoKey && (!pb.onionSkin || pb.onionAutoDuplicate);
      if (isHeld && !shouldClone) return;

      const cel = layer.frames[celIndex]!;
      if (!cel.strokes.some((s) => s.id === strokeId)) return;
      const strokes = cel.strokes.map((s) => (s.id === strokeId ? { ...s, points, ...(bezierNodes ? { bezierNodes } : {}) } : s));
      
      if (isHeld) {
        commit(replaceLayer(project, layerIndex, setCel(layer, frameIndex, { ...cloneCel(cel), strokes })));
      } else {
        commit(replaceLayer(project, layerIndex, setCel(layer, celIndex, { ...cel, strokes })));
      }
    },

    translateStrokes: (ids, dx, dy) => {
      if (!ids.length || (dx === 0 && dy === 0)) return;
      const { project, layerIndex, frameIndex } = get();
      const layer = project.layers[layerIndex];
      if (!layer) return;
      const pb = usePlayback.getState();
      const tools = useTools.getState();
      const celIndex = resolveCelIndex(layer, layer.isStatic ? 0 : frameIndex);
      if (celIndex === null) return;

      const isHeld = celIndex !== frameIndex && !layer.isStatic;
      const shouldClone = tools.autoKey && (!pb.onionSkin || pb.onionAutoDuplicate);
      if (isHeld && !shouldClone) return;

      const cel = layer.frames[celIndex]!;
      const idSet = new Set(ids);
      let changed = false;
      const strokes = cel.strokes.map((s) => {
        if (!idSet.has(s.id)) return s;
        changed = true;
        return { ...s, points: translatePoints(s.points, dx, dy) };
      });
      const texts = cel.texts ? cel.texts.map((t) => {
        if (!idSet.has(t.id)) return t;
        changed = true;
        return { ...t, x: t.x + dx, y: t.y + dy };
      }) : undefined;
      if (!changed) return;

      if (isHeld) {
        commit(replaceLayer(project, layerIndex, setCel(layer, frameIndex, { ...cloneCel(cel), strokes, texts })));
      } else {
        commit(replaceLayer(project, layerIndex, setCel(layer, celIndex, { ...cel, strokes, texts })));
      }
    },

    transformStrokes: (ids, pivotX, pivotY, scale, rotationRad) => {
      if (!ids.length || (scale === 1 && rotationRad === 0)) return;
      const { project, layerIndex, frameIndex } = get();
      const layer = project.layers[layerIndex];
      if (!layer) return;
      const pb = usePlayback.getState();
      const tools = useTools.getState();
      const celIndex = resolveCelIndex(layer, layer.isStatic ? 0 : frameIndex);
      if (celIndex === null) return;

      const isHeld = celIndex !== frameIndex && !layer.isStatic;
      const shouldClone = tools.autoKey && (!pb.onionSkin || pb.onionAutoDuplicate);
      if (isHeld && !shouldClone) return;

      const cel = layer.frames[celIndex]!;
      const idSet = new Set(ids);
      let changed = false;
      const strokes = cel.strokes.map((s) => {
        if (!idSet.has(s.id)) return s;
        changed = true;
        return {
          ...s,
          points: transformPoints(s.points, pivotX, pivotY, scale, rotationRad),
          size: Math.max(0.5, s.size * scale),
        };
      });
      const mctx = getMeasureCtx();
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
      if (!changed) return;

      if (isHeld) {
        commit(replaceLayer(project, layerIndex, setCel(layer, frameIndex, { ...cloneCel(cel), strokes, texts })));
      } else {
        commit(replaceLayer(project, layerIndex, setCel(layer, celIndex, { ...cel, strokes, texts })));
      }
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
            return { ...s, clip: { ...clip } };
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

    addKeyframe: () => {
      const { project, layerIndex, frameIndex } = get();
      const layer = project.layers[layerIndex];
      if (!layer || layer.isStatic) return;

      let newCel = emptyCel();
      const pb = usePlayback.getState();
      if (pb.onionSkin && pb.onionAutoDuplicate && frameIndex > 0) {
        const prevCelIdx = resolveCelIndex(layer, frameIndex - 1);
        if (prevCelIdx !== null) {
          newCel = cloneCel(layer.frames[prevCelIdx]!);
        }
      }

      commit(replaceLayer(project, layerIndex, setCel(layer, frameIndex, newCel)));
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
      set({
        project: migrateLegacyVanishingClips(project),
        layerIndex: 0,
        frameIndex: 0,
        undoStack: [],
        redoStack: [],
      });
      usePlayback.getState().setWorkflow(project.workflow ?? "stopmotion");
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
