import { useRef } from "react";
import { ColorPickerPopover } from "@/components/ui/color-picker";
import { Slider } from "@/components/ui/slider";
import { Switch } from "@/components/ui/switch";
import { cn } from "@/lib/utils";
import { useTools } from "@/state/tools";
import { useProject } from "@/state/project";
import { SHADER_PRESETS } from "@/components/ShaderBackground";
import type { Background, BackgroundFit, ShaderPresetId } from "@/model/types";

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
        "rounded-lg border border-border px-2 py-1 text-[11px] text-muted-foreground transition-colors hover:text-foreground",
        active && "border-primary/50 bg-primary/15 text-foreground",
      )}
    >
      {children}
    </button>
  );
}

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

export function InspectPanel() {
  const { color, size, autoKey, jitterByDefault } = useTools();
  const { setColor, setSize, toggleAutoKey, toggleJitterByDefault } = useTools();
  const background = useProject((s) => s.project.background) ?? { kind: "none" as const };
  const setProjectSettings = useProject((s) => s.setProjectSettings);
  const imageInputRef = useRef<HTMLInputElement>(null);

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
    <div className="w-64 rounded-2xl border border-border bg-card/90 p-4 shadow-2xl backdrop-blur-xl">
      <div className="mb-3 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
        Inspect
      </div>
      <div className="flex flex-col gap-4">
        <ColorPickerPopover
          value={color}
          onValueChange={(v) => setColor(v)}
          triggerLabel="Color"
          triggerShowValue
        />
        <Slider
          label="Size"
          value={size}
          onChange={(v) => setSize(v as number)}
          min={1}
          max={40}
          step={1}
          showValue
          valuePosition="right"
        />
        <Switch label="Boil lines" checked={jitterByDefault} onToggle={toggleJitterByDefault} />
        <Switch label="Auto-key" checked={autoKey} onToggle={toggleAutoKey} />

        {/* ---------- background ---------- */}
        <div className="border-t border-border pt-3">
          <div className="mb-2 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
            Background
          </div>
          <div className="mb-2 flex flex-wrap gap-1">
            <Chip active={background.kind === "none"} onClick={() => setBg({ kind: "none" })}>
              None
            </Chip>
            <Chip
              active={background.kind === "color"}
              onClick={() => setBg({ kind: "color", color: "#1b1b22" })}
            >
              Color
            </Chip>
            <Chip active={background.kind === "gradient"} onClick={() => setBg(GRADIENT_DEFAULT)}>
              Gradient
            </Chip>
            <Chip active={background.kind === "image"} onClick={() => pickImage()}>
              Image
            </Chip>
            <Chip active={background.kind === "shader"} onClick={() => setBg(SHADER_DEFAULT)}>
              Shader
            </Chip>
          </div>

          {background.kind === "color" && (
            <ColorPickerPopover
              value={background.color}
              onValueChange={(v) => setBg({ ...background, color: v })}
              triggerLabel="Fill"
              triggerShowValue
            />
          )}

          {background.kind === "gradient" && (
            <div className="flex flex-col gap-2">
              <div className="flex gap-1">
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
              <ColorPickerPopover
                value={background.from}
                onValueChange={(v) => setBg({ ...background, from: v })}
                triggerLabel="From"
              />
              <ColorPickerPopover
                value={background.to}
                onValueChange={(v) => setBg({ ...background, to: v })}
                triggerLabel="To"
              />
              {background.shape === "linear" && (
                <Slider
                  label="Angle"
                  value={background.angle}
                  onChange={(v) => setBg({ ...background, angle: v as number })}
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
            <div className="flex flex-col gap-2">
              <div className="flex flex-wrap gap-1">
                {(["fill", "cover", "contain", "crop"] as const).map((fit) => (
                  <Chip
                    key={fit}
                    active={background.fit === fit}
                    onClick={() => setBg({ ...background, fit })}
                  >
                    {fit}
                  </Chip>
                ))}
              </div>
              <Chip onClick={() => pickImage(background.fit)}>Replace image…</Chip>
            </div>
          )}

          {background.kind === "shader" && (
            <div className="flex flex-col gap-2">
              <div className="flex flex-wrap gap-1">
                {SHADER_PRESETS.map((p) => (
                  <Chip
                    key={p.id}
                    active={background.preset === p.id}
                    onClick={() => setBg({ ...background, preset: p.id as ShaderPresetId })}
                  >
                    {p.label}
                  </Chip>
                ))}
              </div>
              {background.colors.map((c, i) => (
                <ColorPickerPopover
                  key={i}
                  value={c}
                  onValueChange={(v) =>
                    setBg({
                      ...background,
                      colors: background.colors.map((cc, ii) => (ii === i ? v : cc)),
                    })
                  }
                  triggerLabel={`Color ${i + 1}`}
                />
              ))}
              <Slider
                label="Speed"
                value={background.speed}
                onChange={(v) => setBg({ ...background, speed: v as number })}
                min={0}
                max={2}
                step={0.1}
                showValue
                valuePosition="right"
              />
              <div className="text-[10px] leading-snug text-muted-foreground/70">
                Shaders animate live in Preview; exports stamp a snapshot.
              </div>
            </div>
          )}
        </div>
      </div>
      <input ref={imageInputRef} type="file" accept="image/*" className="hidden" />
    </div>
  );
}
