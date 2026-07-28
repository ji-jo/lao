import {
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
} from "react";
import { ColorPickerPopover } from "@/components/ui/color-picker";
import {
  BG_PICKER_WIDTH,
  backgroundToPickerValue,
  GradientColorPicker,
} from "@/components/ui/gradient-color-picker";
import { motion, AnimatePresence, useReducedMotion } from "motion/react";
import { SPRING_SWAP } from "@/lib/ease";
import { SliderComfortable } from "@/components/ui/slider";
import { Tabs, TabsList, TabItem } from "@/components/ui/tabs";
import { PaperDockBar, PaperDockSep } from "@/components/chrome/PaperDockPrimitives";
import { GooeyConjoined } from "@/components/motion/gooey-conjoined";
import { Tooltip } from "@/components/motion/tooltip";
import { PAPER } from "@/components/chrome/paper-tokens";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  ensureFontLoaded,
  listGoogleFontFamilies,
  LOCAL_TEXT_FONTS,
  textFontStack,
} from "@/lib/google-fonts";
import { useTools, isShapeTool } from "@/state/tools";
import { useProject } from "@/state/project";
import {
  type Background,
  type BoilSettings,
  type ImageFilterId,
  type ShaderPresetId,
} from "@/model/types";
import { resolveBoil } from "@/engine/boil";
import { cn } from "@/lib/utils";
import { ShaderBackground } from "@/components/ShaderBackground";
import { ImageFilterBackground } from "@/components/ImageFilterBackground";
import { loadBackgroundImage } from "@/engine/background";
import {
  makeShaderBackground,
  normalizeShaderPreset,
  paramValue,
  SHADER_DEFAULTS,
  SHADER_PRESETS,
} from "@/lib/shader-presets";
import {
  applyImageFilter,
  clearImageFilter,
  IMAGE_FILTER_CHIPS,
  IMAGE_FILTER_DEFAULTS,
  IMAGE_FIT_OPTIONS,
  imageFilterParam,
  imagePosition,
  imageZoom,
  makeEmptyImageBackground,
} from "@/lib/image-filters";
import { DotGridSpotlight } from "@/components/dot-grid-spotlight";
/** Shared label style for brush size / aspect / background chips. */
const CHIP_LABEL_STYLE: CSSProperties = {
  color: PAPER.text,
  fontFamily: PAPER.fontSans,
  fontSize: 14,
  lineHeight: 1,
};

const BG_COLOR_DEFAULT: Background = { kind: "color", color: "#FFFFFF" };
const BG_SHADER_DEFAULT: Background = makeShaderBackground("plasma");

/** CSS `background` for the dock chip — solid, gradient, image, or shader. */
function backgroundChipStyle(bg: Background | undefined): CSSProperties {
  if (!bg || bg.kind === "none") return { background: "#000000" };
  if (bg.kind === "image") {
    if (!bg.src) return { background: "#252525" };
    return {
      backgroundImage: `url(${bg.src})`,
      backgroundSize: "cover",
      backgroundPosition: "center",
    };
  }
  if (bg.kind === "shader") {
    const colors = bg.colors;
    if (colors.length >= 2) {
      return {
        background: `linear-gradient(135deg, ${colors[0]}, ${colors[1]})`,
      };
    }
    return { background: colors[0] ?? "#888888" };
  }
  // color | gradient — same CSS the picker preview uses
  return { background: backgroundToPickerValue(bg) };
}

type BgKindTab = "none" | "color" | "shader" | "image";

function bgKindTab(bg: Background | undefined): BgKindTab {
  const kind = bg?.kind ?? "none";
  if (kind === "color" || kind === "shader" || kind === "image") return kind;
  // gradient maps into Color for this compact panel
  if (kind === "gradient") return "color";
  return "none";
}

const ASPECT_PRESETS: { label: string; rw: number; rh: number }[] = [
  { label: "16:9", rw: 16, rh: 9 },
  { label: "9:16", rw: 9, rh: 16 },
  { label: "4:3", rw: 4, rh: 3 },
  { label: "3:4", rw: 3, rh: 4 },
  { label: "1:1", rw: 1, rh: 1 },
  { label: "5:4", rw: 5, rh: 4 },
  { label: "3:2", rw: 3, rh: 2 },
  { label: "21:9", rw: 21, rh: 9 },
];

const RESOLUTION_PRESETS = [
  ["720p", 1280, 720],
  ["1080p", 1920, 1080],
  ["2K", 2560, 1440],
  ["4K", 3840, 2160],
] as const;

function aspectLabel(w: number, h: number): string {
  const r = w / h;
  for (const { label, rw, rh } of ASPECT_PRESETS) {
    if (Math.abs(r - rw / rh) < 0.02) return label;
  }
  return "Custom";
}

function sizeForAspect(
  rw: number,
  rh: number,
  curW: number,
  curH: number,
): { width: number; height: number } {
  // Keep the longer side; reshape the other to the target ratio.
  if (rw >= rh) {
    const width = Math.max(curW, curH);
    return { width, height: Math.max(64, Math.round((width * rh) / rw)) };
  }
  const height = Math.max(curW, curH);
  return { height, width: Math.max(64, Math.round((height * rw) / rh)) };
}

function Chip({
  label,
  active,
  onClick,
  className,
}: {
  label: string;
  active: boolean;
  onClick: () => void;
  className?: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "flex h-6 items-center gap-1 overflow-clip rounded-[7px] border-[0.4px] border-solid px-[5px] py-[3px] outline-none",
        className,
      )}
      style={{
        backgroundColor: active ? "#252525" : "#131313",
        borderColor: active ? "#828282" : PAPER.borderHairline,
        fontFamily: PAPER.fontMono,
      }}
    >
      <span
        className="text-xs leading-4 text-white"
        style={{ opacity: active ? 1 : 0.8 }}
      >
        {label}
      </span>
    </button>
  );
}

function AspectLinkGlyph({ active = false }: { active?: boolean }) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      width={16}
      height={16}
      viewBox="9 9 6 6"
      className="absolute left-1 top-1 transition-opacity duration-150"
      style={{ opacity: active ? 1 : 0.4 }}
      aria-hidden
    >
      <path
        d="M12.794 13.375H13.195C13.998 13.375 14.656 12.758 14.656 12 14.656 11.245 14 10.625 13.195 10.625H12.794"
        fill="none"
        stroke="#FFFFFF"
        strokeWidth="0.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path
        d="M11.204 10.625H10.805C10 10.625 9.344 11.242 9.344 12 9.344 12.755 10 13.375 10.805 13.375H11.204"
        fill="none"
        stroke="#FFFFFF"
        strokeWidth="0.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path
        d="M10.938 12H13.063"
        fill="none"
        stroke="#FFFFFF"
        strokeWidth="0.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

const DIM_SURFACE = "#252525";

/**
 * Paper 91X-0 — horizontal gooey neck between linked dim pills.
 * Path is drawn for a vertical bridge; rotated 90° for side-by-side join.
 */
function DimGooeyNeck() {
  return (
    <div
      aria-hidden
      className="flex h-[18px] w-2 shrink-0 flex-col items-center justify-center"
    >
      <svg
        viewBox="118 129 10 8"
        width={10}
        height={8}
        xmlns="http://www.w3.org/2000/svg"
        className="shrink-0 origin-center rotate-90"
      >
        <path
          fillRule="evenodd"
          d="M118 137C123.137 135.498 123.275 130.643 118 129C118.695 129 123.926 129 128 129C122.956 130.939 123.021 135.038 128 137C126.985 137 121.822 137 118 137Z"
          fill={DIM_SURFACE}
        />
      </svg>
    </div>
  );
}

/**
 * W · link · H — Paper 22U-0 / 91X-0.
 * Linked = three pills end-to-end with Paper gooey necks.
 * Unlinked = separate pills with an 8px gap.
 */
