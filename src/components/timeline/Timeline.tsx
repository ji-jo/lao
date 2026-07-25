import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import { useProject } from "@/state/project";
import { usePlayback } from "@/state/playback";
import { playerRef } from "@/state/playerRef";
import { ClipTimeline } from "@/components/timeline/ClipTimeline";
import { Tooltip } from "@/components/ui/tooltip";
import { AnimationPanel } from "@/components/panels/AnimationPanel";
import { PAPER } from "@/components/chrome/paper-tokens";
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
  CELL_GAP,
  LAYER_ROW_GAP,
  LAYER_ROW_H,
  LAYER_ROW_PITCH,
} from "@/components/timeline/TimelineLayerRow";
import { ScrollBarX, ScrollThumbY } from "@/components/timeline/TimelineScrollBars";
import { TimelineTimingBar } from "@/components/timeline/TimelineTimingBar";

/** Frame-cell zoom (pinch / ctrl+wheel): width scales, row height stays fixed. */
const BASE_CELL_WIDTH = 16;
const MIN_CELL_ZOOM = 0.6;
const MAX_CELL_ZOOM = 2.75;

/**
 * Rows viewport cap — Paper 2P6-0 pins the whole player at 232px, which leaves
 * 5 full layer rows plus a sliver of the 6th so the overflow reads as scrollable.
 */
