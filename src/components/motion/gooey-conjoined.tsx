"use client";

import { motion, useReducedMotion } from "motion/react";
import {
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
import { EASE_DRAWER } from "@/lib/ease";
import { cn } from "@/lib/utils";

/**
 * Supporting dock stays mounted — open/close is pure motion variants.
 *
 * Dual-layer: empty solid blobs sit under the SVG goo filter (panel + neck +
 * dock, and optional side panel + horizontal neck) so the melt reads; crisp UI
 * renders above with no filter so thin chrome isn't dissolved by blur.
 * Blobs are measured silhouettes — never cloned React trees.
 *
 * Pass `anchorRef` to sit the panel centered above a dock trigger (neck under
 * that control). Omit for classic centered-over-dock placement.
 */
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
}: {
  open: boolean;
  panel: ReactNode;
  panelKey?: string;
  /** Optional supporting panel to the right of `panel`, top-aligned. */
  sideOpen?: boolean;
  sidePanel?: ReactNode;
  sidePanelKey?: string;
  /** Dock control to align the panel / neck to. */
  anchorRef?: RefObject<HTMLElement | null>;
  children: ReactNode;
  side?: "top" | "bottom";
  gap?: number;
  /** Gap between main panel and side panel. */
  sideGap?: number;
  className?: string;
  panelClassName?: string;
  sidePanelClassName?: string;
  surface?: string;
}) {
  const reduce = useReducedMotion() ?? false;
  const unsupported = useMemo(() => isGooUnsupported(), []);
  const noGoo = reduce || unsupported;
  const gooId = `goo-${useId().replace(/:/g, "")}`;

  const rootRef = useRef<HTMLDivElement>(null);
  const dockRef = useRef<HTMLDivElement>(null);
  const panelMeasureRef = useRef<HTMLDivElement>(null);
  const sideMeasureRef = useRef<HTMLDivElement>(null);
  const [dockSize, setDockSize] = useState({ w: 0, h: 0 });
  const [panelSize, setPanelSize] = useState({ w: 0, h: 0 });
  const [sideSize, setSideSize] = useState({ w: 0, h: 0 });
  /** Panel left + neck X (px from root). Null = centered over dock. */
  const [placement, setPlacement] = useState<{
    panelLeft: number;
    neckX: number;
  } | null>(null);

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
    const dock = dockRef.current;
    if (!dock) return;
    const measure = () =>
      setDockSize({ w: dock.offsetWidth, h: dock.offsetHeight });
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(dock);
    return () => ro.disconnect();
  }, []);

  useLayoutEffect(() => {
    const el = panelMeasureRef.current;
    if (!el) return;
    const measure = () =>
      setPanelSize({ w: el.offsetWidth, h: el.offsetHeight });
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, [shownKey, open]);

  useLayoutEffect(() => {
    const el = sideMeasureRef.current;
    if (!el) return;
    const measure = () =>
      setSideSize({ w: el.offsetWidth, h: el.offsetHeight });
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, [shownSideKey, sideOpen]);

  // Sit the panel centered above the dock trigger; neck under its midpoint.
  useLayoutEffect(() => {
    const root = rootRef.current;
    if (!root) return;

    const measure = () => {
      const anchor = anchorRef?.current;
      if (!anchor) {
        setPlacement(null);
        return;
      }
      const rootRect = root.getBoundingClientRect();
      const a = anchor.getBoundingClientRect();
      const anchorCenter = a.left + a.width / 2 - rootRect.left;
      const w = panelMeasureRef.current?.offsetWidth || panelSize.w;
      // Prefer centered over the chip so wide panels sit "on top" of it.
      const panelLeft =
        w > 0 ? anchorCenter - w / 2 : a.left - rootRect.left;
      const neckX = anchorCenter - panelLeft;
      setPlacement({ panelLeft, neckX });
    };

    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(root);
    const anchor = anchorRef?.current;
    if (anchor) ro.observe(anchor);
    const panelEl = panelMeasureRef.current;
    if (panelEl) ro.observe(panelEl);
    window.addEventListener("resize", measure);
    return () => {
      ro.disconnect();
      window.removeEventListener("resize", measure);
    };
  }, [anchorRef, open, shownKey, panelSize.w]);

  const panelMotion = reduce
    ? {
        open: { opacity: 1 },
        closed: { opacity: 0 },
      }
    : {
        open: {
          scaleY: 1,
          scaleX: 1,
          opacity: 1,
          transition: {
            type: "spring" as const,
            stiffness: 400,
            damping: 30,
            mass: 0.65,
          },
        },
        closed: {
          scaleY: 0,
          scaleX: 0.9,
          opacity: 0,
          transition: {
            scaleY: { duration: 0.3, ease: EASE_DRAWER },
            scaleX: { duration: 0.3, ease: EASE_DRAWER },
            opacity: { duration: 0.12, delay: 0.18, ease: "linear" as const },
          },
        },
      };

  const sideMotion = reduce
    ? {
        open: { opacity: 1 },
        closed: { opacity: 0 },
      }
    : {
        open: {
          scaleX: 1,
          scaleY: 1,
          opacity: 1,
          transition: {
            type: "spring" as const,
            stiffness: 400,
            damping: 30,
            mass: 0.65,
          },
        },
        closed: {
          scaleX: 0,
          scaleY: 0.92,
          opacity: 0,
          transition: {
            scaleX: { duration: 0.28, ease: EASE_DRAWER },
            scaleY: { duration: 0.28, ease: EASE_DRAWER },
            opacity: { duration: 0.12, delay: 0.16, ease: "linear" as const },
          },
        },
      };

  const neckX =
    placement?.neckX ?? (panelSize.w > 0 ? panelSize.w / 2 : undefined);
  const transformOrigin =
    side === "top"
      ? neckX != null
        ? `bottom ${neckX}px`
        : "bottom center"
      : neckX != null
        ? `top ${neckX}px`
        : "top center";

  const panelPlacement = placement
    ? {
        left: placement.panelLeft,
        right: "auto" as const,
        marginLeft: 0,
        marginRight: 0,
        width: "max-content" as const,
        transformOrigin,
        pointerEvents: (open ? "auto" : "none") as "auto" | "none",
        ...(side === "top"
          ? { bottom: "100%", marginBottom: gap }
          : { top: "100%", marginTop: gap }),
      }
    : {
        left: 0,
        right: 0,
        marginLeft: "auto" as const,
        marginRight: "auto" as const,
        width: "max-content" as const,
        transformOrigin,
        pointerEvents: (open ? "auto" : "none") as "auto" | "none",
        ...(side === "top"
          ? { bottom: "100%", marginBottom: gap }
          : { top: "100%", marginTop: gap }),
      };

  const dockNeck = (
    <div
      aria-hidden
      className="pointer-events-none absolute -translate-x-1/2 rounded-full"
      style={{
        width: 52,
        height: gap + 14,
        backgroundColor: surface,
        left: neckX ?? "50%",
        ...(side === "top"
          ? { top: "100%", marginTop: -7 }
          : { bottom: "100%", marginBottom: -7 }),
      }}
    />
  );

  const sideNeckW = sideGap + 14;
  const sideNeckH = 52;

  const sideNeck = (
    <div
      aria-hidden
      className="pointer-events-none absolute top-8 -translate-y-1/2 rounded-full"
      style={{
        width: sideNeckW,
        height: sideNeckH,
        backgroundColor: surface,
        left: -sideNeckW / 2 + 2,
      }}
    />
  );

  const sideBoxStyle = {
    position: "absolute" as const,
    top: 0,
    left: "100%" as const,
    marginLeft: sideGap,
    transformOrigin: "left center",
  };

  const blobPanelStyle = placement
    ? {
        left: placement.panelLeft,
        right: "auto" as const,
        marginLeft: 0,
        marginRight: 0,
        transformOrigin,
        pointerEvents: "none" as const,
        width: panelSize.w || undefined,
        height: panelSize.h || undefined,
        ...(side === "top"
          ? { bottom: "100%", marginBottom: gap }
          : { top: "100%", marginTop: gap }),
      }
    : {
        left: 0,
        right: 0,
        marginLeft: "auto" as const,
        marginRight: "auto" as const,
        transformOrigin,
        pointerEvents: "none" as const,
        width: panelSize.w || undefined,
        height: panelSize.h || undefined,
        ...(side === "top"
          ? { bottom: "100%", marginBottom: gap }
          : { top: "100%", marginTop: gap }),
      };

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

      {!noGoo ? (
        <div
          aria-hidden
          className="pointer-events-none absolute inset-0 z-0 overflow-visible"
          style={{ filter: `url(#${gooId})` }}
        >
          <motion.div
            initial={false}
            animate={open ? "open" : "closed"}
            variants={panelMotion}
            style={blobPanelStyle}
            className="absolute z-0 overflow-visible will-change-transform"
          >
            <div
              className="relative"
              style={{ width: panelSize.w, height: panelSize.h }}
            >
              <div
                className="absolute left-0 top-0 rounded-xl"
                style={{
                  backgroundColor: surface,
                  width: panelSize.w,
                  height: panelSize.h,
                }}
              />
              <motion.div
                initial={false}
                animate={sideOpen ? "open" : "closed"}
                variants={sideMotion}
                style={{
                  ...sideBoxStyle,
                  width: sideSize.w || undefined,
                  height: sideSize.h || undefined,
                }}
                className="overflow-visible will-change-transform"
              >
                <div
                  className="rounded-xl"
                  style={{
                    backgroundColor: surface,
                    width: sideSize.w,
                    height: sideSize.h,
                  }}
                />
                {sideNeck}
              </motion.div>
            </div>
            {dockNeck}
          </motion.div>

          <div
            className="absolute bottom-0 left-0 rounded-full"
            style={{
              backgroundColor: surface,
              width: dockSize.w || "100%",
              height: dockSize.h || "100%",
            }}
          />
        </div>
      ) : null}

      <div className="relative z-[1] inline-flex items-center justify-center overflow-visible">
        <motion.div
          initial={false}
          animate={open ? "open" : "closed"}
          variants={panelMotion}
          style={panelPlacement}
          className="absolute z-50 overflow-visible will-change-transform"
          aria-hidden={!open}
        >
          <div className="relative overflow-visible">
            <div
              style={{ backgroundColor: noGoo ? surface : "transparent" }}
              className={cn(panelClassName)}
            >
              <div ref={panelMeasureRef}>{shownPanel}</div>
            </div>

            <motion.div
              initial={false}
              animate={sideOpen ? "open" : "closed"}
              variants={sideMotion}
              style={{
                ...sideBoxStyle,
                pointerEvents: sideOpen ? "auto" : "none",
                width: "max-content",
              }}
              className="z-[1] overflow-visible will-change-transform"
              aria-hidden={!sideOpen}
            >
              <div
                style={{ backgroundColor: noGoo ? surface : "transparent" }}
                className={cn("rounded-xl", sidePanelClassName)}
              >
                <div ref={sideMeasureRef}>{shownSide}</div>
              </div>
              {noGoo ? sideNeck : null}
            </motion.div>
          </div>
          {noGoo ? dockNeck : null}
        </motion.div>

        <div ref={dockRef} className="relative z-[1] shrink-0">
          {children}
        </div>
      </div>
    </div>
  );
}
