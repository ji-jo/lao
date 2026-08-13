/**
 * IMG.LY-inspired text inspector — dark Paper dock styling, purple accents.
 * Align icons are local SVGs; supporting controls use reicon.
 */
import {
  useEffect,
  useMemo,
  useState,
  type CSSProperties,
  type ReactNode,
  type RefObject,
} from "react";
import {
  AlignBottom,
  AlignTop,
  ArrangeSquare2,
  Ban,
  Blend,
  Blur,
  Bold,
  ChevronDown,
  Copy,
  Italic,
  Layers2,
  Path2,
  Refresh2,
  RotateLeft,
  RotateRight,
  SlashCircle,
  TextBlock,
  TextUnderline,
  Trash,
} from "reicon-react";
import { ColorPickerPopover } from "@/components/ui/color-picker";
import { SliderComfortable } from "@/components/ui/slider";
import { Switch } from "@/components/ui/switch";
import { ScrollArea } from "@/components/ui/scroll-area";
import { PaperDockSep } from "@/components/chrome/PaperDockPrimitives";
import { PAPER } from "@/components/chrome/paper-tokens";
import {
  TextAlignCenterIcon,
  TextAlignLeftIcon,
  TextAlignRightIcon,
} from "@/assets/icons/text/text-align-icons";
import {
  ensureFontLoaded,
  listGoogleFontFamilies,
  LOCAL_TEXT_FONTS,
  textFontStack,
} from "@/lib/google-fonts";
import { DEFAULT_TEXT_PATH } from "@/engine/textStyle";
import { cn } from "@/lib/utils";
import { useTools } from "@/state/tools";
import type {
  TextAlign,
  TextBlendMode,
  TextCase,
  TextElement,
  TextPathSettings,
  TextPathShape,
  TextShadow,
} from "@/model/types";

/** Matches brush/size scrubber fill (`PAPER.frameActive`) — not purple. */
export const TEXT_ACCENT = "#40608E";

export type TextPanelKind =
  | "text"
  | "size"
  | "align"
  | "advanced"
  | "typewriter"
  | "path"
  | "shadow"
  | "opacity"
  | "position"
  | "textBg";

export type TextDockAnchor =
  | "font"
  | "size"
  | "align"
  | "advanced"
  | "typewriter"
  | "path"
  | "shadow"
  | "opacity"
  | "position"
  | "textBg";

const FONT_LIST_LIMIT = 80;

const BLEND_MODES: TextBlendMode[] = [
  "normal",
  "multiply",
  "screen",
  "overlay",
  "darken",
  "lighten",
];

const PATH_SHAPES: { id: TextPathShape; label: string }[] = [
  { id: "none", label: "None" },
  { id: "circle", label: "Circle" },
  { id: "arch", label: "Arch" },
  { id: "wave", label: "Wave" },
  { id: "scurve", label: "S-curve" },
];

function hexDigits(color: string): string {
  const m = color.replace("#", "").toUpperCase();
  if (/^[0-9A-F]{6}/.test(m)) return m.slice(0, 6);
  if (/^[0-9A-F]{3}$/.test(m)) {
    return m
      .split("")
      .map((c) => c + c)
      .join("");
  }
  return "000000";
}

function SegBtn({
  pressed,
  onClick,
  ariaLabel,
  children,
  className,
}: {
  pressed?: boolean;
  onClick: () => void;
  ariaLabel: string;
  children: ReactNode;
  className?: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={!!pressed}
      aria-label={ariaLabel}
      className={cn(
        "flex h-8 min-w-8 flex-1 items-center justify-center rounded-md text-white/70 outline-none transition-colors hover:bg-[#313131] hover:text-white",
        pressed && "text-white",
        className,
      )}
      style={
        pressed
          ? { boxShadow: `inset 0 0 0 1.5px ${TEXT_ACCENT}`, color: TEXT_ACCENT }
          : undefined
      }
    >
      {children}
    </button>
  );
}

function PanelShell({
  title,
  onClose,
  onReset,
  children,
  width = 280,
}: {
  title: string;
  onClose?: () => void;
  onReset?: () => void;
  children: ReactNode;
  width?: number;
}) {
  return (
    <div
      className="flex flex-col gap-3 overflow-clip rounded-xl p-4 antialiased"
      style={{ width, fontFamily: PAPER.fontSans }}
    >
      <div className="flex items-center gap-2">
        <span className="flex-1 text-sm font-semibold text-white/90">{title}</span>
        {onReset ? (
          <button
            type="button"
            onClick={onReset}
            className="inline-flex items-center gap-1 rounded-md px-1.5 py-1 text-xs text-white/45 outline-none hover:bg-[#313131] hover:text-white/80"
          >
            <Refresh2 size={12} />
            Reset
          </button>
        ) : null}
        {onClose ? (
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="grid size-7 place-items-center rounded-lg text-white/50 outline-none hover:bg-[#313131] hover:text-white"
          >
            <span className="text-sm leading-none">×</span>
          </button>
        ) : null}
      </div>
      {children}
    </div>
  );
}

