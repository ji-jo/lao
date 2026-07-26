import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
} from "react";
import { ScrollArea } from "@/components/ui/scroll-area";
import { cn } from "@/lib/utils";
import { PAPER } from "@/components/chrome/paper-tokens";

/**
 * Scroll affordances for the timeline player (Paper 2LM-0).
 *
 * Frame rows share one X offset (no single native scroller). `ScrollBarX` is a
 * nano ScrollArea used as a *controlled* bar: a 1px-tall proxy content owns
 * scrollLeft, and Timeline mirrors that onto every row.
 */

const NANO_CONTENT = ".react-nano-scrollbar-content";

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
  const rootRef = useRef<HTMLDivElement>(null);
  const syncingRef = useRef(false);

  const maxScroll = Math.max(0, contentWidth - viewportWidth);
  const scrollable = maxScroll > 1 && viewportWidth > 0;

  const contentEl = useCallback(() => {
    const root = rootRef.current;
    if (!root) return null;
    return root.querySelector(NANO_CONTENT) as HTMLElement | null;
  }, []);

  useLayoutEffect(() => {
    if (!scrollable) return;
    const content = contentEl();
    if (!content) return;
    if (Math.abs(content.scrollLeft - scrollLeft) <= 0.5) return;
    syncingRef.current = true;
    content.scrollLeft = scrollLeft;
    syncingRef.current = false;
  }, [scrollLeft, scrollable, contentEl, contentWidth, viewportWidth]);

  useEffect(() => {
    if (!scrollable) return;
    const content = contentEl();
    if (!content) return;
    const handleScroll = () => {
      if (syncingRef.current) return;
      onScroll(content.scrollLeft);
    };
    content.addEventListener("scroll", handleScroll, { passive: true });
    return () => content.removeEventListener("scroll", handleScroll);
  }, [onScroll, scrollable, contentEl, contentWidth, viewportWidth]);

  if (!scrollable) return null;

  return (
    <div
      ref={rootRef}
      id={controls}
      className={cn("w-full min-w-0", className)}
      style={{ maxWidth: viewportWidth > 0 ? viewportWidth : undefined }}
    >
      <ScrollArea
        orientation="horizontal"
        fade={false}
        className="lao-nano-thin h-1 w-full"
      >
        <div
          aria-hidden
          style={{ width: contentWidth, height: 1 }}
          className="pointer-events-none"
        />
      </ScrollArea>
    </div>
  );
}

/**
 * 4px vertical thumb mirroring a native scroller — Paper 41E-0.
 */
export function ScrollThumbY({
  viewportRef,
  className,
}: {
  viewportRef: React.RefObject<HTMLDivElement | null>;
  className?: string;
}) {
  const [metrics, setMetrics] = useState({
    top: 0,
    height: 0,
    scrollable: false,
  });

  const measure = useCallback(() => {
    const vp = viewportRef.current;
    if (!vp) return;
    const content =
      (vp.querySelector(NANO_CONTENT) as HTMLElement | null) ?? vp;
    const { scrollTop, scrollHeight, clientHeight } = content;
    if (scrollHeight - clientHeight <= 1) {
      setMetrics((m) =>
        m.scrollable ? { top: 0, height: 0, scrollable: false } : m,
      );
      return;
    }
    const height = Math.max(
      28,
      Math.round((clientHeight / scrollHeight) * clientHeight),
    );
    const top = Math.round(
      (scrollTop / (scrollHeight - clientHeight)) * (clientHeight - height),
    );
    setMetrics({ top, height, scrollable: true });
  }, [viewportRef]);

  useLayoutEffect(() => {
    const vp = viewportRef.current;
    if (!vp) return;
    const content =
      (vp.querySelector(NANO_CONTENT) as HTMLElement | null) ?? vp;
    measure();
    content.addEventListener("scroll", measure, { passive: true });
    const ro = new ResizeObserver(measure);
    ro.observe(content);
    if (content.firstElementChild) ro.observe(content.firstElementChild);
    return () => {
      content.removeEventListener("scroll", measure);
      ro.disconnect();
    };
  }, [measure, viewportRef]);

  if (!metrics.scrollable) return null;
  return (
    <div
      aria-hidden
      className={cn("pointer-events-none absolute w-1 rounded-full", className)}
      style={{
        top: metrics.top,
        height: metrics.height,
        backgroundColor: PAPER.handle,
      }}
    />
  );
}
