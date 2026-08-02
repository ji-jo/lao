"use client";
import React, { useEffect, useLayoutEffect, useRef, useState } from "react";
import { MotionValue, motion, useMotionValue, useScroll, useTransform } from "framer-motion";
import { cn } from "@/lib/utils";
import { SunDimIcon } from "@phosphor-icons/react/dist/csr/SunDim";
import { SunIcon } from "@phosphor-icons/react/dist/csr/Sun";
import { SquaresFourIcon } from "@phosphor-icons/react/dist/csr/SquaresFour";
import { MagnifyingGlassIcon } from "@phosphor-icons/react/dist/csr/MagnifyingGlass";
import { MicrophoneIcon } from "@phosphor-icons/react/dist/csr/Microphone";
import { MoonIcon } from "@phosphor-icons/react/dist/csr/Moon";
import { SkipBackIcon } from "@phosphor-icons/react/dist/csr/SkipBack";
import { FastForwardIcon } from "@phosphor-icons/react/dist/csr/FastForward";
import { SkipForwardIcon } from "@phosphor-icons/react/dist/csr/SkipForward";
import { SpeakerSimpleNoneIcon } from "@phosphor-icons/react/dist/csr/SpeakerSimpleNone";
import { SpeakerSimpleLowIcon } from "@phosphor-icons/react/dist/csr/SpeakerSimpleLow";
import { SpeakerSimpleHighIcon } from "@phosphor-icons/react/dist/csr/SpeakerSimpleHigh";
import { GlobeIcon } from "@phosphor-icons/react/dist/csr/Globe";
import { CaretUpIcon } from "@phosphor-icons/react/dist/csr/CaretUp";
import { CaretDownIcon } from "@phosphor-icons/react/dist/csr/CaretDown";
import { CaretLeftIcon } from "@phosphor-icons/react/dist/csr/CaretLeft";
import { CaretRightIcon } from "@phosphor-icons/react/dist/csr/CaretRight";
import { CommandIcon } from "@phosphor-icons/react/dist/csr/Command";