function RowLabel({ children }: { children: ReactNode }) {
  return <span className="text-xs text-white/45">{children}</span>;
}

function LabeledChip({
  icon,
  label,
  active,
  onClick,
  buttonRef,
  ariaLabel,
  muted,
}: {
  icon: ReactNode;
  label?: string;
  active?: boolean;
  onClick: () => void;
  buttonRef?: RefObject<HTMLButtonElement | null>;
  ariaLabel: string;
  muted?: boolean;
}) {
  return (
    <button
      ref={buttonRef}
      type="button"
      onClick={onClick}
      aria-expanded={!!active}
      aria-label={ariaLabel}
      className={cn(
        "flex h-8 shrink-0 items-center gap-1.5 rounded-lg px-2 outline-none transition-colors",
        "hover:bg-[#313131] hover:text-white",
        active ? "bg-[#313131] text-white" : "text-white/75",
        muted && !active && "text-white/40",
      )}
    >
      <span className="grid place-items-center [&_svg]:size-4">{icon}</span>
      {label ? (
        <span className="text-sm leading-none" style={{ fontFamily: PAPER.fontSans }}>
          {label}
        </span>
      ) : null}
    </button>
  );
}

export function TextDockToggle({
  pressed,
  onClick,
  ariaLabel,
  children,
  className,
}: {
  pressed?: boolean;
  onClick: () => void;
  ariaLabel: string;
  children: ReactNode;
  className?: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={!!pressed}
      aria-label={ariaLabel}
      className={cn(
        "flex h-8 min-w-8 items-center justify-center rounded-lg px-2 text-sm text-white/80 outline-none transition-colors hover:bg-[#313131] hover:text-white",
        pressed && "bg-[#313131] text-white",
        className,
      )}
      style={{ fontFamily: PAPER.fontSans }}
    >
      {children}
    </button>
  );
}

function AlignIcon({ align, size = 16 }: { align: TextAlign; size?: number }) {
  if (align === "center") return <TextAlignCenterIcon size={size} />;
  if (align === "right") return <TextAlignRightIcon size={size} />;
  return <TextAlignLeftIcon size={size} />;
}

function PathShapeGlyph({ shape }: { shape: TextPathShape }) {
  if (shape === "none") return <SlashCircle size={16} />;
  if (shape === "circle") {
    return (
      <svg width={16} height={16} viewBox="0 0 16 16" fill="none" aria-hidden>
        <circle cx="8" cy="8" r="5.5" stroke="currentColor" strokeWidth="1.4" />
      </svg>
    );
  }
  if (shape === "arch") {
    return (
      <svg width={16} height={16} viewBox="0 0 16 16" fill="none" aria-hidden>
        <path
          d="M2.5 11.5a5.5 5.5 0 0 1 11 0"
          stroke="currentColor"
          strokeWidth="1.4"
          strokeLinecap="round"
        />
      </svg>
    );
  }
  if (shape === "wave") {
    return (
      <svg width={16} height={16} viewBox="0 0 16 16" fill="none" aria-hidden>
        <path
          d="M1.5 8c1.5-3 3-3 4.5 0s3 3 4.5 0 3-3 4.5 0"
          stroke="currentColor"
          strokeWidth="1.4"
          strokeLinecap="round"
        />
      </svg>
    );
  }
  return (
    <svg width={16} height={16} viewBox="0 0 16 16" fill="none" aria-hidden>
      <path
        d="M1.5 8c2-4 4 4 6 0s4-4 6 0"
        stroke="currentColor"
        strokeWidth="1.4"
        strokeLinecap="round"
      />
    </svg>
  );
}

