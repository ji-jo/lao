import { useCallback, useEffect, useRef, useState } from "react";
import { DotGridSpotlight } from "@/components/ui/dot-grid-spotlight";
import { SliderComfortable } from "@/components/ui/slider";
import { PAPER } from "@/components/chrome/paper-tokens";
import { cn } from "@/lib/utils";
import { type Bezier4, type ClipEasing } from "@/model/types";
import { useProject } from "@/state/project";
import { usePlayback } from "@/state/playback";

const PRESETS: { id: string; label: string; curve: Bezier4 }[] = [
  { id: "custom", label: "Custom", curve: [0.42, 0, 0.58, 1] },
  { id: "linear", label: "Linear", curve: [0, 0, 1, 1] },
  { id: "smooth", label: "Smooth", curve: [0.44, 0, 0.56, 1] },
  { id: "natural", label: "Natural", curve: [0.4, 0, 0.2, 1] },
  { id: "slow", label: "Slow down", curve: [0, 0, 0.2, 1] },
  { id: "accel", label: "Accelerate", curve: [0.8, 0, 1, 1] },
  { id: "elastic", label: "Elastic", curve: [0.68, -0.55, 0.27, 1.55] },
  { id: "bounce", label: "Bounce", curve: [0.34, 1.56, 0.64, 1] },
  { id: "overshoot", label: "Overshoot", curve: [0.175, 0.885, 0.32, 1.275] },
  { id: "impulse", label: "Impulse", curve: [0.7, 0, 0.84, 0] },
  { id: "swing", label: "Swing", curve: [0.02, 0.4, 0.18, 1] },
];

const PAD = 18;
const SIZE = 140;

function sampleBezier(t: number, c: Bezier4): { x: number; y: number } {
  const [x1, y1, x2, y2] = c;
  const u = 1 - t;
  const x = 3 * u * u * t * x1 + 3 * u * t * t * x2 + t * t * t;
  const y = 3 * u * u * t * y1 + 3 * u * t * t * y2 + t * t * t;
  return { x: x * SIZE, y: (1 - y) * SIZE };
}

function bezierPath(c: Bezier4): string {
  const pts: string[] = [];
  for (let i = 0; i <= 48; i++) {
    const { x, y } = sampleBezier(i / 48, c);
    pts.push(`${i === 0 ? "M" : "L"} ${x + PAD} ${y + PAD}`);
  }
  return pts.join(" ");
}

type Handle = "c1" | "c2";

/** Paper ease glyph on 8WR-0 (AN3-0). */
function EaseGlyph() {
  return (
    <svg
      viewBox="0 0 18 18"
      width={18}
      height={18}
      xmlns="http://www.w3.org/2000/svg"
      className="shrink-0 overflow-visible"
      aria-hidden
    >
      <g transform="matrix(1 0 0 1 2 2)">
        <path
          d="M3.000 1.000C3.000 1.000 7.000 1.000 7.000 1.000C7.000 1.000 7.000 2.000 7.000 2.000C7.000 2.000 3.000 2.000 3.000 2.000C3.000 2.000 3.000 3.000 3.000 3.000C3.000 3.000 0.000 3.000 0.000 3.000C0.000 3.000 0.000 0.000 0.000 0.000C0.000 0.000 3.000 0.000 3.000 0.000C3.000 0.000 3.000 1.000 3.000 1.000Z"
          fill="#D9D9D9"
        />
        <path
          transform="matrix(1 0 0 1 7 11)"
          d="M7.000 3.000C7.000 3.000 4.000 3.000 4.000 3.000C4.000 3.000 4.000 2.000 4.000 2.000C4.000 2.000 0.000 2.000 0.000 2.000C0.000 2.000 0.000 1.000 0.000 1.000C0.000 1.000 4.000 1.000 4.000 1.000C4.000 1.000 4.000 0.000 4.000 0.000C4.000 0.000 7.000 0.000 7.000 0.000C7.000 0.000 7.000 3.000 7.000 3.000Z"
          fill="#D9D9D9"
        />
        <path
          transform="matrix(1 0 0 1 0 0.5)"
          d="M14.000 1.000C12.009 1.000 10.763 1.207 9.832 1.942C8.892 2.685 8.176 4.044 7.483 6.629C6.783 9.244 5.999 10.885 4.787 11.842C3.566 12.806 2.009 13.000 0.000 13.000C0.000 13.000 0.000 12.000 0.000 12.000C1.991 12.000 3.237 11.793 4.168 11.058C5.108 10.315 5.824 8.955 6.517 6.370C7.217 3.755 8.001 2.114 9.213 1.157C10.433 0.193 11.991 0.000 14.000 0.000C14.000 0.000 14.000 1.000 14.000 1.000Z"
          fill="#FFFFFF"
        />
      </g>
    </svg>
  );
}

