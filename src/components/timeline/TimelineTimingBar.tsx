import { useEffect, useRef, useState } from "react";
import { PAPER } from "@/components/chrome/paper-tokens";
import { Tooltip } from "@/components/motion/tooltip";
import { EditableNumber } from "@/components/timeline/TimelineDockParts";
import { CELL_GAP } from "@/components/timeline/TimelineLayerRow";

/**
 * Timing ruler — Paper "timing" (AKB-0 stop-motion / 6JD-0 Animatron), scaled
 * +20% (D's explicit timeline-scale override; see `Timeline.tsx`).
 *
 * Paper's mock spaces its second labels evenly for looks; here they land on the
 * real frame grid (`fps × cell pitch`) and ride the shared horizontal offset, so
 * a tick is always over the frame it names.
 *
 * Left cluster: record dot + ms readout (Paper AKB-0's AMQ-0/AMR-0 and
 * AMV-0 — no "bring to layer 1"/AMY-0, D had it removed):
 * - the record dot toggles Auto-Key (Paper AMQ-0/AMR-0, same glyph as
 *   Animatron's 6LS-0) — the ONLY auto-key control
 * - the duration readout is editable — typing an ms value resizes the timeline
 * - the ruler scrubs the playhead
 * - the magnifier resets zoom to 100%
 * - the slider drives cell zoom
 * - the layers glyph hides the entire layer-row stack (timing bar stays;
 *   whole-player collapse is the drag handle above the dock)
 *
 * Every icon button shares D's hoverable-icon rule: `#DADADA` idle, `#313131`
 * bg (4px radius) + white icon on hover.
 */

const BAR_H = 24;
/** zoom slider — Paper: 90×10 track, 2×10 thumb, scaled +20% */
const SLIDER_W = 108;
const SLIDER_H = 12;
const TICK_COUNT = 17;

const ICON = "#DADADA";
/** every hover chip in this bar shares this radius (D's explicit rule) */
const HOVER_RADIUS = 4;

/** Small hover-chip icon button shared by every glyph in this bar. */
function IconChip({
  label,
  onClick,
  active,
  activeColor,
  width = 19,
  height = 19,
  children,
}: {
  label: string;
  onClick: () => void;
  active?: boolean;
  /** icon color while `active` (defaults to white, same as hover) */
  activeColor?: string;
  width?: number;
  height?: number;
  children: (color: string) => React.ReactNode;
}) {
  const [hover, setHover] = useState(false);
  const lit = hover || active;
  const color = lit ? (active ? (activeColor ?? "#FFFFFF") : "#FFFFFF") : ICON;
  return (
    <Tooltip content={label}>
      <button
        type="button"
        onClick={onClick}
        aria-label={label}
        aria-pressed={active}
        onPointerEnter={() => setHover(true)}
        onPointerLeave={() => setHover(false)}
        className="relative grid shrink-0 cursor-pointer place-items-center overflow-clip transition-colors"
        style={{ width, height, borderRadius: HOVER_RADIUS, backgroundColor: hover ? "#313131" : "transparent" }}
      >
        {children(color)}
      </button>
    </Tooltip>
  );
}

