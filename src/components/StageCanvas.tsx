import { useEffect, useRef, useState } from "react";
import { useProject } from "@/state/project";
import { useTools, isBrushTool, activeShapeTool } from "@/state/tools";
import { usePlayback } from "@/state/playback";
import { useSelection } from "@/state/selection";
import { usePathMaker } from "@/state/pathMaker";
import { useViewport } from "@/state/viewport";
import { renderStrokes, renderStroke, renderTexts } from "@/engine/renderer";
import { clearBrushDraftCache } from "@/engine/brushStyles";
import { PressureTracker } from "@/engine/pressure";
import { drawImageFitted, paintBackground } from "@/engine/background";
import { useReference } from "@/state/reference";
import { LeaferEditLayer } from "@/components/stage/LeaferEditLayer";
import { canEditShapeWithLeafer, extrasAfterPathEdit } from "@/components/stage/leaferBridge";
import { getShaderSnapshotCanvas } from "@/components/ShaderBackground";
import { getImageFilterSnapshotCanvas } from "@/components/ImageFilterBackground";
import { hasImageFilter } from "@/lib/image-filters";
import {
  straightLinePoints,
  warpPoints,
  translatePoints,
  transformPoints,
  translateBezierNodes,
  transformBezierNodes,
  boundsCenter,
  handleIndices,
  hitsStroke,
  pointsBounds,
  HANDLE_HIT_PX,
  isNearClosedLoop,
  fillGapThreshold,
  bridgeNearClosedPoints,
  fillShiftEdgeDistance,
  fillFeatherDistance,
  fillPolygonExpandDistance,
  expandPolygonOutward,
  pointInPolygon,
} from "@/engine/pathEdit";
import { strokeAtTime, textContentAtTime, strokeWithClipPoints } from "@/engine/strokeProgress";
import { celForLayer } from "@/engine/layerCel";
import { boilDisplacement } from "@/engine/boil";
import {
  applyMotionPoseToPoint,
  layerMotionAt,
  motionDisplacement,
} from "@/engine/motionPath";
import { PATH_MAKER_ENABLED } from "@/lib/mvpFlags";
import {
  hitTextBox,
  measureTextBox,
  textAABB,
  transformTextElement,
} from "@/engine/textGeometry";
import { syncTextToolsFromElement } from "@/components/chrome/TextSettingsChrome";
import { flattenBezierNodes, projectToCubicBezier, splitCubicBezier, toggleBezierNodeCorner } from "@/lib/bezier";
import { cursorForTool } from "@/lib/toolCursors";
import {
  resolveCel,
  resolveCelIndex,
  type Stroke,
  type StrokePoint,
  type BezierNode,
  type TextElement,
  type ImageElement,
  type Project,
} from "@/model/types";
import {
  renderImages,
  imageOverflowsArtboard,
  cachedImage,
  paintSelectedImageOverflowGhost,
  resolveImageDrawBox,
  getImageLivePreview,
  setImageLivePreview,
  subscribeImageLivePreview,
} from "@/engine/canvasImage";
import { findArtAtProject } from "@/engine/artHitTest";
import {
  computeFloodFill,
  sealInkGaps,
  colorizeFillMask,
  type FillMaskCrop,
} from "@/engine/floodFill";

/**
 * The drawing stage. Committed + live strokes render into an offscreen "art"
 * canvas at project resolution (so the eraser's destination-out only affects
 * art, never the backdrop), which is then composited onto the visible canvas.
 * Edit mode renders the art canvas at reduced scale with smoothing off —
 * cheap and aliased on purpose.
 */

const DRAFT_SCALE = 0.5;

/** Navy preview wash for bucket hover (`#40608E` @ 15%). */
const FILL_PREVIEW_RGBA = "rgba(64, 96, 142, 0.15)";

const STATIC_CEL_CACHE_LIMIT = 16;

/** Cheap checksum so interior node / warp edits invalidate the cel blit cache. */
function strokeGeomFp(s: Stroke): string {
  if (s.bezierNodes?.length) {
    let h = s.bezierNodes.length * 131;
    for (const n of s.bezierNodes) {
      h = (h * 33 + (n.x * 10) | 0) | 0;
      h = (h * 33 + (n.y * 10) | 0) | 0;
      if (n.handleIn) {
        h = (h * 33 + (n.handleIn.x * 10) | 0) | 0;
        h = (h * 33 + (n.handleIn.y * 10) | 0) | 0;
      }
      if (n.handleOut) {
        h = (h * 33 + (n.handleOut.x * 10) | 0) | 0;
        h = (h * 33 + (n.handleOut.y * 10) | 0) | 0;
      }
    }
    return `b${h}`;
  }
  const pts = s.points;
  const n = pts.length;
  if (!n) return "p0";
  let h = n * 131;
  // Sample along the whole polyline — endpoints alone miss interior warps.
  const steps = Math.min(12, n);
  for (let i = 0; i < steps; i++) {
    const p = pts[((i * (n - 1)) / Math.max(1, steps - 1)) | 0]!;
    h = (h * 33 + (p.x * 10) | 0) | 0;
    h = (h * 33 + (p.y * 10) | 0) | 0;
  }
  return `p${h}`;
}

/** Fingerprint committed cel content so we can blit instead of re-paint. */
function celContentKey(
  strokes: Stroke[],
  texts: TextElement[] | undefined,
  images: ImageElement[] | undefined,
  colorOverride: string | undefined,
  skipTextId: string | undefined,
  skipImageId: string | undefined,
): string {
  let key = `${colorOverride ?? ""}|${skipTextId ?? ""}|${skipImageId ?? ""}|${strokes.length}|`;
  for (const s of strokes) {
    const n = s.points.length;
    key += `${s.id}:${n}:${s.size}:${s.p5Brush ?? ""}:${s.color}:${s.seed}:${s.brushWavelength ?? ""}:${s.brushCorners ?? ""}:${s.brushSmoothing ?? ""}:${s.closed ? 1 : 0}:${s.fillColor ?? ""}:${strokeGeomFp(s)};`;
  }
  if (texts) {
    key += `|t${texts.length}`;
    for (const t of texts) {
      if (skipTextId && t.id === skipTextId) continue;
      key += `${t.id}:${t.x|0}:${t.y|0}:${t.size}:${t.text.length};`;
    }
  }
  if (images) {
    key += `|i${images.length}`;
    for (const im of images) {
      if (skipImageId && im.id === skipImageId) continue;
      // Include a src fingerprint so a late-decoded bitmap invalidates the cache.
      const srcFp = im.src.length + ":" + im.src.slice(0, 24) + im.src.slice(-16);
      key += `${im.id}:${im.x|0}:${im.y|0}:${im.w|0}:${im.h|0}:${((im.rotation ?? 0) * 1000) | 0}:${im.opacity ?? 1}:${im.locked ? 1 : 0}:${srcFp};`;
    }
  }
  return key;
}

function artboardRectPoints(pw: number, ph: number): StrokePoint[] {
  return [
    { x: 0, y: 0, pressure: 0.5, t: 0 },
    { x: pw, y: 0, pressure: 0.5, t: 0 },
    { x: pw, y: ph, pressure: 0.5, t: 0 },
    { x: 0, y: ph, pressure: 0.5, t: 0 },
  ];
}

function strokeInkBounds(stroke: Stroke, pad = 0) {
  const pts = stroke.bezierNodes?.length
    ? flattenBezierNodes(stroke.bezierNodes, false)
    : stroke.points;
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (const p of pts) {
    minX = Math.min(minX, p.x);
    minY = Math.min(minY, p.y);
    maxX = Math.max(maxX, p.x);
    maxY = Math.max(maxY, p.y);
  }
  return {
    minX: minX - pad,
    minY: minY - pad,
    maxX: maxX + pad,
    maxY: maxY + pad,
  };
}

function pointInInkBounds(stroke: Stroke, x: number, y: number): boolean {
  const pad = stroke.size * 0.5;
  const b = strokeInkBounds(stroke, pad);
  return x >= b.minX && x <= b.maxX && y >= b.minY && y <= b.maxY;
}

function findBucketTarget(
  strokes: Stroke[],
  x: number,
  y: number,
  pw: number,
  ph: number,
):
  | { kind: "shape"; stroke: Stroke; points: StrokePoint[] }
  | { kind: "canvas"; points: StrokePoint[] }
  | { kind: "none"; points: StrokePoint[] } {
  if (x < 0 || y < 0 || x >= pw || y >= ph) {
    return { kind: "none", points: [] };
  }
  for (let i = strokes.length - 1; i >= 0; i--) {
    const s = strokes[i]!;
    const thresh = Math.max(s.size * 0.5, 4);
    const gap = fillGapThreshold(s.size);
    const openHitPts = s.bezierNodes?.length
      ? flattenBezierNodes(s.bezierNodes, false)
      : s.points;
    const nearClosed = isNearClosedLoop(openHitPts, gap);
    const fillable =
      s.brush !== "eraser" &&
      openHitPts.length >= 3 &&
      (!!s.closed || nearClosed);
    const hitPts = s.bezierNodes?.length
      ? flattenBezierNodes(s.bezierNodes, !!s.closed || nearClosed)
      : s.points;
    const closedHit = !!s.closed || nearClosed;
    if (!fillable) continue;
    if (hitsStroke(hitPts, x, y, thresh, closedHit)) {
      return { kind: "shape", stroke: s, points: hitPts };
    }
  }
  return { kind: "canvas", points: artboardRectPoints(pw, ph) };
}

/** Outline stroke enclosing (x,y) — for patching fill onto the ink loop. */
function findEnclosingStroke(strokes: Stroke[], x: number, y: number): Stroke | null {
  for (let i = strokes.length - 1; i >= 0; i--) {
    const s = strokes[i]!;
    if (s.brush === "eraser" || s.shapeKind) continue;
    const gap = fillGapThreshold(s.size);
    const thresh = Math.max(s.size * 0.5, 4);
    const openPts = s.bezierNodes?.length
      ? flattenBezierNodes(s.bezierNodes, false)
      : s.points;
    if (openPts.length < 3) continue;
    const closed = !!s.closed || isNearClosedLoop(openPts, gap);
    if (!closed) continue;
    const hitPts = s.bezierNodes?.length
      ? flattenBezierNodes(s.bezierNodes, true)
      : bridgeNearClosedPoints(s.points, gap);
    if (hitsStroke(hitPts, x, y, thresh, true)) return s;
    const expanded = expandPolygonOutward(
      hitPts,
      fillPolygonExpandDistance(s.size),
    );
    if (pointInPolygon(expanded, x, y)) return s;
  }
  // Brush loops: centerline polygon may not cover the visual interior — bbox fallback.
  let best: Stroke | null = null;
  let bestArea = Infinity;
  for (let i = 0; i < strokes.length; i++) {
    const s = strokes[i]!;
    if (s.brush === "eraser" || s.shapeKind) continue;
    if (s.points.length < 2) continue;
    if (!pointInInkBounds(s, x, y)) continue;
    const b = strokeInkBounds(s, 0);
    const area = (b.maxX - b.minX) * (b.maxY - b.minY);
    if (area < bestArea) {
      bestArea = area;
      best = s;
    }
  }
  return best;
}

/** True when another stroke's bounds sit inside `outer` (nested pocket art). */
function strokeHasNestedInk(outer: Stroke, strokes: Stroke[]): boolean {
  const ob = strokeInkBounds(outer, 0);
  for (const s of strokes) {
    if (s.id === outer.id || s.brush === "eraser") continue;
    const ib = strokeInkBounds(s, 0);
    if (
      ib.minX >= ob.minX &&
      ib.maxX <= ob.maxX &&
      ib.minY >= ob.minY &&
      ib.maxY <= ob.maxY
    ) {
      return true;
    }
  }
  return false;
}

/** All visible ink strokes on the stage (every layer) for bucket hit + raster fill. */
function collectBucketStrokes(project: Project, frameIndex: number): Stroke[] {
  const animatron = project.workflow === "animatron";
  const out: Stroke[] = [];
  for (const layer of project.layers) {
    if (!layer.visible) continue;
    const cel = animatron
      ? (layer.frames.find((f) => f) ?? null)
      : resolveCel(layer, frameIndex);
    if (cel) out.push(...cel.strokes);
  }
  return out;
}

interface Fit {
  scale: number;
  ox: number;
  oy: number;
}

interface ExpandingFill {
  points: StrokePoint[];
  color: string;
  startX: number;
  startY: number;
  startTime: number;
  /** Patch fill on an existing closed stroke when set. */
  targetStrokeId?: string;
  /** Solid artboard background fill when set. */
  canvasFill?: boolean;
  /**
   * Pixel-accurate pocket mask (draft space). Preferred over `points` for
   * nested regions so holes aren't painted over by a solid polygon.
   */
  mask?: FillMaskCrop;
  /** Pre-colored mask canvas for droplet preview (same pixels as commit). */
  maskCanvas?: HTMLCanvasElement;
  /** Mask already written to the project — animation is preview-only. */
  committed?: boolean;
}

