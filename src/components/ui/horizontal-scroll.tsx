import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { cn } from "@/lib/utils";

/**
 * Horizontal custom scrollbar.
 *
 * NOTE: `react-custom-scroll` (used by <CustomScroll/>) is vertical-only — its
 * source tracks scrollTop/clientHeight and hard-sets `overflow-x: hidden`, so it
 * cannot drive a horizontal bar. This mirrors its behaviour on the X axis:
 * a native scroll viewport (so wheel / trackpad / touch / keyboard all work)
 * with the native bar hidden and a custom draggable thumb synced to scrollLeft.
 */

const MIN_THUMB = 32;

export interface HorizontalScrollProps {
  children?: ReactNode;
  className?: string;
  id?: string;
  /** wrapper around the scrolling content (use to set `w-max`) */
  contentClassName?: string;
  /** keep the bar visible even when idle */
  alwaysVisible?: boolean;
  handleClass?: string;
}

export function HorizontalScroll({
  children,
  className,
  id,
  contentClassName,
  alwaysVisible = false,
  handleClass,
}: HorizontalScrollProps) {
  const viewportRef = useRef<HTMLDivElement>(null);
  const trackRef = useRef<HTMLDivElement>(null);
  const dragRef = useRef<{ pointerX: number; scrollLeft: number } | null>(null);
  const [thumb, setThumb] = useState({ width: 0, left: 0, scrollable: false });

  const measure = useCallback(() => {
    const vp = viewportRef.current;
    const track = trackRef.current;
    if (!vp || !track) return;
    const trackWidth = track.clientWidth;
    const { scrollWidth, clientWidth, scrollLeft } = vp;
    const scrollable = scrollWidth - clientWidth > 1;
    if (!scrollable) {
      setThumb((t) => (t.scrollable ? { ...t, scrollable: false } : t));
      return;
    }
    const ratio = clientWidth / scrollWidth;
    const width = Math.max(Math.round(ratio * trackWidth), MIN_THUMB);
    const maxScroll = scrollWidth - clientWidth;
    const left = Math.round((scrollLeft / maxScroll) * (trackWidth - width));
    setThumb({ width, left, scrollable: true });
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
      <div
        ref={viewportRef}
        id={id}
        onScroll={measure}
        className="min-w-0 flex-1 overflow-x-auto overflow-y-hidden [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
      >
        <div className={cn("w-max", contentClassName)}>{children}</div>
      </div>

      <div
        ref={trackRef}
        onPointerDown={onTrackPointerDown}
        className={cn(
          "relative mt-1.5 h-1.5 w-full shrink-0 rounded-full bg-muted/60 transition-opacity",
          thumb.scrollable ? "opacity-100" : "pointer-events-none opacity-0",
          !alwaysVisible && "opacity-70 hover:opacity-100",
        )}
      >
        <div
          role="scrollbar"
          aria-orientation="horizontal"
          aria-controls="timeline-frames"
          aria-valuenow={thumb.left}
          tabIndex={-1}
          onPointerDown={(e) => {
            const vp = viewportRef.current;
            if (!vp) return;
            e.preventDefault();
            dragRef.current = { pointerX: e.clientX, scrollLeft: vp.scrollLeft };
          }}
          style={{ width: thumb.width, transform: `translateX(${thumb.left}px)` }}
          className={cn(
            "absolute inset-y-0 left-0 cursor-grab rounded-full bg-foreground/35 transition-colors hover:bg-foreground/55 active:cursor-grabbing active:bg-foreground/70",
            handleClass,
          )}
        />
      </div>
    </div>
  );
}
