import { useRef, useState } from "react";
import {
  DynamicIsland,
  DynamicIslandView,
} from "@/components/motion/dynamic-island";
import { ColorPickerPopover } from "@/components/ui/color-picker";
import { Slider } from "@/components/ui/slider";
import { Switch } from "@/components/ui/switch";
import { cn } from "@/lib/utils";
import { useTools } from "@/state/tools";
import { useProject } from "@/state/project";
import { usePlayback } from "@/state/playback";
import { SHADER_PRESETS } from "@/components/ShaderBackground";
import type { Background, BackgroundFit, ShaderPresetId } from "@/model/types";

const GRADIENT_DEFAULT: Background = {
  kind: "gradient",
  shape: "linear",
  from: "#232355",
  to: "#0b0b0d",
  angle: 135,
};
const SHADER_DEFAULT: Background = {
  kind: "shader",
  preset: "mesh",
  colors: ["#5227ff", "#26ffe4", "#ff9f45"],
  speed: 0.6,
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
        "rounded-full border border-border px-2.5 py-1 text-[11px] text-muted-foreground transition-colors hover:text-foreground",
        active && "border-primary/50 bg-primary/15 text-foreground",
      )}
    >
      {children}
    </button>
  );
}

function Section({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-2">
      <span className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
        {label}
      </span>
      {children}
    </div>
  );
}

type IslandView = "brush" | "canvas" | null;

/**
 * Status + settings (@beui/dynamic-island). Compact pill reads tool / frame /
 * fps; tapping unfurls it into Brush or Canvas settings.
 */