/** Font search + list — used by the font chip panel. */
export function TextFontPanel({
  color,
  bold,
  italic,
  align,
  fontFamily,
  onColor,
  onBold,
  onItalic,
  onAlign,
  onFontFamily,
}: {
  color: string;
  bold: boolean;
  italic: boolean;
  align: TextAlign;
  fontFamily: string;
  onColor: (c: string) => void;
  onBold: (v: boolean) => void;
  onItalic: (v: boolean) => void;
  onAlign: (v: TextAlign) => void;
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
    const filtered = q ? all.filter((f) => f.toLowerCase().includes(q)) : all;
    const limited = filtered.slice(0, FONT_LIST_LIMIT);
    if (fontFamily && !limited.includes(fontFamily) && all.includes(fontFamily)) {
      return [fontFamily, ...limited.filter((f) => f !== fontFamily)];
    }
    return limited;
  }, [googleFamilies, query, fontFamily]);

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
      <div className="flex items-start gap-2">
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

      <div className="flex w-full items-center gap-2">
        <TextDockToggle
          pressed={bold}
          onClick={() => onBold(!bold)}
          ariaLabel="Bold"
        >
          <Bold size={14} />
        </TextDockToggle>
        <TextDockToggle
          pressed={italic}
          onClick={() => onItalic(!italic)}
          ariaLabel="Italic"
        >
          <Italic size={14} />
        </TextDockToggle>
        <PaperDockSep />
        {(["left", "center", "right"] as const).map((a) => (
          <TextDockToggle
            key={a}
            pressed={align === a}
            onClick={() => onAlign(a)}
            ariaLabel={`Align ${a}`}
          >
            <AlignIcon align={a} size={14} />
          </TextDockToggle>
        ))}
      </div>

      <div className="flex w-full flex-col gap-2 self-stretch">
        <label className="flex h-8 w-full items-center gap-2 rounded-lg bg-[#252525] px-2">
          <span className="text-white/35 text-xs">Aa</span>
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
                      onClick={() => onFontFamily(id)}
                      className={cn(
                        "flex h-8 w-full items-center rounded-md px-2 text-left text-sm text-white/80 outline-none hover:bg-[#313131]",
                        active && "bg-[#313131] text-white",
                      )}
                      style={{
                        fontFamily: textFontStack(id),
                        ...(active
                          ? { boxShadow: `inset 0 0 0 1px ${TEXT_ACCENT}` }
                          : null),
                      }}
                    >
                      {id}
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

export function SizePanel({
  size,
  onSize,
  onClose,
}: {
  size: number;
  onSize: (n: number) => void;
  onClose?: () => void;
}) {
  return (
    <PanelShell title="Size" onClose={onClose} width={240}>
      <SliderComfortable
        label="pt"
        variant="scrubber"
        value={Math.round(size)}
        onChange={(n) => onSize(Math.round(n))}
        min={1}
        max={400}
        step={1}
        fillColor={TEXT_ACCENT}
        className="!h-7 !w-full !rounded-lg !border-0 !bg-[#252525] [&_span]:!font-mono [&_span]:!text-sm"
      />
    </PanelShell>
  );
}

export function AlignPanel({
  align,
  onAlign,
  onClose,
}: {
  align: TextAlign;
  onAlign: (a: TextAlign) => void;
  onClose?: () => void;
}) {
  const items: { id: TextAlign; label: string }[] = [
    { id: "left", label: "Align left" },
    { id: "center", label: "Align center" },
    { id: "right", label: "Align right" },
  ];
  return (
    <PanelShell title="Alignment" onClose={onClose} width={200}>
      <div className="flex flex-col gap-0.5">
        {items.map((it) => {
          const active = align === it.id;
          return (
            <button
              key={it.id}
              type="button"
              onClick={() => onAlign(it.id)}
              className={cn(
                "flex h-9 items-center gap-2.5 rounded-lg px-2.5 text-left text-sm outline-none transition-colors",
                active
                  ? "text-white"
                  : "text-white/65 hover:bg-[#313131] hover:text-white",
              )}
              style={
                active
                  ? { backgroundColor: TEXT_ACCENT, color: "#0b0b0f" }
                  : undefined
              }
            >
              <AlignIcon align={it.id} size={16} />
              {it.label}
            </button>
          );
        })}
      </div>
    </PanelShell>
  );
}

