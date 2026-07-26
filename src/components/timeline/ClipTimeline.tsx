import { useEffect, useRef, useState } from "react";
import { cn } from "@/lib/utils";
import { useProject } from "@/state/project";
import { PAPER } from "@/components/chrome/paper-tokens";
import {
  TimelineRowShell,
  CELL_H,
  LABEL_COL_W,
  LAYER_ROW_GAP,
  LAYER_ROW_PITCH,
} from "@/components/timeline/TimelineLayerRow";

const PX_PER_MS = 0.08;
const MIN_TRACK_MS = 4000;

/**
 * Animatron clip timeline — one track per layer.
 *
 * Rows use the **same** `TimelineRowShell` as the stop-motion exposure sheet, so
 * both workflows share one row design (card, grip, eye, name pill, hover tint,
 * `⋮`→trash, pointer-drag reorder). Only the track lane differs: frame cells
 * there, clip bars here.
 */

/** where the track lane starts: card padding (5) + label lane + the 10px gap */
const TRACK_LEFT = 5 + LABEL_COL_W + 10;

export function ClipTimeline() {
  const project = useProject((s) => s.project);
  const frameIndex = useProject((s) => s.frameIndex);
  const layerIndex = useProject((s) => s.layerIndex);
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
  const playheadMs = (frameIndex / Math.max(project.fps, 1)) * 1000;
  const trackW = totalMs * PX_PER_MS;

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
    const x = clientX - rect.left + trackEl.scrollLeft;
    return Math.max(0, x / PX_PER_MS);
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
    const deltaMs = (e.clientX - d.originX) / PX_PER_MS;
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

  return (
    <div className="relative max-h-48 min-h-0 w-full min-w-0 overflow-y-auto overscroll-contain [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
      <div className="relative flex flex-col" style={{ gap: LAYER_ROW_GAP }}>
        {project.layers.map((layer, li) => {
          const cel = layer.frames.find((f) => f) ?? null;
          const stroke = cel?.strokes[0];
          const clip = stroke?.clip;
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
                className="relative min-w-0 flex-1 overflow-hidden"
                style={{ height: CELL_H }}
                onPointerDown={onTrackPointerDown}
              >
                <div className="relative h-full" style={{ width: trackW }}>
                  {clip && stroke && (
                    <div
                      data-clip
                      className={cn(
                        "absolute top-0 flex items-stretch overflow-clip rounded-[8px]",
                        li === layerIndex && "ring-1 ring-white/20",
                      )}
                      style={{
                        left: clip.startMs * PX_PER_MS,
                        width: Math.max(12, clip.durationMs * PX_PER_MS),
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

        {/* playhead spans the whole stack, so it lives outside the rows */}
        <ClipPlayhead
          left={TRACK_LEFT + playheadMs * PX_PER_MS}
          label={`${(playheadMs / 1000).toFixed(1)}s`}
        />
      </div>
    </div>
  );
}

/**
 * Clip playhead — Paper 63D-0: a 14px column holding a time badge over a 1px
 * line. Paper pins the line at 161px; here it flexes to the stack height so it
 * still reaches the last row whatever the layer count.
 */
function ClipPlayhead({ left, label }: { left: number; label: string }) {
  return (
    <div
      className="pointer-events-none absolute top-0 z-20 flex w-[14px] flex-col items-center px-px"
      style={{ left: left - 7, height: "100%" }}
    >
      <div
        className="flex shrink-0 flex-col items-start overflow-clip rounded-full px-[2px] py-px"
        style={{ backgroundColor: PAPER.clipPlayheadBadge }}
      >
        <span
          className="w-fit shrink-0 content-center text-[6px] leading-[5px] text-white"
          style={{ fontFamily: PAPER.fontMono, height: 6 }}
        >
          {label}
        </span>
      </div>
      <div
        className="w-px flex-1 shrink-0"
        style={{ backgroundColor: PAPER.clipPlayheadLine }}
      />
    </div>
  );
}
