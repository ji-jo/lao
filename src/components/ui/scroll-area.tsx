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
  /** Which axes can overflow. Defaults to `"vertical"`. */
  orientation?: Orientation;
  /** @deprecated ignored — product never shows scrollbar thumbs */
  alwaysShowScrollbar?: boolean;
  /**
   * Edge fade via `@ncdai/scroll-fade-effect` on the nano scrollport.
   * Defaults to `true`. Set `false` for proxy bars / non-content strips.
   */
  fade?: boolean;
  /**
   * Host is sized by max-height (not a filled parent). Makes the nano
   * scrollport inherit that cap so tall lists scroll instead of growing.
   */
  cap?: boolean;
};

/**
 * App scroll surface — `react-nano-scrollbar` + `@ncdai/scroll-fade-effect`
 * on the content port. Package CSS is imported once from `main.tsx`.
 *
 * Thumbs are never shown (product rule). Overflow still scrolls.
 */
export function ScrollArea({
  className,
  children,
  orientation = "vertical",
  alwaysShowScrollbar: _alwaysShowScrollbar,
  hideScrollbarX: _hideScrollbarX,
  hideScrollbarY: _hideScrollbarY,
  autohide: _autohide,
  viewportClassName: _viewportClassName,
  fade = true,
  cap = false,
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

  return (
    <div
      className={cn(
        "lao-nano-fade-host relative flex min-h-0 min-w-0 flex-col",
        cap && "lao-nano-cap",
        className,
      )}
    >
      <NanoScrollArea
        {...rest}
        horizontal={remapWheelToX}
        autohide={false}
        hideScrollbarX
        hideScrollbarY
        className={cn(
          "lao-nano-scroll h-full min-h-0 w-full min-w-0 flex-1",
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
