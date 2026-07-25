import { useRef, useState } from "react";
import { ColorPickerPopover } from "@/components/ui/color-picker";
import { Slider } from "@/components/ui/slider";
import { Switch } from "@/components/ui/switch";
import {
  PaperDockBar,
  PaperDockSep,
  ConjoinedDock,
} from "@/components/chrome/PaperDockPrimitives";
import { PAPER } from "@/components/chrome/paper-tokens";
import { useTools } from "@/state/tools";
import { useProject } from "@/state/project";
import { cn } from "@/lib/utils";

function aspectLabel(w: number, h: number): string {
  const r = w / h;
  const presets: [string, number][] = [
    ["16:9", 16 / 9],
    ["9:16", 9 / 16],
    ["1:1", 1],
    ["4:3", 4 / 3],
  ];
  for (const [label, ratio] of presets) {
    if (Math.abs(r - ratio) < 0.02) return label;
  }
  return `${w}:${h}`;
}

/** Paper setting bar (5F2-0) — color · brush · aspect · canvas. Flyouts closed by default. */
export function SettingsDocks() {
  const [open, setOpen] = useState<"brush" | "canvas" | null>(null);
  const brushRef = useRef<HTMLButtonElement>(null);
  const canvasRef = useRef<HTMLButtonElement>(null);

  const { color, size, autoKey, jitterByDefault, grainByDefault } = useTools();
  const { setColor, setSize, toggleAutoKey, toggleJitterByDefault, toggleGrainByDefault } =
    useTools();
  const project = useProject((s) => s.project);
  const setProjectSettings = useProject((s) => s.setProjectSettings);
  const aspect = aspectLabel(project.width, project.height);

  return (
    <div className="pointer-events-auto relative">
      <ConjoinedDock open={open === "brush"} side="top" anchorRef={brushRef} bare>
        <div
          className="flex w-[280px] flex-col gap-3 rounded-2xl p-3 antialiased"
          style={{ backgroundColor: PAPER.surface, outline: `0.4px solid ${PAPER.outlineSubtle}` }}
        >
          <div className="flex items-center justify-between">
            <span className="text-xs" style={{ color: PAPER.textMuted }}>
              Color
            </span>
            <ColorPickerPopover value={color} onValueChange={setColor} />
          </div>
          <Slider
            label="Size"
            value={size}
            onChange={(v) => setSize(typeof v === "number" ? v : v[0])}
            min={1}
            max={40}
            step={1}
            showValue
            valuePosition="right"
          />
          <Switch
            label="Boil lines"
            checked={jitterByDefault}
            onToggle={toggleJitterByDefault}
            className="w-full !justify-between"
          />
          <Switch
            label="Paper grain"
            checked={grainByDefault}
            onToggle={toggleGrainByDefault}
            className="w-full !justify-between"
          />
          <Switch
            label="Auto-key / Auto-record"
            checked={autoKey}
            onToggle={toggleAutoKey}
            className="w-full !justify-between"
          />
        </div>
      </ConjoinedDock>

      <ConjoinedDock open={open === "canvas"} side="top" anchorRef={canvasRef} bare>
        <div
          className="flex w-[280px] flex-col gap-3 rounded-2xl p-3 antialiased"
          style={{ backgroundColor: PAPER.surface, outline: `0.4px solid ${PAPER.outlineSubtle}` }}
        >
          <div className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
            Resolution
          </div>
          <div className="flex flex-wrap gap-1.5">
            {(
              [
                ["720p", 1280, 720],
                ["1080p", 1920, 1080],
                ["2K", 2560, 1440],
                ["4K", 3840, 2160],
              ] as const
            ).map(([label, w, h]) => (
              <button
                key={label}
                type="button"
                onClick={() => setProjectSettings({ width: w, height: h })}
                className={cn(
                  "rounded-full px-2.5 py-1 text-[11px]",
                  project.width === w && project.height === h
                    ? "bg-[#40608E]/30 text-white"
                    : "text-[#DADADA] hover:text-white",
                )}
                style={{ border: `0.4px solid ${PAPER.borderHairline}` }}
              >
                {label}
              </button>
            ))}
          </div>
          <div className="flex flex-wrap gap-1.5">
            {(
              [
                ["16:9", 1920, 1080],
                ["9:16", 1080, 1920],
                ["1:1", 1080, 1080],
                ["4:3", 1440, 1080],
              ] as const
            ).map(([label, w, h]) => (
              <button
                key={label}
                type="button"
                onClick={() => setProjectSettings({ width: w, height: h })}
                className={cn(
                  "rounded-full px-2.5 py-1 text-[11px]",
                  project.width === w && project.height === h
                    ? "bg-[#40608E]/30 text-white"
                    : "text-[#DADADA] hover:text-white",
                )}
                style={{ border: `0.4px solid ${PAPER.borderHairline}` }}
              >
                {label}
              </button>
            ))}
          </div>
          <div className="flex gap-2">
            <label className="flex flex-1 flex-col gap-1 text-[11px]" style={{ color: PAPER.textMuted }}>
              W
              <input
                type="number"
                className="rounded-md px-2 py-1 text-white"
                style={{ backgroundColor: PAPER.surfaceDeep, border: `0.4px solid ${PAPER.borderHairline}` }}
                value={project.width}
                onChange={(e) =>
                  setProjectSettings({ width: Math.max(64, Number(e.target.value) || 64) })
                }
              />
            </label>
            <label className="flex flex-1 flex-col gap-1 text-[11px]" style={{ color: PAPER.textMuted }}>
              H
              <input
                type="number"
                className="rounded-md px-2 py-1 text-white"
                style={{ backgroundColor: PAPER.surfaceDeep, border: `0.4px solid ${PAPER.borderHairline}` }}
                value={project.height}
                onChange={(e) =>
                  setProjectSettings({ height: Math.max(64, Number(e.target.value) || 64) })
                }
              />
            </label>
          </div>
        </div>
      </ConjoinedDock>

      <PaperDockBar variant="setting">
        <button
          ref={brushRef}
          type="button"
          onClick={() => setOpen(open === "brush" ? null : "brush")}
          className="flex items-center gap-3 outline-none"
        >
          <span
            className="size-[18px] shrink-0 rounded-md"
            style={{ backgroundColor: color }}
            aria-hidden
          />
          <span className="size-1 shrink-0 rounded-full bg-[#DDDDDD26]" aria-hidden />
          <span className="flex items-center gap-2">
            <svg width={18} height={18} viewBox="-0.75 -0.75 6.75 6.75" style={{ opacity: 0.7 }}>
              <g transform="scale(1.333)">
                <path
                  d="M1.517 0.606C0.374 1.462 0.389 2.097 0.175 2.343C0.102 2.427 -0.029 2.424 -0.108 2.348C-0.186 2.271 -0.356 1.728 0 1.167C0.238 0.791 0.484 0.431 1.201 0.092C1.784 -0.182 2.323 -0.122 2.689 0.243C3.086 0.638 2.641 1.147 2.058 1.922C1.988 2.015 1.911 2.108 1.85 2.188C1.492 2.655 1.412 2.759 1.474 2.829C1.535 2.899 1.657 2.851 2.173 2.371C2.689 1.89 2.871 1.85 3.182 1.837C3.298 1.831 3.399 1.87 3.48 1.944C3.781 2.225 3.515 2.704 3.355 2.99C3.336 3.025 3.317 3.057 3.303 3.085L3.276 3.137C3.22 3.241 3.135 3.45 3.178 3.51C3.271 3.6 3.369 3.607 3.569 3.411C3.648 3.334 3.734 3.176 3.766 3.193C3.863 3.246 3.765 3.385 3.692 3.507C3.655 3.571 3.498 3.816 3.218 3.837C3.206 3.838 3.195 3.838 3.185 3.838L3.184 3.839C3.079 3.839 2.967 3.816 2.905 3.73C2.783 3.564 2.881 3.175 2.994 2.961L3.02 2.91C3.036 2.88 3.055 2.845 3.077 2.807C3.323 2.363 3.228 2.259 3.206 2.238C3.193 2.234 3.042 2.214 2.536 2.78C2.255 3.093 1.854 3.394 1.508 3.409C1.376 3.412 1.151 3.386 1.03 3.245C0.773 2.946 0.795 2.54 1.241 1.98C1.425 1.749 1.56 1.573 1.627 1.484C2.021 0.96 2.333 0.519 2.179 0.376C2.061 0.266 1.648 0.507 1.517 0.606Z"
                  fill={PAPER.icon}
                />
              </g>
            </svg>
            <span
              className="text-sm leading-[18px] text-white"
              style={{ fontFamily: PAPER.fontSans }}
            >
              {size}
            </span>
          </span>
        </button>

        <PaperDockSep />

        <button
          type="button"
          onClick={() => setOpen(open === "canvas" ? null : "canvas")}
          className="text-sm leading-[18px] outline-none"
          style={{ color: PAPER.text, fontFamily: PAPER.fontSans }}
        >
          {aspect}
        </button>

        <PaperDockSep />

        <button
          ref={canvasRef}
          type="button"
          onClick={() => setOpen(open === "canvas" ? null : "canvas")}
          className="flex items-center gap-2.5 outline-none"
        >
          <svg width={18} height={18} viewBox="0 0 6.75 6.75" style={{ opacity: 0.6 }}>
            <path
              d="M0.562 2.463C0.562 1.7 0.562 1.318 0.81 1.081 1.057 0.844 1.454 0.844 2.25 0.844H4.5C5.296 0.844 5.693 0.844 5.94 1.081 6.187 1.318 6.187 1.7 6.187 2.463V2.734C6.187 3.497 6.187 3.879 5.94 4.117 5.693 4.354 5.296 4.354 4.5 4.354H3.586V5.017L5.129 5.512C5.239 5.548 5.3 5.661 5.263 5.768 5.225 5.873 5.107 5.931 4.996 5.896L3.375 5.377 1.754 5.896C1.643 5.931 1.525 5.873 1.488 5.768 1.45 5.661 1.511 5.548 1.621 5.512L3.164 5.017V4.354H2.25C1.454 4.354 1.057 4.354 0.81 4.117 0.562 3.879 0.562 3.497 0.562 2.734V2.463Z"
              fill={PAPER.icon}
            />
          </svg>
          <span className="text-sm leading-[18px]" style={{ color: PAPER.textMuted, fontFamily: PAPER.fontSans }}>
            Canvas
          </span>
        </button>
      </PaperDockBar>
    </div>
  );
}
