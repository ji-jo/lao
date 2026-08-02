import { useEffect, useRef } from 'react';

const CARDS = [
  { text: 'Open it', enterStart: 0, enterDistance: 0.18, rotationZ: -3, zOffset: 0, targetPctX: 22, targetPctY: 34 },
  { text: 'Draw it', enterStart: 0.22, enterDistance: 0.18, rotationZ: 0, zOffset: 24, targetPctX: 50, targetPctY: 50 },
  { text: 'Already moving', enterStart: 0.44, enterDistance: 0.18, rotationZ: 3, zOffset: 48, targetPctX: 73, targetPctY: 67 },
] as const;

const clamp = (value: number, min = 0, max = 1) => Math.min(max, Math.max(min, value));
const smootherstep = (value: number) => {
  const t = clamp(value);
  return t * t * t * (t * (t * 6 - 15) + 10);
};

export default function ThreeScrollCards() {
  const containerRef = useRef<HTMLDivElement>(null);
  const cardRefs = useRef<Array<HTMLElement | null>>([]);

  useEffect(() => {
    let frame = 0;

    const updateCards = () => {
      const container = containerRef.current;
      if (!container) return;

      const viewportHeight = window.visualViewport?.height ?? window.innerHeight;
      const rect = container.getBoundingClientRect();
      const travel = Math.max(1, rect.height - viewportHeight);
      const globalProgress = clamp(-rect.top / travel);

      cardRefs.current.forEach((card, index) => {
        if (!card) return;
        const config = CARDS[index];
        const localProgress = clamp((globalProgress - config.enterStart) / config.enterDistance);
        const entered = smootherstep(localProgress);
        const cardWidth = card.offsetWidth;
        const cardHeight = card.offsetHeight;
        const startX = -cardWidth * 0.72;
        const targetX = window.innerWidth * (config.targetPctX / 100) - cardWidth / 2;
        const targetY = viewportHeight * (config.targetPctY / 100) - cardHeight / 2;
        const x = startX + (targetX - startX) * entered;
        const rotationY = 46 * (1 - entered);
        const isVisible = index === 0 || globalProgress >= config.enterStart;

        card.style.opacity = isVisible ? String(index === 0 ? 1 : clamp(localProgress * 5)) : '0';
        card.style.visibility = isVisible ? 'visible' : 'hidden';
        card.style.transform = `translate3d(${x}px, ${targetY}px, ${config.zOffset}px) rotateY(${rotationY}deg) rotateZ(${config.rotationZ}deg)`;
      });
    };

    const scheduleUpdate = () => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(updateCards);
    };

    scheduleUpdate();
    window.addEventListener('scroll', scheduleUpdate, { passive: true });
    window.addEventListener('resize', scheduleUpdate);
    window.visualViewport?.addEventListener('resize', scheduleUpdate);
    return () => {
      cancelAnimationFrame(frame);
      window.removeEventListener('scroll', scheduleUpdate);
      window.removeEventListener('resize', scheduleUpdate);
      window.visualViewport?.removeEventListener('resize', scheduleUpdate);
    };
  }, []);

  return (
    <div ref={containerRef} className="relative z-10 h-full w-full pointer-events-none">
      <div className="sticky top-0 h-[100dvh] w-full overflow-hidden [perspective:1100px]">
        {CARDS.map((card, index) => (
          <article
            key={card.text}
            ref={(node) => { cardRefs.current[index] = node; }}
            className="absolute left-0 top-0 flex h-[clamp(190px,24vw,315px)] w-[clamp(250px,31vw,420px)] items-center justify-center rounded-[18px] border border-white/10 bg-[#303030] px-8 text-center font-display text-[clamp(28px,3vw,42px)] text-[#e8e4dc] shadow-[0_26px_70px_rgba(0,0,0,0.48),inset_0_1px_0_rgba(255,255,255,0.09)] [backface-visibility:hidden] [transform-style:preserve-3d] will-change-transform"
            style={{
              opacity: index === 0 ? 1 : 0,
              visibility: index === 0 ? 'visible' : 'hidden',
              transform: `translate3d(-72%, ${card.targetPctY}vh, ${card.zOffset}px) rotateY(46deg) rotateZ(${card.rotationZ}deg)`,
              zIndex: index + 1,
            }}
          >
            {card.text}
          </article>
        ))}
      </div>
    </div>
  );
}
