import { useRef, useState } from "react";
import { cn } from "@/lib/utils";
import { useProject } from "@/state/project";
import {
  DropdownMenu,
  DropdownTrigger,
  DropdownContent,
} from "@/components/ui/dropdown";
import { MenuItem } from "@/components/ui/menu-item";
import EyeIcon from "@/components/ui/eye-icon";
import EyeOffIcon from "@/components/ui/eye-off-icon";
import DotsHorizontalIcon from "@/components/ui/dots-horizontal-icon";
import LayerGripIcon from "@/components/ui/layer-grip-icon";
import { CustomScroll } from "@/components/ui/custom-scroll";

const PX_PER_MS = 0.08;
const MIN_TRACK_MS = 4000;

/**
 * Animatron clip timeline — one track per layer, motion-design style bars.
 */
export function ClipTimeline() {
  const project = useProject((s) => s.project);
  const frameIndex = useProject((s) => s.frameIndex);
  const layerIndex = useProject((s) => s.layerIndex);
  const {
    setFrameIndex,
    setLayerIndex,
    toggleLayerVisible,
    deleteLayer,
    reorderLayer,
    updateStrokeClip,
  } = useProject.getState();

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
  const dragLayerRef = useRef<number | null>(null);
  const [, force] = useState(0);

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
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    dragRef.current = {
      strokeId,
      mode,
      originX: e.clientX,
      startMs,
      durationMs,
    };
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
    <div className="h-48 max-h-48 min-h-0 w-full min-w-0">
      <CustomScroll heightRelativeToParent="100%" allowOuterScroll>
      {project.layers.map((layer, li) => {
        const cel = layer.frames.find((f) => f) ?? null;
        const stroke = cel?.strokes[0];
        const clip = stroke?.clip;
        return (
          <div
            key={layer.id}
            className="flex items-center gap-1 py-0.5"
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
            <div
              className="relative h-6 flex-1 overflow-x-auto rounded-md bg-background/40"
              style={{ minWidth: 200 }}
              onPointerDown={onTrackPointerDown}
            >
              <div className="relative h-full" style={{ width: trackW }}>
                <div
                  className="pointer-events-none absolute top-0 z-10 h-full w-0.5 bg-foreground/70"
                  style={{ left: playheadMs * PX_PER_MS }}
                />
                {clip && stroke && (
                  <div
                    data-clip
                    className={cn(
                      "absolute top-0.5 flex h-5 items-stretch rounded-md border border-primary/40 bg-primary/25",
                      li === layerIndex && "ring-1 ring-primary/60",
                    )}
                    style={{
                      left: clip.startMs * PX_PER_MS,
                      width: Math.max(12, clip.durationMs * PX_PER_MS),
                    }}
                    onPointerDown={(e) =>
                      beginClipDrag(e, stroke.id, "move", clip.startMs, clip.durationMs)
                    }
                    onPointerMove={onClipPointerMove}
                    onPointerUp={onClipPointerUp}
                  >
                    <button
                      type="button"
                      className="w-1.5 shrink-0 cursor-ew-resize rounded-l-md bg-primary/40"
                      onPointerDown={(e) =>
                        beginClipDrag(e, stroke.id, "start", clip.startMs, clip.durationMs)
                      }
                      onPointerMove={onClipPointerMove}
                      onPointerUp={onClipPointerUp}
                      aria-label="Resize clip start"
                    />
                    <div className="min-w-0 flex-1 truncate px-1 text-[9px] leading-5 text-foreground/80">
                      {layer.name}
                    </div>
                    <button
                      type="button"
                      className="w-1.5 shrink-0 cursor-ew-resize rounded-r-md bg-primary/40"
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
          </div>
        );
      })}
      </CustomScroll>
    </div>
  );
}
