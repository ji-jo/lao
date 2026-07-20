import { useRef, useState } from "react";
import { ColorPickerPopover } from "@/components/ui/color-picker";
import { Switch } from "@/components/ui/switch";
import { Slider } from "@/components/ui/slider";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
} from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { CustomScroll } from "@/components/ui/custom-scroll";
import GearIcon from "@/components/ui/gear-icon";
import { FLOAT_BAR_H } from "@/components/chrome/WorkflowBar";
import { useTools } from "@/state/tools";
import { useProject } from "@/state/project";
import { usePlayback } from "@/state/playback";
import { SHADER_PRESETS } from "@/components/ShaderBackground";
import type { Background, BackgroundFit, ShaderPresetId } from "@/model/types";
import { cn } from "@/lib/utils";

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

/**
 * Vertical Settings (standing upright) — mid-right, expands left.
 * Fluid: Switch, Slider, ColorPickerPopover, Select, Button.
 */
export function InspectPanel() {
  const { color, size, autoKey, jitterByDefault } = useTools();
  const { setColor, setSize, toggleAutoKey, toggleJitterByDefault } = useTools();
  const workflow = usePlayback((s) => s.workflow);
  const project = useProject((s) => s.project);
  const setProjectSettings = useProject((s) => s.setProjectSettings);
  const background = project.background ?? { kind: "none" as const };
  const imageInputRef = useRef<HTMLInputElement>(null);
  const [expanded, setExpanded] = useState(false);

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

  function onBackgroundKind(kind: string) {
    switch (kind) {
      case "none":
        setBg({ kind: "none" });
        break;
      case "color":
        setBg({ kind: "color", color: "#1b1b22" });
        break;
      case "gradient":
        setBg(GRADIENT_DEFAULT);
        break;
      case "image":
        pickImage();
        break;
      case "shader":
        setBg(SHADER_DEFAULT);
        break;
    }
  }

  const autoLabel = workflow === "animatron" ? "Auto-record" : "Auto-key";

  if (!expanded) {
    return (
      <Button
        type="button"
        variant="secondary"
        size="sm"
        onClick={() => setExpanded(true)}
        aria-expanded={false}
        aria-label="Open settings"
        className="!h-[42px] !min-h-[42px] !rounded-[29px] !px-3 shadow-2xl"
        style={{ height: FLOAT_BAR_H }}
        leadingIcon={GearIcon}
      >
        Settings
      </Button>
    );
  }

  return (
    <div
      className="flex w-[189px] origin-right flex-col overflow-hidden rounded-[29px] border border-border/60 bg-[#2f2f2f] shadow-2xl"
      role="dialog"
      aria-label="Settings"
      aria-expanded
    >
      <button
        type="button"
        onClick={() => setExpanded(false)}
        className="flex w-full shrink-0 items-center gap-2 px-3 text-left text-[13px] text-white hover:bg-white/5"
        style={{ height: FLOAT_BAR_H }}
      >
        <GearIcon size={18} />
        Settings
      </button>
      <div className="h-px w-full bg-white/10" />

      <CustomScroll heightRelativeToParent="min(70vh, 420px)">
      <div className="flex flex-col gap-4 px-3 py-4">
        {/* horizontal rows inside vertical stack */}
        <div className="flex flex-col gap-2">
          <div
            className={cn(
              "relative flex h-[34px] w-full items-center overflow-hidden rounded-full border border-[#4b4b4b] px-2",
            )}
          >
            <span className="pointer-events-none text-[13px] text-white">Brush Color</span>
            <div className="ml-auto">
              <ColorPickerPopover
                value={color}
                onValueChange={setColor}
                triggerShowValue={false}
                triggerClassName="!h-6 !min-w-6 !rounded-full !border-0 !bg-transparent !p-0 !shadow-none"
              />
            </div>
          </div>
          <div className="w-full px-0.5">
            <Slider
              label="Brush Size"
              value={size}
              onChange={(v) => setSize(typeof v === "number" ? v : v[0])}
              min={1}
              max={40}
              step={1}
              showValue
              valuePosition="right"
              className="w-full"
            />
          </div>
        </div>

        <div className="h-px w-full bg-white/10" />

        <div className="flex flex-col gap-2">
          <Switch
            label="Boil"
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

        <div className="h-px w-full bg-white/10" />

        <div className="flex flex-col gap-2">
          <p className="text-[13px] text-white/70">Canvas size</p>
          <div className="flex gap-2">
            <label className="flex h-[34px] flex-1 items-center rounded-full border border-[#4b4b4b] px-2.5 text-[12px] text-white">
              W
              <input
                type="number"
                min={16}
                max={8192}
                defaultValue={project.width}
                key={`w-${project.width}`}
                onBlur={(e) => {
                  const v = Math.round(Number(e.target.value));
                  if (Number.isFinite(v) && v >= 16 && v <= 8192)
                    setProjectSettings({ width: v });
                }}
                className="ml-auto w-12 bg-transparent text-right outline-none [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none"
              />
            </label>
            <label className="flex h-[34px] flex-1 items-center rounded-full border border-[#4b4b4b] px-2.5 text-[12px] text-white">
              H
              <input
                type="number"
                min={16}
                max={8192}
                defaultValue={project.height}
                key={`h-${project.height}`}
                onBlur={(e) => {
                  const v = Math.round(Number(e.target.value));
                  if (Number.isFinite(v) && v >= 16 && v <= 8192)
                    setProjectSettings({ height: v });
                }}
                className="ml-auto w-12 bg-transparent text-right outline-none [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none"
              />
            </label>
          </div>
        </div>

        <div className="h-px w-full bg-white/10" />

        <div className="flex flex-col gap-2">
          <p className="text-[13px] text-white/70">Background</p>
          <Select value={background.kind} onValueChange={onBackgroundKind}>
            <SelectTrigger placeholder="Background" className="w-full !text-[12px]" />
            <SelectContent>
              <SelectItem index={0} value="none">
                None
              </SelectItem>
              <SelectItem index={1} value="color">
                Color
              </SelectItem>
              <SelectItem index={2} value="gradient">
                Gradient
              </SelectItem>
              <SelectItem index={3} value="image">
                Image
              </SelectItem>
              <SelectItem index={4} value="shader">
                Shader
              </SelectItem>
            </SelectContent>
          </Select>

          {background.kind === "color" && (
            <div className="relative flex h-[34px] w-full items-center rounded-full border border-[#4b4b4b] px-2">
              <span className="text-[13px] text-white">Color</span>
              <div className="ml-auto">
                <ColorPickerPopover
                  value={background.color}
                  onValueChange={(v) => setBg({ ...background, color: v })}
                  triggerShowValue={false}
                  triggerClassName="!h-6 !min-w-6 !rounded-full !border-0 !bg-transparent !p-0 !shadow-none"
                />
              </div>
            </div>
          )}

          {background.kind === "gradient" && (
            <div className="flex flex-col gap-2">
              <div className="relative flex h-[34px] w-full items-center rounded-full border border-[#4b4b4b] px-2">
                <span className="text-[13px] text-white">From</span>
                <div className="ml-auto">
                  <ColorPickerPopover
                    value={background.from}
                    onValueChange={(v) => setBg({ ...background, from: v })}
                    triggerShowValue={false}
                    triggerClassName="!h-6 !min-w-6 !rounded-full !border-0 !bg-transparent !p-0 !shadow-none"
                  />
                </div>
              </div>
              <div className="relative flex h-[34px] w-full items-center rounded-full border border-[#4b4b4b] px-2">
                <span className="text-[13px] text-white">To</span>
                <div className="ml-auto">
                  <ColorPickerPopover
                    value={background.to}
                    onValueChange={(v) => setBg({ ...background, to: v })}
                    triggerShowValue={false}
                    triggerClassName="!h-6 !min-w-6 !rounded-full !border-0 !bg-transparent !p-0 !shadow-none"
                  />
                </div>
              </div>
            </div>
          )}

          {background.kind === "image" && (
            <Select
              value={background.fit}
              onValueChange={(fit) => setBg({ ...background, fit: fit as BackgroundFit })}
            >
              <SelectTrigger placeholder="Fit" className="w-full !text-[12px]" />
              <SelectContent>
                <SelectItem index={0} value="fill">
                  Fill
                </SelectItem>
                <SelectItem index={1} value="cover">
                  Cover
                </SelectItem>
                <SelectItem index={2} value="contain">
                  Contain
                </SelectItem>
                <SelectItem index={3} value="crop">
                  Crop
                </SelectItem>
              </SelectContent>
            </Select>
          )}

          {background.kind === "shader" && (
            <Select
              value={background.preset}
              onValueChange={(preset) =>
                setBg({ ...background, preset: preset as ShaderPresetId })
              }
            >
              <SelectTrigger placeholder="Preset" className="w-full !text-[12px]" />
              <SelectContent>
                {SHADER_PRESETS.map((p, i) => (
                  <SelectItem key={p.id} index={i} value={p.id}>
                    {p.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}
        </div>
      </div>
      </CustomScroll>

      <input ref={imageInputRef} type="file" accept="image/*" className="hidden" />
    </div>
  );
}
