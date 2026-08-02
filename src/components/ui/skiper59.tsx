import React, { useEffect, useRef } from "react";

export type CursorProps = {
  color?: string;
  size?: number;
};

type Point = { x: number; y: number };

export const SkiperCursor: React.FC<CursorProps> = ({
  color = "#ffffff",
  size = 2,
}) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  
  const mouse = useRef<Point | null>(null);
  const history = useRef<Point[]>([]);

  useEffect(() => {
    if (window.matchMedia("(pointer: coarse)").matches) return;

    const handleMouseMove = (e: MouseEvent) => {
      // Prevent wild jumps when entering the window or teleporting
      if (history.current.length > 0) {
        const last = history.current[0];
        const dx = e.clientX - last.x;
        const dy = e.clientY - last.y;
        if (Math.sqrt(dx * dx + dy * dy) > 300) {
          history.current = [];
        }
      }
      
      const newPt = { x: e.clientX, y: e.clientY };
      history.current.unshift(newPt);
      mouse.current = newPt;
    };

    const handleMouseLeave = () => {
       mouse.current = null; 
       history.current = [];
    };
    
    window.addEventListener("mousemove", handleMouseMove, { passive: true });
    document.addEventListener("mouseleave", handleMouseLeave);

    return () => {
      window.removeEventListener("mousemove", handleMouseMove);
      document.removeEventListener("mouseleave", handleMouseLeave);
    };
  }, []);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const updateSize = () => {
      const dpr = window.devicePixelRatio || 1;
      canvas.width = window.innerWidth * dpr;
      canvas.height = window.innerHeight * dpr;
      ctx.scale(dpr, dpr);
      canvas.style.width = `${window.innerWidth}px`;
      canvas.style.height = `${window.innerHeight}px`;
    };
    updateSize();
    window.addEventListener("resize", updateSize);

    let animId: number;

    const tick = () => {
      ctx.clearRect(0, 0, window.innerWidth, window.innerHeight);

      // If mouse is active, constantly add its position to history.
      // This allows the trail to naturally "retract" and catch up when the mouse stops moving.
      if (mouse.current) {
         history.current.unshift({ x: mouse.current.x, y: mouse.current.y });
      }

      // Calculate cumulative distance and strictly cap the tail at 200px
      let dist = 0;
      let trimIndex = history.current.length;
      for (let i = 0; i < history.current.length - 1; i++) {
        const dx = history.current[i].x - history.current[i+1].x;
        const dy = history.current[i].y - history.current[i+1].y;
        dist += Math.sqrt(dx*dx + dy*dy);
        if (dist > 200) {
          trimIndex = i + 1;
          break;
        }
      }
      
      // Cap history at max 120 points to prevent memory leaks when stopped
      history.current = history.current.slice(0, Math.min(trimIndex + 1, 120));

      if (history.current.length > 1) {
        ctx.lineCap = "round";
        ctx.lineJoin = "round";
        ctx.strokeStyle = color;
        ctx.globalAlpha = 1; // Prevent overlapping circles at joints

        // 1. Draw the immediate segment to the mouse head with zero lag
        const pt0 = history.current[0];
        const pt1 = history.current[1];
        const xc0 = (pt0.x + pt1.x) / 2;
        const yc0 = (pt0.y + pt1.y) / 2;
        
        ctx.beginPath();
        ctx.moveTo(pt0.x, pt0.y);
        ctx.lineTo(xc0, yc0);
        ctx.lineWidth = size;
        ctx.stroke();

        // 2. Draw perfectly smoothed quadratic bezier curves for the rest of the tail
        for (let i = 1; i < history.current.length - 1; i++) {
          const pt = history.current[i];
          const nextPt = history.current[i + 1];
          const prevPt = history.current[i - 1];
          
          const prevXc = (prevPt.x + pt.x) / 2;
          const prevYc = (prevPt.y + pt.y) / 2;
          const xc = (pt.x + nextPt.x) / 2;
          const yc = (pt.y + nextPt.y) / 2;
          
          // Taper the tail to create a smooth fade-out effect over the 200px
          const progress = i / history.current.length; 
          const thickness = size * Math.pow(1 - progress, 1.2); 
          
          ctx.beginPath();
          ctx.moveTo(prevXc, prevYc);
          ctx.quadraticCurveTo(pt.x, pt.y, xc, yc);
          ctx.lineWidth = thickness;
          ctx.stroke();
        }
      }

      animId = requestAnimationFrame(tick);
    };

    animId = requestAnimationFrame(tick);
    return () => {
      cancelAnimationFrame(animId);
      window.removeEventListener("resize", updateSize);
    };
  }, [size, color]);

  return (
    <canvas
      ref={canvasRef}
      className="pointer-events-none fixed top-0 left-0 z-[100]"
      style={{ 
        mixBlendMode: "screen",
        opacity: 0.65 
      }}
    />
  );
};

export default SkiperCursor;
