import { forwardRef, useImperativeHandle, useCallback } from "react";
import type { AnimatedIconHandle, AnimatedIconProps } from "./types";
import { motion, useAnimate } from "motion/react";

/**
 * Paper "more" layer-menu glyph (A0H-0) — a triangular 3-dot cluster, not a
 * horizontal ellipsis. Natural size 4.5×4.5, fill #DADADA.
 */
const DotsHorizontalIcon = forwardRef<AnimatedIconHandle, AnimatedIconProps>(
  ({ size = 12, color = "#DADADA", className = "" }, ref) => {
    const [scope, animate] = useAnimate();

    const start = useCallback(async () => {
      animate(".dot-top", { scale: [1, 1.25, 1] }, { duration: 0.3, ease: "easeOut" });
      animate(".dot-left", { scale: [1, 1.25, 1] }, { duration: 0.3, delay: 0.08, ease: "easeOut" });
      animate(".dot-right", { scale: [1, 1.25, 1] }, { duration: 0.3, delay: 0.16, ease: "easeOut" });
    }, [animate]);

    const stop = useCallback(() => {
      animate(".dot-top, .dot-left, .dot-right", { scale: 1 }, { duration: 0.2, ease: "easeInOut" });
    }, [animate]);

    useImperativeHandle(ref, () => ({
      startAnimation: start,
      stopAnimation: stop,
    }));

    return (
      <motion.svg
        ref={scope}
        xmlns="http://www.w3.org/2000/svg"
        width={size}
        height={size}
        viewBox="0 0 4.5 4.5"
        className={`cursor-pointer ${className}`}
        onHoverStart={start}
        onHoverEnd={stop}
      >
        <motion.path
          d="M2.25 1.692C2.498 1.692 2.7 1.49 2.7 1.242 2.7 0.993 2.498 0.792 2.25 0.792 2.002 0.792 1.8 0.993 1.8 1.242 1.8 1.49 2.002 1.692 2.25 1.692Z"
          fill={color}
          className="dot-top"
          style={{ transformOrigin: "50% 50%" }}
        />
        <motion.path
          d="M1.164 3.709C1.412 3.709 1.614 3.507 1.614 3.258 1.614 3.01 1.412 2.808 1.164 2.808 0.916 2.808 0.714 3.01 0.714 3.258 0.714 3.507 0.914 3.709 1.164 3.709Z"
          fill={color}
          className="dot-left"
          style={{ transformOrigin: "50% 50%" }}
        />
        <motion.path
          d="M3.336 3.709C3.584 3.709 3.786 3.507 3.786 3.258 3.786 3.01 3.584 2.808 3.336 2.808 3.088 2.808 2.886 3.01 2.886 3.258 2.886 3.507 3.088 3.709 3.336 3.709Z"
          fill={color}
          className="dot-right"
          style={{ transformOrigin: "50% 50%" }}
        />
      </motion.svg>
    );
  },
);

DotsHorizontalIcon.displayName = "DotsHorizontalIcon";
export default DotsHorizontalIcon;