export const MacbookScroll = ({
  src,
  showGradient,
  title,
  badge,
}: {
  src?: string;
  showGradient?: boolean;
  title?: string | React.ReactNode;
  badge?: React.ReactNode;
}) => {
  const ref = useRef<HTMLDivElement>(null);
  const { scrollYProgress } = useScroll({
    target: ref,
    offset: ["start start", "end start"],
  });

  const [isMobile, setIsMobile] = useState(false);

  useEffect(() => {
    const updateViewportMode = () => setIsMobile(window.innerWidth < 768);
    updateViewportMode();
    window.addEventListener("resize", updateViewportMode);
    return () => window.removeEventListener("resize", updateViewportMode);
  }, []);

  // Decode the screenshot before the sticky animation reaches the lid. This
  // prevents the image from flashing in after the transform has already begun.
  useEffect(() => {
    if (!src) return;
    const preload = new window.Image();
    preload.decoding = "sync";
    preload.src = src;
  }, [src]);

  // The laptop scrolls away after opening while the screenshot remains centred
  // for 100vh, releasing at the following section boundary.
  const OPEN_VH = 60;
  const HOLD_VH = 100;
  const TOTAL_VH = 100 + OPEN_VH + HOLD_VH; // sticky frame is one screen tall
  const OPEN_END = OPEN_VH / TOTAL_VH; // ~0.231
  const STICKY_END = (OPEN_VH + HOLD_VH) / TOTAL_VH;

  // NOTE: these are the lid's *open* geometry, not a size control. The lid uses
  // transformOrigin "top", so raising scaleY stretches the screen downward from
  // the hinge and spills it over the keyboard rather than enlarging the laptop.
  // 1.2 is the correct fully-open value — to resize the whole thing, change the
  // wrapper's md:scale-[…] below instead.
  const scaleX = useTransform(
    scrollYProgress,
    [0, OPEN_END],
    [1.2, isMobile ? 1 : 1.2]
  );
  const scaleY = useTransform(
    scrollYProgress,
    [0, OPEN_END],
    [0.6, isMobile ? 1 : 1.2]
  );
  // The display grows beyond the laptop only as the lid finishes opening.
  const screenZoom = useTransform(scrollYProgress, [0, OPEN_END], [1, isMobile ? 1.05 : 1.25]);
  // --- Viewport-relative screenshot centring ------------------------------
  // Keep the chassis where it belongs. Only the screenshot lifts out of the
  // lid, scales up, and locks to the browser centre during the sticky hold.
  const screenshotRef = useRef<HTMLDivElement>(null);
  const screenshotAnchorRef = useRef<HTMLDivElement>(null);
  const screenshotLift = useMotionValue(0);
  const chassisScrollY = useMotionValue(0);
  const screenshotCompensation = useMotionValue(0);
  const screenshotY = useTransform(
    [screenshotLift, screenshotCompensation],
    ([lift, compensation]) => Number(lift) + Number(compensation),
  );

  // Use one travel value for both layers: the laptop moves upward while an
  // equal inverse movement holds the screenshot at the viewport centre.
  useLayoutEffect(() => {
    const updateSeparatedTravel = () => {
      const progress = scrollYProgress.get();
      const holdRange = STICKY_END - OPEN_END;
      const holdProgress = Math.min(1, Math.max(0, (progress - OPEN_END) / holdRange));
      const viewportHeight = window.visualViewport?.height ?? window.innerHeight;
      const wrapperScale = window.innerWidth >= 768 ? 1.4 : window.innerWidth >= 640 ? 0.75 : 0.5;
      const travel = holdProgress * (HOLD_VH / 100) * viewportHeight;

      chassisScrollY.set(-travel);
      screenshotCompensation.set(travel / wrapperScale);
    };

    updateSeparatedTravel();
    window.addEventListener("resize", updateSeparatedTravel);
    window.visualViewport?.addEventListener("resize", updateSeparatedTravel);
    const unsubscribe = scrollYProgress.on("change", updateSeparatedTravel);
    return () => {
      window.removeEventListener("resize", updateSeparatedTravel);
      window.visualViewport?.removeEventListener("resize", updateSeparatedTravel);
      unsubscribe();
    };
  }, [OPEN_END, STICKY_END, chassisScrollY, screenshotCompensation, scrollYProgress]);

  useLayoutEffect(() => {
    let animationFrame = 0;

    const recentre = () => {
      const currentProgress = scrollYProgress.get();
      if (currentProgress > OPEN_END + 0.001) return;

      const screenshot = screenshotRef.current;
      const anchor = screenshotAnchorRef.current;
      if (!screenshot || !anchor) return;

      const box = screenshot.getBoundingClientRect();
      const anchorBox = anchor.getBoundingClientRect();
      const viewportHeight = window.visualViewport?.height ?? window.innerHeight;
      const openingProgress = Math.min(1, Math.max(0, currentProgress / OPEN_END));
      // The screenshot sits inside the responsive chassis wrapper. Convert the
      // viewport-space distance back into that wrapper's local coordinate
      // system before applying it.
      const wrapperScale = window.innerWidth >= 768 ? 1.4 : window.innerWidth >= 640 ? 0.75 : 0.5;
      // Read vertical position from the stable lid anchor. Measuring the
      // translated screenshot itself fed each correction back into the next
      // frame and caused visible shaking while scrolling.
      const naturalCentre = anchorBox.top + box.height / 2;
      const requiredLift = viewportHeight / 2 - naturalCentre;

      const nextLift = (requiredLift * openingProgress) / wrapperScale;
      // Ignore sub-pixel feedback from the transformed bounding box. Those
      // tiny corrections are visible as a shimmer when Lenis and Framer Motion
      // update on adjacent animation frames.
      if (Math.abs(nextLift - screenshotLift.get()) > 0.25) {
        screenshotLift.set(nextLift);
      }
    };

    const scheduleRecentre = () => {
      cancelAnimationFrame(animationFrame);
      animationFrame = requestAnimationFrame(recentre);
    };

    recentre();
    window.addEventListener("resize", scheduleRecentre);
    window.visualViewport?.addEventListener("resize", scheduleRecentre);
    const unsubscribe = scrollYProgress.on("change", scheduleRecentre);
    return () => {
      cancelAnimationFrame(animationFrame);
      window.removeEventListener("resize", scheduleRecentre);
      window.visualViewport?.removeEventListener("resize", scheduleRecentre);
      unsubscribe();
    };
  }, [OPEN_END, screenshotLift, scrollYProgress]);
  // Same shape as the original [0.1, 0.12, 0.3], rescaled onto the new OPEN_END.
  const rotate = useTransform(
    scrollYProgress,
    [OPEN_END * (1 / 3), OPEN_END * 0.4, OPEN_END],
    [-28, -28, 0]
  );
  const textTransform = useTransform(scrollYProgress, [0, OPEN_END], [0, 100]);
  const textOpacity = useTransform(scrollYProgress, [0, OPEN_END * (2 / 3)], [1, 0]);
  return (
    <div ref={ref} className="relative w-full shrink-0" style={{ minHeight: `${TOTAL_VH}vh` }}>
      {/* Pinned viewport-height frame: keeps the laptop parked dead-centre while
          the lid opens, instead of the old padding-positioned block that drifted
          up the screen as you scrolled. */}
      <div className="sticky top-0 flex h-[100dvh] w-full flex-col items-center justify-center [perspective:800px]">
        {/* Keep the laptop/screen fully opaque through the sticky hold and
            release. A post-hold opacity tween made the screen blink away and
            then reappear when the sticky frame returned to normal flow. */}
        <motion.div
          initial={false}
          style={{ translateY: chassisScrollY }}
          className="flex flex-col items-center"
        >
          {/* Lift the chassis with the viewport, while the opened display is
              independently measured back to the viewport centre. */}
          <div className="flex -translate-y-[12dvh] scale-[0.5] flex-col items-center sm:scale-75 md:scale-[1.4]">
          <motion.h2
            style={{ translateY: textTransform, opacity: textOpacity }}
            className="mb-20 text-center text-3xl font-bold text-neutral-800 dark:text-white"
          >
            {title}
          </motion.h2>
          <Lid
            src={src}
            scaleX={scaleX}
            scaleY={scaleY}
            rotate={rotate}
            screenZoom={screenZoom}
            screenshotLift={screenshotY}
            screenshotRef={screenshotRef}
            screenshotAnchorRef={screenshotAnchorRef}
          />
          {/* Base */}
          <div className="relative -z-10 h-[22rem] w-[32rem] overflow-hidden rounded-2xl bg-gray-200 dark:bg-[#272729]">
            <div className="relative h-10 w-full">
              <div className="absolute inset-x-0 mx-auto h-4 w-[80%] bg-[#050505]" />
            </div>
            <div className="relative flex">
              <div className="mx-auto h-full w-[10%] overflow-hidden"><SpeakerGrid /></div>
              <div className="mx-auto h-full w-[80%]"><Keypad /></div>
              <div className="mx-auto h-full w-[10%] overflow-hidden"><SpeakerGrid /></div>
            </div>
            <Trackpad />
            <div className="absolute inset-x-0 bottom-0 mx-auto h-2 w-20 rounded-tl-3xl rounded-tr-3xl bg-gradient-to-t from-[#272729] to-[#050505]" />
            {showGradient && (
              <div className="absolute inset-x-0 bottom-0 z-50 h-40 w-full bg-gradient-to-t from-white via-white to-transparent dark:from-black dark:via-black" />
            )}
            {badge && <div className="absolute bottom-4 left-4">{badge}</div>}
          </div>
          </div>
        </motion.div>
      </div>
    </div>
  );
};

