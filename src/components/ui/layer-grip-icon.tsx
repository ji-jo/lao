import { forwardRef } from "react";
import type { AnimatedIconHandle, AnimatedIconProps } from "./types";

/**
 * Paper "⋮⋮" 6-dot grip (assets/icons/⋮⋮.svg) — 2 columns × 3 rows,
 * used to reorder layer rows. Natural size 7×12; `size` scales the height,
 * width follows the source aspect ratio.
 */
const LayerGripIcon = forwardRef<AnimatedIconHandle, AnimatedIconProps>(
  ({ size = 14, className = "" }, ref) => {
    void ref;
    const height = typeof size === "number" ? size : Number(size) || 14;
    const width = (height * 7) / 12;
    return (
      <svg
        width={width}
        height={height}
        viewBox="0 0 7 12"
        xmlns="http://www.w3.org/2000/svg"
        className={className}
        aria-hidden
      >
        <g transform="translate(1 2)">
          <path d="M1 6C1.552 6 2 6.448 2 7C2 7.552 1.552 8 1 8C0.448 8 0 7.552 0 7C0 6.448 0.448 6 1 6Z" fill="#D9D9D9" fillOpacity="0.2" />
          <path d="M4 6C4.552 6 5 6.448 5 7C5 7.552 4.552 8 4 8C3.448 8 3 7.552 3 7C3 6.448 3.448 6 4 6Z" fill="#D9D9D9" fillOpacity="0.2" />
          <path d="M1 3C1.552 3 2 3.448 2 4C2 4.552 1.552 5 1 5C0.448 5 0 4.552 0 4C0 3.448 0.448 3 1 3Z" fill="#D9D9D9" fillOpacity="0.2" />
          <path d="M4 3C4.552 3 5 3.448 5 4C5 4.552 4.552 5 4 5C3.448 5 3 4.552 3 4C3 3.448 3.448 3 4 3Z" fill="#D9D9D9" fillOpacity="0.2" />
          <path d="M1 0C1.552 0 2 0.448 2 1C2 1.552 1.552 2 1 2C0.448 2 0 1.552 0 1C0 0.448 0.448 0 1 0Z" fill="#D9D9D9" fillOpacity="0.2" />
          <path d="M4 0C4.552 0 5 0.448 5 1C5 1.552 4.552 2 4 2C3.448 2 3 1.552 3 1C3 0.448 3.448 0 4 0Z" fill="#D9D9D9" fillOpacity="0.2" />
        </g>
      </svg>
    );
  },
);

LayerGripIcon.displayName = "LayerGripIcon";
export default LayerGripIcon;