export function AdvancedPanel({
  textCase,
  letterSpacing,
  underline,
  strikethrough,
  onTextCase,
  onLetterSpacing,
  onUnderline,
  onStrikethrough,
  onClose,
}: {
  textCase: TextCase;
  letterSpacing: number;
  underline: boolean;
  strikethrough: boolean;
  onTextCase: (v: TextCase) => void;
  onLetterSpacing: (n: number) => void;
  onUnderline: (v: boolean) => void;
  onStrikethrough: (v: boolean) => void;
  onClose?: () => void;
}) {
  const cases: { id: TextCase; label: string }[] = [
    { id: "none", label: "—" },
    { id: "upper", label: "AG" },
    { id: "lower", label: "ag" },
    { id: "title", label: "Ag" },
  ];
  return (
    <PanelShell title="Advanced" onClose={onClose} width={260}>
      <div className="flex flex-col gap-3">
        <div className="flex flex-col gap-1.5">
          <RowLabel>Letter Case</RowLabel>
          <div className="flex gap-1 rounded-lg bg-[#252525] p-1">
            {cases.map((c) => (
              <SegBtn
                key={c.id}
                pressed={textCase === c.id}
                onClick={() => onTextCase(c.id)}
                ariaLabel={`Case ${c.id}`}
              >
                <span className="text-xs font-medium">{c.label}</span>
              </SegBtn>
            ))}
          </div>
        </div>

        <div className="flex flex-col gap-1.5">
          <RowLabel>Letter Spacing</RowLabel>
          <SliderComfortable
            label="Spacing"
            variant="scrubber"
            value={letterSpacing}
            onChange={onLetterSpacing}
            min={-10}
            max={50}
            step={1}
            fillColor={TEXT_ACCENT}
            className="!h-7 !w-full !rounded-lg !border-0 !bg-[#252525] [&_span]:!font-mono [&_span]:!text-sm"
          />
        </div>

        <div className="flex flex-col gap-1.5">
          <RowLabel>Decoration</RowLabel>
          <div className="flex gap-2">
            <SegBtn
              pressed={underline}
              onClick={() => onUnderline(!underline)}
              ariaLabel="Underline"
              className="!flex-none !px-3"
            >
              <TextUnderline size={16} />
            </SegBtn>
            <SegBtn
              pressed={strikethrough}
              onClick={() => onStrikethrough(!strikethrough)}
              ariaLabel="Strikethrough"
              className="!flex-none !px-3"
            >
              <span className="relative text-xs font-semibold">
                T
                <span className="absolute left-0 right-0 top-1/2 h-px bg-current" />
              </span>
            </SegBtn>
          </div>
        </div>
      </div>
    </PanelShell>
  );
}

export function TypewriterPanel({
  typewriter,
  typewriterSpeed,
  onTypewriter,
  onTypewriterSpeed,
  onTypewriterSpeedCommit,
  onClose,
}: {
  typewriter: boolean;
  typewriterSpeed: number;
  onTypewriter: (on: boolean) => void;
  onTypewriterSpeed: (cps: number) => void;
  onTypewriterSpeedCommit?: (cps: number) => void;
  onClose?: () => void;
}) {
  return (
    <PanelShell title="Typewriter" onClose={onClose} width={260}>
      <div className="flex flex-col gap-3">
        <div className="flex items-center justify-between gap-3">
          <RowLabel>On</RowLabel>
          <Switch
            label="Typewriter"
            checked={typewriter}
            onToggle={() => onTypewriter(!typewriter)}
          />
        </div>
        {typewriter ? (
          <div className="flex flex-col gap-1.5">
            <RowLabel>Speed (chars/s)</RowLabel>
            <SliderComfortable
              label="Typewriter speed"
              variant="scrubber"
              value={typewriterSpeed}
              onChange={onTypewriterSpeed}
              onValueCommit={onTypewriterSpeedCommit}
              min={1}
              max={60}
              step={1}
              fillColor={TEXT_ACCENT}
              className="!h-7 !w-full !rounded-lg !border-0 !bg-[#252525] [&_span]:!font-mono [&_span]:!text-sm"
            />
          </div>
        ) : (
          <p className="text-[11px] leading-snug text-white/45">
            Off shows the full text as soon as its clip starts.
          </p>
        )}
      </div>
    </PanelShell>
  );
}