const ROWS_MAX_H = 5 * LAYER_ROW_H + 4 * LAYER_ROW_GAP + 18;

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
  const addLayer = useProject((s) => s.addLayer);
  const deleteLayer = useProject((s) => s.deleteLayer);
  const reorderLayer = useProject((s) => s.reorderLayer);
  const toggleLayerVisible = useProject((s) => s.toggleLayerVisible);
  const toggleOnionSkin = usePlayback((s) => s.toggleOnionSkin);
  const animationPanelOpen = usePlayback((s) => s.animationPanelOpen);
  const toggleAnimationPanel = usePlayback((s) => s.toggleAnimationPanel);
  const isAnimatron = workflow === "animatron";
  const [collapsed, setCollapsed] = useState(false);
  const [openMenuIndex, setOpenMenuIndex] = useState<number | null>(null);
  const shellRef = useRef<HTMLDivElement>(null);
  const rowsVpRef = useRef<HTMLDivElement>(null);
  const dragCollapseRef = useRef<{ startY: number; collapsed: boolean } | null>(null);
  const [cellZoom, setCellZoom] = useState(1);
  const cellWidth = Math.round(BASE_CELL_WIDTH * cellZoom);

  /** one shared X offset for every layer row (see TimelineScrollBars) */
  const [scrollX, setScrollX] = useState(0);
  const [rowsWidth, setRowsWidth] = useState(0);
  const cellsWidth = Math.max(0, rowsWidth - CELLS_INSET);
  const contentWidth = project.frameCount * (cellWidth + CELL_GAP) - CELL_GAP;
  const maxScrollX = Math.max(0, contentWidth - cellsWidth);

  const onPinchZoom = useCallback((deltaY: number) => {
    setCellZoom((z) => {
      const next = z * (1 - deltaY * 0.01);
      return Math.min(MAX_CELL_ZOOM, Math.max(MIN_CELL_ZOOM, next));
    });
  }, []);

  useLayoutEffect(() => {
    const vp = rowsVpRef.current;
    if (!vp) return;
    const measure = () => setRowsWidth(vp.clientWidth);
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(vp);
    return () => ro.disconnect();
  }, [collapsed, isAnimatron]);

  useEffect(() => {
    setScrollX((x) => Math.min(x, maxScrollX));
  }, [maxScrollX]);

  /** zoom out until every frame fits the visible cells lane (timing bar ⇤) */
  function fitFramesToWidth() {
    if (cellsWidth <= 0 || project.frameCount < 1) return;
    const perCell = cellsWidth / project.frameCount;
    const target = (perCell - CELL_GAP) / BASE_CELL_WIDTH;
    setCellZoom(Math.min(MAX_CELL_ZOOM, Math.max(MIN_CELL_ZOOM, target)));
    setScrollX(0);
  }

  /** bring the playhead column back into view (timing bar target dot) */
  function revealPlayhead() {
    const pitch = cellWidth + CELL_GAP;
    const left = frameIndex * pitch;
    setScrollX((x) => {
      if (left < x) return left;
      if (left + cellWidth > x + cellsWidth) {
        return Math.min(maxScrollX, left + cellWidth - cellsWidth);
      }
      return x;
    });
  }

  const layerCount = project.layers.length;
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
   * Wheel over the rows: ctrl/pinch zooms the cells, deltaX (or shift+wheel)
   * pans frames, and a plain wheel falls through to the native vertical scroll
   * whenever there are more layers than fit. Native listener because React
   * registers `wheel` passively, so `preventDefault` there is a no-op.
   */
  useEffect(() => {
    const vp = rowsVpRef.current;
    if (!vp) return;
    function onWheel(e: WheelEvent) {
      if (e.ctrlKey) {
        e.preventDefault();
        onPinchZoom(e.deltaY);
        return;
      }
      const canScrollY = vp!.scrollHeight - vp!.clientHeight > 1;
      const dx = e.deltaX || (e.shiftKey || !canScrollY ? e.deltaY : 0);
      if (!dx) return;
      e.preventDefault();
      setScrollX((x) => Math.max(0, Math.min(maxScrollX, x + dx)));
    }
    vp.addEventListener("wheel", onWheel, { passive: false });
    return () => vp.removeEventListener("wheel", onWheel);
  }, [onPinchZoom, maxScrollX]);

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
      const target = e.target as HTMLElement;
      if (target.tagName === "INPUT" || target.tagName === "TEXTAREA") return;
      if (e.key === "ArrowLeft" || e.key === ",") stepFrame(-1);
      else if (e.key === "ArrowRight" || e.key === ".") stepFrame(1);
      else if (e.key === "Enter" && !e.ctrlKey) togglePlaying();
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [stepFrame]);

  /**
   * Collapse handle (Paper 9JI-0 / 8NJ-0): drag down past ~24px and the track
   * drops away, leaving the 58px handle+transport peek. Drag back up (or click)
   * restores it.
   */
  function onCollapsePointerDown(e: React.PointerEvent) {
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    dragCollapseRef.current = { startY: e.clientY, collapsed };
  }
  function onCollapsePointerMove(e: React.PointerEvent) {
    const drag = dragCollapseRef.current;
    if (!drag) return;
    const dy = e.clientY - drag.startY;
    if (dy > 24) setCollapsed(true);
    else if (dy < -24) setCollapsed(false);
  }
  function onCollapsePointerUp(e: React.PointerEvent) {
    const drag = dragCollapseRef.current;
    dragCollapseRef.current = null;
    // a tap (no meaningful travel) toggles
    if (drag && Math.abs(e.clientY - drag.startY) <= 4) setCollapsed(!drag.collapsed);
  }

  return (
    <div ref={shellRef} className="relative flex flex-col items-center">
      {animationPanelOpen && (
        <div className="pointer-events-auto mb-3">
          <AnimationPanel />
        </div>
      )}
      {/*
        Paper 5S8-0: 704 wide, 6px top / 12px bottom / 16px side padding,
        handle → transport 12px, transport → track 16px.
      */}
      <div
        className="pointer-events-auto relative w-full overflow-hidden rounded-[16px] antialiased"
        style={{
          backgroundColor: PAPER.surface,
          outline: `0.4px solid ${PAPER.outlineSubtle}`,
          paddingTop: 6,
          paddingBottom: 12,
          paddingLeft: 16,
          paddingRight: 16,
        }}
      >
      {/* collapse handle — Paper 9JI-0 */}
      <div
        className="mx-auto -mt-1 mb-2 flex cursor-grab touch-none items-center justify-center py-1 active:cursor-grabbing"
        onPointerDown={onCollapsePointerDown}
        onPointerMove={onCollapsePointerMove}
        onPointerUp={onCollapsePointerUp}
        role="button"
        tabIndex={0}
        aria-expanded={!collapsed}
        onKeyDown={(e) => {
          if (e.key === "Enter" || e.key === " ") {
            e.preventDefault();
            setCollapsed((c) => !c);
          }
        }}
        title={collapsed ? "Drag up to expand timeline" : "Drag down to collapse timeline"}
      >
        <span
          className="h-1 w-[34px] shrink-0 rounded-full"
          style={{ backgroundColor: PAPER.handle }}
        />
      </div>
      {/* transport row — Paper 5S8-0 */}
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-2.5 overflow-clip px-1 py-[3px]">
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
          <LoopIcon active={loop} />
        </DockBtn>

        <DockBtn
          label="Empty cel — stop the held drawing here, start fresh"
          onClick={addKeyframe}
        >
          <ClearFrameIcon />
        </DockBtn>

        <div className="flex items-center gap-2.5">
          <span
            className="text-[10px] leading-3 text-white opacity-50 tabular-nums"
            style={{ fontFamily: PAPER.fontMono }}
          >
            {String(frameIndex + 1).padStart(2, "0")} / {project.frameCount}
          </span>
          <StepperBox
            value={project.fps}
            onDec={() => {
              if (project.fps > 1) useProject.getState().setProjectSettings({ fps: project.fps - 1 });
            }}
            onInc={() => {
              if (project.fps < 60) useProject.getState().setProjectSettings({ fps: project.fps + 1 });
            }}
            decDisabled={project.fps <= 1}
            incDisabled={project.fps >= 60}
            decLabel="Slower"
            incLabel="Faster"
            trailing={
              <span className="text-[10px] leading-3 text-white opacity-20" style={{ fontFamily: PAPER.fontMono }}>
                fps
              </span>
            }
          />
        </div>

        <DockSep />

        <div className="flex items-center gap-3">
          <SquareBtn
            label="Animation easing"
            onClick={toggleAnimationPanel}
            active={animationPanelOpen}
          >
            <EaseCurveGlyph />
          </SquareBtn>
          <SquareBtn label="Onion skin" onClick={toggleOnionSkin} active={onionSkin}>
            {(bg) => <OnionRingsGlyph stroke={bg} />}
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
          decDisabled={project.layers.length <= 1}
          decLabel="Remove layer"
          incLabel="Add layer"
        />

        <StepperBox
          leading={<FrameCountGlyph />}
          value={project.frameCount}
          onDec={() => applyShrink(1)}
          onInc={() => applyExtend(1)}
          decDisabled={project.frameCount <= 1}
          decLabel="Fewer frames"
          incLabel="More frames"
        />

        {/* Draw / Preview segmented toggle */}
        <div
          className="flex h-6 items-center overflow-clip rounded-lg p-0.5"
          style={{ backgroundColor: PAPER.segmentBg, outline: `1px solid ${PAPER.borderHairline}` }}
        >
          <Tooltip content="Draw">
            <button
              type="button"
              onClick={() => setStage("draw")}
              aria-label="Draw"
              aria-pressed={stage === "draw"}
              className="grid h-5 w-8 place-items-center rounded-[7px] transition-colors"
              style={{
                backgroundColor: stage === "draw" ? PAPER.segmentActive : "transparent",
                opacity: stage === "draw" ? 1 : 0.7,
              }}
            >
              <StagePenGlyph size={12} />
            </button>
          </Tooltip>
          <Tooltip content="Preview">
            <button
              type="button"
              onClick={() => setStage("preview")}
              aria-label="Preview"
              aria-pressed={stage === "preview"}
              className="grid h-5 w-8 place-items-center rounded-[7px] transition-colors"
              style={{
                backgroundColor: stage === "preview" ? PAPER.segmentActive : "transparent",
                opacity: stage === "preview" ? 1 : 0.7,
              }}
            >
              <StagePreviewGlyph size={12} />
            </button>
          </Tooltip>
        </div>
      </div>

      {collapsed ? null : isAnimatron ? (
        <div className="mt-4">
          <ClipTimeline />
        </div>
      ) : (
        /* exposure sheet — Paper 3X4-0: one #0D0D0D card per layer, 4px apart */
        <div className="relative mt-4">
          {/* timing ruler above the stack — Paper 5YT-0 (5YS-0 puts it 4px up) */}
          <div className="mb-1">
            <TimelineTimingBar
              frameCount={project.frameCount}
              fps={project.fps}
              frameIndex={frameIndex}
              cellWidth={cellWidth}
              scrollLeft={scrollX}
              zoom={cellZoom}
              zoomMin={MIN_CELL_ZOOM}
              zoomMax={MAX_CELL_ZOOM}
              onScrub={setFrameIndex}
              onZoom={(z) => setCellZoom(Math.min(MAX_CELL_ZOOM, Math.max(MIN_CELL_ZOOM, z)))}
              onFitToWidth={fitFramesToWidth}
              onRevealPlayhead={revealPlayhead}
              onCollapse={() => setCollapsed(true)}
            />
          </div>
          <div
            ref={rowsVpRef}
            className="flex flex-col overflow-y-auto overscroll-contain [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
            style={{ gap: LAYER_ROW_GAP, maxHeight: ROWS_MAX_H }}
          >
            {project.layers.map((layer, li) => (
              <TimelineLayerRow
                key={layer.id}
                layer={layer}
                active={li === layerIndex}
                frameCount={project.frameCount}
                frameIndex={frameIndex}
                cellWidth={cellWidth}
                scrollLeft={scrollX}
                canDelete={project.layers.length > 1}
                menuOpen={openMenuIndex === li}
                onMenuOpenChange={(open) => setOpenMenuIndex(open ? li : null)}
                onSelectLayer={() => setLayerIndex(li)}
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

          {/* vertical thumb parks in the modal's right gutter — Paper 41E-0 */}
          <ScrollThumbY viewportRef={rowsVpRef} className="-right-3" />

          {/* frames overflow the row width — one bar drives every row.
              Only mounted while it's needed, so the player keeps Paper's 102px
              height whenever the frames fit. */}
          {maxScrollX > 0 && (
            <div style={{ paddingLeft: CELLS_INSET }} className="mt-1">
              <ScrollBarX
                scrollLeft={scrollX}
                viewportWidth={cellsWidth}
                contentWidth={contentWidth}
                onScroll={setScrollX}
                controls="timeline-frames"
              />
            </div>
          )}
        </div>
      )}
      </div>
    </div>
  );
}