function GooeyLinkedDims({
  linked,
  width,
  height,
  onWidth,
  onHeight,
  onToggleLink,
}: {
  linked: boolean;
  width: number;
  height: number;
  onWidth: (n: number) => void;
  onHeight: (n: number) => void;
  onToggleLink: () => void;
}) {
  // Paper: 8px inset left/right on the value fields.
  const fieldClass =
    "absolute inset-0 w-full bg-transparent px-2 text-right text-sm leading-[18px] text-white outline-none [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none";

  const widthField = (
    <label
      className="relative h-6 w-24 shrink-0 overflow-clip rounded-lg"
      style={{ backgroundColor: DIM_SURFACE, fontFamily: PAPER.fontMono }}
    >
      <span className="pointer-events-none absolute left-2 top-[3px] text-sm leading-[18px] text-white opacity-[0.23]">
        W
      </span>
      <input
        type="number"
        aria-label="Width"
        value={width}
        onChange={(e) => onWidth(Number(e.target.value) || 64)}
        onKeyDown={(e) => e.stopPropagation()}
        className={fieldClass}
      />
    </label>
  );

  const heightField = (
    <label
      className="relative h-6 w-24 shrink-0 overflow-clip rounded-lg"
      style={{ backgroundColor: DIM_SURFACE, fontFamily: PAPER.fontMono }}
    >
      <span className="pointer-events-none absolute left-2 top-[3px] text-sm leading-[18px] text-white opacity-[0.23]">
        H
      </span>
      <input
        type="number"
        aria-label="Height"
        value={height}
        onChange={(e) => onHeight(Number(e.target.value) || 64)}
        onKeyDown={(e) => e.stopPropagation()}
        className={fieldClass}
      />
    </label>
  );

  const linkBtn = (
    <button
      type="button"
      aria-label={linked ? "Unlock aspect ratio" : "Lock aspect ratio"}
      aria-pressed={linked}
      onClick={onToggleLink}
      className="relative h-6 w-6 shrink-0 overflow-clip rounded-lg outline-none"
      style={{ backgroundColor: DIM_SURFACE }}
    >
      <AspectLinkGlyph active={linked} />
    </button>
  );

  if (linked) {
    return (
      <div className="inline-flex items-center">
        {widthField}
        <DimGooeyNeck />
        {linkBtn}
        <DimGooeyNeck />
        {heightField}
      </div>
    );
  }

  return (
    <div className="inline-flex items-center gap-2">
      {widthField}
      {linkBtn}
      {heightField}
    </div>
  );
}

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

/** Paper On/Off segmented control — fluid Tabs used as a switch (9Y8-0). */
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

function InfoDot() {
  return (
    <Tooltip content="Boil lines make the lines shaky and jittery" side="top">
      <button
        type="button"
        aria-label="Boil lines make the lines shaky and jittery"
        className="inline-flex size-3 shrink-0 items-center justify-center opacity-60 hover:opacity-100"
      >
        <svg
          xmlns="http://www.w3.org/2000/svg"
          width={12}
          height={12}
          viewBox="0 0 4.5 4.5"
          aria-hidden
        >
          <g transform="scale(1.333)">
            <path
              d="M1.688 3.047C2.438 3.047 3.047 2.438 3.047 1.688 3.047 0.937 2.438 0.328 1.688 0.328 0.937 0.328 0.328 0.937 0.328 1.688 0.328 2.438 0.937 3.047 1.688 3.047Z"
              fill="none"
              stroke={PAPER.icon}
              strokeWidth="0.2"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
            <path
              d="M1.688 2.391V1.734C1.688 1.683 1.646 1.641 1.594 1.641H1.453"
              fill="none"
              stroke={PAPER.icon}
              strokeWidth="0.2"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
            <path
              d="M1.688 1.266C1.584 1.266 1.5 1.181 1.5 1.078 1.5 0.975 1.584 0.891 1.688 0.891 1.791 0.891 1.875 0.975 1.875 1.078 1.875 1.181 1.791 1.266 1.688 1.266Z"
              fill={PAPER.icon}
            />
          </g>
        </svg>
      </button>
    </Tooltip>
  );
}

const BOIL_PROPS: {
  key: keyof BoilSettings;
  label: string;
  min: number;
  max: number;
  step: number;
  formatValue: (v: number) => string;
}[] = [
  {
    key: "amplitude",
    label: "Amplitude",
    min: 0,
    max: 2,
    step: 0.01,
    formatValue: (v) => v.toFixed(2),
  },
  {
    key: "jitter",
    label: "Jitter",
    min: 0,
    max: 1,
    step: 0.01,
    formatValue: (v) => v.toFixed(2),
  },
  {
    key: "intensity",
    label: "Intensity",
    min: 0,
    max: 1,
    step: 0.01,
    formatValue: (v) => v.toFixed(2),
  },
  {
    key: "speed",
    label: "Speed",
    min: 0.25,
    max: 3,
    step: 0.05,
    formatValue: (v) => v.toFixed(2),
  },
  {
    key: "variety",
    label: "Variety",
    min: 2,
    max: 8,
    step: 1,
    formatValue: (v) => String(Math.round(v)),
  },
];

/** Expanded brush settings — Paper 9XO-0. */
function BrushExpandedPanel({
  color,
  size,
  jitterByDefault,
  boil,
  showColor = true,
  onColor,
  onSize,
  onJitter,
  onBoil,
  onBoilCommit,
}: {
  color: string;
  size: number;
  jitterByDefault: boolean;
  boil: BoilSettings;
  showColor?: boolean;
  onColor: (c: string) => void;
  onSize: (n: number) => void;
  onJitter: (v: boolean) => void;
  onBoil: (patch: Partial<BoilSettings>) => void;
  onBoilCommit?: (patch: Partial<BoilSettings>) => void;
}) {
  const [hex, setHex] = useState(() => hexDigits(color));

  useEffect(() => {
    setHex(hexDigits(color));
  }, [color]);

  function commitHex(raw: string) {
    const digits = hexDigits(raw);
    setHex(digits);
    if (/^[0-9A-F]{6}$/.test(digits)) onColor(`#${digits}`);
  }

  return (
    <div
      className="flex w-[293px] flex-col items-stretch gap-4 overflow-visible rounded-xl p-4 antialiased"
      style={{ fontFamily: PAPER.fontSans }}
    >
      <div className="flex items-start gap-4">
        {showColor && (
          <div className="flex items-start gap-2">
            <ColorPickerPopover
              value={color}
              onValueChange={onColor}
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
        )}

        <SliderComfortable
          label="Size"
          variant="scrubber"
          value={size}
          onChange={onSize}
          min={1}
          max={40}
          step={1}
          fillColor="#40608E"
          className="!h-6 !min-w-0 !flex-1 !rounded-lg !border-0 !bg-[#252525] [&_span]:!font-mono [&_span]:!text-sm"
        />
      </div>

      <div
        className="flex w-full items-center justify-between gap-4 rounded-lg p-2"
        style={{ backgroundColor: "#252525" }}
      >
        <div className="flex items-center gap-1">
          <span
            className="w-fit shrink-0 text-xs leading-4 text-white opacity-80"
            style={{ fontFamily: PAPER.fontMono }}
          >
            Boil Lines
          </span>
          <InfoDot />
        </div>
        <OnOffTabs
          id="Boil lines"
          checked={jitterByDefault}
          onChange={(next) => {
            if (next !== jitterByDefault) onJitter(next);
          }}
        />
      </div>

      {jitterByDefault && (
        <div className="flex w-full flex-col gap-2">
          {BOIL_PROPS.map((p) => (
            <BgLabeledScrubber
              key={p.key}
              label={p.label}
              value={boil[p.key]}
              onChange={(v) => onBoil({ [p.key]: v })}
              onValueCommit={(v) => onBoilCommit?.({ [p.key]: v })}
              min={p.min}
              max={p.max}
              step={p.step}
              formatValue={p.formatValue}
              labelClassName="!w-[76px]"
            />
          ))}
        </div>
      )}
    </div>
  );
}

const FONT_LIST_LIMIT = 80;

