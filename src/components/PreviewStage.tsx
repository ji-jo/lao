import { Player } from "@remotion/player";
import { LaoComposition } from "@/remotion/LaoComposition";
import { useProject } from "@/state/project";
import { useReference } from "@/state/reference";
import { X } from "reicon-react";
import { Slider } from "@/components/ui/slider";
import { IMAGE_FIT_OPTIONS } from "@/lib/image-filters";
import { cn } from "@/lib/utils";

export function PreviewStage() {
  const project = useProject((s) => s.project);
  const frameIndex = useProject((s) => s.frameIndex);
  const reference = useReference();

  return (
    <div className="relative flex h-full w-full items-center justify-center bg-[#0b0b0d]">
      <div className="w-full max-w-[min(92vw,960px)] overflow-hidden rounded-2xl border border-border shadow-2xl">
        <Player
          component={LaoComposition}
          inputProps={{ project }}
          durationInFrames={Math.max(project.frameCount, 1)}
          compositionWidth={project.width}
          compositionHeight={project.height}
          fps={project.fps}
          initialFrame={Math.min(frameIndex, Math.max(project.frameCount - 1, 0))}
          loop
          style={{ width: "100%" }}
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
