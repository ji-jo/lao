import { useEffect, useMemo, useState } from "react";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { SliderComfortable } from "@/components/ui/slider";
import { useProject } from "@/state/project";
import { paintProjectFrame } from "@/engine/paintFrame";
import { paintBackground } from "@/engine/background";
import { exportProject, downloadBlob, type ExportFormat } from "@/export/exportProject";
import { PAPER } from "@/components/chrome/paper-tokens";
import { cn } from "@/lib/utils";

/**
 * Export modal — Paper `1CQ-0`.
 *
 * Only three properties survive here, per D: **Video Type**, **Quality**, **fps**.
 * Aspect ratio, Resolution, the transparent-background switch and the APNG
 * format were removed — Paper's design has none of them, and output size now
 * derives from the canvas aspect × Quality instead.
 *
 * The fps scrubber is the same `SliderComfortable variant="scrubber"` the
 * background panel's `BgLabeledScrubber` uses (elastic drag, `#40608E` fill,
 * 24px `#252525` track), and it seeds from the canvas fps.
 */

type Quality = "low" | "mid" | "high";

/** long edge per quality — the short edge follows the canvas aspect */
const QUALITY_LONG_EDGE: Record<Quality, number> = {
  low: 720,
  mid: 1080,
  high: 2160,
};

/** rough bytes-per-pixel-per-frame, used only for the "MB max" estimate */
const BPP: Record<ExportFormat, number> = {
  mp4: 0.12,
  webm: 0.08,
  gif: 1 / 18,
  apng: 0.2,
};

const VIDEO_TYPES: { id: ExportFormat; label: string }[] = [
  { id: "mp4", label: "MP4" },
  { id: "webm", label: "WebM" },
  { id: "gif", label: "GIF" },
];

const QUALITIES: { id: Quality; label: string }[] = [
  { id: "low", label: "Low" },
  { id: "mid", label: "Mid" },
  { id: "high", label: "High" },
];

/** Paper: 12px/16px Geist Light at 60% — the section captions. */
function FieldLabel({ children }: { children: string }) {
  return (
    <span
      className="w-fit text-xs font-light leading-4 text-white opacity-60"
      style={{ fontFamily: PAPER.fontSans }}
    >
      {children}
    </span>
  );
}

