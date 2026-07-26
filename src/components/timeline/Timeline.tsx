import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import { useProject } from "@/state/project";
import { usePlayback } from "@/state/playback";
import { useTools } from "@/state/tools";
import { playerRef } from "@/state/playerRef";
import { ClipTimeline } from "@/components/timeline/ClipTimeline";
import { Tooltip } from "@/components/motion/tooltip";
import { AnimationPanel } from "@/components/panels/AnimationPanel";
import { SettingsDocks } from "@/components/chrome/SettingsDocks";
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
  CELLS_INSET_COLLAPSED,
  CELL_GAP,
  LAYER_ROW_GAP,
  LAYER_ROW_H,
  LAYER_ROW_PITCH,
} from "@/components/timeline/TimelineLayerRow";
import { ScrollBarX } from "@/components/timeline/TimelineScrollBars";
import { ScrollArea } from "@/components/ui/scroll-area";
import { TimelineTimingBar } from "@/components/timeline/TimelineTimingBar";

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
  const autoKey = useTools((s) => s.autoKey);
  const toggleAutoKey = useTools((s) => s.toggleAutoKey);
  const isAnimatron = workflow === "animatron";
  const [collapsed, setCollapsed] = useState(false);
  /** "collapse layers" — hides the entire layer-row stack (timing bar stays) */
  const [layersCollapsed, setLayersCollapsed] = useState(false);
  const [openMenuIndex, setOpenMenuIndex] = useState<number | null>(null);
  const shellRef = useRef<HTMLDivElement>(null);
  const rowsVpRef = useRef<HTMLDivElement>(null);
  const dragCollapseRef = useRef<{ startY: number; collapsed: boolean } | null>(null);
  const [cellZoom, setCellZoom] = useState(1);
  const cellWidth = Math.round(BASE_CELL_WIDTH * cellZoom);
  const cellsInset = layersCollapsed ? CELLS_INSET_COLLAPSED : CELLS_INSET;

  /** one shared X offset for every layer row (see TimelineScrollBars) */
  const [scrollX, setScrollX] = useState(0);
  const [rowsWidth, setRowsWidth] = useState(0);
  const cellsWidth = Math.max(0, rowsWidth - cellsInset);
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
  }, [collapsed, isAnimatron, layersCollapsed]);

  useEffect(() => {
    setScrollX((x) => Math.min(x, maxScrollX));
  }, [maxScrollX]);

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
   * pans frames, and a plain wheel falls through to nano's content viewport
   * whenever there are more layers than fit. Native listener because React
   * registers `wheel` passively, so `preventDefault` there is a no-op.
   */
  useEffect(() => {
    const wrap = rowsVpRef.current;
    if (!wrap) return;
    const vp =
      (wrap.querySelector(
        ".react-nano-scrollbar-content",
      ) as HTMLElement | null) ?? wrap;
    function onWheel(e: WheelEvent) {
      if (e.ctrlKey) {
        e.preventDefault();
        onPinchZoom(e.deltaY);
        return;
      }
      const canScrollY = vp.scrollHeight - vp.clientHeight > 1;
      const dx = e.deltaX || (e.shiftKey || !canScrollY ? e.deltaY : 0);
      if (!dx) return;
      e.preventDefault();
      setScrollX((x) => Math.max(0, Math.min(maxScrollX, x + dx)));
    }
    vp.addEventListener("wheel", onWheel, { passive: false });
    return () => vp.removeEventListener("wheel", onWheel);
  }, [onPinchZoom, maxScrollX, project.layers.length, layersCollapsed]);

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
    <div ref={shellRef} className="relative flex w-full flex-col items-center">
      {/* Above the whole column (settings + dock). Inline bottom — class bottom-full
          was a no-op here and left the panel in static flow, shooting downward. */}
      {animationPanelOpen && (
        <div
          className="pointer-events-auto absolute left-1/2 z-30 -translate-x-1/2"
          style={{ bottom: "calc(100% + 14px)" }}
        >
          <AnimationPanel />
        </div>
      )}
      {stage === "draw" && (
        <div className="pointer-events-auto relative z-20" style={{ marginBottom: PAPER.settingGap }}>
          <SettingsDocks />
        </div>
      )}
      {/*
        Paper 5S8-0: 704 wide, 6px top / 12px bottom / 16px side padding,
        handle → transport 12px, transport → track 16px.
      */}
      <div
        className="pointer-events-auto relative w-full overflow-hidden rounded-[19px] antialiased"
        style={{
          backgroundColor: PAPER.surface,
          outline: `0.4px solid ${PAPER.outlineSubtle}`,
          paddingTop: 7,
          paddingBottom: 14,
          paddingLeft: 19,
          paddingRight: 19,
        }}
      >
      {/* collapse handle — Paper 9JI-0 */}
      <div
        className="mx-auto -mt-[5px] mb-[10px] flex cursor-grab touch-none items-center justify-center py-[5px] active:cursor-grabbing"
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
          label="Empty cel — stop the held drawing here, start fresh"
          onClick={addKeyframe}
        >
          <ClearFrameIcon />
        </DockBtn>

        <div className="flex items-center gap-3">
          <span
            className="text-[12px] leading-[14px] text-white opacity-50 tabular-nums"
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

        <div className="flex items-center gap-[14px]">
          <SquareBtn
            label="Animation easing — toggle panel; curve applies to all paths"
            onClick={toggleAnimationPanel}
            active={animationPanelOpen}
          >
            {(_bg, color) => <EaseCurveGlyph color={color} />}
          </SquareBtn>
          <SquareBtn label="Onion skin" onClick={toggleOnionSkin} active={onionSkin}>
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

      {collapsed ? null : isAnimatron ? (
        <div className="mt-[19px]">
          <ClipTimeline />
        </div>
      ) : (
        /* exposure sheet — Paper 3X4-0: one #0D0D0D card per layer, 4px apart */
        <div className="relative mt-[19px]">
          {/* timing ruler above the stack — Paper 5YT-0 (5YS-0 puts it 4px up) */}
          <div className="mb-[5px]">
            <TimelineTimingBar
              frameCount={project.frameCount}
              fps={project.fps}
              frameIndex={frameIndex}
              cellWidth={cellWidth}
              cellsInset={cellsInset}
              scrollLeft={scrollX}
              zoom={cellZoom}
              zoomMin={MIN_CELL_ZOOM}
              zoomMax={MAX_CELL_ZOOM}
              onScrub={setFrameIndex}
              onZoom={(z) => setCellZoom(Math.min(MAX_CELL_ZOOM, Math.max(MIN_CELL_ZOOM, z)))}
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
            <>
              <div
                ref={rowsVpRef}
                style={{ maxHeight: ROWS_MAX_H }}
                className="relative w-full"
              >
                <ScrollArea className="h-full max-h-[inherit]">
                  <div
                    className="flex flex-col"
                    style={{ gap: LAYER_ROW_GAP }}
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
                </ScrollArea>
              </div>

              {/* frames overflow the row width — one bar drives every row.
                  Only mounted while it's needed, so the player keeps Paper's 102px
                  height whenever the frames fit. */}
              {maxScrollX > 0 && (
                <div style={{ paddingLeft: cellsInset }} className="mt-[5px]">
                  <ScrollBarX
                    scrollLeft={scrollX}
                    viewportWidth={cellsWidth}
                    contentWidth={contentWidth}
                    onScroll={setScrollX}
                    controls="timeline-frames"
                  />
                </div>
              )}
            </>
          )}
        </div>
      )}
      </div>
    </div>
  );
}