/** Expanded text settings — Paper 9ZQ-0 (color + size + searchable fonts). */
function TextExpandedPanel({
  color,
  size,
  fontFamily,
  onColor,
  onSize,
  onFontFamily,
}: {
  color: string;
  size: number;
  fontFamily: string;
  onColor: (c: string) => void;
  onSize: (n: number) => void;
  onFontFamily: (f: string) => void;
}) {
  const [hex, setHex] = useState(() => hexDigits(color));
  const [query, setQuery] = useState("");
  const [googleFamilies, setGoogleFamilies] = useState<string[]>([]);

  useEffect(() => {
    setHex(hexDigits(color));
  }, [color]);

  useEffect(() => {
    let cancelled = false;
    void listGoogleFontFamilies().then((families) => {
      if (!cancelled) setGoogleFamilies(families);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    ensureFontLoaded(fontFamily);
  }, [fontFamily]);

  const fonts = useMemo(() => {
    const q = query.trim().toLowerCase();
    const local = LOCAL_TEXT_FONTS.map((f) => f.id);
    const google = googleFamilies.filter((f) => !local.includes(f));
    const all = [...local, ...google];
    const filtered = q
      ? all.filter((f) => f.toLowerCase().includes(q))
      : all;
    // Keep the active face visible even if it's past the popularity cutoff.
    const limited = filtered.slice(0, FONT_LIST_LIMIT);
    if (
      fontFamily &&
      !limited.includes(fontFamily) &&
      all.includes(fontFamily)
    ) {
      return [fontFamily, ...limited.filter((f) => f !== fontFamily)];
    }
    return limited;
  }, [googleFamilies, query, fontFamily]);

  // Prefetch CSS for the rows currently on screen so previews paint.
  useEffect(() => {
    for (const id of fonts.slice(0, 24)) ensureFontLoaded(id);
  }, [fonts]);

  function commitHex(raw: string) {
    const digits = hexDigits(raw);
    setHex(digits);
    if (/^[0-9A-F]{6}$/.test(digits)) onColor(`#${digits}`);
  }

  return (
    <div
      className="flex w-[293px] flex-col items-start gap-3 overflow-clip rounded-xl p-4 antialiased"
      style={{ fontFamily: PAPER.fontSans }}
    >
      <div className="flex items-start gap-4">
        <div className="flex items-start gap-2">
          <ColorPickerPopover
            value={color}
            onValueChange={onColor}
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
          label="Size"
          variant="scrubber"
          value={size}
          onChange={onSize}
          min={1}
          max={128}
          step={1}
          fillColor="#40608E"
          className="!h-6 !w-[141px] !rounded-lg !border-0 !bg-[#252525] [&_span]:!font-mono [&_span]:!text-sm"
        />
      </div>

      <div className="flex w-full flex-col gap-2 self-stretch">
        <label
          className="flex h-8 w-full items-center gap-2 rounded-lg bg-[#252525] px-2"
        >
          <FontSearchGlyph />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={(e) => e.stopPropagation()}
            placeholder="Search fonts…"
            aria-label="Search fonts"
            spellCheck={false}
            className="min-w-0 flex-1 bg-transparent text-sm leading-[18px] text-white outline-none placeholder:text-white/35"
          />
        </label>

        <div
          role="listbox"
          aria-label="Fonts"
          className="w-full rounded-lg bg-[#252525]"
          onWheel={(e) => e.stopPropagation()}
        >
          <ScrollArea className="h-[200px] w-full">
            <div className="flex flex-col gap-0.5 p-1">
              {fonts.length === 0 ? (
                <div className="px-2 py-3 text-center text-xs text-white/40">
                  No fonts match
                </div>
              ) : (
                fonts.map((id) => {
                  const active = id === fontFamily;
                  return (
                    <button
                      key={id}
                      type="button"
                      role="option"
                      aria-selected={active}
                      onMouseEnter={() => ensureFontLoaded(id)}
                      onClick={() => onFontFamily(id)}
                      className={cn(
                        "flex h-8 w-full shrink-0 items-center rounded-md px-2 text-left text-sm outline-none transition-colors",
                        active
                          ? "bg-[#313131] text-white"
                          : "text-white/70 hover:bg-[#2a2a2a] hover:text-white",
                      )}
                      style={{ fontFamily: textFontStack(id) }}
                    >
                      <span className="min-w-0 flex-1 truncate">{id}</span>
                      {active ? <FontCheckGlyph /> : null}
                    </button>
                  );
                })
              )}
            </div>
          </ScrollArea>
        </div>
      </div>
    </div>
  );
}

function FontSearchGlyph() {
  return (
    <svg width={14} height={14} viewBox="0 0 16 16" aria-hidden className="shrink-0 opacity-40">
      <circle cx="6.5" cy="6.5" r="4.5" fill="none" stroke="currentColor" strokeWidth="1.25" />
      <path d="M10 10l3.5 3.5" fill="none" stroke="currentColor" strokeWidth="1.25" strokeLinecap="round" />
    </svg>
  );
}

function FontCheckGlyph() {
  return (
    <svg width={14} height={14} viewBox="0 0 16 16" aria-hidden className="shrink-0 opacity-80">
      <path
        d="M3.5 8.5l3 3 6-7"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function BrushSizeGlyph() {
  return (
    <svg width={18} height={18} viewBox="-0.75 -0.75 6.75 6.75" style={{ opacity: 0.7 }}>
      <g transform="scale(1.333)">
        <path
          d="M1.517 0.606C0.374 1.462 0.389 2.097 0.175 2.343C0.102 2.427 -0.029 2.424 -0.108 2.348C-0.186 2.271 -0.356 1.728 0 1.167C0.238 0.791 0.484 0.431 1.201 0.092C1.784 -0.182 2.323 -0.122 2.689 0.243C3.086 0.638 2.641 1.147 2.058 1.922C1.988 2.015 1.911 2.108 1.85 2.188C1.492 2.655 1.412 2.759 1.474 2.829C1.535 2.899 1.657 2.851 2.173 2.371C2.689 1.89 2.871 1.85 3.182 1.837C3.298 1.831 3.399 1.87 3.48 1.944C3.781 2.225 3.515 2.704 3.355 2.99C3.336 3.025 3.317 3.057 3.303 3.085L3.276 3.137C3.22 3.241 3.135 3.45 3.178 3.51C3.271 3.6 3.369 3.607 3.569 3.411C3.648 3.334 3.734 3.176 3.766 3.193C3.863 3.246 3.765 3.385 3.692 3.507C3.655 3.571 3.498 3.816 3.218 3.837C3.206 3.838 3.195 3.838 3.185 3.838L3.184 3.839C3.079 3.839 2.967 3.816 2.905 3.73C2.783 3.564 2.881 3.175 2.994 2.961L3.02 2.91C3.036 2.88 3.055 2.845 3.077 2.807C3.323 2.363 3.228 2.259 3.206 2.238C3.193 2.234 3.042 2.214 2.536 2.78C2.255 3.093 1.854 3.394 1.508 3.409C1.376 3.412 1.151 3.386 1.03 3.245C0.773 2.946 0.795 2.54 1.241 1.98C1.425 1.749 1.56 1.573 1.627 1.484C2.021 0.96 2.333 0.519 2.179 0.376C2.061 0.266 1.648 0.507 1.517 0.606Z"
          fill={PAPER.icon}
        />
      </g>
    </svg>
  );
}

function FontChevron() {
  return (
    <svg width={12} height={12} viewBox="0 0 4.5 4.5" aria-hidden>
      <g transform="scale(1.333)">
        <polyline
          points="2.859 1.219 1.687 2.391 0.516 1.219"
          fill="none"
          stroke={PAPER.icon}
          strokeWidth="0.5"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </g>
    </svg>
  );
}

/** Paper 27K-0 — shader preset chips + live preview + elastic prop sliders. */
function ShaderExpandedPanel({
  background,
  onSet,
}: {
  background: Extract<Background, { kind: "shader" }>;
  onSet: (bg: Background) => void;
}) {
  const preset = normalizeShaderPreset(background.preset);
  const defaults = SHADER_DEFAULTS[preset];
  const row1 = SHADER_PRESETS.slice(0, 3);
  const row2 = SHADER_PRESETS.slice(3);

  function setPreset(id: ShaderPresetId) {
    onSet(makeShaderBackground(id));
  }

  function patchParams(key: string, value: number) {
    onSet({
      ...background,
      preset,
      params: { ...defaults.params, ...background.params, [key]: value },
    });
  }

  function setColorAt(index: number, value: string) {
    const colors = [...(background.colors.length ? background.colors : defaults.colors)];
    while (colors.length <= index) colors.push("#ffffff");
    colors[index] = value;
    onSet({ ...background, preset, colors });
  }

  function setNamedColor(key: string, value: string) {
    onSet({
      ...background,
      preset,
      namedColors: { ...defaults.namedColors, ...background.namedColors, [key]: value },
    });
  }

  const namedEntries = Object.keys(defaults.namedColors);

  return (
    <div className="flex w-full flex-col items-start gap-3">
      <div className="flex flex-col items-start gap-2">
        <div className="flex items-start gap-2">
          {row1.map((p) => (
            <Chip
              key={p.id}
              label={p.label}
              active={preset === p.id}
              onClick={() => setPreset(p.id)}
            />
          ))}
        </div>
        <div className="flex items-start gap-2">
          {row2.map((p) => (
            <Chip
              key={p.id}
              label={p.label}
              active={preset === p.id}
              onClick={() => setPreset(p.id)}
            />
          ))}
        </div>
      </div>

      <div className="relative h-[124px] w-full shrink-0 overflow-hidden rounded-lg bg-black">
        <ShaderBackground
          key={preset}
          background={{ ...background, preset }}
        />
      </div>

      <div className="flex w-full flex-wrap items-center gap-1.5">
        {(background.colors.length ? background.colors : defaults.colors).map(
          (c, i) => (
            <ColorPickerPopover
              key={`c-${i}`}
              value={c}
              onValueChange={(v) => setColorAt(i, v)}
              triggerShowValue={false}
              triggerClassName="!size-6 !min-h-6 !min-w-6 !justify-center !gap-0 !rounded-lg !border !border-white/15 !bg-transparent !p-0 !outline-none"
            />
          ),
        )}
        {namedEntries.map((key) => (
          <ColorPickerPopover
            key={key}
            value={background.namedColors?.[key] ?? defaults.namedColors[key]}
            onValueChange={(v) => setNamedColor(key, v)}
            triggerShowValue={false}
            triggerClassName="!size-6 !min-h-6 !min-w-6 !justify-center !gap-0 !rounded-lg !border !border-white/15 !bg-transparent !p-0 !outline-none"
          />
        ))}
      </div>

      <div className="flex w-full flex-col gap-2">
        <BgLabeledScrubber
          label="Speed"
          value={background.speed}
          onChange={(v) => onSet({ ...background, preset, speed: v })}
          min={0}
          max={2}
          step={0.05}
          formatValue={(v) => v.toFixed(2)}
        />
        {defaults.sliders.map((s) => (
          <BgLabeledScrubber
            key={s.key}
            label={s.label}
            value={paramValue({ ...background, preset }, s.key)}
            onChange={(v) => patchParams(s.key, v)}
            min={s.min}
            max={s.max}
            step={s.step}
            formatValue={(v) =>
              s.step >= 1 ? String(Math.round(v)) : v.toFixed(2)
            }
          />
        ))}
      </div>
    </div>
  );
}

function ImageFitChips({
  value,
  onChange,
}: {
  value: Extract<Background, { kind: "image" }>["fit"];
  onChange: (fit: Extract<Background, { kind: "image" }>["fit"]) => void;
}) {
  return (
    <div className="flex w-full items-center gap-1.5">
      {IMAGE_FIT_OPTIONS.map((o) => (
        <Chip
          key={o.id}
          label={o.label}
          active={value === o.id}
          onClick={() => onChange(o.id)}
          className="min-w-0 flex-1 justify-center px-0"
        />
      ))}
    </div>
  );
}

const POS_HANDLE = 16;
const POS_HANDLE_R = POS_HANDLE / 2;
const POS_HANDLE_COLOR = "#4C8DFF";
/** Spotlight / glow — Prussian blue (kept mid-dark so mid-falloff doesn’t trench). */
const POS_PRUSSIAN = "rgb(22, 70, 110)";
const POS_PRUSSIAN_RGBA = (a: number) => `rgba(22, 70, 110, ${a})`;
const POS_GRID_SPACING = 10;

function clamp01(n: number) {
  return Math.min(1, Math.max(0, n));
}

/** Dot positions matching DotGridSpotlight (centered leftover offset). */
function gridAxis(size: number, spacing: number, inset: number): number[] {
  const offset = (size % spacing) / 2;
  const dots: number[] = [];
  for (let p = offset; p <= size + 0.001; p += spacing) {
    if (p >= inset - 0.001 && p <= size - inset + 0.001) dots.push(p);
  }
  return dots;
}

function nearestDot(value: number, dots: number[]): number {
  if (dots.length === 0) return value;
  let best = dots[0]!;
  let bestD = Math.abs(value - best);
  for (let i = 1; i < dots.length; i++) {
    const d = dots[i]!;
    const dd = Math.abs(value - d);
    if (dd < bestD) {
      best = d;
      bestD = dd;
    }
  }
  return best;
}

/** Map inset pad coords ↔ 0–1 focal point (edges = full travel, handle stays inside). */
function normFromPad(
  px: number,
  py: number,
  w: number,
  h: number,
): { x: number; y: number } {
  const spanX = Math.max(1e-6, w - POS_HANDLE);
  const spanY = Math.max(1e-6, h - POS_HANDLE);
  return {
    x: clamp01((px - POS_HANDLE_R) / spanX),
    y: clamp01((py - POS_HANDLE_R) / spanY),
  };
}

function padFromNorm(
  value: { x: number; y: number },
  w: number,
  h: number,
): { x: number; y: number } {
  const spanX = Math.max(0, w - POS_HANDLE);
  const spanY = Math.max(0, h - POS_HANDLE);
  return {
    x: POS_HANDLE_R + clamp01(value.x) * spanX,
    y: POS_HANDLE_R + clamp01(value.y) * spanY,
  };
}

function snapPadPoint(
  clientX: number,
  clientY: number,
  rect: DOMRect,
): { x: number; y: number; norm: { x: number; y: number } } {
  const w = rect.width;
  const h = rect.height;
  const localX = clientX - rect.left;
  const localY = clientY - rect.top;
  const xs = gridAxis(w, POS_GRID_SPACING, POS_HANDLE_R);
  const ys = gridAxis(h, POS_GRID_SPACING, POS_HANDLE_R);
  const x = nearestDot(localX, xs);
  const y = nearestDot(localY, ys);
  return { x, y, norm: normFromPad(x, y, w, h) };
}

/** Dot-grid pad — drag the handle to set image focal point (realtime). */
function ImagePositionCard({
  value,
  onChange,
}: {
  value: { x: number; y: number };
  onChange: (next: { x: number; y: number }) => void;
}) {
  const trackRef = useRef<HTMLDivElement>(null);
  const dragStartProject = useRef<ReturnType<typeof useProject.getState>["project"] | null>(
    null,
  );
  const [size, setSize] = useState({ w: 0, h: 0 });
  const [local, setLocal] = useState(value);

  useLayoutEffect(() => {
    const el = trackRef.current;
    if (!el) return;
    const measure = () => {
      const r = el.getBoundingClientRect();
      setSize({ w: r.width, h: r.height });
    };
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  useEffect(() => {
    if (dragStartProject.current) return;
    setLocal(value);
  }, [value.x, value.y, value]);

  const handlePx =
    size.w > 0
      ? (() => {
          const raw = padFromNorm(local, size.w, size.h);
          const xs = gridAxis(size.w, POS_GRID_SPACING, POS_HANDLE_R);
          const ys = gridAxis(size.h, POS_GRID_SPACING, POS_HANDLE_R);
          return {
            x: nearestDot(raw.x, xs),
            y: nearestDot(raw.y, ys),
          };
        })()
      : { x: POS_HANDLE_R, y: POS_HANDLE_R };

  const spotlight =
    size.w > 0
      ? { x: handlePx.x / size.w, y: handlePx.y / size.h }
      : local;

  function applyLive(norm: { x: number; y: number }) {
    setLocal(norm);
    const { project, setBackgroundLive } = useProject.getState();
    if (project.background?.kind !== "image") return;
    // Live stage update without undo spam (commit once on pointer up).
    setBackgroundLive({ ...project.background, position: norm });
  }

  function setFromClient(clientX: number, clientY: number) {
    const el = trackRef.current;
    if (!el) return;
    const r = el.getBoundingClientRect();
    if (r.width <= 0 || r.height <= 0) return;
    const snapped = snapPadPoint(clientX, clientY, r);
    applyLive(snapped.norm);
  }

  function endDrag() {
    const start = dragStartProject.current;
    dragStartProject.current = null;
    if (!start) return;
    const { project } = useProject.getState();
    const finalPos =
      project.background?.kind === "image"
        ? (project.background.position ?? local)
        : local;
    const startPos =
      start.background?.kind === "image"
        ? (start.background.position ?? { x: 0.5, y: 0.5 })
        : null;
    if (
      startPos &&
      startPos.x === finalPos.x &&
      startPos.y === finalPos.y
    ) {
      return;
    }
    // Rewind to drag-start, then one undoable commit of the final position.
    useProject.setState({ project: start });
    onChange(finalPos);
  }

  return (
    <div className="flex w-full flex-col gap-1.5">
      <span
        className="text-xs leading-4 text-white/70"
        style={{ fontFamily: PAPER.fontSans }}
      >
        Position
      </span>
      <div
        ref={trackRef}
        className="relative aspect-[4/3] w-full touch-none overflow-hidden rounded-lg bg-[#131313] outline-none"
        style={{ border: `0.4px solid ${PAPER.borderHairline}` }}
        onPointerDown={(e) => {
          e.preventDefault();
          dragStartProject.current = useProject.getState().project;
          try {
            e.currentTarget.setPointerCapture(e.pointerId);
          } catch {
            /* synthetic events */
          }
          setFromClient(e.clientX, e.clientY);
        }}
        onPointerMove={(e) => {
          if (!e.currentTarget.hasPointerCapture(e.pointerId)) return;
          setFromClient(e.clientX, e.clientY);
        }}
        onPointerUp={endDrag}
        onPointerCancel={endDrag}
      >
        <DotGridSpotlight
          trackRef={trackRef}
          spotlight={spotlight}
          spacing={POS_GRID_SPACING}
          baseRadius={1}
          activeRadius={2.6}
          interactionRadius={120}
          dotColor="rgba(255,255,255,0.1)"
          activeDotColor={POS_PRUSSIAN}
          activeMinAlpha={0}
          activeMaxAlpha={0.85}
        />
        {/* Soft under-glow — single smooth falloff (no hard stop / hollow ring). */}
        <div
          className="pointer-events-none absolute z-[1] rounded-full"
          style={{
            width: 180,
            height: 180,
            left: handlePx.x - 90,
            top: handlePx.y - 90,
            background: `radial-gradient(circle, ${POS_PRUSSIAN_RGBA(0.55)} 0%, ${POS_PRUSSIAN_RGBA(0.22)} 40%, ${POS_PRUSSIAN_RGBA(0)} 70%)`,
          }}
        />
        <div
          className="pointer-events-none absolute z-[2] rounded-full"
          style={{
            width: POS_HANDLE,
            height: POS_HANDLE,
            backgroundColor: POS_HANDLE_COLOR,
            left: handlePx.x - POS_HANDLE_R,
            top: handlePx.y - POS_HANDLE_R,
            boxShadow: `0 0 0 1px rgba(255,255,255,0.28) inset, 0 0 36px 10px ${POS_PRUSSIAN_RGBA(0.55)}`,
          }}
        />
      </div>
    </div>
  );
}

const BG_SCRUBBER_CLASS =
  "!h-6 !w-full !rounded-lg !border-0 !bg-[#252525] [&_span]:!font-mono [&_span]:!text-sm";

/** Shared Type chips / Zoom track — same left nudge + width end-to-end. */
const IMAGE_CONTROL_TRACK = "-ml-9 w-[calc(100%+36px)]";

/** Zoom-style row: label outside, scrubber fills the remaining width. */
function BgLabeledScrubber({
  label,
  value,
  onChange,
  onValueCommit,
  min,
  max,
  step,
  formatValue,
  labelClassName,
  scrubberClassName,
  trackClassName,
}: {
  label: string;
  value: number;
  onChange: (v: number) => void;
  onValueCommit?: (v: number) => void;
  min: number;
  max: number;
  step: number;
  formatValue?: (v: number) => string;
  labelClassName?: string;
  scrubberClassName?: string;
  trackClassName?: string;
}) {
  return (
    <div className="flex w-full items-center gap-6">
      <span
        className={cn(
          "w-[72px] shrink-0 truncate text-xs leading-4 text-white/70",
          labelClassName,
        )}
        style={{ fontFamily: PAPER.fontSans }}
        title={label}
      >
        {label}
      </span>
      <div className="min-w-0 flex-1">
        <div className={cn(trackClassName)}>
          <SliderComfortable
            variant="scrubber"
            aria-label={label}
            value={value}
            onChange={onChange}
            onValueCommit={onValueCommit}
            min={min}
            max={max}
            step={step}
            formatValue={formatValue}
            fillColor="#40608E"
            className={cn(BG_SCRUBBER_CLASS, scrubberClassName)}
          />
        </div>
      </div>
    </div>
  );
}

/** Panel outer width = color picker content + p-4 padding — constant across tabs. */
const BG_PANEL_WIDTH = BG_PICKER_WIDTH + 32;

/** Side supporting panel — filter param scrubbers (gooey-linked to the right). */
function ImageFilterPropertiesSidePanel({
  background,
  filterId,
  filterDefaults,
  onPatch,
}: {
  background: Extract<Background, { kind: "image" }>;
  filterId: ImageFilterId;
  filterDefaults: (typeof IMAGE_FILTER_DEFAULTS)[ImageFilterId];
  onPatch: (key: string, value: number) => void;
}) {
  const label =
    IMAGE_FILTER_CHIPS.find((c) => c.id === filterId)?.label ?? "Properties";

  return (
    <div
      className="flex flex-col items-stretch gap-3 rounded-xl p-4 antialiased"
      style={{ width: BG_PANEL_WIDTH, fontFamily: PAPER.fontSans }}
    >
      <div className="w-fit text-xs font-light leading-4 text-white opacity-60">
        Properties
        <span className="text-white/45"> · {label}</span>
      </div>
      <div className="flex w-full flex-col gap-2">
        {filterDefaults.sliders.map((s) => (
          <BgLabeledScrubber
            key={s.key}
            label={s.label}
            value={imageFilterParam(background, s.key)}
            onChange={(v) => onPatch(s.key, v)}
            min={s.min}
            max={s.max}
            step={s.step}
            formatValue={(v) =>
              s.step >= 1 ? String(Math.round(v)) : v.toFixed(2)
            }
          />
        ))}
      </div>
    </div>
  );
}

/** Paper Image tab — empty (Choose + selects) or loaded (filters + preview + sliders). */
function ImageExpandedPanel({
  background,
  onSet,
  onPickFile,
}: {
  background: Extract<Background, { kind: "image" }>;
  onSet: (bg: Background) => void;
  onPickFile: () => void;
}) {
  const hasSrc = !!background.src;
  const filterId =
    background.filter && background.filter in IMAGE_FILTER_DEFAULTS
      ? background.filter
      : undefined;

  function setFilter(id: ImageFilterId | "none") {
    if (id === "none") {
      onSet(clearImageFilter(background));
      return;
    }
    onSet(applyImageFilter(background, id));
  }

  return (
    <div className="flex w-full flex-col items-start gap-3">
      {hasSrc && (
        <div className="flex w-full flex-wrap items-start gap-2">
          {IMAGE_FILTER_CHIPS.map((f) => (
            <Chip
              key={f.id}
              label={f.label}
              active={f.id === "none" ? !filterId : filterId === f.id}
              onClick={() => setFilter(f.id)}
            />
          ))}
        </div>
      )}

      <div
        className={cn(
          "relative w-full shrink-0 overflow-hidden rounded-lg bg-[#1a1a1a]",
          hasSrc ? "h-[160px]" : "flex h-[124px] items-center justify-center",
        )}
      >
        {hasSrc ? (
          filterId ? (
            <ImageFilterBackground
              key={filterId}
              // Panel preview always covers + centers — Type only affects the stage.
              background={{ ...background, fit: "cover" }}
            />
          ) : (
            <img
              src={background.src}
              alt=""
              className="absolute inset-0 size-full object-cover object-center"
              draggable={false}
            />
          )
        ) : (
          <button
            type="button"
            onClick={onPickFile}
            className="rounded-full bg-[#252525] px-3 py-1.5 text-xs leading-4 text-white/80 outline-none hover:bg-[#313131]"
            style={{ fontFamily: PAPER.fontSans }}
          >
            Choose Image…
          </button>
        )}
        {hasSrc && (
          <div className="absolute inset-0 z-[1] flex items-center justify-center">
            <button
              type="button"
              onClick={onPickFile}
              className="rounded-full bg-[#252525] px-3 py-1.5 text-xs leading-4 text-white/80 outline-none hover:bg-[#313131]"
              style={{ fontFamily: PAPER.fontSans }}
            >
              Reupload Image
            </button>
          </div>
        )}
      </div>

      {!hasSrc ? (
        <div className="flex w-full items-center gap-6">
          <span
            className="w-[72px] shrink-0 truncate text-xs leading-4 text-white/70"
            style={{ fontFamily: PAPER.fontSans }}
          >
            Type
          </span>
          <div className="min-w-0 flex-1">
            <div className={IMAGE_CONTROL_TRACK}>
              <ImageFitChips
                value={background.fit}
                onChange={(fit) => {
                  const bg = useProject.getState().project.background;
                  if (bg?.kind !== "image") return;
                  onSet({ ...bg, fit });
                }}
              />
            </div>
          </div>
        </div>
      ) : (
        <div className="flex w-full flex-col gap-3">
          <div className="flex w-full items-center gap-6">
            <span
              className="w-[72px] shrink-0 truncate text-xs leading-4 text-white/70"
              style={{ fontFamily: PAPER.fontSans }}
            >
              Type
            </span>
            <div className="min-w-0 flex-1">
              <div className={IMAGE_CONTROL_TRACK}>
                <ImageFitChips
                  value={background.fit}
                  onChange={(fit) => {
                    // Read from store so a live zoom scrub isn't clobbered by stale props.
                    const bg = useProject.getState().project.background;
                    if (bg?.kind !== "image") return;
                    onSet({ ...bg, fit });
                  }}
                />
              </div>
            </div>
          </div>
          <BgLabeledScrubber
            label="Zoom"
            value={imageZoom(background)}
            onChange={(v) => {
              const bg = useProject.getState().project.background;
              if (bg?.kind !== "image") return;
              useProject.getState().setBackgroundLive({ ...bg, zoom: v });
            }}
            min={0.5}
            max={3}
            step={0.05}
            formatValue={(v) => `${Math.round(v * 100)}%`}
            trackClassName={IMAGE_CONTROL_TRACK}
          />
          <ImagePositionCard
            value={imagePosition(background)}
            onChange={(position) => {
              const bg = useProject.getState().project.background;
              if (bg?.kind !== "image") return;
              onSet({ ...bg, position });
            }}
          />
        </div>
      )}
    </div>
  );
}

/** Paper 272-0 — Canvas Background kind picker (None / Color / Shader / Image). */
function BackgroundExpandedPanel({
  background,
  onSet,
}: {
  background: Background | undefined;
  onSet: (bg: Background) => void;
}) {
  const tab = bgKindTab(background);
  const imageInputRef = useRef<HTMLInputElement>(null);
  const setProjectSettings = useProject((s) => s.setProjectSettings);
  const reduce = useReducedMotion() ?? false;

  function openImagePicker() {
    const input = imageInputRef.current;
    if (!input) return;
    const fit =
      background?.kind === "image" ? background.fit : ("cover" as const);
    const resolution =
      background?.kind === "image"
        ? (background.resolution ?? "auto")
        : "auto";
    input.onchange = () => {
      const file = input.files?.[0];
      if (!file) return;
      const reader = new FileReader();
      reader.onload = async () => {
        const src = String(reader.result);
        // Keep filter when replacing; first pick defaults to Paper (design).
        // Keep filter when replacing; first pick defaults to None (plain image).
        const committed =
          background?.kind === "image" && background.src
            ? { ...background, src }
            : { kind: "image" as const, src, fit, resolution };
        onSet(committed);
        if (resolution === "match") {
          try {
            const img = await loadBackgroundImage(src);
            setProjectSettings({
              width: Math.max(64, Math.min(8192, img.naturalWidth)),
              height: Math.max(64, Math.min(8192, img.naturalHeight)),
            });
          } catch {
            /* ignore */
          }
        }
      };
      reader.readAsDataURL(file);
      input.value = "";
    };
    input.click();
  }

  function pickKind(next: BgKindTab) {
    if (next === "none") {
      onSet({ kind: "none" });
      return;
    }
    if (next === "color") {
      onSet(
        background?.kind === "color" || background?.kind === "gradient"
          ? background
          : BG_COLOR_DEFAULT,
      );
      return;
    }
    if (next === "shader") {
      onSet(background?.kind === "shader" ? background : BG_SHADER_DEFAULT);
      return;
    }
    // Image tab — show empty state; don't force the file dialog.
    if (background?.kind === "image") return;
    onSet(makeEmptyImageBackground("cover"));
  }

  const kinds: { id: BgKindTab; label: string }[] = [
    { id: "none", label: "None" },
    { id: "color", label: "Color" },
    { id: "shader", label: "Shader" },
    { id: "image", label: "Image" },
  ];

  const bodyPanels = (
    <AnimatePresence mode="wait" initial={false}>
      <motion.div
        key={tab}
        initial={reduce ? false : { opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        exit={reduce ? undefined : { opacity: 0, y: -8 }}
        transition={reduce ? { duration: 0 } : SPRING_SWAP}
        className="w-full"
      >
        {tab === "color" && (
          <div className="flex w-full justify-center">
            <GradientColorPicker background={background} onChange={onSet} />
          </div>
        )}
        {tab === "shader" && background?.kind === "shader" && (
          <ShaderExpandedPanel background={background} onSet={onSet} />
        )}
        {tab === "image" && background?.kind === "image" && (
          <ImageExpandedPanel
            background={background}
            onSet={onSet}
            onPickFile={openImagePicker}
          />
        )}
      </motion.div>
    </AnimatePresence>
  );

  return (
    <div
      className="flex flex-col items-stretch gap-4 overflow-visible rounded-xl p-4 antialiased"
      style={{ width: BG_PANEL_WIDTH, fontFamily: PAPER.fontSans }}
    >
      <input
        ref={imageInputRef}
        type="file"
        accept="image/*"
        className="hidden"
        aria-hidden
      />
      <div className="flex w-full flex-col items-stretch gap-3">
        <div className="w-fit text-xs font-light leading-4 text-white opacity-60">
          Canvas Background
        </div>
        <Tabs
          value={tab}
          onValueChange={(v) => pickKind(v as BgKindTab)}
          className="w-full"
        >
          <TabsList
            aria-label="Canvas background kind"
            className={cn(
              "!flex !h-7 !w-full !gap-1 !rounded-lg !bg-[#121212] !p-0.5",
              "!outline !outline-1 !outline-[#292A2A]",
              "[&>div.absolute.pointer-events-none:first-of-type]:!rounded-[7px]",
              "[&>div.absolute.pointer-events-none:first-of-type]:!bg-[#313131]",
            )}
          >
            {kinds.map(({ id, label }) => (
              <TabItem
                key={id}
                value={id}
                label={label}
                className={cn(
                  "!h-6 !min-w-0 !flex-1 !justify-center !gap-0 !rounded-[7px] !px-0",
                  "[&_span]:!font-mono [&_span]:!text-xs [&_span]:!leading-4",
                  "[&_span]:!text-white/80",
                )}
              />
            ))}
          </TabsList>
        </Tabs>

        <div className="w-full">{bodyPanels}</div>
      </div>
    </div>
  );
}

function CanvasExpandedPanel({
  width,
  height,
  onSet,
}: {
  width: number;
  height: number;
  onSet: (patch: { width?: number; height?: number }) => void;
}) {
  const [linked, setLinked] = useState(true);
  const aspect = aspectLabel(width, height);
  const ratio = width / Math.max(1, height);

  const manualRow1 = [
    "Custom",
    "16:9",
    "9:16",
    "4:3",
    "3:4",
  ] as const;
  const manualRow2 = ["1:1", "5:4", "3:2", "21:9"] as const;

  function setWidth(next: number) {
    const w = Math.max(64, next);
    if (linked) {
      onSet({ width: w, height: Math.max(64, Math.round(w / ratio)) });
    } else {
      onSet({ width: w });
    }
  }

  function setHeight(next: number) {
    const h = Math.max(64, next);
    if (linked) {
      onSet({ height: h, width: Math.max(64, Math.round(h * ratio)) });
    } else {
      onSet({ height: h });
    }
  }

  function pickAspect(label: string) {
    if (label === "Custom") return;
    const preset = ASPECT_PRESETS.find((p) => p.label === label);
    if (!preset) return;
    onSet(sizeForAspect(preset.rw, preset.rh, width, height));
  }

  return (
    <div
      className="flex w-max flex-col items-start gap-4 overflow-visible rounded-xl p-4 antialiased"
      style={{ fontFamily: PAPER.fontSans }}
    >
      <div className="flex flex-col items-start gap-3">
        <div
          className="w-fit text-xs font-light leading-4 text-white opacity-60"
          style={{ fontFamily: PAPER.fontSans }}
        >
          Resolution
        </div>
        <div className="flex items-start gap-2">
          {RESOLUTION_PRESETS.map(([label, w, h]) => (
            <Chip
              key={label}
              label={label}
              active={width === w && height === h}
              onClick={() => onSet({ width: w, height: h })}
            />
          ))}
        </div>
      </div>

      <div className="flex flex-col items-start gap-3">
        <div className="w-fit text-xs font-light leading-4 text-white opacity-60">
          Manual
        </div>
        <div className="flex flex-col items-start gap-2">
          <div className="flex items-start gap-2">
            {manualRow1.map((label) => (
              <Chip
                key={label}
                label={label}
                active={
                  label === "Custom" ? aspect === "Custom" : aspect === label
                }
                onClick={() => pickAspect(label)}
              />
            ))}
          </div>
          <div className="flex items-start gap-2">
            {manualRow2.map((label) => (
              <Chip
                key={label}
                label={label}
                active={aspect === label}
                onClick={() => pickAspect(label)}
              />
            ))}
          </div>
        </div>
      </div>

      <GooeyLinkedDims
        linked={linked}
        width={width}
        height={height}
        onWidth={setWidth}
        onHeight={setHeight}
        onToggleLink={() => setLinked((v) => !v)}
      />
    </div>
  );
}

type PanelKind = "brush" | "canvas" | "text" | "background";

/**
 * Paper setting dock (9WZ-0) ↔ expanded settings, joined with gooey melt.
 * Chrome per active tool:
 *   select → aspect + canvas
 *   ink / pencil / fill → color + brush + aspect + canvas
 *   eraser → brush + aspect + canvas
 *   text → font + color + aspect + canvas (panel 9ZQ-0)
 *   hand → hidden
 *   shapes → stroke color + fill color
 */
type DockAnchor = "color" | "brush" | "font" | "canvas" | "background";

export function SettingsDocks() {
  const [open, setOpen] = useState<PanelKind | null>(null);
  const [dockAnchor, setDockAnchor] = useState<DockAnchor>("color");
  const rootRef = useRef<HTMLDivElement>(null);
  const colorAnchorRef = useRef<HTMLButtonElement>(null);
  const brushAnchorRef = useRef<HTMLButtonElement>(null);
  const fontAnchorRef = useRef<HTMLButtonElement>(null);
  const canvasAnchorRef = useRef<HTMLButtonElement>(null);
  const backgroundAnchorRef = useRef<HTMLButtonElement>(null);
  /** Keep last panel type so exit animation doesn't get `panel={null}` mid-close. */
  const latchedKind = useRef<PanelKind>("brush");
  if (open) latchedKind.current = open;

  function openFrom(kind: PanelKind, anchor: DockAnchor) {
    if (open === kind && dockAnchor === anchor) {
      setOpen(null);
      return;
    }
    setDockAnchor(anchor);
    setOpen(kind);
  }

  const anchorRef =
    dockAnchor === "brush"
      ? brushAnchorRef
      : dockAnchor === "font"
        ? fontAnchorRef
        : dockAnchor === "canvas"
          ? canvasAnchorRef
          : dockAnchor === "background"
            ? backgroundAnchorRef
            : colorAnchorRef;

  const tool = useTools((s) => s.tool);
  const color = useTools((s) => s.color);
  const fillColor = useTools((s) => s.fillColor);
  const size = useTools((s) => s.size);
  const fontFamily = useTools((s) => s.fontFamily);
  const jitterByDefault = useTools((s) => s.jitterByDefault);
  const setColor = useTools((s) => s.setColor);
  const setFillColor = useTools((s) => s.setFillColor);
  const setSize = useTools((s) => s.setSize);
  const setFontFamily = useTools((s) => s.setFontFamily);
  const toggleJitterByDefault = useTools((s) => s.toggleJitterByDefault);
  const project = useProject((s) => s.project);
  const setProjectSettings = useProject((s) => s.setProjectSettings);
  const setBoilLive = useProject((s) => s.setBoilLive);
  const boil = resolveBoil(project.boil);
  const aspect = aspectLabel(project.width, project.height);

  const shapesMode = tool === "shapes" || isShapeTool(tool);
  const hideDock = tool === "hand";
  const showBrush =
    tool === "ink" ||
    tool === "pen" ||
    tool === "marker" ||
    tool === "fill" ||
    tool === "eraser";
  const showColor =
    tool === "ink" ||
    tool === "pen" ||
    tool === "marker" ||
    tool === "fill" ||
    tool === "text" ||
    shapesMode;
  const showFont = tool === "text";
  const showFillColor = shapesMode;
  const showCanvas =
    tool === "select" ||
    tool === "path" ||
    tool === "ink" ||
    tool === "pen" ||
    tool === "marker" ||
    tool === "fill" ||
    tool === "eraser" ||
    tool === "text";

  useEffect(() => {
    if (!open) return;
    function onDown(e: MouseEvent) {
      const t = e.target as HTMLElement;
      if (rootRef.current?.contains(t)) return;
      // Color picker / menus portal outside the dock — don't collapse on them.
      if (
        t.closest(
          "[data-base-ui-portal],[data-radix-popper-content-wrapper],[role='dialog'],[role='listbox'],[data-slot='select-content']",
        )
      )
        return;
      setOpen(null);
    }
    window.addEventListener("mousedown", onDown);
    return () => window.removeEventListener("mousedown", onDown);
  }, [open]);

  useEffect(() => {
    if (hideDock) {
      setOpen(null);
      return;
    }
    if (open === "brush" && !showBrush) setOpen(null);
    if ((open === "canvas" || open === "background") && !showCanvas) {
      setOpen(null);
    }
    if (open === "text" && !showFont) setOpen(null);
  }, [hideDock, open, showBrush, showCanvas, showFont]);

  const kind = open ?? latchedKind.current;

  const imageBg =
    project.background?.kind === "image" ? project.background : undefined;
  const filterId =
    imageBg?.filter && imageBg.filter in IMAGE_FILTER_DEFAULTS
      ? imageBg.filter
      : undefined;
  const filterDefaults = filterId ? IMAGE_FILTER_DEFAULTS[filterId] : null;
  // Side Properties opens with the filter — no extra toggle in the main panel.
  const sideOpen =
    open === "background" && !!filterId && !!filterDefaults;

  const panel = useMemo(() => {
    if (kind === "text") {
      return (
        <TextExpandedPanel
          color={color}
          size={size}
          fontFamily={fontFamily}
          onColor={setColor}
          onSize={setSize}
          onFontFamily={setFontFamily}
        />
      );
    }
    if (kind === "brush") {
      return (
        <BrushExpandedPanel
          color={color}
          size={size}
          jitterByDefault={jitterByDefault}
          boil={boil}
          showColor={tool !== "eraser"}
          onColor={setColor}
          onSize={setSize}
          onJitter={(next) => {
            if (next !== jitterByDefault) toggleJitterByDefault();
          }}
          onBoil={(patch) => setBoilLive(resolveBoil({ ...boil, ...patch }))}
          onBoilCommit={(patch) => setProjectSettings({ boil: resolveBoil({ ...boil, ...patch }) })}
        />
      );
    }
    if (kind === "background") {
      return (
        <BackgroundExpandedPanel
          background={project.background}
          onSet={(bg) => setProjectSettings({ background: bg })}
        />
      );
    }
    return (
      <CanvasExpandedPanel
        width={project.width}
        height={project.height}
        onSet={setProjectSettings}
      />
    );
  }, [
    kind,
    color,
    size,
    fontFamily,
    jitterByDefault,
    boil,
    tool,
    setColor,
    setSize,
    setFontFamily,
    toggleJitterByDefault,
    setBoilLive,
    project.width,
    project.height,
    project.background,
    setProjectSettings,
  ]);

  const sidePanel = useMemo(() => {
    if (!imageBg || !filterId || !filterDefaults) return null;
    return (
      <ImageFilterPropertiesSidePanel
        background={imageBg}
        filterId={filterId}
        filterDefaults={filterDefaults}
        onPatch={(key, value) => {
          const bg = useProject.getState().project.background;
          if (bg?.kind !== "image") return;
          setProjectSettings({
            background: {
              ...bg,
              filterParams: {
                ...filterDefaults.params,
                ...bg.filterParams,
                [key]: value,
              },
            },
          });
        }}
      />
    );
  }, [imageBg, filterId, filterDefaults, setProjectSettings]);

  if (hideDock) return null;

  const colorOpens: PanelKind = showFont ? "text" : "brush";
  const needsLeadSep =
    showCanvas && (showColor || showBrush || showFont || showFillColor);

  return (
    <div ref={rootRef}>
      <GooeyConjoined
        open={open !== null}
        panelKey={kind}
        panel={panel}
        sideOpen={sideOpen}
        sidePanel={sidePanel}
        sidePanelKey={filterId ?? "side"}
        anchorRef={anchorRef}
        side="top"
        gap={8}
        sideGap={8}
        surface={PAPER.surface}
        panelClassName={cn(
          "rounded-xl",
          kind === "background" ? "overflow-visible" : "overflow-hidden",
        )}
        sidePanelClassName="overflow-visible"
      >
        <PaperDockBar variant="setting">
          {shapesMode ? (
            <>
              <ColorPickerPopover
                value={color}
                onValueChange={setColor}
                triggerShowValue={false}
                triggerClassName="!size-[18px] !min-h-[18px] !min-w-[18px] !justify-center !gap-0 !rounded-md !border-0 !bg-transparent !p-0 !outline-none"
              />
              <span className="size-1 shrink-0 rounded-full bg-[#DDDDDD26]" aria-hidden />
              <ColorPickerPopover
                value={fillColor}
                onValueChange={setFillColor}
                triggerShowValue={false}
                triggerClassName="!size-[18px] !min-h-[18px] !min-w-[18px] !justify-center !gap-0 !rounded-md !border-0 !bg-transparent !p-0 !outline-none"
              />
            </>
          ) : (
            <>
              {showFont && (
                <button
                  ref={fontAnchorRef}
                  type="button"
                  onClick={() => openFrom("text", "font")}
                  className={cn(
                    // Fixed label width (longest face: "Playfair Display") so
                    // swapping fonts doesn't resize the setting dock.
                    "flex h-8 w-[11.5rem] shrink-0 items-center gap-1.5 rounded-lg px-2 outline-none transition-colors",
                    "hover:bg-[#313131]",
                    open === "text" && "bg-[#313131]",
                  )}
                  aria-expanded={open === "text"}
                  aria-label="Font"
                  style={{ fontFamily: textFontStack(fontFamily) }}
                >
                  <span className="min-w-0 flex-1 truncate text-left text-sm leading-[18px] text-white opacity-80">
                    {fontFamily}
                  </span>
                  <FontChevron />
                </button>
              )}

              {showColor && (
                <button
                  ref={colorAnchorRef}
                  type="button"
                  onClick={() => openFrom(colorOpens, "color")}
                  className="flex items-center gap-3 outline-none"
                  aria-expanded={open === colorOpens}
                  aria-label="Color"
                >
                  <span
                    className="size-[18px] shrink-0 rounded-md"
                    style={{ backgroundColor: color }}
                    aria-hidden
                  />
                  {showBrush && (
                    <span className="size-1 shrink-0 rounded-full bg-[#DDDDDD26]" aria-hidden />
                  )}
                </button>
              )}

              {showBrush && (
                <button
                  ref={brushAnchorRef}
                  type="button"
                  onClick={() => openFrom("brush", "brush")}
                  className={cn(
                    // Shared chip height so brush / aspect / background align.
                    "flex h-[26px] shrink-0 items-center gap-2 rounded-[12px] px-2 outline-none transition-colors",
                    "hover:bg-[#313131]",
                    open === "brush" && "bg-[#313131]",
                  )}
                  aria-expanded={open === "brush"}
                  aria-label="Brush settings"
                >
                  <BrushSizeGlyph />
                  <span
                    className="inline-block w-[2ch] tabular-nums"
                    style={CHIP_LABEL_STYLE}
                  >
                    {size}
                  </span>
                </button>
              )}
            </>
          )}

          {needsLeadSep && <PaperDockSep />}

          {showCanvas && (
            <>
              <button
                ref={canvasAnchorRef}
                type="button"
                onClick={() => openFrom("canvas", "canvas")}
                className={cn(
                  "flex h-[26px] shrink-0 items-center rounded-[12px] px-2 outline-none transition-colors",
                  "hover:bg-[#313131]",
                  open === "canvas" && "bg-[#313131]",
                )}
                aria-expanded={open === "canvas"}
              >
                <span style={CHIP_LABEL_STYLE}>{aspect}</span>
              </button>

              <PaperDockSep />

              <button
                ref={backgroundAnchorRef}
                type="button"
                onClick={() => openFrom("background", "background")}
                className={cn(
                  "flex h-[26px] shrink-0 items-center gap-2.5 rounded-[12px] py-0 pl-2 pr-2 outline-none transition-colors",
                  "hover:bg-[#313131]",
                  open === "background" && "bg-[#313131]",
                )}
                aria-expanded={open === "background"}
                aria-label="Background settings"
              >
                <span
                  className="size-[18px] shrink-0 rounded-full border border-white/15"
                  style={backgroundChipStyle(project.background)}
                  aria-hidden
                />
                <span style={CHIP_LABEL_STYLE}>background</span>
              </button>
            </>
          )}
        </PaperDockBar>
      </GooeyConjoined>
    </div>
  );
}
