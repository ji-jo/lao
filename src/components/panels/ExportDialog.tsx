import { useEffect, useMemo, useState } from "react";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { Tabs, TabsList, TabItem } from "@/components/ui/tabs";
import { SliderComfortable } from "@/components/ui/slider";
import { Switch } from "@/components/ui/switch";
import { GradientHoverButton } from "@/components/ui/gradient-hover-button";
import { useProject } from "@/state/project";
import { paintProjectFrame } from "@/engine/paintFrame";
import { paintBackground } from "@/engine/background";
import { clipFadeOpacity, strokeAtTime } from "@/engine/strokeProgress";
import { exportProject, downloadBlob, type ExportFormat } from "@/export/exportProject";
import { analyzeProjectExport } from "@/export/code/capabilities";
import { emitProjectSvg, type SvgPlayMode } from "@/export/code/emitSvg";
import { emitProjectReact, emitProjectReactFiles } from "@/export/code/emitReact";
import { emitProjectSceneJson, buildLaoScene } from "@/export/code/sceneJson";
import { renderSceneToSvg } from "@/export/code/sceneRender";
import type { Project } from "@/model/types";
import { PAPER } from "@/components/chrome/paper-tokens";
import { cn } from "@/lib/utils";
import { toastCopied, toastError, toastExported } from "@/lib/laoToast";

/**
 * Export modal — Paper `1CQ-0`, plus code/alpha formats (SVG, React, JSON, WebM alpha).
 */

type Quality = "low" | "mid" | "high";
type DialogExportFormat = ExportFormat | "svg" | "tsx" | "json";

const ALPHA_FORMATS = new Set<DialogExportFormat>([
  "webm",
  "gif",
  "apng",
  "png",
  "svg",
  "tsx",
  "json",
]);

/** long edge per quality — the short edge follows the canvas aspect */
const QUALITY_LONG_EDGE: Record<Quality, number> = {
  low: 720,
  mid: 1080,
  high: 2160,
};

/** rough bytes-per-pixel-per-frame, used only for the "MB max" estimate */
const BPP: Record<DialogExportFormat, number> = {
  mp4: 0.12,
  webm: 0.08,
  gif: 1 / 18,
  apng: 0.2,
  png: 0.4,
  svg: 0,
  tsx: 0,
  json: 0,
};

const EXPORT_TYPES: { id: DialogExportFormat; label: string }[] = [
  { id: "mp4", label: "MP4" },
  { id: "webm", label: "WebM" },
  { id: "gif", label: "GIF" },
  { id: "png", label: "PNG" },
  { id: "svg", label: "SVG" },
  { id: "tsx", label: "React" },
  { id: "json", label: "JSON" },
];

const QUALITIES: { id: Quality; label: string }[] = [
  { id: "low", label: "Low" },
  { id: "mid", label: "Mid" },
  { id: "high", label: "High" },
];

function formatBytes(n: number): string {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  return `${(n / (1024 * 1024)).toFixed(1)} MB`;
}

function formatLabel(format: DialogExportFormat, animated: boolean): string {
  if (format === "tsx") return animated ? "React player + JSON" : "React + JSON (static)";
  if (format === "json") return animated ? "lao-scene JSON" : "lao-scene JSON (static)";
  return animated ? "animated SVG" : "static SVG";
}

/**
 * Animatron at frame 0 is often blank (draw-on + fade-in). Prefer the current
 * playhead when it already has ink; otherwise sample the end hold so the
 * export dialog preview isn't an empty grey box.
 */
function previewFrameForExport(project: Project, frameIndex: number): number {
  const last = Math.max(0, project.frameCount - 1);
  if ((project.workflow ?? "animatron") !== "animatron") {
    return Math.min(Math.max(0, frameIndex), last);
  }
  const fps = Math.max(project.fps, 1);
  const timeMs = (frameIndex / fps) * 1000;
  for (const layer of project.layers) {
    if (!layer.visible) continue;
    const cel = layer.frames.find((f) => f);
    if (!cel) continue;
    for (const s of cel.strokes) {
      const pts = strokeAtTime(s, timeMs);
      if (pts && pts.length > 2 && clipFadeOpacity(s, timeMs, fps) > 0.2) {
        return Math.min(Math.max(0, frameIndex), last);
      }
    }
    if (cel.texts?.length || cel.images?.length) {
      return Math.min(Math.max(0, frameIndex), last);
    }
  }
  return last;
}

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