export const Lid = ({
  scaleX, scaleY, rotate, screenZoom, screenshotLift, screenshotRef, screenshotAnchorRef, src,
}: {
  scaleX: MotionValue<number>;
  scaleY: MotionValue<number>;
  rotate: MotionValue<number>;
  screenZoom: MotionValue<number>;
  screenshotLift: MotionValue<number>;
  screenshotRef: React.RefObject<HTMLDivElement | null>;
  screenshotAnchorRef: React.RefObject<HTMLDivElement | null>;
  src?: string;
}) => {
  return (
    <div ref={screenshotAnchorRef} className="relative isolate [perspective:800px]">
      <div
        style={{
          transform: "perspective(800px) rotateX(-25deg) translateZ(0px)",
          transformOrigin: "bottom",
          transformStyle: "preserve-3d",
        }}
        className="relative h-[12rem] w-[32rem] rounded-2xl bg-[#010101] p-2"
      >
        <div
          style={{ boxShadow: "0px 2px 0px 2px #171717 inset" }}
          className="absolute inset-0 flex items-center justify-center rounded-lg bg-[#010101]"
        >
          <span className="text-white"><AceternityLogo /></span>
        </div>
      </div>
      <motion.div
        style={{
          scaleX, scaleY, scale: screenZoom, y: screenshotLift, rotateX: rotate,
          transformStyle: "preserve-3d", transformOrigin: "top",
          willChange: "transform",
        }}
        ref={screenshotRef}
        className="absolute inset-0 z-10 h-96 w-[32rem] rounded-2xl bg-[#010101] p-2 overflow-visible"
      >
        <img
          src={src as string}
          alt="LAO app screenshot"
          loading="eager"
          decoding="sync"
          fetchPriority="high"
          className="absolute inset-0 h-full w-full rounded-lg object-cover object-left-top"
        />
      </motion.div>
    </div>
  );
};