export function StageCanvas() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const artRef = useRef<HTMLCanvasElement | null>(null);
  const fitRef = useRef<Fit>({ scale: 1, ox: 0, oy: 0 });
  const liveRef = useRef<{ stroke: Stroke; points: StrokePoint[] } | null>(null);
  const warpRef = useRef<{
    strokeId: string;
    handleIndex: number;
    handleType?: "node" | "handleIn" | "handleOut";
    selectedNodeIndices?: number[];
    startX: number;
    startY: number;
    origPoints: StrokePoint[];
    currentPoints: StrokePoint[];
    isBezier?: boolean;
    origBezierNodes?: NonNullable<Stroke["bezierNodes"]>;
    currentBezierNodes?: NonNullable<Stroke["bezierNodes"]>;
    isClosed?: boolean;
  } | null>(null);
  const motionEditRef = useRef<{
    layerId: string;
    pathId: string;
    nodeIndex: number;
    /** "node" moves the anchor + both handles; handleIn/Out edit curves */
    handleType: "node" | "handleIn" | "handleOut";
    startX: number;
    startY: number;
    origNodes: NonNullable<Stroke["bezierNodes"]>;
    /** live preview nodes while dragging (not in the store yet) */
    currentNodes: NonNullable<Stroke["bezierNodes"]>;
    dirty: boolean;
  } | null>(null);
  /** Path Maker draft: drag after click to pull bezier handles (pen UX). */
  const pathDraftDragRef = useRef(false);
  const moveRef = useRef<{
    ids: string[];
    startX: number;
    startY: number;
    dx: number;
    dy: number;
    snapshots: Map<string, StrokePoint[]>;
    bezierSnapshots: Map<string, BezierNode[]>;
    textSnapshots: Map<string, { x: number; y: number }>;
  } | null>(null);
  const dirtyRef = useRef(true);
  // Redraw when Camera reference or live image-transform preview changes.
  useEffect(() => {
    const unsubRef = useReference.subscribe(() => {
      dirtyRef.current = true;
    });
    const unsubLive = subscribeImageLivePreview(() => {
      dirtyRef.current = true;
    });
    const unsubTools = useTools.subscribe((s, prev) => {
      // Leaving select tears Leafer down — drop any stale live preview so
      // StageCanvas paints from project bounds (not a zero-size drag ghost).
      if (prev.tool === "select" && s.tool !== "select") {
        setImageLivePreview(null);
      }
      if (s.tool === "path" && prev.tool !== "path") {
        const selIds = useSelection.getState().ids;
        if (selIds.length) {
          const ps = useProject.getState();
          for (const layer of ps.project.layers) {
            if (!layer.visible) continue;
            const cel = celForLayer(ps.project, layer, ps.frameIndex);
            if (!cel) continue;
            for (const id of selIds) {
              const stroke = cel.strokes.find((st) => st.id === id);
              if (stroke && !stroke.bezierNodes && stroke.points.length >= 2) {
                useProject.getState().convertStrokeToBezier(id);
              }
            }
          }
        }
      }
      dirtyRef.current = true;
    });
    return () => {
      unsubRef();
      unsubLive();
      unsubTools();
    };
  }, []);
  const timerRef = useRef<{ kind: "raf" | "timeout"; id: number }>({ kind: "raf", id: 0 });
  const expandingFillRef = useRef<ExpandingFill | null>(null);
  /** Bucket hover target — navy @ 15% preview of what a click will fill. */
  const fillPreviewRef = useRef<{
    points: StrokePoint[];
    canvasFill?: boolean;
  } | null>(null);
  /** screen-space bbox of current selection for drag-to-move hit testing */
  const selBBoxRef = useRef<{
    x: number;
    y: number;
    w: number;
    h: number;
  } | null>(null);
  const marqueeRef = useRef<{
    startX: number;
    startY: number;
    currentX: number;
    currentY: number;
  } | null>(null);
  const panRef = useRef<{
    startX: number;
    startY: number;
    startPanX: number;
    startPanY: number;
  } | null>(null);
  const transformRef = useRef<{
    mode: "scale" | "rotate";
    ids: string[];
    pivotX: number;
    pivotY: number;
    startDist: number;
    startAngle: number;
    scale: number;
    rotation: number;
    snapshots: Map<
      string,
      { points: StrokePoint[]; size: number; bezierNodes?: BezierNode[] }
    >;
    textSnapshots: Map<string, TextElement>;
  } | null>(null);
  /** Text-only side-handle resize, distinct from the uniform corner scale. */
  const textResizeRef = useRef<{
    id: string;
    edge: "left" | "right";
    startX: number;
    startWidth: number;
    startTextX: number;
    width: number;
    textX: number;
  } | null>(null);
  const spaceRef = useRef(false);
  const ctrlRef = useRef(false);

  const [textEdit, setTextEdit] = useState<{
    id?: string;
    text: string;
    projectX: number;
    projectY: number;
    boxWidth?: number;
    rotation?: number;
  } | null>(null);
  const textEditRef = useRef(textEdit);
  textEditRef.current = textEdit;

  useEffect(() => {
    const canvas = canvasRef.current!;
    const ctx = canvas.getContext("2d")!;
    const pressure = new PressureTracker();
    let strokeStart = 0;
    let handleSpots: { strokeId: string; index: number; sx: number; sy: number; type?: "node" | "handleIn" | "handleOut" }[] = [];
    let transformSpots: { kind: "scale" | "rotate"; sx: number; sy: number }[] = [];
    let textWidthSpots: { id: string; edge: "left" | "right"; sx: number; sy: number }[] = [];
    let hoverPos: { x: number; y: number } | null = null;

    const artCanvas = document.createElement("canvas");
    artRef.current = artCanvas;
    const artCtx = artCanvas.getContext("2d")!;
    // per-cel scratch canvas so an eraser stroke only affects its own cel
    const celCanvas = document.createElement("canvas");
    const celCtx = celCanvas.getContext("2d")!;
    // draft-scale background canvas (color/gradient/image; shader = flat approx)
    const bgCanvas = document.createElement("canvas");
    const bgCtx = bgCanvas.getContext("2d")!;
    /** Cached draft paints of committed strokes (no live / warp / move). */
    const staticCelCache = new Map<string, HTMLCanvasElement>();

    function clearStaticCelCache() {
      staticCelCache.clear();
      clearBrushDraftCache();
    }

    function trimStaticCelCache() {
      if (staticCelCache.size <= STATIC_CEL_CACHE_LIMIT) return;
      const drop = staticCelCache.size - STATIC_CEL_CACHE_LIMIT;
      let i = 0;
      for (const k of staticCelCache.keys()) {
        staticCelCache.delete(k);
        if (++i >= drop) break;
      }
    }

    function projectSize() {
      const { width, height } = useProject.getState().project;
      return { pw: width, ph: height };
    }

    function resize() {
      const parent = canvas.parentElement!;
      if (parent.clientWidth === 0 || parent.clientHeight === 0) return; // layout not ready
      canvas.width = parent.clientWidth;
      canvas.height = parent.clientHeight;
      const { pw, ph } = projectSize();
      const { zoom, panX, panY } = useViewport.getState();
      const scale = Math.min(canvas.width / pw, canvas.height / ph) * 0.82 * zoom;
      fitRef.current = {
        scale,
        ox: (canvas.width - pw * scale) / 2 + panX,
        oy: (canvas.height - ph * scale) / 2 + panY,
      };
      artCanvas.width = Math.max(Math.round(pw * DRAFT_SCALE), 1);
      artCanvas.height = Math.max(Math.round(ph * DRAFT_SCALE), 1);
      celCanvas.width = artCanvas.width;
      celCanvas.height = artCanvas.height;
      bgCanvas.width = artCanvas.width;
      bgCanvas.height = artCanvas.height;
      clearStaticCelCache();
      dirtyRef.current = true;
    }

    function toProject(e: PointerEvent): { x: number; y: number } {
      const rect = canvas.getBoundingClientRect();
      let { scale, ox, oy } = fitRef.current;
      if (!(scale > 0)) {
        resize(); // recover from a zero-size boot race
        ({ scale, ox, oy } = fitRef.current);
        if (!(scale > 0)) return { x: 0, y: 0 };
      }
      return {
        x: (e.clientX - rect.left - ox) / scale,
        y: (e.clientY - rect.top - oy) / scale,
      };
    }

    /** render one cel's strokes into the scratch canvas, then composite */
    function compositeCel(
      strokes: Stroke[],
      texts: import("@/model/types").TextElement[] | undefined,
      images: ImageElement[] | undefined,
      livePoints: StrokePoint[] | null,
      liveStroke: Stroke | null,
      alpha: number,
      colorOverride?: string,
      displaced?: Map<string, StrokePoint[]>,
      displacedBezier?: Map<string, import("@/model/types").BezierNode[]>,
      skipTextId?: string,
      skipImageId?: string,
    ) {
      const liveImg = getImageLivePreview();
      // Never memoize cels that contain images — empty-blit cache races made
      // placed photos vanish after tool switches / HMR.
      const canCacheBase =
        !displaced &&
        !displacedBezier &&
        !liveImg &&
        !(images && images.length > 0);
      const baseKey = canCacheBase
        ? celContentKey(strokes, texts, images, colorOverride, skipTextId, skipImageId)
        : null;

      if (baseKey) {
        let base = staticCelCache.get(baseKey);
        if (!base) {
          base = document.createElement("canvas");
          base.width = celCanvas.width;
          base.height = celCanvas.height;
          const bctx = base.getContext("2d")!;
          bctx.setTransform(DRAFT_SCALE, 0, 0, DRAFT_SCALE, 0, 0);
          bctx.clearRect(0, 0, base.width / DRAFT_SCALE, base.height / DRAFT_SCALE);
          let imagesReady = true;
          if (images?.length) {
            imagesReady = renderImages(bctx, images, {
              skipId: skipImageId,
              onImageReady: () => {
                clearStaticCelCache();
                dirtyRef.current = true;
              },
            });
          }
          renderStrokes(bctx, strokes, {
            quality: "draft",
            colorOverride,
          });
          if (texts) {
            renderTexts(bctx, texts, {
              quality: "draft",
              colorOverride,
              skipId: skipTextId,
              onFontReady: () => {
                clearStaticCelCache();
                dirtyRef.current = true;
              },
            });
          }
          // Never memoize a cel that still has undecoded images — that freezes
          // an empty blit until the next unrelated invalidation.
          if (imagesReady) {
            staticCelCache.set(baseKey, base);
            trimStaticCelCache();
          } else {
            // Keep the loop hot until decode finishes (load may have already fired).
            dirtyRef.current = true;
          }
        }
        celCtx.setTransform(1, 0, 0, 1, 0, 0);
        celCtx.clearRect(0, 0, celCanvas.width, celCanvas.height);
        celCtx.drawImage(base, 0, 0);
        if (liveStroke && livePoints) {
          celCtx.setTransform(DRAFT_SCALE, 0, 0, DRAFT_SCALE, 0, 0);
          renderStroke(
            celCtx,
            liveStroke,
            { quality: "draft", live: true },
            livePoints,
          );
        }
      } else {
        celCtx.setTransform(DRAFT_SCALE, 0, 0, DRAFT_SCALE, 0, 0);
        celCtx.clearRect(0, 0, celCanvas.width / DRAFT_SCALE, celCanvas.height / DRAFT_SCALE);
        if (images?.length) {
          renderImages(celCtx, images, {
            skipId: skipImageId,
            onImageReady: () => {
              dirtyRef.current = true;
            },
          });
        }
        renderStrokes(celCtx, strokes, {
          quality: "draft",
          colorOverride,
          displaced,
          displacedBezier,
        });
        if (texts) {
          renderTexts(celCtx, texts, {
            quality: "draft",
            colorOverride,
            skipId: skipTextId,
            onFontReady: () => {
              dirtyRef.current = true;
            },
          });
        }
        if (liveStroke && livePoints)
          renderStroke(
            celCtx,
            liveStroke,
            { quality: "draft", live: true },
            livePoints,
          );
      }

      artCtx.save();
      artCtx.setTransform(1, 0, 0, 1, 0, 0);
      artCtx.globalAlpha = alpha;
      artCtx.drawImage(celCanvas, 0, 0);
      artCtx.restore();
    }

    const bucketFillCanvas = document.createElement("canvas");

    /** Flood-fill the rendered stage bitmap — all visible layers. */
    function rasterBucketRegion(
      project: Project,
      frameIndex: number,
      x: number,
      y: number,
      pw: number,
      ph: number,
    ): {
      points: StrokePoint[];
      filledRatio: number;
      pixelCount: number;
      mask?: FillMaskCrop;
    } | null {
      const animatron = project.workflow === "animatron";
      bucketFillCanvas.width = Math.max(Math.round(pw * DRAFT_SCALE), 1);
      bucketFillCanvas.height = Math.max(Math.round(ph * DRAFT_SCALE), 1);
      const fctx = bucketFillCanvas.getContext("2d")!;
      fctx.setTransform(DRAFT_SCALE, 0, 0, DRAFT_SCALE, 0, 0);
      fctx.clearRect(0, 0, pw, ph);
      // Bucket flood-fill needs a high-contrast ink mask: solid paper + black
      // ink. Display colors (e.g. white strokes on light/transparent paper) must
      // not be treated as empty — otherwise pockets bleed into each other.
      fctx.fillStyle = "#ffffff";
      fctx.fillRect(0, 0, pw, ph);
      let maxStroke = 4;
      for (const layer of project.layers) {
        if (!layer.visible) continue;
        const cel = animatron
          ? (layer.frames.find((f) => f) ?? null)
          : resolveCel(layer, frameIndex);
        if (!cel) continue;
        for (const s of cel.strokes) maxStroke = Math.max(maxStroke, s.size);
        // Barriers only — strip fills so nested pockets stay separate regions.
        const barrierStrokes = cel.strokes.map((s) =>
          s.brush === "eraser"
            ? s
            : { ...s, color: "#000000", fillColor: undefined },
        );
        renderStrokes(fctx, barrierStrokes, { quality: "draft" });
        if (cel.texts?.length) {
          renderTexts(fctx, cel.texts, {
            quality: "draft",
            colorOverride: "#000000",
          });
        }
        if (cel.images?.length) {
          renderImages(fctx, cel.images, {});
        }
      }
      fctx.setTransform(1, 0, 0, 1, 0, 0);
      const sealPx = Math.max(2, Math.ceil(maxStroke * DRAFT_SCALE * 0.45));
      const shiftPx = Math.max(1, Math.ceil(fillShiftEdgeDistance(maxStroke) * DRAFT_SCALE));
      const featherPx = Math.max(1, Math.ceil(fillFeatherDistance(maxStroke) * DRAFT_SCALE));
      sealInkGaps(fctx, sealPx);
      const px = Math.floor(x * DRAFT_SCALE);
      const py = Math.floor(y * DRAFT_SCALE);
      const result = computeFloodFill(fctx, px, py, 48, {
        shiftPx,
        featherPx,
      });
      // #region agent log
      if(import.meta.env.DEV){const w=window as Window&{__laoBucketDebug?:unknown[]};(w.__laoBucketDebug??=[]).push({message:'rasterBucketRegion',px,py,sealPx,boundaryN:result?.boundary.length??0,pixelCount:result?.pixelCount??0,hasMask:!!result?.mask,ok:!!(result&&(result.boundary.length>=3||result.mask))});}
      // #endregion
      // Prefer mask even when polygon contour collapses (nested pockets).
      if (!result || (!result.mask && result.boundary.length < 3)) return null;
      const canvasPixels = bucketFillCanvas.width * bucketFillCanvas.height;
      const points =
        result.boundary.length >= 3
          ? result.boundary.map((p) => ({
              x: p.x / DRAFT_SCALE,
              y: p.y / DRAFT_SCALE,
              pressure: 0.5,
              t: 0,
            }))
          : [
              {
                x: result.offsetX / DRAFT_SCALE,
                y: result.offsetY / DRAFT_SCALE,
                pressure: 0.5,
                t: 0,
              },
              {
                x: (result.offsetX + result.width) / DRAFT_SCALE,
                y: result.offsetY / DRAFT_SCALE,
                pressure: 0.5,
                t: 0,
              },
              {
                x: (result.offsetX + result.width) / DRAFT_SCALE,
                y: (result.offsetY + result.height) / DRAFT_SCALE,
                pressure: 0.5,
                t: 0,
              },
              {
                x: result.offsetX / DRAFT_SCALE,
                y: (result.offsetY + result.height) / DRAFT_SCALE,
                pressure: 0.5,
                t: 0,
              },
            ];
      return {
        points,
        filledRatio: result.pixelCount / canvasPixels,
        pixelCount: result.pixelCount,
        mask: result.mask,
      };
    }

    // rAF doesn't fire in hidden tabs — fall back to a timer so drawing state
    // (and headless verification) never freezes.
    function scheduleNext() {
      if (document.hidden) {
        timerRef.current = { kind: "timeout", id: window.setTimeout(draw, 33) };
      } else {
        timerRef.current = { kind: "raf", id: requestAnimationFrame(draw) };
      }
    }
    function cancelScheduled() {
      if (timerRef.current.kind === "raf") cancelAnimationFrame(timerRef.current.id);
      else window.clearTimeout(timerRef.current.id);
    }

    function draw() {
      scheduleNext();
      if (!dirtyRef.current) return;
      dirtyRef.current = false;

      const { pw, ph } = projectSize();
      const { scale, ox, oy } = fitRef.current;

      // --- art canvas: all visible layers' cels at draft scale, aliased ---
      const ps = useProject.getState();
      const pb = usePlayback.getState();
      const tools = useTools.getState();
      artCtx.setTransform(1, 0, 0, 1, 0, 0);
      artCtx.clearRect(0, 0, artCanvas.width, artCanvas.height);

      // onion ghosts: previous frames' cels on the active layer
      const activeLayer = ps.project.layers[ps.layerIndex];
      if (pb.onionSkin && !pb.playing && activeLayer && !activeLayer.isStatic) {
        const curIdx = resolveCelIndex(activeLayer, ps.frameIndex);
        let lastRenderedCelIndex = curIdx;
        let celsFound = 0;
        
        for (let step = 1; step <= pb.onionRange && celsFound < pb.onionRange; step++) {
          let i = ps.frameIndex - step;
          if (i < 0) break;

          const prevIdx = resolveCelIndex(activeLayer, i);
          if (prevIdx !== null && prevIdx !== lastRenderedCelIndex) {
            const ghost = activeLayer.frames[prevIdx]!;
            const stepOpacity = pb.onionOpacity * (1 - celsFound / pb.onionRange);
            if (
              stepOpacity > 0 &&
              (ghost.strokes.length > 0 ||
                (ghost.texts && ghost.texts.length > 0) ||
                (ghost.images && ghost.images.length > 0))
            ) {
              compositeCel(
                ghost.strokes,
                ghost.texts,
                ghost.images,
                null,
                null,
                stepOpacity,
                pb.onionColor,
              );
            }
            lastRenderedCelIndex = prevIdx;
            celsFound++;
          }
        }
      }

      const live = liveRef.current;
      const warp = warpRef.current;
      const move = moveRef.current;
      const xf = transformRef.current;
      const animatron = ps.project.workflow === "animatron";
      const timeMs = (ps.frameIndex / Math.max(ps.project.fps, 1)) * 1000;
      ps.project.layers.forEach((layer, li) => {
        if (!layer.visible) return;
        const cel = animatron
          ? layer.frames.find((f) => f) ?? null
          : resolveCel(layer, ps.frameIndex);
        const isTarget = li === ps.layerIndex;
        if (!cel && !(isTarget && live)) return;
        let strokes = cel?.strokes ?? [];
        const layerHasXfIds =
          cel &&
          (cel.strokes.some((s) => xf?.ids.includes(s.id)) ||
            (cel.texts?.some((t) => xf?.ids.includes(t.id)) ?? false));
        if (xf && layerHasXfIds) {
          strokes = strokes.map((s) => {
            if (!xf.ids.includes(s.id)) return s;
            const snap = xf.snapshots.get(s.id);
            if (!snap) return s;
            const next: Stroke = {
              ...s,
              points: transformPoints(
                snap.points,
                xf.pivotX,
                xf.pivotY,
                xf.scale,
                xf.rotation,
              ),
              size: Math.max(0.5, snap.size * xf.scale),
            };
            if (snap.bezierNodes?.length) {
              next.bezierNodes = transformBezierNodes(
                snap.bezierNodes,
                xf.pivotX,
                xf.pivotY,
                xf.scale,
                xf.rotation,
              );
              next.points = flattenBezierNodes(next.bezierNodes, s.closed);
            } else {
              // Avoid stale bezierNodes winning over transformed points.
              next.bezierNodes = undefined;
            }
            return next;
          });
        }
        let texts = cel?.texts ?? [];
        if (xf && layerHasXfIds) {
          texts = texts.map((t) => {
            if (!xf.ids.includes(t.id)) return t;
            const snap = xf.textSnapshots.get(t.id);
            if (!snap) return t;
            const box = measureTextBox(celCtx, snap);
            const geo = transformTextElement(
              snap,
              box,
              xf.pivotX,
              xf.pivotY,
              xf.scale,
              xf.rotation,
            );
            // Keep live style props (bold/italic/…) from the project text.
            return {
              ...t,
              x: geo.x,
              y: geo.y,
              size: geo.size,
              boxWidth: geo.boxWidth,
              rotation: geo.rotation,
            };
          });
        }
        if (animatron) {
          const selected = new Set(useSelection.getState().ids);
          const showFullDrawing = pb.showFullStrokes;
          strokes = strokes
            .map((s) => {
              if (selected.has(s.id)) return s;
              if (showFullDrawing) return s;
              const pts = strokeAtTime(s, timeMs);
              if (!pts) return null;
              return strokeWithClipPoints(s, pts);
            })
            .filter((s): s is Stroke => !!s);
          texts = texts
            .map((t) => {
              if (selected.has(t.id)) return t;
              if (showFullDrawing) return t;
              const content = textContentAtTime(t, timeMs);
              if (content == null) return null;
              return content === t.text ? t : { ...t, text: content };
            })
            .filter((t): t is import("@/model/types").TextElement => !!t);
        }
        let images = cel?.images ?? [];
        if (animatron && !pb.showFullStrokes) {
          images = images.filter((im) => {
            const c = im.clip;
            if (!c) return true;
            // Match stroke clips: hidden before start, held after duration.
            return timeMs >= c.startMs;
          });
        }
        // Leafer owns the selected shape while select-tool editor is up — hide
        // canvas duplicate. Squircle corners are baked into stroke points and
        // Leafer Rect can't draw them, so keep canvas paint in that case.
        // Canvas images always paint here (artboard clip + export parity). Leafer
        // only adds transform chrome on top while selected — never skip the blit
        // or the bitmap vanishes the moment the user leaves the select tool.
        if (
          isTarget &&
          tools.tool === "select" &&
          !textEditRef.current
        ) {
          const ids = useSelection.getState().ids;
          if (ids.length === 1) {
            const hit = (cel?.strokes ?? []).find((s) => s.id === ids[0]);
            if (hit && canEditShapeWithLeafer(hit) && !hit.squircle) {
              // Line/arrow ink (+ arrow head) stays on canvas; Leafer proxy is
              // near-invisible chrome only (no @leafer-in/arrow plugin).
              if (hit.shapeKind !== "line" && hit.shapeKind !== "arrow") {
                strokes = strokes.filter((s) => s.id !== hit.id);
              }
            }
          }
        }
        const workflow = ps.project.workflow ?? "animatron";
        // Path Maker: pose art on Draw scrub/play (parity with paintProjectFrame).
        const hasMotion =
          PATH_MAKER_ENABLED &&
          !!(layer.motionAssignments?.length && layer.motionPaths?.length);
        const motion = hasMotion
          ? layerMotionAt(layer, timeMs, ps.frameIndex, workflow)
          : null;
        if (motion) {
          texts = texts.map((t) => {
            const hit = motion.get(t.id);
            if (!hit) return t;
            const p = applyMotionPoseToPoint(
              { x: t.x, y: t.y },
              hit.assignment.anchor,
              hit.pose,
            );
            return {
              ...t,
              x: p.x,
              y: p.y,
              rotation: (t.rotation ?? 0) + hit.pose.angleRad,
            };
          });
          images = images.map((im) => {
            const hit = motion.get(im.id);
            if (!hit) return im;
            const tl = applyMotionPoseToPoint(
              { x: im.x, y: im.y },
              hit.assignment.anchor,
              hit.pose,
            );
            return {
              ...im,
              x: tl.x,
              y: tl.y,
              rotation: (im.rotation ?? 0) + hit.pose.angleRad,
            };
          });
        }
        const displaced = new Map<string, StrokePoint[]>();
        const displacedBezier = new Map<string, import("@/model/types").BezierNode[]>();
        const motionDisp = hasMotion
          ? motionDisplacement(
              layer,
              strokes,
              timeMs,
              ps.frameIndex,
              workflow,
              motion,
            )
          : null;
        if (motionDisp) {
          for (const [id, pts] of motionDisp) displaced.set(id, pts);
        }
        // Boil / jitter — deterministic per frame (preview === export).
        // Mute while Path tool is active so handles don't sit on a boiling stroke.
        if (tools.tool !== "path") {
          const boilMap = boilDisplacement(strokes, ps.frameIndex, ps.project.boil);
          for (const [id, pts] of boilMap) {
            if (!displaced.has(id)) displaced.set(id, pts);
          }
        }
        if (warp && isTarget) {
          if (warp.isBezier && warp.currentBezierNodes) {
            displacedBezier.set(warp.strokeId, warp.currentBezierNodes);
            // Keep pack-brush / point consumers in sync with node drags.
            displaced.set(
              warp.strokeId,
              flattenBezierNodes(warp.currentBezierNodes, !!warp.isClosed),
            );
          } else {
            displaced.set(warp.strokeId, warp.currentPoints);
          }
        }
        if (move) {
          const layerHasMoveIds =
            cel &&
            (cel.strokes.some((s) => move.ids.includes(s.id)) ||
              (cel.texts?.some((t) => move.ids.includes(t.id)) ?? false) ||
              (cel.images?.some((im) => move.ids.includes(im.id)) ?? false));
          if (layerHasMoveIds) {
            for (const id of move.ids) {
              const orig = move.snapshots.get(id);
              if (orig) displaced.set(id, translatePoints(orig, move.dx, move.dy));
              const bez = move.bezierSnapshots.get(id);
              if (bez) {
                displacedBezier.set(
                  id,
                  translateBezierNodes(bez, move.dx, move.dy),
                );
              }
            }
            texts = texts.map((t) => {
              if (!move.ids.includes(t.id)) return t;
              const snap = move.textSnapshots?.get(t.id);
              if (!snap) return t;
              return {
                ...t,
                x: snap.x + move.dx,
                y: snap.y + move.dy,
              };
            });
          }
        }
        const textResize = textResizeRef.current;
        if (textResize && isTarget) {
          texts = texts.map((t) =>
            t.id === textResize.id
              ? { ...t, x: textResize.textX, boxWidth: textResize.width }
              : t,
          );
        }
        compositeCel(
          strokes,
          texts,
          images,
          isTarget && live ? live.points : null,
          isTarget && live ? live.stroke : null,
          1,
          undefined,
          displaced.size ? displaced : undefined,
          displacedBezier.size ? displacedBezier : undefined,
          textEditRef.current?.id,
        );
      });

      // --- stage ---
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.fillStyle = "#0b0b0d";
      ctx.fillRect(0, 0, canvas.width, canvas.height);

      // artboard: project background, or checkerboard when none
      bgCtx.setTransform(DRAFT_SCALE, 0, 0, DRAFT_SCALE, 0, 0);
      bgCtx.clearRect(0, 0, pw, ph);
      const shaderCanvas =
        ps.project.background?.kind === "shader"
          ? getShaderSnapshotCanvas()
          : null;
      const imageFilterCanvas = hasImageFilter(ps.project.background)
        ? getImageFilterSnapshotCanvas()
        : null;
      const hasBg = paintBackground(bgCtx, ps.project, {
        onImageReady: () => (dirtyRef.current = true),
        shaderCanvas,
        imageFilterCanvas,
      });
      // Session reference ghost (Camera) — under strokes, never exported.
      const refState = useReference.getState();
      let hasRef = false;
      if (refState.url && refState.kind === "image") {
        const refImg = cachedImage(refState.url);
        if (refImg?.complete && refImg.naturalWidth > 0) {
          if (!hasBg) {
            // Checker under the ghost when there's no project background.
            bgCtx.fillStyle = "#141416";
            bgCtx.fillRect(0, 0, pw, ph);
            bgCtx.fillStyle = "#1c1c1f";
            const cell = 24;
            for (let y = 0; y * cell < ph; y++)
              for (let x = 0; x * cell < pw; x++)
                if ((x + y) % 2 === 0) bgCtx.fillRect(x * cell, y * cell, cell, cell);
          }
          bgCtx.save();
          bgCtx.globalAlpha = refState.opacity;
          drawImageFitted(
            bgCtx,
            refImg,
            refImg.naturalWidth,
            refImg.naturalHeight,
            pw,
            ph,
            refState.fit,
            refState.position,
            refState.zoom,
          );
          bgCtx.restore();
          hasRef = true;
        } else if (refImg && !refImg.complete) {
          refImg.addEventListener(
            "load",
            () => {
              dirtyRef.current = true;
            },
            { once: true },
          );
        }
      }
      // Keep redrawing so the artboard tracks live WebGL snapshots.
      if (
        ps.project.background?.kind === "shader" ||
        hasImageFilter(ps.project.background)
      ) {
        dirtyRef.current = true;
      }

      const bx = ox, by = oy, bw = pw * scale, bh = ph * scale;
      // Visual 12px corner radius on the artboard (screen px ≈ canvas px here).
      const artRadius = Math.min(12, bw / 2, bh / 2);
      const artboardPath = () => {
        ctx.beginPath();
        if (typeof ctx.roundRect === "function") {
          ctx.roundRect(bx, by, bw, bh, artRadius);
        } else {
          ctx.rect(bx, by, bw, bh);
        }
      };
      ctx.save();
      artboardPath();
      ctx.clip();
      // aliased on purpose in edit mode
      ctx.imageSmoothingEnabled = false;
      if (hasBg || hasRef) {
        ctx.drawImage(bgCanvas, bx, by, bw, bh);
      } else {
        ctx.fillStyle = "#141416";
        ctx.fillRect(bx, by, bw, bh);
        ctx.fillStyle = "#1c1c1f";
        const cell = 24;
        for (let y = 0; y * cell < bh; y++)
          for (let x = 0; x * cell < bw; x++)
            if ((x + y) % 2 === 0) ctx.fillRect(bx + x * cell, by + y * cell, cell, cell);
      }
      ctx.drawImage(artCanvas, bx, by, bw, bh);

      // --- bucket hover preview (navy @ 15%) ---
      if (
        tools.tool === "fill" &&
        !expandingFillRef.current &&
        fillPreviewRef.current &&
        fillPreviewRef.current.points.length > 2
      ) {
        const prev = fillPreviewRef.current;
        ctx.save();
        ctx.beginPath();
        ctx.moveTo(bx + prev.points[0]!.x * scale, by + prev.points[0]!.y * scale);
        for (let i = 1; i < prev.points.length; i++) {
          ctx.lineTo(bx + prev.points[i]!.x * scale, by + prev.points[i]!.y * scale);
        }
        ctx.closePath();
        ctx.fillStyle = FILL_PREVIEW_RGBA;
        ctx.fill();
        ctx.restore();
      }

      // --- droplet expand fill (bucket) ---
      if (expandingFillRef.current) {
        const ef = expandingFillRef.current;
        const elapsed = performance.now() - ef.startTime;
        const duration = 520;
        const t = Math.min(1, elapsed / duration);
        // Ease-out so it reads as a drop blooming into the region.
        const eased = 1 - (1 - t) ** 3;
        const maxDist = Math.hypot(pw, ph);
        const radius = Math.max(6, eased * maxDist * 1.2);

        ctx.save();
        // Soft droplet bloom at the click, then clip the fill region.
        ctx.beginPath();
        ctx.arc(
          bx + ef.startX * scale,
          by + ef.startY * scale,
          radius * scale,
          0,
          Math.PI * 2,
        );
        ctx.clip();

        ctx.globalAlpha = 0.35 + 0.65 * eased;
        if (ef.mask && ef.maskCanvas) {
          ctx.drawImage(
            ef.maskCanvas,
            bx + (ef.mask.offsetX / DRAFT_SCALE) * scale,
            by + (ef.mask.offsetY / DRAFT_SCALE) * scale,
            (ef.mask.width / DRAFT_SCALE) * scale,
            (ef.mask.height / DRAFT_SCALE) * scale,
          );
        } else if (ef.points.length > 0) {
          ctx.beginPath();
          ctx.moveTo(bx + ef.points[0].x * scale, by + ef.points[0].y * scale);
          for (let i = 1; i < ef.points.length; i++) {
            ctx.lineTo(bx + ef.points[i].x * scale, by + ef.points[i].y * scale);
          }
          ctx.closePath();
          ctx.fillStyle = ef.color;
          ctx.fill();
        }
        ctx.restore();

        if (t >= 1) {
          if (ef.targetStrokeId) {
            useProject.getState().updateStrokes([ef.targetStrokeId], {
              fillColor: ef.color,
              closed: true,
            });
            useTools.getState().setFillColor(ef.color);
          } else if (ef.canvasFill) {
            useProject.getState().setProjectSettings({
              background: { kind: "color", color: ef.color },
            });
            useTools.getState().setColor(ef.color);
          } else if (ef.mask && !ef.committed) {
            const src = colorizeFillMask(ef.mask, ef.color);
            // #region agent log
            fetch('http://127.0.0.1:7909/ingest/7ebb56b9-5cd9-4d66-91ca-3dd1d33513ee',{method:'POST',headers:{'Content-Type':'application/json','X-Debug-Session-Id':'07ea42'},body:JSON.stringify({sessionId:'07ea42',location:'StageCanvas.tsx:expandingFillDone',message:'mask fill commit',data:{hasSrc:!!src,mw:ef.mask.width,mh:ef.mask.height,ox:ef.mask.offsetX,oy:ef.mask.offsetY,color:ef.color},timestamp:Date.now(),hypothesisId:'H-nest-mask',runId:'nested-mask'})}).catch(()=>{});
            if(import.meta.env.DEV){const w=window as Window&{__laoBucketDebug?:unknown[]};(w.__laoBucketDebug??=[]).push({message:'mask fill commit',hasSrc:!!src,mw:ef.mask.width,mh:ef.mask.height});}
            // #endregion
            if (src) {
              useProject.getState().addImageToActiveCel({
                id: crypto.randomUUID(),
                src,
                x: ef.mask.offsetX / DRAFT_SCALE,
                y: ef.mask.offsetY / DRAFT_SCALE,
                w: ef.mask.width / DRAFT_SCALE,
                h: ef.mask.height / DRAFT_SCALE,
                naturalWidth: ef.mask.width,
                naturalHeight: ef.mask.height,
                opacity: 1,
                lockAspect: true,
              });
              useTools.getState().setFillColor(ef.color);
            }
          } else {
            const stroke: Stroke = {
              id: crypto.randomUUID(),
              brush: "ink",
              color: "transparent",
              fillColor: ef.color,
              size: 1,
              points: ef.points,
              seed: Math.floor(Math.random() * 2 ** 31),
              jitter: false,
              grain: false,
              closed: true,
            };
            useProject.getState().addStroke(stroke);
          }
          expandingFillRef.current = null;
          dirtyRef.current = true;
        } else {
          dirtyRef.current = true;
        }
      }

      ctx.restore();

      ctx.strokeStyle = "#2b5cff";
      ctx.lineWidth = 1.5;
      artboardPath();
      ctx.stroke();

      // --- selection overlay (select tool) ---
      handleSpots = [];
      transformSpots = [];
      textWidthSpots = [];
      selBBoxRef.current = null;
      try {
        const selIds = useSelection.getState().ids;
        const selIdSet = new Set(selIds);
        const selStrokes: import("@/model/types").Stroke[] = [];
        const selTexts: import("@/model/types").TextElement[] = [];
        const selImages: import("@/model/types").ImageElement[] = [];
        if (selIds.length) {
          for (const layer of ps.project.layers) {
            if (!layer.visible) continue;
            const cel = celForLayer(ps.project, layer, ps.frameIndex);
            if (!cel) continue;
            selStrokes.push(...cel.strokes.filter((s) => selIdSet.has(s.id)));
            if (cel.texts) {
              selTexts.push(...cel.texts.filter((t) => selIdSet.has(t.id)));
            }
            if (cel.images) {
              selImages.push(...cel.images.filter((im) => selIdSet.has(im.id)));
            }
          }
        }
        if (selIds.length && (selStrokes.length || selTexts.length || selImages.length)) {
          const ptsOf = (s: import("@/model/types").Stroke) => {
            if (move && move.ids.includes(s.id)) {
              const orig = move.snapshots.get(s.id);
              if (orig) return translatePoints(orig, move.dx, move.dy);
            }
            if (warp && warp.strokeId === s.id) return warp.currentPoints;
            return s.points ?? [];
          };
          const allPts: StrokePoint[] = [];
          for (const s of selStrokes) allPts.push(...ptsOf(s));
          let bounds = pointsBounds(allPts);
          if (selTexts.length > 0) {
            let minX = bounds ? bounds.minX : Infinity;
            let minY = bounds ? bounds.minY : Infinity;
            let maxX = bounds ? bounds.maxX : -Infinity;
            let maxY = bounds ? bounds.maxY : -Infinity;
            
            for (const t of selTexts) {
              let tt = t;
              if (move && move.textSnapshots && move.textSnapshots.has(t.id)) {
                const snap = move.textSnapshots.get(t.id)!;
                tt = { ...t, x: snap.x + move.dx, y: snap.y + move.dy };
              }
              if (xf && xf.textSnapshots && xf.textSnapshots.has(t.id)) {
                const snap = xf.textSnapshots.get(t.id)!;
                const box = measureTextBox(celCtx, snap);
                tt = transformTextElement(
                  snap,
                  box,
                  xf.pivotX,
                  xf.pivotY,
                  xf.scale,
                  xf.rotation,
                );
              }
              const aabb = textAABB(celCtx, tt);
              if (aabb.minX < minX) minX = aabb.minX;
              if (aabb.minY < minY) minY = aabb.minY;
              if (aabb.maxX > maxX) maxX = aabb.maxX;
              if (aabb.maxY > maxY) maxY = aabb.maxY;
            }
            if (minX !== Infinity) bounds = { minX, minY, maxX, maxY };
          }
          
          // Only hide StageCanvas chrome while Leafer owns the selection UI.
          // V/select must keep showing the Framer-style purple text box for text.
          // Shape-tool strokes (shapeKind) always use Leafer — never the blue dash.
          const leaferOwnsTextUi = !!textEditRef.current;
          const leaferOwnsImageUi =
            !leaferOwnsTextUi &&
            selImages.length === 1 &&
            selStrokes.length === 0 &&
            selTexts.length === 0;
          const leaferOwnsShapeUi =
            !leaferOwnsTextUi &&
            !leaferOwnsImageUi &&
            selStrokes.length === 1 &&
            selTexts.length === 0 &&
            canEditShapeWithLeafer(selStrokes[0]!);
          const textOnly =
            selTexts.length > 0 && selStrokes.length === 0 && selIds.every(
              (id) => selTexts.some((t) => t.id === id),
            );

          // Selected image: 10% opacity outlayer beyond the artboard + dotted bounds.
          if (leaferOwnsImageUi) {
            const im = resolveImageDrawBox(selImages[0]!);
            paintSelectedImageOverflowGhost(
              ctx,
              im,
              ps.project.width,
              ps.project.height,
              { scale, ox: bx, oy: by },
              canvas.width,
              canvas.height,
            );
            if (
              imageOverflowsArtboard(im, ps.project.width, ps.project.height)
            ) {
              ctx.save();
              ctx.strokeStyle = "rgba(167,139,250,0.85)";
              ctx.lineWidth = 1.25 / Math.max(scale, 0.001);
              ctx.setLineDash([
                5 / Math.max(scale, 0.001),
                4 / Math.max(scale, 0.001),
              ]);
              const cx = im.x + im.w / 2;
              const cy = im.y + im.h / 2;
              const rot = im.rotation ?? 0;
              ctx.translate(bx + cx * scale, by + cy * scale);
              ctx.rotate(rot);
              ctx.strokeRect(
                (-im.w / 2) * scale,
                (-im.h / 2) * scale,
                im.w * scale,
                im.h * scale,
              );
              ctx.restore();
            }
          }

          if (
            bounds &&
            tools.tool !== "path" &&
            !leaferOwnsTextUi &&
            !leaferOwnsShapeUi &&
            !leaferOwnsImageUi
          ) {
            const pad = textOnly ? 4 : 8;
            const rx = bx + bounds.minX * scale - pad;
            const ry = by + bounds.minY * scale - pad;
            const rw = (bounds.maxX - bounds.minX) * scale + pad * 2;
            const rh = (bounds.maxY - bounds.minY) * scale + pad * 2;
            selBBoxRef.current = { x: rx, y: ry, w: rw, h: rh };

            // Framer-style text selection: solid lavender border, circle corners, side pills.
            const TEXT_SEL = "#A78BFA";
            if (textOnly) {
              ctx.strokeStyle = TEXT_SEL;
              ctx.lineWidth = 2;
              ctx.setLineDash([]);
              ctx.strokeRect(rx + 0.5, ry + 0.5, rw - 1, rh - 1);

              const text = selTexts[0];
              let tt = text;
              if (move && move.textSnapshots && move.textSnapshots.has(text.id)) {
                const snap = move.textSnapshots.get(text.id)!;
                tt = { ...text, x: snap.x + move.dx, y: snap.y + move.dy };
              }
              const aabb = textAABB(celCtx, tt);
              const midY = by + ((aabb.minY + aabb.maxY) / 2) * scale;
              const leftX = rx;
              const rightX = rx + rw;
              const spots = [
                { id: text.id, edge: "left" as const, sx: leftX, sy: midY },
                { id: text.id, edge: "right" as const, sx: rightX, sy: midY },
              ];
              textWidthSpots.push(...spots);
              for (const spot of spots) {
                ctx.fillStyle = "#ffffff";
                ctx.strokeStyle = TEXT_SEL;
                ctx.lineWidth = 1.5;
                const pw = 6;
                const ph = 14;
                const r = 3;
                const x0 = spot.sx - pw / 2;
                const y0 = spot.sy - ph / 2;
                ctx.beginPath();
                ctx.moveTo(x0 + r, y0);
                ctx.arcTo(x0 + pw, y0, x0 + pw, y0 + ph, r);
                ctx.arcTo(x0 + pw, y0 + ph, x0, y0 + ph, r);
                ctx.arcTo(x0, y0 + ph, x0, y0, r);
                ctx.arcTo(x0, y0, x0 + pw, y0, r);
                ctx.closePath();
                ctx.fill();
                ctx.stroke();
              }

              const corners = [
                { sx: rx, sy: ry },
                { sx: rx + rw, sy: ry },
                { sx: rx, sy: ry + rh },
                { sx: rx + rw, sy: ry + rh },
              ];
              for (const c of corners) {
                transformSpots.push({ kind: "scale", sx: c.sx, sy: c.sy });
                ctx.fillStyle = "#ffffff";
                ctx.strokeStyle = TEXT_SEL;
                ctx.lineWidth = 1.5;
                ctx.beginPath();
                ctx.arc(c.sx, c.sy, 4.5, 0, Math.PI * 2);
                ctx.fill();
                ctx.stroke();
              }
            } else {
              ctx.strokeStyle = "#2b5cff";
              ctx.lineWidth = 1.2;
              ctx.setLineDash([5, 4]);
              ctx.strokeRect(rx, ry, rw, rh);
              ctx.setLineDash([]);

              const cx = bx + ((bounds.minX + bounds.maxX) / 2) * scale;
              const corners = [
                { sx: bx + bounds.minX * scale, sy: by + bounds.minY * scale },
                { sx: bx + bounds.maxX * scale, sy: by + bounds.minY * scale },
                { sx: bx + bounds.minX * scale, sy: by + bounds.maxY * scale },
                { sx: bx + bounds.maxX * scale, sy: by + bounds.maxY * scale },
              ];
              for (const c of corners) {
                transformSpots.push({ kind: "scale", sx: c.sx, sy: c.sy });
                ctx.fillStyle = "#0e0e11";
                ctx.strokeStyle = "#2b5cff";
                ctx.lineWidth = 1.2;
                ctx.beginPath();
                ctx.rect(c.sx - 4, c.sy - 4, 8, 8);
                ctx.fill();
                ctx.stroke();
              }
              const topY = by + bounds.minY * scale;
              transformSpots.push({ kind: "rotate", sx: cx, sy: topY - 28 });
              ctx.beginPath();
              ctx.moveTo(cx, topY);
              ctx.lineTo(cx, topY - 28);
              ctx.stroke();
              ctx.beginPath();
              ctx.arc(cx, topY - 28, 5, 0, Math.PI * 2);
              ctx.fillStyle = "#0e0e11";
              ctx.fill();
              ctx.stroke();
            }
          } else if (leaferOwnsTextUi || leaferOwnsShapeUi || leaferOwnsImageUi) {
            selBBoxRef.current = null;
          }
          // warp handles for selected strokes
          if (selStrokes.length > 0 && (tools.tool === "path" || tools.tool === "pen" || ctrlRef.current)) {
            for (const s of selStrokes) {
              if (s.bezierNodes) {
                const nodes = (warp && warp.strokeId === s.id && warp.currentBezierNodes) ? warp.currentBezierNodes : s.bezierNodes;
                if (nodes.length > 0) {
                  ctx.strokeStyle = "#39c5e8";
                  ctx.lineWidth = 1.2;
                  ctx.beginPath();
                  ctx.moveTo(bx + nodes[0].x * scale, by + nodes[0].y * scale);
                  for (let i = 0; i < nodes.length - 1; i++) {
                    const p1 = nodes[i].handleOut ?? { x: nodes[i].x, y: nodes[i].y };
                    const p2 = nodes[i + 1].handleIn ?? { x: nodes[i + 1].x, y: nodes[i + 1].y };
                    const p3 = { x: nodes[i + 1].x, y: nodes[i + 1].y };
                    ctx.bezierCurveTo(bx + p1.x * scale, by + p1.y * scale, bx + p2.x * scale, by + p2.y * scale, bx + p3.x * scale, by + p3.y * scale);
                  }
                  if (s.closed && nodes.length > 1) {
                    const p1 = nodes[nodes.length - 1].handleOut ?? { x: nodes[nodes.length - 1].x, y: nodes[nodes.length - 1].y };
                    const p2 = nodes[0].handleIn ?? { x: nodes[0].x, y: nodes[0].y };
                    const p3 = { x: nodes[0].x, y: nodes[0].y };
                    ctx.bezierCurveTo(bx + p1.x * scale, by + p1.y * scale, bx + p2.x * scale, by + p2.y * scale, bx + p3.x * scale, by + p3.y * scale);
                  }
                  ctx.stroke();
                }

                nodes.forEach((node, i) => {
                  const sx = bx + node.x * scale;
                  const sy = by + node.y * scale;
                  handleSpots.push({ strokeId: s.id, index: i, sx, sy, type: "node" });
                  const isNodeSelected = useSelection.getState().nodeIds.some((n) => n.strokeId === s.id && n.index === i);
                  
                  if (isNodeSelected) {
                    const drawHandle = (h: { x: number, y: number }, type: "handleIn" | "handleOut") => {
                      const hx = bx + h.x * scale;
                      const hy = by + h.y * scale;
                      handleSpots.push({ strokeId: s.id, index: i, sx: hx, sy: hy, type });
                      ctx.strokeStyle = "#888";
                      ctx.lineWidth = 1;
                      ctx.beginPath();
                      ctx.moveTo(sx, sy);
                      ctx.lineTo(hx, hy);
                      ctx.stroke();
                      ctx.fillStyle = "#fff";
                      ctx.strokeStyle = "#888";
                      ctx.beginPath();
                      ctx.arc(hx, hy, 4, 0, Math.PI * 2);
                      ctx.fill();
                      ctx.stroke();
                    };
                    if (node.handleIn) drawHandle(node.handleIn, "handleIn");
                    if (node.handleOut) drawHandle(node.handleOut, "handleOut");
                  }

                  ctx.fillStyle = isNodeSelected ? "#39c5e8" : "#0e0e11";
                  ctx.strokeStyle = "#39c5e8";
                  ctx.lineWidth = 1.4;
                  ctx.beginPath();
                  ctx.rect(sx - 4, sy - 4, 8, 8);
                  ctx.fill();
                  ctx.stroke();
                });
                // handles should be on top of nodes in handleSpots for hit testing
                handleSpots.sort((a, b) => (a.type === "node" ? -1 : 1) - (b.type === "node" ? -1 : 1));
              } else {
                const pts = ptsOf(s);
                for (const i of handleIndices(pts.length)) {
                  const pt = pts[i];
                  if (!pt || !Number.isFinite(pt.x) || !Number.isFinite(pt.y)) continue;
                  const sx = bx + pt.x * scale;
                  const sy = by + pt.y * scale;
                  handleSpots.push({ strokeId: s.id, index: i, sx, sy });
                  const isNodeSelected = useSelection.getState().nodeIds.some((n) => n.strokeId === s.id && n.index === i);
                  ctx.fillStyle = isNodeSelected ? "#39c5e8" : "#0e0e11";
                  ctx.strokeStyle = "#39c5e8";
                  ctx.lineWidth = 1.4;
                  ctx.beginPath();
                  ctx.rect(sx - 4, sy - 4, 8, 8);
                  ctx.fill();
                  ctx.stroke();
                }
              }
            }
          }
        }

        // --- live pen overlay (preview line & handles) ---
        if (tools.tool === "pen" && live && live.stroke.bezierNodes && live.stroke.brush === "pen") {
          const nodes = live.stroke.bezierNodes;
          
          if (nodes.length > 0) {
            ctx.strokeStyle = "#39c5e8";
            ctx.lineWidth = 1.2;
            ctx.beginPath();
            ctx.moveTo(bx + nodes[0].x * scale, by + nodes[0].y * scale);
            
            for (let i = 0; i < nodes.length - 1; i++) {
              const p1 = nodes[i].handleOut ?? { x: nodes[i].x, y: nodes[i].y };
              const p2 = nodes[i + 1].handleIn ?? { x: nodes[i + 1].x, y: nodes[i + 1].y };
              const p3 = { x: nodes[i + 1].x, y: nodes[i + 1].y };
              ctx.bezierCurveTo(bx + p1.x * scale, by + p1.y * scale, bx + p2.x * scale, by + p2.y * scale, bx + p3.x * scale, by + p3.y * scale);
            }
            
            if (hoverPos) {
              const lastNode = nodes[nodes.length - 1];
              const hx = bx + hoverPos.x * scale;
              const hy = by + hoverPos.y * scale;
              if (lastNode.handleOut) {
                 ctx.bezierCurveTo(bx + lastNode.handleOut.x * scale, by + lastNode.handleOut.y * scale, hx, hy, hx, hy);
              } else {
                 ctx.lineTo(hx, hy);
              }
            }
            ctx.stroke();
          }

          nodes.forEach((node, i) => {
            const sx = bx + node.x * scale;
            const sy = by + node.y * scale;
            
            const drawHandle = (h: { x: number, y: number }) => {
              const hx = bx + h.x * scale;
              const hy = by + h.y * scale;
              ctx.strokeStyle = "#888";
              ctx.lineWidth = 1;
              ctx.beginPath();
              ctx.moveTo(sx, sy);
              ctx.lineTo(hx, hy);
              ctx.stroke();
              ctx.fillStyle = "#fff";
              ctx.strokeStyle = "#888";
              ctx.beginPath();
              ctx.arc(hx, hy, 4, 0, Math.PI * 2);
              ctx.fill();
              ctx.stroke();
            };
            if (node.handleIn) drawHandle(node.handleIn);
            if (node.handleOut) drawHandle(node.handleOut);
            
            const isSnapping = i === 0 && hoverPos && nodes.length > 1 && Math.hypot(hoverPos.x - node.x, hoverPos.y - node.y) < 0.1;
            
            ctx.fillStyle = isSnapping ? "#fff" : "#39c5e8";
            ctx.strokeStyle = "#39c5e8";
            ctx.lineWidth = 1.4;
            const size = isSnapping ? 12 : 8;
            ctx.beginPath();
            if (isSnapping) {
              ctx.arc(sx, sy, size / 2, 0, Math.PI * 2);
            } else {
              ctx.rect(sx - size / 2, sy - size / 2, size, size);
            }
            ctx.fill();
            ctx.stroke();
          });
        }

        // Motion-path guides (Draw stage only — never in Preview/export).
        if (PATH_MAKER_ENABLED) {
          const pm = usePathMaker.getState();
          const layer = useProject.getState().project.layers[useProject.getState().layerIndex];
          const guides = layer?.motionPaths ?? [];
          const draft = pm.mode === "draw" ? pm.draftNodes : [];
          const drawGuide = (
            nodes: { x: number; y: number; handleIn?: { x: number; y: number }; handleOut?: { x: number; y: number } }[],
            color: string,
            showHandles: boolean,
          ) => {
            if (nodes.length === 0) return;
            ctx.save();
            ctx.strokeStyle = color;
            ctx.lineWidth = 1.5;
            ctx.setLineDash([6, 4]);
            ctx.beginPath();
            ctx.moveTo(bx + nodes[0].x * scale, by + nodes[0].y * scale);
            for (let i = 0; i < nodes.length - 1; i++) {
              const p1 = nodes[i].handleOut ?? { x: nodes[i].x, y: nodes[i].y };
              const p2 = nodes[i + 1].handleIn ?? { x: nodes[i + 1].x, y: nodes[i + 1].y };
              const p3 = { x: nodes[i + 1].x, y: nodes[i + 1].y };
              ctx.bezierCurveTo(
                bx + p1.x * scale,
                by + p1.y * scale,
                bx + p2.x * scale,
                by + p2.y * scale,
                bx + p3.x * scale,
                by + p3.y * scale,
              );
            }
            if (showHandles && hoverPos && nodes.length > 0) {
              const last = nodes[nodes.length - 1]!;
              const hx = bx + hoverPos.x * scale;
              const hy = by + hoverPos.y * scale;
              if (last.handleOut) {
                ctx.bezierCurveTo(
                  bx + last.handleOut.x * scale,
                  by + last.handleOut.y * scale,
                  hx,
                  hy,
                  hx,
                  hy,
                );
              } else {
                ctx.lineTo(hx, hy);
              }
            }
            ctx.stroke();
            ctx.setLineDash([]);
            for (const n of nodes) {
              const sx = bx + n.x * scale;
              const sy = by + n.y * scale;
              if (showHandles) {
                const drawH = (h: { x: number; y: number }) => {
                  const hx = bx + h.x * scale;
                  const hy = by + h.y * scale;
                  ctx.strokeStyle = "rgba(255,255,255,0.45)";
                  ctx.lineWidth = 1;
                  ctx.beginPath();
                  ctx.moveTo(sx, sy);
                  ctx.lineTo(hx, hy);
                  ctx.stroke();
                  ctx.fillStyle = "#fff";
                  ctx.beginPath();
                  ctx.arc(hx, hy, 3.5, 0, Math.PI * 2);
                  ctx.fill();
                };
                if (n.handleIn) drawH(n.handleIn);
                if (n.handleOut) drawH(n.handleOut);
              }
              ctx.fillStyle = color;
              ctx.beginPath();
              ctx.rect(sx - 4, sy - 4, 8, 8);
              ctx.fill();
            }
            ctx.restore();
          };
          for (const g of guides) {
            const live =
              motionEditRef.current && motionEditRef.current.pathId === g.id
                ? motionEditRef.current.currentNodes
                : g.bezierNodes;
            drawGuide(live, "rgba(107, 151, 255, 0.85)", true);
          }
          if (draft.length) drawGuide(draft, "rgba(255, 180, 70, 0.95)", true);
        }
        
        if (marqueeRef.current) {
          const m = marqueeRef.current;
          ctx.save();
          ctx.strokeStyle = "#39c5e8";
          ctx.fillStyle = "rgba(57, 197, 232, 0.1)";
          ctx.lineWidth = 1;
          const rectX = bx + Math.min(m.startX, m.currentX) * scale;
          const rectY = by + Math.min(m.startY, m.currentY) * scale;
          const rectW = Math.abs(m.currentX - m.startX) * scale;
          const rectH = Math.abs(m.currentY - m.startY) * scale;
          ctx.beginPath();
          ctx.rect(rectX, rectY, rectW, rectH);
          ctx.fill();
          ctx.stroke();
          ctx.restore();
        }
      } catch {
        // never let overlay bugs kill the rAF loop (crash → restore banner)
        handleSpots = [];
        transformSpots = [];
        selBBoxRef.current = null;
      }
    }

    function findNodeInsert(
      x: number,
      y: number,
      cel: { strokes: Stroke[] },
      scale: number,
      onlyStrokeIds?: string[],
    ) {
      let bestHit: { strokeId: string; insertIndex: number; t: number; dist: number } | null = null;
      for (const stroke of cel.strokes) {
        if (onlyStrokeIds && !onlyStrokeIds.includes(stroke.id)) continue;
        if (!stroke.bezierNodes || stroke.bezierNodes.length < 2) continue;
        for (let i = 0; i < stroke.bezierNodes.length - 1; i++) {
          const nodeA = stroke.bezierNodes[i];
          const nodeB = stroke.bezierNodes[i+1];
          const p0 = { x: nodeA.x, y: nodeA.y };
          const p1 = nodeA.handleOut ?? p0;
          const p2 = nodeB.handleIn ?? { x: nodeB.x, y: nodeB.y };
          const p3 = { x: nodeB.x, y: nodeB.y };
          const res = projectToCubicBezier({ x, y }, p0, p1, p2, p3);
          if (res.dist <= Math.max(stroke.size * 1.5, 12 / scale)) {
            if (!bestHit || res.dist < bestHit.dist) {
              bestHit = { strokeId: stroke.id, insertIndex: i + 1, t: res.t, dist: res.dist };
            }
          }
        }
        if (stroke.closed && stroke.bezierNodes.length > 1) {
          const nodeA = stroke.bezierNodes[stroke.bezierNodes.length - 1];
          const nodeB = stroke.bezierNodes[0];
          const p0 = { x: nodeA.x, y: nodeA.y };
          const p1 = nodeA.handleOut ?? p0;
          const p2 = nodeB.handleIn ?? { x: nodeB.x, y: nodeB.y };
          const p3 = { x: nodeB.x, y: nodeB.y };
          const res = projectToCubicBezier({ x, y }, p0, p1, p2, p3);
          if (res.dist <= Math.max(stroke.size * 1.5, 12 / scale)) {
            if (!bestHit || res.dist < bestHit.dist) {
              bestHit = { strokeId: stroke.id, insertIndex: stroke.bezierNodes.length, t: res.t, dist: res.dist };
            }
          }
        }
      }
      return bestHit;
    }

  type BezierNodeWithMaybeHandles = {
    x: number;
    y: number;
    handleIn?: { x: number; y: number };
    handleOut?: { x: number; y: number };
  };

  function insertBezierNodeOnSegment(
    bestHit: { strokeId: string; insertIndex: number; t: number },
    stroke: Stroke,
    x: number,
    y: number,
    e: PointerEvent,
  ): boolean {
    if (!stroke.bezierNodes) return false;

    let p0, p1, p2, p3;
    if (bestHit.insertIndex === stroke.bezierNodes.length && stroke.closed) {
      const nodeA = stroke.bezierNodes[stroke.bezierNodes.length - 1];
      const nodeB = stroke.bezierNodes[0];
      p0 = { x: nodeA.x, y: nodeA.y };
      p1 = nodeA.handleOut ?? p0;
      p2 = nodeB.handleIn ?? { x: nodeB.x, y: nodeB.y };
      p3 = { x: nodeB.x, y: nodeB.y };
    } else {
      const nodeA = stroke.bezierNodes[bestHit.insertIndex - 1];
      const nodeB = stroke.bezierNodes[bestHit.insertIndex];
      p0 = { x: nodeA.x, y: nodeA.y };
      p1 = nodeA.handleOut ?? p0;
      p2 = nodeB.handleIn ?? { x: nodeB.x, y: nodeB.y };
      p3 = { x: nodeB.x, y: nodeB.y };
    }
    const [c1, c2] = splitCubicBezier(p0, p1, p2, p3, bestHit.t);

    const newNodes: BezierNodeWithMaybeHandles[] = stroke.bezierNodes.map((n) => ({
      ...n,
      handleIn: n.handleIn ? { ...n.handleIn } : undefined,
      handleOut: n.handleOut ? { ...n.handleOut } : undefined,
    }));

    const newNode: BezierNodeWithMaybeHandles = {
      x: c1.p3.x,
      y: c1.p3.y,
      handleIn: { x: c1.p2.x, y: c1.p2.y },
      handleOut: { x: c2.p1.x, y: c2.p1.y },
    };

    if (bestHit.insertIndex === stroke.bezierNodes.length && stroke.closed) {
      newNodes[stroke.bezierNodes.length - 1].handleOut = { x: c1.p1.x, y: c1.p1.y };
      newNodes[0].handleIn = { x: c2.p2.x, y: c2.p2.y };
      newNodes.push(newNode);
    } else {
      newNodes[bestHit.insertIndex - 1].handleOut = { x: c1.p1.x, y: c1.p1.y };
      newNodes[bestHit.insertIndex].handleIn = { x: c2.p2.x, y: c2.p2.y };
      newNodes.splice(bestHit.insertIndex, 0, newNode);
    }

    const newPts = flattenBezierNodes(newNodes, !!stroke.closed);
    useProject
      .getState()
      .replaceStrokePoints(
        stroke.id,
        newPts,
        newNodes,
        extrasAfterPathEdit(stroke),
      );

    const sel = useSelection.getState();
    if (!e.shiftKey) sel.clearNodes();
    sel.setNodes([{ strokeId: stroke.id, index: bestHit.insertIndex }]);

    try {
      canvas.setPointerCapture(e.pointerId);
    } catch {
      /* best-effort */
    }

    warpRef.current = {
      strokeId: stroke.id,
      origPoints: newPts,
      currentPoints: newPts,
      startX: x,
      startY: y,
      handleIndex: bestHit.insertIndex,
      handleType: "node",
      selectedNodeIndices: [bestHit.insertIndex],
      isBezier: true,
      origBezierNodes: newNodes,
      currentBezierNodes: newNodes,
      isClosed: stroke.closed,
    };
    return true;
  }

    function celSnapshots(ids: string[], cel: { strokes: Stroke[]; texts?: TextElement[] }) {
      const snapshots = new Map<
        string,
        { points: StrokePoint[]; size: number; bezierNodes?: BezierNode[] }
      >();
      const textSnapshots = new Map<string, TextElement>();
      for (const s of cel.strokes) {
        if (ids.includes(s.id)) {
          snapshots.set(s.id, {
            points: s.points.map((p) => ({ ...p })),
            size: s.size,
            bezierNodes: s.bezierNodes?.map((n) => ({
              x: n.x,
              y: n.y,
              handleIn: n.handleIn ? { ...n.handleIn } : undefined,
              handleOut: n.handleOut ? { ...n.handleOut } : undefined,
            })),
          });
        }
      }
      if (cel.texts) {
        for (const t of cel.texts) {
          if (ids.includes(t.id)) {
            textSnapshots.set(t.id, { ...t });
          }
        }
      }
      return { snapshots, textSnapshots };
    }

    function celSnapshotsAcrossLayers(
      ids: string[],
      project: Project,
      frameIndex: number,
    ) {
      const snapshots = new Map<
        string,
        { points: StrokePoint[]; size: number; bezierNodes?: BezierNode[] }
      >();
      const textSnapshots = new Map<string, TextElement>();
      for (const layer of project.layers) {
        const cel = celForLayer(project, layer, frameIndex);
        if (!cel) continue;
        const part = celSnapshots(ids, cel);
        for (const [id, snap] of part.snapshots) snapshots.set(id, snap);
        for (const [id, t] of part.textSnapshots) textSnapshots.set(id, t);
      }
      return { snapshots, textSnapshots };
    }

    function selectionPivotAcrossLayers(
      ids: string[],
      project: Project,
      frameIndex: number,
    ) {
      const allPts: StrokePoint[] = [];
      let minX = Infinity;
      let minY = Infinity;
      let maxX = -Infinity;
      let maxY = -Infinity;
      for (const layer of project.layers) {
        if (!layer.visible) continue;
        const cel = celForLayer(project, layer, frameIndex);
        if (!cel) continue;
        for (const s of cel.strokes) {
          if (ids.includes(s.id)) allPts.push(...s.points);
        }
        if (cel.texts) {
          for (const t of cel.texts) {
            if (!ids.includes(t.id)) continue;
            const aabb = textAABB(celCtx, t);
            if (aabb.minX < minX) minX = aabb.minX;
            if (aabb.minY < minY) minY = aabb.minY;
            if (aabb.maxX > maxX) maxX = aabb.maxX;
            if (aabb.maxY > maxY) maxY = aabb.maxY;
          }
        }
      }
      const strokeBounds = pointsBounds(allPts);
      if (strokeBounds) {
        minX = Math.min(minX, strokeBounds.minX);
        minY = Math.min(minY, strokeBounds.minY);
        maxX = Math.max(maxX, strokeBounds.maxX);
        maxY = Math.max(maxY, strokeBounds.maxY);
      }
      if (minX === Infinity) return null;
      return boundsCenter({ minX, minY, maxX, maxY });
    }

    function beginPan(e: PointerEvent) {
      try {
        canvas.setPointerCapture(e.pointerId);
      } catch {
        // best-effort
      }
      const { panX, panY } = useViewport.getState();
      panRef.current = {
        startX: e.clientX,
        startY: e.clientY,
        startPanX: panX,
        startPanY: panY,
      };
      canvas.style.cursor = "grabbing";
    }

    function findTextAt(
      x: number,
      y: number,
    ): { text: TextElement; layerId: string } | null {
      const ps = useProject.getState();
      const animatron = ps.project.workflow === "animatron";
      for (let i = ps.project.layers.length - 1; i >= 0; i--) {
        const layer = ps.project.layers[i];
        if (!layer.visible) continue;
        const cel = animatron
          ? layer.frames.find((f) => f)
          : resolveCel(layer, ps.frameIndex);
        if (!cel?.texts?.length) continue;
        for (let j = cel.texts.length - 1; j >= 0; j--) {
          const t = cel.texts[j];
          if (hitTextBox(celCtx, t, x, y)) {
            return { text: t, layerId: layer.id };
          }
        }
      }
      return null;
    }

    /** Topmost selectable art across all visible layers (V-tool pick). */
    function findArtAt(
      x: number,
      y: number,
    ): {
      id: string;
      layerId: string;
      kind: "text" | "image" | "stroke";
    } | null {
      const ps = useProject.getState();
      return findArtAtProject(ps.project, ps.frameIndex, x, y, celCtx);
    }

    function ensureLayerById(layerId: string) {
      const ps = useProject.getState();
      const idx = ps.project.layers.findIndex((l) => l.id === layerId);
      if (idx !== -1 && idx !== ps.layerIndex) ps.setLayerIndex(idx);
    }

    function selectTextOnly(hit: TextElement, layerId: string | null) {
      const ps = useProject.getState();
      if (layerId) {
        const idx = ps.project.layers.findIndex((l) => l.id === layerId);
        if (idx !== -1 && idx !== ps.layerIndex) ps.setLayerIndex(idx);
      }
      syncTextToolsFromElement(hit);
      // Stay on V/select — do NOT jump to text tool (that hid the purple box).
      useSelection.getState().set([hit.id]);
      setTextEdit(null);
      dirtyRef.current = true;
    }

    function openTextEditor(hit: TextElement, layerId: string | null) {
      const ps = useProject.getState();
      if (layerId) {
        const idx = ps.project.layers.findIndex((l) => l.id === layerId);
        if (idx !== -1 && idx !== ps.layerIndex) ps.setLayerIndex(idx);
      }
      syncTextToolsFromElement(hit);
      const box = measureTextBox(celCtx, hit);
      // Always seed a box width so edge-resize + wrap are available immediately.
      const boxWidth = hit.boxWidth ?? Math.max(48, Math.ceil(box.w));
      setTextEdit({
        id: hit.id,
        text: hit.text,
        projectX: hit.x,
        projectY: hit.y,
        boxWidth,
        rotation: hit.rotation,
      });
      useSelection.getState().set([hit.id]);
      dirtyRef.current = true;
    }

    function tryOpenTextAt(clientX: number, clientY: number) {
      const rect = canvas.getBoundingClientRect();
      let { scale, ox, oy } = fitRef.current;
      if (!(scale > 0)) {
        resize();
        ({ scale, ox, oy } = fitRef.current);
      }
      if (!(scale > 0)) return false;
      const px = (clientX - rect.left - ox) / scale;
      const py = (clientY - rect.top - oy) / scale;
      const hit = findTextAt(px, py);
      if (!hit) return false;

      liveRef.current = null;
      marqueeRef.current = null;
      moveRef.current = null;
      transformRef.current = null;
      warpRef.current = null;

      const ps = useProject.getState();
      const animatron = ps.project.workflow === "animatron";
      const layer = ps.project.layers[ps.layerIndex];
      const cel = layer
        ? animatron
          ? layer.frames.find((f) => f) ?? null
          : resolveCel(layer, ps.frameIndex)
        : null;
      const last = cel?.strokes[cel.strokes.length - 1];
      if (last && last.points.length <= 4) {
        const near = last.points.some((p) => Math.hypot(p.x - px, p.y - py) < 28);
        if (near) ps.deleteStrokes([last.id]);
      }

      openTextEditor(hit.text, hit.layerId);
      return true;
    }

    function onDblClick(e: MouseEvent) {
      if (tryOpenTextAt(e.clientX, e.clientY)) {
        e.preventDefault();
        e.stopPropagation();
      }
    }

    function onPointerDown(e: PointerEvent) {
      const tools = useTools.getState();
      if (e.button === 1 || (spaceRef.current && e.button === 0) || tools.tool === "hand") {
        beginPan(e);
        return;
      }
      if (e.button !== 0) return;

      // Path Maker custom-draw: click nodes + drag handles (same UX as pen).
      const pm = usePathMaker.getState();
      if (PATH_MAKER_ENABLED && pm.mode === "draw") {
        e.preventDefault();
        const { x, y } = toProject(e);
        try { canvas.setPointerCapture(e.pointerId); } catch {}
        pm.addDraftNode({ x, y });
        pathDraftDragRef.current = true;
        dirtyRef.current = true;
        return;
      }

      // Edit existing motion-path nodes / bezier handles (preset or pen).
      if (
        PATH_MAKER_ENABLED &&
        (tools.tool === "select" || tools.tool === "path")
      ) {
        const { x, y } = toProject(e);
        const ps = useProject.getState();
        const layer = ps.project.layers[ps.layerIndex];
        const paths = layer?.motionPaths ?? [];
        const hitR = HANDLE_HIT_PX / fitRef.current.scale;
        for (const path of paths) {
          for (let ni = 0; ni < path.bezierNodes.length; ni++) {
            const n = path.bezierNodes[ni];
            let handleType: "node" | "handleIn" | "handleOut" | null = null;
            if (n.handleOut && Math.hypot(n.handleOut.x - x, n.handleOut.y - y) <= hitR) {
              handleType = "handleOut";
            } else if (n.handleIn && Math.hypot(n.handleIn.x - x, n.handleIn.y - y) <= hitR) {
              handleType = "handleIn";
            } else if (Math.hypot(n.x - x, n.y - y) <= hitR) {
              handleType = "node";
            }
            if (handleType) {
              e.preventDefault();
              try { canvas.setPointerCapture(e.pointerId); } catch {}
              motionEditRef.current = {
                layerId: layer!.id,
                pathId: path.id,
                nodeIndex: ni,
                handleType,
                startX: x,
                startY: y,
                origNodes: path.bezierNodes.map((node) => ({
                  ...node,
                  handleIn: node.handleIn ? { ...node.handleIn } : undefined,
                  handleOut: node.handleOut ? { ...node.handleOut } : undefined,
                })),
                currentNodes: path.bezierNodes.map((node) => ({
                  ...node,
                  handleIn: node.handleIn ? { ...node.handleIn } : undefined,
                  handleOut: node.handleOut ? { ...node.handleOut } : undefined,
                })),
                dirty: false,
              };
              dirtyRef.current = true;
              return;
            }
          }
        }
      }

      if (tools.tool === "fill") {
        e.preventDefault();
        const { x, y } = toProject(e);
        const ps = useProject.getState();
        const { width: pw, height: ph } = ps.project;
        const onArtboard = x >= 0 && y >= 0 && x < pw && y < ph;
        if (!onArtboard) return;

        const color = tools.color;
        const allStrokes = collectBucketStrokes(ps.project, ps.frameIndex);
        const hit = findBucketTarget(allStrokes, x, y, pw, ph);
        const raster = rasterBucketRegion(ps.project, ps.frameIndex, x, y, pw, ph);
        const enclosingStroke =
          findEnclosingStroke(allStrokes, x, y) ??
          (hit.kind === "shape" ? hit.stroke : null);
        const clickInsideInk = allStrokes.some(
          (s) => s.brush !== "eraser" && pointInInkBounds(s, x, y),
        );

        // Leafer pack shapes: vector patch on the shape stroke.
        if (hit.kind === "shape" && hit.stroke?.shapeKind) {
          expandingFillRef.current = {
            points: hit.points,
            color,
            startX: x,
            startY: y,
            startTime: performance.now(),
            targetStrokeId: hit.stroke.id,
          };
          fillPreviewRef.current = null;
          useTools.getState().bumpFillPulse();
          dirtyRef.current = true;
          return;
        }

        // Raster flood fill — enclosed freehand ink/brush loops.
        if (raster && raster.points.length >= 3) {
          if (
            !enclosingStroke &&
            !clickInsideInk &&
            raster.filledRatio >= 0.92
          ) {
            expandingFillRef.current = {
              points: artboardRectPoints(pw, ph),
              color,
              startX: x,
              startY: y,
              startTime: performance.now(),
              canvasFill: true,
            };
          } else {
            const maxInk = allStrokes.reduce((m, s) => Math.max(m, s.size), 4);
            // Nested / multi-pocket art: raster flood fill is the source of truth.
            // Patching fillColor onto an enclosing stroke fills its whole polygon
            // (and every hole inside a self-intersecting path) — wrong for pockets.
            const nestedInk = enclosingStroke
              ? strokeHasNestedInk(enclosingStroke, allStrokes)
              : false;
            const useRasterRegion =
              !enclosingStroke ||
              nestedInk ||
              // Self-touching brush loops: bbox encloses many pockets.
              (enclosingStroke.points.length > 24 &&
                !enclosingStroke.shapeKind);
            const enclosingPts =
              !useRasterRegion && enclosingStroke
                ? enclosingStroke.bezierNodes?.length
                  ? flattenBezierNodes(enclosingStroke.bezierNodes, true)
                  : bridgeNearClosedPoints(
                      enclosingStroke.points,
                      fillGapThreshold(enclosingStroke.size),
                    )
                : null;
            // #region agent log
            fetch('http://127.0.0.1:7909/ingest/7ebb56b9-5cd9-4d66-91ca-3dd1d33513ee',{method:'POST',headers:{'Content-Type':'application/json','X-Debug-Session-Id':'07ea42'},body:JSON.stringify({sessionId:'07ea42',location:'StageCanvas.tsx:fillPointerDown',message:'bucket nested path',data:{x,y,useRasterRegion,nestedInk,enclosingId:enclosingStroke?.id?.slice(0,8),enclosingPts:enclosingStroke?.points.length,rasterN:raster.points.length,filledRatio:raster.filledRatio,strokeCount:allStrokes.length},timestamp:Date.now(),hypothesisId:'H-nest1',runId:'nested-pre'})}).catch(()=>{});
            if(import.meta.env.DEV){const w=window as Window&{__laoBucketDebug?:unknown[]};(w.__laoBucketDebug??=[]).push({message:'bucket nested path',useRasterRegion,nestedInk,enclosingId:enclosingStroke?.id?.slice(0,8),filledRatio:raster.filledRatio});}
            // #endregion
            const useMask = !enclosingPts && raster.mask;
            let maskCanvas: HTMLCanvasElement | undefined;
            if (useMask && raster.mask) {
              maskCanvas = document.createElement("canvas");
              maskCanvas.width = raster.mask.width;
              maskCanvas.height = raster.mask.height;
              const mctx = maskCanvas.getContext("2d")!;
              mctx.fillStyle = color;
              mctx.fillRect(0, 0, raster.mask.width, raster.mask.height);
              const img = mctx.getImageData(
                0,
                0,
                raster.mask.width,
                raster.mask.height,
              );
              for (let i = 0; i < raster.mask.alpha.length; i++) {
                img.data[i * 4 + 3] = raster.mask.alpha[i] ? 255 : 0;
              }
              mctx.putImageData(img, 0, 0);
            }
            // Commit mask fills immediately — droplet animation is preview-only.
            // Waiting for the animation lets a second click discard the fill.
            let committed = false;
            if (useMask && raster.mask) {
              const src = colorizeFillMask(raster.mask, color);
              // #region agent log
              fetch('http://127.0.0.1:7909/ingest/7ebb56b9-5cd9-4d66-91ca-3dd1d33513ee',{method:'POST',headers:{'Content-Type':'application/json','X-Debug-Session-Id':'07ea42'},body:JSON.stringify({sessionId:'07ea42',location:'StageCanvas.tsx:fillPointerDown',message:'mask fill commit',data:{hasSrc:!!src,mw:raster.mask.width,mh:raster.mask.height,ox:raster.mask.offsetX,oy:raster.mask.offsetY,color,pixelCount:raster.pixelCount},timestamp:Date.now(),hypothesisId:'H-nest-mask',runId:'nested-mask2'})}).catch(()=>{});
              if(import.meta.env.DEV){const w=window as Window&{__laoBucketDebug?:unknown[]};(w.__laoBucketDebug??=[]).push({message:'mask fill commit',hasSrc:!!src,mw:raster.mask.width,mh:raster.mask.height,pixelCount:raster.pixelCount});}
              // #endregion
              if (src) {
                useProject.getState().addImageToActiveCel({
                  id: crypto.randomUUID(),
                  src,
                  x: raster.mask.offsetX / DRAFT_SCALE,
                  y: raster.mask.offsetY / DRAFT_SCALE,
                  w: raster.mask.width / DRAFT_SCALE,
                  h: raster.mask.height / DRAFT_SCALE,
                  naturalWidth: raster.mask.width,
                  naturalHeight: raster.mask.height,
                  opacity: 1,
                  lockAspect: true,
                });
                useTools.getState().setFillColor(color);
                committed = true;
              }
            }
            expandingFillRef.current = {
              points: enclosingPts
                ? enclosingPts
                : expandPolygonOutward(
                    raster.points,
                    fillPolygonExpandDistance(maxInk),
                  ),
              color,
              startX: x,
              startY: y,
              startTime: performance.now(),
              // Nested pockets: keep the pixel mask so holes aren't filled.
              targetStrokeId: enclosingPts ? enclosingStroke?.id : undefined,
              mask: useMask ? raster.mask : undefined,
              maskCanvas,
              committed,
            };
          }
          fillPreviewRef.current = null;
          useTools.getState().bumpFillPulse();
          dirtyRef.current = true;
          return;
        }

        // Raster missed (gaps / thin ink) but we know a simple enclosing loop —
        // patch it directly. Skip nested / complex strokes (would fill every pocket).
        if (enclosingStroke && !enclosingStroke.shapeKind) {
          const nestedInk = strokeHasNestedInk(enclosingStroke, allStrokes);
          const complex =
            nestedInk || enclosingStroke.points.length > 24;
          // #region agent log
          fetch('http://127.0.0.1:7909/ingest/7ebb56b9-5cd9-4d66-91ca-3dd1d33513ee',{method:'POST',headers:{'Content-Type':'application/json','X-Debug-Session-Id':'07ea42'},body:JSON.stringify({sessionId:'07ea42',location:'StageCanvas.tsx:fillPointerDown',message:'bucket enclosing fallback',data:{x,y,complex,nestedInk,enclosingId:enclosingStroke.id.slice(0,8),pts:enclosingStroke.points.length},timestamp:Date.now(),hypothesisId:'H-nest3',runId:'nested-post'})}).catch(()=>{});
          if(import.meta.env.DEV){const w=window as Window&{__laoBucketDebug?:unknown[]};(w.__laoBucketDebug??=[]).push({message:'bucket enclosing fallback',complex,enclosingId:enclosingStroke.id.slice(0,8)});}
          // #endregion
          if (!complex) {
            const enclosingPts = enclosingStroke.bezierNodes?.length
              ? flattenBezierNodes(enclosingStroke.bezierNodes, true)
              : bridgeNearClosedPoints(
                  enclosingStroke.points,
                  fillGapThreshold(enclosingStroke.size),
                );
            expandingFillRef.current = {
              points: enclosingPts,
              color,
              startX: x,
              startY: y,
              startTime: performance.now(),
              targetStrokeId: enclosingStroke.id,
            };
            fillPreviewRef.current = null;
            useTools.getState().bumpFillPulse();
            dirtyRef.current = true;
            return;
          }
          // Complex nested art with no usable raster — do not fall through to
          // whole-stroke fill (that paints every pocket inside the outline).
          return;
        }

        if (hit.kind === "shape" && hit.stroke && !hit.stroke.shapeKind) {
          const complexHit =
            strokeHasNestedInk(hit.stroke, allStrokes) ||
            hit.stroke.points.length > 24;
          if (complexHit) return;
          expandingFillRef.current = {
            points: hit.points,
            color,
            startX: x,
            startY: y,
            startTime: performance.now(),
            targetStrokeId: hit.stroke.id,
          };
          fillPreviewRef.current = null;
          useTools.getState().bumpFillPulse();
          dirtyRef.current = true;
          return;
        }

        if (hit.kind === "canvas") {
          expandingFillRef.current = {
            points: hit.points,
            color,
            startX: x,
            startY: y,
            startTime: performance.now(),
            canvasFill: true,
          };
          fillPreviewRef.current = null;
          useTools.getState().bumpFillPulse();
          dirtyRef.current = true;
        }
        return;
      }

      // Universal double-click: open text editor from any tool
      if (e.detail >= 2) {
        if (tryOpenTextAt(e.clientX, e.clientY)) {
          e.preventDefault();
          e.stopPropagation();
          return;
        }
      }

      // Text create/select/edit while text tool is active: LeaferEditLayer owns it
      // (drag a box to place — same as Leafer TextEditor demos). Do not invent StageCanvas text UI.
      if (tools.tool === "text") {
        return;
      }

      if (tools.tool === "select" || tools.tool === "path" || ctrlRef.current) {
        const sel = useSelection.getState();
        if (sel.layerIndices.length > 0) {
          sel.selectAllInLayers(sel.layerIndices);
        }
        const rect = canvas.getBoundingClientRect();
        const sx = e.clientX - rect.left;
        const sy = e.clientY - rect.top;

        const ps = useProject.getState();
        const layer = ps.project.layers[ps.layerIndex];
        const animatron = ps.project.workflow === "animatron";
        const cel = layer
          ? animatron
            ? layer.frames.find((f) => f) ?? null
            : resolveCel(layer, ps.frameIndex)
          : null;

        // Text side handles resize the text box and reflow its lines. Do this
        // before generic transform handles, which occupy the same rectangle.
        const textWidthSpot = textWidthSpots.find(
          (h) => Math.hypot(h.sx - sx, h.sy - sy) <= HANDLE_HIT_PX + 2,
        );
        if (textWidthSpot && cel) {
          const text = cel.texts?.find((t) => t.id === textWidthSpot.id);
          if (text) {
            if (e.detail >= 2) {
              // Double-click a side handle to fit the box to its unwrapped
              // text line(s), preserving explicit line breaks.
              const natural = measureTextBox(celCtx, {
                ...text,
                boxWidth: undefined,
              });
              useProject.getState().updateTextElement(text.id, {
                boxWidth: Math.max(40, Math.ceil(natural.w) + 6),
              });
              dirtyRef.current = true;
              return;
            }
            const { x } = toProject(e);
            const box = measureTextBox(celCtx, text);
            const startWidth = text.boxWidth ?? Math.max(40, box.w);
            try {
              canvas.setPointerCapture(e.pointerId);
            } catch {
              // best-effort
            }
            textResizeRef.current = {
              id: text.id,
              edge: textWidthSpot.edge,
              startX: x,
              startWidth,
              startTextX: text.x,
              width: startWidth,
              textX: text.x,
            };
            dirtyRef.current = true;
            return;
          }
        }

        // scale / rotate handles on the selection bbox
        if (sel.ids.length) {
          const tspot = transformSpots.find(
            (h) => Math.hypot(h.sx - sx, h.sy - sy) <= HANDLE_HIT_PX,
          );
          const pivot = selectionPivotAcrossLayers(
            sel.ids,
            ps.project,
            ps.frameIndex,
          );
          const { snapshots, textSnapshots } = celSnapshotsAcrossLayers(
            sel.ids,
            ps.project,
            ps.frameIndex,
          );
          if (tspot && pivot && (snapshots.size || textSnapshots.size)) {
            try {
              canvas.setPointerCapture(e.pointerId);
            } catch {
              // best-effort
            }
            const { x, y } = toProject(e);
            if (tspot.kind === "scale") {
              transformRef.current = {
                mode: "scale",
                ids: [...sel.ids],
                pivotX: pivot.x,
                pivotY: pivot.y,
                startDist: Math.hypot(x - pivot.x, y - pivot.y) || 1,
                startAngle: 0,
                scale: 1,
                rotation: 0,
                snapshots,
                textSnapshots,
              };
            } else {
              transformRef.current = {
                mode: "rotate",
                ids: [...sel.ids],
                pivotX: pivot.x,
                pivotY: pivot.y,
                startDist: 1,
                startAngle: Math.atan2(y - pivot.y, x - pivot.x),
                scale: 1,
                rotation: 0,
                snapshots,
                textSnapshots,
              };
            }
            dirtyRef.current = true;
            return;
          }
        }

        // grab a warp handle first
        const spot = handleSpots.slice().reverse().find((h) => Math.hypot(h.sx - sx, h.sy - sy) <= HANDLE_HIT_PX);
        if (spot) {
          const stroke = cel?.strokes.find((s) => s.id === spot.strokeId);
          if (e.shiftKey) {
            sel.toggleNode(spot.strokeId, spot.index);
            dirtyRef.current = true;
            return;
          }
          if (e.detail === 2) {
            if (tools.tool === "path" && stroke?.bezierNodes) {
              const newNodes = toggleBezierNodeCorner(
                stroke.bezierNodes,
                spot.index,
                !!stroke.closed,
              );
              const newPts = flattenBezierNodes(newNodes, stroke.closed);
              useProject
                .getState()
                .replaceStrokePoints(
                  stroke.id,
                  newPts,
                  newNodes,
                  extrasAfterPathEdit(stroke),
                );
              sel.setNodes([{ strokeId: spot.strokeId, index: spot.index }]);
              dirtyRef.current = true;
              return;
            }
            sel.setNodes([{ strokeId: spot.strokeId, index: spot.index }]);
            dirtyRef.current = true;
            return;
          }
          if (stroke) {
            try {
              canvas.setPointerCapture(e.pointerId);
            } catch {}
            const { x, y } = toProject(e);
            
            let selectedIndices: number[] | undefined;
            if (spot.type === "node" || !spot.type) {
               const isSelected = sel.nodeIds.some(n => n.strokeId === spot.strokeId && n.index === spot.index);
               if (!isSelected) {
                 sel.setNodes([{ strokeId: spot.strokeId, index: spot.index }]);
                 selectedIndices = [spot.index];
               } else {
                 selectedIndices = sel.nodeIds.filter(n => n.strokeId === spot.strokeId).map(n => n.index);
               }
            }

            const pts = (stroke.points || []).map((p) => ({ ...p }));
            const bezClone = stroke.bezierNodes?.map((n) => ({
              x: n.x,
              y: n.y,
              handleIn: n.handleIn ? { ...n.handleIn } : undefined,
              handleOut: n.handleOut ? { ...n.handleOut } : undefined,
            }));
            warpRef.current = {
              strokeId: stroke.id,
              origPoints: pts,
              currentPoints: pts.map((p) => ({ ...p })),
              startX: x,
              startY: y,
              handleIndex: spot.index,
              handleType: spot.type,
              selectedNodeIndices: selectedIndices,
              isBezier: !!bezClone?.length,
              origBezierNodes: bezClone,
              currentBezierNodes: bezClone?.map((n) => ({
                x: n.x,
                y: n.y,
                handleIn: n.handleIn ? { ...n.handleIn } : undefined,
                handleOut: n.handleOut ? { ...n.handleOut } : undefined,
              })),
              isClosed: stroke.closed,
            };
            dirtyRef.current = true;
            return;
          }
        }

        // Path tool: Alt+click on a segment adds a node (after handle pick — pen uses plain click).
        if (tools.tool === "path" && e.altKey && cel) {
          const { x: px, y: py } = toProject(e);
          const strokeFilter = sel.ids.length ? sel.ids : undefined;
          const bestHit = findNodeInsert(px, py, cel, fitRef.current.scale, strokeFilter);
          if (bestHit) {
            const stroke = cel.strokes.find((s) => s.id === bestHit.strokeId);
            if (stroke && insertBezierNodeOnSegment(bestHit, stroke, px, py, e)) {
              dirtyRef.current = true;
              return;
            }
          }
        }

        // drag inside selection bbox → group move (skip on double-click so text edit can open)
        const bbox = selBBoxRef.current;
        if (
          e.detail < 2 &&
          sel.ids.length &&
          bbox &&
          sx >= bbox.x &&
          sy >= bbox.y &&
          sx <= bbox.x + bbox.w &&
          sy <= bbox.y + bbox.h
        ) {
          const { snapshots, textSnapshots } = celSnapshotsAcrossLayers(
            sel.ids,
            ps.project,
            ps.frameIndex,
          );
          if (snapshots.size || textSnapshots.size) {
              try {
                canvas.setPointerCapture(e.pointerId);
              } catch {
                // best-effort
              }
              const { x, y } = toProject(e);
              const moveSnap = new Map<string, StrokePoint[]>();
              const bezierSnap = new Map<string, BezierNode[]>();
              for (const [id, snap] of snapshots.entries()) {
                moveSnap.set(id, snap.points);
                if (snap.bezierNodes?.length) {
                  bezierSnap.set(id, snap.bezierNodes);
                }
              }
              moveRef.current = {
                ids: [...sel.ids],
                startX: x,
                startY: y,
                dx: 0,
                dy: 0,
                snapshots: moveSnap,
                bezierSnapshots: bezierSnap,
                textSnapshots,
              };
              dirtyRef.current = true;
              return;
          }
        }

        const { x, y } = toProject(e);

        // Cross-layer pick — images live on their own layer; V must reach them
        // without requiring a prior timeline row click.
        const art = findArtAt(x, y);
        if (art) {
          ensureLayerById(art.layerId);
          const ps2 = useProject.getState();
          const layer2 = ps2.project.layers[ps2.layerIndex];
          const cel2 = layer2
            ? animatron
              ? layer2.frames.find((f) => f) ?? null
              : resolveCel(layer2, ps2.frameIndex)
            : null;
          if (art.kind === "text") {
            const textEl = cel2?.texts?.find((t) => t.id === art.id);
            if (textEl && !e.shiftKey) {
              selectTextOnly(textEl, art.layerId);
              dirtyRef.current = true;
              return;
            }
            if (e.shiftKey) {
              sel.toggle(art.id);
              dirtyRef.current = true;
              return;
            }
          }
          if (art.kind === "image") {
            if (!e.shiftKey) {
              sel.set([art.id]);
              useTools.getState().setTool("select");
            } else {
              sel.toggle(art.id);
            }
            dirtyRef.current = true;
            return;
          }
          // stroke / shape / pen path
          if (e.shiftKey) sel.toggle(art.id);
          else sel.set([art.id]);
          const stroke = cel2?.strokes.find((s) => s.id === art.id);
          if (stroke && !e.shiftKey) {
            useTools.getState().setColor(stroke.color);
            if (stroke.fillColor) useTools.getState().setFillColor(stroke.fillColor);
            useTools.getState().setSize(stroke.size);
            if (
              stroke.brush === "ink" ||
              stroke.brush === "pen" ||
              stroke.brush === "marker"
            ) {
              useTools.getState().setLastBrushKind(stroke.brush);
            }
            if (stroke.p5Brush) {
              useTools.getState().setLastP5Brush(stroke.p5Brush);
            }
            if (tools.tool !== "path") {
              useTools.getState().setTool("select");
            } else if (!stroke.bezierNodes && stroke.points.length >= 2) {
              useProject.getState().convertStrokeToBezier(stroke.id);
              sel.clearNodes();
            } else {
              sel.clearNodes();
            }
          }
        } else {
          if (!e.shiftKey) {
            if (tools.tool === "select") sel.clear();
            if (tools.tool === "path" || ctrlRef.current) sel.clearNodes();
          }
          try {
            canvas.setPointerCapture(e.pointerId);
          } catch {
            /* best-effort */
          }
          marqueeRef.current = { startX: x, startY: y, currentX: x, currentY: y };
        }
        dirtyRef.current = true;
        return;
      }

      // Shape create is handled by LeaferEditLayer (edit overlay).
      if (activeShapeTool(tools.tool, useTools.getState().lastShapeTool)) {
        return;
      }

      if (!isBrushTool(tools.tool)) return;

      const { x, y } = toProject(e);

      if (tools.tool === "pen") {
        const ps = useProject.getState();
        const layer = ps.project.layers[ps.layerIndex];
        const cel = layer ? (ps.project.workflow === "animatron" ? layer.frames.find(f => f) ?? null : resolveCel(layer, ps.frameIndex)) : null;
        if (cel) {
           const bestHit = findNodeInsert(x, y, cel, fitRef.current.scale);
           if (bestHit) {
             const stroke = cel.strokes.find(s => s.id === bestHit!.strokeId);
             if (stroke && insertBezierNodeOnSegment(bestHit, stroke, x, y, e)) {
               dirtyRef.current = true;
               return;
             }
           }
        }

        try { canvas.setPointerCapture(e.pointerId); } catch {}
        if (!liveRef.current || liveRef.current.stroke.brush !== "pen") {
          useSelection.getState().set([]);
          liveRef.current = {
            stroke: {
              id: crypto.randomUUID(),
              brush: "pen",
              color: tools.color,
              size: tools.size,
              points: [],
              bezierNodes: [{ x, y }],
              seed: Math.floor(Math.random() * 2 ** 31),
              jitter: false,
              grain: false,
              closed: false,
            },
            points: [],
          };
        } else {
          const firstNode = liveRef.current.stroke.bezierNodes![0];
          const dist = Math.hypot(x - firstNode.x, y - firstNode.y);
          if (liveRef.current.stroke.bezierNodes!.length > 1 && dist < 12 / fitRef.current.scale) {
             const live = liveRef.current;
             liveRef.current = null;
             live.stroke.closed = true;
             live.stroke.points = flattenBezierNodes(live.stroke.bezierNodes!, true);
             useProject.getState().addStroke({ ...live.stroke });
             useSelection.getState().set([live.stroke.id]);
             useTools.getState().setTool("select");
          } else {
             liveRef.current.stroke.bezierNodes!.push({ x, y });
          }
        }
        dirtyRef.current = true;
        return;
      }

      try {
        canvas.setPointerCapture(e.pointerId);
      } catch {
        // synthetic events have no active pointer — capture is best-effort
      }
      strokeStart = e.timeStamp;
      const p = pressure.read(e, x, y, e.timeStamp);
      liveRef.current = {
        stroke: {
          id: crypto.randomUUID(),
          brush: tools.tool,
          p5Brush:
            tools.tool === "eraser" ? undefined : tools.lastP5Brush,
          color: tools.color,
          size: tools.size,
          brushWavelength: tools.brushWavelength,
          brushCorners: tools.brushCorners,
          brushSmoothing: tools.brushSmoothing,
          points: [],
          seed: Math.floor(Math.random() * 2 ** 31),
          jitter: tools.jitterByDefault,
          grain:
            tools.lastP5Brush === "spray" || tools.lastP5Brush === "airbrush"
              ? false
              : tools.grainByDefault,
        },
        points: [{ x, y, pressure: p, t: 0 }],
      };
      dirtyRef.current = true;
    }

    function onPointerMove(e: PointerEvent) {
      const { x, y } = toProject(e);
      hoverPos = { x, y };

      const tools = useTools.getState();
      const live = liveRef.current;

      const motionEdit = motionEditRef.current;
      if (motionEdit) {
        const dx = x - motionEdit.startX;
        const dy = y - motionEdit.startY;
        const nodes = motionEdit.origNodes.map((n, i) => {
          if (i !== motionEdit.nodeIndex) return { ...n };
          if (motionEdit.handleType === "node") {
            return {
              ...n,
              x: n.x + dx,
              y: n.y + dy,
              handleIn: n.handleIn
                ? { x: n.handleIn.x + dx, y: n.handleIn.y + dy }
                : undefined,
              handleOut: n.handleOut
                ? { x: n.handleOut.x + dx, y: n.handleOut.y + dy }
                : undefined,
            };
          }
          if (motionEdit.handleType === "handleOut") {
            const handleOut = {
              x: (n.handleOut?.x ?? n.x) + dx,
              y: (n.handleOut?.y ?? n.y) + dy,
            };
            let handleIn = n.handleIn ? { ...n.handleIn } : undefined;
            if (!e.ctrlKey) {
              handleIn = { x: n.x * 2 - handleOut.x, y: n.y * 2 - handleOut.y };
            }
            return { ...n, handleOut, handleIn };
          }
          const handleIn = {
            x: (n.handleIn?.x ?? n.x) + dx,
            y: (n.handleIn?.y ?? n.y) + dy,
          };
          let handleOut = n.handleOut ? { ...n.handleOut } : undefined;
          if (!e.ctrlKey) {
            handleOut = { x: n.x * 2 - handleIn.x, y: n.y * 2 - handleIn.y };
          }
          return { ...n, handleIn, handleOut };
        });
        motionEdit.currentNodes = nodes;
        motionEdit.dirty = true;
        dirtyRef.current = true;
        return;
      }

      // Path Maker draft: drag after click pulls bezier handles like pen.
      if (
        PATH_MAKER_ENABLED &&
        pathDraftDragRef.current &&
        (e.buttons & 1) !== 0
      ) {
        const pm = usePathMaker.getState();
        if (pm.mode === "draw" && pm.draftNodes.length > 0) {
          const last = pm.draftNodes[pm.draftNodes.length - 1]!;
          const handleOut = { x, y };
          const handleIn = e.ctrlKey
            ? last.handleIn
            : { x: last.x * 2 - x, y: last.y * 2 - y };
          pm.updateLastDraftNode({ handleOut, handleIn });
          dirtyRef.current = true;
          return;
        }
      }
      
      let cursor = cursorForTool(tools.tool);
      if (tools.tool === "hand") {
        cursor = panRef.current ? "grabbing" : "grab";
      }

      if (tools.tool === "fill" && !expandingFillRef.current) {
        const ps = useProject.getState();
        const { width: pw, height: ph } = ps.project;
        const allStrokes = collectBucketStrokes(ps.project, ps.frameIndex);
        const hit = findBucketTarget(allStrokes, x, y, pw, ph);
        const next =
          hit.kind === "none"
            ? null
            : {
                points: hit.points,
                canvasFill: hit.kind === "canvas",
              };
        const prev = fillPreviewRef.current;
        const same =
          (!prev && !next) ||
          (prev &&
            next &&
            prev.canvasFill === next.canvasFill &&
            prev.points === next.points);
        if (!same) {
          fillPreviewRef.current = next;
          dirtyRef.current = true;
        }
      } else if (fillPreviewRef.current) {
        fillPreviewRef.current = null;
        dirtyRef.current = true;
      }

      if (tools.tool === "pen" && live && live.stroke.brush === "pen" && live.stroke.bezierNodes && live.stroke.bezierNodes.length > 1) {
         const firstNode = live.stroke.bezierNodes[0];
         const dist = Math.hypot(x - firstNode.x, y - firstNode.y);
         if (dist < 12 / fitRef.current.scale) {
             hoverPos = { x: firstNode.x, y: firstNode.y };
         }
      }
      
      if (tools.tool === "pen" && !liveRef.current) {
         const ps = useProject.getState();
         const layer = ps.project.layers[ps.layerIndex];
         const cel = layer ? (ps.project.workflow === "animatron" ? layer.frames.find(f => f) ?? null : resolveCel(layer, ps.frameIndex)) : null;
         if (cel) {
           const bestHit = findNodeInsert(x, y, cel, fitRef.current.scale);
           if (bestHit) {
             const penAddSvg = `<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="white" stroke="black" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 19l7-7 3 3-7 7-3-3z"></path><path d="M18 13l-1.5-7.5L2 2l3.5 14.5L13 18l5-5z"></path><path d="M2 2l7.586 7.586"></path><circle cx="11" cy="11" r="2" fill="none"></circle><path d="M17 19h4m-2-2v4" stroke="#007bff" stroke-width="2.5" fill="none"/></svg>`;
             const b64 = btoa(penAddSvg);
             cursor = `url("data:image/svg+xml;base64,${b64}") 2 2, crosshair`;
           }
         }
      }

      if (
        tools.tool === "select" &&
        e.buttons === 0 &&
        textWidthSpots.some((h) => {
          const rect = canvas.getBoundingClientRect();
          const sx = e.clientX - rect.left;
          const sy = e.clientY - rect.top;
          return Math.hypot(h.sx - sx, h.sy - sy) <= HANDLE_HIT_PX + 2;
        })
      ) {
        cursor = "ew-resize";
      } else if (
        tools.tool === "select" &&
        e.buttons === 0 &&
        selBBoxRef.current
      ) {
        const rect = canvas.getBoundingClientRect();
        const sx = e.clientX - rect.left;
        const sy = e.clientY - rect.top;
        const b = selBBoxRef.current;
        if (sx >= b.x && sy >= b.y && sx <= b.x + b.w && sy <= b.y + b.h) {
          cursor = "move";
        }
      }

      if (!panRef.current) canvas.style.cursor = cursor;

      dirtyRef.current = true;

      // Intentionally no hover-select: V-mode selection is click / Shift+click
      // only. Hover used to call sel.set([id]) and wiped multi-select.

      const marquee = marqueeRef.current;
      if (marquee) {
        marquee.currentX = x;
        marquee.currentY = y;
        dirtyRef.current = true;
        return;
      }

      const pan = panRef.current;
      if (pan) {
        useViewport.getState().setPan(
          pan.startPanX + (e.clientX - pan.startX),
          pan.startPanY + (e.clientY - pan.startY),
        );
        dirtyRef.current = true;
        return;
      }

      const textResize = textResizeRef.current;
      if (textResize) {
        const dx = x - textResize.startX;
        if (textResize.edge === "right") {
          textResize.width = Math.max(40, textResize.startWidth + dx);
          textResize.textX = textResize.startTextX;
        } else {
          const width = Math.max(40, textResize.startWidth - dx);
          textResize.width = width;
          textResize.textX =
            textResize.startTextX + (textResize.startWidth - width);
        }
        dirtyRef.current = true;
        return;
      }

      const xf = transformRef.current;
      if (xf) {
        const { x, y } = toProject(e);
        if (xf.mode === "scale") {
          const dist = Math.hypot(x - xf.pivotX, y - xf.pivotY) || 0.001;
          xf.scale = Math.max(0.05, Math.min(20, dist / xf.startDist));
        } else {
          const angle = Math.atan2(y - xf.pivotY, x - xf.pivotX);
          xf.rotation = angle - xf.startAngle;
        }
        dirtyRef.current = true;
        return;
      }
      const warp = warpRef.current;
      if (warp) {
        const { x, y } = toProject(e);
        if (warp.isBezier && warp.origBezierNodes) {
           const nodes = warp.origBezierNodes.map(n => ({
             ...n,
             handleIn: n.handleIn ? { ...n.handleIn } : undefined,
             handleOut: n.handleOut ? { ...n.handleOut } : undefined
           }));
           const dx = x - warp.startX;
           const dy = y - warp.startY;
           
           if ((warp.handleType === "node" || !warp.handleType) && warp.selectedNodeIndices && warp.selectedNodeIndices.length > 0) {
             if (e.altKey && warp.selectedNodeIndices.length === 1) {
               const node = nodes[warp.selectedNodeIndices[0]];
               node.handleOut = { x: node.x + dx, y: node.y + dy };
               node.handleIn = { x: node.x - dx, y: node.y - dy };
             } else {
               for (const idx of warp.selectedNodeIndices) {
                 const node = nodes[idx];
                 node.x += dx;
                 node.y += dy;
                 if (node.handleIn) {
                   node.handleIn.x += dx;
                   node.handleIn.y += dy;
                 }
                 if (node.handleOut) {
                   node.handleOut.x += dx;
                   node.handleOut.y += dy;
                 }
               }
             }
           } else {
              const node = nodes[warp.handleIndex];
              const origNode = warp.origBezierNodes[warp.handleIndex];
              
              const getCollinearState = (n: any) => {
                  if (!n.handleIn || !n.handleOut) return { collinear: false, outLen: 0, inLen: 0 };
                  const dx1 = n.handleIn.x - n.x;
                  const dy1 = n.handleIn.y - n.y;
                  const dx2 = n.handleOut.x - n.x;
                  const dy2 = n.handleOut.y - n.y;
                  const a1 = Math.atan2(dy1, dx1);
                  const a2 = Math.atan2(dy2, dx2);
                  let diff = Math.abs(a1 - a2);
                  while (diff >= Math.PI * 2) diff -= Math.PI * 2;
                  return {
                      collinear: Math.abs(diff - Math.PI) < 0.05 || Math.abs(diff - Math.PI) > Math.PI * 2 - 0.05,
                      inLen: Math.hypot(dx1, dy1),
                      outLen: Math.hypot(dx2, dy2)
                  };
              };

              if (warp.handleType === "handleIn") {
                if (node.handleIn) {
                  node.handleIn.x += dx;
                  node.handleIn.y += dy;
                }
                if (node.handleOut) {
                  if (e.altKey) {
                    node.handleOut.x = node.x - (node.handleIn!.x - node.x);
                    node.handleOut.y = node.y - (node.handleIn!.y - node.y);
                  } else if (e.ctrlKey) {
                    // independent, do nothing to out
                  } else {
                    const state = getCollinearState(origNode);
                    if (state.collinear && node.handleIn) {
                      const newAngle = Math.atan2(node.handleIn.y - node.y, node.handleIn.x - node.x);
                      node.handleOut.x = node.x - Math.cos(newAngle) * state.outLen;
                      node.handleOut.y = node.y - Math.sin(newAngle) * state.outLen;
                    }
                  }
                }
              } else if (warp.handleType === "handleOut") {
                if (node.handleOut) {
                  node.handleOut.x += dx;
                  node.handleOut.y += dy;
                }
                if (node.handleIn) {
                  if (e.altKey) {
                    node.handleIn.x = node.x - (node.handleOut!.x - node.x);
                    node.handleIn.y = node.y - (node.handleOut!.y - node.y);
                  } else if (e.ctrlKey) {
                    // independent, do nothing to in
                  } else {
                    const state = getCollinearState(origNode);
                    if (state.collinear && node.handleOut) {
                      const newAngle = Math.atan2(node.handleOut.y - node.y, node.handleOut.x - node.x);
                      node.handleIn.x = node.x - Math.cos(newAngle) * state.inLen;
                      node.handleIn.y = node.y - Math.sin(newAngle) * state.inLen;
                    }
                  }
                }
              }
            }
           
           warp.currentBezierNodes = nodes;
        } else {
           warp.currentPoints = warpPoints(warp.origPoints, warp.handleIndex, x - warp.startX, y - warp.startY);
        }
        dirtyRef.current = true;
        return;
      }
      const move = moveRef.current;
      if (move) {
        const { x, y } = toProject(e);
        move.dx = x - move.startX;
        move.dy = y - move.startY;
        dirtyRef.current = true;
        return;
      }
      const currentLive = liveRef.current;
      if (!currentLive) return;

      if (currentLive.stroke.brush === "pen") {
        const isDragging = (e.buttons & 1) !== 0;
        if (isDragging) {
          const { x, y } = toProject(e);
          const nodes = currentLive.stroke.bezierNodes;
          if (nodes && nodes.length > 0) {
            const last = nodes[nodes.length - 1];
            last.handleOut = { x, y };
            if (!e.ctrlKey) {
              last.handleIn = { x: last.x * 2 - x, y: last.y * 2 - y }; // Symmetric
            }
          }
        }
        dirtyRef.current = true;
        return;
      }

      let events: PointerEvent[] = e.getCoalescedEvents ? e.getCoalescedEvents() : [];
      if (events.length === 0) events = [e]; // synthetic events coalesce to []
      for (const ev of events) {
        const { x, y } = toProject(ev as PointerEvent);
        const p = pressure.read(ev as PointerEvent, x, y, ev.timeStamp);
        currentLive.points.push({ x, y, pressure: p, t: ev.timeStamp - strokeStart });
      }
      // Shift constrains the stroke to a straight line from its start point
      if (e.shiftKey && currentLive.points.length > 1) {
        currentLive.points = straightLinePoints(currentLive.points[0], currentLive.points[currentLive.points.length - 1]);
      }
      dirtyRef.current = true;
    }

    function onPointerUp(e: PointerEvent) {
      try {
        canvas.releasePointerCapture(e.pointerId);
      } catch {
        // best-effort
      }

      if (panRef.current) {
        panRef.current = null;
        canvas.style.cursor = spaceRef.current ? "grab" : "";
        dirtyRef.current = true;
        return;
      }

      if (marqueeRef.current) {
        const m = marqueeRef.current;
        marqueeRef.current = null;
        
        const minX = Math.min(m.startX, m.currentX);
        const maxX = Math.max(m.startX, m.currentX);
        const minY = Math.min(m.startY, m.currentY);
        const maxY = Math.max(m.startY, m.currentY);
        
        const ps = useProject.getState();
        const sel = useSelection.getState();
        const tools = useTools.getState();
        
        const layer = ps.project.layers[ps.layerIndex];
        const cel = layer ? (ps.project.workflow === "animatron" ? layer.frames.find(f => f) ?? null : resolveCel(layer, ps.frameIndex)) : null;
        
        if (cel && (maxX - minX > 2 || maxY - minY > 2)) {
          if (tools.tool === "path" || ctrlRef.current) {
            const hitNodes: { strokeId: string; index: number }[] = [];
            const newlySelectedStrokeIds = new Set<string>();
            for (const s of cel.strokes) {
              if (s.bezierNodes) {
                s.bezierNodes.forEach((n, i) => {
                  if (n.x >= minX && n.x <= maxX && n.y >= minY && n.y <= maxY) {
                    hitNodes.push({ strokeId: s.id, index: i });
                    newlySelectedStrokeIds.add(s.id);
                  }
                });
              }
            }
            if (hitNodes.length > 0) {
              const currentStrokeIds = new Set(e.shiftKey ? sel.ids : []);
              newlySelectedStrokeIds.forEach(id => currentStrokeIds.add(id));
              sel.set(Array.from(currentStrokeIds));
            }
            if (e.shiftKey) {
              const currentNodes = [...sel.nodeIds];
              for (const n of hitNodes) {
                if (!currentNodes.some(cn => cn.strokeId === n.strokeId && cn.index === n.index)) {
                  currentNodes.push(n);
                }
              }
              sel.setNodes(currentNodes);
            } else {
              sel.setNodes(hitNodes);
            }
          } else if (tools.tool === "select") {
            const hitIds: string[] = [];
            for (const s of cel.strokes) {
              if (s.points) {
                for (const p of s.points) {
                  if (p.x >= minX && p.x <= maxX && p.y >= minY && p.y <= maxY) {
                    hitIds.push(s.id);
                    break;
                  }
                }
              }
            }
            if (cel.texts) {
              for (const t of cel.texts) {
                const aabb = textAABB(celCtx, t);
                if (
                  aabb.minX < maxX &&
                  aabb.maxX > minX &&
                  aabb.minY < maxY &&
                  aabb.maxY > minY
                ) {
                  hitIds.push(t.id);
                }
              }
            }
            if (e.shiftKey) {
              const currentIds = new Set(sel.ids);
              hitIds.forEach(id => currentIds.add(id));
              sel.set(Array.from(currentIds));
            } else {
              sel.set(hitIds);
            }
          }
        }
        dirtyRef.current = true;
        return;
      }
      const textResize = textResizeRef.current;
      if (textResize) {
        textResizeRef.current = null;
        if (
          textResize.width !== textResize.startWidth ||
          textResize.textX !== textResize.startTextX
        ) {
          useProject.getState().updateTextElement(textResize.id, {
            x: textResize.textX,
            boxWidth: textResize.width,
          });
        }
        dirtyRef.current = true;
        return;
      }
      const xf = transformRef.current;
      if (xf) {
        transformRef.current = null;
        if (xf.scale !== 1 || xf.rotation !== 0) {
          useProject
            .getState()
            .transformStrokes(xf.ids, xf.pivotX, xf.pivotY, xf.scale, xf.rotation);
        }
        dirtyRef.current = true;
        return;
      }
      const warp = warpRef.current;
      if (warp) {
        warpRef.current = null;
        if (warp.isBezier && warp.currentBezierNodes) {
          warp.currentPoints = flattenBezierNodes(warp.currentBezierNodes, !!warp.isClosed);
        }
        const ps = useProject.getState();
        const layer = ps.project.layers[ps.layerIndex];
        const animatron = ps.project.workflow === "animatron";
        const cel = layer
          ? animatron
            ? (layer.frames.find((f) => f) ?? null)
            : resolveCel(layer, ps.frameIndex)
          : null;
        const src = cel?.strokes.find((s) => s.id === warp.strokeId);
        const detach = src ? extrasAfterPathEdit(src) : undefined;
        useProject
          .getState()
          .replaceStrokePoints(
            warp.strokeId,
            warp.currentPoints,
            warp.currentBezierNodes,
            detach,
          );
        dirtyRef.current = true;
        return;
      }
      if (motionEditRef.current) {
        const edit = motionEditRef.current;
        motionEditRef.current = null;
        if (edit.dirty) {
          useProject.getState().updateMotionPath(edit.layerId, {
            id: edit.pathId,
            bezierNodes: edit.currentNodes,
            points: flattenBezierNodes(edit.currentNodes),
          });
        }
        dirtyRef.current = true;
        return;
      }
      if (pathDraftDragRef.current) {
        pathDraftDragRef.current = false;
        dirtyRef.current = true;
      }
      const move = moveRef.current;
      if (move) {
        moveRef.current = null;
        if (move.dx !== 0 || move.dy !== 0) {
          useProject.getState().translateStrokes(move.ids, move.dx, move.dy);
        }
        dirtyRef.current = true;
        return;
      }
      const live = liveRef.current;
      if (!live) return;

      if (live.stroke.brush === "pen") {
        dirtyRef.current = true;
        return;
      }

      liveRef.current = null;
      const gap = fillGapThreshold(live.stroke.size);
      const nearClosed =
        live.points.length >= 3 && isNearClosedLoop(live.points, gap);
      const points = nearClosed
        ? bridgeNearClosedPoints(live.points, gap)
        : live.points;
      const closed = live.stroke.closed || nearClosed;
      useProject.getState().addStroke({
        ...live.stroke,
        points,
        closed: closed || undefined,
      });
      dirtyRef.current = true;
    }

    const unsub = useProject.subscribe((s, prev) => {
      clearStaticCelCache();
      dirtyRef.current = true;
      if (
        s.project.width !== prev.project.width ||
        s.project.height !== prev.project.height
      ) {
        // Parent ResizeObserver won't fire — artboard px changed, not the DOM box.
        resize();
      }
    });
    const unsubPb = usePlayback.subscribe(() => (dirtyRef.current = true));
    const unsubSel = useSelection.subscribe(() => (dirtyRef.current = true));
    const unsubPathMaker = usePathMaker.subscribe(() => (dirtyRef.current = true));
    const unsubTools = useTools.subscribe((s, prev) => {
      if (prev.tool === "pen" && s.tool !== "pen") {
        const live = liveRef.current;
        if (live && live.stroke.brush === "pen") {
          liveRef.current = null;
          if (live.stroke.bezierNodes && live.stroke.bezierNodes.length > 1) {
            live.stroke.points = flattenBezierNodes(live.stroke.bezierNodes);
            useProject.getState().addStroke({ ...live.stroke });
            useSelection.getState().set([live.stroke.id]);
          }
        }
      }
      if (
        activeShapeTool(prev.tool, prev.lastShapeTool) &&
        !activeShapeTool(s.tool, s.lastShapeTool)
      ) {
        liveRef.current = null;
      }
      if (s.tool !== prev.tool && !panRef.current) {
        canvas.style.cursor = cursorForTool(s.tool);
      }
      if (s.tool !== "fill" && fillPreviewRef.current) {
        fillPreviewRef.current = null;
      }
      dirtyRef.current = true;
    });
    const unsubZoom = useViewport.subscribe(() => {
      resize();
      dirtyRef.current = true;
    });
    const ro = new ResizeObserver(resize);
    ro.observe(canvas.parentElement!);
    resize();
    scheduleNext();
    document.addEventListener("visibilitychange", onVisibility);
    function onVisibility() {
      // switch scheduling mode immediately so the loop never stalls
      cancelScheduled();
      scheduleNext();
    }

    function onWheel(e: WheelEvent) {
      e.preventDefault();
      if (e.ctrlKey || e.metaKey) {
        if (e.deltaY < 0) useViewport.getState().zoomIn();
        else if (e.deltaY > 0) useViewport.getState().zoomOut();
        return;
      }
      useViewport.getState().panBy(-e.deltaX, -e.deltaY);
    }

    function onKeyDown(e: KeyboardEvent) {
      if (e.key === "Control") ctrlRef.current = true;
      if (e.key === "Escape" || e.key === "Enter") {
        const pm = usePathMaker.getState();
        if (PATH_MAKER_ENABLED && pm.mode === "draw") {
          if (e.key === "Escape") {
            pm.clearDraft();
            dirtyRef.current = true;
            return;
          }
          // Enter — commit if enough nodes (PathMakerPanel also has Attach)
          if (pm.draftNodes.length >= 2) {
            dirtyRef.current = true;
            return;
          }
        }
        const live = liveRef.current;
        if (live && live.stroke.brush === "pen") {
          e.preventDefault();
          e.stopImmediatePropagation();
          liveRef.current = null;
          const nodes = live.stroke.bezierNodes;
          if (nodes && nodes.length > 1) {
            live.stroke.points = flattenBezierNodes(nodes, !!live.stroke.closed);
            useProject.getState().addStroke({ ...live.stroke });
            useSelection.getState().set([live.stroke.id]);
            useTools.getState().setTool("select");
          }
          dirtyRef.current = true;
          return;
        }
        if (e.key === "Escape" && liveRef.current) {
          e.preventDefault();
          e.stopImmediatePropagation();
          liveRef.current = null;
          dirtyRef.current = true;
          return;
        }
      }
      if (e.code !== "Space" || e.repeat) return;
      const target = e.target as HTMLElement;
      if (target.tagName === "INPUT" || target.tagName === "TEXTAREA" || target.isContentEditable)
        return;
      e.preventDefault();
      spaceRef.current = true;
      if (!panRef.current) canvas.style.cursor = "grab";
    }

    function onKeyUp(e: KeyboardEvent) {
      if (e.key === "Control") ctrlRef.current = false;
      if (e.code !== "Space") return;
      spaceRef.current = false;
      if (!panRef.current) canvas.style.cursor = "";
    }

    canvas.style.cursor = cursorForTool(useTools.getState().tool);
    canvas.addEventListener("pointerdown", onPointerDown);
    canvas.addEventListener("dblclick", onDblClick);
    canvas.addEventListener("pointermove", onPointerMove);
    canvas.addEventListener("pointerup", onPointerUp);
    canvas.addEventListener("pointercancel", onPointerUp);
    canvas.addEventListener("wheel", onWheel, { passive: false });
    window.addEventListener("keydown", onKeyDown);
    window.addEventListener("keyup", onKeyUp);

    return () => {
      cancelScheduled();
      document.removeEventListener("visibilitychange", onVisibility);
      window.removeEventListener("keydown", onKeyDown);
      window.removeEventListener("keyup", onKeyUp);
      unsub();
      unsubPb();
      unsubSel();
      unsubPathMaker();
      unsubTools();
      unsubZoom();
      ro.disconnect();
      canvas.removeEventListener("pointerdown", onPointerDown);
      canvas.removeEventListener("dblclick", onDblClick);
      canvas.removeEventListener("pointermove", onPointerMove);
      canvas.removeEventListener("pointerup", onPointerUp);
      canvas.removeEventListener("pointercancel", onPointerUp);
      canvas.removeEventListener("wheel", onWheel);
    };
  }, []);

  const toolsTool = useTools((s) => s.tool);
  const toolsLastShape = useTools((s) => s.lastShapeTool);
  const shapeCreateActive = activeShapeTool(toolsTool, toolsLastShape) !== null;
  const textCreateActive = toolsTool === "text";

  function applyTextToolSettings(hit: TextElement) {
    syncTextToolsFromElement(hit);
  }

  function ensureLayer(layerId: string | null) {
    if (!layerId) return;
    const ps = useProject.getState();
    const idx = ps.project.layers.findIndex((l) => l.id === layerId);
    if (idx !== -1 && idx !== ps.layerIndex) ps.setLayerIndex(idx);
  }

  return (
    <div className="absolute inset-0">
      <canvas ref={canvasRef} className="h-full w-full touch-none" />
      <LeaferEditLayer
        fitRef={fitRef}
        textEdit={textEdit}
        textCreateActive={textCreateActive}
        shapeCreateActive={shapeCreateActive}
        onTextCreate={(session) => {
          useSelection.getState().clear();
          setTextEdit(session);
        }}
        onTextSelect={(hit, layerId) => {
          ensureLayer(layerId);
          applyTextToolSettings(hit);
          // Clicking existing text while on Text tool → switch to V + purple select.
          useTools.getState().setTool("select");
          useSelection.getState().set([hit.id]);
          setTextEdit(null);
        }}
        onTextOpen={(hit, layerId) => {
          ensureLayer(layerId);
          applyTextToolSettings(hit);
          const box = measureTextBox(
            document.createElement("canvas").getContext("2d")!,
            hit,
          );
          const boxWidth = hit.boxWidth ?? Math.max(48, Math.ceil(box.w));
          setTextEdit({
            id: hit.id,
            text: hit.text,
            projectX: hit.x,
            projectY: hit.y,
            boxWidth,
            rotation: hit.rotation,
          });
          useSelection.getState().set([hit.id]);
        }}
        onTextCommit={(result) => {
          const tools = useTools.getState();
          const project = useProject.getState();
          const session = textEditRef.current;
          if (!session) return;
          if (result) {
            const targetId = session.id || crypto.randomUUID();
            const patch = {
              text: result.text,
              x: result.projectX,
              y: result.projectY,
              fontFamily: tools.fontFamily,
              size: tools.textSize,
              color: tools.color,
              bold: tools.textBold,
              italic: tools.textItalic,
              align: tools.textAlign,
              letterSpacing: tools.letterSpacing,
              underline: tools.textUnderline,
              strikethrough: tools.textStrikethrough,
              textCase: tools.textCase,
              opacity: tools.textOpacity,
              backgroundColor: tools.textBackgroundColor,
              shadow: tools.textShadow,
              blendMode: tools.textBlendMode,
              path:
                tools.textPath.shape === "none" ? null : { ...tools.textPath },
              boxWidth: result.boxWidth,
              rotation: result.rotation ?? session.rotation,
            };
            if (session.id) {
              project.updateTextElement(targetId, patch);
            } else {
              project.addTextElement({
                id: targetId,
                ...patch,
                typewriterSpeed: tools.textTypewriter
                  ? tools.textTypewriterSpeed
                  : 0,
              });
            }
            // Finish like Framer: land on V with the purple selection box.
            useSelection.getState().set([targetId]);
            tools.setTool("select");
          } else if (session.id) {
            project.removeTextElement(session.id);
          }
          setTextEdit(null);
        }}
      />
    </div>
  );
}