/**
 * Video Type / Quality — the fluid `Tabs` component (D: "I want to use the
 * tabs from fluid everywhere but adjust the sizing/width based on the
 * designs in my product"), resized to Paper `1CQ-0`'s segmented control:
 * `#121212` track, `1px #292A2A` outline, `#313131` selected chip.
 *
 * The selected-chip color is normally the design system's own elevated-
 * surface level (`surfaceClasses`), which isn't exposed as a prop and, this
 * deep inside a Dialog, resolves lighter than Paper's flat `#313131`. Rather
 * than fork `tabs.tsx` or add a prop to the shared component, this overrides
 * it the same way `SettingsDocks.tsx`'s `OnOffTabs` already does — an
 * arbitrary descendant selector targeting the indicator by its own built-in
 * classes. Zero changes to the shared component; every other consumer is
 * unaffected.
 */
function PaperTabs<T extends string>({
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
    <Tabs value={value} onValueChange={(v) => onChange(v as T)} className="w-full">
      <TabsList
        aria-label={label}
        className={cn(
          "!w-full !gap-1 !rounded-lg !bg-[#121212] !p-0.5",
          "!outline !outline-1 !outline-[#292A2A]",
          // selected chip = Paper #313131 (overrides the fluid surface indicator)
          "[&>div.absolute.pointer-events-none:first-of-type]:!bg-[#313131]",
          // hover wash, dimmer than the selected chip — `bg-hover` (the fluid
          // component's default) isn't defined anywhere in this theme
          // (grep index.css: zero matches), so the hover indicator rendered
          // with no color at all. #252525 reuses the same grey this app
          // already treats as "hovered chip" everywhere else.
          "[&>div.bg-hover]:!bg-[#252525]",
        )}
      >
        {options.map((o) => (
          <TabItem
            key={o.id}
            value={o.id}
            label={o.label}
            className="!h-auto !flex-1 !justify-center !gap-0 !rounded-[7px] !px-2 !py-1 [&_span]:![font-family:'Geist_Mono',ui-monospace,monospace] [&_span]:!text-xs [&_span]:!leading-4"
          />
        ))}
      </TabsList>
    </Tabs>
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
  const [format, setFormat] = useState<DialogExportFormat>("mp4");
  const [quality, setQuality] = useState<Quality>("mid");
  const [fps, setFps] = useState(project.fps);
  const [transparent, setTransparent] = useState(false);
  const [codeAnimated, setCodeAnimated] = useState(true);
  const [playMode, setPlayMode] = useState<SvgPlayMode>("auto");
  const [progress, setProgress] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const isCodeExport = format === "svg" || format === "tsx" || format === "json";
  const isStillExport = format === "png";
  const isSequenceExport = !isCodeExport && !isStillExport;
  const showAlphaToggle = format !== "apng";
  const exportCaps = useMemo(() => analyzeProjectExport(project), [project]);
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
  const codeOpts = useMemo(
    () => ({
      transparent,
      animated: codeAnimated,
      frame: codeAnimated ? undefined : frameIndex,
      playMode,
    }),
    [transparent, codeAnimated, frameIndex, playMode],
  );
  const codeBytes = useMemo(() => {
    if (!isCodeExport) return 0;
    const scene = buildLaoScene(project, codeOpts);
    if (format === "json") return new TextEncoder().encode(JSON.stringify(scene)).length;
    if (format === "svg") return new TextEncoder().encode(renderSceneToSvg(scene)).length;
    const files = emitProjectReactFiles(project, codeOpts);
    return new TextEncoder().encode(files.tsx).length + new TextEncoder().encode(files.json).length;
  }, [isCodeExport, format, project, codeOpts]);
  const previewFrame = useMemo(
    () => previewFrameForExport(project, frameIndex),
    [project, frameIndex],
  );
  const approxMb = isCodeExport
    ? 0
    : isStillExport
      ? Math.max(
          1,
          Math.round((dims.w * dims.h * BPP.png) / (1024 * 1024)),
        )
      : Math.max(
          1,
          Math.round((dims.w * dims.h * project.frameCount * BPP[format]) / (1024 * 1024)),
        );

  function handleFormat(next: DialogExportFormat) {
    if (next === "mp4") {
      setFormat("mp4");
      setTransparent(false);
      return;
    }
    const leavingMp4 = format === "mp4";
    setFormat(next);
    if (leavingMp4 && ALPHA_FORMATS.has(next)) setTransparent(true);
  }

  function handleTransparent() {
    if (format === "mp4" && !transparent) {
      setFormat("webm");
      setTransparent(true);
      return;
    }
    setTransparent((v) => !v);
  }

  function emitCode(): string {
    if (format === "tsx") return emitProjectReact(project, codeOpts);
    if (format === "json") return emitProjectSceneJson(project, codeOpts);
    return emitProjectSvg(project, codeOpts);
  }

  async function copyCode() {
    try {
      if (format === "png") {
        const blob = await exportProject(project, "png", undefined, {
          width: dims.w,
          height: dims.h,
          transparent,
          frame: previewFrame,
        });
        await navigator.clipboard.write([new ClipboardItem({ "image/png": blob })]);
        toastCopied("PNG copied");
        return;
      }
      const code = emitCode();
      await navigator.clipboard.writeText(code);
      toastCopied(
        format === "tsx"
          ? "React player copied"
          : format === "json"
            ? "Scene JSON copied"
            : "SVG code copied",
      );
    } catch (err) {
      toastError("Couldn’t copy", err);
    }
  }

  /** live preview of the current frame, painted with the export pipeline */
  useEffect(() => {
    if (!open || !previewEl) return;
    const ctx = previewEl.getContext("2d");
    if (!ctx) return;
    const frame = previewFrameForExport(project, frameIndex);
    previewEl.width = project.width;
    previewEl.height = project.height;
    try {
      ctx.clearRect(0, 0, previewEl.width, previewEl.height);
      if (!transparent) paintBackground(ctx, project);
      paintProjectFrame(ctx, project, frame, { clear: false });
    } catch (err) {
      console.error("[export preview]", err);
    }
  }, [open, previewEl, project, frameIndex, transparent]);

  async function run() {
    if (progress !== null) return;
    setError(null);
    setProgress(0);
    const prev = project;
    try {
      if (isCodeExport) {
        setProgress(0.5);
        const name = project.name || "animation";
        if (format === "tsx") {
          const files = emitProjectReactFiles(project, codeOpts);
          downloadBlob(new Blob([files.json], { type: "application/json" }), files.jsonFileName);
          await new Promise((r) => setTimeout(r, 80));
          downloadBlob(new Blob([files.tsx], { type: "text/plain;charset=utf-8" }), files.tsxFileName);
          toastExported("tsx+json", name);
        } else {
          const code = emitCode();
          const ext = format === "json" ? "json" : "svg";
          const type = format === "json" ? "application/json" : "image/svg+xml;charset=utf-8";
          downloadBlob(new Blob([code], { type }), `${name}.${ext}`);
          toastExported(ext, name);
        }
        setProgress(1);
        return;
      }

      if (format === "png") {
        const blob = await exportProject(project, "png", setProgress, {
          width: dims.w,
          height: dims.h,
          transparent,
          frame: previewFrame,
        });
        downloadBlob(blob, `${project.name || "animation"}.png`);
        toastExported("png", project.name || "animation");
        return;
      }

      // fps override only — NEVER width/height: strokes are stored in canvas
      // coordinates, so resizing the project crops the drawing (the 4:3 cat
      // bug). Output size goes through ExportOptions and is scaled uniformly.
      useProject.setState({ project: { ...project, fps } });
      const blob = await exportProject(
        useProject.getState().project,
        format,
        setProgress,
        {
          width: dims.w,
          height: dims.h,
          transparent,
        },
      );
      downloadBlob(blob, `${project.name || "animation"}.${format}`);
      toastExported(format, project.name || "animation");
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      setError(message);
      toastError("Export failed", err);
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
        className="w-[400px] max-w-[400px] overflow-clip border-0 p-4 antialiased sm:max-w-[400px]"
        // radius inline: the design-system shape context sets 18px on the panel
        // and would win over a `rounded-2xl` class — Paper 1CQ-0 specifies 16px
        style={{ backgroundColor: PAPER.surface, borderRadius: 16 }}
      >
        {/*
          DialogContent is NOT a flex container by default — `shape.container`
          only ever supplies a `rounded-*` class (see shape-context.tsx), so a
          `gap-*`/`self-stretch` on DialogContent itself is silently inert
          (it stayed `display: block`, every section gap measured 0px live).
          Every other Dialog in this codebase supplies its own inner flex
          wrapper for exactly this reason — this one just skipped it.
          Paper 1CQ-0: flexDirection column, alignItems end, gap 24px.
        */}
        <div className="flex w-full flex-col items-end gap-6">
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
          <GradientHoverButton
            onClick={() => onOpenChange(false)}
            aria-label="Close"
            background={PAPER.modeActiveGradient}
            hoverBackground={PAPER.closeChipHoverWash}
            backgroundOrigin="border-box"
            borderColor="#C9C9C933"
            borderWidth={0.5}
            durationMs={160}
            className="flex size-6 shrink-0 cursor-pointer items-center justify-center rounded-full"
          >
            {(hovered) => (
              <svg
                xmlns="http://www.w3.org/2000/svg"
                width="16"
                height="16"
                viewBox="0.375 0.375 6 6"
                style={{ opacity: hovered ? 1 : 0.8, flexShrink: 0 }}
              >
                <path
                  d="M4.993 5.258C5.066 5.331 5.184 5.331 5.258 5.258 5.331 5.184 5.331 5.066 5.258 4.993L3.64 3.375 5.258 1.757C5.331 1.684 5.331 1.566 5.258 1.492 5.184 1.419 5.066 1.419 4.993 1.492L3.375 3.11 1.757 1.492C1.684 1.419 1.566 1.419 1.492 1.492 1.42 1.566 1.42 1.684 1.492 1.757L3.11 3.375 1.492 4.993C1.42 5.066 1.42 5.184 1.492 5.258 1.566 5.331 1.684 5.331 1.757 5.258L3.375 3.64 4.993 5.258Z"
                  fill="#FFFFFF"
                />
              </svg>
            )}
          </GradientHoverButton>
        </div>

        {/* Export Type + Quality */}
        <div className="flex items-start gap-4 self-stretch">
          <div className="flex flex-1 flex-col items-start gap-3">
            <FieldLabel>Export Type</FieldLabel>
            <PaperTabs
              label="Export Type"
              value={format}
              options={EXPORT_TYPES}
              onChange={handleFormat}
            />
          </div>
          {!isCodeExport && (
            <div className="flex flex-1 flex-col items-start gap-3">
              <FieldLabel>Quality</FieldLabel>
              <PaperTabs
                label="Quality"
                value={quality}
                options={QUALITIES}
                onChange={setQuality}
              />
            </div>
          )}
        </div>

        {/* Video Preview — keep above code options so it isn't clipped off-screen */}
        <div className="flex flex-col items-start gap-3 self-stretch">
          <FieldLabel>{isStillExport ? "Frame Preview" : "Video Preview"}</FieldLabel>
          <div
            className="relative h-[200px] shrink-0 self-stretch overflow-clip rounded-lg"
            style={
              transparent
                ? {
                    backgroundImage:
                      "repeating-conic-gradient(#3a3a3a 0% 25%, #252525 0% 50%)",
                    backgroundSize: "16px 16px",
                  }
                : { backgroundColor: PAPER.pillHover }
            }
          >
            <canvas
              ref={setPreviewEl}
              className="absolute inset-0 h-full w-full object-contain"
              aria-label="Export preview"
            />
          </div>
        </div>

        {(showAlphaToggle || isCodeExport) && (
          <div className="flex w-full flex-col items-stretch gap-3 self-stretch">
            <div className="flex w-full items-center justify-between gap-3">
              <Switch
                label="Transparent background"
                checked={transparent}
                onToggle={handleTransparent}
              />
            </div>
            {isCodeExport && (
            <div className="flex w-full items-center justify-between gap-3">
              <Switch
                label="SVG animation"
                checked={codeAnimated}
                onToggle={() => setCodeAnimated((v) => !v)}
              />
            </div>
            )}
            {format === "tsx" && codeAnimated && (
              <div className="flex flex-col items-start gap-3 self-stretch">
                <FieldLabel>Playback</FieldLabel>
                <PaperTabs
                  label="Playback"
                  value={playMode}
                  options={[
                    { id: "auto" as const, label: "Autoplay" },
                    { id: "scroll" as const, label: "Scroll" },
                  ]}
                  onChange={setPlayMode}
                />
              </div>
            )}
          </div>
        )}

        {isCodeExport && exportCaps.warnings.length > 0 && (
          <div
            className="flex max-h-24 flex-col gap-1 self-stretch overflow-y-auto rounded-lg p-2 text-[10px] leading-3 text-white/70"
            style={{ backgroundColor: PAPER.pillHover, fontFamily: PAPER.fontMono }}
          >
            {exportCaps.warnings.map((w) => (
              <span key={`${w.kind}-${w.id}`}>{w.message}</span>
            ))}
          </div>
        )}

        {/* Export fps — sequence formats only */}
        {isSequenceExport && (
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
        )}

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
              : isCodeExport
                ? `Output: ${formatLabel(format, codeAnimated)} · ${formatBytes(codeBytes)}`
                : isStillExport
                  ? `Output: composite PNG · ${dims.w}×${dims.h} · frame ${previewFrame + 1}${transparent ? " · alpha" : ""}`
                  : `Output: ${durationSec.toFixed(1)}s | ${project.frameCount} frames @ ${fps}fps | ${approxMb} MB max${transparent ? " · alpha" : ""}`}
          </span>
        </div>

        {error && (
          <div className="self-stretch text-center text-xs text-red-400">{error}</div>
        )}

        {/* Close / Copy / Save */}
        <div className="flex items-start gap-1 self-end">
          <GradientHoverButton
            onClick={() => onOpenChange(false)}
            background={PAPER.pillHover}
            hoverBackground={PAPER.secondaryBtnHoverGradient}
            hoverBorderColor={PAPER.outline}
            className="flex h-9 w-[120px] shrink-0 cursor-pointer items-center justify-center rounded-full py-1.5"
          >
            {(hovered) => (
              <span
                className="text-sm leading-[18px] tracking-[0.02em] transition-colors"
                style={{ color: hovered ? "#FFFFFF" : PAPER.text, fontFamily: PAPER.fontSans }}
              >
                Close
              </span>
            )}
          </GradientHoverButton>
          {(isCodeExport || isStillExport) && (
            <GradientHoverButton
              disabled={busy}
              onClick={() => void copyCode()}
              background={PAPER.pillHover}
              hoverBackground={PAPER.secondaryBtnHoverGradient}
              hoverBorderColor={PAPER.outline}
              className={cn(
                "flex h-9 w-[120px] shrink-0 items-center justify-center rounded-full py-1.5",
                !busy && "cursor-pointer",
              )}
            >
              {(hovered) => (
                <span
                  className="text-sm leading-[18px] tracking-[0.02em] transition-colors"
                  style={{ color: hovered ? "#FFFFFF" : PAPER.text, fontFamily: PAPER.fontSans }}
                >
                  Copy
                </span>
              )}
            </GradientHoverButton>
          )}
          <GradientHoverButton
            disabled={busy}
            onClick={() => void run()}
            background={PAPER.primaryBtnGradient}
            hoverBackground={PAPER.primaryBtnHoverGradient}
            backgroundOrigin="border-box"
            borderColor={PAPER.frameActiveBorder}
            hoverBorderColor={PAPER.frameActive}
            className={cn(
              "flex h-9 w-[120px] shrink-0 items-center justify-center rounded-full py-1.5",
              !busy && "cursor-pointer",
            )}
          >
            {(hovered) => (
              <span
                className="content-center text-sm leading-[18px] tracking-[0.02em] transition-colors"
                style={{ color: hovered ? "#FFFFFF" : PAPER.text, fontFamily: PAPER.fontSans }}
              >
                {busy ? "Saving…" : "Save"}
              </span>
            )}
          </GradientHoverButton>
        </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
