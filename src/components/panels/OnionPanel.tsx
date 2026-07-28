import { useState, useEffect } from "react";
import { usePlayback } from "@/state/playback";
import { ColorPickerPopover } from "@/components/ui/color-picker";
import { SliderComfortable } from "@/components/ui/slider";
import { Tabs, TabsList, TabItem } from "@/components/ui/tabs";
import { PAPER } from "@/components/chrome/paper-tokens";
import { cn } from "@/lib/utils";

function hexDigits(color: string): string {
  const m = color.trim().match(/^#?([0-9a-fA-F]{3,8})$/);
  if (!m) return color.replace(/^#/, "").toUpperCase();
  let h = m[1].toUpperCase();
  if (h.length === 3 || h.length === 4) {
    h = h
      .slice(0, 3)
      .split("")
      .map((c) => c + c)
      .join("");
  }
  return h.slice(0, 6);
}

function OnOffTabs({
  checked,
  onChange,
  id,
}: {
  checked: boolean;
  onChange: (next: boolean) => void;
  id: string;
}) {
  return (
    <Tabs
      value={checked ? "on" : "off"}
      onValueChange={(v) => onChange(v === "on")}
      className="shrink-0"
    >
      <TabsList
        aria-label={id}
        className={cn(
          "!h-5 !w-[72px] !gap-0 !rounded-lg !bg-[#121212] !p-0.5",
          "!outline !outline-1 !outline-[#292A2A]",
          // Selected segment = Paper #252525 (overrides fluid surface indicator).
          "[&>div.absolute.pointer-events-none:first-of-type]:!bg-[#252525]",
        )}
      >
        <TabItem
          value="on"
          label="On"
          className="!h-4 !flex-1 !justify-center !gap-0 !rounded-[7px] !px-0 [&_span]:!text-[12px] [&_span]:!leading-4"
        />
        <TabItem
          value="off"
          label="Off"
          className="!h-4 !flex-1 !justify-center !gap-0 !rounded-[7px] !px-0 [&_span]:!text-[12px] [&_span]:!leading-4"
        />
      </TabsList>
    </Tabs>
  );
}

export function OnionPanel({ className }: { className?: string }) {
  const onionSkin = usePlayback((s) => s.onionSkin);
  const onionColor = usePlayback((s) => s.onionColor);
  const onionOpacity = usePlayback((s) => s.onionOpacity);
  const onionRange = usePlayback((s) => s.onionRange);
  const onionAutoDuplicate = usePlayback((s) => s.onionAutoDuplicate);
  const toggleOnionSkin = usePlayback((s) => s.toggleOnionSkin);
  const setOnionSkinProps = usePlayback((s) => s.setOnionSkinProps);
  const toggleOnionPanel = usePlayback((s) => s.toggleOnionPanel);

  const [hex, setHex] = useState(() => hexDigits(onionColor));

  useEffect(() => {
    setHex(hexDigits(onionColor));
  }, [onionColor]);

  function commitHex(raw: string) {
    const digits = hexDigits(raw);
    setHex(digits);
    if (/^[0-9A-F]{6}$/.test(digits)) setOnionSkinProps({ onionColor: `#${digits}` });
  }

  return (
    <div
      className={cn(
        "flex w-[316px] flex-col gap-4 overflow-visible rounded-xl border border-border/60 bg-[#131212] px-4 pb-4 pt-5 shadow-2xl",
        className,
      )}
      style={{ fontFamily: PAPER.fontSans }}
    >
      <div className="flex items-center justify-between gap-2 overflow-visible py-1">
        <div className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
          Onion Skin
        </div>
        <button
          type="button"
          aria-label="Close"
          onClick={toggleOnionPanel}
          className="grid size-6 shrink-0 place-items-center overflow-hidden rounded-full border-0"
          style={{
            backgroundImage: PAPER.modeActiveGradient,
            boxShadow: "inset 0 0 0 0.5px #C9C9C933",
          }}
        >
          <svg width={12} height={12} viewBox="0 0 8 8" fill="none" style={{ opacity: 0.8 }}>
            <path d="M1 1l6 6M7 1L1 7" stroke="#FFFFFF" strokeWidth="0.7" strokeLinecap="round" />
          </svg>
        </button>
      </div>

      <div
        className="flex w-full items-center justify-between gap-4 rounded-lg p-2"
        style={{ backgroundColor: "#252525" }}
      >
        <span
          className="w-fit shrink-0 text-xs leading-4 text-white opacity-80"
          style={{ fontFamily: PAPER.fontMono }}
        >
          Onion Skin Enabled
        </span>
        <OnOffTabs
          id="Onion skin"
          checked={onionSkin}
          onChange={toggleOnionSkin}
        />
      </div>

      <div className="flex items-start gap-4">
        <div className="flex items-start gap-2">
          <ColorPickerPopover
            value={onionColor}
            onValueChange={(c) => setOnionSkinProps({ onionColor: c })}
            triggerShowValue={false}
            triggerClassName="!size-6 !min-h-6 !min-w-6 !justify-center !gap-0 !rounded-lg !border-0 !bg-transparent !p-0 !outline-none"
          />
          <label
            className="flex h-6 items-center gap-1 overflow-clip rounded-[7px] border-[0.4px] border-solid px-[5px] py-[3px]"
            style={{
              backgroundColor: PAPER.surfaceAlt,
              borderColor: PAPER.borderHairline,
              fontFamily: PAPER.fontMono,
            }}
          >
            <span className="w-3 shrink-0 text-center text-[10px] leading-3 text-white opacity-20">
              #
            </span>
            <input
              value={hex}
              onChange={(e) =>
                setHex(e.target.value.replace(/[^0-9a-fA-F]/g, "").slice(0, 8))
              }
              onBlur={() => commitHex(hex)}
              onKeyDown={(e) => {
                e.stopPropagation();
                if (e.key === "Enter") commitHex(hex);
              }}
              spellCheck={false}
              aria-label="Hex color"
              className="w-11 shrink-0 bg-transparent text-[10px] leading-3 text-white outline-none"
            />
          </label>
        </div>

        <SliderComfortable
          label="Opacity"
          variant="scrubber"
          value={Math.round(onionOpacity * 100)}
          onChange={(v) => setOnionSkinProps({ onionOpacity: v / 100 })}
          formatValue={(v) => `${Math.round(v)}%`}
          min={0}
          max={100}
          step={1}
          fillColor="#40608E"
          className="!h-6 !min-w-0 !flex-1 !rounded-lg !border-0 !bg-[#252525] !px-2 [&_span]:!font-mono [&_span]:!text-sm"
        />
      </div>

      <div className="flex items-start gap-4">
        <SliderComfortable
          label="Frames (Range)"
          variant="scrubber"
          value={onionRange}
          onChange={(v) => setOnionSkinProps({ onionRange: v })}
          min={1}
          max={10}
          step={1}
          fillColor="#40608E"
          className="!h-6 !min-w-0 !flex-1 !rounded-lg !border-0 !bg-[#252525] !px-2 [&_span]:!font-mono [&_span]:!text-sm"
        />
      </div>

      <div
        className="flex w-full items-center justify-between gap-4 rounded-lg p-2"
        style={{ backgroundColor: "#252525" }}
      >
        <span
          className="w-fit shrink-0 text-xs leading-4 text-white opacity-80"
          style={{ fontFamily: PAPER.fontMono }}
        >
          Auto-Duplicate Frame
        </span>
        <OnOffTabs
          id="Auto-duplicate"
          checked={onionAutoDuplicate}
          onChange={(v) => setOnionSkinProps({ onionAutoDuplicate: v })}
        />
      </div>
    </div>
  );
}
