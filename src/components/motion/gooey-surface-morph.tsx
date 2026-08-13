"use client";

/**
 * Organic silhouette morph for rounded surfaces (timeline panel, etc.).
 * Same dual-layer goo technique as GooeyBarMorph / GooeyConjoined:
 * filter only wraps the blob while morphing — never idle chrome.
 *
 * Triggers on `morphKey` change:
 * - size changed → mid-squash size morph
 * - size same → settle pulse (organic squish then rest)
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

const SPEED = 0.34;

export function GooeySurfaceMorph({
  morphKey,
  surface = "#131212",
  borderRadius = 19,
  children,
  className,
  style,
  /** CSS var set on content while morphing (e.g. transparent panel fill). */
  transparentVar = "--dock-bar-bg",
}: {
  morphKey: string | number | boolean;
  surface?: string;
  borderRadius?: number;
  children: ReactNode;
  className?: string;
  style?: CSSProperties;
  transparentVar?: string;
}) {
  const reduce =
    typeof window !== "undefined" &&
    window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  const unsupported = useMemo(() => isGooUnsupported(), []);
  const noGoo = reduce || unsupported;
  const gooId = `goo-surf-${useId().replace(/:/g, "")}`;

  const contentRef = useRef<HTMLDivElement>(null);
  const blobRef = useRef<HTMLDivElement>(null);
  const prevKey = useRef(morphKey);
  const sizeRef = useRef({ w: 0, h: 0 });
  const [morphing, setMorphing] = useState(false);
  const tlRef = useRef<gsap.core.Timeline | null>(null);
  const booted = useRef(false);

  useLayoutEffect(() => {
    const content = contentRef.current;
    if (!content) return;

    const toW = content.offsetWidth;
    const toH = content.offsetHeight;
    const keyChanged = prevKey.current !== morphKey;
    const from = sizeRef.current;

    if (!booted.current) {
      booted.current = true;
      prevKey.current = morphKey;
      sizeRef.current = { w: toW, h: toH };
      return;
    }

    if (!keyChanged || noGoo || toW < 8 || toH < 8) {
      prevKey.current = morphKey;
      sizeRef.current = { w: toW, h: toH };
      return;
    }

    const fromW = from.w > 8 ? from.w : toW;
    const fromH = from.h > 8 ? from.h : toH;
    const sizeChanged =
      Math.abs(fromW - toW) > 2 || Math.abs(fromH - toH) > 2;

    prevKey.current = morphKey;
    tlRef.current?.kill();
    setMorphing(true);

    const blob = blobRef.current;
    if (blob) {
      gsap.set(blob, {
        width: fromW,
        height: fromH,
        borderRadius,
        opacity: 1,
        x: (toW - fromW) / 2,
        y: (toH - fromH) / 2,
      });
    }
    gsap.set(content, { opacity: 0 });

    const tl = gsap.timeline({
      onComplete: () => {
        setMorphing(false);
        sizeRef.current = { w: toW, h: toH };
        if (blob) gsap.set(blob, { clearProps: "all", opacity: 0 });
        gsap.set(content, { opacity: 1 });
      },
    });

    if (blob) {
      if (sizeChanged) {
        const midW =
          Math.max(fromW, toW) * 0.55 + Math.min(fromW, toW) * 0.45;
        const midH =
          Math.max(fromH, toH) * 0.55 + Math.min(fromH, toH) * 0.45;
        const midR = Math.min(borderRadius * 1.35, Math.min(midW, midH) * 0.45);
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
            borderRadius,
            x: 0,
            y: 0,
            duration: SPEED * 0.55,
            ease: "power1.out",
          },
          SPEED * 0.4,
        );
      } else {
        // Settle pulse — same footprint, organic squish.
        const midW = toW * 1.04;
        const midH = toH * 0.9;
        tl.to(
          blob,
          {
            width: midW,
            height: midH,
            borderRadius: borderRadius * 1.15,
            x: (toW - midW) / 2,
            y: (toH - midH) / 2,
            duration: SPEED * 0.4,
            ease: "power1.in",
          },
          0,
        );
        tl.to(
          blob,
          {
            width: toW,
            height: toH,
            borderRadius,
            x: 0,
            y: 0,
            duration: SPEED * 0.55,
            ease: "power1.out",
          },
          SPEED * 0.35,
        );
      }
    }

    tl.to(
      content,
      { opacity: 1, duration: SPEED * 0.35, ease: "power1.out" },
      SPEED * 0.5,
    );

    tlRef.current = tl;
    sizeRef.current = { w: toW, h: toH };

    return () => {
      tlRef.current?.kill();
      tlRef.current = null;
      // Interrupted morph (Strict Mode remount / rapid collapse) must not leave
      // content at opacity 0 or morphing=true forever.
      setMorphing(false);
      if (blob) gsap.set(blob, { clearProps: "all", opacity: 0 });
      gsap.set(content, { opacity: 1 });
    };
  }, [morphKey, noGoo, borderRadius]);

  useLayoutEffect(() => {
    if (morphing) return;
    const content = contentRef.current;
    if (!content) return;
    sizeRef.current = { w: content.offsetWidth, h: content.offsetHeight };
  });

  return (
    <div className={cn("relative w-full", className)} style={style}>
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
        className="relative z-[1] w-full"
        style={
          morphing
            ? ({ [transparentVar]: "transparent" } as CSSProperties)
            : undefined
        }
        data-surface-morphing={morphing ? "" : undefined}
      >
        {children}
      </div>
    </div>
  );
}
