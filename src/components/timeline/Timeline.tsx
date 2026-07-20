import { useEffect, useRef, useState } from "react";
import { cn } from "@/lib/utils";
import { useProject } from "@/state/project";
import { usePlayback } from "@/state/playback";
import { playerRef } from "@/state/playerRef";
import { resolveCelIndex } from "@/model/types";
import { ClipTimeline } from "@/components/timeline/ClipTimeline";
import { RangeSlider } from "@/components/motion/range-slider";
import {
  Popover,
  PopoverTrigger,
  PopoverContent,
} from "@/components/motion/popover";
import { Button } from "@/components/ui/button";
import { CustomScroll } from "@/components/ui/custom-scroll";
import { HorizontalScroll } from "@/components/ui/horizontal-scroll";
import {
  DropdownMenu,
  DropdownTrigger,
  DropdownContent,
} from "@/components/ui/dropdown";
import { MenuItem } from "@/components/ui/menu-item";
import { Tooltip } from "@/components/ui/tooltip";
import PlayerIcon from "@/components/ui/player-icon";
import RightChevron from "@/components/ui/right-chevron";
import KeyframesIcon from "@/components/ui/keyframes-icon";
import CopyIcon from "@/components/ui/copy-icon";
import TrashIcon from "@/components/ui/trash-icon";
import LayersIcon from "@/components/ui/layers-icon";
import Stack3Icon from "@/components/ui/stack-3-icon";
import EyeIcon from "@/components/ui/eye-icon";
import EyeOffIcon from "@/components/ui/eye-off-icon";
import { PenNib } from "reicon-react";
import ExpandIcon from "@/components/ui/expand-icon";
import DotsHorizontalIcon from "@/components/ui/dots-horizontal-icon";
import LayerGripIcon from "@/components/ui/layer-grip-icon";

function TBtn({
  label,
  onClick,
  active,
  disabled,
  children,
}: {
  label: string;
  onClick: () => void;
  active?: boolean;
  disabled?: boolean;
  children: React.ReactNode;
}) {
  return (
    <Tooltip content={label}>
      <button
        type="button"
        onClick={onClick}
        disabled={disabled}
        className={cn(
          "grid h-7 w-7 place-items-center rounded-lg text-muted-foreground transition-colors hover:bg-primary/10 hover:text-foreground disabled:opacity-40",
          active && "bg-primary/15 text-foreground",
        )}
      >
        {children}
      </button>
    </Tooltip>
  );
}

