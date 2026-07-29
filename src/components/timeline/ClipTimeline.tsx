import { useEffect, useRef, useState } from "react";
import { useReducedMotion } from "motion/react";
import { cn } from "@/lib/utils";
import { useProject } from "@/state/project";
import { PAPER } from "@/components/chrome/paper-tokens";
import { Tooltip } from "@/components/motion/tooltip";
import {
  TimelineRowShell,
  CELL_H,
  LABEL_COL_W_ANIMATRON,
  LAYER_ROW_GAP,
  LAYER_ROW_PITCH,
} from "@/components/timeline/TimelineLayerRow";
import {
  animateClipPayload,
  isStaticLine,
  layerIsStaticLine,
  lineStrokesOf,
  rememberClipStart,
  staticClipPayload,
} from "@/components/timeline/lineTiming";

/** Default px/ms at zoom=1 — TimingBar zoom multiplies this. */
export const BASE_PX_PER_MS = 0.08;
const MIN_TRACK_MS = 4000;

/**
 * Animatron clip timeline — one track per layer.
 *
 * Rows use the **same** `TimelineRowShell` as the stop-motion exposure sheet, so
 * both workflows share one row design (card, grip, eye, name pill, hover tint,
 * `⋮`→trash, pointer-drag reorder). Only the track lane differs: frame cells
 * there, clip bars here. An Animate/Static toggle sits after the eye.
 *
 * Scroll + zoom live in the parent `Timeline` (shared `TimelineTimingBar` +
 * nano ScrollArea), matching stop-motion — this component only paints clips.
 */

