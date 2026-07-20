import { useEffect, useRef } from "react";
import { useProject } from "@/state/project";
import { useTools } from "@/state/tools";
import { usePlayback } from "@/state/playback";
import { useSelection } from "@/state/selection";
import { useViewport } from "@/state/viewport";
import { renderStrokes, renderStroke } from "@/engine/renderer";
import { PressureTracker } from "@/engine/pressure";
import { paintBackground } from "@/engine/background";
import {
  straightLinePoints,
  warpPoints,
  translatePoints,
  handleIndices,
  distanceToPoints,
  pointsBounds,
  HANDLE_HIT_PX,
} from "@/engine/pathEdit";
import { strokeAtTime } from "@/engine/strokeProgress";
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
    startX: number;
    startY: number;
    origPoints: StrokePoint[];
    currentPoints: StrokePoint[];
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

  useEffect(() => {
    const canvas = canvasRef.current!;
    const ctx = canvas.getContext("2d")!;
    const pressure = new PressureTracker();
    let strokeStart = 0;
    let handleSpots: { strokeId: string; index: number; sx: number; sy: number }[] = [];

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
      const zoom = useViewport.getState().zoom;
      const scale = Math.min(canvas.width / pw, canvas.height / ph) * 0.82 * zoom;
      fitRef.current = {
        scale,
        ox: (canvas.width - pw * scale) / 2,
        oy: (canvas.height - ph * scale) / 2,
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
    ) {
      celCtx.setTransform(DRAFT_SCALE, 0, 0, DRAFT_SCALE, 0, 0);
      celCtx.clearRect(0, 0, celCanvas.width / DRAFT_SCALE, celCanvas.height / DRAFT_SCALE);
      renderStrokes(celCtx, strokes, { quality: "draft", colorOverride, displaced });
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
      artCtx.setTransform(1, 0, 0, 1, 0, 0);
      artCtx.clearRect(0, 0, artCanvas.width, artCanvas.height);

      // onion ghost: previous frame's cel on the active layer (skip if held/same cel)
      const activeLayer = ps.project.layers[ps.layerIndex];
      if (pb.onionSkin && !pb.playing && activeLayer && !activeLayer.isStatic && ps.frameIndex > 0) {
        const prevIdx = resolveCelIndex(activeLayer, ps.frameIndex - 1);
        const curIdx = resolveCelIndex(activeLayer, ps.frameIndex);
        if (prevIdx !== null && prevIdx !== curIdx) {
          const ghost = activeLayer.frames[prevIdx]!;
          compositeCel(ghost.strokes, null, null, 0.28, "#e0504f");
        }
      }

      const live = liveRef.current;
      const warp = warpRef.current;
      const move = moveRef.current;
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
        if (warp && isTarget) displaced.set(warp.strokeId, warp.currentPoints);
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
        );
      });

      // --- stage ---
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.fillStyle = "#0b0b0d";
      ctx.fillRect(0, 0, canvas.width, canvas.height);

      // artboard: project background, or checkerboard when none
      bgCtx.setTransform(DRAFT_SCALE, 0, 0, DRAFT_SCALE, 0, 0);
      bgCtx.clearRect(0, 0, pw, ph);
      const hasBg = paintBackground(bgCtx, ps.project, {
        onImageReady: () => (dirtyRef.current = true),
      });

      const bx = ox, by = oy, bw = pw * scale, bh = ph * scale;
      ctx.save();
      ctx.beginPath();
      ctx.rect(bx, by, bw, bh);
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
      ctx.strokeRect(bx, by, bw, bh);

      // --- selection overlay (select tool) ---
      handleSpots = [];
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
          if (bounds) {
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
          }
          // warp handles for a single selected stroke
          if (selStrokes.length === 1) {
            const s = selStrokes[0];
            const pts = ptsOf(s);
            for (const i of handleIndices(pts.length)) {
              const pt = pts[i];
              if (!pt || !Number.isFinite(pt.x) || !Number.isFinite(pt.y)) continue;
              const sx = bx + pt.x * scale;
              const sy = by + pt.y * scale;
              handleSpots.push({ strokeId: s.id, index: i, sx, sy });
              ctx.fillStyle = "#0e0e11";
              ctx.strokeStyle = "#39c5e8";
              ctx.lineWidth = 1.4;
              ctx.beginPath();
              ctx.rect(sx - 4, sy - 4, 8, 8);
              ctx.fill();
              ctx.stroke();
            }
          }
        }
      } catch {
        // never let overlay bugs kill the rAF loop (crash → restore banner)
        handleSpots = [];
        selBBoxRef.current = null;
      }
    }

    function onPointerDown(e: PointerEvent) {
      const tools = useTools.getState();
      if (e.button !== 0) return;

      if (tools.tool === "select") {
        const sel = useSelection.getState();
        const rect = canvas.getBoundingClientRect();
        const sx = e.clientX - rect.left;
        const sy = e.clientY - rect.top;

        // grab a warp handle first
        const spot = handleSpots.find((h) => Math.hypot(h.sx - sx, h.sy - sy) <= HANDLE_HIT_PX);
        if (spot) {
          const ps = useProject.getState();
          const layer = ps.project.layers[ps.layerIndex];
          const animatron = ps.project.workflow === "animatron";
          const cel = layer
            ? animatron
              ? layer.frames.find((f) => f) ?? null
              : resolveCel(layer, ps.frameIndex)
            : null;
          const stroke = cel?.strokes.find((s) => s.id === spot.strokeId);
          if (stroke?.points?.length) {
            try {
              canvas.setPointerCapture(e.pointerId);
            } catch {
              // best-effort
            }
            const { x, y } = toProject(e);
            warpRef.current = {
              strokeId: stroke.id,
              handleIndex: spot.index,
              startX: x,
              startY: y,
              origPoints: stroke.points,
              currentPoints: stroke.points,
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
          const ps = useProject.getState();
          const layer = ps.project.layers[ps.layerIndex];
          const animatron = ps.project.workflow === "animatron";
          const cel = layer
            ? animatron
              ? layer.frames.find((f) => f) ?? null
              : resolveCel(layer, ps.frameIndex)
            : null;
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

        // otherwise pick a stroke (topmost wins), shift toggles
        const { x, y } = toProject(e);
        const ps = useProject.getState();
        const layer = ps.project.layers[ps.layerIndex];
        const animatron = ps.project.workflow === "animatron";
        const cel = layer
          ? animatron
            ? layer.frames.find((f) => f) ?? null
            : resolveCel(layer, ps.frameIndex)
          : null;
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
          sel.clear();
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
      const { x, y } = toProject(e);
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
        },
        points: [{ x, y, pressure: p, t: 0 }],
      };
      dirtyRef.current = true;
    }

    function onPointerMove(e: PointerEvent) {
      const warp = warpRef.current;
      if (warp) {
        const { x, y } = toProject(e);
        warp.currentPoints = warpPoints(
          warp.origPoints,
          warp.handleIndex,
          x - warp.startX,
          y - warp.startY,
        );
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
      const live = liveRef.current;
      if (!live) return;
      let events: PointerEvent[] = e.getCoalescedEvents ? e.getCoalescedEvents() : [];
      if (events.length === 0) events = [e]; // synthetic events coalesce to []
      for (const ev of events) {
        const { x, y } = toProject(ev as PointerEvent);
        const p = pressure.read(ev as PointerEvent, x, y, ev.timeStamp);
        live.points.push({ x, y, pressure: p, t: ev.timeStamp - strokeStart });
      }
      // Shift constrains the stroke to a straight line from its start point
      if (e.shiftKey && live.points.length > 1) {
        live.points = straightLinePoints(live.points[0], live.points[live.points.length - 1]);
      }
      dirtyRef.current = true;
    }

    function onPointerUp(e: PointerEvent) {
      const warp = warpRef.current;
      if (warp) {
        warpRef.current = null;
        try {
          canvas.releasePointerCapture(e.pointerId);
        } catch {
          // best-effort
        }
        useProject.getState().replaceStrokePoints(warp.strokeId, warp.currentPoints);
        dirtyRef.current = true;
        return;
      }
      const move = moveRef.current;
      if (move) {
        moveRef.current = null;
        try {
          canvas.releasePointerCapture(e.pointerId);
        } catch {
          // best-effort
        }
        if (move.dx !== 0 || move.dy !== 0) {
          useProject.getState().translateStrokes(move.ids, move.dx, move.dy);
        }
        dirtyRef.current = true;
        return;
      }
      const live = liveRef.current;
      if (!live) return;
      liveRef.current = null;
      try {
        canvas.releasePointerCapture(e.pointerId);
      } catch {
        // paired with best-effort capture above
      }
      useProject.getState().addStroke({ ...live.stroke, points: live.points });
      dirtyRef.current = true;
    }

    const unsub = useProject.subscribe(() => (dirtyRef.current = true));
    const unsubPb = usePlayback.subscribe(() => (dirtyRef.current = true));
    const unsubSel = useSelection.subscribe(() => (dirtyRef.current = true));
    const unsubTools = useTools.subscribe(() => (dirtyRef.current = true));
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
      if (!(e.ctrlKey || e.metaKey)) return;
      e.preventDefault();
      if (e.deltaY < 0) useViewport.getState().zoomIn();
      else if (e.deltaY > 0) useViewport.getState().zoomOut();
    }

    canvas.addEventListener("pointerdown", onPointerDown);
    canvas.addEventListener("pointermove", onPointerMove);
    canvas.addEventListener("pointerup", onPointerUp);
    canvas.addEventListener("pointercancel", onPointerUp);
    canvas.addEventListener("wheel", onWheel, { passive: false });

    return () => {
      cancelScheduled();
      document.removeEventListener("visibilitychange", onVisibility);
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
