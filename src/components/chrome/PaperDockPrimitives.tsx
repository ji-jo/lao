import { useEffect, useRef, useState, type ReactNode } from "react";
import { motion, useReducedMotion } from "motion/react";
import { cn } from "@/lib/utils";
import { useHoverCapable } from "@/lib/hooks/use-hover-capable";
import { SPRING_LAYOUT } from "@/lib/ease";
import { PAPER } from "@/components/chrome/paper-tokens";

/**
 * Paper dock item — 18px icon → 24px on hover, shortcut letter under icon,
 * black pill tooltip above (Paper 1FB-0).
 */
export function PaperDockItem({
  label,
  shortcut,
  active,
  onClick,
  children,
  className,
}: {
  label: string;
  shortcut?: string;
  active?: boolean;
  onClick?: () => void;
  children: ReactNode;
  className?: string;
}) {
  const [hovered, setHovered] = useState(false);
  const canHover = useHoverCapable();
  const reduce = useReducedMotion();
  const showHover = canHover && hovered;
  const iconSize = showHover || active ? 24 : 18;

  return (
    <button
      type="button"
      aria-label={shortcut ? `${label} ${shortcut}` : label}
      aria-pressed={active}
      onClick={onClick}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      className={cn(
        "relative flex h-9 w-9 shrink-0 flex-col items-center justify-center rounded-lg text-muted-foreground outline-none transition-colors",
        "focus-visible:ring-2 focus-visible:ring-ring",
        (active || showHover) && "text-foreground",
        className,
      )}
    >
      {showHover && (
        <span
          className="pointer-events-none absolute -top-8 left-1/2 z-30 -translate-x-1/2 whitespace-nowrap rounded-md bg-black px-2 py-1 text-[11px] font-medium text-white shadow-lg"
          role="tooltip"
        >
          {label}
          {shortcut ? (
            <span className="ml-1.5 text-white/55">{shortcut}</span>
          ) : null}
        </span>
      )}
      <motion.span
        className="grid place-items-center [&_svg]:h-full [&_svg]:w-full"
        animate={reduce ? undefined : { width: iconSize, height: iconSize }}
        transition={reduce ? { duration: 0 } : SPRING_LAYOUT}
        style={{ width: iconSize, height: iconSize }}
      >
        {children}
      </motion.span>
      {shortcut ? (
        <span
          className={cn(
            "pointer-events-none absolute -bottom-0.5 text-[9px] leading-none text-muted-foreground/70",
            (active || showHover) && "text-muted-foreground",
          )}
        >
          {shortcut}
        </span>
      ) : null}
    </button>
  );
}

export function PaperDockBar({
  children,
  className,
  variant = "pill",
}: {
  children: ReactNode;
  className?: string;
  /** tool = top-right dock; setting = bottom setting bar */
  variant?: "pill" | "setting";
}) {
  return (
    <div
      className={cn(
        "inline-flex items-center overflow-clip rounded-full antialiased",
        variant === "pill" ? "gap-3 px-4 py-1.5" : "h-9 gap-3 px-4 py-1",
        className,
      )}
      style={{ backgroundColor: PAPER.surface, fontFamily: PAPER.fontSans }}
    >
      {children}
    </div>
  );
}

export function PaperDockSep({ width = 4 }: { width?: 4 | 8 }) {
  return (
    <svg
      viewBox="116.5 116 4.001 24"
      width={width}
      height={24}
      xmlns="http://www.w3.org/2000/svg"
      className="shrink-0"
      style={{ overflow: "visible", opacity: 0.2 }}
      aria-hidden
    >
      <path
        fillRule="evenodd"
        d="M118.501 139.997L118.501 115.997"
        fill="none"
        stroke={PAPER.sep}
        paintOrder="stroke"
      />
    </svg>
  );
}

/**
 * Conjoined flyout — sits above (default) or below the anchor, visually attached.
 * Paper: shapes pack when dock is at bottom → flyout above.
 */
export function ConjoinedDock({
  open,
  side = "top",
  anchorRef,
  children,
  className,
  bare,
}: {
  open: boolean;
  side?: "top" | "bottom";
  anchorRef: React.RefObject<HTMLElement | null>;
  children: ReactNode;
  className?: string;
  /** When true, render children as-is (settings panels). Default wraps in PaperDockBar. */
  bare?: boolean;
}) {
  const panelRef = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState({ left: 0, top: 0 });

  useEffect(() => {
    if (!open || !anchorRef.current) return;
    const update = () => {
      const a = anchorRef.current!.getBoundingClientRect();
      const p = panelRef.current?.getBoundingClientRect();
      const w = p?.width ?? 180;
      setPos({
        left: a.left + a.width / 2 - w / 2,
        top: side === "top" ? a.top - 8 : a.bottom + 8,
      });
    };
    update();
    const ro = new ResizeObserver(update);
    ro.observe(anchorRef.current);
    window.addEventListener("resize", update);
    window.addEventListener("scroll", update, true);
    return () => {
      ro.disconnect();
      window.removeEventListener("resize", update);
      window.removeEventListener("scroll", update, true);
    };
  }, [open, side, anchorRef]);

  if (!open) return null;

  return (
    <div
      ref={panelRef}
      className={cn(
        "pointer-events-auto fixed z-40",
        side === "top" ? "-translate-y-full" : "",
        className,
      )}
      style={{ left: pos.left, top: pos.top }}
    >
      {/* connector chevron toward main dock */}
      <div
        className={cn(
          "absolute left-1/2 h-2 w-6 -translate-x-1/2",
          side === "top" ? "-bottom-1.5" : "-top-1.5 rotate-180",
        )}
        aria-hidden
      >
        <svg viewBox="0 0 24 8" className="h-full w-full" style={{ color: PAPER.surface }}>
          <path d="M0 0h24L12 8z" fill="currentColor" />
        </svg>
      </div>
      {bare ? children : <PaperDockBar>{children}</PaperDockBar>}
    </div>
  );
}
