import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { cn } from "@/lib/utils";
import { PAPER } from "@/components/chrome/paper-tokens";

/**
 * Horizontal custom scrollbar.
 *
 * NOTE: `react-custom-scroll` (used by <CustomScroll/>) is vertical-only — its
 * source tracks scrollTop/clientHeight and hard-sets `overflow-x: hidden`, so it
 * cannot drive a horizontal bar. This mirrors its behaviour on the X axis:
 * a native scroll viewport (so wheel / trackpad / touch / keyboard all work)
 * with the native bar hidden and a custom draggable thumb synced to scrollLeft.
 *
 * Also owns the timeline's wheel semantics (Paper 5S8-0 normal state):
 * plain wheel pans horizontally, ctrl+wheel (trackpad pinch) reports to
 * `onPinchZoom` instead of scrolling, and a progressive blur hints at frames
 * extending past the right edge. The bar (and its blur) disappear entirely
 * once the content fits — e.g. after zooming out.
 */

const MIN_THUMB = 32;
const BAR_THICKNESS = 5; // px — Paper minimal scrollbar: bar + track both 4-6px
const EDGE_FADE_WIDTH = 40; // px — progressive-blur zone on the right edge
const BLUR_LAYERS = [1, 2, 4, 8]; // px, stacked so blur intensifies toward the edge

export interface HorizontalScrollProps {
  children?: ReactNode;
  className?: string;
  id?: string;
  /** wrapper around the scrolling content (use to set `w-max`) */
  contentClassName?: string;
  /** keep the bar visible even when idle */
  alwaysVisible?: boolean;
  handleClass?: string;
  /** ctrl+wheel (trackpad pinch / ctrl+scroll) reports here instead of scrolling. Negative deltaY = pinch out (zoom in). */
  onPinchZoom?: (deltaY: number) => void;
}

