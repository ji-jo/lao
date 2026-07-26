import {
  useEffect,
  useRef,
  type ReactNode,
} from "react";
import { ScrollArea } from "@/components/ui/scroll-area";
import { cn } from "@/lib/utils";

/**
 * Horizontal scroll surface via react-nano-scrollbar.
 *
 * Optional `onPinchZoom` keeps timeline-style ctrl/pinch zoom without
 * fighting the bar (plain wheel pans via orientation="horizontal").
 */

export interface HorizontalScrollProps {
  children?: ReactNode;
  className?: string;
  id?: string;
  /** wrapper around the scrolling content (use to set `w-max`) */
  contentClassName?: string;
  /** keep the bar visible even when idle */
  alwaysVisible?: boolean;
  handleClass?: string;
  /** ctrl+wheel (trackpad pinch / ctrl+scroll). Negative deltaY = pinch out (zoom in). */
  onPinchZoom?: (deltaY: number) => void;
}

export function HorizontalScroll({
  children,
  className,
  id,
  contentClassName,
  alwaysVisible = false,
  onPinchZoom,
}: HorizontalScrollProps) {
  const wrapRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!onPinchZoom) return;
    const wrap = wrapRef.current;
    if (!wrap) return;
    const content = wrap.querySelector(
      ".react-nano-scrollbar-content",
    ) as HTMLElement | null;
    if (!content) return;

    function onWheel(e: WheelEvent) {
      if (!e.ctrlKey) return;
      e.preventDefault();
      onPinchZoom?.(e.deltaY);
    }
    content.addEventListener("wheel", onWheel, { passive: false });
    return () => content.removeEventListener("wheel", onWheel);
  }, [onPinchZoom]);

  return (
    <div ref={wrapRef} id={id} className={cn("min-w-0", className)}>
      <ScrollArea
        orientation="horizontal"
        alwaysShowScrollbar={alwaysVisible}
        className="h-full w-full"
      >
        <div className={cn("w-max", contentClassName)}>{children}</div>
      </ScrollArea>
    </div>
  );
}
