import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import { motion, useReducedMotion } from "motion/react";
import { Layers2 } from "reicon-react";
import { isTypingTarget } from "@/lib/typingTarget";
import { useProject } from "@/state/project";
import { usePlayback } from "@/state/playback";
import { useTools } from "@/state/tools";
import { useSelection } from "@/state/selection";
import { playerRef } from "@/state/playerRef";
import {
  allProjectClipItems,
  projectClipEndMs,
} from "@/engine/strokeProgress";
import { ClipTimeline, BASE_PX_PER_MS } from "@/components/timeline/ClipTimeline";
import { Tooltip } from "@/components/motion/tooltip";
import { AnimationPanel } from "@/components/panels/AnimationPanel";
import { OnionPanel } from "@/components/panels/OnionPanel";
import { SettingsDocks } from "@/components/chrome/SettingsDocks";
import { PAPER } from "@/components/chrome/paper-tokens";
import { GooeySurfaceMorph } from "@/components/motion/gooey-surface-morph";
import {
  SkipStartIcon,
  PrevIcon,
  NextIcon,
  PlayTriIcon,
  PauseTriIcon,
  LoopIcon,
  ClearFrameIcon,
  EaseCurveGlyph,
  OnionRingsGlyph,
  LayerCountGlyph,
  FrameCountGlyph,
  StagePenGlyph,
  StagePreviewGlyph,
  StepperBox,
  DockSep,
  DockBtn,
  SquareBtn,
} from "@/components/timeline/TimelineDockParts";
import {
  TimelineLayerRow,
  CELLS_INSET,
  CELLS_INSET_ANIMATRON,
  CELLS_INSET_COLLAPSED,
  CELL_GAP,
  LAYER_ROW_GAP,
  LAYER_ROW_H,
  LAYER_ROW_PITCH,
} from "@/components/timeline/TimelineLayerRow";
import { ScrollArea } from "@/components/ui/scroll-area";
import { TimelineTimingBar } from "@/components/timeline/TimelineTimingBar";
import { cn } from "@/lib/utils";

/** Frame-cell zoom (pinch / ctrl+wheel): width scales, row height stays fixed.
 *  19 = Paper's 16 + 20% — D's explicit timeline-scale override. */
const BASE_CELL_WIDTH = 19;
const MIN_CELL_ZOOM = 0.6;
const MAX_CELL_ZOOM = 2.75;

/**
 * Rows viewport cap — Paper 2P6-0 pins the whole player at 232px, which leaves
 * 5 full layer rows plus a sliver of the 6th so the overflow reads as scrollable.
 */
const ROWS_MAX_H = 5 * LAYER_ROW_H + 4 * LAYER_ROW_GAP + 22;

/**
 * Playhead stamp — Paper 6ML-0.
 * Pill floats in the gap above the timing bar; the red line runs through the
 * timing bar and every visible layer row. Drag the stamp to scrub; hover
 * gives a gentle wobble + grab cursor.
 */
function TimelinePlayheadStamp({
  left,
  label,
  onScrub,
  frameFromClientX,
}: {
  left: number;
  label: string;
  onScrub: (frame: number) => void;
  frameFromClientX: (clientX: number) => number;
}) {
  const reduce = useReducedMotion() ?? false;
  const [hovered, setHovered] = useState(false);
  const dragging = useRef(false);
  const [grabbing, setGrabbing] = useState(false);

  useEffect(() => {
    function onMove(e: PointerEvent) {
      if (!dragging.current) return;
      onScrub(frameFromClientX(e.clientX));
    }
    function onUp() {
      if (!dragging.current) return;
      dragging.current = false;
      setGrabbing(false);
    }
    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
    window.addEventListener("pointercancel", onUp);
    return () => {
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
      window.removeEventListener("pointercancel", onUp);
    };
  }, [onScrub, frameFromClientX]);

  return (
    <div
      className="pointer-events-none absolute z-20 flex w-9 flex-col items-center"
      style={{ left, top: -15, bottom: 0, transform: "translateX(-50%)" }}
      role="slider"
      aria-label="Playhead"
      aria-valuetext={label}
    >
      {/* Pill is the only hit target — the red line must not block wheel/trackpad. */}
      <motion.div
        className={cn(
          "pointer-events-auto flex shrink-0 flex-col items-start gap-px overflow-clip rounded-full px-0.5 py-0.75",
          grabbing ? "cursor-grabbing" : "cursor-grab",
        )}
        style={{ backgroundColor: PAPER.clipPlayheadBadge }}
        tabIndex={0}
        onPointerEnter={() => setHovered(true)}
        onPointerLeave={() => {
          if (!dragging.current) setHovered(false);
        }}
        onPointerDown={(e) => {
          e.preventDefault();
          e.stopPropagation();
          dragging.current = true;
          setGrabbing(true);
          setHovered(false);
          onScrub(frameFromClientX(e.clientX));
        }}
        animate={
          hovered && !grabbing && !reduce
            ? { rotate: [-2.2, 2.2, -2.2] }
            : { rotate: 0 }
        }
        transition={
          hovered && !grabbing && !reduce
            ? { duration: 0.55, repeat: Infinity, ease: "easeInOut" }
            : { type: "spring", stiffness: 420, damping: 28 }
        }
      >
        <div
          className="flex h-2.25 w-9 shrink-0 flex-wrap content-center justify-center text-center text-[10px]/1.25 text-white"
          style={{ fontFamily: PAPER.fontMono }}
        >
          {label}
        </div>
      </motion.div>
      <div className="relative min-h-0 w-full flex-1">
        <div
          className="absolute inset-y-0 left-1/2 w-0.5 -translate-x-1/2"
          style={{ backgroundColor: PAPER.clipPlayheadLine }}
        />
      </div>
    </div>
  );
}

