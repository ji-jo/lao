import { useMemo, useState } from "react";
import { MorphingModal } from "@/components/motion/morphing-modal";
import { Button } from "@/components/ui/button";
import { Tabs, TabsList, TabItem } from "@/components/ui/tabs";
import { CustomScroll } from "@/components/ui/custom-scroll";
import { useProject } from "@/state/project";
import { exportProject, downloadBlob, type ExportFormat } from "@/export/exportProject";
import { notify } from "@/state/toasts";
import { cn } from "@/lib/utils";

type AspectId = "canvas" | "16:9" | "9:16" | "1:1" | "5:4" | "4:3" | "21:9" | "custom";
type ResId = "720p" | "1080p" | "2k" | "4k" | "8k";

const ASPECTS: { id: AspectId; label: string; ratio?: number }[] = [
  { id: "canvas", label: "Canvas" },
  { id: "16:9", label: "16:9", ratio: 16 / 9 },
  { id: "9:16", label: "9:16", ratio: 9 / 16 },
  { id: "1:1", label: "1:1", ratio: 1 },
  { id: "5:4", label: "5:4", ratio: 5 / 4 },
  { id: "4:3", label: "4:3", ratio: 4 / 3 },
  { id: "21:9", label: "21:9", ratio: 21 / 9 },
  { id: "custom", label: "Custom" },
];

const RES_LONG: Record<ResId, number> = {
  "720p": 1280,
  "1080p": 1920,
  "2k": 2560,
  "4k": 3840,
  "8k": 7680,
};

function Chip({
  active,
  onClick,
  children,
}: {
  active?: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "rounded-full border border-border/80 bg-background/50 px-3 py-1.5 text-xs text-muted-foreground transition-colors hover:text-foreground",
        active && "border-primary/40 bg-primary/10 text-primary",
      )}
    >
      {children}
    </button>
  );
}

function sizeFor(aspect: AspectId, res: ResId, canvasW: number, canvasH: number) {
  if (aspect === "canvas") return { w: canvasW, h: canvasH };
  if (aspect === "custom") return { w: canvasW, h: canvasH };
  const ratio = ASPECTS.find((a) => a.id === aspect)?.ratio ?? 16 / 9;
  const long = RES_LONG[res];
  if (ratio >= 1) {
    const w = long;
    const h = Math.round(w / ratio);
    return { w, h };
  }
  const h = long;
  const w = Math.round(h * ratio);
  return { w, h };
}

