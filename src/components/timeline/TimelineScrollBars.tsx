import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import { cn } from "@/lib/utils";
import { PAPER } from "@/components/chrome/paper-tokens";

/**
 * Scrollbars for the timeline player (Paper 2LM-0, "Max height and width with
 * scroll bar" state).
 *
 * Paper draws every layer as its own `#0D0D0D` card, so the frame grid has no
 * single scrolling element to hang a native bar off — each row scrolls its own
 * cells while the label column stays pinned. `ScrollBarX` is therefore a
 * *controlled* bar: the Timeline owns one shared offset and every row renders at
 * that offset. `ScrollThumbY` is the opposite — it decorates a real native
 * scroller (rows overflow vertically past 5 layers) and only mirrors it.
 */

const BAR_THICKNESS = 5;
const MIN_THUMB = 32;

export function ScrollBarX({
  scrollLeft,
  viewportWidth,
  contentWidth,
  onScroll,
  controls,
  className,
}: {
  scrollLeft: number;
  viewportWidth: number;
  contentWidth: number;
  onScroll: (next: number) => void;
  controls?: string;
  className?: string;
}) {
  const trackRef = useRef<HTMLDivElement>(null);
  const dragRef = useRef<{ pointerX: number; scrollLeft: number } | null>(null);

  const maxScroll = Math.max(0, contentWidth - viewportWidth);
  const scrollable = maxScroll > 1 && viewportWidth > 0;
  const thumbWidth = scrollable
    ? Math.max(MIN_THUMB, Math.round((viewportWidth / contentWidth) * viewportWidth))
    : 0;
  const travel = Math.max(0, viewportWidth - thumbWidth);
  const thumbLeft = maxScroll > 0 ? Math.round((scrollLeft / maxScroll) * travel) : 0;

  useEffect(() => {
    function onMove(e: PointerEvent) {
      const drag = dragRef.current;
      if (!drag || travel <= 0) return;
      const dx = e.clientX - drag.pointerX;
      onScroll(
        Math.max(0, Math.min(maxScroll, drag.scrollLeft + (dx / travel) * maxScroll)),
      );
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
  }, [travel, maxScroll, onScroll]);

  function onTrackPointerDown(e: React.PointerEvent) {
    const track = trackRef.current;
    if (!track || travel <= 0) return;
    const clickX = e.clientX - track.getBoundingClientRect().left;
    // clicking the bare track pages toward the click point
    if (clickX < thumbLeft || clickX > thumbLeft + thumbWidth) {
      const target = Math.max(0, Math.min(clickX - thumbWidth / 2, travel));
      onScroll((target / travel) * maxScroll);
    }
  }

  return (
    <div
      ref={trackRef}
      onPointerDown={onTrackPointerDown}
      className={cn(
        "relative w-full shrink-0 rounded-full transition-opacity",
        scrollable ? "opacity-60 hover:opacity-100" : "pointer-events-none opacity-0",
        className,
      )}
      style={{ height: BAR_THICKNESS, backgroundColor: PAPER.borderHairline }}
    >
      <div
        role="scrollbar"
        aria-orientation="horizontal"
        aria-controls={controls}
        aria-valuenow={thumbLeft}
        tabIndex={-1}
        onPointerDown={(e) => {
          e.preventDefault();
          dragRef.current = { pointerX: e.clientX, scrollLeft };
        }}
        className="absolute inset-y-0 left-0 cursor-grab rounded-full hover:opacity-80 active:cursor-grabbing"
        style={{
          width: thumbWidth,
          transform: `translateX(${thumbLeft}px)`,
          backgroundColor: PAPER.handle,
        }}
      />
    </div>
  );
}

/**
 * 4px vertical thumb mirroring a native scroller — Paper 41E-0. Renders into the
 * nearest positioned ancestor; Paper parks it in the modal's right padding
 * gutter, 4px in from the modal edge.
 */
export function ScrollThumbY({
  viewportRef,
  className,
}: {
  viewportRef: React.RefObject<HTMLDivElement | null>;
  className?: string;
}) {
  const [metrics, setMetrics] = useState({ top: 0, height: 0, scrollable: false });

  const measure = useCallback(() => {
    const vp = viewportRef.current;
    if (!vp) return;
    const { scrollTop, scrollHeight, clientHeight } = vp;
    if (scrollHeight - clientHeight <= 1) {
      setMetrics((m) => (m.scrollable ? { top: 0, height: 0, scrollable: false } : m));
      return;
    }
    const height = Math.max(28, Math.round((clientHeight / scrollHeight) * clientHeight));
    const top = Math.round(
      (scrollTop / (scrollHeight - clientHeight)) * (clientHeight - height),
    );
    setMetrics({ top, height, scrollable: true });
  }, [viewportRef]);

  useLayoutEffect(() => {
    const vp = viewportRef.current;
    if (!vp) return;
    measure();
    vp.addEventListener("scroll", measure, { passive: true });
    const ro = new ResizeObserver(measure);
    ro.observe(vp);
    if (vp.firstElementChild) ro.observe(vp.firstElementChild);
    return () => {
      vp.removeEventListener("scroll", measure);
      ro.disconnect();
    };
  }, [measure, viewportRef]);

  if (!metrics.scrollable) return null;
  return (
    <div
      aria-hidden
      className={cn("pointer-events-none absolute w-1 rounded-full", className)}
      style={{ top: metrics.top, height: metrics.height, backgroundColor: PAPER.handle }}
    />
  );
}