export function PathPanel({
  path,
  onPath,
  onClose,
}: {
  path: TextPathSettings;
  onPath: (p: TextPathSettings) => void;
  onClose?: () => void;
}) {
  return (
    <PanelShell
      title="Path"
      onClose={onClose}
      onReset={() => onPath({ ...DEFAULT_TEXT_PATH })}
      width={280}
    >
      <div className="flex flex-col gap-3">
        <div className="flex gap-1 rounded-lg bg-[#252525] p-1">
          {PATH_SHAPES.map((s) => (
            <SegBtn
              key={s.id}
              pressed={path.shape === s.id}
              onClick={() => onPath({ ...path, shape: s.id })}
              ariaLabel={s.label}
            >
              <PathShapeGlyph shape={s.id} />
            </SegBtn>
          ))}
        </div>

        <div className="flex items-center justify-between gap-3">
          <RowLabel>Horizontal Alignment</RowLabel>
          <div className="flex w-[140px] gap-0.5 rounded-lg bg-[#252525] p-0.5">
            {(["left", "center", "right"] as const).map((a) => (
              <SegBtn
                key={a}
                pressed={path.align === a}
                onClick={() => onPath({ ...path, align: a })}
                ariaLabel={`Path align ${a}`}
              >
                <AlignIcon align={a} size={14} />
              </SegBtn>
            ))}
          </div>
        </div>

        <div className="flex items-center justify-between gap-3">
          <RowLabel>Path Position</RowLabel>
          <div className="flex w-[120px] gap-0.5 rounded-lg bg-[#252525] p-0.5">
            {(
              [
                { id: "top" as const, icon: <AlignTop size={14} /> },
                { id: "center" as const, icon: <ArrangeSquare2 size={14} /> },
                { id: "bottom" as const, icon: <AlignBottom size={14} /> },
              ] as const
            ).map((p) => (
              <SegBtn
                key={p.id}
                pressed={path.position === p.id}
                onClick={() => onPath({ ...path, position: p.id })}
                ariaLabel={`Path position ${p.id}`}
              >
                {p.icon}
              </SegBtn>
            ))}
          </div>
        </div>

        <div className="flex items-center justify-between gap-3">
          <RowLabel>Direction</RowLabel>
          <div className="flex w-[88px] gap-0.5 rounded-lg bg-[#252525] p-0.5">
            <SegBtn
              pressed={path.direction === "cw"}
              onClick={() => onPath({ ...path, direction: "cw" })}
              ariaLabel="Clockwise"
            >
              <RotateRight size={14} />
            </SegBtn>
            <SegBtn
              pressed={path.direction === "ccw"}
              onClick={() => onPath({ ...path, direction: "ccw" })}
              ariaLabel="Counter-clockwise"
            >
              <RotateLeft size={14} />
            </SegBtn>
          </div>
        </div>

        <div className="flex flex-col gap-1.5">
          <RowLabel>Offset</RowLabel>
          <SliderComfortable
            label="Offset"
            variant="scrubber"
            value={path.offset}
            onChange={(n) => onPath({ ...path, offset: n })}
            min={-100}
            max={100}
            step={1}
            fillColor={TEXT_ACCENT}
            className="!h-7 !w-full !rounded-lg !border-0 !bg-[#252525] [&_span]:!font-mono [&_span]:!text-sm"
          />
        </div>
      </div>
    </PanelShell>
  );
}

export function OpacityPanel({
  opacity,
  blendMode,
  onOpacity,
  onBlendMode,
  onClose,
}: {
  opacity: number;
  blendMode: TextBlendMode;
  onOpacity: (n: number) => void;
  onBlendMode: (m: TextBlendMode) => void;
  onClose?: () => void;
}) {
  return (
    <PanelShell title="Opacity" onClose={onClose} width={260}>
      <div className="flex flex-col gap-3">
        <div className="flex items-center justify-between gap-3">
          <RowLabel>Opacity</RowLabel>
          <SliderComfortable
            label="Opacity"
            variant="scrubber"
            value={opacity}
            onChange={onOpacity}
            min={0}
            max={100}
            step={1}
            fillColor={TEXT_ACCENT}
            className="!h-7 !w-[160px] !rounded-lg !border-0 !bg-[#252525] [&_span]:!font-mono [&_span]:!text-sm"
          />
        </div>
        <div className="flex items-center justify-between gap-3">
          <RowLabel>Blend Mode</RowLabel>
          <label className="relative flex h-8 min-w-[120px] items-center rounded-lg border border-white/10 bg-[#1a1a1a] px-2">
            <select
              value={blendMode}
              onChange={(e) => onBlendMode(e.target.value as TextBlendMode)}
              className="w-full appearance-none bg-transparent pr-5 text-sm text-white outline-none"
              aria-label="Blend mode"
            >
              {BLEND_MODES.map((m) => (
                <option key={m} value={m} className="bg-[#1a1a1a]">
                  {m.charAt(0).toUpperCase() + m.slice(1)}
                </option>
              ))}
            </select>
            <ChevronDown
              size={12}
              className="pointer-events-none absolute right-2 text-white/50"
            />
          </label>
        </div>
      </div>
    </PanelShell>
  );
}