export function ClipTimeline({
  pxPerMs,
  showLabels = true,
}: {
  pxPerMs: number;
  showLabels?: boolean;
}) {
  const project = useProject((s) => s.project);
  const layerIndex = useProject((s) => s.layerIndex);
  const clipEasing = useProject((s) => s.clipEasing);
  const setFrameIndex = useProject((s) => s.setFrameIndex);
  const setLayerIndex = useProject((s) => s.setLayerIndex);
  const toggleLayerVisible = useProject((s) => s.toggleLayerVisible);
  const deleteLayer = useProject((s) => s.deleteLayer);
  const reorderLayer = useProject((s) => s.reorderLayer);
  const updateStrokeClip = useProject((s) => s.updateStrokeClip);

  const [openMenuIndex, setOpenMenuIndex] = useState<number | null>(null);
  const [layerDrag, setLayerDrag] = useState<{ from: number; dy: number } | null>(null);
  const layerDragRef = useRef<{ from: number; startY: number } | null>(null);

  const totalMs = Math.max(
    MIN_TRACK_MS,
    (project.frameCount / Math.max(project.fps, 1)) * 1000,
  );
  const trackW = totalMs * pxPerMs;
  /** row card = padding + optional label lane + gap + full track */
  const rowW =
    10 + (showLabels ? LABEL_COL_W_ANIMATRON + 10 : 0) + trackW;

  const dragRef = useRef<{
    strokeId: string;
    mode: "move" | "start" | "end";
    originX: number;
    startMs: number;
    durationMs: number;
  } | null>(null);
  const [, force] = useState(0);

  const layerCount = project.layers.length;
  const dropIndex = layerDrag
    ? Math.max(
        0,
        Math.min(layerCount - 1, layerDrag.from + Math.round(layerDrag.dy / LAYER_ROW_PITCH)),
      )
    : null;

  /** same reorder choreography as the stop-motion sheet (see Timeline.tsx) */
  function rowDragOffset(li: number) {
    if (!layerDrag || dropIndex === null) return 0;
    const { from, dy } = layerDrag;
    if (li === from) return dy;
    if (from < dropIndex && li > from && li <= dropIndex) return -LAYER_ROW_PITCH;
    if (from > dropIndex && li >= dropIndex && li < from) return LAYER_ROW_PITCH;
    return 0;
  }

  useEffect(() => {
    if (!layerDrag) return;
    function targetIndex(from: number, dy: number) {
      return Math.max(0, Math.min(layerCount - 1, from + Math.round(dy / LAYER_ROW_PITCH)));
    }
    function onMove(e: PointerEvent) {
      const drag = layerDragRef.current;
      if (!drag) return;
      setLayerDrag({ from: drag.from, dy: e.clientY - drag.startY });
    }
    function onUp(e: PointerEvent) {
      const drag = layerDragRef.current;
      layerDragRef.current = null;
      setLayerDrag(null);
      if (!drag) return;
      const to = targetIndex(drag.from, e.clientY - drag.startY);
      if (to !== drag.from) reorderLayer(drag.from, to);
    }
    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
    window.addEventListener("pointercancel", onUp);
    return () => {
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
      window.removeEventListener("pointercancel", onUp);
    };
  }, [layerDrag, layerCount, reorderLayer]);

  function msFromClientX(clientX: number, trackEl: HTMLElement) {
    const rect = trackEl.getBoundingClientRect();
    const x = clientX - rect.left;
    return Math.max(0, x / pxPerMs);
  }

  function onTrackPointerDown(e: React.PointerEvent<HTMLDivElement>) {
    if ((e.target as HTMLElement).closest("[data-clip]")) return;
    const ms = msFromClientX(e.clientX, e.currentTarget);
    const fi = Math.min(
      project.frameCount - 1,
      Math.max(0, Math.round((ms / 1000) * project.fps)),
    );
    setFrameIndex(fi);
  }

  function beginClipDrag(
    e: React.PointerEvent,
    strokeId: string,
    mode: "move" | "start" | "end",
    startMs: number,
    durationMs: number,
  ) {
    e.stopPropagation();
    e.preventDefault();
    try {
      (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    } catch {
      // synthetic events throw here — harmless
    }
    dragRef.current = { strokeId, mode, originX: e.clientX, startMs, durationMs };
  }

  function onClipPointerMove(e: React.PointerEvent) {
    const d = dragRef.current;
    if (!d) return;
    const deltaMs = (e.clientX - d.originX) / pxPerMs;
    let startMs = d.startMs;
    let durationMs = d.durationMs;
    if (d.mode === "move") {
      startMs = Math.max(0, d.startMs + deltaMs);
    } else if (d.mode === "start") {
      const end = d.startMs + d.durationMs;
      startMs = Math.max(0, Math.min(end - 40, d.startMs + deltaMs));
      durationMs = end - startMs;
    } else {
      durationMs = Math.max(40, d.durationMs + deltaMs);
    }
    updateStrokeClip(d.strokeId, { startMs, durationMs });
    force((n) => n + 1);
  }

  function onClipPointerUp(e: React.PointerEvent) {
    if (!dragRef.current) return;
    try {
      (e.currentTarget as HTMLElement).releasePointerCapture(e.pointerId);
    } catch {
      // best-effort
    }
    dragRef.current = null;
  }

  function toggleLayerStatic(layerId: string) {
    const layer = project.layers.find((l) => l.id === layerId);
    if (!layer) return;
    const strokes = lineStrokesOf(layer);
    if (strokes.length === 0) return;
    const makeStatic = !layerIsStaticLine(layer);
    for (const stroke of strokes) {
      if (makeStatic) {
        rememberClipStart(stroke);
        updateStrokeClip(stroke.id, staticClipPayload(stroke.clip?.easing ?? clipEasing));
      } else {
        updateStrokeClip(stroke.id, animateClipPayload(stroke, stroke.clip?.easing ?? clipEasing));
      }
    }
  }

  return (
    <div className="relative" style={{ width: rowW, minWidth: "100%" }}>
      <div className="relative flex flex-col" style={{ gap: LAYER_ROW_GAP }}>
        {project.layers.map((layer, li) => {
          const cel = layer.frames.find((f) => f) ?? null;
          const stroke = cel?.strokes[0];
          const clip = stroke?.clip;
          const staticLine = stroke ? isStaticLine(stroke) : false;
          const hasLine = !!stroke;
          return (
            <TimelineRowShell
              key={layer.id}
              layer={layer}
              active={li === layerIndex}
              canDelete={layerCount > 1}
              menuOpen={openMenuIndex === li}
              onMenuOpenChange={(open) => setOpenMenuIndex(open ? li : null)}
              onSelectLayer={() => setLayerIndex(li)}
              onToggleVisible={() => toggleLayerVisible(li)}
              showLabels={showLabels}
              labelColW={LABEL_COL_W_ANIMATRON}
              className="w-full max-w-none"
              afterEye={
                hasLine ? (
                  <LineAnimateToggle
                    staticLine={staticLine}
                    onToggle={() => toggleLayerStatic(layer.id)}
                  />
                ) : undefined
              }
              dragging={layerDrag?.from === li}
              dragOffset={rowDragOffset(li)}
              animateOffset={layerDrag?.from !== li}
              onGripPointerDown={(e) => {
                e.preventDefault();
                layerDragRef.current = { from: li, startY: e.clientY };
                setLayerDrag({ from: li, dy: 0 });
              }}
              onDelete={() => deleteLayer(li)}
            >
              <div
                className="relative shrink-0"
                style={{ height: CELL_H, width: trackW, minWidth: trackW }}
                onPointerDown={onTrackPointerDown}
              >
                <div className="relative h-full w-full">
                  {stroke && staticLine && (
                    <div
                      data-clip
                      className={cn(
                        "absolute top-0 overflow-clip rounded-[8px]",
                        li === layerIndex && "ring-1 ring-white/15",
                      )}
                      style={{
                        left: 0,
                        width: trackW,
                        height: CELL_H,
                        backgroundColor: PAPER.frameActive,
                        border: `0.4px solid ${PAPER.frameActiveBorder}`,
                      }}
                      aria-label={`${layer.name} — static`}
                    >
                      <div
                        className="truncate px-1.5 text-[10px] text-white/90"
                        style={{ fontFamily: PAPER.fontMono, lineHeight: `${CELL_H}px` }}
                      >
                        {layer.name} · static
                      </div>
                    </div>
                  )}
                  {clip && stroke && !staticLine && (
                    <div
                      data-clip
                      className={cn(
                        "absolute top-0 flex items-stretch overflow-clip rounded-[8px]",
                        li === layerIndex && "ring-1 ring-white/20",
                      )}
                      style={{
                        left: clip.startMs * pxPerMs,
                        width: Math.max(12, clip.durationMs * pxPerMs),
                        height: CELL_H,
                        backgroundColor: PAPER.frameActive,
                        border: `0.4px solid ${PAPER.frameActiveBorder}`,
                      }}
                      onPointerDown={(e) =>
                        beginClipDrag(e, stroke.id, "move", clip.startMs, clip.durationMs)
                      }
                      onPointerMove={onClipPointerMove}
                      onPointerUp={onClipPointerUp}
                    >
                      <button
                        type="button"
                        className="w-[5px] shrink-0 cursor-ew-resize bg-white/20"
                        onPointerDown={(e) =>
                          beginClipDrag(e, stroke.id, "start", clip.startMs, clip.durationMs)
                        }
                        onPointerMove={onClipPointerMove}
                        onPointerUp={onClipPointerUp}
                        aria-label="Resize clip start"
                      />
                      <div
                        className="min-w-0 flex-1 truncate px-1 text-[10px] text-white/90"
                        style={{ fontFamily: PAPER.fontMono, lineHeight: `${CELL_H}px` }}
                      >
                        {layer.name}
                      </div>
                      <button
                        type="button"
                        className="w-[5px] shrink-0 cursor-ew-resize bg-white/20"
                        onPointerDown={(e) =>
                          beginClipDrag(e, stroke.id, "end", clip.startMs, clip.durationMs)
                        }
                        onPointerMove={onClipPointerMove}
                        onPointerUp={onClipPointerUp}
                        aria-label="Resize clip end"
                      />
                    </div>
                  )}
                </div>
              </div>
            </TimelineRowShell>
          );
        })}
      </div>
    </div>
  );
}

/**
 * 14px Animate / Static toggle — same hit + opacity conventions as the eye.
 * Static = held bar; Animate = draw-on clock wedge.
 */
function LineAnimateToggle({
  staticLine,
  onToggle,
}: {
  staticLine: boolean;
  onToggle: () => void;
}) {
  const reduce = useReducedMotion() ?? false;
  return (
    <Tooltip content={staticLine ? "Static — on for the whole composition" : "Animate — draw on over time"}>
      <button
        type="button"
        onClick={(e) => {
          e.stopPropagation();
          onToggle();
        }}
        aria-label={staticLine ? "Make line animate" : "Make line static"}
        aria-pressed={staticLine}
        className={cn(
          "relative grid h-[14px] w-[14px] shrink-0 cursor-pointer place-items-center transition-[opacity,scale] duration-150 ease-out before:absolute before:-inset-[7px] before:content-['']",
          staticLine ? "opacity-40 hover:opacity-70" : "opacity-70 hover:opacity-100",
          !reduce && "active:scale-90",
        )}
      >
        {staticLine ? <StaticLineGlyph /> : <AnimateLineGlyph />}
      </button>
    </Tooltip>
  );
}

function AnimateLineGlyph() {
  return (
    <svg width={14} height={14} viewBox="0 0 14 14" aria-hidden>
      <circle cx="7" cy="7" r="5" fill="none" stroke="#DADADA" strokeWidth="1.2" />
      <path d="M7 7V3.5" stroke="#DADADA" strokeWidth="1.2" strokeLinecap="round" />
      <path d="M7 7L9.8 8.6" stroke="#DADADA" strokeWidth="1.2" strokeLinecap="round" />
    </svg>
  );
}

function StaticLineGlyph() {
  return (
    <svg width={14} height={14} viewBox="0 0 14 14" aria-hidden>
      <rect x="2" y="5.5" width="10" height="3" rx="1.5" fill="#DADADA" fillOpacity="0.85" />
    </svg>
  );
}
