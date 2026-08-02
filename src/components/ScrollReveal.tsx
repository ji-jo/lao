"use client";

import { useEffect, useMemo, useRef, type RefObject } from "react";
import { gsap } from "gsap";
import { ScrollTrigger } from "gsap/ScrollTrigger";
import "./ScrollReveal.css";

gsap.registerPlugin(ScrollTrigger);

type ScrollRevealProps = {
  children: string;
  scrollContainerRef?: RefObject<HTMLElement | null>;
  enableBlur?: boolean;
  baseOpacity?: number;
  baseRotation?: number;
  blurStrength?: number;
  containerClassName?: string;
  textClassName?: string;
  rotationEnd?: string;
  wordAnimationEnd?: string;
};

export default function ScrollReveal({
  children,
  scrollContainerRef,
  enableBlur = true,
  baseOpacity = 0.1,
  baseRotation = 3,
  blurStrength = 4,
  containerClassName = "",
  textClassName = "",
  rotationEnd = "bottom bottom",
  wordAnimationEnd = "bottom bottom",
}: ScrollRevealProps) {
  const containerRef = useRef<HTMLHeadingElement>(null);

  const splitText = useMemo(
    () =>
      children.split(/(\s+)/).map((part, index) =>
        /^\s+$/.test(part) ? (
          part
        ) : (
          <span className="scroll-reveal-word" key={`${part}-${index}`}>
            {part}
          </span>
        ),
      ),
    [children],
  );

  useEffect(() => {
    const element = containerRef.current;
    if (!element) return;

    const scroller = scrollContainerRef?.current ?? window;
    const context = gsap.context(() => {
      gsap.fromTo(
        element,
        { transformOrigin: "0% 50%", rotate: baseRotation },
        {
          ease: "none",
          rotate: 0,
          scrollTrigger: {
            trigger: element,
            scroller,
            start: "top bottom",
            end: rotationEnd,
            scrub: true,
          },
        },
      );

      const words = element.querySelectorAll<HTMLElement>(".scroll-reveal-word");
      gsap.fromTo(
        words,
        { opacity: baseOpacity, willChange: "opacity, filter" },
        {
          ease: "none",
          opacity: 1,
          stagger: 0.05,
          scrollTrigger: {
            trigger: element,
            scroller,
            start: "top bottom-=20%",
            end: wordAnimationEnd,
            scrub: true,
          },
        },
      );

      if (enableBlur) {
        gsap.fromTo(
          words,
          { filter: `blur(${blurStrength}px)` },
          {
            ease: "none",
            filter: "blur(0px)",
            stagger: 0.05,
            scrollTrigger: {
              trigger: element,
              scroller,
              start: "top bottom-=20%",
              end: wordAnimationEnd,
              scrub: true,
            },
          },
        );
      }
    }, element);

    requestAnimationFrame(() => ScrollTrigger.refresh());
    return () => context.revert();
  }, [
    baseOpacity,
    baseRotation,
    blurStrength,
    enableBlur,
    rotationEnd,
    scrollContainerRef,
    wordAnimationEnd,
  ]);

  return (
    <h2 ref={containerRef} className={`scroll-reveal ${containerClassName}`}>
      <span className={`scroll-reveal-text ${textClassName}`}>{splitText}</span>
    </h2>
  );
}
