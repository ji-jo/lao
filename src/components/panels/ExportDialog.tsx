import { useMemo, useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { Tabs, TabsList, TabItem } from "@/components/ui/tabs";
import { CustomScroll } from "@/components/ui/custom-scroll";
import { useProject } from "@/state/project";
import { exportProject, downloadBlob, type ExportFormat } from "@/export/exportProject";
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
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      useProject.setState({ project: prev });
      setProgress(null);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[min(90vh,640px)] max-w-lg gap-0 overflow-hidden p-0 sm:max-w-lg">
        <div className="flex max-h-[min(90vh,640px)] flex-col">
          <div className="shrink-0 p-6 pb-2">
            <DialogHeader>
              <DialogTitle>Export</DialogTitle>
              <DialogDescription>
                Render the scene to an image or the whole sequence to a video.
              </DialogDescription>
            </DialogHeader>
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

          <div className="flex shrink-0 items-center justify-end gap-2 border-t border-border px-6 py-4">
            <button
              type="button"
              onClick={() => onOpenChange(false)}
              className="rounded-2xl px-4 py-2.5 text-sm text-muted-foreground hover:text-foreground"
            >
              Close
            </button>
            <button
              type="button"
              disabled={progress !== null}
              onClick={() => void run()}
              className="px-10 py-3.5 bg-gradient-to-br from-[#f5f5f7] to-[#e8e8ed] text-gray-700 font-semibold rounded-3xl shadow-[0_20px_40px_-10px_rgba(0,0,0,0.1),0_-8px_16px_-8px_rgba(255,255,255,0.5)] active:shadow-[inset_0_8px_16px_-8px_rgba(0,0,0,0.2),inset_0_-8px_16px_-8px_rgba(255,255,255,0.4)] transition-all duration-300 disabled:opacity-50"
            >
              Export Video
            </button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
