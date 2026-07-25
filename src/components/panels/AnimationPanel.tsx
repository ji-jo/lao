import { useCallback, useEffect, useRef, useState } from "react";
import { DotGridSpotlight } from "@/components/ui/dot-grid-spotlight";
import { cn } from "@/lib/utils";
import {
  DEFAULT_CLIP_EASING,
  type Bezier4,
  type ClipEasing,
} from "@/model/types";
import { useProject } from "@/state/project";
import { resolveCel } from "@/model/types";

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
        "relative h-[156px] w-full shrink-0 overflow-hidden rounded-lg bg-[#313131]",
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
 * Paper `8T9-0` / `8KU-0` — Animation presets + easing, wired to active Animatron clip.
 */
export function AnimationPanel({ className }: { className?: string }) {
  const project = useProject((s) => s.project);
  const layerIndex = useProject((s) => s.layerIndex);
  const frameIndex = useProject((s) => s.frameIndex);
  const updateStrokeClip = useProject((s) => s.updateStrokeClip);

  const layer = project.layers[layerIndex];
  const cel =
    project.workflow === "animatron"
      ? layer?.frames.find((f) => f) ?? null
      : layer
        ? resolveCel(layer, frameIndex)
        : null;
  const stroke = cel?.strokes[cel.strokes.length - 1];
  const easing: ClipEasing = stroke?.clip?.easing ?? DEFAULT_CLIP_EASING;

  const [preset, setPreset] = useState(easing.presetId ?? "smooth");
  const [curve, setCurve] = useState<Bezier4>(easing.bezier);
  const [fadeIn, setFadeIn] = useState(easing.fadeInFrames);
  const [fadeOut, setFadeOut] = useState(easing.fadeOutFrames);

  useEffect(() => {
    setPreset(easing.presetId ?? "custom");
    setCurve(easing.bezier);
    setFadeIn(easing.fadeInFrames);
    setFadeOut(easing.fadeOutFrames);
  }, [stroke?.id, easing.presetId, easing.bezier, easing.fadeInFrames, easing.fadeOutFrames]);

  function commit(next: Partial<ClipEasing> & { bezier?: Bezier4 }) {
    if (!stroke?.clip) return;
    const easingNext: ClipEasing = {
      bezier: next.bezier ?? curve,
      fadeInFrames: next.fadeInFrames ?? fadeIn,
      fadeOutFrames: next.fadeOutFrames ?? fadeOut,
      presetId: next.presetId ?? preset,
    };
    updateStrokeClip(stroke.id, { ...stroke.clip, easing: easingNext });
  }

  return (
    <div
      className={cn(
        "flex w-[316px] flex-col gap-4 rounded-xl border border-border/60 bg-[#131212] p-4 shadow-2xl",
        className,
      )}
    >
      <div className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
        Animation
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
      <div className="flex items-center gap-3 rounded-lg border border-border/40 bg-black/20 px-3 py-2 font-mono text-[11px] text-muted-foreground">
        <span className="text-foreground/80">⌇</span>
        <span>
          Start: {curve[0].toFixed(2)}, {curve[1].toFixed(2)}
        </span>
        <span>
          End: {curve[2].toFixed(2)}, {curve[3].toFixed(2)}
        </span>
      </div>
      <div className="flex gap-2">
        <label className="flex flex-1 items-center gap-2 rounded-lg border border-border/50 bg-primary/10 px-3 py-2 text-[12px]">
          <span className="text-foreground">Fade In</span>
          <input
            type="number"
            min={0}
            max={48}
            value={fadeIn}
            onChange={(e) => {
              const v = Math.max(0, Number(e.target.value) || 0);
              setFadeIn(v);
              commit({ fadeInFrames: v });
            }}
            className="ml-auto w-10 bg-transparent text-right font-mono text-foreground outline-none"
          />
        </label>
        <label className="flex flex-1 items-center gap-2 rounded-lg border border-border/50 bg-primary/10 px-3 py-2 text-[12px]">
          <span className="text-foreground">Fade Out</span>
          <input
            type="number"
            min={0}
            max={48}
            value={fadeOut}
            onChange={(e) => {
              const v = Math.max(0, Number(e.target.value) || 0);
              setFadeOut(v);
              commit({ fadeOutFrames: v });
            }}
            className="ml-auto w-10 bg-transparent text-right font-mono text-foreground outline-none"
          />
        </label>
      </div>
      {!stroke?.clip && (
        <p className="text-[11px] text-muted-foreground">
          Draw a path in Animatron to attach easing to its clip.
        </p>
      )}
    </div>
  );
}

export { PRESETS as EASING_PRESETS };
