"use client";

/**
 * Dock ↔ supporting panel melt using SmoothUI gooey-popover technique
 * (GSAP dual-layer morph + SmoothUI filter constants).
 *
 * Critical: the goo filter only wraps a chip-sized blob + morphing panel
 * shapes — never the whole dock bar (that melts the timeline into the panel).
 */

import gsap from "gsap";
import {
  useEffect,
  useId,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
  type RefObject,
} from "react";
import { GooeyFilter } from "@/components/motion/gooey-filter";
import { isGooUnsupported } from "@/components/motion/is-goo-unsupported";
import { cn } from "@/lib/utils";

const SPEED = 0.28;
const PANEL_RADIUS = 16;

export function GooeyConjoined({
  open,
  panel,
  panelKey = "panel",
  sideOpen = false,
  sidePanel = null,
  sidePanelKey = "side",
  anchorRef,
  children,
  side = "top",
  gap = 8,
  sideGap = 8,
  className,
  panelClassName,
  sidePanelClassName,
  surface = "#131212",
  panelOffset,
}: {
  open: boolean;
  panel: ReactNode;
  panelKey?: string;
  sideOpen?: boolean;
  sidePanel?: ReactNode;
  sidePanelKey?: string;
  anchorRef?: RefObject<HTMLElement | null>;
  children: ReactNode;
  side?: "top" | "bottom";
  gap?: number;
  sideGap?: number;
  className?: string;
  panelClassName?: string;
  sidePanelClassName?: string;
  surface?: string;
  /** Free-drag offset for the supporting panel (viewport px). */
  panelOffset?: { x: number; y: number };
}) {
  const reduce =
    typeof window !== "undefined" &&
    window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  const unsupported = useMemo(() => isGooUnsupported(), []);
  const noGoo = reduce || unsupported;
  const gooId = `goo-${useId().replace(/:/g, "")}`;

  const rootRef = useRef<HTMLDivElement>(null);
  const dockRef = useRef<HTMLDivElement>(null);
  const panelMeasureRef = useRef<HTMLDivElement>(null);
  const sideMeasureRef = useRef<HTMLDivElement>(null);
  const filteredPanelRef = useRef<HTMLDivElement>(null);
  const unfilteredPanelRef = useRef<HTMLDivElement>(null);
  const innerPanelRef = useRef<HTMLDivElement>(null);
  const filteredSideRef = useRef<HTMLDivElement>(null);
  const unfilteredSideRef = useRef<HTMLDivElement>(null);
  const timelineRef = useRef<gsap.core.Timeline | null>(null);
  const sideTimelineRef = useRef<gsap.core.Timeline | null>(null);

  const [panelSize, setPanelSize] = useState({ w: 0, h: 0 });
  const [sideSize, setSideSize] = useState({ w: 0, h: 0 });
  const [anchorSize, setAnchorSize] = useState({ w: 36, h: 36 });
  const [placement, setPlacement] = useState<{
    panelLeft: number;
    anchorLeft: number;
    anchorTop: number;
    /** Viewport coords — fixed panel escapes bottom-chrome overflow clipping. */
    fixedLeft: number;
    fixedTop: number;
  } | null>(null);
  const [visible, setVisible] = useState(false);
  const [sideVisible, setSideVisible] = useState(false);
  /** Chip blob only during morph — keeping it while open melts the dock bar. */
  const [bridging, setBridging] = useState(false);

  const latch = useRef({ panel, panelKey });
  if (open && panel != null) {
    latch.current = { panel, panelKey };
  }
  const { panel: shownPanel, panelKey: shownKey } = latch.current;

  const sideLatch = useRef({ panel: sidePanel, key: sidePanelKey });
  if (sideOpen && sidePanel != null) {
    sideLatch.current = { panel: sidePanel, key: sidePanelKey };
  }
  const { panel: shownSide, key: shownSideKey } = sideLatch.current;

  useLayoutEffect(() => {
    const el = panelMeasureRef.current;
    if (!el) return;
    const measure = () => {
      // Layout box only — scrollHeight includes overflow inside ScrollAreas
      // (e.g. brush list) and inflates the gooey shell to full content height.
      const rect = el.getBoundingClientRect();
      const w = Math.max(el.offsetWidth, Math.round(rect.width));
      const h = Math.max(el.offsetHeight, Math.round(rect.height));
      if (w > 0 && h > 0) setPanelSize({ w, h });
    };
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, [shownKey, open]);

  useLayoutEffect(() => {
    const el = sideMeasureRef.current;
    if (!el) return;
    const measure = () => {
      const rect = el.getBoundingClientRect();
      const w = Math.max(el.offsetWidth, Math.round(rect.width));
      const h = Math.max(el.offsetHeight, Math.round(rect.height));
      if (w > 0 && h > 0) setSideSize({ w, h });
    };
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, [shownSideKey, sideOpen]);

  useLayoutEffect(() => {
    const root = rootRef.current;
    if (!root) return;

    const measure = () => {
      const anchor = anchorRef?.current;
      const rootRect = root.getBoundingClientRect();
      if (!anchor) {
        setPlacement(null);
        setAnchorSize({ w: 36, h: 36 });
        return;
      }
      const a = anchor.getBoundingClientRect();
      setAnchorSize({ w: a.width, h: a.height });
      const w =
        panelSize.w || panelMeasureRef.current?.offsetWidth || 0;
      const h =
        panelSize.h || panelMeasureRef.current?.offsetHeight || 0;
      const anchorCenter = a.left + a.width / 2 - rootRect.left;
      const panelLeft = w > 0 ? anchorCenter - w / 2 : a.left - rootRect.left;
      const dock = dockRef.current?.getBoundingClientRect();
      const anchorTop = dock
        ? a.top - dock.top
        : a.top - rootRect.top;
      const fixedLeft = w > 0 ? a.left + a.width / 2 - w / 2 : a.left;
      // Park unmeasured panels off-screen. With h=0, `top = anchor - gap` plus
      // height:auto grows downward over the dock and steals chip clicks —
      // especially when the timeline is collapsed and the dock sits lower.
      const fixedTop =
        h > 0
          ? side === "top"
            ? a.top - gap - h
            : a.bottom + gap
          : -9999;
      setPlacement({
        panelLeft,
        anchorLeft: a.left - rootRect.left,
        anchorTop,
        fixedLeft,
        fixedTop,
      });
    };

    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(root);
    const anchor = anchorRef?.current;
    if (anchor) ro.observe(anchor);
    const panelEl = panelMeasureRef.current;
    if (panelEl) ro.observe(panelEl);
    window.addEventListener("resize", measure);
    window.addEventListener("scroll", measure, true);
    return () => {
      ro.disconnect();
      window.removeEventListener("resize", measure);
      window.removeEventListener("scroll", measure, true);
    };
  }, [anchorRef, open, shownKey, panelSize.w, panelSize.h, side, gap]);

  const ox = panelOffset?.x ?? 0;
  const oy = panelOffset?.y ?? 0;
  const panelDragTransform =
    ox !== 0 || oy !== 0
      ? `translate3d(${ox}px, ${oy}px, 0)`
      : undefined;

  // Morph origin: chip-sized blob at the anchor, relative to panel slot top-left
  const chipStart = {
    width: anchorSize.w,
    height: anchorSize.h,
    borderRadius: Math.min(anchorSize.w, anchorSize.h) / 2,
    x:
      (placement
        ? placement.anchorLeft + anchorSize.w / 2 - placement.panelLeft
        : (panelSize.w || 0) / 2) -
      anchorSize.w / 2,
    y: side === "top" ? panelSize.h + gap : -(gap + anchorSize.h),
  };

  /** Only (re)play the open melt when open flips on or the panel kind changes —
   *  not on every anchor/size nudge (fullscreen resize / chip label thrash). */
  const morphGenRef = useRef({ open: false, key: shownKey });

  useEffect(() => {
    if (noGoo) {
      setVisible(open);
      morphGenRef.current = { open, key: shownKey };
      return;
    }
    if (panelSize.w === 0 || panelSize.h === 0) {
      if (open) {
        setVisible(true);
        // Keep crisp panel readable while size is still measuring.
        const unfiltered = unfilteredPanelRef.current;
        const inner = innerPanelRef.current;
        if (unfiltered) gsap.set(unfiltered, { opacity: 1 });
        if (inner) gsap.set(inner, { opacity: 1, y: 0 });
      }
      return;
    }

    const filtered = filteredPanelRef.current;
    const unfiltered = unfilteredPanelRef.current;
    const inner = innerPanelRef.current;
    if (!unfiltered || !inner) return;

    if (open) {
      const shouldMorph =
        !morphGenRef.current.open || morphGenRef.current.key !== shownKey;
      morphGenRef.current = { open: true, key: shownKey };

      if (!shouldMorph) {
        // Already open — snap shell to latest measured size; do not replay melt.
        if (timelineRef.current) timelineRef.current.kill();
        timelineRef.current = null;
        setVisible(true);
        setBridging(false);
        const settled = {
          width: panelSize.w,
          height: panelSize.h,
          borderRadius: PANEL_RADIUS,
          x: 0,
          y: 0,
          opacity: 1,
        };
        if (filtered) gsap.set(filtered, { ...settled, borderRadius: 0 });
        gsap.set(unfiltered, settled);
        gsap.set(inner, { opacity: 1, y: 0 });
        return;
      }

      if (timelineRef.current) timelineRef.current.kill();
      setVisible(true);
      setBridging(true);
      const start = {
        width: chipStart.width,
        height: chipStart.height,
        borderRadius: chipStart.borderRadius,
        x: chipStart.x,
        y: chipStart.y,
        opacity: 1,
      };
      if (filtered) gsap.set(filtered, start);
      gsap.set(unfiltered, start);
      gsap.set(inner, { opacity: 0, y: side === "top" ? 12 : -12 });

      const tl = gsap.timeline({
        onComplete: () => {
          setBridging(false);
          // Belt-and-suspenders: never leave the pack invisible after melt.
          gsap.set(unfiltered, { opacity: 1, x: 0, y: 0 });
          gsap.set(inner, { opacity: 1, y: 0 });
        },
      });
      if (filtered) {
        tl.to(
          filtered,
          {
            width: panelSize.w,
            height: panelSize.h,
            borderRadius: 0,
            x: 0,
            y: 0,
            duration: SPEED,
            ease: "power1.in",
          },
          0,
        );
      }
      tl.to(
        unfiltered,
        {
          width: panelSize.w,
          height: panelSize.h,
          borderRadius: PANEL_RADIUS,
          x: 0,
          y: 0,
          duration: SPEED,
          ease: "power1.in",
        },
        0,
      );
      tl.to(
        inner,
        {
          opacity: 1,
          y: 0,
          duration: SPEED * 0.75,
          ease: "power1.out",
        },
        SPEED * 0.5,
      );
      timelineRef.current = tl;
    } else if (visible) {
      morphGenRef.current = { open: false, key: shownKey };
      if (timelineRef.current) timelineRef.current.kill();
      setBridging(true);
      const tl = gsap.timeline({
        onComplete: () => {
          setVisible(false);
          setBridging(false);
        },
      });
      tl.to(inner, {
        opacity: 0,
        y: side === "top" ? 8 : -8,
        duration: SPEED * 0.35,
        ease: "power1.in",
      });
      const targets = [filtered, unfiltered].filter(Boolean);
      tl.to(
        targets,
        {
          width: chipStart.width,
          height: chipStart.height,
          borderRadius: chipStart.borderRadius,
          x: chipStart.x,
          y: chipStart.y,
          duration: SPEED,
          ease: "power1.in",
        },
        SPEED * 0.15,
      );
      tl.to(
        targets,
        {
          opacity: 0,
          duration: SPEED * 0.25,
          ease: "power1.in",
        },
        `-=${SPEED * 0.25}`,
      );
      timelineRef.current = tl;
    } else {
      morphGenRef.current = { open: false, key: shownKey };
    }
    // chipStart used only when starting a morph; layout nudges use the snap path.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    open,
    noGoo,
    panelSize.w,
    panelSize.h,
    visible,
    side,
    shownKey,
  ]);

  useEffect(() => {
    if (noGoo) {
      setSideVisible(sideOpen);
      return;
    }
    if (sideTimelineRef.current) sideTimelineRef.current.kill();
    const filtered = filteredSideRef.current;
    const unfiltered = unfilteredSideRef.current;
    if (!sideOpen) {
      if (!sideVisible) return;
      const tl = gsap.timeline({ onComplete: () => setSideVisible(false) });
      const targets = [filtered, unfiltered].filter(Boolean);
      tl.to(targets, {
        opacity: 0,
        scaleX: 0.85,
        duration: SPEED * 0.45,
        ease: "power1.in",
      });
      sideTimelineRef.current = tl;
      return;
    }
    if (sideSize.w === 0) {
      setSideVisible(true);
      return;
    }
    setSideVisible(true);
    const targets = [filtered, unfiltered].filter(Boolean);
    gsap.set(targets, {
      opacity: 0,
      scaleX: 0.85,
      transformOrigin: "left center",
    });
    const tl = gsap.timeline();
    tl.to(targets, {
      opacity: 1,
      scaleX: 1,
      duration: SPEED,
      ease: "power1.out",
    });
    sideTimelineRef.current = tl;
    return () => {
      sideTimelineRef.current?.kill();
    };
  }, [sideOpen, sideSize.w, sideSize.h, noGoo, sideVisible]);

  // Fixed to the viewport so bottom-chrome max-height / flex clipping can't
  // swallow panels that open upward from the setting dock (brush pack, etc.).
  const panelSlotStyle = placement
    ? {
        position: "fixed" as const,
        left: placement.fixedLeft,
        top: placement.fixedTop,
        right: "auto" as const,
        bottom: "auto" as const,
        marginBottom: 0,
        marginTop: 0,
        zIndex: 80,
      }
    : {
        position: "absolute" as const,
        left: 0,
        right: 0,
        marginLeft: "auto" as const,
        marginRight: "auto" as const,
        ...(side === "top"
          ? { bottom: "100%", marginBottom: gap }
          : { top: "100%", marginTop: gap }),
      };

  const showPanel = open || visible;
  const showSide = sideOpen || sideVisible;
  const chipRadius = Math.min(anchorSize.w, anchorSize.h) / 2;

  return (
    <div
      ref={rootRef}
      className={cn(
        "relative inline-flex overflow-visible",
        noGoo && "no-goo",
        className,
      )}
    >
      {!noGoo ? <GooeyFilter id={gooId} /> : null}

      {/*
        Goo layer only while morphing (bridging) or side-panel open.
        Never silhouette the whole dock — that melts the timeline into the bar.
      */}
      {!noGoo && showPanel && (bridging || showSide) ? (
        <div
          aria-hidden
          className="pointer-events-none absolute z-0 overflow-visible"
          style={{
            ...panelSlotStyle,
            width: panelSize.w || anchorSize.w,
            height: panelSize.h || anchorSize.h,
            filter: `url(#${gooId})`,
            transform: panelDragTransform,
          }}
        >
          {/* Stationary chip blob — only while morphing, else it melts the dock */}
          {bridging ? (
            <div
              className="absolute"
              style={{
                backgroundColor: surface,
                width: anchorSize.w,
                height: anchorSize.h,
                borderRadius: chipRadius,
                left: chipStart.x,
                top: chipStart.y,
              }}
            />
          ) : null}

          {/* Morphing panel shape — hide after settle; crisp layer owns the open panel */}
          <div
            ref={filteredPanelRef}
            className="absolute left-0 top-0"
            style={{
              backgroundColor: surface,
              width: anchorSize.w,
              height: anchorSize.h,
              borderRadius: chipRadius,
              opacity: 0,
              visibility: bridging ? "visible" : "hidden",
            }}
          />

          {showSide ? (
            <>
              <div
                ref={filteredSideRef}
                className="absolute top-0 rounded-xl"
                style={{
                  backgroundColor: surface,
                  width: sideSize.w || 120,
                  height: sideSize.h || 80,
                  left: (panelSize.w || 0) + sideGap,
                  opacity: 0,
                }}
              />
              {/* Thin horizontal neck chip→side only */}
              <div
                className="absolute rounded-full"
                style={{
                  backgroundColor: surface,
                  width: sideGap + 8,
                  height: Math.min(36, anchorSize.h),
                  left: (panelSize.w || 0) - 4,
                  top: 12,
                }}
              />
            </>
          ) : null}
        </div>
      ) : null}

      {/* Crisp UI layer — dock stays outside any SVG filter */}
      <div className="relative z-[1] inline-flex items-center justify-center overflow-visible">
        {!showPanel ? (
          <div
            className="pointer-events-none absolute"
            style={{ left: -9999, top: -9999, visibility: "hidden" }}
            aria-hidden
          >
            <div ref={panelMeasureRef} className="w-max">
              {shownPanel}
            </div>
            <div ref={sideMeasureRef} className="w-max">
              {shownSide}
            </div>
          </div>
        ) : null}

        {showPanel ? (
          <div
            className="absolute z-50 overflow-visible"
            style={{
              ...panelSlotStyle,
              width: panelSize.w || "max-content",
              height: panelSize.h || "auto",
              // Only accept hits once sized — otherwise the auto-height shell
              // covers the dock chips and the open melt looks "dead".
              pointerEvents:
                open && panelSize.w > 0 && panelSize.h > 0 ? "auto" : "none",
              visibility:
                panelSize.w > 0 && panelSize.h > 0 ? "visible" : "hidden",
              transform: panelDragTransform,
            }}
            aria-hidden={!open}
          >
            <div
              ref={unfilteredPanelRef}
              className={cn("overflow-hidden", panelClassName)}
              style={{
                backgroundColor: surface,
                borderRadius: PANEL_RADIUS,
                ...(noGoo
                  ? {
                      width: panelSize.w || undefined,
                      height: panelSize.h || undefined,
                      opacity: open ? 1 : 0,
                    }
                  : {}),
              }}
            >
              <div ref={innerPanelRef}>
                <div ref={panelMeasureRef} className="w-max">
                  {shownPanel}
                </div>
              </div>
            </div>

            {showSide ? (
              <div
                className={cn(
                  "absolute top-0 z-[1] overflow-visible",
                  sidePanelClassName,
                )}
                style={{
                  left: "100%",
                  marginLeft: sideGap,
                  pointerEvents: sideOpen ? "auto" : "none",
                }}
                aria-hidden={!sideOpen}
              >
                <div
                  ref={unfilteredSideRef}
                  className="overflow-hidden rounded-xl"
                  style={{
                    backgroundColor: surface,
                    ...(noGoo
                      ? {
                          width: sideSize.w || undefined,
                          height: sideSize.h || undefined,
                          opacity: sideOpen ? 1 : 0,
                        }
                      : {
                          width: sideSize.w || undefined,
                          height: sideSize.h || undefined,
                        }),
                  }}
                >
                  <div ref={sideMeasureRef} className="w-max">
                    {shownSide}
                  </div>
                </div>
              </div>
            ) : null}
          </div>
        ) : null}

        <div ref={dockRef} className="relative z-[1] shrink-0">
          {children}
        </div>
      </div>
    </div>
  );
}
