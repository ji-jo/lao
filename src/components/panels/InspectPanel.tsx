import { ColorPickerPopover } from "@/components/ui/color-picker";
import { Slider } from "@/components/ui/slider";
import { Switch } from "@/components/ui/switch";
import { useTools } from "@/state/tools";

export function InspectPanel() {
  const { color, size, autoKey, jitterByDefault } = useTools();
  const { setColor, setSize, toggleAutoKey, toggleJitterByDefault } = useTools();

  return (
    <div className="w-60 rounded-2xl border border-border bg-card/90 p-4 shadow-2xl backdrop-blur-xl">
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
      </div>
    </div>
  );
}
