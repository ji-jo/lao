import { useEffect, useRef } from "react";
import { useProject } from "@/state/project";
import { useTools, isBrushTool } from "@/state/tools";
import { usePlayback } from "@/state/playback";
import { useSelection } from "@/state/selection";
import { useViewport } from "@/state/viewport";
import { renderStrokes, renderStroke } from "@/engine/renderer";
import { PressureTracker } from "@/engine/pressure";
import { paintBackground } from "@/engine/background";
import { getShaderSnapshotCanvas } from "@/components/ShaderBackground";
import { getImageFilterSnapshotCanvas } from "@/components/ImageFilterBackground";
import { hasImageFilter } from "@/lib/image-filters";
import {
  straightLinePoints,
  warpPoints,
  translatePoints,
  transformPoints,
  boundsCenter,
  handleIndices,
  distanceToPoints,
  pointsBounds,
  HANDLE_HIT_PX,
} from "@/engine/pathEdit";
import { strokeAtTime } from "@/engine/strokeProgress";
import { flattenBezierNodes, projectToCubicBezier, splitCubicBezier } from "@/lib/bezier";
import { resolveCel, resolveCelIndex, type Stroke, type StrokePoint } from "@/model/types";

/**
 * The drawing stage. Committed + live strokes render into an offscreen "art"
 * canvas at project resolution (so the eraser's destination-out only affects
 * art, never the backdrop), which is then composited onto the visible canvas.
 * Edit mode renders the art canvas at reduced scale with smoothing off —
 * cheap and aliased on purpose.
 */

const DRAFT_SCALE = 0.5;

