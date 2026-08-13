/**
 * Leafer edit overlay — App + editor + TextEditor (official plugins).
 * Text tool: drag a box to place text (Leafer owns create/edit).
 * Shapes: rubber-band create + Leafer editor for select/transform of shape-tool strokes.
 * Docs: https://www.leaferjs.com/ui/en/plugin/in/text-editor/
 */
import { useEffect, useLayoutEffect, useRef } from "react";
import { App, Ellipse, Group, Line, Polygon, Rect, Text } from "leafer-ui";
import { InnerEditorEvent } from "@leafer-in/editor";
import "@leafer-in/editor";
import "@leafer-in/resize";
import "@leafer-in/text-editor";
import {
  applyFitToGroup,
  canEditShapeWithLeafer,
  leaferTextToCommit,
  shapeBoxToLeaferCenter,
  textElementToLeaferProps,
  type StageFit,
  type TextCommitResult,
  type TextEditSession,
} from "@/components/stage/leaferBridge";
import { cursorForTool } from "@/lib/toolCursors";
import {
  bakeEditableShape,
  makeEditableShapeFromStroke,
  type EditableShapeProxy,
} from "@/components/stage/leaferShapeProxy";
import {
  bakeEditableImage,
  makeEditableImageFromElement,
} from "@/components/stage/leaferImageProxy";
import {
  buildShapePoints,
  isClosedShape,
  resolveShapeFrame,
  shapeDragSignificant,
} from "@/engine/shapeGeometry";
import {
  snapImageBox,
  setImageLivePreview,
  getImageLivePreview,
  type GuideLine,
} from "@/engine/canvasImage";
import {
  setShapeLivePreview,
} from "@/engine/shapeLivePreview";
import { hitTextBox } from "@/engine/textGeometry";
import {
  findArtAtProject,
  hitsImageEditChrome,
  hitsShapeEditChrome,
} from "@/engine/artHitTest";
import { resolveCel, type Stroke, type TextElement } from "@/model/types";
import { useProject } from "@/state/project";
import { useSelection } from "@/state/selection";
import { useTools, activeShapeTool, type ShapeToolId } from "@/state/tools";
import { useViewport } from "@/state/viewport";
import { textFontStack } from "@/lib/google-fonts";
import {
  EditorMoveEvent,
  EditorRotateEvent,
  EditorScaleEvent,
} from "@leafer-in/editor";

type LeaferEditLayerProps = {
  fitRef: React.MutableRefObject<StageFit>;
  textEdit: TextEditSession | null;
  onTextCommit: (result: TextCommitResult | null) => void;
  onTextCreate: (session: TextEditSession) => void;
  onTextSelect: (text: TextElement, layerId: string | null) => void;
  onTextOpen: (text: TextElement, layerId: string | null) => void;
  textCreateActive: boolean;
  shapeCreateActive: boolean;
};

function makeShapeProxy(
  kind: ShapeToolId,
  x0: number,
  y0: number,
  x1: number,
  y1: number,
  stroke: string,
  fill: string,
  strokeWidth: number,
  cornerRadius = 0,
) {
  const left = Math.min(x0, x1);
  const top = Math.min(y0, y1);
  const w = Math.abs(x1 - x0);
  const h = Math.abs(y1 - y0);
  if (kind === "circle") {
    return new Ellipse({
      x: left,
      y: top,
      width: Math.max(1, w),
      height: Math.max(1, h),
      fill,
      stroke,
      strokeWidth,
      editable: false,
      hittable: false,
    });
  }
  if (kind === "diamond") {
    const rw = Math.max(1, w);
    const rh = Math.max(1, h);
    return new Polygon({
      x: left,
      y: top,
      fill,
      stroke,
      strokeWidth,
      points: [
        { x: rw / 2, y: 0 },
        { x: rw, y: rh / 2 },
        { x: rw / 2, y: rh },
        { x: 0, y: rh / 2 },
      ],
      editable: false,
      hittable: false,
    });
  }
  if (kind === "line" || kind === "arrow") {
    // Leafer Line stores direction as width+rotation (via toPoint). Never set
    // rotation:0 after toPoint — that snaps diagonals to horizontal.
    const line = new Line({
      x: x0,
      y: y0,
      stroke,
      strokeWidth,
      editable: false,
      hittable: false,
    });
    line.toPoint = { x: x1 - x0, y: y1 - y0 };
    return line;
  }
  return new Rect({
    x: left,
    y: top,
    width: Math.max(1, w),
    height: Math.max(1, h),
    fill,
    stroke,
    strokeWidth,
    cornerRadius: Math.max(0, cornerRadius),
    editable: false,
    hittable: false,
  });
}

function currentCelTexts(): {
  texts: TextElement[];
  layerId: string | null;
} {
  const ps = useProject.getState();
  const layer = ps.project.layers[ps.layerIndex];
  if (!layer) return { texts: [], layerId: null };
  const animatron = ps.project.workflow === "animatron";
  const cel = animatron
    ? (layer.frames.find((f) => f) ?? null)
    : resolveCel(layer, ps.frameIndex);
  return { texts: cel?.texts ?? [], layerId: layer.id };
}