/** Segmented control — Paper: #121212 track, 1px #292A2A outline, #313131 selected. */
function Segmented<T extends string>({
  value,
  options,
  onChange,
  label,
}: {
  value: T;
  options: { id: T; label: string }[];
  onChange: (v: T) => void;
  label: string;
}) {
  return (
    <div
      role="radiogroup"
      aria-label={label}
      className="flex items-center gap-1 self-stretch overflow-clip rounded-lg p-0.5"
      style={{ backgroundColor: PAPER.segmentBg, outline: `1px solid ${PAPER.borderHairline}` }}
    >
      {options.map((o) => {
        const active = o.id === value;
        return (
          <button
            key={o.id}
            type="button"
            role="radio"
            aria-checked={active}
            onClick={() => onChange(o.id)}
            className="flex flex-1 cursor-pointer flex-col items-center justify-center overflow-clip rounded-[7px] px-2 py-1 transition-colors"
            style={{ backgroundColor: active ? PAPER.segmentActive : PAPER.segmentBg }}
          >
            <span
              className="w-fit content-center text-xs leading-4 text-white opacity-80"
              style={{ fontFamily: PAPER.fontMono }}
            >
              {o.label}
            </span>
          </button>
        );
      })}
    </div>
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
  const frameIndex = useProject((s) => s.frameIndex);
  const [format, setFormat] = useState<ExportFormat>("mp4");
  const [quality, setQuality] = useState<Quality>("mid");
  const [fps, setFps] = useState(project.fps);
  const [progress, setProgress] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  /**
   * Callback ref, not `useRef`: `DialogContent` defers mounting its panel via
   * internal state, so a plain ref is still null the one time an
   * `[open, …]` effect would run, and the preview never paints. Holding the
   * node in state re-runs the paint effect the moment the canvas attaches.
   */
  const [previewEl, setPreviewEl] = useState<HTMLCanvasElement | null>(null);

  // the scrubber seeds from the canvas fps — re-sync whenever the modal opens
  // so it never shows a stale rate after the project's fps changed underneath
  useEffect(() => {
    if (open) setFps(project.fps);
  }, [open, project.fps]);

  const dims = useMemo(() => {
    const long = QUALITY_LONG_EDGE[quality];
    const ratio = project.width / Math.max(project.height, 1);
    // H.264 needs even dimensions; keep both edges even after aspect rounding
    const even = (n: number) => Math.max(2, Math.round(n / 2) * 2);
    return ratio >= 1
      ? { w: even(long), h: even(long / ratio) }
      : { w: even(long * ratio), h: even(long) };
  }, [quality, project.width, project.height]);

  const durationSec = project.frameCount / Math.max(fps, 1);
  const approxMb = Math.max(
    1,
    Math.round((dims.w * dims.h * project.frameCount * BPP[format]) / (1024 * 1024)),
  );

  /** live preview of the current frame, painted with the export pipeline */
  useEffect(() => {
    if (!open || !previewEl) return;
    const ctx = previewEl.getContext("2d");
    if (!ctx) return;
    previewEl.width = project.width;
    previewEl.height = project.height;
    ctx.clearRect(0, 0, previewEl.width, previewEl.height);
    paintBackground(ctx, project);
    paintProjectFrame(ctx, project, frameIndex, { clear: false });
  }, [open, previewEl, project, frameIndex]);

  async function run() {
    if (progress !== null) return;
    setError(null);
    setProgress(0);
    const prev = project;
    try {
      // fps override only — NEVER width/height: strokes are stored in canvas
      // coordinates, so resizing the project crops the drawing (the 4:3 cat
      // bug). Output size goes through ExportOptions and is scaled uniformly.
      useProject.setState({ project: { ...project, fps } });
      const blob = await exportProject(
        useProject.getState().project,
        format,
        setProgress,
        { width: dims.w, height: dims.h },
      );
      downloadBlob(blob, `${project.name || "animation"}.${format}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      useProject.setState({ project: prev });
      setProgress(null);
    }
  }

  const busy = progress !== null;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        hideClose
        className="w-[400px] max-w-[400px] gap-6 overflow-clip border-0 p-4 antialiased sm:max-w-[400px]"
        // radius inline: the design-system shape context sets 18px on the panel
        // and would win over a `rounded-2xl` class — Paper 1CQ-0 specifies 16px
        style={{ backgroundColor: PAPER.surface, borderRadius: 16 }}
      >
        {/* header — Redaction 35 title + close chip */}
        <div className="flex items-start justify-between self-stretch">
          <div className="flex flex-col items-start gap-1">
            <span
              className="w-fit text-[18px] leading-[22px] tracking-[0.02em]"
              style={{ color: PAPER.text, fontFamily: PAPER.fontSerif }}
            >
              Export
            </span>
            <span
              className="w-fit text-[10px] font-light leading-3 tracking-[0.02em] opacity-75"
              style={{ color: PAPER.text, fontFamily: PAPER.fontSans }}
            >
              Render the scene to an image or the whole sequence to a video.
            </span>
          </div>
          <button
            type="button"
            onClick={() => onOpenChange(false)}
            aria-label="Close"
            className="flex size-6 shrink-0 cursor-pointer items-center justify-center rounded-full"
            style={{
              backgroundImage: PAPER.modeActiveGradient,
              backgroundOrigin: "border-box",
              border: "0.5px solid #C9C9C933",
            }}
          >
            <svg
              xmlns="http://www.w3.org/2000/svg"
              width="16"
              height="16"
              viewBox="0.375 0.375 6 6"
              style={{ opacity: 0.8, flexShrink: 0 }}
            >
              <path
                d="M4.993 5.258C5.066 5.331 5.184 5.331 5.258 5.258 5.331 5.184 5.331 5.066 5.258 4.993L3.64 3.375 5.258 1.757C5.331 1.684 5.331 1.566 5.258 1.492 5.184 1.419 5.066 1.419 4.993 1.492L3.375 3.11 1.757 1.492C1.684 1.419 1.566 1.419 1.492 1.492 1.42 1.566 1.42 1.684 1.492 1.757L3.11 3.375 1.492 4.993C1.42 5.066 1.42 5.184 1.492 5.258 1.566 5.331 1.684 5.331 1.757 5.258L3.375 3.64 4.993 5.258Z"
                fill="#FFFFFF"
              />
            </svg>
          </button>
        </div>

        {/* Video Type + Quality */}
        <div className="flex items-start gap-4 self-stretch">
          <div className="flex flex-1 flex-col items-start gap-3">
            <FieldLabel>Video Type</FieldLabel>
            <Segmented
              label="Video Type"
              value={format}
              options={VIDEO_TYPES}
              onChange={setFormat}
            />
          </div>
          <div className="flex flex-1 flex-col items-start gap-3">
            <FieldLabel>Quality</FieldLabel>
            <Segmented
              label="Quality"
              value={quality}
              options={QUALITIES}
              onChange={setQuality}
            />
          </div>
        </div>

        {/* Video Preview — the current frame through the export pipeline */}
        <div className="flex flex-col items-start gap-3 self-stretch">
          <FieldLabel>Video Preview</FieldLabel>
          <div
            className="h-[278px] shrink-0 self-stretch overflow-clip rounded-lg"
            style={{ backgroundColor: PAPER.pillHover }}
          >
            <canvas ref={setPreviewEl} className="h-full w-full object-contain" />
          </div>
        </div>

        {/* Export fps — same scrubber as the background panel, seeded from the canvas */}
        <div className="flex items-center gap-4 self-stretch">
          <span
            className="shrink-0 text-xs leading-4 text-white opacity-60"
            style={{ fontFamily: PAPER.fontMono }}
          >
            Export fps
          </span>
          <div className="min-w-0 flex-1">
            <SliderComfortable
              variant="scrubber"
              aria-label="Export fps"
              value={fps}
              onChange={setFps}
              min={1}
              max={60}
              step={1}
              fillColor={PAPER.frameActive}
              className="!h-6 !w-full !rounded-lg !border-0 !bg-[#252525] [&_span]:!font-mono [&_span]:!text-sm"
            />
          </div>
        </div>

        {/* output readout */}
        <div
          className="flex items-center justify-center gap-2.5 self-stretch overflow-clip rounded-lg p-2"
          style={{
            backgroundImage:
              "linear-gradient(in oklab 180deg, oklab(100% 0 0 / 0%) -14.5%, oklab(50.1% 0 0) 152.5%)",
          }}
        >
          <span
            className="content-center text-center text-xs font-light leading-4 text-white opacity-70"
            style={{ fontFamily: PAPER.fontMono }}
          >
            {busy
              ? `Rendering… ${Math.round((progress ?? 0) * 100)}%`
              : `Output: ${durationSec.toFixed(1)}s | ${project.frameCount} frames @ ${fps}fps | ${approxMb} MB max`}
          </span>
        </div>

        {error && (
          <div className="self-stretch text-center text-xs text-red-400">{error}</div>
        )}

        {/* Close / Save */}
        <div className="flex items-start gap-1 self-end">
          <button
            type="button"
            onClick={() => onOpenChange(false)}
            className="flex h-9 w-[120px] shrink-0 cursor-pointer items-center justify-center rounded-full py-1.5"
            style={{ backgroundColor: PAPER.pillHover }}
          >
            <span
              className="text-sm leading-[18px] tracking-[0.02em]"
              style={{ color: PAPER.text, fontFamily: PAPER.fontSans }}
            >
              Close
            </span>
          </button>
          <button
            type="button"
            disabled={busy}
            onClick={() => void run()}
            className={cn(
              "flex h-9 w-[120px] shrink-0 items-center justify-center rounded-full py-1.5",
              busy ? "cursor-not-allowed opacity-60" : "cursor-pointer",
            )}
            style={{
              backgroundImage:
                "linear-gradient(in oklab 180deg, oklab(0% 0 0) 0%, oklab(48.5% -0.018 -0.082) 100%)",
              backgroundOrigin: "border-box",
              border: `1px solid ${PAPER.frameActiveBorder}`,
            }}
          >
            <span
              className="content-center text-sm leading-[18px] tracking-[0.02em]"
              style={{ color: PAPER.text, fontFamily: PAPER.fontSans }}
            >
              {busy ? "Saving…" : "Save"}
            </span>
          </button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