export function ShadowPanel({
  shadow,
  onShadow,
  onClose,
}: {
  shadow: TextShadow | null;
  onShadow: (s: TextShadow | null) => void;
  onClose?: () => void;
}) {
  const active = shadow ?? {
    color: "#000000",
    blur: 8,
    offsetX: 2,
    offsetY: 2,
  };
  const enabled = !!shadow;

  return (
    <PanelShell
      title="Shadow"
      onClose={onClose}
      onReset={() => onShadow(null)}
      width={280}
    >
      <div className="flex flex-col gap-3">
        <div className="flex items-center justify-between">
          <RowLabel>Enabled</RowLabel>
          <button
            type="button"
            onClick={() => onShadow(enabled ? null : { ...active })}
            className={cn(
              "h-7 rounded-md px-2.5 text-xs outline-none",
              enabled ? "text-white" : "text-white/50 hover:bg-[#313131]",
            )}
            style={
              enabled
                ? { boxShadow: `inset 0 0 0 1.5px ${TEXT_ACCENT}`, color: TEXT_ACCENT }
                : undefined
            }
          >
            {enabled ? "On" : "Off"}
          </button>
        </div>
        <div className="flex items-center gap-2">
          <ColorPickerPopover
            value={active.color}
            onValueChange={(c) => onShadow({ ...active, color: c })}
            triggerShowValue={false}
            triggerClassName="!size-8 !min-h-8 !min-w-8 !justify-center !gap-0 !rounded-lg !border-0 !bg-transparent !p-0 !outline-none"
          />
          <span className="text-xs text-white/50">Color</span>
        </div>
        {(
          [
            { key: "blur" as const, label: "Blur", min: 0, max: 40 },
            { key: "offsetX" as const, label: "Offset X", min: -40, max: 40 },
            { key: "offsetY" as const, label: "Offset Y", min: -40, max: 40 },
          ] as const
        ).map((row) => (
          <div key={row.key} className="flex flex-col gap-1">
            <RowLabel>{row.label}</RowLabel>
            <SliderComfortable
              label={row.label}
              variant="scrubber"
              value={active[row.key]}
              onChange={(n) => onShadow({ ...active, [row.key]: n })}
              min={row.min}
              max={row.max}
              step={1}
              fillColor={TEXT_ACCENT}
              className="!h-7 !w-full !rounded-lg !border-0 !bg-[#252525] [&_span]:!font-mono [&_span]:!text-sm"
            />
          </div>
        ))}
      </div>
    </PanelShell>
  );
}

export function BackgroundPanel({
  backgroundColor,
  onBackgroundColor,
  onClose,
}: {
  backgroundColor: string | null;
  onBackgroundColor: (c: string | null) => void;
  onClose?: () => void;
}) {
  const value = backgroundColor ?? "#FFFFFF";
  return (
    <PanelShell
      title="Background"
      onClose={onClose}
      onReset={() => onBackgroundColor(null)}
      width={220}
    >
      <div className="flex flex-col gap-3">
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => onBackgroundColor(null)}
            aria-pressed={!backgroundColor}
            className={cn(
              "grid size-8 place-items-center rounded-lg text-white/60 outline-none hover:bg-[#313131]",
              !backgroundColor && "text-white",
            )}
            style={
              !backgroundColor
                ? { boxShadow: `inset 0 0 0 1.5px ${TEXT_ACCENT}` }
                : undefined
            }
            aria-label="No background"
          >
            <Ban size={16} />
          </button>
          <ColorPickerPopover
            value={value}
            onValueChange={(c) => onBackgroundColor(c)}
            triggerShowValue={false}
            triggerClassName="!size-8 !min-h-8 !min-w-8 !justify-center !gap-0 !rounded-lg !border-0 !bg-transparent !p-0 !outline-none"
          />
          <span className="text-xs text-white/50">
            {backgroundColor ? backgroundColor : "None"}
          </span>
        </div>
      </div>
    </PanelShell>
  );
}

