import type { ReactNode, UIEvent } from "react";
import { CustomScroll as ReactCustomScroll } from "react-custom-scroll";
import { cn } from "@/lib/utils";

export interface CustomScrollProps {
  children?: ReactNode;
  allowOuterScroll?: boolean;
  heightRelativeToParent?: string;
  onScroll?: (event: UIEvent) => void;
  addScrolledClass?: boolean;
  freezePosition?: boolean;
  handleClass?: string;
  minScrollHandleHeight?: number;
  flex?: string;
  rtl?: boolean;
  scrollTo?: number;
  keepAtBottom?: boolean;
  alwaysVisible?: boolean;
  className?: string;
}

/**
 * Themed wrapper around react-custom-scroll.
 * Parent must have a height limit; pass heightRelativeToParent="100%" or flex.
 * Do not put overflow on the children root.
 */
export function CustomScroll({
  className,
  handleClass = "rcs-inner-handle lao-scroll-handle",
  alwaysVisible = true,
  ...props
}: CustomScrollProps) {
  return (
    <ReactCustomScroll
      {...props}
      alwaysVisible={alwaysVisible}
      handleClass={handleClass}
      className={cn("lao-custom-scroll", className)}
    />
  );
}
