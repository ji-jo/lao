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

interface Preset {
  label: string;
  w: number;
  h: number;
}
interface PresetGroup {
  group: string;
  presets: Preset[];
}

const PRESET_GROUPS: PresetGroup[] = [
  {
    group: "Landscape 16:9",
    presets: [
      { label: "1920 × 1080 (Full HD)", w: 1920, h: 1080 },
      { label: "1280 × 720 (HD)", w: 1280, h: 720 },
      { label: "3840 × 2160 (4K)", w: 3840, h: 2160 },
    ],
  },
  {
    group: "Portrait 9:16",
    presets: [
      { label: "1080 × 1920 (Reels / TikTok / Shorts)", w: 1080, h: 1920 },
      { label: "720 × 1280", w: 720, h: 1280 },
      { label: "2160 × 3840 (4K portrait)", w: 2160, h: 3840 },
    ],
  },
  {
    group: "Square 1:1",
    presets: [
      { label: "1080 × 1080 (Instagram)", w: 1080, h: 1080 },
      { label: "2048 × 2048", w: 2048, h: 2048 },
    ],
  },
  {
    group: "Classic 4:3 / 3:4",
    presets: [
      { label: "1440 × 1080 (4:3)", w: 1440, h: 1080 },
      { label: "1024 × 768 (4:3)", w: 1024, h: 768 },
      { label: "1080 × 1440 (3:4)", w: 1080, h: 1440 },
    ],
  },
  {
    group: "Photo 3:2 / 2:3",
    presets: [
      { label: "1620 × 1080 (3:2)", w: 1620, h: 1080 },
      { label: "1080 × 1620 (2:3)", w: 1080, h: 1620 },
    ],
  },
  {
    group: "Social 4:5 / 5:4",
    presets: [
      { label: "1080 × 1350 (Instagram portrait 4:5)", w: 1080, h: 1350 },
      { label: "1350 × 1080 (5:4)", w: 1350, h: 1080 },
    ],
  },
  {
    group: "Ultrawide & cinema",
    presets: [
      { label: "2560 × 1080 (21:9)", w: 2560, h: 1080 },
      { label: "2048 × 1024 (2:1)", w: 2048, h: 1024 },
      { label: "1998 × 1080 (Flat 1.85:1)", w: 1998, h: 1080 },
      { label: "2048 × 858 (Scope 2.39:1)", w: 2048, h: 858 },
    ],
  },
  {
    group: "Pixel / retro",
    presets: [
      { label: "640 × 480 (VGA 4:3)", w: 640, h: 480 },
      { label: "512 × 512", w: 512, h: 512 },
      { label: "320 × 240", w: 320, h: 240 },
    ],
  },
];

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

        <label className="mb-3 flex flex-col gap-1 text-[11px] text-muted-foreground">
          Resolution preset
          <select
            value=""
            onChange={(e) => {
              const [w, h] = e.target.value.split("x").map(Number);
              if (w && h) setProjectSettings({ width: w, height: h });
              e.target.value = "";
            }}
            className="rounded-lg border border-border bg-background/60 px-2 py-1.5 text-sm text-foreground outline-none focus:border-primary/50"
          >
            <option value="" disabled>
              {project.width} × {project.height} — choose a preset…
            </option>
            {PRESET_GROUPS.map((g) => (
              <optgroup key={g.group} label={g.group}>
                {g.presets.map((p) => (
                  <option key={p.label} value={`${p.w}x${p.h}`}>
                    {p.label}
                  </option>
                ))}
              </optgroup>
            ))}
          </select>
        </label>

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
