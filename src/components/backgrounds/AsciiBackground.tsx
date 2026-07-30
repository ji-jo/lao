import { useEffect, useRef, useState } from 'react';

export default function AsciiBackground() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    
    const ramp = ["·", ":", "-", "=", "+", "*", "#", "%"];
    const cell = 11;
    let cols = 0, rows = 0;
    
    const resize = () => {
      const r = canvas.getBoundingClientRect();
      canvas.width = Math.max(2, Math.round(r.width));
      canvas.height = Math.max(2, Math.round(r.height));
      cols = Math.ceil(canvas.width / cell);
      rows = Math.ceil(canvas.height / cell);
    };
    resize();

    let _at = 0;
    const draw = (t: number) => {
      _at = t;
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      ctx.font = "11px 'Departure Mono', ui-monospace, monospace";
      ctx.fillStyle = "#7C8AA3";
      ctx.textBaseline = "top";
      for (let y = 0; y < rows; y++) {
        for (let x = 0; x < cols; x++) {
          const n = 0.5 + 0.3 * Math.sin(x * 0.19 + t * 0.3) + 0.3 * Math.sin(y * 0.23 - t * 0.21) + 0.2 * Math.sin((x + y) * 0.11 + t * 0.13);
          const idx = Math.max(0, Math.min(ramp.length - 1, Math.floor(n * ramp.length)));
          ctx.fillText(ramp[idx], x * cell, y * cell);
        }
      }
    };

    window.addEventListener("resize", () => { resize(); draw(_at); }, { passive: true });
    draw(0);

    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (reduced) return;
    
    let paused = false;
    let offscreen = false;
    if ("IntersectionObserver" in window) {
      new IntersectionObserver(e => { 
        offscreen = !e[0].isIntersecting; 
        paused = offscreen || document.hidden; 
      }, { threshold: 0 }).observe(canvas);
    }
    
    const onVis = () => { paused = offscreen || document.hidden; };
    document.addEventListener("visibilitychange", onVis);
    
    let last = 0, t = 0;
    let dead = false;
    const tick = (now: number) => {
      if (dead) return;
      requestAnimationFrame(tick);
      if (paused || now - last < 80) return;
      last = now; t += 0.09; draw(t);
    };
    requestAnimationFrame(tick);
    
    return () => {
      dead = true;
      document.removeEventListener("visibilitychange", onVis);
      window.removeEventListener("resize", resize);
    };
  }, []);

  return (
    <canvas 
      ref={canvasRef} 
      className="absolute inset-0 w-full h-full opacity/12 pointer-events-none" 
      aria-hidden="true" 
    />
  );
}
