import { useEffect, useRef, useState } from 'react';
import { Dithering } from '@paper-design/shaders-react';

export default function HeroShader() {
  const [active, setActive] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    if (reduced) return; // Stays inactive (frozen on first frame if Dithering supports it)
    
    setActive(true);

    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((e) => {
          setActive(e.isIntersecting && !document.hidden);
        });
      },
      { threshold: 0 }
    );

    if (ref.current) observer.observe(ref.current);

    const onVis = () => {
      if (ref.current) {
        const rect = ref.current.getBoundingClientRect();
        const inView = rect.bottom > 0 && rect.top < window.innerHeight;
        setActive(!document.hidden && inView);
      }
    };
    document.addEventListener('visibilitychange', onVis);

    return () => {
      observer.disconnect();
      document.removeEventListener('visibilitychange', onVis);
    };
  }, []);

  return (
    <div ref={ref} className="absolute inset-0 w-full h-full z-0 overflow-hidden" aria-hidden="true">
      <Dithering
        colorBack="#0B0F16"
        colorFront="#1A2632"
        speed={active ? 0.15 : 0}
        scale={2.0}
        fps={24}
        quantization={3}
        className="w-full h-full object-cover"
        style={{ imageRendering: 'pixelated' }}
      />
    </div>
  );
}