export function ExportDialog({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const project = useProject((s) => s.project);
  const [format, setFormat] = useState<ExportFormat>("mp4");
  const [aspect, setAspect] = useState<AspectId>("canvas");
  const [res, setRes] = useState<ResId>("1080p");
  const [fps, setFps] = useState(30);
  const [progress, setProgress] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);

  const dims = useMemo(
    () => sizeFor(aspect, res, project.width, project.height),
    [aspect, res, project.width, project.height],
  );

  const durationSec = project.frameCount / Math.max(fps, 1);
  const approxMb =
    format === "gif"
      ? (dims.w * dims.h * project.frameCount) / (1024 * 1024 * 18)
      : (dims.w * dims.h * project.frameCount * (format === "webm" ? 0.08 : 0.12)) /
        (1024 * 1024);

  async function run() {
    if (progress !== null) return;
    setError(null);
    setProgress(0);
    const prev = { ...project };
    try {
      // temporarily override encode settings without committing to undo stack
      useProject.setState({
        project: {
          ...project,
          width: dims.w,
          height: dims.h,
          fps,
        },
      });
      const blob = await exportProject(
        useProject.getState().project,
        format,
        setProgress,
      );
      downloadBlob(blob, `${project.name || "animation"}.${format}`);
      notify.success(
        `Exported ${format.toUpperCase()}`,
        `${dims.w}×${dims.h} · ${project.frameCount} frames`,
      );
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      setError(message);
      notify.error("Export failed", message);
    } finally {
      useProject.setState({ project: prev });
      setProgress(null);
    }
  }

  return (
    <MorphingModal
      viewId={open ? "export" : null}
      onClose={() => onOpenChange(false)}
      placement="center"
      className="w-full max-w-lg overflow-hidden rounded-3xl border border-border/70 bg-card/95 p-0 shadow-2xl backdrop-blur-2xl"
    >
      <div className="flex max-h-[min(90vh,640px)] flex-col">
        <div className="shrink-0 p-6 pb-2">
          <h2 className="text-lg font-semibold text-foreground">Export</h2>
          <p className="mt-1 text-[13px] text-muted-foreground">
            Render the whole sequence to a video file.
          </p>
        </div>

        <div className="min-h-0 flex-1 px-6 pb-2">
            <CustomScroll flex="1" heightRelativeToParent="100%">
              <div className="space-y-5 pb-2">
                <div>
                  <div className="mb-2 text-sm text-foreground/90">Video Type</div>
                  <Tabs
                    value={format}
                    onValueChange={(v) => setFormat(v as ExportFormat)}
                  >
                    <TabsList className="w-full">
                      <TabItem value="mp4" label="MP4" />
                      <TabItem value="webm" label="WebM" />
                      <TabItem value="gif" label="GIF" />
                    </TabsList>
                  </Tabs>
                </div>

                <div>
                  <div className="mb-2 text-sm text-foreground/90">Aspect ratio</div>
                  <div className="flex flex-wrap gap-2">
                    {ASPECTS.map((a) => (
                      <Chip
                        key={a.id}
                        active={aspect === a.id}
                        onClick={() => setAspect(a.id)}
                      >
                        {a.label}
                      </Chip>
                    ))}
                  </div>
                </div>

                <div>
                  <div className="mb-2 text-sm text-foreground/90">Resolution</div>
                  <div className="flex flex-wrap gap-2">
                    {(["720p", "1080p", "2k", "4k", "8k"] as ResId[]).map((r) => (
                      <Chip key={r} active={res === r} onClick={() => setRes(r)}>
                        {r === "2k" ? "2K" : r === "4k" ? "4K" : r === "8k" ? "8K" : r}
                      </Chip>
                    ))}
                  </div>
                </div>

                <div>
                  <div className="mb-2 text-sm text-foreground/90">Frame rate</div>
                  <div className="flex flex-wrap gap-2">
                    {[24, 30, 60, 120, 240].map((f) => (
                      <Chip key={f} active={fps === f} onClick={() => setFps(f)}>
                        {f}
                      </Chip>
                    ))}
                  </div>
                </div>

                <div className="rounded-2xl border border-border bg-background/40 px-4 py-3 text-sm">
                  <div className="text-foreground">
                    Output: {durationSec.toFixed(1)}s · {project.frameCount} frames @ {fps}
                    fps · {dims.w}×{dims.h} · ~{Math.max(1, Math.round(approxMb))} MB max
                  </div>
                  <div className="mt-1 text-xs text-muted-foreground">
                    Requires Chrome, Edge or Safari 16.4+ (WebCodecs) for MP4/WebM.
                  </div>
                </div>

                {progress !== null && (
                  <div className="h-1.5 overflow-hidden rounded-full bg-border">
                    <div
                      className="h-full rounded-full bg-primary transition-[width]"
                      style={{ width: `${Math.round(progress * 100)}%` }}
                    />
                  </div>
                )}
                {error && <div className="text-xs text-red-400">{error}</div>}
              </div>
            </CustomScroll>
        </div>

        <div className="flex shrink-0 items-center justify-end gap-2 border-t border-border/70 px-6 py-4">
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={() => onOpenChange(false)}
          >
            Close
          </Button>
          <Button
            type="button"
            variant="primary"
            loading={progress !== null}
            disabled={progress !== null}
            onClick={() => void run()}
          >
            {progress !== null
              ? `Rendering ${Math.round(progress * 100)}%`
              : "Export video"}
          </Button>
        </div>
      </div>
    </MorphingModal>
  );
}
