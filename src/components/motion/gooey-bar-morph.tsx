"use client";

/**
 * Organic pill morph when a dock bar flips horizontal ↔ vertical.
 * Dual-layer (filtered blob + crisp bar) — same goo constants as GooeyConjoined.
 * Filter wraps only the morphing silhouette, never sibling chrome.
 */

import gsap from "gsap";
import {
  useId,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type ReactNode,
} from "react";
import { GooeyFilter } from "@/components/motion/gooey-filter";
import { isGooUnsupported } from "@/components/motion/is-goo-unsupported";
import { cn } from "@/lib/utils";

const SPEED = 0.32;

export type DockOrientation = "horizontal" | "vertical";

export function GooeyBarMorph({
  orientation,
  surface = "#131212",
  children,
  className,
}: {
  orientation: DockOrientation;
  surface?: string;
  children: ReactNode;
  className?: string;
}) {
  const reduce =
    typeof window !== "undefined" &&
    window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  const unsupported = useMemo(() => isGooUnsupported(), []);
  const noGoo = reduce || unsupported;
  const gooId = `goo-bar-${useId().replace(/:/g, "")}`;

  const wrapRef = useRef<HTMLDivElement>(null);
  const contentRef = useRef<HTMLDivElement>(null);
  const blobRef = useRef<HTMLDivElement>(null);
  const prevOri = useRef(orientation);
  const sizeRef = useRef({ w: 0, h: 0 });
  const [morphing, setMorphing] = useState(false);
  const tlRef = useRef<gsap.core.Timeline | null>(null);

  useLayoutEffect(() => {
    const content = contentRef.current;
    if (!content) return;

    const toW = content.offsetWidth;
    const toH = content.offsetHeight;
    const flipped = prevOri.current !== orientation;
    const from = sizeRef.current;

    if (!flipped || noGoo || from.w < 8 || from.h < 8 || toW < 8 || toH < 8) {
      prevOri.current = orientation;
      sizeRef.current = { w: toW, h: toH };
      return;
    }

    prevOri.current = orientation;
    tlRef.current?.kill();
    setMorphing(true);

    const blob = blobRef.current;
    if (blob) {
      gsap.set(blob, {
        width: from.w,
        height: from.h,
        borderRadius: Math.min(from.w, from.h) / 2,
        opacity: 1,
        x: (toW - from.w) / 2,
        y: (toH - from.h) / 2,
      });
    }
    gsap.set(content, { opacity: 0 });

    const midW = Math.max(from.w, toW) * 0.55 + Math.min(from.w, toW) * 0.45;
    const midH = Math.max(from.h, toH) * 0.55 + Math.min(from.h, toH) * 0.45;
    // Squircle-ish mid blob — organic “goo” between H and V pills.
    const midR = Math.min(midW, midH) * 0.42;

    const tl = gsap.timeline({
      onComplete: () => {
        setMorphing(false);
        sizeRef.current = { w: toW, h: toH };
        if (blob) gsap.set(blob, { clearProps: "all", opacity: 0 });
        gsap.set(content, { opacity: 1 });
      },
    });

    if (blob) {
      tl.to(
        blob,
        {
          width: midW,
          height: midH,
          borderRadius: midR,
          x: (toW - midW) / 2,
          y: (toH - midH) / 2,
          duration: SPEED * 0.45,
          ease: "power1.in",
        },
        0,
      );
      tl.to(
        blob,
        {
          width: toW,
          height: toH,
          borderRadius: Math.min(toW, toH) / 2,
          x: 0,
          y: 0,
          duration: SPEED * 0.55,
          ease: "power1.out",
        },
        SPEED * 0.4,
      );
    }
    tl.to(
      content,
      { opacity: 1, duration: SPEED * 0.35, ease: "power1.out" },
      SPEED * 0.55,
    );

    tlRef.current = tl;
    sizeRef.current = { w: toW, h: toH };

    return () => {
      tlRef.current?.kill();
    };
  }, [orientation, noGoo]);

  // Keep sizeRef fresh when not morphing (resize / first mount).
  useLayoutEffect(() => {
    if (morphing) return;
    const content = contentRef.current;
    if (!content) return;
    sizeRef.current = { w: content.offsetWidth, h: content.offsetHeight };
  });

  return (
    <div ref={wrapRef} className={cn("relative inline-flex", className)}>
      {!noGoo ? <GooeyFilter id={gooId} /> : null}

      {!noGoo && morphing ? (
        <div
          aria-hidden
          className="pointer-events-none absolute inset-0 z-0 overflow-visible"
          style={{ filter: `url(#${gooId})` }}
        >
          <div
            ref={blobRef}
            className="absolute left-0 top-0"
            style={{ backgroundColor: surface }}
          />
        </div>
      ) : null}

      <div
        ref={contentRef}
        className="relative z-[1]"
        style={
          morphing
            ? ({ "--dock-bar-bg": "transparent" } as CSSProperties)
            : undefined
        }
        data-dock-morphing={morphing ? "" : undefined}
      >
        {children}
      </div>
    </div>
  );
}