export const Trackpad = () => (
  <div className="mx-auto my-1 h-32 w-[40%] rounded-xl" style={{ boxShadow: "0px 0px 1px 1px #00000020 inset" }} />
);

export const KBtn = ({
  className, children, childrenClassName, backlit = true,
}: {
  className?: string;
  children?: React.ReactNode;
  childrenClassName?: string;
  backlit?: boolean;
}) => (
  <div className={cn("[transform:translateZ(0)] rounded-[4px] p-[0.5px] [will-change:transform]", backlit && "bg-white/[0.2] shadow-xl shadow-white")}>
    <div
      className={cn("flex h-6 w-6 items-center justify-center rounded-[3.5px] bg-[#0A090D]", className)}
      style={{ boxShadow: "0px -0.5px 2px 0 #0D0D0F inset, -0.5px 0px 2px 0 #0D0D0F inset" }}
    >
      <div className={cn("flex w-full flex-col items-center justify-center text-[5px] text-neutral-200", childrenClassName, backlit && "text-white")}>
        {children}
      </div>
    </div>
  </div>
);

export const SpeakerGrid = () => (
  <div className="mt-2 flex h-40 gap-[2px] px-[0.5px]" style={{ backgroundImage: "radial-gradient(circle, #08080A 0.5px, transparent 0.5px)", backgroundSize: "3px 3px" }} />
);

export const OptionKey = ({ className }: { className: string }) => (
  <svg fill="none" version="1.1" id="icon" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 32" className={className}>
    <rect stroke="currentColor" strokeWidth={2} x="18" y="5" width="10" height="2" />
    <polygon stroke="currentColor" strokeWidth={2} points="10.6,5 4,5 4,7 9.4,7 18.4,27 28,27 28,25 19.6,25 " />
    <rect id="_Transparent_Rectangle_" className="st0" width="32" height="32" stroke="none" />
  </svg>
);

const AceternityLogo = () => (
  <svg width="66" height="65" viewBox="0 0 66 65" fill="none" xmlns="http://www.w3.org/2000/svg" className="h-3 w-3 text-white">
    <path d="M8 8.05571C8 8.05571 54.9009 18.1782 57.8687 30.062C60.8365 41.9458 9.05432 57.4696 9.05432 57.4696" stroke="currentColor" strokeWidth="15" strokeMiterlimit="3.86874" strokeLinecap="round" />
  </svg>
);

