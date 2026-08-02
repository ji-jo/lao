import colorPickerUrl from "./color-picker.svg?url";
import { INK_FADE_MS } from "./constants.ts";
import { playColorBloop, primeMarkerAudio } from "../../lib/marker-audio.ts";

// `ring` is the selected outline, solid since box-shadow can't take a gradient.
interface Swatch {
  id: string;
  label: string;
  color: string;
  ring: string;
}

// Four fluorescent inks on one row. Red first so it is the resting default.
const SWATCHES: Swatch[] = [
  { id: "red", label: "Red ink", color: "#ff2d3f", ring: "#ff2d3f" },
  { id: "green", label: "Green ink", color: "#7cff4d", ring: "#7cff4d" },
  { id: "blue", label: "Blue ink", color: "#38c6ff", ring: "#38c6ff" },
  { id: "yellow", label: "Yellow ink", color: "#ffe83d", ring: "#ffe83d" },
];

const PRESET_COLORS = new Set(SWATCHES.map((s) => s.color));

// One wheel image for both ring and fill, so they can't drift apart.
const WHEEL = `url("${colorPickerUrl}") center / cover no-repeat`;

// Reverse each row of `cols` items so the grid reads as a horizontal mirror, while keeping DOM (and so
// tab) order matching the visible order. Used for the LEFT side dock so the palette mirrors the right -
// the custom (rainbow) swatch ends up bottom-OUTER on both sides, matching Apple's PencilKit.
function mirrorRows<T>(items: T[], cols: number): T[] {
  const out: T[] = [];
  for (let i = 0; i < items.length; i += cols) out.push(...items.slice(i, i + cols).reverse());
  return out;
}

export function ColorPalette({
  value,
  onChange,
  onActivateCustom,
  columns = 5,
  mirror = false,
}: {
  value: string;
  onChange: (color: string) => void;
  /** The custom swatch opens the HSL picker rising from this button. */
  onActivateCustom: (button: HTMLButtonElement) => void;
  /** Swatch columns; the side dock uses 2 so the grid fits the 145px pill. */
  columns?: number;
  /** Mirror the columns (left side dock) so the rainbow sits on the bottom-outer edge, as Apple does. */
  mirror?: boolean;
}) {
  const customActive = !PRESET_COLORS.has(value);
  const items = [
    ...SWATCHES.map((s) => (
      <Disc
        key={s.id}
        label={s.label}
        ring={s.ring}
        fill={s.color}
        selected={s.color === value}
        onClick={() => {
          playColorBloop();
          onChange(s.color);
        }}
      />
    )),
    <CustomDisc
      key="custom"
      active={customActive}
      color={value}
      onClick={onActivateCustom}
    />
  ];
  return (
    <div
      className="grid gap-x-[14px] gap-y-[14px]"
      style={{ gridTemplateColumns: `repeat(${columns}, 32px)` }}
      onPointerEnter={primeMarkerAudio}
    >
      {mirror ? mirrorRows(items, columns) : items}
    </div>
  );
}

// The custom-colour disc: rainbow ring with the picked colour at centre when active, else the wheel art.
function CustomDisc({
  active,
  color,
  onClick,
}: {
  active: boolean;
  color: string;
  onClick: (button: HTMLButtonElement) => void;
}) {
  return (
    <button
      type="button"
      aria-label="Custom colour"
      aria-pressed={active}
      onClick={(e) => onClick(e.currentTarget)}
      data-focus-ring
      data-focus-radius="full"
      className="group relative w-[32px] h-[32px] shrink-0 rounded-full"
    >
      <span
        aria-hidden="true"
        className="pointer-events-none absolute inset-0 rounded-full transition-transform duration-150 group-active:scale-[0.96]"
        // Rasterise the stacked circles as one layer so the press-scale doesn't shimmer their edges.
        style={{ willChange: "transform", backfaceVisibility: "hidden" }}
      >
        <span className="absolute inset-0 rounded-full" style={{ background: WHEEL }} />
        <span className="absolute rounded-full bg-ink-800" style={{ inset: "3px" }} />
        <span
          className="absolute inset-0 rounded-full"
          style={{
            transform: active ? "scale(0.703)" : "scale(1)",
            transition: active
              ? "transform 220ms cubic-bezier(0.2, 0, 0, 1)"
              : "transform 300ms cubic-bezier(0.6, 0, 0.35, 1)",
          }}
        >
          {/* Picked colour over the wheel: opacity crossfades it in/out, background-color fades hue to hue. */}
          <span className="absolute inset-0 rounded-full" style={{ background: WHEEL }} />
          <span
            className="absolute inset-0 rounded-full"
            style={{ backgroundColor: color, opacity: active ? 1 : 0, transition: `background-color ${INK_FADE_MS}ms ease, opacity 300ms ease` }}
          />
        </span>
      </span>
      <span className="pointer-events-none absolute inset-0 rounded-full bg-white/0 group-hover:bg-white/10 transition-colors z-10" />
    </button>
  );
}

function Disc({
  label,
  ring,
  fill,
  selected,
  onClick,
}: {
  label: string;
  ring: string;
  fill: string;
  selected: boolean;
  onClick: (button: HTMLButtonElement) => void;
}) {
  return (
    <button
      type="button"
      aria-label={label}
      aria-pressed={selected}
      onClick={(e) => onClick(e.currentTarget)}
      data-focus-ring
      data-focus-radius="full"
      // Never scale the button itself: it shifts the hit area and the click misfires. Press-scale lives on the visual layer.
      className="group relative w-[32px] h-[32px] shrink-0 rounded-full"
    >
      <span
        aria-hidden="true"
        className="pointer-events-none absolute inset-0 rounded-full transition-transform duration-150 group-active:scale-[0.96]"
        style={{ background: "#131212", boxShadow: `inset 0 0 0 3px ${ring}` }}
      >
        {/* Disc fills when unselected; shrinks on select to reveal the ring. */}
        <span
          className="absolute inset-0 rounded-full"
          style={{
            background: fill,
            transformOrigin: "center",
            transform: selected ? "scale(0.703)" : "scale(1)",
            // Faster on select (ring pops), slower on deselect (disc eases back).
            transition: selected
              ? "transform 220ms cubic-bezier(0.2, 0, 0, 1)"
              : "transform 300ms cubic-bezier(0.6, 0, 0.35, 1)",
          }}
        />
      </span>
      <span className="pointer-events-none absolute inset-0 rounded-full bg-white/0 group-hover:bg-white/10 transition-colors z-10" />
    </button>
  );
}