export function TimelineTimingBar({
  frameCount,
  fps,
  frameIndex,
  cellWidth,
  cellsInset,
  scrollLeft,
  zoom,
  zoomMin,
  zoomMax,
  autoRecord,
  onToggleAutoRecord,
  layersCollapsed,
  onToggleLayersCollapsed,
  onScrub,
  onZoom,
  onSetDurationMs,
}: {
  frameCount: number;
  fps: number;
  frameIndex: number;
  cellWidth: number;
  /** live label-lane inset — shrinks when the layer stack is hidden */
  cellsInset: number;
  scrollLeft: number;
  zoom: number;
  zoomMin: number;
  zoomMax: number;
  autoRecord: boolean;
  onToggleAutoRecord: () => void;
  layersCollapsed: boolean;
  onToggleLayersCollapsed: () => void;
  onScrub: (frame: number) => void;
  onZoom: (zoom: number) => void;
  onSetDurationMs: (ms: number) => void;
}) {
  const rootRef = useRef<HTMLDivElement>(null);
  const rulerRef = useRef<HTMLDivElement>(null);
  const sliderRef = useRef<HTMLDivElement>(null);
  const scrubbing = useRef(false);
  const slidingRef = useRef(false);

  const pitch = cellWidth + CELL_GAP;
  const totalMs = Math.round((frameCount / Math.max(1, fps)) * 1000);
  const playheadMs = Math.round((frameIndex / Math.max(1, fps)) * 1000);
  const seconds = Math.max(1, Math.ceil(frameCount / Math.max(1, fps)));
  const zoomFrac = Math.max(0, Math.min(1, (zoom - zoomMin) / (zoomMax - zoomMin)));
  const fillW = Math.round(zoomFrac * SLIDER_W);
  /** left cluster (record + readout) needs clearance even when the label
   *  lane is collapsed and cellsInset shrinks */
  const rulerLeft = Math.max(cellsInset - 4, 70);

  function frameFromClientX(clientX: number) {
    const el = rulerRef.current;
    if (!el) return frameIndex;
    const x = clientX - el.getBoundingClientRect().left + scrollLeft;
    return Math.max(0, Math.min(frameCount - 1, Math.floor(x / pitch)));
  }

  function zoomFromClientX(clientX: number) {
    const el = sliderRef.current;
    if (!el) return zoom;
    const rect = el.getBoundingClientRect();
    const frac = Math.max(0, Math.min(1, (clientX - rect.left) / rect.width));
    return zoomMin + frac * (zoomMax - zoomMin);
  }

  // drag continues outside the element, so both gestures live on window
  useEffect(() => {
    function onMove(e: PointerEvent) {
      if (scrubbing.current) onScrub(frameFromClientX(e.clientX));
      else if (slidingRef.current) onZoom(zoomFromClientX(e.clientX));
    }
    function onUp() {
      scrubbing.current = false;
      slidingRef.current = false;
    }
    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
    window.addEventListener("pointercancel", onUp);
    return () => {
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
      window.removeEventListener("pointercancel", onUp);
    };
  });

  // Ctrl/Cmd + scroll (and trackpad pinch → ctrlKey) zooms here too — native
  // listener because React wheel is passive and can't preventDefault.
  useEffect(() => {
    const el = rootRef.current;
    if (!el) return;
    function onWheel(e: WheelEvent) {
      if (!(e.ctrlKey || e.metaKey)) return;
      e.preventDefault();
      const next = zoom * (1 - e.deltaY * 0.01);
      onZoom(Math.min(zoomMax, Math.max(zoomMin, next)));
    }
    el.addEventListener("wheel", onWheel, { passive: false });
    return () => el.removeEventListener("wheel", onWheel);
  }, [zoom, zoomMin, zoomMax, onZoom]);

  return (
    <div
      ref={rootRef}
      className="relative w-full min-w-0 shrink-0 overflow-clip rounded-[14px]"
      style={{ height: BAR_H, backgroundColor: PAPER.trackBg }}
    >
      {/* ruler — starts past the left cluster and scrubs */}
      <div
        ref={rulerRef}
        role="slider"
        aria-label="Scrub playhead"
        aria-valuemin={1}
        aria-valuemax={frameCount}
        aria-valuenow={frameIndex + 1}
        tabIndex={0}
        onPointerDown={(e) => {
          scrubbing.current = true;
          onScrub(frameFromClientX(e.clientX));
        }}
        onKeyDown={(e) => {
          if (e.key === "ArrowLeft") onScrub(Math.max(0, frameIndex - 1));
          else if (e.key === "ArrowRight") onScrub(Math.min(frameCount - 1, frameIndex + 1));
        }}
        className="absolute inset-y-0 cursor-ew-resize overflow-clip"
        style={{ left: rulerLeft, right: 0 }}
      >
        <div
          className="absolute inset-y-0 left-0"
          style={{ transform: `translateX(${-scrollLeft}px)` }}
        >
          {Array.from({ length: seconds }, (_, i) => {
            const s = i + 1;
            const x = s * fps * pitch;
            return (
              <span key={s}>
                <span
                  className="absolute top-1/2 -translate-y-1/2 text-[10px] leading-[12px] text-white opacity-20 tabular-nums"
                  style={{ left: x - fps * pitch, fontFamily: PAPER.fontMono }}
                >
                  {s}s
                </span>
                {/* Paper puts a tick between labels */}
                <span
                  className="absolute top-1/2 w-px -translate-y-1/2 opacity-60"
                  style={{ left: x - (fps * pitch) / 2, height: 12, backgroundColor: "#FFFFFF" }}
                />
              </span>
            );
          })}
          {/* playhead */}
          <span
            className="absolute top-0 w-px"
            style={{
              left: frameIndex * pitch + cellWidth / 2,
              height: BAR_H,
              backgroundColor: PAPER.frameActive,
            }}
          />
        </div>
      </div>

      {/* left cluster — opaque, so it masks the ruler scrolling underneath */}
      <div className="absolute left-0 top-0 flex h-full items-center gap-[2px] px-[2px]" style={{ backgroundColor: PAPER.trackBg }}>
        {/* auto-record — Paper 6LS-0. Doubles as stop-motion Auto-Key (see AGENTS.md). */}
        <IconChip
          label={autoRecord ? "Auto-key on" : "Auto-key off"}
          onClick={onToggleAutoRecord}
          active={autoRecord}
          activeColor={PAPER.frameActive}
        >
          {(color) => (
            <svg width={14} height={14} viewBox="0 0 4.5 4.5" xmlns="http://www.w3.org/2000/svg">
              <path
                d="M1.641 2.25C1.641 1.913 1.913 1.641 2.25 1.641 2.587 1.641 2.859 1.913 2.859 2.25 2.859 2.587 2.587 2.859 2.25 2.859 1.913 2.859 1.641 2.587 1.641 2.25Z"
                fill={color}
              />
              <path
                fillRule="evenodd"
                clipRule="evenodd"
                d="M2.25 4.125C3.286 4.125 4.125 3.286 4.125 2.25 4.125 1.214 3.286 0.375 2.25 0.375 1.214 0.375 0.375 1.214 0.375 2.25 0.375 3.286 1.214 4.125 2.25 4.125ZM2.25 1.359C1.758 1.359 1.359 1.758 1.359 2.25 1.359 2.742 1.758 3.141 2.25 3.141 2.742 3.141 3.141 2.742 3.141 2.25 3.141 1.758 2.742 1.359 2.25 1.359Z"
                fill={color}
              />
            </svg>
          )}
        </IconChip>

        {/* duration readout — click to type a target ms and resize the timeline */}
        <Tooltip content={`Playhead ${playheadMs} ms of ${totalMs} ms — click to set duration`}>
          <span className="flex items-start gap-0.5 tabular-nums" style={{ fontFamily: PAPER.fontMono }}>
            <EditableNumber
              value={totalMs}
              onCommit={onSetDurationMs}
              min={Math.round(1000 / fps)}
              max={6000000}
              aria-label="Timeline duration in milliseconds"
              className="rounded-[4px] text-[12px] leading-[14px] text-white opacity-90 hover:bg-[#313131]"
            />
            <span className="text-[12px] leading-[14px] text-white opacity-30">ms</span>
          </span>
        </Tooltip>
      </div>

      {/* right cluster — opaque, so it masks the ruler scrolling underneath */}
      <div className="absolute right-0 top-0 flex items-start gap-[2px]">
        <div
          className="flex items-center justify-center gap-[6px] p-[5px]"
          style={{ backgroundColor: PAPER.trackBg }}
        >
          <IconChip label="Reset zoom to 100%" onClick={() => onZoom(1)} width={16} height={16}>
            {(color) => (
              <svg width={14} height={14} viewBox="10.331 10.331 4.505 4.505" xmlns="http://www.w3.org/2000/svg">
                <path
                  fillRule="evenodd"
                  clipRule="evenodd"
                  d="M14.14 13.759C14.178 13.762 14.222 13.776 14.272 13.79C14.276 13.792 14.28 13.793 14.286 13.794C14.29 13.796 14.294 13.797 14.298 13.798C14.342 13.812 14.384 13.824 14.417 13.842C14.6 13.939 14.66 14.174 14.545 14.348C14.525 14.378 14.494 14.409 14.46 14.442C14.457 14.445 14.454 14.448 14.45 14.45C14.448 14.454 14.445 14.457 14.442 14.46C14.409 14.494 14.378 14.525 14.348 14.545C14.174 14.66 13.939 14.6 13.842 14.417C13.824 14.384 13.812 14.342 13.798 14.298C13.797 14.294 13.796 14.29 13.794 14.286C13.793 14.28 13.792 14.276 13.79 14.272C13.776 14.222 13.762 14.178 13.759 14.14C13.74 13.923 13.923 13.74 14.14 13.759ZM12.396 10.847C11.54 10.847 10.847 11.54 10.847 12.396C10.847 13.252 11.54 13.946 12.396 13.946C13.252 13.946 13.946 13.252 13.946 12.396C13.946 11.54 13.252 10.847 12.396 10.847ZM10.564 12.396C10.564 11.384 11.384 10.565 12.396 10.565C13.407 10.565 14.228 11.384 14.228 12.396C14.228 13.407 13.407 14.228 12.396 14.228C11.384 14.228 10.564 13.407 10.564 12.396Z"
                  fill={color}
                />
              </svg>
            )}
          </IconChip>

          {/* cell-zoom slider */}
          <div
            ref={sliderRef}
            role="slider"
            aria-label="Frame zoom"
            aria-valuemin={Math.round(zoomMin * 100)}
            aria-valuemax={Math.round(zoomMax * 100)}
            aria-valuenow={Math.round(zoom * 100)}
            tabIndex={0}
            onPointerDown={(e) => {
              slidingRef.current = true;
              onZoom(zoomFromClientX(e.clientX));
            }}
            onKeyDown={(e) => {
              const step = (zoomMax - zoomMin) / 20;
              if (e.key === "ArrowLeft") onZoom(Math.max(zoomMin, zoom - step));
              else if (e.key === "ArrowRight") onZoom(Math.min(zoomMax, zoom + step));
            }}
            className="relative shrink-0 cursor-ew-resize overflow-clip rounded-[6px]"
            style={{ width: SLIDER_W, height: SLIDER_H, backgroundColor: "#252525" }}
          >
            <div
              className="absolute top-1/2 flex -translate-y-1/2 items-start opacity-40"
              style={{ left: 5, gap: 5 }}
            >
              {Array.from({ length: TICK_COUNT }, (_, i) => (
                <span
                  key={i}
                  className="w-px shrink-0 rounded-full opacity-10"
                  style={{ height: 10, backgroundColor: ICON }}
                />
              ))}
            </div>
            <div
              className="absolute left-0 top-0"
              style={{ width: fillW, height: SLIDER_H, backgroundColor: PAPER.frameActive }}
            />
            <div
              className="absolute top-1/2 -translate-y-1/2 rounded-full"
              style={{ left: Math.max(0, fillW - 1), width: 2, height: SLIDER_H, backgroundColor: "#DDDDDD" }}
            />
          </div>
        </div>

        {/* collapse layers — Paper AMM-0/68F-0, the ONLY collapse button in this bar */}
        <IconChip
          label={layersCollapsed ? "Show layers" : "Collapse layers"}
          onClick={onToggleLayersCollapsed}
          active={layersCollapsed}
          width={29}
          height={BAR_H}
        >
          {(color) => (
            <svg width={14} height={14} viewBox="0 0 4.5 4.5" xmlns="http://www.w3.org/2000/svg">
              <path
                d="M2.589 2.073C2.701 2.073 2.792 1.981 2.792 1.869 2.792 1.756 2.701 1.664 2.589 1.664H2.265L2.869 1.06C2.949 0.98 2.949 0.851 2.869 0.771 2.789 0.691 2.66 0.691 2.58 0.771L1.976 1.375V1.051C1.976 0.939 1.884 0.848 1.771 0.848 1.659 0.848 1.567 0.939 1.567 1.051V1.869C1.567 1.981 1.659 2.073 1.771 2.073H2.589Z"
                transform="translate(4.83 1.29) rotate(135)"
                fill={color}
              />
              <path
                fillRule="evenodd"
                clipRule="evenodd"
                d="M1.203 4.23C0.932 4.194 0.718 4.118 0.55 3.95C0.382 3.782 0.306 3.568 0.27 3.297C0.234 3.033 0.234 2.694 0.234 2.261L0.234 2.239C0.234 1.806 0.234 1.467 0.27 1.203C0.306 0.932 0.382 0.718 0.55 0.55C0.718 0.382 0.932 0.306 1.203 0.27C1.467 0.234 1.806 0.234 2.239 0.234L2.261 0.234C2.694 0.234 3.033 0.234 3.297 0.27C3.568 0.306 3.782 0.382 3.95 0.55C4.118 0.718 4.194 0.932 4.23 1.203C4.266 1.467 4.266 1.806 4.266 2.239L4.266 2.261C4.266 2.694 4.266 3.033 4.23 3.297C4.194 3.568 4.118 3.782 3.95 3.95C3.782 4.118 3.568 4.194 3.297 4.23C3.033 4.266 2.694 4.266 2.261 4.266L2.239 4.266C1.806 4.266 1.467 4.266 1.203 4.23ZM0.75 3C0.937 3 1.07 3 1.312 3C1.5 3 1.804 3 2.25 3C2.696 3 2.812 3 3 3C3.242 3 3.402 3 3.554 3C3.741 3 3.813 3 3.957 3C3.99 2.756 3.984 2.696 3.984 2.25C3.984 1.804 3.984 1.484 3.951 1.24C3.919 1 3.858 0.856 3.751 0.749C3.644 0.642 3.5 0.581 3.26 0.549C3.016 0.516 2.696 0.516 2.25 0.516C1.804 0.516 1.484 0.516 1.24 0.549C1 0.581 0.856 0.642 0.749 0.749C0.642 0.856 0.581 1 0.549 1.24C0.516 1.484 0.516 1.804 0.516 2.25C0.516 2.696 0.529 2.756 0.562 3C0.75 3 0.75 3 0.75 3Z"
                fill={color}
              />
            </svg>
          )}
        </IconChip>
      </div>
    </div>
  );
}