interface Fit {
  scale: number;
  ox: number;
  oy: number;
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
  const moveRef = useRef<{
    ids: string[];
    startX: number;
    startY: number;
    dx: number;
    dy: number;
    snapshots: Map<string, StrokePoint[]>;
  } | null>(null);
  const dirtyRef = useRef(true);
  const timerRef = useRef<{ kind: "raf" | "timeout"; id: number }>({ kind: "raf", id: 0 });
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
    snapshots: Map<string, { points: StrokePoint[]; size: number }>;
  } | null>(null);
  const spaceRef = useRef(false);
  const ctrlRef = useRef(false);

  useEffect(() => {
    const canvas = canvasRef.current!;
    const ctx = canvas.getContext("2d")!;
    const pressure = new PressureTracker();
    let strokeStart = 0;
    let handleSpots: { strokeId: string; index: number; sx: number; sy: number; type?: "node" | "handleIn" | "handleOut" }[] = [];
    let transformSpots: { kind: "scale" | "rotate"; sx: number; sy: number }[] = [];
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
      livePoints: StrokePoint[] | null,
      liveStroke: Stroke | null,
      alpha: number,
      colorOverride?: string,
      displaced?: Map<string, StrokePoint[]>,
      displacedBezier?: Map<string, import("@/model/types").BezierNode[]>,
    ) {
      celCtx.setTransform(DRAFT_SCALE, 0, 0, DRAFT_SCALE, 0, 0);
      celCtx.clearRect(0, 0, celCanvas.width / DRAFT_SCALE, celCanvas.height / DRAFT_SCALE);
      renderStrokes(celCtx, strokes, { quality: "draft", colorOverride, displaced, displacedBezier });
      if (liveStroke && livePoints)
        renderStroke(celCtx, liveStroke, { quality: "draft" }, livePoints);
      artCtx.save();
      artCtx.setTransform(1, 0, 0, 1, 0, 0);
      artCtx.globalAlpha = alpha;
      artCtx.drawImage(celCanvas, 0, 0);
      artCtx.restore();
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
            if (stepOpacity > 0 && ghost.strokes.length > 0) {
              compositeCel(ghost.strokes, null, null, stepOpacity, pb.onionColor);
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
        if (xf && isTarget) {
          strokes = strokes.map((s) => {
            if (!xf.ids.includes(s.id)) return s;
            const snap = xf.snapshots.get(s.id);
            if (!snap) return s;
            return {
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
          });
        }
        if (animatron && pb.playing) {
          strokes = strokes
            .map((s) => {
              const pts = strokeAtTime(s, timeMs);
              if (!pts) return null;
              return pts === s.points ? s : { ...s, points: pts };
            })
            .filter((s): s is Stroke => !!s);
        }
        const displaced = new Map<string, StrokePoint[]>();
        const displacedBezier = new Map<string, import("@/model/types").BezierNode[]>();
        if (warp && isTarget) {
          if (warp.isBezier && warp.currentBezierNodes) {
            displacedBezier.set(warp.strokeId, warp.currentBezierNodes);
          } else {
            displaced.set(warp.strokeId, warp.currentPoints);
          }
        }
        if (move && isTarget) {
          for (const id of move.ids) {
            const orig = move.snapshots.get(id);
            if (orig) displaced.set(id, translatePoints(orig, move.dx, move.dy));
          }
        }
        compositeCel(
          strokes,
          isTarget && live ? live.points : null,
          isTarget && live ? live.stroke : null,
          1,
          undefined,
          displaced.size ? displaced : undefined,
          displacedBezier.size ? displacedBezier : undefined,
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
      if (hasBg) {
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
      ctx.restore();

      ctx.strokeStyle = "#2b5cff";
      ctx.lineWidth = 1.5;
      artboardPath();
      ctx.stroke();

      // --- selection overlay (select tool) ---
      handleSpots = [];
      transformSpots = [];
      selBBoxRef.current = null;
      try {
        const selIds = useSelection.getState().ids;
        const selCel = activeLayer
          ? animatron
            ? activeLayer.frames.find((f) => f) ?? null
            : resolveCel(activeLayer, ps.frameIndex)
          : null;
        if (selIds.length && selCel) {
          const selStrokes = selCel.strokes.filter((s) => selIds.includes(s.id));
          const ptsOf = (s: Stroke) => {
            if (move && move.ids.includes(s.id)) {
              const orig = move.snapshots.get(s.id);
              if (orig) return translatePoints(orig, move.dx, move.dy);
            }
            if (warp && warp.strokeId === s.id) return warp.currentPoints;
            return s.points ?? [];
          };
          const allPts: StrokePoint[] = [];
          for (const s of selStrokes) allPts.push(...ptsOf(s));
          const bounds = pointsBounds(allPts);
          if (bounds && tools.tool !== "path") {
            const pad = 8;
            const rx = bx + bounds.minX * scale - pad;
            const ry = by + bounds.minY * scale - pad;
            const rw = (bounds.maxX - bounds.minX) * scale + pad * 2;
            const rh = (bounds.maxY - bounds.minY) * scale + pad * 2;
            selBBoxRef.current = { x: rx, y: ry, w: rw, h: rh };
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
            const rot = { sx: cx, sy: ry - 22 };
            transformSpots.push({ kind: "rotate", sx: rot.sx, sy: rot.sy });
            ctx.beginPath();
            ctx.moveTo(cx, ry);
            ctx.lineTo(rot.sx, rot.sy);
            ctx.strokeStyle = "#2b5cff88";
            ctx.lineWidth = 1;
            ctx.stroke();
            ctx.fillStyle = "#0e0e11";
            ctx.strokeStyle = "#f5a623";
            ctx.beginPath();
            ctx.arc(rot.sx, rot.sy, 5, 0, Math.PI * 2);
            ctx.fill();
            ctx.stroke();
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

    function findNodeInsert(x: number, y: number, cel: { strokes: Stroke[] }, scale: number) {
      let bestHit: { strokeId: string; insertIndex: number; t: number; dist: number } | null = null;
      for (const stroke of cel.strokes) {
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

    function celSnapshots(ids: string[], cel: { strokes: Stroke[] }) {
      const snapshots = new Map<string, { points: StrokePoint[]; size: number }>();
      for (const s of cel.strokes) {
        if (ids.includes(s.id)) {
          snapshots.set(s.id, {
            points: s.points.map((p) => ({ ...p })),
            size: s.size,
          });
        }
      }
      return snapshots;
    }

    function selectionPivot(ids: string[], cel: { strokes: Stroke[] }) {
      const allPts: StrokePoint[] = [];
      for (const s of cel.strokes) {
        if (ids.includes(s.id)) allPts.push(...s.points);
      }
      const bounds = pointsBounds(allPts);
      return bounds ? boundsCenter(bounds) : null;
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

    function onPointerDown(e: PointerEvent) {
      const tools = useTools.getState();
      if (e.button === 1 || (spaceRef.current && e.button === 0) || tools.tool === "hand") {
        beginPan(e);
        return;
      }
      if (e.button !== 0) return;

      if (tools.tool === "select" || tools.tool === "path" || ctrlRef.current) {
        const sel = useSelection.getState();
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

        // scale / rotate handles on the selection bbox
        if (sel.ids.length && cel) {
          const tspot = transformSpots.find(
            (h) => Math.hypot(h.sx - sx, h.sy - sy) <= HANDLE_HIT_PX,
          );
          const pivot = selectionPivot(sel.ids, cel);
          const snapshots = celSnapshots(sel.ids, cel);
          if (tspot && pivot && snapshots.size) {
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
              };
            }
            dirtyRef.current = true;
            return;
          }
        }

        // grab a warp handle first
        const spot = handleSpots.slice().reverse().find((h) => Math.hypot(h.sx - sx, h.sy - sy) <= HANDLE_HIT_PX);
        if (spot) {
          if (e.shiftKey) {
            sel.toggleNode(spot.strokeId, spot.index);
            dirtyRef.current = true;
            return;
          }
          if (e.detail === 2) {
            sel.setNodes([{ strokeId: spot.strokeId, index: spot.index }]);
            dirtyRef.current = true;
            return;
          }
          const stroke = cel?.strokes.find((s) => s.id === spot.strokeId);
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

            const pts = stroke.points || [];
            warpRef.current = {
              strokeId: stroke.id,
              origPoints: pts,
              currentPoints: pts,
              startX: x,
              startY: y,
              handleIndex: spot.index,
              handleType: spot.type,
              selectedNodeIndices: selectedIndices,
              isBezier: !!stroke.bezierNodes,
              origBezierNodes: stroke.bezierNodes,
              currentBezierNodes: stroke.bezierNodes,
              isClosed: stroke.closed,
            };
            dirtyRef.current = true;
            return;
          }
        }

        // drag inside selection bbox → group move
        const bbox = selBBoxRef.current;
        if (
          sel.ids.length &&
          bbox &&
          sx >= bbox.x &&
          sy >= bbox.y &&
          sx <= bbox.x + bbox.w &&
          sy <= bbox.y + bbox.h
        ) {
          if (cel) {
            const snapshots = new Map<string, StrokePoint[]>();
            for (const s of cel.strokes) {
              if (sel.ids.includes(s.id)) snapshots.set(s.id, s.points.map((p) => ({ ...p })));
            }
            if (snapshots.size) {
              try {
                canvas.setPointerCapture(e.pointerId);
              } catch {
                // best-effort
              }
              const { x, y } = toProject(e);
              moveRef.current = {
                ids: [...sel.ids],
                startX: x,
                startY: y,
                dx: 0,
                dy: 0,
                snapshots,
              };
              dirtyRef.current = true;
              return;
            }
          }
        }

        const { x, y } = toProject(e);



        // otherwise pick a stroke (topmost wins), shift toggles
        let hit: string | null = null;
        if (cel) {
          for (let i = cel.strokes.length - 1; i >= 0; i--) {
            const s = cel.strokes[i];
            if (!s.points?.length) continue;
            if (distanceToPoints(s.points, x, y) <= Math.max(s.size * 1.5, 12)) {
              hit = s.id;
              break;
            }
          }
        }
        if (hit) {
          if (e.shiftKey) sel.toggle(hit);
          else sel.set([hit]);
        } else {
          if (!e.shiftKey) {
            if (tools.tool === "select") sel.clear();
            if (tools.tool === "path" || ctrlRef.current) sel.clearNodes();
          }
          try {
            canvas.setPointerCapture(e.pointerId);
          } catch {}
          marqueeRef.current = { startX: x, startY: y, currentX: x, currentY: y };
        }
        dirtyRef.current = true;
        return;
      }

      if (!isBrushTool(tools.tool)) return;

      const { x, y } = toProject(e);

      if (tools.tool === "pen") {
        const ps = useProject.getState();
        const layer = ps.project.layers[ps.layerIndex];
        const cel = layer ? (ps.project.workflow === "animatron" ? layer.frames.find(f => f) ?? null : resolveCel(layer, ps.frameIndex)) : null;
        if (cel) {
           let bestHit = findNodeInsert(x, y, cel, fitRef.current.scale);
           if (bestHit) {
             const stroke = cel.strokes.find(s => s.id === bestHit!.strokeId);
             if (stroke && stroke.bezierNodes) {
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
               
               type BezierNodeWithMaybeHandles = { x: number; y: number; handleIn?: { x: number; y: number }; handleOut?: { x: number; y: number } };
               const newNodes: BezierNodeWithMaybeHandles[] = stroke.bezierNodes.map(n => ({
                 ...n,
                 handleIn: n.handleIn ? { ...n.handleIn } : undefined,
                 handleOut: n.handleOut ? { ...n.handleOut } : undefined
               }));
               
               const newNode: BezierNodeWithMaybeHandles = {
                 x: c1.p3.x,
                 y: c1.p3.y,
                 handleIn: { x: c1.p2.x, y: c1.p2.y },
                 handleOut: { x: c2.p1.x, y: c2.p1.y }
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
               useProject.getState().replaceStrokePoints(stroke.id, newPts, newNodes);
               
               const sel = useSelection.getState();
               if (!e.shiftKey) sel.clearNodes();
               sel.setNodes([{ strokeId: stroke.id, index: bestHit.insertIndex }]);
               
               try {
                 canvas.setPointerCapture(e.pointerId);
               } catch {}
               
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
               dirtyRef.current = true;
               return;
             }
           }
        }
      }

      if (tools.tool === "pen") {
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
          color: tools.color,
          size: tools.size,
          points: [],
          seed: Math.floor(Math.random() * 2 ** 31),
          jitter: tools.jitterByDefault,
          grain: tools.grainByDefault,
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
      
      let cursor = tools.tool === "hand" ? (panRef.current ? "grabbing" : "grab") : "crosshair";

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

      if (!panRef.current) canvas.style.cursor = cursor;

      dirtyRef.current = true;

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
        useProject.getState().replaceStrokePoints(warp.strokeId, warp.currentPoints, warp.currentBezierNodes);
        dirtyRef.current = true;
        return;
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
      useProject.getState().addStroke({ ...live.stroke, points: live.points });
      dirtyRef.current = true;
    }

    const unsub = useProject.subscribe(() => (dirtyRef.current = true));
    const unsubPb = usePlayback.subscribe(() => (dirtyRef.current = true));
    const unsubSel = useSelection.subscribe(() => (dirtyRef.current = true));
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
      if (e.key === "Enter" || e.key === "Escape") {
        const live = liveRef.current;
        if (live && live.stroke.brush === "pen") {
          liveRef.current = null;
          if (live.stroke.bezierNodes && live.stroke.bezierNodes.length > 1) {
            live.stroke.points = flattenBezierNodes(live.stroke.bezierNodes);
            useProject.getState().addStroke({ ...live.stroke });
          }
          dirtyRef.current = true;
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

    canvas.addEventListener("pointerdown", onPointerDown);
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
      unsubTools();
      unsubZoom();
      ro.disconnect();
      canvas.removeEventListener("pointerdown", onPointerDown);
      canvas.removeEventListener("pointermove", onPointerMove);
      canvas.removeEventListener("pointerup", onPointerUp);
      canvas.removeEventListener("pointercancel", onPointerUp);
      canvas.removeEventListener("wheel", onWheel);
    };
  }, []);

  return (
    <div className="absolute inset-0">
      <canvas ref={canvasRef} className="h-full w-full touch-none" />
    </div>
  );
}
