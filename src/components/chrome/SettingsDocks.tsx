import {
  useEffect,
  useId,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type ReactNode,
} from "react";
import { Check, ChevronDown, X } from "reicon-react";
import { ColorPickerPopover } from "@/components/ui/color-picker";
import { PATH_MAKER_ENABLED } from "@/lib/mvpFlags";
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
import { PathMakerGlyph, PathMakerPanel } from "@/components/chrome/PathMakerPanel";
import { GooeyConjoined } from "@/components/motion/gooey-conjoined";
import { Tooltip } from "@/components/motion/tooltip";
import { PAPER } from "@/components/chrome/paper-tokens";
import { ScrollArea } from "@/components/ui/scroll-area";
import { useTools, isShapeTool, DRAW_BRUSHES, brushesForKind, type DrawBrushKind, type P5BrushId } from "@/state/tools";
import { useProject } from "@/state/project";
import { useSelection } from "@/state/selection";
import {
  resolveCel,
  type Background,
  type BoilSettings,
  type BrushKind,
  type ImageFilterId,
  type ShaderPresetId,
  type Stroke,
  type TextAlign,
  type TextBlendMode,
  type TextCase,
  type TextPathSettings,
  type TextShadow,
  type StrokeClip,
} from "@/model/types";
import { resolveBoil } from "@/engine/boil";
import { typewriterDurationMs } from "@/engine/strokeProgress";
import { measureTextBox } from "@/engine/textGeometry";
import { rebuildRectPointsFromStroke } from "@/engine/shapeGeometry";
import { shapeBoxFromStroke } from "@/components/stage/leaferBridge";
import { cn } from "@/lib/utils";
import {
  AdvancedPanel,
  AlignPanel,
  BackgroundPanel,
  OpacityPanel,
  PathPanel,
  PositionPanel,
  ShadowPanel,
  SizePanel,
  TextDockChips,
  TextFontPanel,
  TypewriterPanel,
  type TextDockAnchor,
  type TextPanelKind,
} from "@/components/chrome/TextSettingsChrome";
import {
  BrushToolIcon,
  PenToolIcon,
  MarkerToolIcon,
} from "@/assets/icons/tools/tool-icons";
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
function DimNumberInput({
  label,
  value,
  onCommit,
  min = 64,
  max = 8192,
  disabled,
  widthClass = "w-24 shrink-0",
  step = 1,
  shiftStep = 10,
}: {
  label: string;
  value: number;
  onCommit: (n: number) => void;
  min?: number;
  max?: number;
  disabled?: boolean;
  widthClass?: string;
  step?: number;
  shiftStep?: number;
}) {
  const [draft, setDraft] = useState<string | null>(null);
  const focused = draft !== null;
  const display = focused ? draft : String(Math.round(value));

  function commit(raw: string) {
    const n = Number(raw);
    if (!Number.isFinite(n)) {
      setDraft(null);
      return;
    }
    onCommit(Math.min(max, Math.max(min, Math.round(n))));
    setDraft(null);
  }

  function nudge(dir: 1 | -1, shift: boolean) {
    const base = shift ? shiftStep : step;
    const cur = Number(draft ?? display);
    const baseVal = Number.isFinite(cur) ? cur : value;
    const next = Math.min(max, Math.max(min, Math.round(baseVal + dir * base)));
    setDraft(String(next));
    onCommit(next);
  }

  const fieldClass =
    "absolute inset-0 w-full bg-transparent px-2 text-right text-sm leading-[18px] text-white outline-none disabled:opacity-40 [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none";

  return (
    <label
      className={cn("relative h-6 overflow-clip rounded-lg", widthClass)}
      style={{ backgroundColor: DIM_SURFACE, fontFamily: PAPER.fontMono }}
    >
      <span className="pointer-events-none absolute left-2 top-[3px] text-sm leading-[18px] text-white opacity-[0.23]">
        {label}
      </span>
      <input
        type="text"
        inputMode="numeric"
        aria-label={label}
        value={display}
        disabled={disabled}
        onFocus={() => setDraft(String(Math.round(value)))}
        onChange={(e) => {
          // Allow empty / partial while typing — never clamp mid-keystroke.
          const next = e.target.value.replace(/[^\d]/g, "");
          setDraft(next);
        }}
        onBlur={() => {
          if (draft === null) return;
          commit(draft);
        }}
        onKeyDown={(e) => {
          e.stopPropagation();
          if (e.key === "Enter") {
            e.preventDefault();
            (e.currentTarget as HTMLInputElement).blur();
          } else if (e.key === "Escape") {
            e.preventDefault();
            setDraft(null);
            (e.currentTarget as HTMLInputElement).blur();
          } else if (e.key === "ArrowUp" || e.key === "ArrowDown") {
            e.preventDefault();
            nudge(e.key === "ArrowUp" ? 1 : -1, e.shiftKey);
          }
        }}
        className={fieldClass}
      />
    </label>
  );
}

