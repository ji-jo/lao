import { useState, type ButtonHTMLAttributes, type ReactNode } from "react";
import { cn } from "@/lib/utils";

/**
 * A button whose hover treatment touches ONLY background and border color —
 * no scale, no shadow, no layout shift. That's a deliberate constraint (D:
 * "the treatment only applies to the bg and border color, so play with
 * gradients only"), not a limitation of what this component *could* do.
 *
 * Built once as a shared primitive — pull this in for the next surface that
 * needs a "make it feel alive" pass instead of hand-rolling hover state
 * again. Same spirit as the fluid `Tabs` component's hover layer
 * (`src/components/ui/tabs.tsx`): idle and hover are separate layers that
 * cross-fade, not a hard state snap — just built for a single button here
 * instead of a segmented control.
 *
 * `background-image` cannot be transitioned by the browser — two gradient
 * strings don't interpolate, the value just snaps. So the hover state is a
 * second layer carrying the hover background, cross-faded in via `opacity`.
 * `border-color` transitions natively since solid colors *do* interpolate.
 *
 * Both are driven from React state (`onPointerEnter`/`Leave` → inline
 * style), not a `:hover`/`group-hover:` CSS class. That's deliberate, not
 * stylistic: a CSS-only `:hover` match can silently fail to apply (two
 * `before:bg-*` Tailwind classes raced on specificity in this same codebase's
 * timeline dock and lost — see TimelineDockParts.tsx history), and unlike
 * plain CSS, JS-driven hover is something a synthetic `onPointerEnter` call
 * in a test can actually exercise and verify.
 *
 * `children` may be a render-prop `(hovered) => ReactNode` so the caller can
 * flip its own label/icon color on hover (e.g. to white) — plain ReactNode
 * still works when the content's color never needs to react to hover.
 *
 * The hover gradient pulses (`pulsate`, on by default) instead of sitting
 * static once faded in — see the `gradient-hover-pulse` keyframes in
 * index.css for how (it pans the gradient, since a background-image string
 * itself can't be tweened). Assumes a roughly vertical `hoverBackground`
 * gradient, matching every gradient currently used in this app (all `180deg`
 * or close to it) — set `pulsate={false}` for a flat color or a gradient
 * whose axis the pan would look wrong against.
 */
export interface GradientHoverButtonProps
  extends Omit<ButtonHTMLAttributes<HTMLButtonElement>, "className" | "style" | "children"> {
  /** idle background — solid color or `linear-gradient(...)` */
  background: string;
  /** hover background — cross-fades in over `background` */
  hoverBackground: string;
  /** border color while idle (omit for no border — a transparent 1px is
   *  still reserved so a hover border can't shift layout by appearing) */
  borderColor?: string;
  /** border color on hover; defaults to `borderColor` if omitted */
  hoverBorderColor?: string;
  borderWidth?: number;
  /** ms for both the gradient cross-fade and the border transition */
  durationMs?: number;
  /** e.g. "border-box" — some Paper chips (the modal close button) rely on
   *  the border showing a hint of the background through it */
  backgroundOrigin?: string;
  /** breathe the hover gradient continuously instead of holding it static
   *  once faded in. Default true. */
  pulsate?: boolean;
  /** seconds per full pulse cycle */
  pulsateSeconds?: number;
  className?: string;
  children: ReactNode | ((hovered: boolean) => ReactNode);
}

export function GradientHoverButton({
  background,
  hoverBackground,
  borderColor,
  hoverBorderColor,
  borderWidth = 1,
  durationMs = 220,
  backgroundOrigin,
  pulsate = true,
  pulsateSeconds = 2.4,
  className,
  children,
  disabled,
  onPointerEnter,
  onPointerLeave,
  onFocus,
  onBlur,
  ...props
}: GradientHoverButtonProps) {
  const [lit, setLit] = useState(false);
  const active = lit && !disabled;

  return (
    <button
      type="button"
      disabled={disabled}
      className={cn(
        "relative isolate overflow-hidden disabled:cursor-not-allowed disabled:opacity-60",
        className,
      )}
      style={{
        // both set together: whichever one is invalid for the given string
        // (a hex passed to backgroundImage, a gradient() passed to
        // backgroundColor) is simply ignored — callers never have to say
        // which kind of value they're passing.
        backgroundImage: background,
        backgroundColor: background,
        backgroundOrigin,
        border: `${borderWidth}px solid ${active ? (hoverBorderColor ?? borderColor ?? "transparent") : (borderColor ?? "transparent")}`,
        transition: `border-color ${durationMs}ms ease-out`,
      }}
      onPointerEnter={(e) => {
        setLit(true);
        onPointerEnter?.(e);
      }}
      onPointerLeave={(e) => {
        setLit(false);
        onPointerLeave?.(e);
      }}
      onFocus={(e) => {
        setLit(true);
        onFocus?.(e);
      }}
      onBlur={(e) => {
        setLit(false);
        onBlur?.(e);
      }}
      {...props}
    >
      {/*
        z-index: -1, not DOM order — a positioned element with z-index:auto
        always paints ABOVE non-positioned siblings regardless of markup
        order, so without this the overlay drew straight over the label/icon
        on hover (they were still there, just hidden under it). Negative
        z-index is the one thing that reliably sits behind: it paints after
        the button's own background but before any non-positioned content.
        Same fix as TimelineDockParts.tsx's DockBtn hover chip — I just
        forgot to carry it over into this new component.
      */}
      {!disabled && (
        <span
          aria-hidden
          className="pointer-events-none absolute inset-0 transition-opacity ease-out"
          style={{
            backgroundImage: hoverBackground,
            backgroundColor: hoverBackground,
            opacity: active ? 1 : 0,
            transitionDuration: `${durationMs}ms`,
            zIndex: -1,
            ...(pulsate && {
              backgroundSize: "100% 220%",
              animation: `gradient-hover-pulse ${pulsateSeconds}s ease-in-out infinite`,
            }),
          }}
        />
      )}
      {typeof children === "function" ? children(active) : children}
    </button>
  );
}
