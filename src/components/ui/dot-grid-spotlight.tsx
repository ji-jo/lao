import { useEffect, useRef } from "react";
import { cn } from "@/lib/utils";

export type DotGridSpotlightProps = {
  /** The base color of the default/inactive dots. */
  dotColor?: string;
  /** The color of dots illuminated by the cursor spotlight. */
  activeDotColor?: string;
  /** Distance (px) between dots. */
  spacing?: number;
  baseRadius?: number;
  activeRadius?: number;
  /** Spotlight radius (px) around the cursor. */
  interactionRadius?: number;
  activeMaxAlpha?: number;
  activeMinAlpha?: number;
  className?: string;
  /** Listen on this element instead of the canvas (for stacked overlays). */
  trackRef?: React.RefObject<HTMLElement | null>;
  /**
   * Controlled spotlight in normalized track coords (0–1).
   * When set, dots stay lit around this point.
   */
  spotlight?: { x: number; y: number } | null;
};

export function DotGridSpotlight({
  dotColor = "rgba(255, 255, 255, 0.05)",
  activeDotColor = "rgba(255, 255, 255, 0.1)",
  spacing = 10,
  baseRadius = 1,
  activeRadius = 2,
  interactionRadius = 128,
  activeMaxAlpha = 1.0,
  activeMinAlpha = 0.5,
  className,
  trackRef,
  spotlight = null,
}: DotGridSpotlightProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const mouse = useRef({ x: -1000, y: -1000, isActive: false });
  const spotlightRef = useRef(spotlight);
  spotlightRef.current = spotlight;
  const drawRef = useRef<() => void>(() => {});

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    let width = 0;
    let height = 0;
    let renderFrameId: number | null = null;

    const draw = () => {
      ctx.clearRect(0, 0, width, height);

      const offsetX = (width % spacing) / 2;
      const offsetY = (height % spacing) / 2;

      const spot = spotlightRef.current;
      const spotX = spot ? spot.x * width : mouse.current.x;
      const spotY = spot ? spot.y * height : mouse.current.y;
      const isActive = spot ? true : mouse.current.isActive;

      for (let x = offsetX; x <= width; x += spacing) {
        for (let y = offsetY; y <= height; y += spacing) {
          const dx = x - spotX;
          const dy = y - spotY;
          const distance = Math.sqrt(dx * dx + dy * dy);

          // Always paint the base dot first — fading active alpha to 0 over a
          // dark pad reads as a concentric hollow ring otherwise.
          ctx.globalAlpha = 1;
          ctx.beginPath();
          ctx.arc(x, y, baseRadius, 0, Math.PI * 2);
          ctx.fillStyle = dotColor;
          ctx.fill();

          if (isActive && distance < interactionRadius) {
            const t = 1 - distance / interactionRadius;
            const factor = t * t * (3 - 2 * t);
            const activeAlpha =
              activeMinAlpha + (activeMaxAlpha - activeMinAlpha) * factor;
            if (activeAlpha > 0.001) {
              const r = baseRadius + (activeRadius - baseRadius) * factor;
              ctx.globalAlpha = activeAlpha;
              ctx.beginPath();
              ctx.arc(x, y, r, 0, Math.PI * 2);
              ctx.fillStyle = activeDotColor;
              ctx.fill();
            }
          }
        }
      }
      ctx.globalAlpha = 1.0;
    };

    drawRef.current = draw;

    const scheduleDraw = () => {
      if (renderFrameId === null) {
        renderFrameId = requestAnimationFrame(() => {
          draw();
          renderFrameId = null;
        });
      }
    };

    const resizeCanvas = () => {
      const parent = canvas.parentElement;
      if (!parent) return;

      const dpr = window.devicePixelRatio || 1;
      width = parent.clientWidth;
      height = parent.clientHeight;

      if (width === 0 || height === 0) return;

      canvas.width = Math.round(width * dpr);
      canvas.height = Math.round(height * dpr);
      canvas.style.width = `${width}px`;
      canvas.style.height = `${height}px`;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

      draw();
      requestAnimationFrame(() => {
        canvas.dataset.ready = "true";
      });
    };

    const setMouseFromEvent = (e: MouseEvent, active: boolean) => {
      const track = trackRef?.current ?? canvas;
      const rect = track.getBoundingClientRect();
      mouse.current = {
        x: e.clientX - rect.left,
        y: e.clientY - rect.top,
        isActive: active,
      };
      scheduleDraw();
    };

    const handleMouseMove = (e: MouseEvent) => setMouseFromEvent(e, true);
    const handleMouseLeave = () => {
      mouse.current.isActive = false;
      scheduleDraw();
    };

    const trackEl = trackRef?.current ?? canvas;
    trackEl.addEventListener("mousemove", handleMouseMove);
    trackEl.addEventListener("mouseleave", handleMouseLeave);

    const resizeObserver = new ResizeObserver(() => resizeCanvas());
    if (canvas.parentElement) resizeObserver.observe(canvas.parentElement);

    resizeCanvas();

    return () => {
      trackEl.removeEventListener("mousemove", handleMouseMove);
      trackEl.removeEventListener("mouseleave", handleMouseLeave);
      resizeObserver.disconnect();
      if (renderFrameId !== null) cancelAnimationFrame(renderFrameId);
    };
  }, [
    spacing,
    baseRadius,
    activeRadius,
    interactionRadius,
    dotColor,
    activeDotColor,
    activeMaxAlpha,
    activeMinAlpha,
    trackRef,
  ]);

  useEffect(() => {
    drawRef.current();
  }, [spotlight?.x, spotlight?.y]);

  return (
    <canvas
      ref={canvasRef}
      data-ready="false"
      aria-hidden
      className={cn(
        "pointer-events-none absolute inset-0 block opacity-0 transition-opacity duration-500 data-[ready=true]:opacity-100",
        className,
      )}
    />
  );
}