export function HorizontalScroll({
  children,
  className,
  id,
  contentClassName,
  alwaysVisible = false,
  handleClass,
  onPinchZoom,
}: HorizontalScrollProps) {
  const viewportRef = useRef<HTMLDivElement>(null);
  const trackRef = useRef<HTMLDivElement>(null);
  const dragRef = useRef<{ pointerX: number; scrollLeft: number } | null>(null);
  const [thumb, setThumb] = useState({ width: 0, left: 0, scrollable: false, atEnd: true });

  const measure = useCallback(() => {
    const vp = viewportRef.current;
    const track = trackRef.current;
    if (!vp || !track) return;
    const trackWidth = track.clientWidth;
    const { scrollWidth, clientWidth, scrollLeft } = vp;
    const scrollable = scrollWidth - clientWidth > 1;
    if (!scrollable) {
      setThumb((t) =>
        t.scrollable || !t.atEnd ? { width: 0, left: 0, scrollable: false, atEnd: true } : t,
      );
      return;
    }
    const atEnd = scrollWidth - clientWidth - scrollLeft <= 1;
    const ratio = clientWidth / scrollWidth;
    const width = Math.max(Math.round(ratio * trackWidth), MIN_THUMB);
    const maxScroll = scrollWidth - clientWidth;
    const left = Math.round((scrollLeft / maxScroll) * (trackWidth - width));
    setThumb({ width, left, scrollable: true, atEnd });
  }, []);

  useLayoutEffect(() => {
    measure();
    const vp = viewportRef.current;
    if (!vp) return;
    const ro = new ResizeObserver(measure);
    ro.observe(vp);
    if (vp.firstElementChild) ro.observe(vp.firstElementChild);
    return () => ro.disconnect();
  }, [measure, children]);

  useEffect(() => {
    function onMove(e: PointerEvent) {
      const drag = dragRef.current;
      const vp = viewportRef.current;
      const track = trackRef.current;
      if (!drag || !vp || !track) return;
      const trackWidth = track.clientWidth;
      const maxScroll = vp.scrollWidth - vp.clientWidth;
      const travel = trackWidth - thumb.width;
      if (travel <= 0) return;
      const dx = e.clientX - drag.pointerX;
      vp.scrollLeft = drag.scrollLeft + (dx / travel) * maxScroll;
    }
    function onUp() {
      dragRef.current = null;
    }
    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
    window.addEventListener("pointercancel", onUp);
    return () => {
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
      window.removeEventListener("pointercancel", onUp);
    };
  }, [thumb.width]);

  // wheel: plain vertical wheel pans the track; ctrl+wheel (pinch / ctrl+scroll) zooms
  useEffect(() => {
    const vp = viewportRef.current;
    if (!vp) return;
    function onWheel(e: WheelEvent) {
      if (e.ctrlKey) {
        if (onPinchZoom) {
          e.preventDefault();
          onPinchZoom(e.deltaY);
        }
        return;
      }
      if (Math.abs(e.deltaY) > Math.abs(e.deltaX)) {
        e.preventDefault();
        vp!.scrollLeft += e.deltaY;
      }
      // else: let native two-finger horizontal trackpad panning (deltaX) through
    }
    vp.addEventListener("wheel", onWheel, { passive: false });
    return () => vp.removeEventListener("wheel", onWheel);
  }, [onPinchZoom]);

  function onTrackPointerDown(e: React.PointerEvent) {
    const vp = viewportRef.current;
    const track = trackRef.current;
    if (!vp || !track) return;
    // clicking the bare track pages toward the click point
    const rect = track.getBoundingClientRect();
    const clickX = e.clientX - rect.left;
    if (clickX < thumb.left || clickX > thumb.left + thumb.width) {
      const travel = track.clientWidth - thumb.width;
      const maxScroll = vp.scrollWidth - vp.clientWidth;
      const target = Math.max(0, Math.min(clickX - thumb.width / 2, travel));
      vp.scrollLeft = travel > 0 ? (target / travel) * maxScroll : 0;
    }
  }

  return (
    <div className={cn("flex min-w-0 flex-col", className)}>
      <div className="relative min-w-0">
        <div
          ref={viewportRef}
          id={id}
          onScroll={measure}
          className="min-w-0 overflow-x-auto overflow-y-hidden [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
        >
          <div className={cn("w-max", contentClassName)}>{children}</div>
        </div>

        {/* progressive blur — hints at frames extending past the right edge */}
        {thumb.scrollable && !thumb.atEnd && (
          <div
            aria-hidden
            className="pointer-events-none absolute inset-y-0 right-0"
            style={{ width: EDGE_FADE_WIDTH }}
          >
            {BLUR_LAYERS.map((blur, i) => {
              const stops = BLUR_LAYERS.length;
              // reveal a wider band of each layer as blur increases, so the
              // effect graduates smoothly instead of a single hard blur edge
              const revealFromLeft = 100 - ((i + 1) / stops) * 100;
              const mask = `linear-gradient(to left, black 0%, black ${revealFromLeft}%, transparent ${Math.min(revealFromLeft + 100 / stops, 100)}%)`;
              return (
                <div
                  key={blur}
                  className="absolute inset-0"
                  style={{
                    backdropFilter: `blur(${blur}px)`,
                    WebkitBackdropFilter: `blur(${blur}px)`,
                    maskImage: mask,
                    WebkitMaskImage: mask,
                  }}
                />
              );
            })}
          </div>
        )}
      </div>

      <div
        ref={trackRef}
        onPointerDown={onTrackPointerDown}
        className={cn(
          "relative mt-1 w-full shrink-0 rounded-full transition-opacity",
          thumb.scrollable
            ? alwaysVisible
              ? "opacity-100"
              : "opacity-60 hover:opacity-100"
            : "pointer-events-none opacity-0",
        )}
        style={{ height: BAR_THICKNESS, backgroundColor: PAPER.borderHairline }}
      >
        <div
          role="scrollbar"
          aria-orientation="horizontal"
          aria-controls={id}
          aria-valuenow={thumb.left}
          tabIndex={-1}
          onPointerDown={(e) => {
            const vp = viewportRef.current;
            if (!vp) return;
            e.preventDefault();
            dragRef.current = { pointerX: e.clientX, scrollLeft: vp.scrollLeft };
          }}
          style={{
            width: thumb.width,
            height: BAR_THICKNESS,
            transform: `translateX(${thumb.left}px)`,
            backgroundColor: PAPER.handle,
          }}
          className={cn(
            "absolute inset-y-0 left-0 cursor-grab rounded-full transition-colors hover:opacity-80 active:cursor-grabbing",
            handleClass,
          )}
        />
      </div>
    </div>
  );
}
