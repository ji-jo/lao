"use client";

import { cn } from "@/lib/utils";
import gsap from "gsap";
import {
  useCallback,
  useEffect,
  useId,
  useLayoutEffect,
  useRef,
  useState,
  type CSSProperties,
  type ReactNode,
} from "react";
import {
  GOO_MATRIX_ALPHA_MULTIPLIER,
  GOO_MATRIX_ALPHA_OFFSET,
  GOO_STD_DEVIATION,
} from "@/components/motion/gooey-filter";
import { useClickOutside } from "./use-click-outside";

const MEASURE_DELAY_SHORT = 50;
const MEASURE_DELAY_LONG = 200;
const DEFAULT_TRIGGER_SIZE = 44;
const DEFAULT_CONTENT_WIDTH = 240;
const DEFAULT_SIDE_OFFSET = 12;
const DEFAULT_SPEED = 0.28;
const DEFAULT_CONTENT_BORDER_RADIUS = 16;

export {
  GOO_STD_DEVIATION,
  GOO_MATRIX_ALPHA_MULTIPLIER,
  GOO_MATRIX_ALPHA_OFFSET,
} from "@/components/motion/gooey-filter";

export type GooeyPopoverProps = {
  children: ReactNode;
  trigger?: ReactNode;
  /** Square trigger edge length (px). Ignored when triggerWidth/Height set. */
  triggerSize?: number;
  triggerWidth?: number;
  triggerHeight?: number;
  isOpen?: boolean;
  onOpenChange?: (open: boolean) => void;
  side?: "top" | "bottom";
  sideOffset?: number;
  contentWidth?: number;
  /** When set, content width is measured from children instead of contentWidth. */
  autoWidth?: boolean;
  speed?: number;
  bgClassName?: string;
  contentClassName?: string;
  triggerClassName?: string;
  /** Border radius of the open content panel (px). Default 16. */
  contentRadius?: number;
  className?: string;
  /** Extra style on the trigger button (Paper chips, etc.). */
  triggerStyle?: CSSProperties;
  /** Accessible name for the trigger button. */
  triggerLabel?: string;
};