export function PositionPanel({
  onReorder,
  onAlignPage,
  onDuplicate,
  onDelete,
  onClose,
}: {
  onReorder: (where: "forward" | "backward" | "front" | "back") => void;
  onAlignPage: (
    where: "left" | "center" | "right" | "top" | "middle" | "bottom",
  ) => void;
  onDuplicate: () => void;
  onDelete: () => void;
  onClose?: () => void;
}) {
  return (
    <PanelShell title="Position" onClose={onClose} width={260}>
      <div className="flex flex-col gap-3">
        <div className="flex flex-col gap-1.5">
          <span className="text-sm font-medium text-white/85">Move</span>
          <div className="grid grid-cols-2 gap-1">
            {(
              [
                { id: "forward" as const, label: "Forward", icon: <Layers2 size={14} /> },
                { id: "backward" as const, label: "Backward", icon: <Layers2 size={14} /> },
                { id: "front" as const, label: "To front", icon: <ArrowStack up /> },
                { id: "back" as const, label: "To back", icon: <ArrowStack up={false} /> },
              ] as const
            ).map((m) => (
              <button
                key={m.id}
                type="button"
                onClick={() => onReorder(m.id)}
                className="flex h-9 items-center gap-2 rounded-lg bg-[#252525] px-2.5 text-left text-xs text-white/75 outline-none hover:bg-[#313131] hover:text-white"
              >
                {m.icon}
                {m.label}
              </button>
            ))}
          </div>
        </div>

        <div className="h-px w-full bg-white/10" />

        <div className="flex flex-col gap-1.5">
          <span className="text-sm font-medium text-white/85">Align to Page</span>
          <div className="grid grid-cols-2 gap-1">
            {(
              [
                { id: "top" as const, label: "Top", icon: <AlignTop size={14} /> },
                { id: "left" as const, label: "Left", icon: <TextAlignLeftIcon size={14} /> },
                { id: "middle" as const, label: "Middle", icon: <ArrangeSquare2 size={14} /> },
                { id: "center" as const, label: "Center", icon: <TextAlignCenterIcon size={14} /> },
                { id: "bottom" as const, label: "Bottom", icon: <AlignBottom size={14} /> },
                { id: "right" as const, label: "Right", icon: <TextAlignRightIcon size={14} /> },
              ] as const
            ).map((a) => (
              <button
                key={a.id}
                type="button"
                onClick={() => onAlignPage(a.id)}
                className="flex h-9 items-center gap-2 rounded-lg bg-[#252525] px-2.5 text-left text-xs text-white/75 outline-none hover:bg-[#313131] hover:text-white"
              >
                {a.icon}
                {a.label}
              </button>
            ))}
          </div>
        </div>

        <div className="h-px w-full bg-white/10" />

        <div className="flex gap-1">
          <button
            type="button"
            onClick={onDuplicate}
            className="flex h-9 flex-1 items-center justify-center gap-1.5 rounded-lg bg-[#252525] text-xs text-white/75 outline-none hover:bg-[#313131] hover:text-white"
          >
            <Copy size={14} />
            Duplicate
          </button>
          <button
            type="button"
            onClick={onDelete}
            className="flex h-9 flex-1 items-center justify-center gap-1.5 rounded-lg bg-[#252525] text-xs text-red-300/80 outline-none hover:bg-[#313131] hover:text-red-300"
          >
            <Trash size={14} />
            Delete
          </button>
        </div>
      </div>
    </PanelShell>
  );
}

function ArrowStack({ up }: { up: boolean }) {
  return (
    <span className="relative inline-flex size-3.5 items-center justify-center">
      <Layers2 size={12} />
      <span
        className="absolute -right-0.5 text-[8px] leading-none"
        style={{ top: up ? -2 : undefined, bottom: up ? undefined : -2 }}
      >
        {up ? "↑" : "↓"}
      </span>
    </span>
  );
}

export type TextDockChipHandlers = {
  open: TextPanelKind | null;
  openFrom: (kind: TextPanelKind, anchor: TextDockAnchor) => void;
  fontFamily: string;
  textSize: number;
  textTypewriter: boolean;
  textTypewriterSpeed: number;
  textPath: TextPathSettings;
  textShadow: TextShadow | null;
  textOpacity: number;
  textBackgroundColor: string | null;
  fontAnchorRef: RefObject<HTMLButtonElement | null>;
  sizeAnchorRef: RefObject<HTMLButtonElement | null>;
  advancedAnchorRef: RefObject<HTMLButtonElement | null>;
  typewriterAnchorRef: RefObject<HTMLButtonElement | null>;
  pathAnchorRef: RefObject<HTMLButtonElement | null>;
  shadowAnchorRef: RefObject<HTMLButtonElement | null>;
  opacityAnchorRef: RefObject<HTMLButtonElement | null>;
  positionAnchorRef: RefObject<HTMLButtonElement | null>;
  textBgAnchorRef: RefObject<HTMLButtonElement | null>;
  chipLabelStyle: CSSProperties;
};

