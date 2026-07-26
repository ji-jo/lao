import type { ReactNode, UIEvent } from "react";
import { ScrollArea } from "@/components/ui/scroll-area";
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
 * App scroll surface — nano ScrollArea with a compatible CustomScroll API.
 * Parent must have a height limit; pass heightRelativeToParent="100%" or flex.
 */
export function CustomScroll({
  className,
  heightRelativeToParent,
  flex,
  alwaysVisible = false,
  children,
}: CustomScrollProps) {
  return (
    <ScrollArea
      alwaysShowScrollbar={alwaysVisible}
      className={cn(
        flex === "1" && "min-h-0 flex-1",
        heightRelativeToParent === "100%" && "h-full",
        className,
      )}
    >
      {children}
    </ScrollArea>
  );
}