export function Timeline() {
  const project = useProject((s) => s.project);
  const frameIndex = useProject((s) => s.frameIndex);
  const layerIndex = useProject((s) => s.layerIndex);
  const playing = usePlayback((s) => s.playing);
  const onionSkin = usePlayback((s) => s.onionSkin);
  const stage = usePlayback((s) => s.stage);
  const workflow = usePlayback((s) => s.workflow);
  const setStage = usePlayback((s) => s.setStage);

  const [extendBy, setExtendBy] = useState(12);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const dragLayerRef = useRef<number | null>(null);
  const extendTimeline = useProject((s) => s.extendTimeline);
  const removeFrameAt = useProject((s) => s.removeFrameAt);
  const setFrameIndex = useProject((s) => s.setFrameIndex);
  const setLayerIndex = useProject((s) => s.setLayerIndex);
  const stepFrame = useProject((s) => s.stepFrame);
  const addKeyframe = useProject((s) => s.addKeyframe);
  const duplicateFrameForward = useProject((s) => s.duplicateFrameForward);
  const addLayer = useProject((s) => s.addLayer);
  const deleteLayer = useProject((s) => s.deleteLayer);
  const reorderLayer = useProject((s) => s.reorderLayer);
  const toggleLayerVisible = useProject((s) => s.toggleLayerVisible);
  const toggleOnionSkin = usePlayback((s) => s.toggleOnionSkin);

  function applyExtend(n = extendBy) {
    const frames = Math.max(1, Math.min(120, Math.round(Number(n))));
    if (!Number.isFinite(frames) || frames < 1) return;
    extendTimeline(frames);
  }

  function applyShrink(n = extendBy) {
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

  const frames = Array.from({ length: project.frameCount }, (_, i) => i);
  const isAnimatron = workflow === "animatron";

  return (
    <div className="pointer-events-auto w-fit max-w-[calc(100vw-2rem)] rounded-2xl border border-border bg-card/90 px-2 py-2 shadow-2xl backdrop-blur-xl">
      {/* transport + frame ops — keep row ~42px */}
      <div className="mb-2 flex h-[42px] items-center gap-1">
        <TBtn label="Back 1 frame ( , )" onClick={() => stepFrame(-1)}>
          <span className="rotate-180">
            <RightChevron size={14} />
          </span>
        </TBtn>
        <TBtn
          label={playing ? "Pause (Enter)" : "Play (Enter)"}
          onClick={togglePlaying}
          active={playing}
        >
          <PlayerIcon size={14} />
        </TBtn>
        <TBtn label="Forward 1 frame ( . )" onClick={() => stepFrame(1)}>
          <RightChevron size={14} />
        </TBtn>
        <div className="mx-2 flex h-5 items-center gap-1.5 font-mono text-[11px] text-muted-foreground">
          <span className="tabular-nums">
            {String(frameIndex + 1).padStart(2, "0")} / {project.frameCount}
          </span>
          <label className="inline-flex h-5 items-center gap-1 rounded-md border border-border bg-background/40 px-1.5">
            <input
              type="number"
              key={project.fps}
              defaultValue={project.fps}
              min={1}
              max={60}
              title="Frames per second"
              onBlur={(e) => {
                const v = Math.round(Number(e.target.value));
                if (Number.isFinite(v) && v >= 1 && v <= 60 && v !== project.fps)
                  useProject.getState().setProjectSettings({ fps: v });
              }}
              onKeyDown={(e) => {
                if (e.key === "Enter") (e.target as HTMLInputElement).blur();
                e.stopPropagation();
              }}
              className="w-8 bg-transparent text-center text-[11px] text-foreground outline-none [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none"
            />
            <span className="opacity-60">fps</span>
          </label>
        </div>

        {!isAnimatron && (
          <>
            <div className="mx-1 h-4 w-px bg-border" />
            <TBtn
              label="Empty cel — stop the held drawing here, start fresh"
              onClick={addKeyframe}
            >
              <KeyframesIcon size={14} />
            </TBtn>
            <TBtn label="Duplicate frame → next" onClick={duplicateFrameForward}>
              <CopyIcon size={14} />
            </TBtn>
            <Popover
              open={deleteOpen}
              onOpenChange={setDeleteOpen}
              side="top"
              align="center"
              sideOffset={12}
              panelRadius={14}
            >
              <PopoverTrigger>
                <button
                  type="button"
                  disabled={project.frameCount <= 1}
                  className={cn(
                    "grid h-7 w-7 place-items-center rounded-lg text-muted-foreground transition-colors hover:bg-primary/10 hover:text-foreground disabled:opacity-40",
                  )}
                  aria-label="Delete frame"
                  title="Delete frame"
                >
                  <TrashIcon size={14} />
                </button>
              </PopoverTrigger>
              <PopoverContent className="flex w-48 flex-col gap-3 p-3">
                <p className="text-[12px] leading-snug text-popover-foreground">
                  Delete frame {String(frameIndex + 1).padStart(2, "0")}?
                </p>
                <div className="flex items-center justify-end gap-1.5">
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    className="h-7 min-h-0 px-2 text-[11px]"
                    onClick={() => setDeleteOpen(false)}
                  >
                    Cancel
                  </Button>
                  <Button
                    type="button"
                    variant="secondary"
                    size="sm"
                    className="h-7 min-h-0 px-2 text-[11px] text-red-500 hover:text-red-400"
                    onClick={() => {
                      removeFrameAt(frameIndex);
                      setDeleteOpen(false);
                    }}
                  >
                    Delete
                  </Button>
                </div>
              </PopoverContent>
            </Popover>
            <div className="mx-1 h-4 w-px bg-border" />
            <TBtn label="Onion skin" onClick={toggleOnionSkin} active={onionSkin}>
              <Stack3Icon size={14} />
            </TBtn>
          </>
        )}

        <TBtn label="Add layer" onClick={addLayer}>
          <LayersIcon size={14} />
        </TBtn>

        <div className="mx-1 flex h-5 max-h-5 items-center gap-1.5">
          <Button
            type="button"
            variant="secondary"
            size="sm"
            title={`Remove ${Math.min(extendBy, project.frameCount - 1)} frames from the end`}
            onClick={() => applyShrink(extendBy)}
            disabled={project.frameCount <= 1}
            className="h-5 max-h-5 min-h-0 shrink-0 rounded-md px-2 text-[10px] font-semibold tabular-nums"
          >
            −{extendBy}
          </Button>
          <div className="h-5 w-28 shrink-0">
            <RangeSlider
              value={extendBy}
              onValueChange={(v) => setExtendBy(v)}
              onValueCommit={(v) => setExtendBy(v)}
              min={1}
              max={120}
              step={1}
              showTicks={false}
              aria-label="Frames to add or remove"
              className="h-5 max-h-5 bg-muted/80"
            />
          </div>
          <Button
            type="button"
            variant="secondary"
            size="sm"
            title={`Add ${extendBy} frames to the timeline`}
            onClick={() => applyExtend(extendBy)}
            className="h-5 max-h-5 min-h-0 shrink-0 rounded-md px-2 text-[10px] font-semibold tabular-nums"
          >
            +{extendBy}
          </Button>
        </div>

        <div className="ml-auto flex items-center gap-0.5 rounded-xl border border-border/60 bg-background/40 p-0.5">
          <TBtn
            label="Draw"
            onClick={() => setStage("draw")}
            active={stage === "draw"}
          >
            <PenNib size={15} />
          </TBtn>
          <TBtn
            label="Preview"
            onClick={() => setStage("preview")}
            active={stage === "preview"}
          >
            <ExpandIcon size={14} />
          </TBtn>
        </div>
      </div>

      {isAnimatron ? (
        <ClipTimeline />
      ) : (
        <div className="h-40 max-h-40 min-h-0 w-full min-w-0">
          <CustomScroll heightRelativeToParent="100%" allowOuterScroll>
          <div className="flex min-w-0 items-start">
          {/* pinned layer labels */}
          <div className="shrink-0">
          {project.layers.map((layer, li) => (
            <div
              key={layer.id}
              className="flex h-6 items-center gap-1 py-0.5"
              onDragOver={(e) => e.preventDefault()}
              onDrop={() => {
                const from = dragLayerRef.current;
                if (from !== null && from !== li) reorderLayer(from, li);
                dragLayerRef.current = null;
              }}
            >
              <button
                type="button"
                draggable
                onDragStart={() => {
                  dragLayerRef.current = li;
                }}
                onDragEnd={() => {
                  dragLayerRef.current = null;
                }}
                className="grid h-5 w-5 shrink-0 cursor-grab place-items-center text-muted-foreground active:cursor-grabbing hover:text-foreground"
                aria-label="Drag to reorder layer"
                title="Drag to reorder"
              >
                <LayerGripIcon size={12} />
              </button>
              <button
                type="button"
                onClick={() => toggleLayerVisible(li)}
                className="grid h-5 w-5 shrink-0 place-items-center text-muted-foreground hover:text-foreground"
              >
                {layer.visible ? <EyeIcon size={12} /> : <EyeOffIcon size={12} />}
              </button>
              <button
                type="button"
                onClick={() => setLayerIndex(li)}
                className={cn(
                  "w-20 shrink-0 truncate rounded px-1.5 text-left text-[11px]",
                  li === layerIndex
                    ? "bg-primary/15 text-foreground"
                    : "text-muted-foreground hover:text-foreground",
                )}
              >
                {layer.name}
                {layer.isStatic && <span className="ml-1 opacity-50">∞</span>}
              </button>
              <DropdownMenu>
                <DropdownTrigger
                  render={
                    <button
                      type="button"
                      className="grid h-5 w-5 shrink-0 place-items-center text-muted-foreground hover:text-foreground"
                      aria-label="Layer menu"
                    >
                      <DotsHorizontalIcon size={12} />
                    </button>
                  }
                />
                <DropdownContent align="start" className="min-w-36">
                  <MenuItem
                    label="Delete Layer"
                    index={0}
                    onSelect={() => deleteLayer(li)}
                    className="text-red-500 [&_span]:text-red-500"
                    disabled={project.layers.length <= 1}
                  />
                </DropdownContent>
              </DropdownMenu>
            </div>
          ))}
          </div>

          {/* frame cells — every layer shares ONE horizontal scrollbar */}
          <HorizontalScroll className="min-w-0 flex-1" id="timeline-frames">
            {project.layers.map((layer, li) => (
              <div key={layer.id} className="flex h-6 items-center gap-px py-0.5">
                {frames.map((fi) => {
                  const isKey = layer.isStatic ? fi === 0 : !!layer.frames[fi];
                  const isHold =
                    !isKey && !layer.isStatic && resolveCelIndex(layer, fi) !== null;
                  const isPlayhead = fi === frameIndex;
                  return (
                    <button
                      key={fi}
                      type="button"
                      onClick={() => {
                        setLayerIndex(li);
                        setFrameIndex(fi);
                      }}
                      className={cn(
                        "grid h-5 w-4 shrink-0 place-items-center rounded-sm border",
                        isPlayhead
                          ? "border-primary/60 bg-primary/20"
                          : "border-border/60 bg-background/40 hover:bg-primary/10",
                      )}
                      title={`Frame ${fi + 1}`}
                    >
                      {isKey ? (
                        <span className="h-1.5 w-1.5 rounded-full bg-foreground/90" />
                      ) : isHold ? (
                        <span className="h-px w-2 bg-muted-foreground/50" />
                      ) : null}
                    </button>
                  );
                })}
              </div>
            ))}
          </HorizontalScroll>
          </div>
          </CustomScroll>
        </div>
      )}
    </div>
  );
}
