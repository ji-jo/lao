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
  animateTextClipPayload,
  isStaticLine,
  isStaticText,
  layerIsStaticLine,
  layerIsStaticText,
  layerTextsOf,
  lineStrokesOf,
  rememberClipStart,
  rememberTextClipStart,
  staticClipPayload,
} from "@/components/timeline/lineTiming";
import { PATH_MAKER_ENABLED } from "@/lib/mvpFlags";
import {
  allProjectClipItems,
  projectClipEndMs,
} from "@/engine/strokeProgress";
import { useSelection } from "@/state/selection";

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
  const updateImageElement = useProject((s) => s.updateImageElement);
  const updateTextElement = useProject((s) => s.updateTextElement);
  const updateMotionAssignment = useProject((s) => s.updateMotionAssignment);
  const updateMorphClip = useProject((s) => s.updateMorphClip);
  const selectedLayerIndices = useSelection((s) => s.layerIndices);
  const setLayerIndices = useSelection((s) => s.setLayerIndices);

  const [openMenuIndex, setOpenMenuIndex] = useState<number | null>(null);
  const [layerDrag, setLayerDrag] = useState<{ from: number; dy: number } | null>(null);
  const layerDragRef = useRef<{ from: number; startY: number } | null>(null);

  const totalMs = Math.max(
    MIN_TRACK_MS,
    projectClipEndMs(allProjectClipItems(project.layers)),
    (project.frameCount / Math.max(project.fps, 1)) * 1000,
  );
  const trackW = totalMs * pxPerMs;
  /** row card = padding + optional label lane + gap + full track */
  const rowW =
    10 + (showLabels ? LABEL_COL_W_ANIMATRON + 10 : 0) + trackW;

  const dragRef = useRef<{
    kind: "stroke" | "motion" | "morph" | "image" | "text";
    strokeId?: string;
    imageId?: string;
    textId?: string;
    layerId?: string;
    assignmentId?: string;
    morphId?: string;
    mode: "move" | "start" | "end";
    originX: number;
    startMs: number;
    durationMs: number;
  } | null>(null);
  /** Live preview while dragging — avoids store commits (which remount DOM and kill capture). */
  const [clipDragLive, setClipDragLive] = useState<{
    kind: "stroke" | "motion" | "morph" | "image" | "text";
    strokeId?: string;
    imageId?: string;
    textId?: string;
    layerId?: string;
    assignmentId?: string;
    morphId?: string;
    startMs: number;
    durationMs: number;
  } | null>(null);
  const [clipDragging, setClipDragging] = useState(false);
  const pxPerMsRef = useRef(pxPerMs);
  pxPerMsRef.current = pxPerMs;

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

  // Clip bar drag — window listeners so ScrollArea / re-renders can't steal the gesture.
  useEffect(() => {
    if (!clipDragging) return;

    function applyDelta(clientX: number) {
      const d = dragRef.current;
      if (!d) return null;
      const deltaMs = (clientX - d.originX) / pxPerMsRef.current;
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
      return { startMs, durationMs };
    }

    function onMove(e: PointerEvent) {
      const d = dragRef.current;
      if (!d) return;
      e.preventDefault();
      const next = applyDelta(e.clientX);
      if (!next) return;
      setClipDragLive({
        kind: d.kind,
        strokeId: d.strokeId,
        imageId: d.imageId,
        textId: d.textId,
        layerId: d.layerId,
        assignmentId: d.assignmentId,
        morphId: d.morphId,
        startMs: next.startMs,
        durationMs: next.durationMs,
      });
    }

    function onUp(e: PointerEvent) {
      const d = dragRef.current;
      const next = d ? applyDelta(e.clientX) : null;
      dragRef.current = null;
      setClipDragging(false);
      setClipDragLive(null);
      if (!d || !next) return;
      if (d.kind === "stroke" && d.strokeId) {
        updateStrokeClip(d.strokeId, {
          startMs: next.startMs,
          durationMs: next.durationMs,
        });
      } else if (d.kind === "image" && d.imageId) {
        const layer = useProject.getState().project.layers.find((l) =>
          l.frames.some((f) => f?.images?.some((im) => im.id === d.imageId)),
        );
        const cel = layer?.frames.find((f) => f) ?? null;
        const im = cel?.images?.find((i) => i.id === d.imageId);
        updateImageElement(d.imageId, {
          clip: {
            startMs: next.startMs,
            durationMs: next.durationMs,
            easing: im?.clip?.easing ?? useProject.getState().clipEasing,
          },
        });
      } else if (d.kind === "text" && d.textId) {
        const layer = useProject.getState().project.layers.find((l) =>
          l.frames.some((f) => f?.texts?.some((t) => t.id === d.textId)),
        );
        const cel = layer?.frames.find((f) => f) ?? null;
        const tx = cel?.texts?.find((t) => t.id === d.textId);
        updateTextElement(d.textId, {
          clip: {
            startMs: next.startMs,
            durationMs: next.durationMs,
            easing: tx?.clip?.easing ?? useProject.getState().clipEasing,
          },
        });
      } else if (d.kind === "motion" && d.layerId && d.assignmentId) {
        updateMotionAssignment(d.layerId, d.assignmentId, {
          startMs: next.startMs,
          durationMs: next.durationMs,
        });
      } else if (d.kind === "morph" && d.morphId) {
        updateMorphClip(d.morphId, {
          startMs: next.startMs,
          durationMs: next.durationMs,
        });
      }
    }

    window.addEventListener("pointermove", onMove, { passive: false });
    window.addEventListener("pointerup", onUp);
    window.addEventListener("pointercancel", onUp);
    return () => {
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
      window.removeEventListener("pointercancel", onUp);
    };
  }, [
    clipDragging,
    updateStrokeClip,
    updateImageElement,
    updateTextElement,
    updateMotionAssignment,
    updateMorphClip,
  ]);

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
    dragRef.current = {
      kind: "stroke",
      strokeId,
      mode,
      originX: e.clientX,
      startMs,
      durationMs,
    };
    setClipDragLive({
      kind: "stroke",
      strokeId,
      startMs,
      durationMs,
    });
    setClipDragging(true);
  }

  function beginMotionDrag(
    e: React.PointerEvent,
    layerId: string,
    assignmentId: string,
    mode: "move" | "start" | "end",
    startMs: number,
    durationMs: number,
  ) {
    e.stopPropagation();
    e.preventDefault();
    dragRef.current = {
      kind: "motion",
      layerId,
      assignmentId,
      mode,
      originX: e.clientX,
      startMs,
      durationMs,
    };
    setClipDragLive({
      kind: "motion",
      layerId,
      assignmentId,
      startMs,
      durationMs,
    });
    setClipDragging(true);
  }

  function beginMorphDrag(
    e: React.PointerEvent,
    morphId: string,
    mode: "move" | "start" | "end",
    startMs: number,
    durationMs: number,
  ) {
    e.stopPropagation();
    e.preventDefault();
    dragRef.current = {
      kind: "morph",
      morphId,
      mode,
      originX: e.clientX,
      startMs,
      durationMs,
    };
    setClipDragLive({
      kind: "morph",
      morphId,
      startMs,
      durationMs,
    });
    setClipDragging(true);
  }

  function beginImageDrag(
    e: React.PointerEvent,
    imageId: string,
    mode: "move" | "start" | "end",
    startMs: number,
    durationMs: number,
  ) {
    e.stopPropagation();
    e.preventDefault();
    dragRef.current = {
      kind: "image",
      imageId,
      mode,
      originX: e.clientX,
      startMs,
      durationMs,
    };
    setClipDragLive({
      kind: "image",
      imageId,
      startMs,
      durationMs,
    });
    setClipDragging(true);
  }

  function beginTextDrag(
    e: React.PointerEvent,
    textId: string,
    mode: "move" | "start" | "end",
    startMs: number,
    durationMs: number,
  ) {
    e.stopPropagation();
    e.preventDefault();
    dragRef.current = {
      kind: "text",
      textId,
      mode,
      originX: e.clientX,
      startMs,
      durationMs,
    };
    setClipDragLive({
      kind: "text",
      textId,
      startMs,
      durationMs,
    });
    setClipDragging(true);
  }

  function toggleLayerStatic(layerId: string) {
    const layer = project.layers.find((l) => l.id === layerId);
    if (!layer) return;
    const strokes = lineStrokesOf(layer);
    const texts = layerTextsOf(layer);
    if (strokes.length > 0) {
      const makeStatic = !layerIsStaticLine(layer);
      for (const stroke of strokes) {
        if (makeStatic) {
          rememberClipStart(stroke);
          updateStrokeClip(stroke.id, staticClipPayload(stroke.clip?.easing ?? clipEasing));
        } else {
          updateStrokeClip(stroke.id, animateClipPayload(stroke, stroke.clip?.easing ?? clipEasing));
        }
      }
      return;
    }
    if (texts.length === 0) return;
    const makeStatic = !layerIsStaticText(layer);
    for (const text of texts) {
      if (makeStatic) {
        rememberTextClipStart(text);
        updateTextElement(text.id, {
          typewriterSpeed: 0,
          clip: staticClipPayload(text.clip?.easing ?? clipEasing),
        });
      } else {
        const next = animateTextClipPayload(
          text,
          text.clip?.easing ?? clipEasing,
        );
        updateTextElement(text.id, next);
      }
    }
  }

  return (
    <div className="relative" style={{ width: rowW, minWidth: "100%" }}>
      <div className="relative flex flex-col" style={{ gap: LAYER_ROW_GAP }}>
        {project.layers.map((layer, li) => {
          const cel = layer.frames.find((f) => f) ?? null;
          const stroke = cel?.strokes[0];
          const image = cel?.images?.[0];
          const text = cel?.texts?.[0];
          const clip = stroke?.clip;
          const imageClip = image?.clip;
          const textClip = text?.clip;
          const staticLine = stroke ? isStaticLine(stroke) : false;
          const staticText = text ? isStaticText(text) : false;
          const hasLine = !!stroke;
          const hasText = !!text;
          return (
            <TimelineRowShell
              key={layer.id}
              layer={layer}
              active={li === layerIndex}
              selected={selectedLayerIndices.includes(li)}
              canDelete={layerCount > 1}
              menuOpen={openMenuIndex === li}
              onMenuOpenChange={(open) => setOpenMenuIndex(open ? li : null)}
              onSelectLayer={() => {
                setLayerIndex(li);
                setLayerIndices([li]);
              }}
              onToggleVisible={() => toggleLayerVisible(li)}
              showLabels={showLabels}
              labelColW={LABEL_COL_W_ANIMATRON}
              className="w-full max-w-none"
              afterEye={
                hasLine || hasText ? (
                  <LineAnimateToggle
                    staticLine={hasLine ? staticLine : staticText}
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
                  {clip && stroke && !staticLine && (() => {
                    const live =
                      clipDragLive?.kind === "stroke" &&
                      clipDragLive.strokeId === stroke.id
                        ? clipDragLive
                        : null;
                    const startMs = live?.startMs ?? clip.startMs;
                    const durationMs = live?.durationMs ?? clip.durationMs;
                    return (
                      <div
                        data-clip
                        className={cn(
                          "absolute top-0 flex touch-none items-stretch overflow-clip rounded-[8px]",
                          li === layerIndex && "ring-1 ring-white/20",
                          clipDragging && live ? "cursor-grabbing" : "cursor-grab",
                        )}
                        style={{
                          left: startMs * pxPerMs,
                          width: Math.max(12, durationMs * pxPerMs),
                          height: CELL_H,
                          backgroundColor: PAPER.frameActive,
                          border: `0.4px solid ${PAPER.frameActiveBorder}`,
                        }}
                        onPointerDown={(e) =>
                          beginClipDrag(e, stroke.id, "move", clip.startMs, clip.durationMs)
                        }
                      >
                        <button
                          type="button"
                          className="w-[5px] shrink-0 cursor-ew-resize touch-none bg-white/20"
                          onPointerDown={(e) =>
                            beginClipDrag(e, stroke.id, "start", clip.startMs, clip.durationMs)
                          }
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
                          className="w-[5px] shrink-0 cursor-ew-resize touch-none bg-white/20"
                          onPointerDown={(e) =>
                            beginClipDrag(e, stroke.id, "end", clip.startMs, clip.durationMs)
                          }
                          aria-label="Resize clip end"
                        />
                      </div>
                    );
                  })()}
                  {image && imageClip && (() => {
                    const live =
                      clipDragLive?.kind === "image" &&
                      clipDragLive.imageId === image.id
                        ? clipDragLive
                        : null;
                    const startMs = live?.startMs ?? imageClip.startMs;
                    const durationMs = live?.durationMs ?? imageClip.durationMs;
                    return (
                      <div
                        data-clip
                        className={cn(
                          "absolute top-0 flex touch-none items-stretch overflow-clip rounded-[8px]",
                          li === layerIndex && "ring-1 ring-white/20",
                          clipDragging && live ? "cursor-grabbing" : "cursor-grab",
                        )}
                        style={{
                          left: startMs * pxPerMs,
                          width: Math.max(12, durationMs * pxPerMs),
                          height: CELL_H,
                          backgroundColor: PAPER.frameActive,
                          border: `0.4px solid ${PAPER.frameActiveBorder}`,
                        }}
                        onPointerDown={(e) =>
                          beginImageDrag(
                            e,
                            image.id,
                            "move",
                            imageClip.startMs,
                            imageClip.durationMs,
                          )
                        }
                      >
                        <button
                          type="button"
                          className="w-[5px] shrink-0 cursor-ew-resize touch-none bg-white/20"
                          onPointerDown={(e) =>
                            beginImageDrag(
                              e,
                              image.id,
                              "start",
                              imageClip.startMs,
                              imageClip.durationMs,
                            )
                          }
                          aria-label="Resize image clip start"
                        />
                        <div
                          className="min-w-0 flex-1 truncate px-1 text-[10px] text-white/90"
                          style={{ fontFamily: PAPER.fontMono, lineHeight: `${CELL_H}px` }}
                        >
                          {layer.name}
                        </div>
                        <button
                          type="button"
                          className="w-[5px] shrink-0 cursor-ew-resize touch-none bg-white/20"
                          onPointerDown={(e) =>
                            beginImageDrag(
                              e,
                              image.id,
                              "end",
                              imageClip.startMs,
                              imageClip.durationMs,
                            )
                          }
                          aria-label="Resize image clip end"
                        />
                      </div>
                    );
                  })()}
                  {/* Image without clip yet (legacy) — full-span bar so the row isn't empty */}
                  {image && !imageClip && !stroke && !text && (
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
                      aria-label={`${layer.name} — image`}
                    >
                      <div
                        className="truncate px-1.5 text-[10px] text-white/90"
                        style={{ fontFamily: PAPER.fontMono, lineHeight: `${CELL_H}px` }}
                      >
                        {layer.name}
                      </div>
                    </div>
                  )}
                  {text && staticText && !stroke && (
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
                      aria-label={`${layer.name} — static text`}
                    >
                      <div
                        className="truncate px-1.5 text-[10px] text-white/90"
                        style={{ fontFamily: PAPER.fontMono, lineHeight: `${CELL_H}px` }}
                      >
                        {layer.name} · text · static
                      </div>
                    </div>
                  )}
                  {text && textClip && !staticText && !stroke && (() => {
                    const live =
                      clipDragLive?.kind === "text" &&
                      clipDragLive.textId === text.id
                        ? clipDragLive
                        : null;
                    const startMs = live?.startMs ?? textClip.startMs;
                    const durationMs = live?.durationMs ?? textClip.durationMs;
                    return (
                      <div
                        data-clip
                        className={cn(
                          "absolute top-0 flex touch-none items-stretch overflow-clip rounded-[8px]",
                          li === layerIndex && "ring-1 ring-white/20",
                          clipDragging && live ? "cursor-grabbing" : "cursor-grab",
                        )}
                        style={{
                          left: startMs * pxPerMs,
                          width: Math.max(12, durationMs * pxPerMs),
                          height: CELL_H,
                          backgroundColor: PAPER.frameActive,
                          border: `0.4px solid ${PAPER.frameActiveBorder}`,
                        }}
                        onPointerDown={(e) =>
                          beginTextDrag(
                            e,
                            text.id,
                            "move",
                            textClip.startMs,
                            textClip.durationMs,
                          )
                        }
                      >
                        <button
                          type="button"
                          className="w-[5px] shrink-0 cursor-ew-resize touch-none bg-white/20"
                          onPointerDown={(e) =>
                            beginTextDrag(
                              e,
                              text.id,
                              "start",
                              textClip.startMs,
                              textClip.durationMs,
                            )
                          }
                          aria-label="Resize text clip start"
                        />
                        <div
                          className="min-w-0 flex-1 truncate px-1 text-[10px] text-white/90"
                          style={{ fontFamily: PAPER.fontMono, lineHeight: `${CELL_H}px` }}
                        >
                          {layer.name} · text
                        </div>
                        <button
                          type="button"
                          className="w-[5px] shrink-0 cursor-ew-resize touch-none bg-white/20"
                          onPointerDown={(e) =>
                            beginTextDrag(
                              e,
                              text.id,
                              "end",
                              textClip.startMs,
                              textClip.durationMs,
                            )
                          }
                          aria-label="Resize text clip end"
                        />
                      </div>
                    );
                  })()}
                  {/* Text without clip yet — full-span bar so the row isn't empty */}
                  {text && !textClip && !stroke && !image && (
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
                      aria-label={`${layer.name} — text`}
                    >
                      <div
                        className="truncate px-1.5 text-[10px] text-white/90"
                        style={{ fontFamily: PAPER.fontMono, lineHeight: `${CELL_H}px` }}
                      >
                        {layer.name} · text
                      </div>
                    </div>
                  )}
                  {PATH_MAKER_ENABLED &&
                    (layer.motionAssignments ?? []).map((a) => {
                      const live =
                        clipDragLive?.kind === "motion" &&
                        clipDragLive.assignmentId === a.id
                          ? clipDragLive
                          : null;
                      const startMs = live?.startMs ?? a.startMs;
                      const durationMs = live?.durationMs ?? a.durationMs;
                      return (
                        <div
                          key={a.id}
                          data-clip
                          className="absolute top-0 flex touch-none cursor-grab items-stretch overflow-clip rounded-[8px] active:cursor-grabbing"
                          style={{
                            left: startMs * pxPerMs,
                            width: Math.max(12, durationMs * pxPerMs),
                            height: CELL_H,
                            backgroundColor: "rgba(107, 151, 255, 0.55)",
                            border: "0.4px solid rgba(107, 151, 255, 0.9)",
                          }}
                          onPointerDown={(e) =>
                            beginMotionDrag(e, layer.id, a.id, "move", a.startMs, a.durationMs)
                          }
                        >
                          <button
                            type="button"
                            className="w-[5px] shrink-0 cursor-ew-resize touch-none bg-white/25"
                            onPointerDown={(e) =>
                              beginMotionDrag(e, layer.id, a.id, "start", a.startMs, a.durationMs)
                            }
                            aria-label="Resize motion start"
                          />
                          <div
                            className="min-w-0 flex-1 truncate px-1 text-[10px] text-white/90"
                            style={{ fontFamily: PAPER.fontMono, lineHeight: `${CELL_H}px` }}
                          >
                            path
                          </div>
                          <button
                            type="button"
                            className="w-[5px] shrink-0 cursor-ew-resize touch-none bg-white/25"
                            onPointerDown={(e) =>
                              beginMotionDrag(e, layer.id, a.id, "end", a.startMs, a.durationMs)
                            }
                            aria-label="Resize motion end"
                          />
                        </div>
                      );
                    })}
                  {PATH_MAKER_ENABLED &&
                    (project.morphs ?? [])
                      .filter((m) => m.fromLayerId === layer.id)
                      .map((m) => {
                        const live =
                          clipDragLive?.kind === "morph" &&
                          clipDragLive.morphId === m.id
                            ? clipDragLive
                            : null;
                        const startMs = live?.startMs ?? m.startMs;
                        const durationMs = live?.durationMs ?? m.durationMs;
                        return (
                          <div
                            key={m.id}
                            data-clip
                            className="absolute top-0 flex touch-none cursor-grab items-stretch overflow-clip rounded-[8px] active:cursor-grabbing"
                            style={{
                              left: startMs * pxPerMs,
                              width: Math.max(12, durationMs * pxPerMs),
                              height: CELL_H,
                              backgroundColor: "rgba(180, 120, 255, 0.5)",
                              border: "0.4px solid rgba(180, 120, 255, 0.9)",
                            }}
                            onPointerDown={(e) =>
                              beginMorphDrag(e, m.id, "move", m.startMs, m.durationMs)
                            }
                          >
                            <button
                              type="button"
                              className="w-[5px] shrink-0 cursor-ew-resize touch-none bg-white/25"
                              onPointerDown={(e) =>
                                beginMorphDrag(e, m.id, "start", m.startMs, m.durationMs)
                              }
                              aria-label="Resize morph start"
                            />
                            <div
                              className="min-w-0 flex-1 truncate px-1 text-[10px] text-white/90"
                              style={{ fontFamily: PAPER.fontMono, lineHeight: `${CELL_H}px` }}
                            >
                              morph
                            </div>
                            <button
                              type="button"
                              className="w-[5px] shrink-0 cursor-ew-resize touch-none bg-white/25"
                              onPointerDown={(e) =>
                                beginMorphDrag(e, m.id, "end", m.startMs, m.durationMs)
                              }
                              aria-label="Resize morph end"
                            />
                          </div>
                        );
                      })}
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