export function LeaferEditLayer({
  fitRef,
  textEdit,
  onTextCommit,
  onTextCreate,
  onTextSelect,
  onTextOpen,
  textCreateActive,
  shapeCreateActive,
}: LeaferEditLayerProps) {
  const hostRef = useRef<HTMLDivElement>(null);
  const appRef = useRef<App | null>(null);
  const worldRef = useRef<Group | null>(null);
  const textNodeRef = useRef<Text | null>(null);
  const committedRef = useRef(false);
  const disposingRef = useRef(false);
  const shapeProxyRef = useRef<Rect | Ellipse | Line | Polygon | null>(null);
  const shapeEditProxyRef = useRef<EditableShapeProxy | null>(null);
  const shapeEditStrokeIdRef = useRef<string | null>(null);
  const shapeEditKindRef = useRef<ShapeToolId | null>(null);
  const shapeEditDirtyRef = useRef(false);
  /** After remount, ignore Leafer SCALE/MOVE until the user pointerdowns (select() fires false transforms). */
  const shapeEditIgnoreTransformsRef = useRef(false);
  const imageEditProxyRef = useRef<Rect | null>(null);
  const imageEditIdRef = useRef<string | null>(null);
  const imageEditDirtyRef = useRef(false);
  const imageGuideRefs = useRef<Line[]>([]);
  const textBoxProxyRef = useRef<Rect | null>(null);
  const textDragRef = useRef<{
    startX: number;
    startY: number;
    currentX: number;
    currentY: number;
    hit: TextElement | null;
    layerId: string | null;
    detail: number;
  } | null>(null);
  const shapeDragRef = useRef<{
    kind: ShapeToolId;
    startX: number;
    startY: number;
    currentX: number;
    currentY: number;
    constrain: boolean;
    fromCenter: boolean;
    id: string;
    seed: number;
  } | null>(null);
  const measureCtxRef = useRef<CanvasRenderingContext2D | null>(null);
  const onTextCommitRef = useRef(onTextCommit);
  onTextCommitRef.current = onTextCommit;
  const onTextCreateRef = useRef(onTextCreate);
  onTextCreateRef.current = onTextCreate;
  const onTextSelectRef = useRef(onTextSelect);
  onTextSelectRef.current = onTextSelect;
  const onTextOpenRef = useRef(onTextOpen);
  onTextOpenRef.current = onTextOpen;

  const zoom = useViewport((s) => s.zoom);
  const panX = useViewport((s) => s.panX);
  const panY = useViewport((s) => s.panY);
  const tool = useTools((s) => s.tool);
  const lastShapeTool = useTools((s) => s.lastShapeTool);
  const color = useTools((s) => s.color);
  const fillColor = useTools((s) => s.fillColor);
  const size = useTools((s) => s.size);
  const textSize = useTools((s) => s.textSize);
  const fontFamily = useTools((s) => s.fontFamily);
  const textBold = useTools((s) => s.textBold);
  const textItalic = useTools((s) => s.textItalic);
  const textAlign = useTools((s) => s.textAlign);
  const letterSpacing = useTools((s) => s.letterSpacing);
  const textOpacity = useTools((s) => s.textOpacity);

  const selIds = useSelection((s) => s.ids);
  const projectTick = useProject((s) => s.project);
  const layerIndex = useProject((s) => s.layerIndex);
  const frameIndex = useProject((s) => s.frameIndex);

  const shapeKind = shapeCreateActive
    ? activeShapeTool(tool, lastShapeTool)
    : null;
  // Prefer Leafer transform over rubber-band create when a shape-tool stroke
  // is already selected (same handoff as create → setTool("select")).
  const editingShape =
    !textEdit &&
    !textCreateActive &&
    tool === "select" &&
    selIds.length === 1
      ? (() => {
          const layer = projectTick.layers[layerIndex];
          if (!layer) return null;
          const animatron = projectTick.workflow === "animatron";
          const cel = animatron
            ? (layer.frames.find((f) => f) ?? null)
            : resolveCel(layer, frameIndex);
          const stroke = cel?.strokes.find((s) => s.id === selIds[0]);
          return stroke && canEditShapeWithLeafer(stroke) ? stroke : null;
        })()
      : null;
  const editingImage =
    !textEdit &&
    !textCreateActive &&
    !editingShape &&
    tool === "select" &&
    selIds.length === 1
      ? (() => {
          const layer = projectTick.layers[layerIndex];
          if (!layer) return null;
          const animatron = projectTick.workflow === "animatron";
          const cel = animatron
            ? (layer.frames.find((f) => f) ?? null)
            : resolveCel(layer, frameIndex);
          return cel?.images?.find((im) => im.id === selIds[0]) ?? null;
        })()
      : null;
  // Create rubber-band only when not already editing a selected shape.
  const creatingShape = !!shapeKind && !editingShape && !editingImage;
  const interactive =
    !!textEdit ||
    creatingShape ||
    textCreateActive ||
    !!editingShape ||
    !!editingImage;

  /** Bake dirty Leafer shape into the project (also used on App teardown). */
  function flushShapeEditToProject() {
    const node = shapeEditProxyRef.current;
    const id = shapeEditStrokeIdRef.current;
    const k = shapeEditKindRef.current;
    if (!node || !id || !k || !shapeEditDirtyRef.current) return;
    const existing = (() => {
      const ps = useProject.getState();
      for (const layer of ps.project.layers) {
        for (const frame of layer.frames) {
          const hit = frame?.strokes.find((s) => s.id === id);
          if (hit) return hit;
        }
      }
      return null;
    })();
    if (!existing || !canEditShapeWithLeafer(existing)) {
      shapeEditDirtyRef.current = false;
      setShapeLivePreview(null);
      return;
    }
    const baked = bakeEditableShape(k, node, {
      cornerRadius: existing.cornerRadius,
      squircle: existing.squircle,
      cornerSmoothing: existing.cornerSmoothing,
    });
    if (k === "line" || k === "arrow") {
      const nextLen = Math.hypot(baked.shapeBox.w, baked.shapeBox.h);
      const prevLen = Math.hypot(
        existing.shapeBox?.w ?? 0,
        existing.shapeBox?.h ?? 0,
      );
      if (nextLen < 1 && prevLen >= 1) {
        // Restore proxy from project — don't leave a collapsed Leafer node.
        const restored = makeEditableShapeFromStroke(existing);
        if (restored) {
          try {
            node.x = restored.x;
            node.y = restored.y;
            if (k === "line" || k === "arrow") {
              (node as Line).toPoint = {
                x: existing.shapeBox!.w,
                y: existing.shapeBox!.h,
              };
            }
            restored.destroy();
          } catch {
            /* ignore */
          }
        }
        shapeEditDirtyRef.current = false;
        setShapeLivePreview(null);
        return;
      }
    } else {
      const prevW = Math.abs(existing.shapeBox?.w ?? 0);
      const prevH = Math.abs(existing.shapeBox?.h ?? 0);
      if (
        (baked.shapeBox.w < 1 || baked.shapeBox.h < 1) &&
        prevW >= 1 &&
        prevH >= 1
      ) {
        shapeEditDirtyRef.current = false;
        setShapeLivePreview(null);
        return;
      }
    }
    useProject.getState().replaceStrokePoints(id, baked.points, undefined, {
      shapeBox: baked.shapeBox,
      shapeKind: k,
    });
    shapeEditDirtyRef.current = false;
    setShapeLivePreview(null);
    node.scaleX = 1;
    node.scaleY = 1;
    if (k === "line" || k === "arrow") {
      (node as Line).x = baked.shapeBox.x;
      (node as Line).y = baked.shapeBox.y;
      (node as Line).toPoint = {
        x: baked.shapeBox.w,
        y: baked.shapeBox.h,
      };
    } else {
      const c = shapeBoxToLeaferCenter(baked.shapeBox);
      node.x = c.x;
      node.y = c.y;
      node.width = baked.shapeBox.w;
      node.height = baked.shapeBox.h;
      node.rotation = ((baked.shapeBox.rotation ?? 0) * 180) / Math.PI;
      if (k === "diamond") {
        const rw = baked.shapeBox.w;
        const rh = baked.shapeBox.h;
        (node as Polygon).points = [
          { x: rw / 2, y: 0 },
          { x: rw, y: rh / 2 },
          { x: rw / 2, y: rh },
          { x: 0, y: rh / 2 },
        ];
      }
    }
  }

  // Boot App — layout effect so the App exists before shape/text mount effects.
  useLayoutEffect(() => {
    const host = hostRef.current;
    if (!host) return;
    if (!interactive) {
      if (appRef.current) {
        // Persist in-flight image transform before tearing Leafer down — the
        // select→brush switch sets interactive=false and would otherwise drop
        // the live preview without writing back to the project.
        const live = getImageLivePreview();
        if (live && imageEditDirtyRef.current) {
          const pw = useProject.getState().project.width;
          const ph = useProject.getState().project.height;
          const snapped = snapImageBox(
            {
              x: live.x,
              y: live.y,
              w: live.w,
              h: live.h,
              rotation: live.rotation,
            },
            pw,
            ph,
            0,
          );
          useProject.getState().updateImageElement(live.id, {
            x: snapped.box.x,
            y: snapped.box.y,
            w: Math.max(1, snapped.box.w),
            h: Math.max(1, snapped.box.h),
            rotation: live.rotation,
          });
        }
        setImageLivePreview(null);
        // Same for shapes — clear dirty only AFTER flush or the bake is lost.
        flushShapeEditToProject();
        try {
          appRef.current.destroy();
        } catch {
          /* ignore */
        }
        appRef.current = null;
        worldRef.current = null;
        textNodeRef.current = null;
        shapeProxyRef.current = null;
        shapeEditProxyRef.current = null;
        shapeEditStrokeIdRef.current = null;
        shapeEditKindRef.current = null;
        shapeEditDirtyRef.current = false;
        shapeEditIgnoreTransformsRef.current = false;
        setShapeLivePreview(null);
        imageEditProxyRef.current = null;
        imageEditIdRef.current = null;
        imageEditDirtyRef.current = false;
        imageGuideRefs.current = [];
        textBoxProxyRef.current = null;
        shapeDragRef.current = null;
        textDragRef.current = null;
      }
      return;
    }
    if (appRef.current) return;

    const app = new App({
      view: host,
      fill: "transparent",
      move: { disabled: true },
      zoom: { disabled: true },
      editor: {
        // Distinct from StageCanvas blue-dash chrome so Leafer ownership is obvious.
        stroke: "#A78BFA",
        selectedStyle: { stroke: "#A78BFA", strokeWidth: 2 },
        hoverStyle: { stroke: "#A78BFA", strokeWidth: 1.5 },
        pointSize: 10,
        around: "center",
        rotateAround: "center",
        // 0 falls back to Leafer's default 45° — use 5° for image/shape rotate.
        rotateGap: 5,
      },
    });
    const world = new Group({ name: "lao-world" });
    app.tree.add(world);
    appRef.current = app;
    worldRef.current = world;
    applyFitToGroup(world, fitRef.current);

    return () => {
      flushShapeEditToProject();
      try {
        app.destroy();
      } catch {
        /* ignore */
      }
      if (appRef.current === app) {
        appRef.current = null;
        worldRef.current = null;
        textNodeRef.current = null;
        shapeProxyRef.current = null;
        shapeEditProxyRef.current = null;
        shapeEditStrokeIdRef.current = null;
        shapeEditKindRef.current = null;
        shapeEditDirtyRef.current = false;
        shapeEditIgnoreTransformsRef.current = false;
        setShapeLivePreview(null);
        imageEditProxyRef.current = null;
        imageEditIdRef.current = null;
        imageEditDirtyRef.current = false;
        imageGuideRefs.current = [];
        textBoxProxyRef.current = null;
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [interactive]);

  // Sync stage fit — skip while TextEditor is open (Leafer positions the DOM).
  useEffect(() => {
    if (textEdit) return;
    const world = worldRef.current;
    if (!world) return;
    applyFitToGroup(world, fitRef.current);
  }, [zoom, panX, panY, fitRef, interactive, textEdit]);

  // Official TextEditor session
  useEffect(() => {
    if (!textEdit) {
      const app = appRef.current;
      if (app && textNodeRef.current) {
        disposingRef.current = true;
        try {
          app.editor.closeInnerEditor();
        } catch {
          /* ignore */
        }
        textNodeRef.current.destroy();
        textNodeRef.current = null;
        disposingRef.current = false;
      }
      committedRef.current = false;
      return;
    }

    let cancelled = false;
    let timer = 0;
    let keyHandler: ((e: KeyboardEvent) => void) | null = null;
    let removeClose: (() => void) | undefined;
    let mounted = false;

    const mountSession = () => {
      if (cancelled || mounted) return;
      const app = appRef.current;
      const world = worldRef.current;
      if (!app || !world) {
        if (!cancelled) timer = window.setTimeout(mountSession, 0);
        return;
      }
      if (cancelled) return;
      mounted = true;

      if (shapeProxyRef.current) {
        shapeProxyRef.current.destroy();
        shapeProxyRef.current = null;
      }
      if (textBoxProxyRef.current) {
        textBoxProxyRef.current.destroy();
        textBoxProxyRef.current = null;
      }
      shapeDragRef.current = null;
      textDragRef.current = null;
      committedRef.current = false;
      applyFitToGroup(world, fitRef.current);

      const props = textElementToLeaferProps(textEdit, {
        fontFamily: textFontStack(fontFamily),
        textSize,
        color,
        textBold,
        textItalic,
        textAlign,
        letterSpacing,
        textOpacity,
      });

      if (textNodeRef.current) {
        disposingRef.current = true;
        try {
          app.editor.closeInnerEditor();
        } catch {
          /* ignore */
        }
        textNodeRef.current.destroy();
        textNodeRef.current = null;
        disposingRef.current = false;
      }

      const node = Text.one(
        {
          text: props.text || "",
          fontSize: props.fontSize,
          fontFamily: props.fontFamily,
          fontWeight: props.fontWeight as never,
          fontStyle: props.fontStyle,
          fill: props.fill,
          stroke: textBold ? props.fill : undefined,
          strokeWidth: textBold ? Math.max(0.75, props.fontSize * 0.055) : 0,
          letterSpacing: props.letterSpacing,
          textAlign: props.textAlign,
          verticalAlign: "top",
          opacity: props.opacity,
          editable: true,
          draggable: true,
          rotation: props.rotation,
        },
        props.x,
        props.y,
        props.width,
      );
      world.add(node);
      textNodeRef.current = node;

      const commitOnce = () => {
        if (committedRef.current || disposingRef.current) return;
        committedRef.current = true;
        const n = textNodeRef.current;
        // Prefer live DOM text — unload syncs it, but read before/while CLOSE
        // in case the node was cleared. Esc / click-outside both land here.
        const inner = app.editor.innerEditor as {
          editDom?: HTMLDivElement;
        } | null;
        if (n && inner?.editDom) {
          const live = inner.editDom.innerText ?? "";
          if (live.trim()) n.text = live;
        }
        onTextCommitRef.current(n ? leaferTextToCommit(n) : null);
      };

      const onBeforeClose = () => {
        // Sync editDom → Text node while the DOM still exists (unload removes it).
        const n = textNodeRef.current;
        const inner = app.editor.innerEditor as {
          editDom?: HTMLDivElement;
        } | null;
        if (n && inner?.editDom) {
          n.text = inner.editDom.innerText ?? "";
        }
      };

      const onClose = () => {
        commitOnce();
      };
      app.editor.on(InnerEditorEvent.BEFORE_CLOSE, onBeforeClose);
      app.editor.on(InnerEditorEvent.CLOSE, onClose);

      try {
        const textEditor = app.editor.getInnerEditor("TextEditor") as {
          config?: { selectAll?: boolean };
        } | null;
        if (textEditor?.config) {
          textEditor.config.selectAll = !!props.text;
        }
      } catch {
        /* ignore */
      }

      timer = window.setTimeout(() => {
        if (cancelled) return;
        try {
          app.editor.openInnerEditor(node, true);
          const inner = app.editor.innerEditor as {
            editDom?: HTMLDivElement;
          } | null;
          inner?.editDom?.focus();
        } catch {
          /* ignore */
        }
      }, 0);

      // Esc finalizes (Leafer also handles Esc). Enter stays a newline in TextEditor.
      keyHandler = (e: KeyboardEvent) => {
        if (e.key === "Escape") {
          e.preventDefault();
          e.stopPropagation();
          try {
            app.editor.closeInnerEditor();
          } catch {
            commitOnce();
          }
        }
      };
      window.addEventListener("keydown", keyHandler, true);

      removeClose = () => {
        app.editor.off(InnerEditorEvent.BEFORE_CLOSE, onBeforeClose);
        app.editor.off(InnerEditorEvent.CLOSE, onClose);
      };
    };

    mountSession();

    return () => {
      cancelled = true;
      window.clearTimeout(timer);
      if (keyHandler) window.removeEventListener("keydown", keyHandler, true);
      removeClose?.();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    textEdit?.id,
    textEdit?.projectX,
    textEdit?.projectY,
    textEdit?.boxWidth,
    textEdit?.text,
    Boolean(textEdit),
  ]);

  // Keep the open Leafer text node in sync with dock B/I/size/color/align.
  useEffect(() => {
    const node = textNodeRef.current as
      | (NonNullable<typeof textNodeRef.current> & {
          fontStyle?: string;
          skewX?: number;
        })
      | null;
    if (!node || !textEdit) return;
    node.fontSize = textSize;
    node.fontFamily = textFontStack(fontFamily);
    node.fontWeight = (textBold ? 700 : 400) as never;
    // Prefer true italic when the face has it; always add a light skew so
    // Geist / missing italic axes still read as italic in the editor.
    node.fontStyle = textItalic ? "italic" : "normal";
    node.skewX = textItalic ? 12 : 0;
    node.fill = color;
    // Faux-bold: variable faces often ignore fontWeight in the Leafer overlay.
    (node as { stroke?: string; strokeWidth?: number }).stroke = textBold
      ? color
      : undefined;
    (node as { stroke?: string; strokeWidth?: number }).strokeWidth = textBold
      ? Math.max(0.75, textSize * 0.055)
      : 0;
    node.letterSpacing = letterSpacing || 0;
    node.textAlign = textAlign;
    node.opacity = textOpacity / 100;
    // Prefer live project box width (align may grow it) over the session snapshot.
    const live = (() => {
      const s = useProject.getState();
      for (const layer of s.project.layers) {
        for (const cel of layer.frames) {
          const hit = cel?.texts?.find((t) => t.id === textEdit.id);
          if (hit) return hit;
        }
      }
      return null;
    })();
    const w = live?.boxWidth ?? textEdit.boxWidth;
    if (w != null && w > 0) node.width = w;
  }, [
    textEdit,
    textSize,
    fontFamily,
    textBold,
    textItalic,
    color,
    letterSpacing,
    textAlign,
    textOpacity,
  ]);

  // Text tool: drag a rectangle to place text; dblclick existing text to edit.
  useEffect(() => {
    const host = hostRef.current;
    const app = appRef.current;
    const world = worldRef.current;
    if (!host || !app || !world || !textCreateActive || textEdit) return;

    useTools.getState().setShapesOpen(false);

    if (!measureCtxRef.current) {
      measureCtxRef.current = document.createElement("canvas").getContext("2d");
    }
    const measureCtx = measureCtxRef.current;

    const toProject = (clientX: number, clientY: number) => {
      const rect = host.getBoundingClientRect();
      const fit = fitRef.current;
      const s = fit.scale > 0 ? fit.scale : 1;
      return {
        x: (clientX - rect.left - fit.ox) / s,
        y: (clientY - rect.top - fit.oy) / s,
      };
    };

    const findHit = (x: number, y: number) => {
      if (!measureCtx) return null;
      const { texts, layerId } = currentCelTexts();
      for (let i = texts.length - 1; i >= 0; i--) {
        const t = texts[i];
        if (hitTextBox(measureCtx, t, x, y)) {
          return { text: t, layerId };
        }
      }
      return null;
    };

    const clearBox = () => {
      if (textBoxProxyRef.current) {
        textBoxProxyRef.current.destroy();
        textBoxProxyRef.current = null;
      }
    };

    const updateBox = (x0: number, y0: number, x1: number, y1: number) => {
      const left = Math.min(x0, x1);
      const top = Math.min(y0, y1);
      const w = Math.max(1, Math.abs(x1 - x0));
      const h = Math.max(1, Math.abs(y1 - y0));
      clearBox();
      const proxy = new Rect({
        x: left,
        y: top,
        width: w,
        height: h,
        fill: "rgba(43, 92, 255, 0.08)",
        stroke: "#2b5cff",
        strokeWidth: 1 / Math.max(fitRef.current.scale, 0.001),
        dashPattern: [6, 4],
        editable: false,
        hittable: false,
      });
      world.add(proxy);
      textBoxProxyRef.current = proxy;
    };

    const onDown = (e: PointerEvent) => {
      if (e.button !== 0) return;
      e.preventDefault();
      e.stopPropagation();
      const p = toProject(e.clientX, e.clientY);
      const hit = findHit(p.x, p.y);
      textDragRef.current = {
        startX: p.x,
        startY: p.y,
        currentX: p.x,
        currentY: p.y,
        hit: hit?.text ?? null,
        layerId: hit?.layerId ?? null,
        detail: e.detail,
      };
      if (!hit) {
        useSelection.getState().clear();
        host.setPointerCapture(e.pointerId);
        updateBox(p.x, p.y, p.x, p.y);
      }
    };

    const onMove = (e: PointerEvent) => {
      const drag = textDragRef.current;
      if (!drag || drag.hit) return;
      const p = toProject(e.clientX, e.clientY);
      drag.currentX = p.x;
      drag.currentY = p.y;
      updateBox(drag.startX, drag.startY, p.x, p.y);
    };

    const onUp = (e: PointerEvent) => {
      const drag = textDragRef.current;
      textDragRef.current = null;
      clearBox();
      try {
        host.releasePointerCapture(e.pointerId);
      } catch {
        /* ignore */
      }
      if (!drag) return;

      if (drag.hit) {
        onTextSelectRef.current(drag.hit, drag.layerId);
        return;
      }

      const significant = shapeDragSignificant(
        drag.startX,
        drag.startY,
        drag.currentX,
        drag.currentY,
        8,
      );
      const left = Math.min(drag.startX, drag.currentX);
      const top = Math.min(drag.startY, drag.currentY);
      const w = Math.abs(drag.currentX - drag.startX);
      const tools = useTools.getState();
      onTextCreateRef.current({
        text: "",
        projectX: significant ? left : drag.startX,
        projectY: significant ? top : drag.startY,
        boxWidth: significant ? Math.max(40, w) : Math.max(120, tools.textSize * 6),
      });
    };

    const onDblClick = (e: MouseEvent) => {
      const p = toProject(e.clientX, e.clientY);
      const hit = findHit(p.x, p.y);
      if (!hit) return;
      e.preventDefault();
      e.stopPropagation();
      onTextOpenRef.current(hit.text, hit.layerId);
    };

    host.addEventListener("pointerdown", onDown);
    host.addEventListener("pointermove", onMove);
    host.addEventListener("pointerup", onUp);
    host.addEventListener("pointercancel", onUp);
    host.addEventListener("dblclick", onDblClick);
    return () => {
      host.removeEventListener("pointerdown", onDown);
      host.removeEventListener("pointermove", onMove);
      host.removeEventListener("pointerup", onUp);
      host.removeEventListener("pointercancel", onUp);
      host.removeEventListener("dblclick", onDblClick);
      clearBox();
      textDragRef.current = null;
    };
  }, [textCreateActive, textEdit, fitRef]);

  // Shape rubber-band → bake to Stroke
  useEffect(() => {
    const host = hostRef.current;
    const app = appRef.current;
    const world = worldRef.current;
    if (!host || !app || !world || !creatingShape || !shapeKind || textEdit || textCreateActive)
      return;

    useTools.getState().setShapesOpen(false);

    const toProject = (clientX: number, clientY: number) => {
      const rect = host.getBoundingClientRect();
      const fit = fitRef.current;
      const s = fit.scale > 0 ? fit.scale : 1;
      return {
        x: (clientX - rect.left - fit.ox) / s,
        y: (clientY - rect.top - fit.oy) / s,
      };
    };

    const clearProxy = () => {
      if (shapeProxyRef.current) {
        shapeProxyRef.current.destroy();
        shapeProxyRef.current = null;
      }
    };

    const updateProxy = (
      kind: ShapeToolId,
      x0: number,
      y0: number,
      x1: number,
      y1: number,
      constrain: boolean,
      fromCenter: boolean,
    ) => {
      const tools = useTools.getState();
      const cornerOpts =
        kind === "rect"
          ? {
              cornerRadius: tools.cornerRadius,
              squircle: tools.squircle,
              cornerSmoothing: tools.cornerSmoothing,
            }
          : {};
      const { points } = buildShapePoints(kind, x0, y0, x1, y1, {
        constrain,
        fromCenter,
        ...cornerOpts,
      });
      let minX = Infinity;
      let minY = Infinity;
      let maxX = -Infinity;
      let maxY = -Infinity;
      for (const p of points) {
        minX = Math.min(minX, p.x);
        minY = Math.min(minY, p.y);
        maxX = Math.max(maxX, p.x);
        maxY = Math.max(maxY, p.y);
      }
      clearProxy();
      const closed = isClosedShape(kind);
      const proxy = makeShapeProxy(
        kind,
        kind === "line" || kind === "arrow" ? x0 : minX,
        kind === "line" || kind === "arrow" ? y0 : minY,
        kind === "line" || kind === "arrow" ? x1 : maxX,
        kind === "line" || kind === "arrow" ? y1 : maxY,
        color,
        closed ? fillColor : "transparent",
        size,
        kind === "rect" ? tools.cornerRadius : 0,
      );
      if (kind === "line" || kind === "arrow") {
        (proxy as Line).x = x0;
        (proxy as Line).y = y0;
        // Assign toPoint alone — do not also zero rotation.
        (proxy as Line).toPoint = { x: x1 - x0, y: y1 - y0 };
      }
      world.add(proxy);
      shapeProxyRef.current = proxy;
    };

    const onDown = (e: PointerEvent) => {
      if (e.button !== 0) return;
      e.preventDefault();
      e.stopPropagation();
      host.setPointerCapture(e.pointerId);
      const p = toProject(e.clientX, e.clientY);
      shapeDragRef.current = {
        kind: shapeKind,
        startX: p.x,
        startY: p.y,
        currentX: p.x,
        currentY: p.y,
        constrain: e.shiftKey,
        fromCenter: e.altKey,
        id: crypto.randomUUID(),
        seed: Math.floor(Math.random() * 2 ** 31),
      };
      useSelection.getState().clear();
      updateProxy(shapeKind, p.x, p.y, p.x, p.y, e.shiftKey, e.altKey);
    };

    const onMove = (e: PointerEvent) => {
      const drag = shapeDragRef.current;
      if (!drag) return;
      const p = toProject(e.clientX, e.clientY);
      drag.currentX = p.x;
      drag.currentY = p.y;
      drag.constrain = e.shiftKey;
      drag.fromCenter = e.altKey;
      updateProxy(
        drag.kind,
        drag.startX,
        drag.startY,
        p.x,
        p.y,
        e.shiftKey,
        e.altKey,
      );
    };

    const onUp = (e: PointerEvent) => {
      const drag = shapeDragRef.current;
      shapeDragRef.current = null;
      clearProxy();
      try {
        host.releasePointerCapture(e.pointerId);
      } catch {
        /* ignore */
      }
      if (!drag) return;
      const significant = shapeDragSignificant(
        drag.startX,
        drag.startY,
        drag.currentX,
        drag.currentY,
      );
      if (!significant) return;
      const tools = useTools.getState();
      const cornerOpts =
        drag.kind === "rect"
          ? {
              cornerRadius: tools.cornerRadius,
              squircle: tools.squircle,
              cornerSmoothing: tools.cornerSmoothing,
            }
          : {};
      const frame = resolveShapeFrame(
        drag.kind,
        drag.startX,
        drag.startY,
        drag.currentX,
        drag.currentY,
        { constrain: drag.constrain, fromCenter: drag.fromCenter },
      );
      const { points, closed } = buildShapePoints(
        drag.kind,
        drag.startX,
        drag.startY,
        drag.currentX,
        drag.currentY,
        {
          constrain: drag.constrain,
          fromCenter: drag.fromCenter,
          ...cornerOpts,
        },
      );
      if (points.length < 2) return;
      const shapeBox =
        drag.kind === "line" || drag.kind === "arrow"
          ? {
              x: frame.x0,
              y: frame.y0,
              w: frame.x1 - frame.x0,
              h: frame.y1 - frame.y0,
            }
          : {
              x: frame.box.x,
              y: frame.box.y,
              w: frame.box.w,
              h: frame.box.h,
            };
      const stroke: Stroke = {
        id: drag.id,
        brush: tools.lastBrushKind,
        p5Brush: tools.lastP5Brush,
        color: tools.color,
        size: tools.size,
        brushWavelength: tools.brushWavelength,
        brushCorners: tools.brushCorners,
        brushSmoothing: tools.brushSmoothing,
        points,
        seed: drag.seed,
        jitter: tools.jitterByDefault,
        grain:
          tools.lastP5Brush === "spray" || tools.lastP5Brush === "airbrush"
            ? false
            : tools.grainByDefault,
        closed,
        fillColor: closed ? tools.fillColor : undefined,
        shapeKind: drag.kind,
        shapeBox,
        ...(drag.kind === "rect"
          ? {
              cornerRadius: tools.cornerRadius || undefined,
              squircle: tools.squircle || undefined,
              cornerSmoothing: tools.squircle
                ? tools.cornerSmoothing
                : undefined,
            }
          : {}),
      };
      useProject.getState().addStroke(stroke);
      useSelection.getState().set([stroke.id]);
      // Hand off to select so Leafer editor takes over transform chrome.
      useTools.getState().setTool("select");
    };

    host.addEventListener("pointerdown", onDown);
    host.addEventListener("pointermove", onMove);
    host.addEventListener("pointerup", onUp);
    host.addEventListener("pointercancel", onUp);
    return () => {
      host.removeEventListener("pointerdown", onDown);
      host.removeEventListener("pointermove", onMove);
      host.removeEventListener("pointerup", onUp);
      host.removeEventListener("pointercancel", onUp);
      clearProxy();
      shapeDragRef.current = null;
    };
  }, [creatingShape, shapeKind, textEdit, textCreateActive, color, fillColor, size, fitRef]);

  // Select tool + single shape-tool stroke → Leafer editor (replaces StageCanvas bbox).
  useEffect(() => {
    if (!editingShape || textEdit || textCreateActive) {
      if (shapeEditProxyRef.current) {
        flushShapeEditToProject();
        try {
          appRef.current?.editor.cancel();
        } catch {
          /* ignore */
        }
        try {
          shapeEditProxyRef.current.destroy();
        } catch {
          /* ignore */
        }
        shapeEditProxyRef.current = null;
        shapeEditStrokeIdRef.current = null;
        shapeEditKindRef.current = null;
        shapeEditDirtyRef.current = false;
        shapeEditIgnoreTransformsRef.current = false;
        setShapeLivePreview(null);
      }
      return;
    }

    const stroke = editingShape;
    const kind = stroke.shapeKind!;
    const host = hostRef.current;
    let cancelled = false;
    let raf = 0;
    let mounted = false;

    const tearDownProxy = () => {
      if (!shapeEditProxyRef.current) return;
      try {
        appRef.current?.editor.cancel();
      } catch {
        /* ignore */
      }
      try {
        shapeEditProxyRef.current.destroy();
      } catch {
        /* ignore */
      }
      shapeEditProxyRef.current = null;
      shapeEditStrokeIdRef.current = null;
      shapeEditKindRef.current = null;
      shapeEditDirtyRef.current = false;
      setShapeLivePreview(null);
    };

    const commitIfDirty = () => {
      flushShapeEditToProject();
      const app = appRef.current;
      const node = shapeEditProxyRef.current;
      if (!app || !node) return;
      try {
        app.editor.update();
      } catch {
        /* ignore */
      }
    };

    const publishLive = () => {
      const node = shapeEditProxyRef.current;
      const id = shapeEditStrokeIdRef.current;
      const k = shapeEditKindRef.current;
      if (!node || !id || !k) return;
      const existing = (() => {
        const ps = useProject.getState();
        for (const layer of ps.project.layers) {
          for (const frame of layer.frames) {
            const hit = frame?.strokes.find((s) => s.id === id);
            if (hit) return hit;
          }
        }
        return null;
      })();
      if (!existing) return;
      const baked = bakeEditableShape(k, node, {
        cornerRadius: existing.cornerRadius,
        squircle: existing.squircle,
        cornerSmoothing: existing.cornerSmoothing,
      });
      setShapeLivePreview({
        id,
        points: baked.points,
        shapeBox: baked.shapeBox,
      });
    };

    const markDirty = () => {
      // Programmatic editor.select() emits SCALE/MOVE — ignore until user pointerdown.
      if (shapeEditIgnoreTransformsRef.current) return;
      shapeEditDirtyRef.current = true;
      publishLive();
    };

    const onPointerUp = () => commitIfDirty();
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        commitIfDirty();
        useSelection.getState().clear();
      }
    };
    const armUserTransforms = () => {
      shapeEditIgnoreTransformsRef.current = false;
    };

    const mount = () => {
      if (cancelled) return;
      const app = appRef.current;
      const world = worldRef.current;
      if (!app || !world) {
        raf = requestAnimationFrame(mount);
        return;
      }

      applyFitToGroup(world, fitRef.current);

      const needsRemount =
        shapeEditStrokeIdRef.current !== stroke.id ||
        !shapeEditProxyRef.current ||
        // Strict Mode / App rebuild leaves a dead proxy with matching id.
        !(shapeEditProxyRef.current as { parent?: unknown }).parent;

      if (needsRemount) {
        commitIfDirty();
        tearDownProxy();
        const proxy = makeEditableShapeFromStroke(stroke);
        if (!proxy) return;
        world.add(proxy);
        shapeEditProxyRef.current = proxy;
        shapeEditStrokeIdRef.current = stroke.id;
        shapeEditKindRef.current = kind;
        shapeEditDirtyRef.current = false;
        shapeEditIgnoreTransformsRef.current = true;
        try {
          app.editor.select(proxy);
          app.editor.update();
        } catch {
          /* ignore */
        }
      } else {
        const node = shapeEditProxyRef.current!;
        if (!shapeEditDirtyRef.current) {
          // Keep Leafer nearly invisible so canvas ink is the only drawing.
          // Zero opacity collapses editor bounds and bakes the stroke to a dot.
          node.stroke = stroke.color;
          node.strokeWidth = Math.max(0.5, stroke.size, 8);
          node.opacity = 0.001;
          if (isClosedShape(kind)) {
            (node as Rect | Ellipse | Polygon).fill = "transparent";
          }
          if (kind === "rect") {
            (node as Rect).cornerRadius = Math.max(0, stroke.cornerRadius ?? 0);
          }
          try {
            if (!app.editor.list?.length) {
              app.editor.select(node);
            }
            app.editor.update();
          } catch {
            /* ignore */
          }
        }
      }

      if (!mounted) {
        mounted = true;
        app.editor.on(EditorMoveEvent.MOVE, markDirty);
        app.editor.on(EditorScaleEvent.SCALE, markDirty);
        app.editor.on(EditorRotateEvent.ROTATE, markDirty);
        host?.addEventListener("pointerdown", armUserTransforms, true);
        window.addEventListener("pointerdown", armUserTransforms, true);
        window.addEventListener("pointerup", onPointerUp);
        window.addEventListener("keydown", onKeyDown);
      }
    };

    mount();

    return () => {
      cancelled = true;
      cancelAnimationFrame(raf);
      const app = appRef.current;
      if (app && mounted) {
        app.editor.off(EditorMoveEvent.MOVE, markDirty);
        app.editor.off(EditorScaleEvent.SCALE, markDirty);
        app.editor.off(EditorRotateEvent.ROTATE, markDirty);
      }
      host?.removeEventListener("pointerdown", armUserTransforms, true);
      window.removeEventListener("pointerdown", armUserTransforms, true);
      window.removeEventListener("pointerup", onPointerUp);
      window.removeEventListener("keydown", onKeyDown);
      commitIfDirty();
    };
  }, [
    editingShape?.id,
    editingShape?.color,
    editingShape?.size,
    editingShape?.fillColor,
    editingShape?.cornerRadius,
    editingShape?.squircle,
    editingShape?.cornerSmoothing,
    editingShape?.shapeBox?.x,
    editingShape?.shapeBox?.y,
    editingShape?.shapeBox?.w,
    editingShape?.shapeBox?.h,
    editingShape?.shapeBox?.rotation,
    textEdit,
    textCreateActive,
    creatingShape,
    interactive,
  ]);

  /**
   * While Leafer owns the full-stage hit layer for a selected shape/image,
   * clicks on *other* art never reach StageCanvas — so older shapes/images
   * become unselectable. Capture pointerdown: if outside the current chrome,
   * reselect (cross-layer) or clear.
   */
  useEffect(() => {
    if (creatingShape || textEdit || textCreateActive) return;
    if (!editingShape && !editingImage) return;
    const host = hostRef.current;
    if (!host) return;

    const measureCtx = document.createElement("canvas").getContext("2d");

    const onPointerDown = (e: PointerEvent) => {
      if (e.button !== 0) return;
      // Mid-transform: project geometry is stale — don't steal from Leafer.
      if (shapeEditDirtyRef.current || imageEditDirtyRef.current) return;
      const fit = fitRef.current;
      if (!fit || fit.scale <= 0) return;
      const rect = host.getBoundingClientRect();
      const x = (e.clientX - rect.left - fit.ox) / fit.scale;
      const y = (e.clientY - rect.top - fit.oy) / fit.scale;

      const shape = editingShape;
      const image = editingImage;
      if (shape && hitsShapeEditChrome(shape, x, y, fit.scale)) {
        return;
      }
      if (image && hitsImageEditChrome(image, x, y, fit.scale)) {
        return;
      }

      // Outside current Leafer chrome — steal the event from the overlay.
      e.preventDefault();
      e.stopPropagation();

      const ps = useProject.getState();
      const selectedId = shape?.id ?? image?.id ?? null;
      const art = findArtAtProject(
        ps.project,
        ps.frameIndex,
        x,
        y,
        measureCtx,
      );

      if (art && art.id !== selectedId) {
        const idx = ps.project.layers.findIndex((l) => l.id === art.layerId);
        if (idx !== -1 && idx !== ps.layerIndex) ps.setLayerIndex(idx);
        const sel = useSelection.getState();
        if (e.shiftKey) sel.toggle(art.id);
        else sel.set([art.id]);
        if (art.kind === "stroke" && !e.shiftKey) {
          const layer = ps.project.layers[idx === -1 ? ps.layerIndex : idx];
          const animatron = ps.project.workflow === "animatron";
          const cel = layer
            ? animatron
              ? (layer.frames.find((f) => f) ?? null)
              : resolveCel(layer, ps.frameIndex)
            : null;
          const stroke = cel?.strokes.find((s) => s.id === art.id);
          if (stroke) {
            const t = useTools.getState();
            t.setColor(stroke.color);
            if (stroke.fillColor) t.setFillColor(stroke.fillColor);
          }
        }
        useTools.getState().setTool("select");
        return;
      }

      // Empty canvas: drop selection so StageCanvas / other tools can take over.
      // Keep select tool — clearing alone unblocks moving other art next click.
      if (!e.shiftKey) useSelection.getState().clear();
    };

    host.addEventListener("pointerdown", onPointerDown, true);
    return () => host.removeEventListener("pointerdown", onPointerDown, true);
  }, [
    editingShape?.id,
    editingImage?.id,
    creatingShape,
    textEdit,
    textCreateActive,
    fitRef,
  ]);

  // Selected canvas image — Leafer free transform (move / squeeze / rotate) + guides.
  useEffect(() => {
    const flushLiveToProject = () => {
      const live = getImageLivePreview();
      if (!live || !imageEditDirtyRef.current) return;
      const pw = useProject.getState().project.width;
      const ph = useProject.getState().project.height;
      const snapped = snapImageBox(
        {
          x: live.x,
          y: live.y,
          w: live.w,
          h: live.h,
          rotation: live.rotation,
        },
        pw,
        ph,
        0,
      );
      useProject.getState().updateImageElement(live.id, {
        x: snapped.box.x,
        y: snapped.box.y,
        w: Math.max(1, snapped.box.w),
        h: Math.max(1, snapped.box.h),
        rotation: live.rotation,
      });
      imageEditDirtyRef.current = false;
      setImageLivePreview(null);
    };

    if (!editingImage || textEdit || textCreateActive || editingShape) {
      // Leaving select / image edit — persist any in-flight transform first.
      // The Leafer App may already be destroyed by the interactive layout effect.
      flushLiveToProject();
      if (imageEditProxyRef.current) {
        try {
          appRef.current?.editor.cancel();
        } catch {
          /* ignore */
        }
        try {
          imageEditProxyRef.current.destroy();
        } catch {
          /* ignore */
        }
        imageEditProxyRef.current = null;
        imageEditIdRef.current = null;
        imageEditDirtyRef.current = false;
      }
      setImageLivePreview(null);
      for (const g of imageGuideRefs.current) {
        try {
          g.destroy();
        } catch {
          /* ignore */
        }
      }
      imageGuideRefs.current = [];
      return;
    }

    const image = editingImage;
    if (image.locked) return;

    let cancelled = false;
    let raf = 0;
    let mounted = false;

    const clearGuides = () => {
      for (const g of imageGuideRefs.current) {
        try {
          g.destroy();
        } catch {
          /* ignore */
        }
      }
      imageGuideRefs.current = [];
    };

    const showGuides = (guides: GuideLine[]) => {
      const world = worldRef.current;
      if (!world) return;
      clearGuides();
      const pw = useProject.getState().project.width;
      const ph = useProject.getState().project.height;
      for (const g of guides) {
        const line =
          g.axis === "x"
            ? new Line({
                x: g.at,
                y: 0,
                toPoint: { x: 0, y: ph },
                stroke: "#F472B6",
                strokeWidth: 1,
                hittable: false,
                editable: false,
              })
            : new Line({
                x: 0,
                y: g.at,
                toPoint: { x: pw, y: 0 },
                stroke: "#F472B6",
                strokeWidth: 1,
                hittable: false,
                editable: false,
              });
        world.add(line);
        imageGuideRefs.current.push(line);
      }
    };

    const tearDown = () => {
      try {
        appRef.current?.editor.cancel();
      } catch {
        /* ignore */
      }
      try {
        imageEditProxyRef.current?.destroy();
      } catch {
        /* ignore */
      }
      imageEditProxyRef.current = null;
      imageEditIdRef.current = null;
      imageEditDirtyRef.current = false;
      setImageLivePreview(null);
      clearGuides();
    };

    const commitIfDirty = () => {
      const app = appRef.current;
      const node = imageEditProxyRef.current;
      const id = imageEditIdRef.current;
      if (!app || !node || !id || !imageEditDirtyRef.current) return;
      const baked = bakeEditableImage(node);
      const pw = useProject.getState().project.width;
      const ph = useProject.getState().project.height;
      const snapped = snapImageBox(baked, pw, ph, 0);
      useProject.getState().updateImageElement(id, {
        x: snapped.box.x,
        y: snapped.box.y,
        w: snapped.box.w,
        h: snapped.box.h,
        rotation: baked.rotation,
      });
      imageEditDirtyRef.current = false;
      setImageLivePreview(null);
      node.scaleX = 1;
      node.scaleY = 1;
      node.x = snapped.box.x;
      node.y = snapped.box.y;
      node.width = snapped.box.w;
      node.height = snapped.box.h;
      node.rotation = (baked.rotation * 180) / Math.PI;
      clearGuides();
      try {
        app.editor.update();
      } catch {
        /* ignore */
      }
    };

    const onTransform = () => {
      imageEditDirtyRef.current = true;
      const node = imageEditProxyRef.current;
      const id = imageEditIdRef.current;
      if (!node || !id) return;
      const baked = bakeEditableImage(node);
      setImageLivePreview({ id, ...baked });
      const pw = useProject.getState().project.width;
      const ph = useProject.getState().project.height;
      const { guides } = snapImageBox(baked, pw, ph, 6);
      showGuides(guides);
    };

    const onPointerUp = () => {
      const node = imageEditProxyRef.current;
      if (node && imageEditDirtyRef.current) {
        const baked = bakeEditableImage(node);
        const pw = useProject.getState().project.width;
        const ph = useProject.getState().project.height;
        const snapped = snapImageBox(baked, pw, ph, 6);
        if (
          Math.abs(snapped.box.x - baked.x) > 0.01 ||
          Math.abs(snapped.box.y - baked.y) > 0.01
        ) {
          node.x = snapped.box.x + snapped.box.w / 2;
          node.y = snapped.box.y + snapped.box.h / 2;
        }
      }
      commitIfDirty();
    };

    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        commitIfDirty();
        useSelection.getState().clear();
      }
    };

    const mount = () => {
      if (cancelled) return;
      const app = appRef.current;
      const world = worldRef.current;
      if (!app || !world) {
        raf = requestAnimationFrame(mount);
        return;
      }
      applyFitToGroup(world, fitRef.current);

      const needsRemount =
        imageEditIdRef.current !== image.id ||
        !imageEditProxyRef.current ||
        !(imageEditProxyRef.current as { parent?: unknown }).parent;

      if (needsRemount) {
        commitIfDirty();
        tearDown();
        const proxy = makeEditableImageFromElement(image);
        world.add(proxy);
        imageEditProxyRef.current = proxy;
        imageEditIdRef.current = image.id;
        imageEditDirtyRef.current = false;
        try {
          app.editor.select(proxy);
          app.editor.update();
        } catch {
          /* ignore */
        }
      } else if (!imageEditDirtyRef.current) {
        const node = imageEditProxyRef.current!;
        node.x = image.x + image.w / 2;
        node.y = image.y + image.h / 2;
        node.width = image.w;
        node.height = image.h;
        node.rotation = ((image.rotation ?? 0) * 180) / Math.PI;
        node.opacity = image.opacity ?? 1;
        node.fill = {
          type: "image",
          url: image.src,
          mode: "stretch",
        };
        try {
          if (!app.editor.list?.length) app.editor.select(node);
          app.editor.update();
        } catch {
          /* ignore */
        }
      }

      if (!mounted) {
        mounted = true;
        app.editor.on(EditorMoveEvent.MOVE, onTransform);
        app.editor.on(EditorScaleEvent.SCALE, onTransform);
        app.editor.on(EditorRotateEvent.ROTATE, onTransform);
        window.addEventListener("pointerup", onPointerUp);
        window.addEventListener("keydown", onKeyDown);
      }
    };

    mount();

    return () => {
      cancelled = true;
      cancelAnimationFrame(raf);
      const app = appRef.current;
      if (app && mounted) {
        app.editor.off(EditorMoveEvent.MOVE, onTransform);
        app.editor.off(EditorScaleEvent.SCALE, onTransform);
        app.editor.off(EditorRotateEvent.ROTATE, onTransform);
      }
      window.removeEventListener("pointerup", onPointerUp);
      window.removeEventListener("keydown", onKeyDown);
      commitIfDirty();
      clearGuides();
    };
  }, [
    editingImage?.id,
    editingImage?.x,
    editingImage?.y,
    editingImage?.w,
    editingImage?.h,
    editingImage?.rotation,
    editingImage?.opacity,
    editingImage?.locked,
    editingImage?.src,
    textEdit,
    textCreateActive,
    editingShape,
    interactive,
  ]);

  const hostCursor =
    textCreateActive && !textEdit
      ? cursorForTool("text")
      : creatingShape && shapeKind
        ? cursorForTool(shapeKind)
        : textEdit
          ? "text"
          : editingShape || editingImage
            ? "default"
            : undefined;

  return (
    <div
      ref={hostRef}
      className={
        interactive
          ? "absolute inset-0 z-10"
          : "pointer-events-none absolute inset-0"
      }
      style={{
        touchAction: interactive ? "none" : undefined,
        cursor: interactive ? hostCursor : undefined,
      }}
      aria-hidden={interactive ? undefined : true}
      data-leafer-edit-layer=""
    />
  );
}
