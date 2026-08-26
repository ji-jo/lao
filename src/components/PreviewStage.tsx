import { useEffect, useLayoutEffect, useRef } from "react";
import { Player, type PlayerRef } from "@remotion/player";
import { LaoComposition } from "@/remotion/LaoComposition";
import { useProject } from "@/state/project";
import { usePlayback } from "@/state/playback";
import { useReference } from "@/state/reference";
import { playerRef } from "@/state/playerRef";
import { X } from "reicon-react";
import { Slider } from "@/components/ui/slider";
import { IMAGE_FIT_OPTIONS } from "@/lib/image-filters";
import { cn } from "@/lib/utils";

export function PreviewStage() {
  const project = useProject((s) => s.project);
  const frameIndex = useProject((s) => s.frameIndex);
  const loop = usePlayback((s) => s.loop);
  const reference = useReference();
  const localRef = useRef<PlayerRef>(null);
  const playingRef = useRef(false);

  const last = Math.max(project.frameCount - 1, 0);
  const previewFps =
    (project.workflow ?? "animatron") === "animatron"
      ? Math.max(project.fps, 60)
      : project.fps;
  const durationInFrames = Math.max(
    1,
    Math.round(
      (Math.max(project.frameCount, 1) / Math.max(project.fps, 1)) * previewFps,
    ),
  );

  useLayoutEffect(() => {
    const player = localRef.current;
    playerRef.current = player;
    if (!player) return;

    const onPlay = () => {
      playingRef.current = true;
      usePlayback.getState().setPlaying(true);
    };
    const onPause = () => {
      playingRef.current = false;
      usePlayback.getState().setPlaying(false);
    };
    const onFrame = (e: { detail: { frame: number } }) => {
      const timeMs = (e.detail.frame / Math.max(1, previewFps)) * 1000;
      const projectFrame = Math.min(
        last,
        Math.max(
          0,
          Math.floor((timeMs / 1000) * Math.max(1, project.fps) + 1e-6),
        ),
      );
      if (useProject.getState().frameIndex !== projectFrame) {
        useProject.getState().setFrameIndex(projectFrame);
      }
    };

    player.addEventListener("play", onPlay);
    player.addEventListener("pause", onPause);
    player.addEventListener("ended", onPause);
    player.addEventListener("frameupdate", onFrame);
    return () => {
      player.removeEventListener("play", onPlay);
      player.removeEventListener("pause", onPause);
      player.removeEventListener("ended", onPause);
      player.removeEventListener("frameupdate", onFrame);
      if (playerRef.current === player) playerRef.current = null;
    };
  }, [project.width, project.height, project.fps, project.frameCount, previewFps, last]);

  useEffect(() => {
    const player = localRef.current ?? playerRef.current;
    if (!player || playingRef.current || player.isPlaying()) return;
    const previewFrame = Math.min(
      durationInFrames - 1,
      Math.max(
        0,
        Math.round(
          (frameIndex / Math.max(1, project.fps)) * previewFps,
        ),
      ),
    );
    if (player.getCurrentFrame() !== previewFrame) player.seekTo(previewFrame);
  }, [frameIndex, previewFps, project.fps, durationInFrames]);

  return (
    <div className="relative flex h-full w-full items-center justify-center bg-[#0b0b0d]">
      <div className="w-full max-w-[min(92vw,960px)] overflow-hidden rounded-2xl border border-border shadow-2xl">
        <Player
          ref={localRef}
          key={`${previewFps}-${durationInFrames}-${project.workflow ?? "animatron"}`}
          acknowledgeRemotionLicense
          component={LaoComposition}
          inputProps={{ project }}
          durationInFrames={durationInFrames}
          compositionWidth={project.width}
          compositionHeight={project.height}
          fps={previewFps}
          initialFrame={Math.min(
            Math.round(
              (Math.min(frameIndex, last) / Math.max(1, project.fps)) * previewFps,
            ),
            durationInFrames - 1,
          )}
          loop={loop}
          controls={false}
          style={{
            width: "100%",
            aspectRatio: `${project.width} / ${project.height}`,
          }}
        />
      </div>

      {reference.url && (
        <div className="absolute right-4 top-16 w-72 rounded-2xl border border-border bg-card/90 p-2 shadow-2xl backdrop-blur-xl">
          <div className="mb-1 flex items-center justify-between px-1">
            <span className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
              Reference
            </span>
            <button
              type="button"
              onClick={reference.clear}
              className="text-muted-foreground hover:text-foreground"
            >
              <X size={12} />
            </button>
          </div>
          <div className="relative mb-2 h-36 overflow-hidden rounded-lg bg-black/40">
            {reference.kind === "video" ? (
              <video
                src={reference.url}
                controls
                loop
                muted
                className="size-full object-contain"
                style={{ opacity: reference.opacity }}
              />
            ) : (
              <img
                src={reference.url}
                alt="reference"
                className="size-full object-contain"
                style={{
                  opacity: reference.opacity,
                  transform: `scale(${reference.zoom})`,
                  transformOrigin: "center",
                }}
              />
            )}
          </div>
          <div className="flex flex-wrap gap-1 px-1 pb-2">
            {IMAGE_FIT_OPTIONS.map((o) => (
              <button
                key={o.id}
                type="button"
                onClick={() => reference.setFit(o.id)}
                className={cn(
                  "rounded-full px-2 py-0.5 text-[10px]",
                  reference.fit === o.id
                    ? "bg-white/15 text-white"
                    : "bg-white/5 text-white/60 hover:bg-white/10",
                )}
              >
                {o.label}
              </button>
            ))}
          </div>
          <div className="space-y-2 px-1 pb-1">
            <Slider
              label="Zoom"
              value={Math.round(reference.zoom * 100)}
              onChange={(v) => reference.setZoom((v as number) / 100)}
              min={50}
              max={300}
              step={5}
            />
            <Slider
              label="Opacity"
              value={Math.round(reference.opacity * 100)}
              onChange={(v) => reference.setOpacity((v as number) / 100)}
              min={5}
              max={100}
              step={1}
            />
          </div>
        </div>
      )}
    </div>
  );
}
