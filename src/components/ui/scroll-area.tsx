"use client";

import { useEffect, useRef, type RefObject } from "react";
import {
  ScrollArea as NanoScrollArea,
  type ScrollAreaProps as NanoScrollAreaProps,
} from "react-nano-scrollbar";
import {
  animate,
  useMotionValue,
  useMotionValueEvent,
  useReducedMotion,
} from "motion/react";
import { cn } from "@/lib/utils";

type Orientation = "vertical" | "horizontal" | "both";

export type ScrollAreaProps = NanoScrollAreaProps & {
  /** @deprecated ignored — kept so call sites don't break */
  viewportClassName?: string;
  /** Which axes show thumbs. Defaults to `"vertical"`. */
  orientation?: Orientation;
  /**
   * Opt out of hover-only thumbs. Default is autohide — bars appear only while
   * hovering the scroll surface (or while scrolling).
   */
  alwaysShowScrollbar?: boolean;
  /**
   * Edge fade via `@ncdai/scroll-fade-effect` on the nano scrollport.
   * Defaults to `true`. Set `false` for proxy bars / non-content strips.
   */
  fade?: boolean;
};

const FADE_IN = { duration: 0.22, ease: [0.22, 1, 0.36, 1] as const };
const FADE_OUT = { duration: 0.45, ease: [0.22, 1, 0.36, 1] as const };
const HIDE_DELAY_MS = 280;

/**
 * Drive thumb opacity with Motion — nano's CSS autohide snaps too hard.
 * We keep nano's tracks mounted (`autohide={false}`) and fade them ourselves.
 */
function useThumbFade(
  wrapRef: RefObject<HTMLDivElement | null>,
  enabled: boolean,
) {
  const reduce = useReducedMotion() ?? false;
  const opacity = useMotionValue(enabled ? 0 : 0.55);
  const visibleRef = useRef(false);
  const hideTimer = useRef<number | null>(null);

  useMotionValueEvent(opacity, "change", (v) => {
    const el = wrapRef.current;
    if (!el) return;
    el.style.setProperty("--lao-sb-opacity", String(v));
    el.dataset.sbVisible = v > 0.04 ? "1" : "0";
  });

  useEffect(() => {
    const el = wrapRef.current;
    if (!el) return;

    if (!enabled) {
      opacity.set(0.55);
      el.style.setProperty("--lao-sb-opacity", "0.55");
      el.dataset.sbVisible = "1";
      return;
    }

    opacity.set(0);
    el.style.setProperty("--lao-sb-opacity", "0");
    el.dataset.sbVisible = "0";

    function clearHide() {
      if (hideTimer.current != null) {
        window.clearTimeout(hideTimer.current);
        hideTimer.current = null;
      }
    }

    function show() {
      clearHide();
      if (visibleRef.current && opacity.get() > 0.5) return;
      visibleRef.current = true;
      if (reduce) {
        opacity.set(0.55);
        return;
      }
      animate(opacity, 0.55, FADE_IN);
    }

    function scheduleHide() {
      clearHide();
      hideTimer.current = window.setTimeout(() => {
        visibleRef.current = false;
        if (reduce) {
          opacity.set(0);
          return;
        }
        animate(opacity, 0, FADE_OUT);
      }, HIDE_DELAY_MS);
    }

    function onEnter() {
      show();
    }
    function onLeave() {
      scheduleHide();
    }
    function onScrollActivity() {
      show();
      scheduleHide();
    }

    el.addEventListener("pointerenter", onEnter);
    el.addEventListener("pointerleave", onLeave);
    const content = el.querySelector(
      ".react-nano-scrollbar-content",
    ) as HTMLElement | null;
    content?.addEventListener("scroll", onScrollActivity, { passive: true });
    // Dragging a thumb also fires scroll; still listen for pointer on tracks.
    el.addEventListener("pointerdown", onScrollActivity);

    return () => {
      clearHide();
      el.removeEventListener("pointerenter", onEnter);
      el.removeEventListener("pointerleave", onLeave);
      el.removeEventListener("pointerdown", onScrollActivity);
      content?.removeEventListener("scroll", onScrollActivity);
    };
  }, [enabled, opacity, reduce, wrapRef]);
}

/**
 * App scroll surface — `react-nano-scrollbar` + `@ncdai/scroll-fade-effect`
 * on the content port. Package CSS is imported once from `main.tsx`.
 *
 * Fade classes (`lao-nano-fade-*`) are defined in `index.css` and target
 * `.react-nano-scrollbar-content`. For standalone (non-ScrollArea) surfaces,
 * use `ScrollFadeEffect` from `@/components/scroll-fade-effect`.
 */
export function ScrollArea({
  className,
  children,
  orientation = "vertical",
  alwaysShowScrollbar = false,
  hideScrollbarX,
  hideScrollbarY,
  autohide: _autohide,
  viewportClassName: _viewportClassName,
  fade = true,
  horizontal,
  ...rest
}: ScrollAreaProps) {
  /**
   * Nano's `horizontal` prop is NOT "enable X axis" — it remaps wheel deltaY →
   * scrollLeft and preventDefaults every wheel event. Only use it for
   * horizontal-only strips. For `both`, leave it false and let overflow:auto
   * handle X+Y natively (trackpad deltaX included).
   */
  const remapWheelToX = Boolean(horizontal) || orientation === "horizontal";
  const fadeOrientation: "vertical" | "horizontal" | "both" =
    orientation === "both"
      ? "both"
      : remapWheelToX
        ? "horizontal"
        : "vertical";

  const wrapRef = useRef<HTMLDivElement>(null);
  useThumbFade(wrapRef, !alwaysShowScrollbar);

  return (
    <div
      ref={wrapRef}
      className={cn(
        "lao-nano-fade-host relative flex min-h-0 min-w-0 flex-col",
        className,
      )}
    >
      <NanoScrollArea
        {...rest}
        horizontal={remapWheelToX}
        // Motion owns reveal — keep nano tracks always "on" (opacity via CSS var).
        autohide={false}
        hideScrollbarX={
          hideScrollbarX ?? (orientation === "vertical" && !remapWheelToX)
        }
        hideScrollbarY={hideScrollbarY ?? orientation === "horizontal"}
        className={cn(
          "lao-nano-scroll h-full min-h-0 w-full min-w-0 flex-1",
          !alwaysShowScrollbar && "lao-nano-motion-thumbs",
          fade && fadeOrientation === "vertical" && "lao-nano-fade-y",
          fade && fadeOrientation === "horizontal" && "lao-nano-fade-x",
          fade && fadeOrientation === "both" && "lao-nano-fade-both",
        )}
      >
        {children}
      </NanoScrollArea>
    </div>
  );
}

/** No-op — nano draws its own thumbs. Kept for import compatibility. */
export function ScrollBar() {
  return null;
}

export { ScrollFadeEffect } from "@/components/scroll-fade-effect";