export default function GooeyPopover({
  children,
  trigger,
  triggerSize = DEFAULT_TRIGGER_SIZE,
  triggerWidth,
  triggerHeight,
  isOpen: controlledIsOpen,
  onOpenChange,
  side = "top",
  sideOffset = DEFAULT_SIDE_OFFSET,
  contentWidth: contentWidthProp = DEFAULT_CONTENT_WIDTH,
  autoWidth = false,
  speed = DEFAULT_SPEED,
  bgClassName = "bg-neutral-900",
  contentClassName,
  triggerClassName,
  contentRadius = DEFAULT_CONTENT_BORDER_RADIUS,
  className,
  triggerStyle,
  triggerLabel,
}: GooeyPopoverProps) {
  const filterId = useId().replace(/:/g, "");
  const isControlled = controlledIsOpen !== undefined;
  const [internalIsOpen, setInternalIsOpen] = useState(false);
  const isOpen = isControlled ? controlledIsOpen : internalIsOpen;
  const [isVisible, setIsVisible] = useState(false);

  const containerRef = useRef<HTMLDivElement>(null);
  const measureRef = useRef<HTMLDivElement>(null);
  const filteredContentRef = useRef<HTMLDivElement>(null);
  const unfilteredContentRef = useRef<HTMLDivElement>(null);
  const innerContentRef = useRef<HTMLDivElement>(null);
  const timelineRef = useRef<gsap.core.Timeline | null>(null);
  const [contentHeight, setContentHeight] = useState(0);
  const [contentWidth, setContentWidth] = useState(contentWidthProp);
  const [prefersReducedMotion, setPrefersReducedMotion] = useState(false);

  const tw = triggerWidth ?? triggerSize;
  const th = triggerHeight ?? triggerSize;
  const triggerRadius = Math.min(tw, th) / 2;

  useEffect(() => {
    const mq = window.matchMedia("(prefers-reduced-motion: reduce)");
    setPrefersReducedMotion(mq.matches);
    const handler = (e: MediaQueryListEvent) => {
      setPrefersReducedMotion(e.matches);
    };
    mq.addEventListener("change", handler);
    return () => mq.removeEventListener("change", handler);
  }, []);

  const setIsOpen = useCallback(
    (open: boolean) => {
      if (!isControlled) {
        setInternalIsOpen(open);
      }
      onOpenChange?.(open);
    },
    [isControlled, onOpenChange],
  );

  const handleClose = useCallback(() => {
    if (isOpen) {
      setIsOpen(false);
    }
  }, [isOpen, setIsOpen]);

  useClickOutside(containerRef, handleClose);

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape" && isOpen) {
        setIsOpen(false);
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [isOpen, setIsOpen]);

  const measure = useCallback(() => {
    if (!measureRef.current) return;
    const h = measureRef.current.scrollHeight;
    const w = autoWidth
      ? Math.max(measureRef.current.scrollWidth, contentWidthProp)
      : contentWidthProp;
    if (h > 0) setContentHeight(h);
    if (w > 0) setContentWidth(w);
  }, [autoWidth, contentWidthProp]);

  useLayoutEffect(() => {
    measure();
  }, [measure, children, isOpen]);

  useEffect(() => {
    const t1 = setTimeout(measure, MEASURE_DELAY_SHORT);
    const t2 = setTimeout(measure, MEASURE_DELAY_LONG);
    return () => {
      clearTimeout(t1);
      clearTimeout(t2);
    };
  }, [measure, children]);

  const translateY =
    side === "top" ? -(contentHeight + sideOffset) : th + sideOffset;
  const contentLeft = tw / 2 - contentWidth / 2;

  useEffect(() => {
    if (contentHeight === 0 || contentWidth === 0) return;

    if (timelineRef.current) {
      timelineRef.current.kill();
    }

    const filteredTarget = filteredContentRef.current;
    const unfilteredTarget = unfilteredContentRef.current;
    const innerTarget = innerContentRef.current;

    if (!(unfilteredTarget && innerTarget)) return;

    if (prefersReducedMotion) {
      if (isOpen) {
        setIsVisible(true);
        gsap.set(unfilteredTarget, {
          width: contentWidth,
          height: contentHeight,
          borderRadius: contentRadius,
          x: contentLeft,
          y: translateY,
          opacity: 1,
        });
        gsap.set(innerTarget, { opacity: 1, y: 0 });
      } else {
        gsap.set(unfilteredTarget, {
          width: tw,
          height: th,
          borderRadius: triggerRadius,
          x: 0,
          y: 0,
          opacity: 0,
        });
        gsap.set(innerTarget, { opacity: 0, y: 0 });
        setIsVisible(false);
      }
      return;
    }

    if (isOpen) {
      setIsVisible(true);

      const startProps = {
        width: tw,
        height: th,
        borderRadius: triggerRadius,
        x: 0,
        y: 0,
        opacity: 1,
      };
      if (filteredTarget) gsap.set(filteredTarget, startProps);
      gsap.set(unfilteredTarget, startProps);
      gsap.set(innerTarget, { opacity: 0, y: 16 });

      const tl = gsap.timeline();

      if (filteredTarget) {
        tl.to(
          filteredTarget,
          {
            width: contentWidth,
            height: contentHeight,
            borderRadius: 0,
            x: contentLeft,
            y: translateY,
            duration: speed,
            ease: "power1.in",
          },
          0,
        );
      }

      tl.to(
        unfilteredTarget,
        {
          width: contentWidth,
          height: contentHeight,
          borderRadius: contentRadius,
          x: contentLeft,
          y: translateY,
          duration: speed,
          ease: "power1.in",
        },
        0,
      );

      tl.to(
        innerTarget,
        {
          opacity: 1,
          y: 0,
          duration: speed * 0.75,
          ease: "power1.out",
        },
        speed * 0.575,
      );

      timelineRef.current = tl;
    } else {
      const tl = gsap.timeline({
        onComplete: () => {
          setIsVisible(false);
        },
      });

      tl.to(innerTarget, {
        opacity: 0,
        y: 8,
        duration: speed * 0.4,
        ease: "power1.in",
      });

      const targets = [filteredTarget, unfilteredTarget].filter(Boolean);
      tl.to(
        targets,
        {
          width: tw,
          height: th,
          borderRadius: triggerRadius,
          x: 0,
          y: 0,
          duration: speed,
          ease: "power1.in",
        },
        speed * 0.2,
      );

      tl.to(
        targets,
        {
          opacity: 0,
          duration: speed * 0.3,
          ease: "power1.in",
        },
        `-=${speed * 0.3}`,
      );

      timelineRef.current = tl;
    }

    return () => {
      if (timelineRef.current) timelineRef.current.kill();
    };
  }, [
    isOpen,
    contentHeight,
    contentWidth,
    tw,
    th,
    triggerRadius,
    contentLeft,
    translateY,
    speed,
    prefersReducedMotion,
    contentRadius,
  ]);

  const defaultTriggerIcon = (
    <svg
      fill="none"
      height={20}
      stroke="currentColor"
      strokeLinecap="round"
      strokeLinejoin="round"
      strokeWidth={2}
      viewBox="0 0 24 24"
      width={20}
      xmlns="http://www.w3.org/2000/svg"
      aria-hidden
    >
      <line x1="12" x2="12" y1="5" y2="19" />
      <line x1="5" x2="19" y1="12" y2="12" />
    </svg>
  );

  const gooMatrix = `1 0 0 0 0  0 1 0 0 0  0 0 1 0 0  0 0 0 ${GOO_MATRIX_ALPHA_MULTIPLIER} ${GOO_MATRIX_ALPHA_OFFSET}`;

  return (
    <div className={cn("relative inline-flex", className)} ref={containerRef}>
      <svg
        aria-hidden="true"
        className="absolute"
        style={{ width: 0, height: 0 }}
      >
        <defs>
          <filter
            id={filterId}
            x="-80%"
            y="-200%"
            width="260%"
            height="500%"
            colorInterpolationFilters="sRGB"
          >
            <feGaussianBlur
              in="SourceGraphic"
              result="blur"
              stdDeviation={GOO_STD_DEVIATION}
            />
            <feColorMatrix
              in="blur"
              result="goo"
              type="matrix"
              values={gooMatrix}
            />
            <feComposite in="SourceGraphic" in2="goo" operator="atop" />
          </filter>
        </defs>
      </svg>

      <div
        aria-hidden="true"
        className="pointer-events-none absolute"
        ref={measureRef}
        style={{
          width: autoWidth ? "max-content" : contentWidthProp,
          position: "absolute",
          top: -9999,
          left: -9999,
          visibility: "hidden",
        }}
      >
        <div className={cn(contentClassName)}>{children}</div>
      </div>

      {!prefersReducedMotion && (isOpen || isVisible) && (
        <div
          aria-hidden="true"
          className="pointer-events-none absolute inset-0"
          style={{ filter: `url(#${filterId})` }}
        >
          <div
            className={cn("absolute", bgClassName)}
            style={{
              width: tw,
              height: th,
              borderRadius: triggerRadius,
              top: 0,
              left: 0,
            }}
          />
          <div
            className={cn("absolute", bgClassName)}
            ref={filteredContentRef}
            style={{
              top: 0,
              left: 0,
              width: tw,
              height: th,
              borderRadius: triggerRadius,
              opacity: 0,
            }}
          />
        </div>
      )}

      <button
        aria-expanded={isOpen}
        aria-haspopup="dialog"
        aria-label={triggerLabel}
        className={cn(
          "relative z-10 flex items-center justify-center text-white transition-colors",
          // Default circular chip; docks pass triggerClassName to override.
          !triggerClassName && "rounded-full",
          bgClassName,
          triggerClassName,
        )}
        onClick={() => setIsOpen(!isOpen)}
        style={{
          width: tw,
          height: th,
          borderRadius: triggerClassName ? undefined : triggerRadius,
          ...triggerStyle,
        }}
        type="button"
      >
        {trigger ?? defaultTriggerIcon}
      </button>

      {(isOpen || isVisible) && (
        <div
          className={cn(
            "absolute z-10 overflow-hidden text-white",
            bgClassName,
          )}
          ref={unfilteredContentRef}
          role="dialog"
          style={{
            top: 0,
            left: 0,
            width: tw,
            height: th,
            borderRadius: triggerRadius,
            opacity: 0,
          }}
        >
          <div
            className={cn(contentClassName)}
            ref={innerContentRef}
            style={{ opacity: 0, transform: "translateY(16px)" }}
          >
            {children}
          </div>
        </div>
      )}
    </div>
  );
}
