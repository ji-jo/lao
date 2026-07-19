import { useEffect } from "react";
import { cn } from "@/lib/utils";
import { useProject } from "@/state/project";
import { usePlayback } from "@/state/playback";
import { playerRef } from "@/state/playerRef";
import { resolveCelIndex } from "@/model/types";
import PlayerIcon from "@/components/ui/player-icon";
import RightChevron from "@/components/ui/right-chevron";
import KeyframesIcon from "@/components/ui/keyframes-icon";
import CopyIcon from "@/components/ui/copy-icon";
import TrashIcon from "@/components/ui/trash-icon";
import LayersIcon from "@/components/ui/layers-icon";
import Stack3Icon from "@/components/ui/stack-3-icon";
import EyeIcon from "@/components/ui/eye-icon";
import EyeOffIcon from "@/components/ui/eye-off-icon";
import { Tooltip } from "@/components/ui/tooltip";

function TBtn({
  label,
  onClick,
  active,
  children,
}: {
  label: string;
  onClick: () => void;
  active?: boolean;
  children: React.ReactNode;
}) {
  return (
    <Tooltip content={label}>
      <button
        type="button"
        onClick={onClick}
        className={cn(
          "grid h-7 w-7 place-items-center rounded-lg text-muted-foreground transition-colors hover:bg-primary/10 hover:text-foreground",
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
  const mode = usePlayback((s) => s.mode);

  const {
    setFrameIndex,
    setLayerIndex,
    stepFrame,
    addKeyframe,
    duplicateFrameForward,
    deleteKeyframe,
    extendTimeline,
    addLayer,
    toggleLayerVisible,
  } = useProject.getState();
  const { toggleOnionSkin } = usePlayback.getState();

  // preview mode delegates to the Remotion Player; draw mode uses an interval
  function togglePlaying() {
    const pb = usePlayback.getState();
    if (pb.mode === "preview" && playerRef.current) {
      if (playerRef.current.isPlaying()) playerRef.current.pause();
      else playerRef.current.play();
    } else {
      pb.togglePlaying();
    }
  }

  // playback loop (edit-mode draft playback)
  useEffect(() => {
    if (!playing || mode !== "draw") return;
    const interval = window.setInterval(() => {
      useProject.getState().stepFrame(1);
    }, 1000 / project.fps);
    return () => window.clearInterval(interval);
  }, [playing, mode, project.fps]);

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
  }, [stepFrame, togglePlaying]);

  const frames = Array.from({ length: project.frameCount }, (_, i) => i);

  return (
    <div className="pointer-events-auto w-fit max-w-[calc(100vw-2rem)] rounded-2xl border border-border bg-card/90 p-3 shadow-2xl backdrop-blur-xl">
      {/* transport + frame ops */}
      <div className="mb-2 flex items-center gap-1">
        <TBtn label="Back 1 frame ( , )" onClick={() => stepFrame(-1)}>
          <span className="rotate-180"><RightChevron size={14} /></span>
        </TBtn>
        <TBtn label={playing ? "Pause (Enter)" : "Play (Enter)"} onClick={togglePlaying} active={playing}>
          <PlayerIcon size={14} />
        </TBtn>
        <TBtn label="Forward 1 frame ( . )" onClick={() => stepFrame(1)}>
          <RightChevron size={14} />
        </TBtn>
        <div className="mx-2 min-w-16 text-center font-mono text-xs text-muted-foreground">
          {String(frameIndex + 1).padStart(2, "0")} / {project.frameCount}
          <span className="ml-2 opacity-60">{project.fps}fps</span>
        </div>
        <div className="mx-1 h-4 w-px bg-border" />
        <TBtn label="Blank keyframe" onClick={addKeyframe}>
          <KeyframesIcon size={14} />
        </TBtn>
        <TBtn label="Duplicate frame → next" onClick={duplicateFrameForward}>
          <CopyIcon size={14} />
        </TBtn>
        <TBtn label="Clear keyframe" onClick={deleteKeyframe}>
          <TrashIcon size={14} />
        </TBtn>
        <div className="mx-1 h-4 w-px bg-border" />
        <TBtn label="Onion skin" onClick={toggleOnionSkin} active={onionSkin}>
          <Stack3Icon size={14} />
        </TBtn>
        <TBtn label="Add layer" onClick={addLayer}>
          <LayersIcon size={14} />
        </TBtn>
        <TBtn label="Extend timeline +12" onClick={() => extendTimeline(12)}>
          <span className="text-xs font-semibold">+12</span>
        </TBtn>
      </div>

      {/* layers × frames grid */}
      <div className="max-h-40 overflow-auto">
        {project.layers.map((layer, li) => (
          <div key={layer.id} className="flex items-center gap-1 py-0.5">
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
            <div className="flex gap-px">
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
          </div>
        ))}
      </div>
    </div>
  );
}
