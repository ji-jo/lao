/**
 * LAO Waitlist — Reveal & Transition System
 * 
 * Three primitives:
 * - svg[data-draw]: stroke-dashoffset line drawing
 * - [data-wipe]: clip-path left-to-right unmask
 * - [data-brighten]: color transition from --color-text-low to --color-text-hi
 * 
 * One state flag: data-revealed="1"
 */

function isReducedMotion(): boolean {
  return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
}

export function setupDrawing(): void {
  const reduced = isReducedMotion();
  document.querySelectorAll<SVGElement>('svg[data-draw]').forEach((svg) => {
    if (svg.dataset.drawInit) return;
    svg.dataset.drawInit = '1';

    const paths = Array.from(svg.querySelectorAll<SVGPathElement>('path'));
    paths.forEach((p, i) => {
      const len = typeof p.getTotalLength === 'function' ? p.getTotalLength() : 600;
      p.style.strokeDasharray = `${len} ${len}`;
      p.style.strokeDashoffset = reduced ? '0' : String(len);
      p.style.transition = `stroke-dashoffset 1100ms cubic-bezier(0.22,1,0.36,1) ${i * 120}ms`;
    });

    if (reduced) {
      svg.dataset.revealed = '1';
    }
  });

  revealPass();
}

export function revealPass(): void {
  const vh = window.innerHeight || 800;
  const elements = document.querySelectorAll<HTMLElement>('svg[data-draw], [data-wipe], [data-brighten]');

  elements.forEach((el) => {
    if (el.dataset.revealed) return;
    if (el.getBoundingClientRect().top >= vh * 0.9) return;

    el.dataset.revealed = '1';

    if (el.tagName.toLowerCase() === 'svg') {
      el.querySelectorAll<SVGPathElement>('path').forEach((p) => {
        p.style.strokeDashoffset = '0';
      });
    }
  });
}

/**
 * Form checkmark animation helper — double rAF required for transition to trigger correctly
 */
export function animateCheck(svg: SVGElement | null): void {
  if (!svg) return;
  const p = svg.querySelector<SVGPathElement>('path');
  if (!p) return;

  const len = typeof p.getTotalLength === 'function' ? p.getTotalLength() : 100;
  p.style.strokeDasharray = `${len} ${len}`;
  p.style.strokeDashoffset = String(len);
  p.style.transition = 'stroke-dashoffset 620ms cubic-bezier(0.22,1,0.36,1)';

  requestAnimationFrame(() => {
    requestAnimationFrame(() => {
      p.style.strokeDashoffset = '0';
    });
  });
}

let ticking = false;
function onScroll(): void {
  if (!ticking) {
    requestAnimationFrame(() => {
      revealPass();
      ticking = false;
    });
    ticking = true;
  }
}

export function initRevealSystem(): void {
  setupDrawing();

  window.removeEventListener('scroll', onScroll);
  window.addEventListener('scroll', onScroll, { passive: true });
  window.addEventListener('resize', onScroll, { passive: true });
}

// Global window attachment for convenience
if (typeof window !== 'undefined') {
  (window as unknown as Record<string, unknown>).LAO_Reveal = {
    setupDrawing,
    revealPass,
    animateCheck,
    initRevealSystem,
  };

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initRevealSystem);
  } else {
    initRevealSystem();
  }
}
