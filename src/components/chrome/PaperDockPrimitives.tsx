import { useEffect, useRef, useState, type ReactNode } from "react";
import { motion, useReducedMotion } from "motion/react";
import { cn } from "@/lib/utils";
import { useHoverCapable } from "@/lib/hooks/use-hover-capable";
import { SPRING_LAYOUT } from "@/lib/ease";
import { PAPER } from "@/components/chrome/paper-tokens";
import { Tooltip } from "@/components/motion/tooltip";

/**
 * Paper dock item — 18px icon → 24px on hover, shortcut letter under icon,
 * lucide-style tooltip (label + right-aligned shortcut). Default opens below.
 */
export type DockBarOrientation = "horizontal" | "vertical";

export function PaperDockItem({
  label,
  shortcut,
  active,
  onClick,
  children,
  className,
  /** Tooltip placement — bottom for top dock; flip to the side when vertical. */
  tooltipSide = "bottom",
  /** Set false to skip the lucide-style tooltip (e.g. shapes hover-flyout). */
  tooltip = true,
}: {
  label: string;
  shortcut?: string;
  active?: boolean;
  onClick?: () => void;
  children: ReactNode;
  className?: string;
  tooltipSide?: "top" | "bottom" | "left" | "right";
  tooltip?: boolean;
}) {
  const [hovered, setHovered] = useState(false);
  const canHover = useHoverCapable();
  const reduce = useReducedMotion();
  const showHover = canHover && hovered;
  // Fit WorkflowBar `h-9` — icon + hint vertically centered in the cell.
  const iconSize = showHover || active ? 18 : 16;

  const tip = (
    <span className="flex min-w-[5.5rem] items-center justify-between gap-4">
      <span>{label}</span>
      {shortcut ? (
        <span className="shrink-0 text-right font-medium tracking-wide text-white/55">
          {shortcut}
        </span>
      ) : null}
    </span>
  );

  const button = (
    <button
      type="button"
      aria-label={shortcut ? `${label} ${shortcut}` : label}
      aria-pressed={active}
      onClick={onClick}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      className={cn(
        "relative flex h-8 w-8 shrink-0 flex-col items-center justify-center gap-0 self-center text-muted-foreground outline-none transition-colors",
        "focus-visible:ring-2 focus-visible:ring-ring",
        (active || showHover) && "text-foreground",
        className,
      )}
    >
      <motion.span
        className="grid shrink-0 place-items-center [&_svg]:h-full [&_svg]:w-full"
        animate={reduce ? undefined : { width: iconSize, height: iconSize }}
        transition={reduce ? { duration: 0 } : SPRING_LAYOUT}
        style={{ width: iconSize, height: iconSize }}
      >
        {children}
      </motion.span>
      {shortcut ? (
        <span
          className={cn(
            "pointer-events-none text-[8px] leading-none text-muted-foreground/70",
            (active || showHover) && "text-muted-foreground",
          )}
        >
          {shortcut}
        </span>
      ) : null}
    </button>
  );

  if (!tooltip) {
    return <span className="relative inline-flex shrink-0 self-center align-middle">{button}</span>;
  }

  return (
    <Tooltip
      content={tip}
      side={tooltipSide}
      delay={200}
      wrapperClassName="shrink-0 self-center"
      className="border-0 bg-black px-2.5 py-1.5 text-[11px] font-medium text-white shadow-lg"
    >
      {button}
    </Tooltip>
  );
}

export function PaperDockBar({
  children,
  className,
  variant = "pill",
  orientation = "horizontal",
}: {
  children: ReactNode;
  className?: string;
  /** tool = top-right dock; setting = bottom setting bar */
  variant?: "pill" | "setting";
  orientation?: DockBarOrientation;
}) {
  const vertical = orientation === "vertical";
  return (
    <div
      data-dock-bar=""
      className={cn(
        "inline-flex items-center overflow-clip rounded-full antialiased",
        vertical ? "flex-col" : "flex-row",
        variant === "pill"
          ? vertical
            ? "h-auto w-9 gap-1.5 px-0.5 py-2"
            : "h-9 gap-1.5 px-3"
          : vertical
            ? "gap-3 px-2 py-3"
            : "gap-3 py-2 pl-3 pr-2",
        className,
      )}
      style={{
        // Transparent while GooeyBarMorph owns the silhouette.
        backgroundColor: "var(--dock-bar-bg, " + PAPER.surface + ")",
        fontFamily: PAPER.fontSans,
      }}
    >
      {children}
    </div>
  );
}

export function PaperDockSep({
  width = 4,
  orientation = "horizontal",
  className,
}: {
  width?: 4 | 8;
  /** Matches the parent bar — vertical bar uses a horizontal rule. */
  orientation?: DockBarOrientation;
  className?: string;
}) {
  const verticalBar = orientation === "vertical";
  const len = 20;
  return (
    <svg
      viewBox="116.5 116 4.001 24"
      width={verticalBar ? len : width}
      height={verticalBar ? width : len}
      xmlns="http://www.w3.org/2000/svg"
      className={cn("shrink-0", className)}
      style={{
        overflow: "visible",
        opacity: 0.2,
        transform: verticalBar ? "rotate(90deg)" : undefined,
      }}
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