/** IMG.LY-style chip row for the setting dock bar. */
export function TextDockChips(h: TextDockChipHandlers) {
  const pathOn = h.textPath.shape !== "none";
  const shadowOn = !!h.textShadow;
  const bgOn = !!h.textBackgroundColor;

  return (
    <>
      <button
        ref={h.fontAnchorRef}
        type="button"
        onClick={() => h.openFrom("text", "font")}
        className={cn(
          "flex h-8 w-[9.5rem] shrink-0 items-center gap-1.5 rounded-lg px-2 outline-none transition-colors",
          "hover:bg-[#313131]",
          h.open === "text" && "bg-[#313131]",
        )}
        aria-expanded={h.open === "text"}
        aria-label="Font"
        style={{ fontFamily: textFontStack(h.fontFamily) }}
      >
        <TextBlock size={14} className="shrink-0 opacity-70" />
        <span className="min-w-0 flex-1 truncate text-left text-sm leading-[18px] text-white opacity-80">
          {h.fontFamily}
        </span>
        <ChevronDown size={12} className="opacity-40" />
      </button>

      <button
        ref={h.sizeAnchorRef}
        type="button"
        onClick={() => h.openFrom("size", "size")}
        className={cn(
          "flex h-8 w-[4.5rem] shrink-0 items-center justify-between rounded-lg px-2 outline-none transition-colors",
          "hover:bg-[#313131]",
          h.open === "size" && "bg-[#313131]",
        )}
        aria-expanded={h.open === "size"}
        aria-label="Font size"
      >
        <span style={h.chipLabelStyle}>{Math.round(h.textSize)}</span>
        <span className="text-white/45">pt</span>
      </button>

      <button
        ref={h.typewriterAnchorRef}
        type="button"
        onClick={() => h.openFrom("typewriter", "typewriter")}
        className={cn(
          // Fixed width — chip text ("9/s" ↔ "60/s") must not resize the
          // gooey anchor or the morph restarts on every scrub tick.
          "flex h-8 w-[4.75rem] shrink-0 items-center justify-between gap-1 rounded-lg px-2 outline-none transition-colors",
          "hover:bg-[#313131]",
          h.open === "typewriter" && "bg-[#313131]",
          !h.textTypewriter && "opacity-55",
        )}
        aria-expanded={h.open === "typewriter"}
        aria-label="Typewriter speed"
      >
        <span
          className="min-w-0 flex-1 truncate text-left tabular-nums"
          style={h.chipLabelStyle}
        >
          {h.textTypewriter ? `${Math.round(h.textTypewriterSpeed)}/s` : "Off"}
        </span>
        <span className="shrink-0 text-[10px] text-white/45">type</span>
      </button>

      <LabeledChip
        buttonRef={h.advancedAnchorRef}
        icon={<TextUnderline size={16} />}
        active={h.open === "advanced"}
        onClick={() => h.openFrom("advanced", "advanced")}
        ariaLabel="Advanced text"
      />

      <LabeledChip
        buttonRef={h.textBgAnchorRef}
        icon={
          bgOn ? (
            <span
              className="size-3.5 rounded-full border border-white/20"
              style={{ backgroundColor: h.textBackgroundColor! }}
            />
          ) : (
            <Ban size={16} />
          )
        }
        label="Background"
        active={h.open === "textBg"}
        muted={!bgOn}
        onClick={() => h.openFrom("textBg", "textBg")}
        ariaLabel="Background"
      />

      <LabeledChip
        buttonRef={h.pathAnchorRef}
        icon={<Path2 size={16} />}
        label="Path"
        active={h.open === "path"}
        muted={!pathOn}
        onClick={() => h.openFrom("path", "path")}
        ariaLabel="Path"
      />

      <LabeledChip
        buttonRef={h.shadowAnchorRef}
        icon={shadowOn ? <Blur size={16} /> : <SlashCircle size={16} />}
        label="Shadow"
        active={h.open === "shadow"}
        muted={!shadowOn}
        onClick={() => h.openFrom("shadow", "shadow")}
        ariaLabel="Shadow"
      />

      <LabeledChip
        buttonRef={h.opacityAnchorRef}
        icon={<Blend size={16} />}
        label="Opacity"
        active={h.open === "opacity"}
        onClick={() => h.openFrom("opacity", "opacity")}
        ariaLabel="Opacity"
      />

      <LabeledChip
        buttonRef={h.positionAnchorRef}
        icon={<ArrangeSquare2 size={16} />}
        label="Position"
        active={h.open === "position"}
        onClick={() => h.openFrom("position", "position")}
        ariaLabel="Position"
      />
    </>
  );
}

/** Push text element style into the tools store (selection sync). */
export function syncTextToolsFromElement(hit: TextElement) {
  const tools = useTools.getState();
  tools.setFontFamily(hit.fontFamily);
  tools.setTextSize(Math.max(1, Math.round(hit.size)));
  tools.setTextBold(!!hit.bold);
  tools.setTextItalic(!!hit.italic);
  tools.setTextAlign(hit.align ?? "left");
  tools.setColor(hit.color);
  if (hit.letterSpacing != null) tools.setLetterSpacing(hit.letterSpacing);
  tools.setTextUnderline(!!hit.underline);
  tools.setTextStrikethrough(!!hit.strikethrough);
  tools.setTextCase(hit.textCase ?? "none");
  tools.setTextOpacity(hit.opacity ?? 100);
  tools.setTextBackgroundColor(hit.backgroundColor ?? null);
  tools.setTextShadow(hit.shadow ? { ...hit.shadow } : null);
  tools.setTextBlendMode(hit.blendMode ?? "normal");
  tools.setTextPath(hit.path ? { ...hit.path } : { ...DEFAULT_TEXT_PATH });
  const cps = hit.typewriterSpeed;
  if (cps == null) {
    tools.setTextTypewriter(!!hit.clip);
  } else {
    tools.setTextTypewriter(cps > 0);
    if (cps > 0) tools.setTextTypewriterSpeed(cps);
  }
}