export function Timeline() {
  const project = useProject((s) => s.project);
  const frameIndex = useProject((s) => s.frameIndex);
  const layerIndex = useProject((s) => s.layerIndex);
  const playing = usePlayback((s) => s.playing);
  const onionSkin = usePlayback((s) => s.onionSkin);
  const loop = usePlayback((s) => s.loop);
  const toggleLoop = usePlayback((s) => s.toggleLoop);
  const stage = usePlayback((s) => s.stage);
  const workflow = usePlayback((s) => s.workflow);
  const setStage = usePlayback((s) => s.setStage);

  /**
   * Layer reorder. Pointer-driven on purpose: HTML5 drag-and-drop renders a
   * browser drag image of the grip's stacking context, which reads as "the
   * whole timeline panel is being dragged". Here the row itself lifts.
   */
  const [layerDrag, setLayerDrag] = useState<{ from: number; dy: number } | null>(null);
  const layerDragRef = useRef<{ from: number; startY: number } | null>(null);
  const extendTimeline = useProject((s) => s.extendTimeline);
  const setFrameIndex = useProject((s) => s.setFrameIndex);
  const setLayerIndex = useProject((s) => s.setLayerIndex);
  const stepFrame = useProject((s) => s.stepFrame);
  const addKeyframe = useProject((s) => s.addKeyframe);
  const generateInbetweens = useProject((s) => s.generateInbetweens);
  const addLayer = useProject((s) => s.addLayer);
  const deleteLayer = useProject((s) => s.deleteLayer);
  const reorderLayer = useProject((s) => s.reorderLayer);
  const toggleLayerVisible = useProject((s) => s.toggleLayerVisible);
  const onionPanelOpen = usePlayback((s) => s.onionPanelOpen);
  const toggleOnionPanel = usePlayback((s) => s.toggleOnionPanel);
  const animationPanelOpen = usePlayback((s) => s.animationPanelOpen);
  const toggleAnimationPanel = usePlayback((s) => s.toggleAnimationPanel);
  const showFullStrokes = usePlayback((s) => s.showFullStrokes);
  const toggleShowFullStrokes = usePlayback((s) => s.toggleShowFullStrokes);
  const selectedLayerIndices = useSelection((s) => s.layerIndices);
  const setLayerIndices = useSelection((s) => s.setLayerIndices);
  const autoKey = useTools((s) => s.autoKey);
  const toggleAutoKey = useTools((s) => s.toggleAutoKey);
  const isAnimatron = workflow === "animatron";
  const [collapsed, setCollapsed] = useState(false);
  /** Free-float after drag; null = docked in App’s bottom flex slot. */
  const [floatPos, setFloatPos] = useState<{ left: number; top: number } | null>(
    null,
  );
  /** Bumps gooey settle morph when re-docking to the bottom. */
  const [settleTick, setSettleTick] = useState(0);
  /** "collapse layers" — hides the entire layer-row stack (timing bar stays) */
  const [layersCollapsed, setLayersCollapsed] = useState(false);
  const [openMenuIndex, setOpenMenuIndex] = useState<number | null>(null);
  const shellRef = useRef<HTMLDivElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const rowsVpRef = useRef<HTMLDivElement>(null);
  const stampTrackRef = useRef<HTMLDivElement>(null);
  const dragCollapseRef = useRef<{
    startY: number;
    startX: number;
    collapsed: boolean;
    originLeft: number;
    originTop: number;
    moving: boolean;
    pointerId: number;
    lastLeft: number;
    lastTop: number;
  } | null>(null);
  const [cellZoom, setCellZoom] = useState(1);
  const cellWidth = Math.round(BASE_CELL_WIDTH * cellZoom);
  const cellsInset = layersCollapsed
    ? CELLS_INSET_COLLAPSED
    : isAnimatron
      ? CELLS_INSET_ANIMATRON
      : CELLS_INSET;

  /** Animatron: zoom scales px/ms; TimingBar still speaks in "cell" pitch so
   *  one frame of time maps to one virtual cell width. */
  const pxPerMs = BASE_PX_PER_MS * cellZoom;
  const animCellWidth = Math.max(
    1,
    Math.round((1000 / Math.max(1, project.fps)) * pxPerMs - CELL_GAP),
  );
  const timingCellWidth = isAnimatron ? animCellWidth : cellWidth;
  const clipEndMs = isAnimatron
    ? projectClipEndMs(allProjectClipItems(project.layers))
    : 0;
  const animTotalMs = Math.max(
    4000,
    clipEndMs,
    (project.frameCount / Math.max(1, project.fps)) * 1000,
  );

  /** one shared X offset — mirrored from the rows' nano ScrollArea */
  const [scrollX, setScrollX] = useState(0);
  const [rowsWidth, setRowsWidth] = useState(0);
  const cellsWidth = Math.max(0, rowsWidth - cellsInset);
  const contentWidth = isAnimatron
    ? animTotalMs * pxPerMs
    : project.frameCount * (cellWidth + CELL_GAP) - CELL_GAP;
  const maxScrollX = Math.max(0, contentWidth - cellsWidth);

  const clampZoom = useCallback(
    (z: number) => Math.min(MAX_CELL_ZOOM, Math.max(MIN_CELL_ZOOM, z)),
    [],
  );

  const onPinchZoom = useCallback(
    (deltaY: number) => {
      setCellZoom((z) => clampZoom(z * (1 - deltaY * 0.01)));
    },
    [clampZoom],
  );

  const stampFrameFromClientX = useCallback(
    (clientX: number) => {
      const el = stampTrackRef.current;
      if (!el) return frameIndex;
      const x = clientX - el.getBoundingClientRect().left - cellsInset + scrollX;
      const last = Math.max(0, project.frameCount - 1);
      if (isAnimatron) {
        const ms = x / Math.max(pxPerMs, 0.0001);
        return Math.max(0, Math.min(last, Math.round((ms / 1000) * project.fps)));
      }
      const pitch = cellWidth + CELL_GAP;
      return Math.max(0, Math.min(last, Math.floor(x / pitch)));
    },
    [
      frameIndex,
      cellsInset,
      scrollX,
      project.frameCount,
      project.fps,
      isAnimatron,
      pxPerMs,
      cellWidth,
    ],
  );

  useLayoutEffect(() => {
    const vp = rowsVpRef.current;
    if (!vp) return;
    const measure = () => setRowsWidth(vp.clientWidth);
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(vp);
    return () => ro.disconnect();
  }, [collapsed, isAnimatron, layersCollapsed]);

  useEffect(() => {
    setScrollX((x) => Math.min(x, maxScrollX));
  }, [maxScrollX]);

  const layerCount = project.layers.length;
  const rowsNaturalH =
    layerCount * LAYER_ROW_H + Math.max(0, layerCount - 1) * LAYER_ROW_GAP;
  const rowsViewportH = Math.min(ROWS_MAX_H, rowsNaturalH);

  const dropIndex = layerDrag
    ? Math.max(
        0,
        Math.min(layerCount - 1, layerDrag.from + Math.round(layerDrag.dy / LAYER_ROW_PITCH)),
      )
    : null;

  /**
   * The lifted row follows the pointer; every row between its origin and the
   * drop slot slides one pitch the other way, so the gap opens where it lands.
   */
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
      return Math.max(
        0,
        Math.min(layerCount - 1, from + Math.round(dy / LAYER_ROW_PITCH)),
      );
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

  /**
   * Wheel / trackpad over the rows:
   * - ctrl/meta+wheel → cell zoom
   * - otherwise drive scroll ourselves. Native overflow alone only pans the
   *   axis matching the gesture; the timeline is usually X-only overflow, so
   *   a vertical finger flick (deltaY) would do nothing without remapping.
   */
  useEffect(() => {
    const wrap = rowsVpRef.current;
    if (!wrap) return;
    const vp =
      (wrap.querySelector(
        ".react-nano-scrollbar-content",
      ) as HTMLElement | null) ?? wrap;
    function onWheel(e: WheelEvent) {
      if (e.ctrlKey || e.metaKey) {
        e.preventDefault();
        onPinchZoom(e.deltaY);
        return;
      }
      const canY = vp.scrollHeight - vp.clientHeight > 1;
      const canX = vp.scrollWidth - vp.clientWidth > 1;
      if (!canX && !canY) return;

      let dx = e.deltaX;
      let dy = e.deltaY;
      // Shift always pans X. With no Y overflow, map vertical wheel → X so
      // mouse wheels and Windows trackpads can scrub the track.
      if (e.shiftKey && canX) {
        dx = dx || dy;
        dy = 0;
      } else if (canX && !canY) {
        dx = dx || dy;
        dy = 0;
      }

      if (!dx && !dy) return;
      e.preventDefault();
      if (dx && canX) vp.scrollLeft += dx;
      if (dy && canY) vp.scrollTop += dy;
    }
    function onScroll() {
      setScrollX(vp.scrollLeft);
    }
    // Capture on the wrap so the playhead stamp / sticky labels don't swallow
    // trackpad events before the scrollport sees them.
    wrap.addEventListener("wheel", onWheel, { passive: false, capture: true });
    vp.addEventListener("scroll", onScroll, { passive: true });
    return () => {
      wrap.removeEventListener("wheel", onWheel, true);
      vp.removeEventListener("scroll", onScroll);
    };
  }, [onPinchZoom, project.layers.length, layersCollapsed, isAnimatron]);

  /** Keep nano's scrollLeft in sync when something else updates scrollX. */
  useLayoutEffect(() => {
    const wrap = rowsVpRef.current;
    if (!wrap) return;
    const vp = wrap.querySelector(
      ".react-nano-scrollbar-content",
    ) as HTMLElement | null;
    if (!vp) return;
    if (Math.abs(vp.scrollLeft - scrollX) > 0.5) vp.scrollLeft = scrollX;
  }, [scrollX, contentWidth, cellZoom]);

  function applyExtend(n: number) {
    const frames = Math.max(1, Math.min(120, Math.round(Number(n))));
    if (!Number.isFinite(frames) || frames < 1) return;
    extendTimeline(frames);
  }

  function applyShrink(n: number) {
    const frames = Math.max(1, Math.min(120, Math.round(Number(n))));
    if (!Number.isFinite(frames) || frames < 1) return;
    if (project.frameCount <= 1) return;
    extendTimeline(-Math.min(frames, project.frameCount - 1));
  }

  /** layer-count stepper's editable value — there's no direct "set count" store
   *  action, so add/remove one at a time against fresh state each step. */
  function setLayerCount(n: number) {
    const target = Math.max(1, Math.round(n));
    while (useProject.getState().project.layers.length < target) {
      useProject.getState().addLayer();
    }
    while (useProject.getState().project.layers.length > target) {
      const len = useProject.getState().project.layers.length;
      useProject.getState().deleteLayer(len - 1);
    }
  }

  function togglePlaying() {
    const pb = usePlayback.getState();
    if (pb.stage === "preview") {
      const player = playerRef.current;
      if (!player) return;
      if (player.isPlaying()) player.pause();
      else player.play();
      return;
    }
    pb.togglePlaying();
  }

  // playback loop (edit-mode draft playback)
  useEffect(() => {
    if (!playing || stage !== "draw") return;
    const interval = window.setInterval(() => {
      useProject.getState().stepFrame(1);
    }, 1000 / project.fps);
    return () => window.clearInterval(interval);
  }, [playing, stage, project.fps]);

  // frame stepping shortcuts
  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      if (isTypingTarget(e.target)) return;
      if (e.defaultPrevented) return;
      const tool = useTools.getState().tool;
      const artSelected =
        (tool === "select" || tool === "path") &&
        useSelection.getState().ids.length > 0;
      if (e.key === "ArrowLeft" || e.key === ",") {
        if (e.key === "ArrowLeft" && artSelected) return;
        stepFrame(-1);
      } else if (e.key === "ArrowRight") {
        if (artSelected) return;
        stepFrame(1);
      } else if (e.key === "Enter" && !e.ctrlKey) togglePlaying();
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [stepFrame]);

  /**
   * Collapse / move handle (Paper 9JI-0):
   * - mostly vertical flick → collapse / expand (gooey size morph)
   * - drag past move threshold → free-float the panel; release near bottom
   *   re-docks with organic settle morph
   */
  function onCollapsePointerDown(e: React.PointerEvent) {
    const panel = panelRef.current ?? shellRef.current;
    if (!panel) return;
    try {
      (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    } catch {
      /* synthetic */
    }
    const rect = panel.getBoundingClientRect();
    dragCollapseRef.current = {
      startY: e.clientY,
      startX: e.clientX,
      collapsed,
      originLeft: rect.left,
      originTop: rect.top,
      moving: false,
      pointerId: e.pointerId,
      lastLeft: rect.left,
      lastTop: rect.top,
    };
  }
  function onCollapsePointerMove(e: React.PointerEvent) {
    const drag = dragCollapseRef.current;
    if (!drag || e.pointerId !== drag.pointerId) return;
    const dx = e.clientX - drag.startX;
    const dy = e.clientY - drag.startY;

    if (!drag.moving) {
      // Prefer free-move once the gesture leaves a narrow vertical corridor.
      if (Math.abs(dx) > 16 || Math.hypot(dx, dy) > 40) {
        drag.moving = true;
        const next = {
          left: drag.originLeft + dx,
          top: drag.originTop + dy,
        };
        drag.lastLeft = next.left;
        drag.lastTop = next.top;
        setFloatPos(next);
        return;
      }
      if (dy > 24) setCollapsed(true);
      else if (dy < -24) setCollapsed(false);
      return;
    }

    const panel = panelRef.current;
    const w = panel?.offsetWidth ?? PAPER.timelineWidth;
    const h = panel?.offsetHeight ?? 152;
    const pad = 8;
    // Leave room for the setting dock band at the bottom so a floated
    // timeline can't sit on top of brush/canvas chips.
    const settingsBand = 56 + PAPER.settingGap;
    const maxTop = Math.max(
      pad,
      window.innerHeight - PAPER.insetBottom - settingsBand - h - pad,
    );
    const left = Math.max(
      pad,
      Math.min(window.innerWidth - w - pad, drag.originLeft + dx),
    );
    const top = Math.max(
      pad,
      Math.min(maxTop, drag.originTop + dy),
    );
    drag.lastLeft = left;
    drag.lastTop = top;
    setFloatPos({ left, top });
  }
  function onCollapsePointerUp(e: React.PointerEvent) {
    const drag = dragCollapseRef.current;
    dragCollapseRef.current = null;
    if (!drag || e.pointerId !== drag.pointerId) return;

    if (drag.moving) {
      const panel = panelRef.current;
      const h = panel?.offsetHeight ?? 152;
      const bottom = drag.lastTop + h;
      const dockLine = window.innerHeight - PAPER.insetBottom;
      // Re-dock when the panel sits near the bottom chrome band.
      if (bottom >= dockLine - 80) {
        setFloatPos(null);
        setSettleTick((t) => t + 1);
      }
      return;
    }

    // Tap toggles collapse.
    if (Math.abs(e.clientY - drag.startY) <= 4 && Math.abs(e.clientX - drag.startX) <= 4) {
      setCollapsed(!drag.collapsed);
    }
  }

  const morphKey = `${collapsed ? "c" : "e"}-${settleTick}`;

  // If the viewport shrinks while floated, re-dock when the panel would cover
  // the bottom setting dock — keeps settings above the timeline.
  useEffect(() => {
    if (!floatPos) return;
    function onResize() {
      const panel = panelRef.current;
      const h = panel?.offsetHeight ?? 152;
      const bottom = floatPos!.top + h;
      const dockLine = window.innerHeight - PAPER.insetBottom;
      if (bottom >= dockLine - 80) {
        setFloatPos(null);
        setSettleTick((t) => t + 1);
      }
    }
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, [floatPos]);

  return (
    <div
      ref={shellRef}
      className="relative flex min-h-0 w-full flex-col items-center overflow-visible"
      style={{ gap: PAPER.settingGap }}
    >
      {/* Above the whole column (settings + dock). Inline bottom — class bottom-full
          was a no-op here and left the panel in static flow, shooting downward. */}
      {(animationPanelOpen || onionPanelOpen) && (
        <div
          className="pointer-events-auto absolute left-1/2 z-30 flex -translate-x-1/2 gap-4"
          style={{ bottom: "calc(100% + 14px)" }}
        >
          {animationPanelOpen && <AnimationPanel />}
          {onionPanelOpen && <OnionPanel />}
        </div>
      )}
      {stage === "draw" && (
        <div className="pointer-events-auto relative z-[40] w-max max-w-full shrink-0 overflow-visible">
          <SettingsDocks />
        </div>
      )}
      {/*
        Paper 5S8-0: 704 wide, 6px top / 12px bottom / 16px side padding,
        handle → transport 12px, transport → track 16px.
        GooeySurfaceMorph: collapse size melt + bottom re-dock settle pulse.
      */}
      <GooeySurfaceMorph
        morphKey={morphKey}
        surface={PAPER.surface}
        borderRadius={19}
        transparentVar="--timeline-surface-bg"
        className={cn(
          "relative z-0 min-h-0 w-full",
          // Floated panel stays under the setting dock (z-40) so resize/drag
          // never stacks the timeline on top of brush/canvas chips.
          floatPos && "pointer-events-auto !fixed z-[25]",
        )}
        style={
          floatPos
            ? {
                left: floatPos.left,
                top: floatPos.top,
                width: PAPER.timelineWidth,
                maxWidth: "calc(100vw - 124px)",
              }
            : undefined
        }
      >
      <div
        ref={panelRef}
        className="pointer-events-auto relative w-full overflow-hidden rounded-[19px] antialiased"
        style={{
          backgroundColor: "var(--timeline-surface-bg, " + PAPER.surface + ")",
          outline: `0.4px solid ${PAPER.outlineSubtle}`,
          paddingTop: 7,
          paddingBottom: 14,
          paddingLeft: 19,
          paddingRight: 19,
        }}
      >
      {/* collapse / move handle — Paper 9JI-0 */}
      <div
        className="mx-auto -mt-[5px] mb-[10px] flex cursor-grab touch-none items-center justify-center py-[5px] active:cursor-grabbing"
        onPointerDown={onCollapsePointerDown}
        onPointerMove={onCollapsePointerMove}
        onPointerUp={onCollapsePointerUp}
        onPointerCancel={onCollapsePointerUp}
        role="button"
        tabIndex={0}
        aria-expanded={!collapsed}
        onKeyDown={(e) => {
          if (e.key === "Enter" || e.key === " ") {
            e.preventDefault();
            setCollapsed((c) => !c);
          }
        }}
        title={
          collapsed
            ? "Drag up to expand · drag sideways to move"
            : "Drag down to collapse · drag sideways to move"
        }
      >
        <span
          className="h-[5px] w-[41px] shrink-0 rounded-full"
          style={{ backgroundColor: PAPER.handle }}
        />
      </div>
      {/* transport row — Paper 5S8-0 */}
      <div className="flex items-center justify-between gap-[14px]">
        <div className="flex items-center gap-3 px-[5px] py-1">
          <DockBtn label="First frame" onClick={() => setFrameIndex(0)}>
            <SkipStartIcon />
          </DockBtn>
          <DockBtn label="Back one frame" onClick={() => stepFrame(-1)}>
            <PrevIcon />
          </DockBtn>
          <DockBtn label={playing ? "Pause" : "Play"} onClick={togglePlaying} active={playing}>
            {playing ? <PauseTriIcon /> : <PlayTriIcon />}
          </DockBtn>
          <DockBtn label="Forward one frame" onClick={() => stepFrame(1)}>
            <NextIcon />
          </DockBtn>
        </div>

        <DockBtn label={loop ? "Loop on" : "Loop off"} onClick={toggleLoop} active={loop}>
          <LoopIcon />
        </DockBtn>

        <DockBtn
          label="Empty cel — wipe this cell, stop any hold"
          onClick={addKeyframe}
        >
          <ClearFrameIcon />
        </DockBtn>

        {workflow === "stopmotion" ? (
          <DockBtn
            label="Tween — generate in-betweens between previous and current keyframe"
            onClick={() => {
              const { project, layerIndex, frameIndex } = useProject.getState();
              const layer = project.layers[layerIndex];
              if (!layer || !layer.frames[frameIndex]) return;
              let prev = -1;
              for (let i = frameIndex - 1; i >= 0; i--) {
                if (layer.frames[i]) {
                  prev = i;
                  break;
                }
              }
              if (prev < 0) return;
              const raw = window.prompt("Number of in-between frames", "3");
              if (raw == null) return;
              const n = Math.max(1, Math.min(48, Math.floor(Number(raw)) || 3));
              generateInbetweens(prev, frameIndex, n);
            }}
          >
            <span className="text-[10px] font-medium leading-none">Tw</span>
          </DockBtn>
        ) : null}

        <div className="flex items-center gap-3">
          <span
            className="inline-flex w-[9ch] shrink-0 items-center justify-center gap-0 text-[12px] leading-[14px] text-white opacity-50 tabular-nums"
            style={{ fontFamily: PAPER.fontMono }}
            title="Current frame / total frames"
          >
            <span className="inline-block w-[3ch] text-right">{frameIndex + 1}</span>
            <span aria-hidden> / </span>
            <span className="inline-block w-[3ch] text-left">{project.frameCount}</span>
          </span>
          <StepperBox
            value={project.fps}
            onDec={() => {
              if (project.fps > 1) useProject.getState().setProjectSettings({ fps: project.fps - 1 });
            }}
            onInc={() => {
              if (project.fps < 60) useProject.getState().setProjectSettings({ fps: project.fps + 1 });
            }}
            onSetValue={(n) => useProject.getState().setProjectSettings({ fps: n })}
            min={1}
            max={60}
            decDisabled={project.fps <= 1}
            incDisabled={project.fps >= 60}
            decLabel="Slower"
            incLabel="Faster"
            trailing={
              <span className="text-[12px] leading-[14px] text-white opacity-20" style={{ fontFamily: PAPER.fontMono }}>
                fps
              </span>
            }
          />
        </div>

        <DockSep />

        {isAnimatron ? (
          <SquareBtn
            label="Show complete drawing on canvas"
            onClick={toggleShowFullStrokes}
            active={showFullStrokes}
          >
            {(_bg, color) => <Layers2 size={20} color={color} weight="Outline" />}
          </SquareBtn>
        ) : null}

        <div className="flex items-center gap-[14px]">
          <SquareBtn
            label="Animation easing — toggle panel; curve applies to all paths"
            onClick={toggleAnimationPanel}
            active={animationPanelOpen}
          >
            {(_bg, color) => <EaseCurveGlyph color={color} />}
          </SquareBtn>
          <SquareBtn label="Onion skin settings" onClick={toggleOnionPanel} active={onionSkin}>
            {(bg, color) => <OnionRingsGlyph stroke={bg} color={color} />}
          </SquareBtn>
        </div>

        <DockSep />

        <StepperBox
          leading={<LayerCountGlyph />}
          value={project.layers.length}
          onDec={() => {
            if (project.layers.length > 1) deleteLayer(project.layers.length - 1);
          }}
          onInc={addLayer}
          onSetValue={setLayerCount}
          min={1}
          max={500}
          decDisabled={project.layers.length <= 1}
          decLabel="Remove layer"
          incLabel="Add layer"
        />

        <StepperBox
          leading={<FrameCountGlyph />}
          value={project.frameCount}
          onDec={() => applyShrink(1)}
          onInc={() => applyExtend(1)}
          onSetValue={(n) => extendTimeline(n - project.frameCount)}
          min={1}
          max={100000}
          decDisabled={project.frameCount <= 1}
          decLabel="Fewer frames"
          incLabel="More frames"
        />

        {/* Draw / Preview segmented toggle */}
        <div
          className="flex h-[29px] items-center overflow-clip rounded-[10px] p-[2px]"
          style={{ backgroundColor: PAPER.segmentBg, outline: `1px solid ${PAPER.borderHairline}` }}
        >
          <Tooltip content="Draw">
            <button
              type="button"
              onClick={() => setStage("draw")}
              aria-label="Draw"
              aria-pressed={stage === "draw"}
              className="grid h-[24px] w-[38px] place-items-center rounded-[7px] transition-colors hover:bg-[#313131]"
              style={{
                backgroundColor: stage === "draw" ? PAPER.segmentActive : undefined,
                opacity: stage === "draw" ? 1 : 0.7,
              }}
            >
              <StagePenGlyph size={14} />
            </button>
          </Tooltip>
          <Tooltip content="Preview">
            <button
              type="button"
              onClick={() => setStage("preview")}
              aria-label="Preview"
              aria-pressed={stage === "preview"}
              className="grid h-[24px] w-[38px] place-items-center rounded-[7px] transition-colors hover:bg-[#313131]"
              style={{
                backgroundColor: stage === "preview" ? PAPER.segmentActive : undefined,
                opacity: stage === "preview" ? 1 : 0.7,
              }}
            >
              <StagePreviewGlyph size={14} />
            </button>
          </Tooltip>
        </div>
      </div>

      {collapsed ? null : (
        /* stop-motion / Animatron — TimingBar + rows; nano ScrollArea owns both axes */
        <div ref={stampTrackRef} className="relative mt-[19px]">
          {/* Paper 6ML-0 stamp — pill sits in the 19px gap above the ruler;
              line runs through the timing bar + layer rows. Drag to scrub. */}
          <TimelinePlayheadStamp
            left={
              cellsInset +
              (isAnimatron
                ? (frameIndex / Math.max(project.fps, 1)) * 1000 * pxPerMs
                : frameIndex * (cellWidth + CELL_GAP) + cellWidth / 2) -
              scrollX
            }
            label={`${(frameIndex / Math.max(project.fps, 1)).toFixed(1)}s`}
            onScrub={setFrameIndex}
            frameFromClientX={stampFrameFromClientX}
          />
          {/* timing ruler — Paper AKB-0 (stop-motion) / 6JD-0 (Animatron) */}
          <div className="mb-[5px]">
            <TimelineTimingBar
              frameCount={project.frameCount}
              fps={project.fps}
              frameIndex={frameIndex}
              cellWidth={timingCellWidth}
              cellsInset={cellsInset}
              scrollLeft={scrollX}
              zoom={cellZoom}
              zoomMin={MIN_CELL_ZOOM}
              zoomMax={MAX_CELL_ZOOM}
              onScrub={setFrameIndex}
              onZoom={(z) => setCellZoom(clampZoom(z))}
              autoRecord={autoKey}
              onToggleAutoRecord={toggleAutoKey}
              layersCollapsed={layersCollapsed}
              onToggleLayersCollapsed={() => setLayersCollapsed((c) => !c)}
              onSetDurationMs={(ms) =>
                extendTimeline(Math.round((ms / 1000) * project.fps) - project.frameCount)
              }
            />
          </div>
          {!layersCollapsed && (
            <div
              ref={rowsVpRef}
              className="relative w-full"
              style={{ height: rowsViewportH }}
            >
              <ScrollArea
                orientation="both"
                fade={false}
                className="h-full w-full"
              >
                {isAnimatron ? (
                  <ClipTimeline
                    pxPerMs={pxPerMs}
                    showLabels={!layersCollapsed}
                  />
                ) : (
                  <div
                    className="flex w-max min-w-full flex-col"
                    style={{ gap: LAYER_ROW_GAP }}
                  >
                    {project.layers.map((layer, li) => (
                      <TimelineLayerRow
                        key={layer.id}
                        layer={layer}
                        active={li === layerIndex}
                        selected={selectedLayerIndices.includes(li)}
                        frameCount={project.frameCount}
                        frameIndex={frameIndex}
                        cellWidth={cellWidth}
                        canDelete={project.layers.length > 1}
                        menuOpen={openMenuIndex === li}
                        onMenuOpenChange={(open) => setOpenMenuIndex(open ? li : null)}
                        onSelectLayer={() => {
                          setLayerIndex(li);
                          setLayerIndices([li]);
                        }}
                        onToggleVisible={() => toggleLayerVisible(li)}
                        onSelectCell={(fi) => {
                          setLayerIndex(li);
                          setFrameIndex(fi);
                        }}
                        dragging={layerDrag?.from === li}
                        dragOffset={rowDragOffset(li)}
                        // the lifted row tracks the pointer 1:1; the rows making room ease
                        animateOffset={layerDrag?.from !== li}
                        onGripPointerDown={(e) => {
                          e.preventDefault();
                          layerDragRef.current = { from: li, startY: e.clientY };
                          setLayerDrag({ from: li, dy: 0 });
                        }}
                        onDelete={() => deleteLayer(li)}
                      />
                    ))}
                  </div>
                )}
              </ScrollArea>
            </div>
          )}
        </div>
      )}
      </div>
      </GooeySurfaceMorph>
    </div>
  );
}