function GooeyLinkedDims({
  linked,
  width,
  height,
  onWidth,
  onHeight,
  onToggleLink,
  min = 64,
  max = 8192,
  fullWidth = false,
}: {
  linked: boolean;
  width: number;
  height: number;
  onWidth: (n: number) => void;
  onHeight: (n: number) => void;
  onToggleLink: () => void;
  min?: number;
  max?: number;
  /** Stretch W · link · H across the parent row. */
  fullWidth?: boolean;
}) {
  const fieldWidth = fullWidth ? "min-w-0 flex-1" : "w-24 shrink-0";

  const widthField = (
    <DimNumberInput
      label="W"
      value={width}
      onCommit={onWidth}
      min={min}
      max={max}
      widthClass={fieldWidth}
    />
  );

  const heightField = (
    <DimNumberInput
      label="H"
      value={height}
      onCommit={onHeight}
      min={min}
      max={max}
      widthClass={fieldWidth}
    />
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
      <div
        className={cn(
          "items-center",
          fullWidth ? "flex w-full" : "inline-flex",
        )}
      >
        {widthField}
        <DimGooeyNeck />
        {linkBtn}
        <DimGooeyNeck />
        {heightField}
      </div>
    );
  }

  return (
    <div
      className={cn(
        "items-center gap-2",
        fullWidth ? "flex w-full" : "inline-flex",
      )}
    >
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

const BRUSH_PACK_ICONS: Record<DrawBrushKind, ReactNode> = {
  ink: <BrushToolIcon />,
  pen: <PenToolIcon />,
  marker: <MarkerToolIcon />,
};

/** Expanded brush settings — Paper 9XO-0. */
function BrushExpandedPanel({
  color,
  size,
  wavelength,
  corners,
  smoothing,
  /** Effective Boil On/Off — selection jitter, or default for new strokes. */
  boilEnabled,
  boil,
  showColor = true,
  brushKind,
  onBrushKind,
  onColor,
  onSize,
  onWavelength,
  onCorners,
  onSmoothing,
  onJitter,
  onBoil,
  onBoilCommit,
  toolId,
}: {
  color: string;
  size: number;
  wavelength: number;
  corners: number;
  smoothing: number;
  boilEnabled: boolean;
  boil: BoilSettings;
  showColor?: boolean;
  brushKind?: DrawBrushKind;
  onBrushKind?: (b: DrawBrushKind) => void;
  onColor: (c: string) => void;
  onSize: (n: number) => void;
  onWavelength: (n: number) => void;
  onCorners: (n: number) => void;
  onSmoothing: (n: number) => void;
  onJitter: (v: boolean) => void;
  onBoil: (patch: Partial<BoilSettings>) => void;
  onBoilCommit?: (patch: Partial<BoilSettings>) => void;
  toolId?: string;
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
      {brushKind && onBrushKind ? (
        <div className="flex w-full gap-1 rounded-lg bg-[#252525] p-1">
          {DRAW_BRUSHES.map((b) => {
            const selected = brushKind === b.id;
            return (
              <button
                key={b.id}
                type="button"
                onClick={() => onBrushKind(b.id)}
                className={cn(
                  "flex h-8 flex-1 items-center justify-center gap-1.5 rounded-md text-xs outline-none transition-colors",
                  selected
                    ? "bg-[#313131] text-white"
                    : "text-white/60 hover:bg-[#2a2a2a] hover:text-white",
                )}
                aria-pressed={selected}
                aria-label={b.label}
              >
                <span className="grid size-3.5 place-items-center opacity-80 [&_svg]:size-full">
                  {BRUSH_PACK_ICONS[b.id]}
                </span>
                {b.label}
              </button>
            );
          })}
        </div>
      ) : null}

      <div className="flex items-center gap-4">
        {showColor && (
          <div className="flex items-center gap-2">
            <ColorPickerPopover
              value={color}
              onValueChange={onColor}
              triggerShowValue={false}
              triggerClassName="!size-8 !min-h-8 !min-w-8 !justify-center !gap-0 !rounded-lg !border-0 !bg-transparent !p-0 !outline-none"
            />
            <label
              className="flex h-8 items-center gap-1.5 overflow-clip rounded-lg border-[0.4px] border-solid px-2 py-1"
              style={{
                backgroundColor: PAPER.surfaceAlt,
                borderColor: PAPER.borderHairline,
                fontFamily: PAPER.fontMono,
              }}
            >
              <span className="w-3.5 shrink-0 text-center text-xs leading-4 text-white opacity-20">
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
                className="w-14 shrink-0 bg-transparent text-xs leading-4 text-white outline-none"
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
          max={toolId === "text" ? 200 : 40}
          step={1}
          fillColor="#40608E"
          className="!h-6 !min-w-0 !flex-1 !rounded-lg !border-0 !bg-[#252525] [&_span]:!font-mono [&_span]:!text-sm"
        />
      </div>

      <div className="flex w-full flex-col gap-2">
        <BgLabeledScrubber
          label="Wavelength"
          value={wavelength}
          onChange={onWavelength}
          min={2}
          max={48}
          step={1}
          formatValue={(v) => `${Math.round(v)}px`}
          labelClassName="!w-[76px]"
        />
        <BgLabeledScrubber
          label="Corners"
          value={corners}
          onChange={onCorners}
          min={0}
          max={100}
          step={1}
          formatValue={(v) => `${Math.round(v)}%`}
          labelClassName="!w-[76px]"
        />
        <BgLabeledScrubber
          label="Smoothing"
          value={smoothing}
          onChange={onSmoothing}
          min={0}
          max={20}
          step={1}
          formatValue={(v) => `${Math.round(v)}`}
          labelClassName="!w-[76px]"
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
          checked={boilEnabled}
          onChange={(next) => {
            if (next !== boilEnabled) onJitter(next);
          }}
        />
      </div>

      {boilEnabled && (
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

/** Stroke ribbon preview for brush pack presets / dock trigger. */
function BrushStrokePreview({
  brush,
  className,
}: {
  brush: P5BrushId;
  className?: string;
}) {
  const softId = `lao-ab-${useId().replace(/:/g, "")}`;
  const wave =
    "M6 20 C24 10, 40 28, 58 16 C76 6, 92 26, 110 14 C128 4, 144 22, 154 16";
  if (brush === "dots") {
    return (
      <svg viewBox="0 0 160 36" className={cn("h-6 w-full", className)} aria-hidden>
        {Array.from({ length: 28 }, (_, i) => {
          const col = i % 7;
          const row = Math.floor(i / 7);
          return (
            <circle
              key={i}
              cx={16 + col * 21 + (row % 2) * 10.5}
              cy={8 + row * 7}
              r={2.35}
              fill="currentColor"
              opacity={0.8}
            />
          );
        })}
      </svg>
    );
  }
  if (brush === "spray") {
    // Conical spray-paint plume (dense core → sparse soft edges), matches reference.
    const plume = (() => {
      const out: { cx: number; cy: number; r: number; o: number }[] = [];
      let s = 0x9e3779b9;
      const rnd = () => {
        s ^= s << 13;
        s ^= s >>> 17;
        s ^= s << 5;
        return (s >>> 0) / 4294967296;
      };
      for (let i = 0; i < 220; i++) {
        const depth = Math.pow(rnd(), 0.55);
        const g = (rnd() + rnd() + rnd() + rnd() - 2) * 0.5;
        const cone = 0.1 + depth * 0.9;
        const across = g * 14 * cone;
        const edge = Math.min(1, Math.abs(across) / (14 * cone + 0.01));
        if (rnd() < edge * edge * 0.7) continue;
        if (rnd() < depth * depth * 0.3) continue;
        out.push({
          cx: 8 + depth * 145,
          cy: 18 + across,
          r: 0.55 + rnd() * 0.85,
          o: (0.45 + rnd() * 0.5) * (1 - edge * 0.65) * (1 - depth * 0.3),
        });
      }
      return out;
    })();
    return (
      <svg viewBox="0 0 160 36" className={cn("h-6 w-full", className)} aria-hidden>
        {plume.map((p, i) => (
          <circle
            key={i}
            cx={p.cx}
            cy={p.cy}
            r={p.r}
            fill="currentColor"
            opacity={p.o}
          />
        ))}
      </svg>
    );
  }
  if (brush === "airbrush") {
    // Soft neon wave: bright core + wide Gaussian glow (matches pack / reference).
    return (
      <svg
        viewBox="0 0 160 36"
        className={cn("h-6 w-full overflow-visible", className)}
        aria-hidden
      >
        <defs>
          <filter
            id={`${softId}-soft`}
            x="-30%"
            y="-120%"
            width="160%"
            height="340%"
            colorInterpolationFilters="sRGB"
          >
            <feGaussianBlur stdDeviation="3.2" />
          </filter>
          <filter
            id={`${softId}-halo`}
            x="-40%"
            y="-160%"
            width="180%"
            height="420%"
            colorInterpolationFilters="sRGB"
          >
            <feGaussianBlur stdDeviation="5.2" />
          </filter>
        </defs>
        <path
          d={wave}
          fill="none"
          stroke="currentColor"
          strokeWidth={14}
          strokeLinecap="round"
          opacity={0.22}
          filter={`url(#${softId}-halo)`}
        />
        <path
          d={wave}
          fill="none"
          stroke="currentColor"
          strokeWidth={8}
          strokeLinecap="round"
          opacity={0.38}
          filter={`url(#${softId}-soft)`}
        />
        <path
          d={wave}
          fill="none"
          stroke="currentColor"
          strokeWidth={3.6}
          strokeLinecap="round"
          opacity={0.7}
          filter={`url(#${softId}-soft)`}
        />
        <path
          d={wave}
          fill="none"
          stroke="currentColor"
          strokeWidth={1.6}
          strokeLinecap="round"
          opacity={1}
        />
      </svg>
    );
  }
  if (brush === "brush") {
    return (
      <svg viewBox="0 0 160 36" className={cn("h-6 w-full", className)} aria-hidden>
        {[0, 1, 2, 3, 4].map((i) => (
          <path
            key={i}
            d={`M8 ${10 + i * 3} C40 ${8 + i * 3}, 90 ${14 + i * 3}, 152 ${10 + i * 3}`}
            fill="none"
            stroke="currentColor"
            strokeWidth={2 - i * 0.2}
            opacity={0.85 - i * 0.1}
            strokeLinecap="round"
          />
        ))}
      </svg>
    );
  }
  if (brush === "stipple") {
    // Dense irregular flecks (organic cluster — not a lattice)
    return (
      <svg viewBox="0 0 160 36" className={cn("h-6 w-full", className)} aria-hidden>
        {[
          [10, 14, 1.1], [14, 20, 0.7], [18, 12, 1.4], [22, 22, 0.9],
          [26, 16, 1.2], [30, 10, 0.6], [34, 24, 1.0], [38, 15, 1.5],
          [42, 21, 0.8], [46, 11, 1.1], [50, 18, 0.7], [54, 25, 1.3],
          [58, 13, 0.9], [62, 20, 1.2], [66, 9, 0.6], [70, 23, 1.0],
          [74, 16, 1.4], [78, 12, 0.8], [82, 24, 1.1], [86, 17, 0.7],
          [90, 10, 1.3], [94, 21, 0.9], [98, 15, 1.2], [102, 26, 0.6],
          [106, 12, 1.0], [110, 19, 1.4], [114, 14, 0.8], [118, 22, 1.1],
          [122, 11, 0.7], [126, 18, 1.3], [130, 24, 0.9], [134, 13, 1.0],
          [138, 20, 1.2], [142, 16, 0.6], [146, 23, 1.1], [150, 12, 0.8],
          [16, 17, 0.5], [40, 18, 0.5], [64, 17, 0.55], [88, 19, 0.5],
          [112, 16, 0.55], [136, 18, 0.5], [28, 13, 0.45], [52, 22, 0.5],
          [76, 14, 0.45], [100, 20, 0.5], [124, 15, 0.45], [48, 14, 0.6],
        ].map(([cx, cy, r], i) => (
          <circle
            key={i}
            cx={cx}
            cy={cy}
            r={r}
            fill="currentColor"
            opacity={0.45 + (i % 5) * 0.1}
          />
        ))}
      </svg>
    );
  }
  if (brush === "sketchy") {
    // Dry tapered stroke + grit — matches charcoal/sketch reference
    return (
      <svg viewBox="0 0 160 36" className={cn("h-6 w-full", className)} aria-hidden>
        <path
          d="M8 22 C28 10, 50 8, 78 16 C106 24, 130 26, 152 14 L148 20 C128 30, 106 28, 78 22 C52 16, 30 16, 12 26 Z"
          fill="currentColor"
          opacity={0.5}
        />
        <path
          d="M10 20 C32 12, 54 10, 80 17 C108 24, 132 24, 150 15"
          fill="none"
          stroke="currentColor"
          strokeWidth={3.2}
          strokeLinecap="round"
          opacity={0.85}
        />
        {[0, 1, 2].map((i) => (
          <path
            key={i}
            d={`M14 ${17 + i} C40 ${11 + i}, 70 ${15 + i * 0.5}, 100 ${20 - i * 0.4} S140 ${18 + i}, 148 ${16 + i * 0.5}`}
            fill="none"
            stroke="currentColor"
            strokeWidth={1.1 - i * 0.15}
            opacity={0.45 - i * 0.08}
            strokeLinecap="round"
          />
        ))}
        {[
          [20, 14], [36, 24], [52, 12], [70, 26], [88, 11], [106, 25],
          [122, 13], [138, 22], [44, 18], [96, 20], [28, 20], [116, 18],
        ].map(([cx, cy], i) => (
          <circle
            key={`d${i}`}
            cx={cx}
            cy={cy}
            r={0.7 + (i % 3) * 0.35}
            fill="currentColor"
            opacity={0.35}
          />
        ))}
      </svg>
    );
  }
  if (brush === "parallel") {
    return (
      <svg viewBox="0 0 160 36" className={cn("h-6 w-full", className)} aria-hidden>
        <path d="M8 13 C50 6, 100 20, 152 12" fill="none" stroke="currentColor" strokeWidth={1.6} strokeLinecap="round" />
        <path d="M8 23 C50 16, 100 30, 152 22" fill="none" stroke="currentColor" strokeWidth={1.6} strokeLinecap="round" />
      </svg>
    );
  }
  if (brush === "outline") {
    return (
      <svg viewBox="0 0 160 36" className={cn("h-6 w-full", className)} aria-hidden>
        <path
          d="M10 18 C40 6, 80 30, 150 14 L150 24 C80 36, 40 14, 10 26 Z"
          fill="none"
          stroke="currentColor"
          strokeWidth={1.8}
        />
      </svg>
    );
  }
  if (brush === "dashed") {
    return (
      <svg viewBox="0 0 160 36" className={cn("h-6 w-full", className)} aria-hidden>
        <path
          d={wave}
          fill="none"
          stroke="currentColor"
          strokeWidth={4}
          strokeLinecap="butt"
          strokeDasharray="14 10"
        />
      </svg>
    );
  }
  if (brush === "dotted") {
    return (
      <svg viewBox="0 0 160 36" className={cn("h-6 w-full", className)} aria-hidden>
        {Array.from({ length: 12 }, (_, i) => (
          <circle key={i} cx={12 + i * 12} cy={18} r={3.2} fill="currentColor" />
        ))}
      </svg>
    );
  }
  if (brush === "chalk") {
    // Porous chalk band made of flecks — denser so it reads at list size
    return (
      <svg viewBox="0 0 160 36" className={cn("h-6 w-full", className)} aria-hidden>
        {Array.from({ length: 220 }, (_, i) => {
          const t = i / 219;
          const cx = 6 + t * 148 + ((i * 17) % 7) - 3;
          const cy =
            18 +
            Math.sin(t * Math.PI * 2.2) * 5.5 +
            (((i * 13) % 11) - 5) * 0.95;
          const edge = Math.abs((((i * 7) % 11) - 5) / 5);
          return (
            <rect
              key={i}
              x={cx}
              y={cy}
              width={1.6 + (i % 4) * 0.65}
              height={0.9 + (i % 3) * 0.5}
              rx={0.2}
              fill="currentColor"
              opacity={0.4 + (1 - edge) * 0.55 + (i % 5) * 0.04}
              transform={`rotate(${(i * 37) % 80 - 40} ${cx} ${cy})`}
            />
          );
        })}
      </svg>
    );
  }
  if (brush === "ink") {
    return (
      <svg viewBox="0 0 160 36" className={cn("h-6 w-full", className)} aria-hidden>
        {/* translucent bleed */}
        <path
          d="M4 22 C26 6, 48 32, 72 12 C96 -2, 120 30, 156 10 L156 30 C120 42, 96 14, 72 28 C48 42, 26 18, 4 34 Z"
          fill="currentColor"
          opacity={0.18}
        />
        <path
          d="M8 20 C30 8, 50 28, 74 14 C98 2, 122 26, 152 12 L152 26 C122 36, 98 12, 74 22 C50 34, 30 16, 8 28 Z"
          fill="currentColor"
          opacity={0.28}
        />
        {/* opaque core flow */}
        <path
          d="M14 19 C36 11, 54 23, 76 15 C100 7, 124 21, 148 13"
          fill="none"
          stroke="currentColor"
          strokeWidth={4.2}
          strokeLinecap="round"
          opacity={0.95}
        />
        <path
          d="M18 18 C40 12, 58 22, 80 16 C104 10, 126 20, 146 14"
          fill="none"
          stroke="currentColor"
          strokeWidth={1.6}
          strokeLinecap="round"
          opacity={0.55}
        />
        {/* wet edge flecks */}
        <ellipse cx={42} cy={12} rx={3.2} ry={1.6} fill="currentColor" opacity={0.35} transform="rotate(-18 42 12)" />
        <ellipse cx={98} cy={24} rx={2.8} ry={1.4} fill="currentColor" opacity={0.3} transform="rotate(22 98 24)" />
        <circle cx={128} cy={11} r={1.8} fill="currentColor" opacity={0.45} />
      </svg>
    );
  }
  if (brush === "calligraphy") {
    return (
      <svg viewBox="0 0 160 36" className={cn("h-6 w-full", className)} aria-hidden>
        <path
          d="M10 26
             C 28 8, 42 4, 58 14
             C 72 22, 82 30, 98 24
             C 116 16, 130 6, 150 10
             L 146 18
             C 130 14, 118 22, 102 28
             C 84 36, 72 28, 58 20
             C 44 12, 32 14, 16 30 Z"
          fill="currentColor"
        />
      </svg>
    );
  }
  if (brush === "rough") {
    return (
      <svg viewBox="0 0 160 36" className={cn("h-6 w-full", className)} aria-hidden>
        <path
          d="M6 18 L14 10 L22 26 L30 8 L40 28 L50 12 L60 24 L72 8 L84 30 L96 10 L108 26 L120 12 L132 28 L144 10 L154 18"
          fill="none"
          stroke="currentColor"
          strokeWidth={2.2}
          strokeLinejoin="miter"
          strokeLinecap="round"
        />
      </svg>
    );
  }
  if (brush === "pixel") {
    return (
      <svg viewBox="0 0 160 36" className={cn("h-6 w-full", className)} aria-hidden>
        {[
          [8, 16], [16, 16], [24, 8], [32, 8], [40, 16], [48, 24], [56, 24],
          [64, 16], [72, 8], [80, 8], [88, 16], [96, 24], [104, 24], [112, 16],
          [120, 8], [128, 8], [136, 16], [144, 16],
        ].map(([x, y], i) => (
          <rect key={i} x={x} y={y} width={7} height={7} fill="currentColor" />
        ))}
      </svg>
    );
  }
  if (brush === "halftone") {
    return (
      <svg viewBox="0 0 160 36" className={cn("h-6 w-full", className)} aria-hidden>
        {Array.from({ length: 14 }, (_, i) => (
          <circle
            key={i}
            cx={10 + i * 11}
            cy={18}
            r={1.2 + Math.sin(i * 0.7) * 2.2 + 1.5}
            fill="currentColor"
            opacity={0.8}
          />
        ))}
      </svg>
    );
  }
  if (brush === "squares") {
    return (
      <svg viewBox="0 0 160 36" className={cn("h-6 w-full", className)} aria-hidden>
        {Array.from({ length: 11 }, (_, i) => (
          <rect
            key={i}
            x={10 + i * 13}
            y={12 + (i % 2) * 4}
            width={7}
            height={7}
            fill="currentColor"
            opacity={0.85}
          />
        ))}
      </svg>
    );
  }
  // smooth (default)
  return (
    <svg viewBox="0 0 160 36" className={cn("h-6 w-full", className)} aria-hidden>
      <path d={wave} fill="none" stroke="currentColor" strokeWidth={2.4} strokeLinecap="round" />
    </svg>
  );
}

/** Vertical Brushes menu — presets for the active Ink / Pen / Marker mode. */
function BrushPackPanel({
  kind,
  active,
  onPick,
  onClose,
}: {
  kind: DrawBrushKind;
  active: P5BrushId;
  onPick: (brush: P5BrushId) => void;
  onClose: () => void;
}) {
  const brushes = brushesForKind(kind);
  const section =
    kind === "ink" ? "Ink brushes" : kind === "pen" ? "Pen brushes" : "Marker brushes";

  return (
    <div
      className="flex w-[240px] flex-col overflow-hidden rounded-2xl antialiased"
      style={{
        backgroundColor: PAPER.surface,
        fontFamily: PAPER.fontSans,
        boxShadow: "0 12px 40px rgba(0,0,0,0.45)",
      }}
      role="listbox"
      aria-label={`${section}`}
    >
      <div className="flex items-center justify-between gap-3 px-3.5 pb-2.5 pt-3">
        <span className="text-sm font-medium leading-none text-white">Brushes</span>
        <button
          type="button"
          onClick={onClose}
          aria-label="Close brushes"
          className="grid size-6 place-items-center rounded-md text-white/50 outline-none transition-colors hover:bg-[#313131] hover:text-white"
        >
          <X size={14} />
        </button>
      </div>
      <div className="mx-3 h-px bg-white/10" aria-hidden />
      <ScrollArea cap className="max-h-[min(420px,calc(100dvh-240px))] w-full">
        <div className="flex flex-col gap-1 p-2">
          <span className="px-2 pb-1 pt-1 text-[11px] font-medium tracking-wide text-white/55">
            {section}
          </span>
          {brushes.map((b) => {
            const selected = active === b.id;
            return (
              <button
                key={b.id}
                type="button"
                role="option"
                aria-selected={selected}
                onClick={() => onPick(b.id)}
                className={cn(
                  "flex flex-col gap-1.5 rounded-xl px-2.5 py-2 text-left outline-none transition-colors",
                  selected
                    ? "bg-[rgba(61,79,204,0.55)] text-white"
                    : "text-white/90 hover:bg-white/[0.06]",
                )}
              >
                <span className="flex items-center gap-1.5 text-[13px] leading-none">
                  {selected ? (
                    <Check size={14} className="shrink-0 text-white" strokeWidth={2.5} />
                  ) : (
                    <span className="inline-block w-3.5 shrink-0" aria-hidden />
                  )}
                  {b.label}
                </span>
                <span
                  className={cn(
                    "pl-5",
                    selected ? "text-white/90" : "text-white/70",
                  )}
                >
                  <BrushStrokePreview brush={b.id} />
                </span>
              </button>
            );
          })}
        </div>
      </ScrollArea>
    </div>
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
              triggerClassName="!size-8 !min-h-8 !min-w-8 !justify-center !gap-0 !rounded-lg !border !border-white/15 !bg-transparent !p-0 !outline-none"
            />
          ),
        )}
        {namedEntries.map((key) => (
          <ColorPickerPopover
            key={key}
            value={background.namedColors?.[key] ?? defaults.namedColors[key]}
            onValueChange={(v) => setNamedColor(key, v)}
            triggerShowValue={false}
            triggerClassName="!size-8 !min-h-8 !min-w-8 !justify-center !gap-0 !rounded-lg !border !border-white/15 !bg-transparent !p-0 !outline-none"
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

/** Elastic scrubber without track fill — radius / squircle panels. */
const ELASTIC_SCRUBBER_CLASS =
  "!h-6 !w-full !rounded-lg !border-0 !bg-transparent !px-2 [&_span]:!font-mono [&_span]:!text-sm";

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
  onClose,
}: {
  background: Background | undefined;
  onSet: (bg: Background) => void;
  onClose?: () => void;
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
        <div className="flex w-full items-center justify-between gap-3">
          <div className="w-fit text-xs font-light leading-4 text-white opacity-60">
            Canvas Background
          </div>
          {onClose ? (
            <button
              type="button"
              onClick={onClose}
              aria-label="Close background"
              className="grid size-6 place-items-center rounded-md text-white/50 outline-none transition-colors hover:bg-[#313131] hover:text-white"
            >
              <X size={14} />
            </button>
          ) : null}
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
  onClose,
}: {
  width: number;
  height: number;
  onSet: (patch: { width?: number; height?: number }) => void;
  onClose?: () => void;
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
      <div className="flex w-full items-center justify-between gap-3">
        <span className="text-sm font-medium leading-none text-white">{aspect}</span>
        {onClose ? (
          <button
            type="button"
            onClick={onClose}
            aria-label="Close canvas settings"
            className="grid size-6 place-items-center rounded-md text-white/50 outline-none transition-colors hover:bg-[#313131] hover:text-white"
          >
            <X size={14} />
          </button>
        ) : null}
      </div>

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

/** Corner radius + optional squircle smoothing (elastic scrubbers, no track bg). */
function RadiusPanel({
  radius,
  squircle,
  smoothing,
  onRadius,
  onSquircle,
  onSmoothing,
}: {
  radius: number;
  squircle: boolean;
  smoothing: number;
  onRadius: (v: number) => void;
  onSquircle: (v: boolean) => void;
  onSmoothing: (v: number) => void;
}) {
  return (
    <div
      className="flex w-[240px] flex-col gap-3 rounded-xl p-4 antialiased"
      style={{ backgroundColor: PAPER.surface, fontFamily: PAPER.fontSans }}
    >
      <div className="text-xs font-light leading-4 text-white/60">Corner</div>
      <SliderComfortable
        label="Radius"
        variant="scrubber"
        value={radius}
        onChange={onRadius}
        min={0}
        max={120}
        step={1}
        fillColor="#40608E"
        formatValue={(v) => `${Math.round(v)}`}
        className={ELASTIC_SCRUBBER_CLASS}
      />
      <div
        className="flex w-full items-center justify-between gap-4 rounded-lg p-2"
        style={{ backgroundColor: "#252525" }}
      >
        <span className="text-xs leading-4 text-white/80">Squircle</span>
        <OnOffTabs
          id="Squircle"
          checked={squircle}
          onChange={onSquircle}
        />
      </div>
      {squircle ? (
        <SliderComfortable
          label="Smooth"
          variant="scrubber"
          value={Math.round(smoothing * 100)}
          onChange={(v) => onSmoothing(v / 100)}
          min={0}
          max={100}
          step={1}
          fillColor="#40608E"
          formatValue={(v) => `${Math.round(v)}%`}
          className={ELASTIC_SCRUBBER_CLASS}
        />
      ) : null}
    </div>
  );
}

type PanelKind =
  | "brush"
  | "brushes"
  | "canvas"
  | "background"
  | "radius"
  | "image"
  | "motionPath"
  | TextPanelKind;

function CanvasDimField({
  label,
  value,
  onChange,
  disabled,
  widthClass = "w-24 shrink-0",
  step = 1,
  shiftStep = 10,
  altStep = 0.1,
  min,
  max,
}: {
  label: string;
  value: number;
  onChange: (n: number) => void;
  disabled?: boolean;
  widthClass?: string;
  /** ArrowUp/Down step (default 1). */
  step?: number;
  /** Shift+Arrow step (default 10). */
  shiftStep?: number;
  /** Alt+Arrow step (default 0.1). */
  altStep?: number;
  min?: number;
  max?: number;
}) {
  const [draft, setDraft] = useState<string | null>(null);
  const focused = draft !== null;
  const display = focused
    ? draft
    : String(Number.isFinite(value) ? Math.round(value * 100) / 100 : 0);

  function commit(raw: string) {
    const n = Number(raw);
    if (!Number.isFinite(n)) {
      setDraft(null);
      return;
    }
    let next = n;
    if (min != null) next = Math.max(min, next);
    if (max != null) next = Math.min(max, next);
    onChange(next);
    setDraft(null);
  }

  function nudge(dir: 1 | -1, shift: boolean, alt: boolean) {
    const base = alt ? altStep : shift ? shiftStep : step;
    const cur = Number(draft ?? display);
    const baseVal = Number.isFinite(cur) ? cur : value;
    let next = baseVal + dir * base;
    if (min != null) next = Math.max(min, next);
    if (max != null) next = Math.min(max, next);
    next = Math.round(next * 1000) / 1000;
    setDraft(String(next));
    onChange(next);
  }

  const fieldClass =
    "absolute inset-0 w-full bg-transparent px-2 text-right text-sm leading-[18px] text-white outline-none disabled:opacity-40 [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none";

  return (
    <label
      className={cn("relative h-6 overflow-clip rounded-lg", widthClass)}
      style={{ backgroundColor: DIM_SURFACE, fontFamily: PAPER.fontMono }}
    >
      <span className="pointer-events-none absolute left-2 top-[3px] text-sm leading-[18px] text-white opacity-[0.23]">
        {label}
      </span>
      <input
        type="text"
        inputMode="decimal"
        aria-label={label}
        value={display}
        disabled={disabled}
        onFocus={() =>
          setDraft(
            String(Number.isFinite(value) ? Math.round(value * 100) / 100 : 0),
          )
        }
        onChange={(e) => {
          // Allow empty, minus, and one decimal while typing.
          const next = e.target.value.replace(/[^\d.-]/g, "");
          setDraft(next);
        }}
        onBlur={() => {
          if (draft === null) return;
          commit(draft);
        }}
        onKeyDown={(e) => {
          e.stopPropagation();
          if (e.key === "Enter") {
            e.preventDefault();
            (e.currentTarget as HTMLInputElement).blur();
          } else if (e.key === "Escape") {
            e.preventDefault();
            setDraft(null);
            (e.currentTarget as HTMLInputElement).blur();
          } else if (e.key === "ArrowUp" || e.key === "ArrowDown") {
            e.preventDefault();
            nudge(e.key === "ArrowUp" ? 1 : -1, e.shiftKey, e.altKey);
          }
        }}
        className={fieldClass}
      />
    </label>
  );
}

function CanvasImageExpandedPanel({
  image,
  onPatch,
  onClose,
}: {
  image: import("@/model/types").ImageElement;
  onPatch: (patch: Partial<import("@/model/types").ImageElement>) => void;
  onClose: () => void;
}) {
  const rotDeg = Math.round(((image.rotation ?? 0) * 180) / Math.PI);
  const opacityPct = Math.round((image.opacity ?? 1) * 100);
  const linked = image.lockAspect !== false;
  const imageRef = useRef(image);
  imageRef.current = image;
  const onPatchRef = useRef(onPatch);
  onPatchRef.current = onPatch;

  function setWidth(next: number) {
    const w = Math.max(1, next);
    if (linked && image.naturalWidth > 0) {
      const ratio = image.naturalHeight / image.naturalWidth;
      onPatch({ w, h: Math.max(1, w * ratio) });
    } else onPatch({ w });
  }

  function setHeight(next: number) {
    const h = Math.max(1, next);
    if (linked && image.naturalHeight > 0) {
      const ratio = image.naturalWidth / image.naturalHeight;
      onPatch({ h, w: Math.max(1, h * ratio) });
    } else onPatch({ h });
  }

  // Arrow keys nudge position while the Image panel is open (capture so
  // timeline ←/→ frame-step doesn't win). Inputs handle their own arrows.
  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      const target = e.target as HTMLElement | null;
      if (
        target &&
        (target.tagName === "INPUT" ||
          target.tagName === "TEXTAREA" ||
          target.isContentEditable)
      ) {
        return;
      }
      if (e.ctrlKey || e.metaKey || e.altKey) return;

      const step = e.shiftKey ? 10 : 1;
      let dx = 0;
      let dy = 0;
      if (e.key === "ArrowLeft") dx = -step;
      else if (e.key === "ArrowRight") dx = step;
      else if (e.key === "ArrowUp") dy = -step;
      else if (e.key === "ArrowDown") dy = step;
      else return;

      e.preventDefault();
      e.stopPropagation();
      const im = imageRef.current;
      onPatchRef.current({ x: im.x + dx, y: im.y + dy });
    }
    window.addEventListener("keydown", onKeyDown, true);
    return () => window.removeEventListener("keydown", onKeyDown, true);
  }, []);

  return (
    <div
      className="flex w-[280px] flex-col items-start gap-3 overflow-visible rounded-xl p-4 antialiased"
      style={{ fontFamily: PAPER.fontSans }}
      onKeyDown={(e) => e.stopPropagation()}
    >
      <div className="flex w-full items-center justify-between gap-3">
        <span className="text-sm font-medium leading-none text-white">Image</span>
        <button
          type="button"
          onClick={onClose}
          aria-label="Close image settings"
          className="grid size-6 place-items-center rounded-md text-white/50 outline-none transition-colors hover:bg-[#313131] hover:text-white"
        >
          <X size={14} />
        </button>
      </div>

      <div className="flex w-full flex-col items-start gap-2">
        <div className="w-fit text-xs font-light leading-4 text-white opacity-60">
          Position
        </div>
        <div className="flex w-full items-center gap-2">
          <CanvasDimField
            label="X"
            value={image.x}
            widthClass="min-w-0 flex-1"
            onChange={(n) => onPatch({ x: n })}
          />
          <CanvasDimField
            label="Y"
            value={image.y}
            widthClass="min-w-0 flex-1"
            onChange={(n) => onPatch({ y: n })}
          />
        </div>
      </div>

      <div className="flex w-full flex-col items-start gap-2">
        <div className="w-fit text-xs font-light leading-4 text-white opacity-60">
          Size
        </div>
        <GooeyLinkedDims
          fullWidth
          linked={linked}
          width={Math.round(image.w)}
          height={Math.round(image.h)}
          onWidth={setWidth}
          onHeight={setHeight}
          onToggleLink={() => onPatch({ lockAspect: !linked })}
          min={1}
        />
      </div>

      <div className="flex w-full flex-col items-start gap-2">
        <div className="w-fit text-xs font-light leading-4 text-white opacity-60">
          Transform
        </div>
        <CanvasDimField
          label="°"
          value={rotDeg}
          widthClass="w-full"
          step={5}
          shiftStep={15}
          altStep={1}
          onChange={(n) => {
            const snapped = Math.round(n / 5) * 5;
            onPatch({ rotation: (snapped * Math.PI) / 180 });
          }}
        />
      </div>

      <BgLabeledScrubber
        label="Opacity"
        value={opacityPct}
        onChange={(v) => onPatch({ opacity: v / 100 })}
        min={0}
        max={100}
        step={1}
        formatValue={(v) => Math.round(v) + "%"}
      />

      <p className="text-[10px] leading-snug text-white/40">
        {image.naturalWidth}×{image.naturalHeight}px · artboard clips overflow;
        dotted bounds when selected.
      </p>
    </div>
  );
}

/**
 * Paper setting dock (9WZ-0) ↔ expanded settings, joined with gooey melt.
 * Chrome per active tool:
 *   select → aspect + canvas (+ stroke/fill/stroke-size/brush when shapes selected)
 *   ink / pencil / fill → color + brush + aspect + canvas
 *   eraser → brush + aspect + canvas
 *   text → font + aspect + canvas (color lives in font panel)
 *   hand → hidden
 *   shapes → stroke color + fill + stroke size + brush pack
 */
type DockAnchor =
  | "color"
  | "brush"
  | "brushes"
  | "stroke"
  | "radius"
  | "canvas"
  | "background"
  | "image"
  | "motionPath"
  | TextDockAnchor;

export function SettingsDocks() {
  const [open, setOpen] = useState<PanelKind | null>(null);
  const [dockAnchor, setDockAnchor] = useState<DockAnchor>("color");
  const rootRef = useRef<HTMLDivElement>(null);
  const colorAnchorRef = useRef<HTMLButtonElement>(null);
  const brushAnchorRef = useRef<HTMLButtonElement>(null);
  const strokeAnchorRef = useRef<HTMLButtonElement>(null);
  const brushesAnchorRef = useRef<HTMLButtonElement>(null);
  const radiusAnchorRef = useRef<HTMLButtonElement>(null);
  const fontAnchorRef = useRef<HTMLButtonElement>(null);
  const sizeAnchorRef = useRef<HTMLButtonElement>(null);
  const alignAnchorRef = useRef<HTMLButtonElement>(null);
  const advancedAnchorRef = useRef<HTMLButtonElement>(null);
  const typewriterAnchorRef = useRef<HTMLButtonElement>(null);
  const pathAnchorRef = useRef<HTMLButtonElement>(null);
  const shadowAnchorRef = useRef<HTMLButtonElement>(null);
  const opacityAnchorRef = useRef<HTMLButtonElement>(null);
  const positionAnchorRef = useRef<HTMLButtonElement>(null);
  const textBgAnchorRef = useRef<HTMLButtonElement>(null);
  const canvasAnchorRef = useRef<HTMLButtonElement>(null);
  const backgroundAnchorRef = useRef<HTMLButtonElement>(null);
  const imageAnchorRef = useRef<HTMLButtonElement>(null);
  const motionPathAnchorRef = useRef<HTMLButtonElement>(null);
  const measureCtxRef = useRef<CanvasRenderingContext2D | null>(null);
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
      : dockAnchor === "stroke"
        ? strokeAnchorRef
        : dockAnchor === "brushes"
          ? brushesAnchorRef
          : dockAnchor === "radius"
            ? radiusAnchorRef
          : dockAnchor === "font"
            ? fontAnchorRef
            : dockAnchor === "size"
              ? sizeAnchorRef
              : dockAnchor === "align"
                ? alignAnchorRef
                : dockAnchor === "advanced"
                  ? advancedAnchorRef
                  : dockAnchor === "typewriter"
                    ? typewriterAnchorRef
                  : dockAnchor === "path"
                    ? pathAnchorRef
                    : dockAnchor === "shadow"
                      ? shadowAnchorRef
                      : dockAnchor === "opacity"
                        ? opacityAnchorRef
                        : dockAnchor === "position"
                          ? positionAnchorRef
                          : dockAnchor === "textBg"
                            ? textBgAnchorRef
                            : dockAnchor === "canvas"
                              ? canvasAnchorRef
                              : dockAnchor === "background"
                                ? backgroundAnchorRef
                                : dockAnchor === "image"
                                  ? imageAnchorRef
                                  : dockAnchor === "motionPath"
                                    ? motionPathAnchorRef
                                  : colorAnchorRef;

  const tool = useTools((s) => s.tool);
  const color = useTools((s) => s.color);
  const fillColor = useTools((s) => s.fillColor);
  const size = useTools((s) => s.size);
  const brushWavelength = useTools((s) => s.brushWavelength);
  const brushCorners = useTools((s) => s.brushCorners);
  const brushSmoothing = useTools((s) => s.brushSmoothing);
  const lastBrushKind = useTools((s) => s.lastBrushKind);
  const lastP5Brush = useTools((s) => s.lastP5Brush);
  const lastShapeTool = useTools((s) => s.lastShapeTool);
  const cornerRadius = useTools((s) => s.cornerRadius);
  const squircle = useTools((s) => s.squircle);
  const cornerSmoothing = useTools((s) => s.cornerSmoothing);
  const textSize = useTools((s) => s.textSize);
  const fontFamily = useTools((s) => s.fontFamily);
  const textBold = useTools((s) => s.textBold);
  const textItalic = useTools((s) => s.textItalic);
  const textAlign = useTools((s) => s.textAlign);
  const letterSpacing = useTools((s) => s.letterSpacing);
  const textUnderline = useTools((s) => s.textUnderline);
  const textStrikethrough = useTools((s) => s.textStrikethrough);
  const textCase = useTools((s) => s.textCase);
  const textOpacity = useTools((s) => s.textOpacity);
  const textBackgroundColor = useTools((s) => s.textBackgroundColor);
  const textShadow = useTools((s) => s.textShadow);
  const textBlendMode = useTools((s) => s.textBlendMode);
  const textPath = useTools((s) => s.textPath);
  const textTypewriter = useTools((s) => s.textTypewriter);
  const textTypewriterSpeed = useTools((s) => s.textTypewriterSpeed);
  const jitterByDefault = useTools((s) => s.jitterByDefault);
  const setColor = useTools((s) => s.setColor);
  const setFillColor = useTools((s) => s.setFillColor);
  const setSize = useTools((s) => s.setSize);
  const setBrushWavelength = useTools((s) => s.setBrushWavelength);
  const setBrushCorners = useTools((s) => s.setBrushCorners);
  const setBrushSmoothing = useTools((s) => s.setBrushSmoothing);
  const setLastBrushKind = useTools((s) => s.setLastBrushKind);
  const setLastP5Brush = useTools((s) => s.setLastP5Brush);
  const setCornerRadius = useTools((s) => s.setCornerRadius);
  const setSquircle = useTools((s) => s.setSquircle);
  const setCornerSmoothing = useTools((s) => s.setCornerSmoothing);
  const setTextSize = useTools((s) => s.setTextSize);
  const setLetterSpacing = useTools((s) => s.setLetterSpacing);
  const setFontFamily = useTools((s) => s.setFontFamily);
  const setTextBold = useTools((s) => s.setTextBold);
  const setTextItalic = useTools((s) => s.setTextItalic);
  const setTextAlign = useTools((s) => s.setTextAlign);
  const setTextUnderline = useTools((s) => s.setTextUnderline);
  const setTextStrikethrough = useTools((s) => s.setTextStrikethrough);
  const setTextCase = useTools((s) => s.setTextCase);
  const setTextOpacity = useTools((s) => s.setTextOpacity);
  const setTextBackgroundColor = useTools((s) => s.setTextBackgroundColor);
  const setTextShadow = useTools((s) => s.setTextShadow);
  const setTextBlendMode = useTools((s) => s.setTextBlendMode);
  const setTextPath = useTools((s) => s.setTextPath);
  const setTextTypewriter = useTools((s) => s.setTextTypewriter);
  const setTextTypewriterSpeed = useTools((s) => s.setTextTypewriterSpeed);
  const toggleJitterByDefault = useTools((s) => s.toggleJitterByDefault);
  const project = useProject((s) => s.project);
  const layerIndex = useProject((s) => s.layerIndex);
  const frameIndex = useProject((s) => s.frameIndex);
  const clipEasing = useProject((s) => s.clipEasing);
  const setProjectSettings = useProject((s) => s.setProjectSettings);
  const setBoilLive = useProject((s) => s.setBoilLive);
  const updateStrokes = useProject((s) => s.updateStrokes);
  const updateTextElement = useProject((s) => s.updateTextElement);
  const updateImageElement = useProject((s) => s.updateImageElement);
  const removeTextElement = useProject((s) => s.removeTextElement);
  const reorderTextElement = useProject((s) => s.reorderTextElement);
  const duplicateTextElement = useProject((s) => s.duplicateTextElement);
  const setSelection = useSelection((s) => s.set);
  const selIds = useSelection((s) => s.ids);
  const boil = resolveBoil(project.boil);
  const aspect = aspectLabel(project.width, project.height);

  const selectedStrokes = useMemo((): Stroke[] => {
    if (!selIds.length) return [];
    const idSet = new Set(selIds);
    const out: Stroke[] = [];
    const animatron = project.workflow === "animatron";
    for (const layer of project.layers) {
      const cel = animatron
        ? layer.frames.find((f) => f) ?? null
        : resolveCel(layer, frameIndex);
      if (!cel) continue;
      for (const s of cel.strokes) {
        if (idSet.has(s.id)) out.push(s);
      }
    }
    return out;
  }, [selIds, project, frameIndex]);

  const selectedTexts = useMemo(() => {
    if (!selIds.length) return [];
    const layer = project.layers[layerIndex];
    if (!layer) return [];
    const cel =
      project.workflow === "animatron"
        ? layer.frames.find((f) => f) ?? null
        : resolveCel(layer, frameIndex);
    if (!cel?.texts?.length) return [];
    const idSet = new Set(selIds);
    return cel.texts.filter((t) => idSet.has(t.id));
  }, [selIds, project, layerIndex, frameIndex]);

  const selectedImages = useMemo(() => {
    if (!selIds.length) return [];
    const layer = project.layers[layerIndex];
    if (!layer) return [];
    const cel =
      project.workflow === "animatron"
        ? layer.frames.find((f) => f) ?? null
        : resolveCel(layer, frameIndex);
    if (!cel?.images?.length) return [];
    const idSet = new Set(selIds);
    return cel.images.filter((im) => idSet.has(im.id));
  }, [selIds, project, layerIndex, frameIndex]);

  const imageSelectionMode = selectedImages.length > 0;
  const shapesMode = tool === "shapes" || isShapeTool(tool);
  const selectionColorMode =
    (tool === "select" || shapesMode) && selectedStrokes.length > 0;
  const textSelectionMode = selectedTexts.length > 0;
  const showShapeColors = shapesMode || selectionColorMode;
  const hideDock = tool === "hand";
  const showBrush =
    tool === "ink" ||
    tool === "pen" ||
    tool === "marker" ||
    tool === "fill" ||
    tool === "eraser";
  /** Shape selection / shapes pack — stroke width + brush-type pack. */
  const showShapeStrokeBrush = showShapeColors;
  const showCornerControls =
    showShapeColors &&
    (tool === "rect" ||
      (tool === "shapes" && lastShapeTool === "rect") ||
      selectedStrokes.some((s) => s.shapeKind === "rect"));
  const displayCornerRadius =
    selectedStrokes.find((s) => s.shapeKind === "rect")?.cornerRadius ??
    cornerRadius;
  const displaySquircle =
    selectedStrokes.find((s) => s.shapeKind === "rect")?.squircle ?? squircle;
  const displayCornerSmoothing =
    selectedStrokes.find((s) => s.shapeKind === "rect")?.cornerSmoothing ??
    cornerSmoothing;
  const showColor =
    tool === "ink" ||
    tool === "pen" ||
    tool === "marker" ||
    tool === "fill" ||
    tool === "text" ||
    textSelectionMode ||
    showShapeColors;
  const showFont = tool === "text" || textSelectionMode;
  const showFillColor =
    shapesMode || selectedStrokes.some((s) => s.closed);
  const showCanvas =
    tool === "select" ||
    tool === "path" ||
    tool === "ink" ||
    tool === "pen" ||
    tool === "marker" ||
    tool === "fill" ||
    tool === "eraser" ||
    tool === "text" ||
    shapesMode ||
    textSelectionMode ||
    imageSelectionMode;

  const boilEnabled = selectedStrokes.length
    ? selectedStrokes.every((s) => s.jitter)
    : jitterByDefault;

  function applyStrokeColor(next: string) {
    setColor(next);
    if (selectedStrokes.length) {
      updateStrokes(
        selectedStrokes.map((s) => s.id),
        { color: next },
      );
    }
    patchSelectedTexts({ color: next });
  }

  function applyFillColor(next: string) {
    setFillColor(next);
    const closedIds = selectedStrokes.filter((s) => s.closed).map((s) => s.id);
    if (closedIds.length) updateStrokes(closedIds, { fillColor: next });
  }

  function applyStrokeSize(next: number) {
    const n = Math.max(1, Math.round(next));
    setSize(n);
    if (selectedStrokes.length) {
      updateStrokes(
        selectedStrokes.map((s) => s.id),
        { size: n },
      );
    }
  }

  function applyBrushKind(next: DrawBrushKind) {
    setLastBrushKind(next);
    // Always switch the active draw tool so the dock chip + pack follow the mode.
    if (
      tool === "ink" ||
      tool === "pen" ||
      tool === "marker" ||
      tool === "fill" ||
      tool === "eraser" ||
      tool === "select"
    ) {
      useTools.getState().setTool(next);
    }
    if (selectedStrokes.length) {
      const p5 = useTools.getState().lastP5Brush;
      updateStrokes(
        selectedStrokes.map((s) => s.id),
        { brush: next as BrushKind, p5Brush: p5 },
      );
    }
  }

  function applyP5Brush(next: P5BrushId) {
    setLastP5Brush(next);
    // Picking a preset also adopts its draw mode (Ink / Pen / Marker).
    const kind = useTools.getState().lastBrushKind;
    if (
      tool === "ink" ||
      tool === "pen" ||
      tool === "marker" ||
      tool === "fill" ||
      tool === "select"
    ) {
      useTools.getState().setTool(kind);
    }
    if (selectedStrokes.length) {
      updateStrokes(
        selectedStrokes.map((s) => s.id),
        { brush: kind as BrushKind, p5Brush: next },
      );
    }
  }

  function patchSelectedRects(
    patch: Partial<
      Pick<Stroke, "cornerRadius" | "squircle" | "cornerSmoothing" | "points" | "shapeBox">
    >,
  ) {
    const rects = selectedStrokes.filter((s) => s.shapeKind === "rect");
    if (!rects.length) return;
    for (const s of rects) {
      const shapeBox = s.shapeBox ?? shapeBoxFromStroke(s);
      const next = { ...s, shapeBox, ...patch };
      const points =
        patch.points ??
        rebuildRectPointsFromStroke({
          shapeBox: next.shapeBox,
          cornerRadius: next.cornerRadius ?? 0,
          squircle: next.squircle,
          cornerSmoothing: next.cornerSmoothing,
        }) ??
        s.points;
      updateStrokes([s.id], {
        ...patch,
        shapeBox,
        points,
      });
    }
  }

  function applyCornerRadius(next: number) {
    const n = Math.max(0, Math.round(next));
    setCornerRadius(n);
    patchSelectedRects({ cornerRadius: n || undefined });
  }

  function applySquircle(next: boolean) {
    setSquircle(next);
    patchSelectedRects({
      squircle: next || undefined,
      cornerSmoothing: next ? cornerSmoothing : undefined,
    });
  }

  function applyCornerSmoothing(next: number) {
    const n = Math.max(0, Math.min(1, next));
    setCornerSmoothing(n);
    patchSelectedRects({ cornerSmoothing: n });
  }

  function applyTextSize(next: number) {
    const n = Math.max(1, Math.round(next));
    setTextSize(n);
    patchSelectedTexts({ size: n });
  }

  function patchSelectedTexts(patch: Partial<import("@/model/types").TextElement>) {
    for (const t of selectedTexts) updateTextElement(t.id, patch);
  }

  function applyFontFamily(next: string) {
    setFontFamily(next);
    patchSelectedTexts({ fontFamily: next });
  }

  function applyTextBold(next: boolean) {
    setTextBold(next);
    patchSelectedTexts({ bold: next });
  }

  function applyTextItalic(next: boolean) {
    setTextItalic(next);
    patchSelectedTexts({ italic: next });
  }

  function applyTextAlign(next: TextAlign) {
    setTextAlign(next);
    const ctx = measureCtx();
    // Prefer live project texts over the memoized selection snapshot.
    const texts = (() => {
      const s = useProject.getState();
      const layer = s.project.layers[s.layerIndex];
      if (!layer) return selectedTexts;
      const cel =
        s.project.workflow === "animatron"
          ? layer.frames.find((f) => f) ?? null
          : resolveCel(layer, s.frameIndex);
      if (!cel?.texts?.length) return selectedTexts;
      const idSet = new Set(useSelection.getState().ids);
      return cel.texts.filter((t) => idSet.has(t.id));
    })();

    for (const hit of texts) {
      const patch: Partial<import("@/model/types").TextElement> = { align: next };
      // Alignment only shows inside a box wider than the line. Seed / grow if needed.
      if (ctx && next !== "left") {
        const natural = measureTextBox(ctx, { ...hit, boxWidth: undefined, align: "left" });
        const currentW = hit.boxWidth != null && hit.boxWidth > 0 ? hit.boxWidth : natural.w;
        if (currentW <= natural.w + 1) {
          patch.boxWidth = Math.max(48, Math.ceil(natural.w * 1.35));
        }
      } else if (ctx && !(hit.boxWidth != null && hit.boxWidth > 0)) {
        const box = measureTextBox(ctx, hit);
        patch.boxWidth = Math.max(48, Math.ceil(box.w));
      }
      updateTextElement(hit.id, patch);
    }
  }

  function applyLetterSpacing(next: number) {
    setLetterSpacing(next);
    patchSelectedTexts({ letterSpacing: next });
  }

  function applyTextUnderline(next: boolean) {
    setTextUnderline(next);
    patchSelectedTexts({ underline: next });
  }

  function applyTextStrikethrough(next: boolean) {
    setTextStrikethrough(next);
    patchSelectedTexts({ strikethrough: next });
  }

  function applyTextTypewriter(on: boolean) {
    setTextTypewriter(on);
    const cps = on ? textTypewriterSpeed : 0;
    for (const t of selectedTexts) {
      const patch: Partial<import("@/model/types").TextElement> = {
        typewriterSpeed: cps,
      };
      if (on && project.workflow === "animatron") {
        const typingMs = typewriterDurationMs(t.text, Math.max(1, cps));
        if (!t.clip) {
          const clip: StrokeClip = {
            startMs: 0,
            durationMs: typingMs,
            easing: { ...clipEasing },
          };
          patch.clip = clip;
        } else if (t.clip.durationMs < typingMs) {
          patch.clip = { ...t.clip, durationMs: typingMs };
        }
      }
      updateTextElement(t.id, patch);
    }
  }

  /** Live scrub — tools only. Never commit project (undo + gooey remorph). */
  function scrubTextTypewriterSpeed(cps: number) {
    setTextTypewriterSpeed(Math.max(1, Math.min(120, Math.round(cps))));
  }

  /** Pointer-up / commit — stamp selected texts once. */
  function commitTextTypewriterSpeed(cps: number) {
    const next = Math.max(1, Math.min(120, Math.round(cps)));
    setTextTypewriterSpeed(next);
    if (!textTypewriter) return;
    for (const t of selectedTexts) {
      const patch: Partial<import("@/model/types").TextElement> = {
        typewriterSpeed: next,
      };
      if (project.workflow === "animatron" && t.clip) {
        const typingMs = typewriterDurationMs(t.text, next);
        if (t.clip.durationMs < typingMs) {
          patch.clip = { ...t.clip, durationMs: typingMs };
        }
      }
      updateTextElement(t.id, patch);
    }
  }

  function applyTextCase(next: TextCase) {
    setTextCase(next);
    patchSelectedTexts({ textCase: next });
  }

  function applyTextOpacity(next: number) {
    setTextOpacity(next);
    patchSelectedTexts({ opacity: next });
  }

  function applyTextBackgroundColor(next: string | null) {
    setTextBackgroundColor(next);
    patchSelectedTexts({ backgroundColor: next });
  }

  function applyTextShadow(next: TextShadow | null) {
    setTextShadow(next);
    patchSelectedTexts({ shadow: next });
  }

  function applyTextBlendMode(next: TextBlendMode) {
    setTextBlendMode(next);
    patchSelectedTexts({ blendMode: next });
  }

  function applyTextPath(next: TextPathSettings) {
    setTextPath(next);
    patchSelectedTexts({
      path: next.shape === "none" ? null : { ...next },
    });
  }

  function measureCtx() {
    if (!measureCtxRef.current) {
      const c = document.createElement("canvas");
      measureCtxRef.current = c.getContext("2d");
    }
    return measureCtxRef.current;
  }

  function alignTextsToPage(
    where: "left" | "center" | "right" | "top" | "middle" | "bottom",
  ) {
    const ctx = measureCtx();
    if (!ctx || !selectedTexts.length) return;
    for (const t of selectedTexts) {
      const box = measureTextBox(ctx, t);
      let x = t.x;
      let y = t.y;
      if (where === "left") x = 0;
      else if (where === "center") x = (project.width - box.w) / 2;
      else if (where === "right") x = project.width - box.w;
      else if (where === "top") y = 0;
      else if (where === "middle") y = (project.height - box.h) / 2;
      else if (where === "bottom") y = project.height - box.h;
      updateTextElement(t.id, { x, y });
    }
  }

  useEffect(() => {
    if (!open) return;
    function onDown(e: PointerEvent | MouseEvent) {
      const t = e.target;
      if (!(t instanceof Element)) return;
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
    function onKeyDown(e: KeyboardEvent) {
      if (e.key !== "Escape") return;
      const t = e.target;
      // Leave modal dialogs alone (SaveFirst / Export / Help).
      if (t instanceof Element && t.closest("[role='dialog']")) return;
      e.preventDefault();
      setOpen(null);
    }
    // Capture so StageCanvas stopPropagation still lets us close on draw/click.
    window.addEventListener("pointerdown", onDown, true);
    window.addEventListener("keydown", onKeyDown, true);
    return () => {
      window.removeEventListener("pointerdown", onDown, true);
      window.removeEventListener("keydown", onKeyDown, true);
    };
  }, [open]);

  useEffect(() => {
    if (hideDock) {
      setOpen(null);
      return;
    }
    if (open === "brush" && !showBrush && !showShapeStrokeBrush) setOpen(null);
    if (open === "brushes" && !showShapeStrokeBrush && !showBrush) setOpen(null);
    if (
      (open === "canvas" || open === "background" || (open === "motionPath" && PATH_MAKER_ENABLED)) &&
      !showCanvas
    ) {
      setOpen(null);
    }
    if (open === "motionPath" && !PATH_MAKER_ENABLED) setOpen(null);
    if (
      (open === "text" ||
        open === "size" ||
        open === "align" ||
        open === "advanced" ||
        open === "typewriter" ||
        open === "path" ||
        open === "shadow" ||
        open === "opacity" ||
        open === "position" ||
        open === "textBg") &&
      !showFont
    ) {
      setOpen(null);
    }
  }, [hideDock, open, showBrush, showShapeStrokeBrush, showCanvas, showFont]);

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
        <TextFontPanel
          color={color}
          bold={textBold}
          italic={textItalic}
          align={textAlign}
          fontFamily={fontFamily}
          onColor={applyStrokeColor}
          onBold={applyTextBold}
          onItalic={applyTextItalic}
          onAlign={applyTextAlign}
          onFontFamily={applyFontFamily}
        />
      );
    }
    if (kind === "size") {
      return (
        <SizePanel
          size={textSize}
          onSize={applyTextSize}
          onClose={() => setOpen(null)}
        />
      );
    }
    if (kind === "align") {
      return (
        <AlignPanel
          align={textAlign}
          onAlign={applyTextAlign}
          onClose={() => setOpen(null)}
        />
      );
    }
    if (kind === "advanced") {
      return (
        <AdvancedPanel
          textCase={textCase}
          letterSpacing={letterSpacing}
          underline={textUnderline}
          strikethrough={textStrikethrough}
          onTextCase={applyTextCase}
          onLetterSpacing={applyLetterSpacing}
          onUnderline={applyTextUnderline}
          onStrikethrough={applyTextStrikethrough}
          onClose={() => setOpen(null)}
        />
      );
    }
    if (kind === "typewriter") {
      return (
        <TypewriterPanel
          typewriter={textTypewriter}
          typewriterSpeed={textTypewriterSpeed}
          onTypewriter={applyTextTypewriter}
          onTypewriterSpeed={scrubTextTypewriterSpeed}
          onTypewriterSpeedCommit={commitTextTypewriterSpeed}
          onClose={() => setOpen(null)}
        />
      );
    }
    if (kind === "path") {
      return (
        <PathPanel
          path={textPath}
          onPath={applyTextPath}
          onClose={() => setOpen(null)}
        />
      );
    }
    if (kind === "shadow") {
      return (
        <ShadowPanel
          shadow={textShadow}
          onShadow={applyTextShadow}
          onClose={() => setOpen(null)}
        />
      );
    }
    if (kind === "opacity") {
      return (
        <OpacityPanel
          opacity={textOpacity}
          blendMode={textBlendMode}
          onOpacity={applyTextOpacity}
          onBlendMode={applyTextBlendMode}
          onClose={() => setOpen(null)}
        />
      );
    }
    if (kind === "textBg") {
      return (
        <BackgroundPanel
          backgroundColor={textBackgroundColor}
          onBackgroundColor={applyTextBackgroundColor}
          onClose={() => setOpen(null)}
        />
      );
    }
    if (kind === "position") {
      return (
        <PositionPanel
          onReorder={(where) => {
            for (const t of selectedTexts) reorderTextElement(t.id, where);
          }}
          onAlignPage={alignTextsToPage}
          onDuplicate={() => {
            const ids: string[] = [];
            for (const t of selectedTexts) {
              const id = duplicateTextElement(t.id);
              if (id) ids.push(id);
            }
            if (ids.length) setSelection(ids);
          }}
          onDelete={() => {
            for (const t of selectedTexts) removeTextElement(t.id);
            setSelection([]);
            setOpen(null);
          }}
          onClose={() => setOpen(null)}
        />
      );
    }
    if (kind === "motionPath" && PATH_MAKER_ENABLED) {
      return <PathMakerPanel />;
    }
    if (kind === "image" && selectedImages[0]) {
      return (
        <CanvasImageExpandedPanel
          image={selectedImages[0]}
          onPatch={(patch) => {
            for (const im of selectedImages) updateImageElement(im.id, patch);
          }}
          onClose={() => setOpen(null)}
        />
      );
    }
    if (kind === "brushes") {
      return (
        <BrushPackPanel
          kind={lastBrushKind}
          active={lastP5Brush}
          onPick={(b) => {
            applyP5Brush(b);
            setOpen(null);
          }}
          onClose={() => setOpen(null)}
        />
      );
    }
    if (kind === "radius") {
      return (
        <RadiusPanel
          radius={displayCornerRadius}
          squircle={displaySquircle}
          smoothing={displayCornerSmoothing}
          onRadius={applyCornerRadius}
          onSquircle={applySquircle}
          onSmoothing={applyCornerSmoothing}
        />
      );
    }
    if (kind === "brush") {
      return (
        <BrushExpandedPanel
          color={color}
          size={size}
          wavelength={brushWavelength}
          corners={brushCorners}
          smoothing={brushSmoothing}
          boilEnabled={boilEnabled}
          boil={boil}
          showColor={tool !== "eraser" && !showShapeStrokeBrush}
          brushKind={tool === "eraser" ? undefined : lastBrushKind}
          onBrushKind={tool === "eraser" ? undefined : applyBrushKind}
          onColor={applyStrokeColor}
          onSize={showShapeStrokeBrush ? applyStrokeSize : setSize}
          onWavelength={setBrushWavelength}
          onCorners={setBrushCorners}
          onSmoothing={setBrushSmoothing}
          onJitter={(next) => {
            if (selectedStrokes.length) {
              updateStrokes(
                selectedStrokes.map((s) => s.id),
                { jitter: next },
              );
              return;
            }
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
          onClose={() => setOpen(null)}
        />
      );
    }
    return (
      <CanvasExpandedPanel
        width={project.width}
        height={project.height}
        onSet={setProjectSettings}
        onClose={() => setOpen(null)}
      />
    );
  }, [
    kind,
    color,
    size,
    brushWavelength,
    brushCorners,
    brushSmoothing,
    textSize,
    textBold,
    textItalic,
    textAlign,
    letterSpacing,
    textCase,
    textUnderline,
    textStrikethrough,
    textTypewriter,
    textTypewriterSpeed,
    textPath,
    textShadow,
    textOpacity,
    textBlendMode,
    textBackgroundColor,
    fontFamily,
    lastBrushKind,
    lastP5Brush,
    jitterByDefault,
    boilEnabled,
    boil,
    tool,
    showShapeStrokeBrush,
    displayCornerRadius,
    displaySquircle,
    displayCornerSmoothing,
    selectedStrokes,
    selectedTexts,
    selectedImages,
    updateImageElement,
    updateStrokes,
    setColor,
    setSize,
    toggleJitterByDefault,
    setBoilLive,
    project.width,
    project.height,
    project.background,
    setProjectSettings,
    reorderTextElement,
    duplicateTextElement,
    removeTextElement,
    setSelection,
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
    showCanvas &&
    (showColor || showBrush || showFont || showFillColor || showShapeStrokeBrush);

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
          // Background keeps overflow visible for the side-filter neck;
          // brushes must clip so ScrollArea max-height actually contains the list.
          kind === "background" ? "overflow-visible" : "overflow-hidden",
        )}
        sidePanelClassName="overflow-visible"
      >
        <PaperDockBar variant="setting">
          {showShapeColors ? (
            <>
              <ColorPickerPopover
                value={color}
                onValueChange={applyStrokeColor}
                triggerShowValue={false}
                triggerLabel="border"
                triggerLabelPosition="right"
                triggerClassName={cn(
                  "!h-[26px] !min-h-[26px] !gap-2.5 !rounded-[12px] !border-0 !bg-transparent !px-2 !py-0 !outline-none",
                  "hover:!bg-[#313131]",
                  "[&>span:first-of-type]:!size-[18px] [&>span:first-of-type]:!min-h-[18px] [&>span:first-of-type]:!min-w-[18px] [&>span:first-of-type]:!rounded-full [&>span:first-of-type]:!shadow-[inset_0_0_0_1px_rgba(255,255,255,0.15)]",
                  "[&>span:last-child]:!px-0 [&>span:last-child]:!text-[14px] [&>span:last-child]:!leading-none [&>span:last-child]:!text-[#DEDEDE]",
                )}
              />
              {showFillColor ? (
                <>
                  <span className="size-1 shrink-0 rounded-full bg-[#DDDDDD26]" aria-hidden />
                  <ColorPickerPopover
                    value={fillColor}
                    onValueChange={applyFillColor}
                    triggerShowValue={false}
                    triggerLabel="fill"
                    triggerLabelPosition="right"
                    triggerClassName={cn(
                      "!h-[26px] !min-h-[26px] !gap-2.5 !rounded-[12px] !border-0 !bg-transparent !px-2 !py-0 !outline-none",
                      "hover:!bg-[#313131]",
                      "[&>span:first-of-type]:!size-[18px] [&>span:first-of-type]:!min-h-[18px] [&>span:first-of-type]:!min-w-[18px] [&>span:first-of-type]:!rounded-full [&>span:first-of-type]:!shadow-[inset_0_0_0_1px_rgba(255,255,255,0.15)]",
                      "[&>span:last-child]:!px-0 [&>span:last-child]:!text-[14px] [&>span:last-child]:!leading-none [&>span:last-child]:!text-[#DEDEDE]",
                    )}
                  />
                </>
              ) : null}
              <span className="size-1 shrink-0 rounded-full bg-[#DDDDDD26]" aria-hidden />
              <button
                ref={strokeAnchorRef}
                type="button"
                onClick={() => openFrom("brush", "stroke")}
                className={cn(
                  "flex h-[26px] shrink-0 items-center gap-2 rounded-[12px] px-2 outline-none transition-colors",
                  "hover:bg-[#313131]",
                  open === "brush" && dockAnchor === "stroke" && "bg-[#313131]",
                )}
                aria-expanded={open === "brush" && dockAnchor === "stroke"}
                aria-label="Stroke size"
              >
                <BrushSizeGlyph />
                <span
                  className="inline-block w-[2ch] tabular-nums"
                  style={CHIP_LABEL_STYLE}
                >
                  {size}
                </span>
                <span style={CHIP_LABEL_STYLE}>stroke</span>
              </button>
              <span className="size-1 shrink-0 rounded-full bg-[#DDDDDD26]" aria-hidden />
              <button
                ref={brushesAnchorRef}
                type="button"
                onClick={() => openFrom("brushes", "brushes")}
                className={cn(
                  "flex h-[26px] w-[88px] shrink-0 items-center gap-1 overflow-hidden rounded-lg px-1.5 outline-none transition-colors",
                  "hover:bg-[#313131]",
                  open === "brushes" && "bg-[#313131] ring-1 ring-[#6B97FF]/60",
                )}
                aria-expanded={open === "brushes"}
                aria-label="Brush type"
              >
                <span className="min-w-0 flex-1 text-white/85">
                  <BrushStrokePreview brush={lastP5Brush} className="h-3.5" />
                </span>
                <ChevronDown
                  size={12}
                  className={cn(
                    "shrink-0 text-white/45 transition-transform",
                    open === "brushes" && "rotate-180",
                  )}
                />
              </button>
              {showCornerControls ? (
                <>
                  <span className="size-1 shrink-0 rounded-full bg-[#DDDDDD26]" aria-hidden />
                  <button
                    ref={radiusAnchorRef}
                    type="button"
                    onClick={() => openFrom("radius", "radius")}
                    className={cn(
                      "flex h-[26px] shrink-0 items-center gap-2 rounded-[12px] px-2 outline-none transition-colors",
                      "hover:bg-[#313131]",
                      open === "radius" && "bg-[#313131]",
                      displaySquircle && open !== "radius" && "ring-1 ring-[#6B97FF]/40",
                    )}
                    aria-expanded={open === "radius"}
                    aria-label="Corner radius"
                  >
                    <span
                      className="inline-block min-w-[2ch] tabular-nums"
                      style={CHIP_LABEL_STYLE}
                    >
                      {Math.round(displayCornerRadius)}
                    </span>
                    <span style={CHIP_LABEL_STYLE}>radius</span>
                  </button>
                </>
              ) : null}
            </>
          ) : (
            <>
              {imageSelectionMode && selectedImages[0] ? (
                <>
                  <button
                    ref={imageAnchorRef}
                    type="button"
                    onClick={() => openFrom("image", "image")}
                    className={cn(
                      "flex h-[26px] shrink-0 items-center gap-2 rounded-[12px] px-2 outline-none transition-colors",
                      "hover:bg-[#313131]",
                      open === "image" && "bg-[#313131]",
                    )}
                    aria-expanded={open === "image"}
                    aria-label="Image settings"
                  >
                    <span style={CHIP_LABEL_STYLE}>
                      {Math.round(selectedImages[0].w)}×{Math.round(selectedImages[0].h)}
                    </span>
                    <span style={CHIP_LABEL_STYLE}>
                      image
                    </span>
                  </button>
                  <span className="size-1 shrink-0 rounded-full bg-[#DDDDDD26]" aria-hidden />
                </>
              ) : null}
              {showFont && (
                <TextDockChips
                  open={
                    open === "text" ||
                    open === "size" ||
                    open === "align" ||
                    open === "advanced" ||
                    open === "typewriter" ||
                    open === "path" ||
                    open === "shadow" ||
                    open === "opacity" ||
                    open === "position" ||
                    open === "textBg"
                      ? open
                      : null
                  }
                  openFrom={(kind, anchor) => openFrom(kind, anchor)}
                  fontFamily={fontFamily}
                  textSize={textSize}
                  textTypewriter={textTypewriter}
                  textTypewriterSpeed={textTypewriterSpeed}
                  textPath={textPath}
                  textShadow={textShadow}
                  textOpacity={textOpacity}
                  textBackgroundColor={textBackgroundColor}
                  fontAnchorRef={fontAnchorRef}
                  sizeAnchorRef={sizeAnchorRef}
                  advancedAnchorRef={advancedAnchorRef}
                  typewriterAnchorRef={typewriterAnchorRef}
                  pathAnchorRef={pathAnchorRef}
                  shadowAnchorRef={shadowAnchorRef}
                  opacityAnchorRef={opacityAnchorRef}
                  positionAnchorRef={positionAnchorRef}
                  textBgAnchorRef={textBgAnchorRef}
                  chipLabelStyle={CHIP_LABEL_STYLE}
                />
              )}

              {showColor && !showFont && (
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
                <>
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
                  <span className="size-1 shrink-0 rounded-full bg-[#DDDDDD26]" aria-hidden />
                  <button
                    ref={brushesAnchorRef}
                    type="button"
                    onClick={() => openFrom("brushes", "brushes")}
                    className={cn(
                      "flex h-[26px] w-[88px] shrink-0 items-center gap-1 overflow-hidden rounded-lg px-1.5 outline-none transition-colors",
                      "hover:bg-[#313131]",
                      open === "brushes" && "bg-[#313131] ring-1 ring-[#6B97FF]/60",
                    )}
                    aria-expanded={open === "brushes"}
                    aria-label="Brush type"
                  >
                    <span className="min-w-0 flex-1 text-white/85">
                      <BrushStrokePreview brush={lastP5Brush} className="h-3.5" />
                    </span>
                    <ChevronDown
                      size={12}
                      className={cn(
                        "shrink-0 text-white/45 transition-transform",
                        open === "brushes" && "rotate-180",
                      )}
                    />
                  </button>
                </>
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
                  "group flex h-[26px] shrink-0 items-center gap-2 rounded-[12px] py-0 pl-2 outline-none transition-colors",
                  open === "canvas" ? "pr-1.5 bg-[#313131]" : "pr-2",
                  "hover:bg-[#313131]",
                )}
                aria-expanded={open === "canvas"}
                aria-label="Canvas size"
              >
                <span style={CHIP_LABEL_STYLE}>{aspect}</span>
                {open === "canvas" ? (
                  <span
                    className="grid size-5 place-items-center rounded-md text-white/45 transition-colors group-hover:bg-white/10 group-hover:text-white"
                    aria-hidden
                  >
                    <X size={12} />
                  </span>
                ) : null}
              </button>

              <PaperDockSep />

              <button
                ref={backgroundAnchorRef}
                type="button"
                onClick={() => openFrom("background", "background")}
                className={cn(
                  "group flex h-[26px] shrink-0 items-center gap-2.5 rounded-[12px] py-0 pl-2 outline-none transition-colors",
                  open === "background" ? "pr-1.5 bg-[#313131]" : "pr-2",
                  "hover:bg-[#313131]",
                )}
                aria-expanded={open === "background"}
                aria-label="Background settings"
              >
                <span
                  className="size-[18px] shrink-0 rounded-full border border-white/15 transition-[box-shadow] group-hover:shadow-[inset_0_0_0_1px_rgba(255,255,255,0.28)]"
                  style={backgroundChipStyle(project.background)}
                  aria-hidden
                />
                <span style={CHIP_LABEL_STYLE}>background</span>
                {open === "background" ? (
                  <span
                    className="grid size-5 place-items-center rounded-md text-white/45 transition-colors group-hover:bg-white/10 group-hover:text-white"
                    aria-hidden
                  >
                    <X size={12} />
                  </span>
                ) : null}
              </button>

              {/* Path Maker parked for MVP — flip PATH_MAKER_ENABLED to restore */}
              {PATH_MAKER_ENABLED && (
                <>
                  <PaperDockSep />

                  <button
                    ref={motionPathAnchorRef}
                    type="button"
                    onClick={() => openFrom("motionPath", "motionPath")}
                    className={cn(
                      "flex h-[26px] shrink-0 items-center gap-2 rounded-[12px] px-2 outline-none transition-colors",
                      "hover:bg-[#313131]",
                      open === "motionPath" && "bg-[#313131]",
                    )}
                    aria-expanded={open === "motionPath"}
                    aria-label="Path Maker"
                  >
                    <PathMakerGlyph />
                    <span style={CHIP_LABEL_STYLE}>path</span>
                  </button>
                </>
              )}
            </>
          )}
        </PaperDockBar>
      </GooeyConjoined>
    </div>
  );
}
