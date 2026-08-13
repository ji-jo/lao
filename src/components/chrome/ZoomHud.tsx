import { useEffect, useRef, useState } from "react";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { PAPER } from "@/components/chrome/paper-tokens";
import { useViewport } from "@/state/viewport";

const HIDE_MS = 900;

/**
 * Center-screen zoom readout — flashes a pill with the current % whenever
 * the canvas zoom changes (wheel, +/−, ZoomDock, reset).
 */
export function ZoomHud() {
  const zoom = useViewport((s) => s.zoom);
  const reduce = useReducedMotion() ?? false;
  const [visible, setVisible] = useState(false);
  const [label, setLabel] = useState(() => Math.round(zoom * 100));
  const primed = useRef(false);
  const hideTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    const pct = Math.round(zoom * 100);
    setLabel(pct);
    // Skip the initial mount so opening the app doesn't flash "100%".
    if (!primed.current) {
      primed.current = true;
      return;
    }
    setVisible(true);
    if (hideTimer.current) clearTimeout(hideTimer.current);
    hideTimer.current = setTimeout(() => setVisible(false), HIDE_MS);
    return () => {
      if (hideTimer.current) clearTimeout(hideTimer.current);
    };
  }, [zoom]);

  return (
    <div className="pointer-events-none fixed inset-0 z-[40] flex items-center justify-center">
      <AnimatePresence>
        {visible && (
          <motion.div
            key="zoom-hud"
            initial={reduce ? false : { opacity: 0, scale: 0.92 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={reduce ? { opacity: 0 } : { opacity: 0, scale: 0.96 }}
            transition={{ duration: reduce ? 0.08 : 0.16, ease: "easeOut" }}
            className="rounded-full px-3.5 py-1.5 antialiased tabular-nums"
            style={{
              backgroundColor: PAPER.surface,
              border: `0.5px solid ${PAPER.borderHairline}`,
              color: PAPER.text,
              fontFamily: PAPER.fontMono,
              fontSize: 13,
              lineHeight: "18px",
              letterSpacing: "0.02em",
              boxShadow: "0 8px 28px rgba(0,0,0,0.45)",
            }}
            aria-live="polite"
          >
            {label}%
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