function formatBezierCoord(n: number): string {
  if (!Number.isFinite(n)) return "0";
  const rounded = Math.round(n * 100) / 100;
  if (Math.abs(rounded - Math.round(rounded)) < 1e-9) return String(Math.round(rounded));
  return rounded.toFixed(2);
}

/** Editable cubic-bezier component — looks like Paper text until focused. */
function BezierCoordInput({
  value,
  onCommit,
  min,
  max,
  "aria-label": ariaLabel,
}: {
  value: number;
  onCommit: (n: number) => void;
  min?: number;
  max?: number;
  "aria-label"?: string;
}) {
  const [draft, setDraft] = useState(() => formatBezierCoord(value));

  useEffect(() => {
    setDraft(formatBezierCoord(value));
  }, [value]);

  function commit() {
    const n = Number(draft);
    if (!Number.isFinite(n)) {
      setDraft(formatBezierCoord(value));
      return;
    }
    const clamped = Math.min(max ?? Infinity, Math.max(min ?? -Infinity, n));
    setDraft(formatBezierCoord(clamped));
    if (clamped !== value) onCommit(clamped);
  }

  return (
    <input
      type="text"
      inputMode="decimal"
      value={draft}
      aria-label={ariaLabel}
      onChange={(e) => setDraft(e.target.value.replace(/[^0-9.\-]/g, ""))}
      onBlur={commit}
      onFocus={(e) => e.target.select()}
      onKeyDown={(e) => {
        e.stopPropagation();
        if (e.key === "Enter") {
          e.preventDefault();
          (e.target as HTMLInputElement).blur();
        } else if (e.key === "Escape") {
          e.preventDefault();
          setDraft(formatBezierCoord(value));
          (e.target as HTMLInputElement).blur();
        }
      }}
      className="w-[5ch] shrink-0 bg-transparent text-right text-[12px] leading-[18px] text-white outline-none tabular-nums"
      style={{ fontFamily: PAPER.fontMono }}
    />
  );
}

/** Paper 8WR-0 — Start / End cubic-bezier readout (editable, 12px). */
function BezierCoordsBar({
  curve,
  onChange,
}: {
  curve: Bezier4;
  onChange: (c: Bezier4) => void;
}) {
  function setAt(i: 0 | 1 | 2 | 3, n: number) {
    const next = [...curve] as Bezier4;
    next[i] = n;
    onChange(next);
  }

  return (
    <div
      className="flex flex-1 items-center justify-between gap-3 overflow-clip rounded-lg px-2 py-[3px]"
      style={{ backgroundColor: "#252525" }}
    >
      <EaseGlyph />
      <div className="flex items-start gap-2">
        <span
          className="text-[12px] leading-[18px] text-white opacity-[0.23]"
          style={{ fontFamily: PAPER.fontMono }}
        >
          Start
        </span>
        <div className="flex items-start">
          <BezierCoordInput
            value={curve[0]}
            min={0}
            max={1}
            onCommit={(n) => setAt(0, n)}
            aria-label="Start X"
          />
          <span
            className="text-[12px] leading-[18px] text-white opacity-40"
            style={{ fontFamily: PAPER.fontMono }}
          >
            ,
          </span>
          <BezierCoordInput
            value={curve[1]}
            min={-2}
            max={2}
            onCommit={(n) => setAt(1, n)}
            aria-label="Start Y"
          />
        </div>
      </div>
      <div className="flex items-start gap-2">
        <span
          className="text-[12px] leading-[18px] text-white opacity-[0.23]"
          style={{ fontFamily: PAPER.fontMono }}
        >
          End
        </span>
        <div className="flex items-start">
          <BezierCoordInput
            value={curve[2]}
            min={0}
            max={1}
            onCommit={(n) => setAt(2, n)}
            aria-label="End X"
          />
          <span
            className="text-[12px] leading-[18px] text-white opacity-40"
            style={{ fontFamily: PAPER.fontMono }}
          >
            ,
          </span>
          <BezierCoordInput
            value={curve[3]}
            min={-2}
            max={2}
            onCommit={(n) => setAt(3, n)}
            aria-label="End Y"
          />
        </div>
      </div>
    </div>
  );
}