export function StatusIsland() {
  const [view, setView] = useState<IslandView>(null);
  const imageInputRef = useRef<HTMLInputElement>(null);

  const { tool, color, size, autoKey, jitterByDefault } = useTools();
  const { setColor, setSize, toggleAutoKey, toggleJitterByDefault } = useTools();
  const project = useProject((s) => s.project);
  const frameIndex = useProject((s) => s.frameIndex);
  const setProjectSettings = useProject((s) => s.setProjectSettings);
  const workflow = usePlayback((s) => s.workflow);
  const background = project.background ?? ({ kind: "none" } as Background);

  const autoLabel = workflow === "animatron" ? "Auto-record" : "Auto-key";

  function setBg(bg: Background) {
    setProjectSettings({ background: bg });
  }

  function pickImage(fit: BackgroundFit = "cover") {
    const input = imageInputRef.current;
    if (!input) return;
    input.onchange = () => {
      const file = input.files?.[0];
      if (!file) return;
      const reader = new FileReader();
      reader.onload = () => setBg({ kind: "image", src: String(reader.result), fit });
      reader.readAsDataURL(file);
      input.value = "";
    };
    input.click();
  }

  return (
    <>
      <DynamicIsland
        view={view}
        className="!bg-card/95 !text-foreground border border-border/70 backdrop-blur-xl"
        compact={
          <button
            type="button"
            onClick={() => setView("brush")}
            aria-label="Open settings"
            className="flex w-full items-center justify-center gap-2.5 text-[11px]"
          >
            <span
              className="h-3 w-3 shrink-0 rounded-full border border-white/25"
              style={{ background: color }}
            />
            <span className="capitalize text-foreground">{tool}</span>
            <span className="text-muted-foreground">·</span>
            <span className="font-mono tabular-nums text-muted-foreground">
              {String(frameIndex + 1).padStart(2, "0")}/{project.frameCount}
            </span>
            <span className="text-muted-foreground">·</span>
            <span className="font-mono text-muted-foreground">{project.fps}fps</span>
          </button>
        }
      >
        <DynamicIslandView id="brush">
          <div className="w-[320px] px-4 pb-4 pt-3">
            <IslandTabs view="brush" onChange={setView} />
            <div className="mt-3 flex flex-col gap-4">
              <div className="flex items-center justify-between">
                <span className="text-[12px] text-foreground">Brush color</span>
                <ColorPickerPopover value={color} onValueChange={setColor} />
              </div>
              <Slider
                label="Brush size"
                value={size}
                onChange={(v) => setSize(typeof v === "number" ? v : v[0])}
                min={1}
                max={40}
                step={1}
                showValue
                valuePosition="right"
              />
              <div className="flex flex-col gap-2 border-t border-border/60 pt-3">
                <Switch
                  label="Boil lines"
                  checked={jitterByDefault}
                  onToggle={toggleJitterByDefault}
                  className="w-full !justify-between"
                />
                <Switch
                  label={autoLabel}
                  checked={autoKey}
                  onToggle={toggleAutoKey}
                  className="w-full !justify-between"
                />
              </div>
            </div>
          </div>
        </DynamicIslandView>

        <DynamicIslandView id="canvas">
          <div className="w-[320px] px-4 pb-4 pt-3">
            <IslandTabs view="canvas" onChange={setView} />
            <div className="mt-3 flex flex-col gap-4">
              <Section label="Background">
                <div className="flex flex-wrap gap-1.5">
                  <Chip active={background.kind === "none"} onClick={() => setBg({ kind: "none" })}>
                    None
                  </Chip>
                  <Chip
                    active={background.kind === "color"}
                    onClick={() => setBg({ kind: "color", color: "#1b1b22" })}
                  >
                    Color
                  </Chip>
                  <Chip
                    active={background.kind === "gradient"}
                    onClick={() => setBg(GRADIENT_DEFAULT)}
                  >
                    Gradient
                  </Chip>
                  <Chip active={background.kind === "image"} onClick={() => pickImage()}>
                    Image
                  </Chip>
                  <Chip active={background.kind === "shader"} onClick={() => setBg(SHADER_DEFAULT)}>
                    Shader
                  </Chip>
                </div>
              </Section>

              {background.kind === "color" && (
                <div className="flex items-center justify-between">
                  <span className="text-[12px] text-foreground">Fill</span>
                  <ColorPickerPopover
                    value={background.color}
                    onValueChange={(v) => setBg({ ...background, color: v })}
                  />
                </div>
              )}

              {background.kind === "gradient" && (
                <div className="flex flex-col gap-2.5">
                  <div className="flex gap-1.5">
                    <Chip
                      active={background.shape === "linear"}
                      onClick={() => setBg({ ...background, shape: "linear" })}
                    >
                      Linear
                    </Chip>
                    <Chip
                      active={background.shape === "radial"}
                      onClick={() => setBg({ ...background, shape: "radial" })}
                    >
                      Radial
                    </Chip>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-[12px] text-foreground">From</span>
                    <ColorPickerPopover
                      value={background.from}
                      onValueChange={(v) => setBg({ ...background, from: v })}
                    />
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-[12px] text-foreground">To</span>
                    <ColorPickerPopover
                      value={background.to}
                      onValueChange={(v) => setBg({ ...background, to: v })}
                    />
                  </div>
                  {background.shape === "linear" && (
                    <Slider
                      label="Angle"
                      value={background.angle}
                      onChange={(v) =>
                        setBg({ ...background, angle: typeof v === "number" ? v : v[0] })
                      }
                      min={0}
                      max={360}
                      step={5}
                      showValue
                      valuePosition="right"
                    />
                  )}
                </div>
              )}

              {background.kind === "image" && (
                <div className="flex flex-wrap gap-1.5">
                  {(["fill", "cover", "contain", "crop"] as const).map((fit) => (
                    <Chip
                      key={fit}
                      active={background.fit === fit}
                      onClick={() => setBg({ ...background, fit })}
                    >
                      {fit}
                    </Chip>
                  ))}
                  <Chip onClick={() => pickImage(background.fit)}>Replace…</Chip>
                </div>
              )}

              {background.kind === "shader" && (
                <div className="flex flex-col gap-2.5">
                  <div className="flex flex-wrap gap-1.5">
                    {SHADER_PRESETS.map((p) => (
                      <Chip
                        key={p.id}
                        active={background.preset === p.id}
                        onClick={() =>
                          setBg({ ...background, preset: p.id as ShaderPresetId })
                        }
                      >
                        {p.label}
                      </Chip>
                    ))}
                  </div>
                  <Slider
                    label="Speed"
                    value={background.speed}
                    onChange={(v) =>
                      setBg({ ...background, speed: typeof v === "number" ? v : v[0] })
                    }
                    min={0}
                    max={2}
                    step={0.1}
                    showValue
                    valuePosition="right"
                  />
                </div>
              )}

              <Section label="Canvas size">
                <div className="flex gap-2">
                  {(["width", "height"] as const).map((dim) => (
                    <label
                      key={dim}
                      className="flex h-8 flex-1 items-center rounded-full border border-border px-3 text-[11px] uppercase text-muted-foreground"
                    >
                      {dim === "width" ? "W" : "H"}
                      <input
                        type="number"
                        min={16}
                        max={8192}
                        key={`${dim}-${project[dim]}`}
                        defaultValue={project[dim]}
                        onBlur={(e) => {
                          const v = Math.round(Number(e.target.value));
                          if (Number.isFinite(v) && v >= 16 && v <= 8192)
                            setProjectSettings({ [dim]: v });
                        }}
                        onKeyDown={(e) => e.stopPropagation()}
                        className="ml-auto w-14 bg-transparent text-right text-[12px] text-foreground outline-none [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none"
                      />
                    </label>
                  ))}
                </div>
              </Section>
            </div>
          </div>
        </DynamicIslandView>
      </DynamicIsland>
      <input ref={imageInputRef} type="file" accept="image/*" className="hidden" />
    </>
  );
}

function IslandTabs({
  view,
  onChange,
}: {
  view: Exclude<IslandView, null>;
  onChange: (v: IslandView) => void;
}) {
  return (
    <div className="flex items-center gap-1">
      {(["brush", "canvas"] as const).map((id) => (
        <button
          key={id}
          type="button"
          onClick={() => onChange(id)}
          className={cn(
            "rounded-full px-2.5 py-1 text-[11px] capitalize transition-colors",
            view === id
              ? "bg-primary/15 text-foreground"
              : "text-muted-foreground hover:text-foreground",
          )}
        >
          {id}
        </button>
      ))}
      <button
        type="button"
        onClick={() => onChange(null)}
        aria-label="Close settings"
        className="ml-auto rounded-full px-2 py-1 text-[11px] text-muted-foreground hover:text-foreground"
      >
        Done
      </button>
    </div>
  );
}
