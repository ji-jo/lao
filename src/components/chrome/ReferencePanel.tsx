/**
 * Camera / Reference supporting panel — Paper chrome matching Canvas
 * Background → Image (chips, #252525 CTAs, elastic scrubbers).
 * Session-only; never exported. Meant to melt via GooeyConjoined.
 */

import { useEffect, useRef, useState, type PointerEvent as ReactPointerEvent } from "react";
import { useMotionValue, useSpring } from "motion/react";
import { X } from "reicon-react";
import { PAPER } from "@/components/chrome/paper-tokens";
import LayerGripIcon from "@/components/ui/layer-grip-icon";
import { SliderComfortable } from "@/components/ui/slider";
import { useReference, type ReferenceFit } from "@/state/reference";
import { IMAGE_FIT_OPTIONS } from "@/lib/image-filters";
import { cn } from "@/lib/utils";

const IMAGE_CONTROL_TRACK = "-ml-9 w-[calc(100%+36px)]";
const BG_SCRUBBER_CLASS =
  "!h-6 !w-full !rounded-lg !border-0 !bg-[#252525] [&_span]:!font-mono [&_span]:!text-sm";

/** Soft spring — slight lag behind the pointer, eases into place. */
const DRAG_SPRING = { stiffness: 280, damping: 28, mass: 0.55 };

export type PanelOffset = { x: number; y: number };

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
        "flex h-6 min-w-0 flex-1 items-center justify-center overflow-clip rounded-[7px] border-[0.4px] border-solid px-[5px] py-[3px] outline-none transition-colors",
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

function LabeledScrubber({
  label,
  value,
  onChange,
  min,
  max,
  step,
  formatValue,
}: {
  label: string;
  value: number;
  onChange: (v: number) => void;
  min: number;
  max: number;
  step: number;
  formatValue?: (v: number) => string;
}) {
  return (
    <div className="flex w-full items-center gap-6">
      <span
        className="w-[72px] shrink-0 truncate text-xs leading-4 text-white/70"
        style={{ fontFamily: PAPER.fontSans }}
        title={label}
      >
        {label}
      </span>
      <div className="min-w-0 flex-1">
        <div className={IMAGE_CONTROL_TRACK}>
          <SliderComfortable
            variant="scrubber"
            aria-label={label}
            value={value}
            onChange={onChange}
            min={min}
            max={max}
            step={step}
            formatValue={formatValue}
            fillColor="#40608E"
            className={BG_SCRUBBER_CLASS}
          />
        </div>
      </div>
    </div>
  );
}

function clampOffset(
  x: number,
  y: number,
  panelW: number,
  panelH: number,
  originLeft: number,
  originTop: number,
): PanelOffset {
  const pad = 24;
  const absLeft = originLeft + x;
  const absTop = originTop + y;
  const minL = pad - panelW + 48;
  const maxL = window.innerWidth - pad - 48;
  const minT = pad - Math.min(48, panelH * 0.25);
  const maxT = window.innerHeight - pad - 48;
  return {
    x: Math.min(maxL, Math.max(minL, absLeft)) - originLeft,
    y: Math.min(maxT, Math.max(minT, absTop)) - originTop,
  };
}

