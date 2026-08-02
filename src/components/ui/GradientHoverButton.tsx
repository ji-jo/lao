import { useState, type ButtonHTMLAttributes, type ReactNode } from "react";
import { cn } from "../../lib/utils";

export interface GradientHoverButtonProps
  extends Omit<ButtonHTMLAttributes<HTMLButtonElement>, "className" | "style" | "children"> {
  background: string;
  hoverBackground: string;
  borderColor?: string;
  hoverBorderColor?: string;
  borderWidth?: number;
  durationMs?: number;
  backgroundOrigin?: string;
  pulsate?: boolean;
  pulsateSeconds?: number;
  className?: string;
  children: ReactNode | ((hovered: boolean) => ReactNode);
  as?: any;
  href?: string;
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
  as: Component = "button",
  ...props
}: GradientHoverButtonProps) {
  const [lit, setLit] = useState(false);
  const active = lit && !disabled;

  if (props.href) {
    Component = "a";
  }

  return (
    <Component
      disabled={Component === "button" ? disabled : undefined}
      className={cn(
        "relative isolate overflow-hidden disabled:cursor-not-allowed disabled:opacity-60",
        className,
      )}
      style={{
        backgroundImage: background,
        backgroundColor: background,
        backgroundOrigin,
        border: `${borderWidth}px solid ${active ? (hoverBorderColor ?? borderColor ?? "transparent") : (borderColor ?? "transparent")}`,
        transition: `border-color ${durationMs}ms ease-out`,
      }}
      onPointerEnter={(e: React.PointerEvent<HTMLButtonElement>) => {
        setLit(true);
        onPointerEnter?.(e);
      }}
      onPointerLeave={(e: React.PointerEvent<HTMLButtonElement>) => {
        setLit(false);
        onPointerLeave?.(e);
      }}
      {...props}
    >
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
            ...(pulsate && active && {
              backgroundSize: "100% 220%",
              animation: `gradient-hover-pulse ${pulsateSeconds}s ease-in-out infinite`,
            }),
          }}
        />
      )}
      {typeof children === "function" ? children(active) : children}
    </Component>
  );
}