export const Keypad = () => (
  <div className="mx-1 h-full [transform:translateZ(0)] rounded-md bg-[#050505] p-1 [will-change:transform]">
    {/* Row 1 */}
    <div className="mb-[2px] flex w-full shrink-0 gap-[2px]">
      <KBtn className="w-10 items-end justify-start pb-[2px] pl-[4px]" childrenClassName="items-start">esc</KBtn>
      <KBtn><SunDimIcon className="h-[6px] w-[6px]" /><span className="mt-1 inline-block">F1</span></KBtn>
      <KBtn><SunIcon className="h-[6px] w-[6px]" /><span className="mt-1 inline-block">F2</span></KBtn>
      <KBtn><SquaresFourIcon className="h-[6px] w-[6px]" /><span className="mt-1 inline-block">F3</span></KBtn>
      <KBtn><MagnifyingGlassIcon className="h-[6px] w-[6px]" /><span className="mt-1 inline-block">F4</span></KBtn>
      <KBtn><MicrophoneIcon className="h-[6px] w-[6px]" /><span className="mt-1 inline-block">F5</span></KBtn>
      <KBtn><MoonIcon className="h-[6px] w-[6px]" /><span className="mt-1 inline-block">F6</span></KBtn>
      <KBtn><SkipBackIcon className="h-[6px] w-[6px]" /><span className="mt-1 inline-block">F7</span></KBtn>
      <KBtn><FastForwardIcon className="h-[6px] w-[6px]" /><span className="mt-1 inline-block">F8</span></KBtn>
      <KBtn><SkipForwardIcon className="h-[6px] w-[6px]" /><span className="mt-1 inline-block">F9</span></KBtn>
      <KBtn><SpeakerSimpleNoneIcon className="h-[6px] w-[6px]" /><span className="mt-1 inline-block">F10</span></KBtn>
      <KBtn><SpeakerSimpleLowIcon className="h-[6px] w-[6px]" /><span className="mt-1 inline-block">F11</span></KBtn>
      <KBtn><SpeakerSimpleHighIcon className="h-[6px] w-[6px]" /><span className="mt-1 inline-block">F12</span></KBtn>
      <KBtn><div className="h-4 w-4 rounded-full bg-gradient-to-b from-neutral-900 from-20% via-black via-50% to-neutral-900 to-95% p-px"><div className="h-full w-full rounded-full bg-black" /></div></KBtn>
    </div>
    {/* Row 2 */}
    <div className="mb-[2px] flex w-full shrink-0 gap-[2px]">
      <KBtn><span className="block">~</span><span className="mt-1 block">`</span></KBtn>
      {["1","2","3","4","5","6","7","8","9","0"].map((n,i) => <KBtn key={n}><span className="block">{"!@#$%^&*()"[i]}</span><span className="block">{n}</span></KBtn>)}
      <KBtn><span className="block">&mdash;</span><span className="block">_</span></KBtn>
      <KBtn><span className="block">+</span><span className="block">=</span></KBtn>
      <KBtn className="w-10 items-end justify-end pr-[4px] pb-[2px]" childrenClassName="items-end">delete</KBtn>
    </div>
    {/* Row 3 */}
    <div className="mb-[2px] flex w-full shrink-0 gap-[2px]">
      <KBtn className="w-10 items-end justify-start pb-[2px] pl-[4px]" childrenClassName="items-start">tab</KBtn>
      {"QWERTYUIOP".split("").map(k => <KBtn key={k}><span className="block">{k}</span></KBtn>)}
      <KBtn><span className="block">{`{`}</span><span className="block">{`[`}</span></KBtn>
      <KBtn><span className="block">{`}`}</span><span className="block">{`]`}</span></KBtn>
      <KBtn><span className="block">{`|`}</span><span className="block">{`\\`}</span></KBtn>
    </div>
    {/* Row 4 */}
    <div className="mb-[2px] flex w-full shrink-0 gap-[2px]">
      <KBtn className="w-[2.8rem] items-end justify-start pb-[2px] pl-[4px]" childrenClassName="items-start">caps lock</KBtn>
      {"ASDFGHJKL".split("").map(k => <KBtn key={k}><span className="block">{k}</span></KBtn>)}
      <KBtn><span className="block">{`:`}</span><span className="block">{`;`}</span></KBtn>
      <KBtn><span className="block">{`"`}</span><span className="block">{`'`}</span></KBtn>
      <KBtn className="w-[2.85rem] items-end justify-end pr-[4px] pb-[2px]" childrenClassName="items-end">return</KBtn>
    </div>
    {/* Row 5 */}
    <div className="mb-[2px] flex w-full shrink-0 gap-[2px]">
      <KBtn className="w-[3.65rem] items-end justify-start pb-[2px] pl-[4px]" childrenClassName="items-start">shift</KBtn>
      {"ZXCVBNM".split("").map(k => <KBtn key={k}><span className="block">{k}</span></KBtn>)}
      <KBtn><span className="block">{`<`}</span><span className="block">{`,`}</span></KBtn>
      <KBtn><span className="block">{`>`}</span><span className="block">{`.`}</span></KBtn>
      <KBtn><span className="block">{`?`}</span><span className="block">{`/`}</span></KBtn>
      <KBtn className="w-[3.65rem] items-end justify-end pr-[4px] pb-[2px]" childrenClassName="items-end">shift</KBtn>
    </div>
    {/* Row 6 */}
    <div className="mb-[2px] flex w-full shrink-0 gap-[2px]">
      <KBtn childrenClassName="h-full justify-between py-[4px]">
        <div className="flex w-full justify-end pr-1"><span className="block">fn</span></div>
        <div className="flex w-full justify-start pl-1"><GlobeIcon className="h-[6px] w-[6px]" /></div>
      </KBtn>
      <KBtn childrenClassName="h-full justify-between py-[4px]">
        <div className="flex w-full justify-end pr-1"><CaretUpIcon className="h-[6px] w-[6px]" /></div>
        <div className="flex w-full justify-start pl-1"><span className="block">control</span></div>
      </KBtn>
      <KBtn childrenClassName="h-full justify-between py-[4px]">
        <div className="flex w-full justify-end pr-1"><OptionKey className="h-[6px] w-[6px]" /></div>
        <div className="flex w-full justify-start pl-1"><span className="block">option</span></div>
      </KBtn>
      <KBtn className="w-8" childrenClassName="h-full justify-between py-[4px]">
        <div className="flex w-full justify-end pr-1"><CommandIcon className="h-[6px] w-[6px]" /></div>
        <div className="flex w-full justify-start pl-1"><span className="block">command</span></div>
      </KBtn>
      <KBtn className="w-[8.2rem]" />
      <KBtn className="w-8" childrenClassName="h-full justify-between py-[4px]">
        <div className="flex w-full justify-start pl-1"><CommandIcon className="h-[6px] w-[6px]" /></div>
        <div className="flex w-full justify-start pl-1"><span className="block">command</span></div>
      </KBtn>
      <KBtn childrenClassName="h-full justify-between py-[4px]">
        <div className="flex w-full justify-start pl-1"><OptionKey className="h-[6px] w-[6px]" /></div>
        <div className="flex w-full justify-start pl-1"><span className="block">option</span></div>
      </KBtn>
      <div className="mt-[2px] flex h-6 w-[4.9rem] flex-col items-center justify-end rounded-[4px] p-[0.5px]">
        <KBtn className="h-3 w-6"><CaretUpIcon className="h-[6px] w-[6px]" /></KBtn>
        <div className="flex">
          <KBtn className="h-3 w-6"><CaretLeftIcon className="h-[6px] w-[6px]" /></KBtn>
          <KBtn className="h-3 w-6"><CaretDownIcon className="h-[6px] w-[6px]" /></KBtn>
          <KBtn className="h-3 w-6"><CaretRightIcon className="h-[6px] w-[6px]" /></KBtn>
        </div>
      </div>
    </div>
  </div>
);