/** Body only — wrap with GooeyConjoined (surface from host) or ReferencePanel shell. */
export function ReferencePanelBody({
  onClose,
  onPanelOffsetChange,
  initialOffset = { x: 0, y: 0 },
}: {
  onClose: () => void;
  onPanelOffsetChange?: (offset: PanelOffset) => void;
  initialOffset?: PanelOffset;
}) {
  const url = useReference((s) => s.url);
  const kind = useReference((s) => s.kind);
  const opacity = useReference((s) => s.opacity);
  const fit = useReference((s) => s.fit);
  const zoom = useReference((s) => s.zoom);
  const setReference = useReference((s) => s.setReference);
  const setOpacity = useReference((s) => s.setOpacity);
  const setFit = useReference((s) => s.setFit);
  const setZoom = useReference((s) => s.setZoom);
  const clear = useReference((s) => s.clear);
  const fileRef = useRef<HTMLInputElement>(null);
  const rootRef = useRef<HTMLDivElement>(null);
  const hasSrc = !!url;

  const [dragging, setDragging] = useState(false);
  const dragRef = useRef<{
    pointerId: number;
    startClientX: number;
    startClientY: number;
    originX: number;
    originY: number;
    layoutLeft: number;
    layoutTop: number;
  } | null>(null);

  const targetX = useMotionValue(initialOffset.x);
  const targetY = useMotionValue(initialOffset.y);
  const springX = useSpring(targetX, DRAG_SPRING);
  const springY = useSpring(targetY, DRAG_SPRING);

  useEffect(() => {
    if (!onPanelOffsetChange) return;
    const push = () =>
      onPanelOffsetChange({ x: springX.get(), y: springY.get() });
    const unsubX = springX.on("change", push);
    const unsubY = springY.on("change", push);
    push();
    return () => {
      unsubX();
      unsubY();
    };
  }, [springX, springY, onPanelOffsetChange]);

  useEffect(() => {
    if (!dragging) return;
    const onMove = (e: PointerEvent) => {
      const d = dragRef.current;
      if (!d || e.pointerId !== d.pointerId) return;
      const rawX = d.originX + (e.clientX - d.startClientX);
      const rawY = d.originY + (e.clientY - d.startClientY);
      const el = rootRef.current;
      const w = el?.offsetWidth ?? 312;
      const h = el?.offsetHeight ?? 332;
      const next = clampOffset(rawX, rawY, w, h, d.layoutLeft, d.layoutTop);
      targetX.set(next.x);
      targetY.set(next.y);
    };
    const onUp = (e: PointerEvent) => {
      const d = dragRef.current;
      if (!d || e.pointerId !== d.pointerId) return;
      dragRef.current = null;
      setDragging(false);
    };
    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
    window.addEventListener("pointercancel", onUp);
    return () => {
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
      window.removeEventListener("pointercancel", onUp);
    };
  }, [dragging, targetX, targetY]);

  function onGripPointerDown(e: ReactPointerEvent<HTMLButtonElement>) {
    e.preventDefault();
    e.stopPropagation();
    const el = rootRef.current;
    const rect = el?.getBoundingClientRect();
    const ox = targetX.get();
    const oy = targetY.get();
    // Layout origin = current visual position minus spring offset
    const layoutLeft = (rect?.left ?? 0) - ox;
    const layoutTop = (rect?.top ?? 0) - oy;
    dragRef.current = {
      pointerId: e.pointerId,
      startClientX: e.clientX,
      startClientY: e.clientY,
      originX: ox,
      originY: oy,
      layoutLeft,
      layoutTop,
    };
    setDragging(true);
    try {
      e.currentTarget.setPointerCapture(e.pointerId);
    } catch {
      // synthetic events
    }
  }

  return (
    <div
      ref={rootRef}
      className="flex w-[312px] flex-col items-start gap-3 overflow-hidden rounded-xl p-4 antialiased"
      style={{ fontFamily: PAPER.fontSans }}
      onPointerDown={(e) => e.stopPropagation()}
    >
      <div className="flex w-full items-center justify-between gap-3">
        <div className="flex min-w-0 items-center gap-2">
          <button
            type="button"
            onPointerDown={onGripPointerDown}
            aria-label="Move reference panel"
            title="Drag to move"
            className={cn(
              "relative grid h-[12px] w-[7px] shrink-0 cursor-grab touch-none place-items-center self-center transition-[opacity,scale] duration-150 ease-out before:absolute before:-inset-[6px] before:content-[''] active:cursor-grabbing",
              dragging
                ? "opacity-100 scale-90"
                : "opacity-60 hover:opacity-100 active:scale-90",
            )}
          >
            <LayerGripIcon size={12} />
          </button>
          <span className="text-sm font-medium leading-none text-white">
            Reference
          </span>
        </div>
        <div className="flex items-center gap-1">
          {hasSrc ? (
            <button
              type="button"
              onClick={clear}
              className="rounded-md px-2 py-1 text-[11px] text-white/50 outline-none transition-colors hover:bg-[#313131] hover:text-white"
            >
              Clear
            </button>
          ) : null}
          <button
            type="button"
            onClick={onClose}
            aria-label="Close reference"
            className="grid size-6 place-items-center rounded-md text-white/50 outline-none transition-colors hover:bg-[#313131] hover:text-white"
          >
            <X size={14} />
          </button>
        </div>
      </div>

      <div
        className={cn(
          "relative aspect-square w-full shrink-0 overflow-hidden rounded-lg bg-[#1a1a1a]",
          !hasSrc && "flex items-center justify-center",
        )}
      >
        {hasSrc ? (
          kind === "video" ? (
            <video
              src={url!}
              className="absolute inset-0 size-full object-cover"
              muted
              playsInline
              loop
              autoPlay
            />
          ) : (
            <img
              src={url!}
              alt=""
              className="absolute inset-0 size-full object-cover object-center"
              draggable={false}
            />
          )
        ) : (
          <button
            type="button"
            onClick={() => fileRef.current?.click()}
            className="rounded-full bg-[#252525] px-3 py-1.5 text-xs leading-4 text-white/80 outline-none transition-colors hover:bg-[#313131]"
            style={{ fontFamily: PAPER.fontSans }}
          >
            Choose Image…
          </button>
        )}
        {hasSrc ? (
          <div className="absolute inset-0 z-[1] flex items-center justify-center">
            <button
              type="button"
              onClick={() => fileRef.current?.click()}
              className="rounded-full bg-[#252525] px-3 py-1.5 text-xs leading-4 text-white/80 outline-none transition-colors hover:bg-[#313131]"
              style={{ fontFamily: PAPER.fontSans }}
            >
              Reupload Image
            </button>
          </div>
        ) : null}
      </div>

      <div className="flex w-full items-center gap-6">
        <span
          className="w-[72px] shrink-0 truncate text-xs leading-4 text-white/70"
          style={{ fontFamily: PAPER.fontSans }}
        >
          Type
        </span>
        <div className="min-w-0 flex-1">
          <div className={cn(IMAGE_CONTROL_TRACK, "flex items-center gap-1.5")}>
            {IMAGE_FIT_OPTIONS.map((o) => (
              <Chip
                key={o.id}
                label={o.label}
                active={fit === o.id}
                onClick={() => setFit(o.id as ReferenceFit)}
              />
            ))}
          </div>
        </div>
      </div>

      <LabeledScrubber
        label="Zoom"
        value={zoom}
        onChange={setZoom}
        min={0.5}
        max={3}
        step={0.05}
        formatValue={(v) => `${Math.round(v * 100)}%`}
      />
      <LabeledScrubber
        label="Opacity"
        value={Math.round(opacity * 100)}
        onChange={(v) => setOpacity(v / 100)}
        min={5}
        max={100}
        step={1}
        formatValue={(v) => `${Math.round(v)}%`}
      />

      <input
        ref={fileRef}
        type="file"
        accept="image/*,video/*"
        className="hidden"
        onChange={(e) => {
          const file = e.target.files?.[0];
          if (file) setReference(file);
          e.target.value = "";
        }}
      />
    </div>
  );
}

/** Standalone floating fallback (preview bar). */
export function ReferencePanel({
  open,
  onClose,
}: {
  open: boolean;
  onClose: () => void;
}) {
  const [offset, setOffset] = useState<PanelOffset>({ x: 0, y: 0 });
  if (!open) return null;
  return (
    <div
      className="pointer-events-auto absolute right-4 top-16 z-30 overflow-hidden rounded-xl shadow-2xl"
      style={{
        backgroundColor: PAPER.surface,
        transform: `translate3d(${offset.x}px, ${offset.y}px, 0)`,
      }}
    >
      <ReferencePanelBody
        onClose={onClose}
        initialOffset={offset}
        onPanelOffsetChange={setOffset}
      />
    </div>
  );
}
