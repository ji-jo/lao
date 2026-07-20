import { forwardRef } from "react";
import type { AnimatedIconHandle, AnimatedIconProps } from "./types";
import gripRow from "@/assets/figma/layer-grip.svg";

/**
 * Figma 14:113 — 2×3 grip for layer reorder (three rows of the 2-dot asset).
 */
const LayerGripIcon = forwardRef<AnimatedIconHandle, AnimatedIconProps>(
  ({ size = 14, className = "" }, ref) => {
    void ref;
    const px = typeof size === "number" ? size : Number(size) || 14;
    const rowH = Math.max(2, Math.round(px * 0.28));
    return (
      <span
        className={`inline-flex flex-col items-center justify-center gap-px opacity-90 ${className}`}
        style={{ width: px, height: px }}
        aria-hidden
      >
        {[0, 1, 2].map((i) => (
          <img
            key={i}
            src={gripRow}
            alt=""
            className="block w-full"
            style={{ height: rowH }}
          />
        ))}
      </span>
    );
  },
);

LayerGripIcon.displayName = "LayerGripIcon";
export default LayerGripIcon;
