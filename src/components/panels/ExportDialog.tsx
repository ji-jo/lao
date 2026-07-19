import { useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { useProject } from "@/state/project";
import { exportProject, downloadBlob, type ExportFormat } from "@/export/exportProject";

function NumField({
  label,
  value,
  onCommit,
  min,
  max,
}: {
  label: string;
  value: number;
  onCommit: (v: number) => void;
  min: number;
  max: number;
}) {
  return (
    <label className="flex flex-col gap-1 text-[11px] text-muted-foreground">
      {label}
      <input
        type="number"
        defaultValue={value}
        key={value}
        min={min}
        max={max}
        onBlur={(e) => {
          const v = Math.round(Number(e.target.value));
          if (Number.isFinite(v)) onCommit(Math.max(min, Math.min(max, v)));
        }}
        className="w-24 rounded-lg border border-border bg-background/60 px-2 py-1.5 text-sm text-foreground outline-none focus:border-primary/50"
      />
    </label>
  );
}

export function ExportDialog({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const project = useProject((s) => s.project);
  const setProjectSettings = useProject((s) => s.setProjectSettings);
  const [progress, setProgress] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function run(format: ExportFormat) {
    if (progress !== null) return;
    setError(null);
    setProgress(0);
    try {
      const blob = await exportProject(project, format, setProgress);
      downloadBlob(blob, `${project.name || "animation"}.${format}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setProgress(null);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Export</DialogTitle>
          <DialogDescription>
            Frame size, rate and length apply to the project; boil is baked into every export.
          </DialogDescription>
        </DialogHeader>

        <div className="flex flex-wrap gap-3">
          <NumField
            label="Width"
            value={project.width}
            min={16}
            max={8192}
            onCommit={(width) => setProjectSettings({ width })}
          />
          <NumField
            label="Height"
            value={project.height}
            min={16}
            max={8192}
            onCommit={(height) => setProjectSettings({ height })}
          />
          <NumField
            label="FPS"
            value={project.fps}
            min={1}
            max={60}
            onCommit={(fps) => setProjectSettings({ fps })}
          />
          <NumField
            label="Frames"
            value={project.frameCount}
            min={1}
            max={2000}
            onCommit={(frameCount) => setProjectSettings({ frameCount })}
          />
        </div>

        <div className="mt-4 flex items-center gap-2">
          <Button onClick={() => run("mp4")} disabled={progress !== null}>
            MP4
          </Button>
          <Button onClick={() => run("webm")} disabled={progress !== null}>
            WebM
          </Button>
          <Button onClick={() => run("gif")} disabled={progress !== null}>
            GIF
          </Button>
          {progress !== null && (
            <div className="ml-2 flex-1">
              <div className="h-1.5 overflow-hidden rounded-full bg-border">
                <div
                  className="h-full rounded-full bg-primary transition-[width]"
                  style={{ width: `${Math.round(progress * 100)}%` }}
                />
              </div>
            </div>
          )}
        </div>
        {error && <div className="mt-2 text-xs text-destructive">{error}</div>}
      </DialogContent>
    </Dialog>
  );
}
