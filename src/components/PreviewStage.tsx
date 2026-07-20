import { useCallback, useEffect, useRef, useState } from "react";
import { Player, type PlayerRef } from "@remotion/player";
import { useProject } from "@/state/project";
import { usePlayback } from "@/state/playback";
import { useReference } from "@/state/reference";
import { playerRef } from "@/state/playerRef";
import { LaoComposition } from "@/remotion/LaoComposition";
import { Slider } from "@/components/ui/slider";
import XIcon from "@/components/ui/x-icon";

/** Full-quality playback via Remotion Player, plus the reference attachment overlay. */
export function PreviewStage() {
  const project = useProject((s) => s.project);
  const frameIndex = useProject((s) => s.frameIndex);
  const reference = useReference();
  const seekGuard = useRef(false);
  const [playerReady, setPlayerReady] = useState(false);

  const attachPlayer = useCallback((instance: PlayerRef | null) => {
    playerRef.current = instance;
    setPlayerReady(!!instance);
  }, []);

  // attach listeners whenever the Player instance is ready
  useEffect(() => {
    const player = playerRef.current;
    if (!player) return;
    const onFrame = (e: { detail: { frame: number } }) => {
      seekGuard.current = true;
      useProject.getState().setFrameIndex(e.detail.frame);
      seekGuard.current = false;
    };
    const onPlay = () => usePlayback.getState().setPlaying(true);
    const onPause = () => usePlayback.getState().setPlaying(false);
    player.addEventListener("frameupdate", onFrame);
    player.addEventListener("play", onPlay);
    player.addEventListener("pause", onPause);
    if (player.getCurrentFrame() !== frameIndex) {
      player.seekTo(frameIndex);
    }
    return () => {
      player.removeEventListener("frameupdate", onFrame);
      player.removeEventListener("play", onPlay);
      player.removeEventListener("pause", onPause);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- re-bind when Player mounts
  }, [playerReady]);

  // timeline scrubbing → seek the player
  useEffect(() => {
    const player = playerRef.current;
    if (player && !seekGuard.current && player.getCurrentFrame() !== frameIndex) {
      player.seekTo(frameIndex);
    }
  }, [frameIndex]);

  return (
    <div className="absolute inset-0 bg-[#0b0b0d] p-6 pb-32">
      {/* Remotion fit-container: absolute inset + aspect-ratio; width-only on Player */}
      <div
        className="absolute inset-6 bottom-32 m-auto max-h-full max-w-full overflow-hidden rounded-lg border border-border shadow-2xl"
        style={{ aspectRatio: `${project.width} / ${project.height}` }}
      >
        <Player
          ref={attachPlayer}
          component={LaoComposition}
          inputProps={{ project }}
          durationInFrames={Math.max(project.frameCount, 1)}
          compositionWidth={project.width}
          compositionHeight={project.height}
          fps={project.fps}
          initialFrame={frameIndex}
          loop
          style={{ width: "100%" }}
        />
      </div>

      {/* reference attachment overlay */}
      {reference.url && (
        <div className="absolute right-4 top-16 w-64 rounded-2xl border border-border bg-card/90 p-2 shadow-2xl backdrop-blur-xl">
          <div className="mb-1 flex items-center justify-between px-1">
            <span className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
              Reference
            </span>
            <button
              type="button"
              onClick={reference.clear}
              className="text-muted-foreground hover:text-foreground"
            >
              <XIcon size={12} />
            </button>
          </div>
          {reference.kind === "video" ? (
            <video
              src={reference.url}
              controls
              loop
              muted
              className="w-full rounded-lg"
              style={{ opacity: reference.opacity }}
            />
          ) : (
            <img
              src={reference.url}
              alt="reference"
              className="w-full rounded-lg"
              style={{ opacity: reference.opacity }}
            />
          )}
          <div className="px-1 pt-2">
            <Slider
              label="Opacity"
              value={Math.round(reference.opacity * 100)}
              onChange={(v) => reference.setOpacity((v as number) / 100)}
              min={10}
              max={100}
              step={5}
            />
          </div>
        </div>
      )}
    </div>
  );
}