export function EasingCurveEditor({
  value = PRESETS[2].curve,
  onChange,
  className,
}: {
  value?: Bezier4;
  onChange?: (curve: Bezier4) => void;
  className?: string;
}) {
  const trackRef = useRef<HTMLDivElement>(null);
  const [curve, setCurve] = useState<Bezier4>(value);
  const dragRef = useRef<{ handle: Handle; start: Bezier4 } | null>(null);

  useEffect(() => {
    setCurve(value);
  }, [value]);

  const setCurveBoth = useCallback(
    (next: Bezier4) => {
      setCurve(next);
      onChange?.(next);
    },
    [onChange],
  );

  const c1 = { x: curve[0] * SIZE + PAD, y: (1 - curve[1]) * SIZE + PAD };
  const c2 = { x: curve[2] * SIZE + PAD, y: (1 - curve[3]) * SIZE + PAD };
  const p0 = { x: PAD, y: PAD + SIZE };
  const p3 = { x: PAD + SIZE, y: PAD };

  function onPointerDown(handle: Handle) {
    return (e: React.PointerEvent) => {
      e.stopPropagation();
      (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
      dragRef.current = { handle, start: [...curve] as Bezier4 };
    };
  }

  function onPointerMove(e: React.PointerEvent) {
    const drag = dragRef.current;
    if (!drag) return;
    const rect = (e.currentTarget as SVGSVGElement).getBoundingClientRect();
    const nx = Math.max(0, Math.min(1, (e.clientX - rect.left - PAD) / SIZE));
    const ny = Math.max(0, Math.min(1, 1 - (e.clientY - rect.top - PAD) / SIZE));
    const next = [...drag.start] as Bezier4;
    if (drag.handle === "c1") {
      next[0] = nx;
      next[1] = ny;
    } else {
      next[2] = nx;
      next[3] = ny;
    }
    setCurveBoth(next);
  }

  function onPointerUp() {
    dragRef.current = null;
  }

  return (
    <div
      ref={trackRef}
      className={cn(
        "relative h-[184px] w-full shrink-0 overflow-hidden rounded-lg bg-[#313131]",
        className,
      )}
    >
      <DotGridSpotlight trackRef={trackRef} spacing={10} interactionRadius={128} />
      <div className="pointer-events-none absolute inset-0 flex items-start justify-center pt-2">
        <svg
          width={SIZE + PAD * 2}
          height={SIZE + PAD * 2}
          className="pointer-events-auto touch-none"
          onPointerMove={onPointerMove}
          onPointerUp={onPointerUp}
          onPointerCancel={onPointerUp}
        >
          <line x1={p0.x} y1={p0.y} x2={c1.x} y2={c1.y} stroke="rgba(255,255,255,0.2)" strokeWidth={1} />
          <line x1={p3.x} y1={p3.y} x2={c2.x} y2={c2.y} stroke="rgba(255,255,255,0.2)" strokeWidth={1} />
          <path d={bezierPath(curve)} fill="none" stroke="white" strokeWidth={2} strokeLinecap="round" />
          <rect
            x={c1.x - 5}
            y={c1.y - 5}
            width={10}
            height={10}
            fill="#2b5cff"
            stroke="white"
            strokeWidth={1}
            className="cursor-grab"
            onPointerDown={onPointerDown("c1")}
          />
          <rect
            x={c2.x - 5}
            y={c2.y - 5}
            width={10}
            height={10}
            fill="#2b5cff"
            stroke="white"
            strokeWidth={1}
            className="cursor-grab"
            onPointerDown={onPointerDown("c2")}
          />
        </svg>
      </div>
    </div>
  );
}

/**
 * Paper `8T9-0` / `8KU-0` — Animation presets + easing.
 * Edits broadcast to every clipped stroke on every layer (dock toggle opens this).
 */
export function AnimationPanel({ className }: { className?: string }) {
  const clipEasing = useProject((s) => s.clipEasing);
  const applyClipEasing = useProject((s) => s.applyClipEasing);
  const setAnimationPanelOpen = usePlayback((s) => s.setAnimationPanelOpen);

  const [preset, setPreset] = useState(clipEasing.presetId ?? "smooth");
  const [curve, setCurve] = useState<Bezier4>(clipEasing.bezier);
  const [fadeIn, setFadeIn] = useState(clipEasing.fadeInFrames);
  const [fadeOut, setFadeOut] = useState(clipEasing.fadeOutFrames);

  useEffect(() => {
    setPreset(clipEasing.presetId ?? "custom");
    setCurve(clipEasing.bezier);
    setFadeIn(clipEasing.fadeInFrames);
    setFadeOut(clipEasing.fadeOutFrames);
  }, [
    clipEasing.presetId,
    clipEasing.bezier,
    clipEasing.fadeInFrames,
    clipEasing.fadeOutFrames,
  ]);

  function commit(next: Partial<ClipEasing> & { bezier?: Bezier4 }) {
    const easingNext: ClipEasing = {
      bezier: next.bezier ?? curve,
      fadeInFrames: next.fadeInFrames ?? fadeIn,
      fadeOutFrames: next.fadeOutFrames ?? fadeOut,
      presetId: next.presetId ?? preset,
    };
    applyClipEasing(easingNext);
  }

  return (
    <div
      className={cn(
        "flex w-[316px] flex-col gap-4 overflow-visible rounded-xl border border-border/60 bg-[#131212] px-4 pb-4 pt-5 shadow-2xl",
        className,
      )}
    >
      <div className="flex items-center justify-between gap-2 overflow-visible py-1">
        <div className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
          Animation
        </div>
        <button
          type="button"
          aria-label="Close"
          onClick={() => setAnimationPanelOpen(false)}
          className="grid size-6 shrink-0 place-items-center overflow-hidden rounded-full border-0"
          style={{
            backgroundImage: PAPER.modeActiveGradient,
            // inset ring — a real border on size-6 flattens the circle top/bottom
            boxShadow: "inset 0 0 0 0.5px #C9C9C933",
          }}
        >
          <svg width={12} height={12} viewBox="0 0 8 8" fill="none" style={{ opacity: 0.8 }}>
            <path
              d="M1 1l6 6M7 1L1 7"
              stroke="#FFFFFF"
              strokeWidth="0.7"
              strokeLinecap="round"
            />
          </svg>
        </button>
      </div>
      <div className="flex flex-wrap gap-1.5">
        {PRESETS.map((p) => (
          <button
            key={p.id}
            type="button"
            onClick={() => {
              setPreset(p.id);
              setCurve(p.curve);
              commit({ bezier: p.curve, presetId: p.id });
            }}
            className={cn(
              "rounded-full border border-border/60 px-2.5 py-1 text-[11px] text-muted-foreground transition-colors hover:text-foreground",
              preset === p.id && "border-white/30 bg-white/5 text-foreground",
            )}
          >
            {p.label}
          </button>
        ))}
      </div>
      <EasingCurveEditor
        value={curve}
        onChange={(c) => {
          setCurve(c);
          setPreset("custom");
          commit({ bezier: c, presetId: "custom" });
        }}
      />
      <BezierCoordsBar
        curve={curve}
        onChange={(c) => {
          setCurve(c);
          setPreset("custom");
          commit({ bezier: c, presetId: "custom" });
        }}
      />
      <div className="flex gap-2">
        {/* flex-1 on wrapper — SliderComfortable puts className on its inner track */}
        <div className="min-w-0 flex-1">
          <SliderComfortable
            label="Fade In"
            variant="scrubber"
            value={fadeIn}
            onChange={(v) => {
              setFadeIn(v);
              commit({ fadeInFrames: v });
            }}
            min={0}
            max={48}
            step={1}
            fillColor="#40608E"
            className="!h-6 !w-full !rounded-lg !border-0 !bg-[#252525] !px-2 [&_span]:!font-mono [&_span]:!text-sm"
          />
        </div>
        <div className="min-w-0 flex-1">
          <SliderComfortable
            label="Fade Out"
            variant="scrubber"
            value={fadeOut}
            onChange={(v) => {
              setFadeOut(v);
              commit({ fadeOutFrames: v });
            }}
            min={0}
            max={48}
            step={1}
            fillColor="#40608E"
            className="!h-6 !w-full !rounded-lg !border-0 !bg-[#252525] !px-2 [&_span]:!font-mono [&_span]:!text-sm"
          />
        </div>
      </div>
      <p className="text-[11px] text-muted-foreground">
        Applies to every path on every layer. New draws inherit this curve.
      </p>
    </div>
  );
}

export { PRESETS as EASING_PRESETS };
