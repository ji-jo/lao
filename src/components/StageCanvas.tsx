import { useEffect, useRef } from "react";
import { useProject } from "@/state/project";
import { useTools } from "@/state/tools";
import { renderStrokes, renderStroke } from "@/engine/renderer";
import { PressureTracker } from "@/engine/pressure";
import type { Stroke, StrokePoint } from "@/model/types";

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
  const dirtyRef = useRef(true);
  const timerRef = useRef<{ kind: "raf" | "timeout"; id: number }>({ kind: "raf", id: 0 });

  useEffect(() => {
    const canvas = canvasRef.current!;
    const ctx = canvas.getContext("2d")!;
    const pressure = new PressureTracker();
    let strokeStart = 0;

    const artCanvas = document.createElement("canvas");
    artRef.current = artCanvas;
    const artCtx = artCanvas.getContext("2d")!;

    function projectSize() {
      const { width, height } = useProject.getState().project;
      return { pw: width, ph: height };
    }

    function resize() {
      const parent = canvas.parentElement!;
      canvas.width = parent.clientWidth;
      canvas.height = parent.clientHeight;
      const { pw, ph } = projectSize();
      const scale = Math.min(canvas.width / pw, canvas.height / ph) * 0.82;
      fitRef.current = {
        scale,
        ox: (canvas.width - pw * scale) / 2,
        oy: (canvas.height - ph * scale) / 2,
      };
      artCanvas.width = Math.max(Math.round(pw * DRAFT_SCALE), 1);
      artCanvas.height = Math.max(Math.round(ph * DRAFT_SCALE), 1);
      dirtyRef.current = true;
    }

    function toProject(e: PointerEvent): { x: number; y: number } {
      const rect = canvas.getBoundingClientRect();
      const { scale, ox, oy } = fitRef.current;
      return {
        x: (e.clientX - rect.left - ox) / scale,
        y: (e.clientY - rect.top - oy) / scale,
      };
    }

    function currentStrokes(): Stroke[] {
      const s = useProject.getState();
      const frame = s.project.layers[s.layerIndex]?.frames[s.frameIndex];
      return frame?.strokes ?? [];
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

      // --- art canvas: strokes at draft scale, aliased ---
      artCtx.setTransform(DRAFT_SCALE, 0, 0, DRAFT_SCALE, 0, 0);
      artCtx.clearRect(0, 0, pw, ph);
      renderStrokes(artCtx, currentStrokes(), { quality: "draft" });
      const live = liveRef.current;
      if (live) renderStroke(artCtx, live.stroke, { quality: "draft" }, live.points);

      // --- stage ---
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.fillStyle = "#0b0b0d";
      ctx.fillRect(0, 0, canvas.width, canvas.height);

      // artboard checkerboard
      const bx = ox, by = oy, bw = pw * scale, bh = ph * scale;
      ctx.save();
      ctx.beginPath();
      ctx.rect(bx, by, bw, bh);
      ctx.clip();
      ctx.fillStyle = "#141416";
      ctx.fillRect(bx, by, bw, bh);
      ctx.fillStyle = "#1c1c1f";
      const cell = 24;
      for (let y = 0; y * cell < bh; y++)
        for (let x = 0; x * cell < bw; x++)
          if ((x + y) % 2 === 0) ctx.fillRect(bx + x * cell, by + y * cell, cell, cell);
      // aliased on purpose in edit mode
      ctx.imageSmoothingEnabled = false;
      ctx.drawImage(artCanvas, bx, by, bw, bh);
      ctx.restore();

      ctx.strokeStyle = "#2b5cff";
      ctx.lineWidth = 1.5;
      ctx.strokeRect(bx, by, bw, bh);
    }

    function onPointerDown(e: PointerEvent) {
      const tools = useTools.getState();
      if (tools.tool === "select" || e.button !== 0) return;
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
      const live = liveRef.current;
      if (!live) return;
      let events: PointerEvent[] = e.getCoalescedEvents ? e.getCoalescedEvents() : [];
      if (events.length === 0) events = [e]; // synthetic events coalesce to []
      for (const ev of events) {
        const { x, y } = toProject(ev as PointerEvent);
        const p = pressure.read(ev as PointerEvent, x, y, ev.timeStamp);
        live.points.push({ x, y, pressure: p, t: ev.timeStamp - strokeStart });
      }
      dirtyRef.current = true;
    }

    function onPointerUp(e: PointerEvent) {
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

    canvas.addEventListener("pointerdown", onPointerDown);
    canvas.addEventListener("pointermove", onPointerMove);
    canvas.addEventListener("pointerup", onPointerUp);
    canvas.addEventListener("pointercancel", onPointerUp);

    return () => {
      cancelScheduled();
      document.removeEventListener("visibilitychange", onVisibility);
      unsub();
      ro.disconnect();
      canvas.removeEventListener("pointerdown", onPointerDown);
      canvas.removeEventListener("pointermove", onPointerMove);
      canvas.removeEventListener("pointerup", onPointerUp);
      canvas.removeEventListener("pointercancel", onPointerUp);
    };
  }, []);

  return (
    <div className="absolute inset-0">
      <canvas ref={canvasRef} className="h-full w-full touch-none" />
    </div>
  );
}
