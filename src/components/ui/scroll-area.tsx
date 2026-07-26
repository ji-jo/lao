"use client";

import {
  ScrollArea as NanoScrollArea,
  type ScrollAreaProps as NanoScrollAreaProps,
} from "react-nano-scrollbar";
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
  autohide,
  viewportClassName: _viewportClassName,
  fade = true,
  horizontal,
  ...rest
}: ScrollAreaProps) {
  const axisHorizontal = horizontal || orientation === "horizontal";
  const fadeOrientation: "vertical" | "horizontal" | "both" = axisHorizontal
    ? "horizontal"
    : orientation === "both"
      ? "both"
      : "vertical";

  return (
    <NanoScrollArea
      {...rest}
      horizontal={axisHorizontal}
      // Hover/scroll reveal — only force visible when explicitly requested.
      autohide={alwaysShowScrollbar ? false : (autohide ?? true)}
      hideScrollbarX={
        hideScrollbarX ?? (orientation === "vertical" && !axisHorizontal)
      }
      hideScrollbarY={hideScrollbarY ?? orientation === "horizontal"}
      className={cn(
        "lao-nano-scroll",
        fade && fadeOrientation === "vertical" && "lao-nano-fade-y",
        fade && fadeOrientation === "horizontal" && "lao-nano-fade-x",
        fade && fadeOrientation === "both" && "lao-nano-fade-both",
        className,
      )}
    >
      {children}
    </NanoScrollArea>
  );
}

/** No-op — nano draws its own thumbs. Kept for import compatibility. */
export function ScrollBar() {
  return null;
}

export { ScrollFadeEffect } from "@/components/scroll-fade-effect";
