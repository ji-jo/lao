import type { ComponentProps } from "react";

import { cn } from "@/lib/utils";

export type ScrollFadeOrientation = "horizontal" | "vertical";

export type ScrollFadeEffectProps = ComponentProps<"div"> & {
  /**
   * Scroll direction to apply the fade effect.
   * @defaultValue "vertical"
   */
  orientation?: ScrollFadeOrientation;
};

/** Utility class from `@ncdai/scroll-fade-effect` for a given axis. */
export function scrollFadeEffectClass(
  orientation: ScrollFadeOrientation = "vertical",
) {
  return orientation === "horizontal"
    ? "scroll-fade-effect-x"
    : "scroll-fade-effect-y";
}

/**
 * Fade content edges as you scroll (scroll-driven mask).
 * For app chrome, prefer `<ScrollArea>` — it applies this to every nano
 * scrollport automatically.
 */
export function ScrollFadeEffect({
  className,
  orientation = "vertical",
  ...props
}: ScrollFadeEffectProps) {
  return (
    <div
      data-orientation={orientation}
      className={cn(
        orientation === "horizontal"
          ? "overflow-x-auto scroll-fade-effect-x"
          : "overflow-y-auto scroll-fade-effect-y",
        className,
      )}
      {...props}
    />
  );
}
