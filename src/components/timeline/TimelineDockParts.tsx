import { useState, type ReactNode } from "react";
import { cn } from "@/lib/utils";
import { Tooltip } from "@/components/motion/tooltip";
import { PAPER } from "@/components/chrome/paper-tokens";

/**
 * Pixel-exact parts for the Paper timeline dock (node 5S8-0).
 * SVG paths lifted from the Paper export so the transport row matches 1:1.
 *
 * Every icon below paints with `currentColor` — no `color` prop, no JS-tracked
 * hover state. The wrapping button (`DockBtn`) sets its own CSS `color` via
 * plain Tailwind `text-*`/`hover:text-*` classes, and the SVG inherits it.
 * That makes hover a native `:hover` pseudo-class, not a React state update —
 * it cannot fail to fire on a real pointer, unlike the old cloneElement/
 * useState wiring (which broke: two competing `before:bg-*` classes raced on
 * specificity and silently lost).
 */

const ICON = "#DADADA";

export function SkipStartIcon({ size = 17 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="-2.438 -0.375 5.25 5.25" xmlns="http://www.w3.org/2000/svg">
      <path
        fillRule="evenodd"
        clipRule="evenodd"
        d="M0.387 0.333C0.467 0.401 0.477 0.521 0.407 0.601L-1.011 2.25 0.407 3.899C0.477 3.979 0.467 4.099 0.387 4.167 0.308 4.235 0.188 4.227 0.12 4.147L-1.407 2.373C-1.467 2.303-1.467 2.197-1.407 2.127L0.12 0.353C0.188 0.273 0.308 0.265 0.387 0.333Z"
        fill="currentColor"
      />
      <path
        d="M1.471 0.478C1.471 0.398 1.423 0.326 1.347 0.3 1.272 0.272 1.188 0.293 1.136 0.353L-0.388 2.127C-0.451 2.197-0.451 2.303-0.388 2.373L1.136 4.147C1.188 4.207 1.272 4.228 1.347 4.2 1.423 4.174 1.471 4.102 1.471 4.024L1.471 0.478Z"
        fill="currentColor"
      />
    </svg>
  );
}

export function PrevIcon({ size = 17 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="-1.125 -0.375 5.25 5.25" xmlns="http://www.w3.org/2000/svg">
      <g transform="scale(1.333)">
        <polyline
          points="1.681 3.054 0.309 1.687 1.681 0.32"
          fill="none"
          stroke="currentColor"
          strokeWidth="0.2"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </g>
    </svg>
  );
}

export function PlayTriIcon({ size = 17 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0.375 -0.375 5.25 5.25" xmlns="http://www.w3.org/2000/svg">
      <path
        d="M5.056 1.672C5.522 1.924 5.522 2.576 5.056 2.828L2.244 4.354C1.791 4.599 1.234 4.279 1.234 3.773L1.234 0.727C1.234 0.221 1.791-0.098 2.244 0.146L5.056 1.672Z"
        fill="currentColor"
      />
    </svg>
  );
}

export function PauseTriIcon({ size = 17 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
      <rect x="7" y="6" width="3.2" height="12" rx="1" fill="currentColor" />
      <rect x="13.8" y="6" width="3.2" height="12" rx="1" fill="currentColor" />
    </svg>
  );
}

export function NextIcon({ size = 17 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="1.688 -0.375 5.25 5.25" xmlns="http://www.w3.org/2000/svg">
      <g transform="translate(4.19 4.5) rotate(180) scale(1.333)">
        <polyline
          points="0.595 3.054 -0.776 1.687 0.595 0.32"
          fill="none"
          stroke="currentColor"
          strokeWidth="0.2"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </g>
    </svg>
  );
}

export function LoopIcon({ size = 22 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 6.75 6.75" xmlns="http://www.w3.org/2000/svg">
      <path
        fillRule="evenodd"
        clipRule="evenodd"
        d="M4.781 4.992C4.781 5.105 4.768 5.699 4.454 5.601C4.107 5.493 3.725 5.2 3.485 5.053C3.175 4.862 3.199 4.554 3.467 4.386C3.73 4.222 4.279 3.89 4.543 3.915C4.789 3.94 4.769 4.35 4.781 4.57C5.441 4.57 5.977 4.035 5.977 3.375C5.977 2.715 5.441 2.18 4.781 2.18C4.613 2.18 4.487 2.21 4.386 2.26C4.284 2.309 4.195 2.384 4.108 2.489C3.956 2.674 3.832 2.927 3.667 3.26C3.635 3.327 3.6 3.396 3.564 3.469C3.531 3.535 3.499 3.6 3.468 3.664C3.304 3.995 3.154 4.302 2.968 4.528C2.853 4.669 2.718 4.788 2.549 4.87C2.381 4.952 2.189 4.992 1.969 4.992C1.075 4.992 0.352 4.268 0.352 3.375C0.352 2.482 1.075 1.758 1.969 1.758C2.333 1.758 2.669 1.878 2.939 2.081C3.032 2.151 3.051 2.283 2.981 2.377C2.911 2.47 2.779 2.489 2.686 2.419C2.486 2.269 2.238 2.18 1.969 2.18C1.309 2.18 0.773 2.715 0.773 3.375C0.773 4.035 1.309 4.57 1.969 4.57C2.137 4.57 2.263 4.54 2.364 4.49C2.466 4.441 2.555 4.366 2.642 4.261C2.794 4.076 2.918 3.823 3.083 3.49C3.115 3.423 3.15 3.354 3.186 3.281C3.219 3.215 3.251 3.15 3.282 3.086C3.446 2.755 3.596 2.448 3.782 2.222C3.897 2.081 4.032 1.962 4.201 1.88C4.369 1.798 4.561 1.758 4.781 1.758C5.674 1.758 6.398 2.482 6.398 3.375C6.398 4.268 5.674 4.992 4.781 4.992Z"
        fill="currentColor"
      />
    </svg>
  );
}

export function ClearFrameIcon({ size = 19 }: { size?: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 6 6"
      xmlns="http://www.w3.org/2000/svg"
      style={{ rotate: "90deg", transformOrigin: "50% 50%" }}
    >
      <path d="M2.549 1.203L1.695 1.724 1.304 1.084C1.162 0.849 1.237 0.538 1.472 0.396 1.707 0.254 2.017 0.328 2.16 0.563L2.549 1.203Z" transform="translate(-0.67 0.91) rotate(-15)" fill="none" stroke="currentColor" strokeWidth="0.4" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M3.037 2.076L2.247 2.556C1.787 2.836 1.647 3.401 1.87 3.851L2.382 4.896C2.547 5.233 2.947 5.351 3.267 5.153L4.875 4.176C5.197 3.981 5.274 3.574 5.052 3.271L4.359 2.336C4.06 1.931 3.497 1.796 3.037 2.076Z" transform="translate(-0.67 0.91) rotate(-15)" fill="none" stroke="currentColor" strokeWidth="0.4" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M2.771 1.06L1.49 1.841 2.01 2.695 3.291 1.914 2.771 1.06Z" transform="translate(-0.67 0.91) rotate(-15)" fill="none" stroke="currentColor" strokeWidth="0.4" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M3.66 3.988L4.072 4.666" transform="translate(-0.67 0.91) rotate(-15)" fill="none" stroke="currentColor" strokeWidth="0.4" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M3.02 4.379L3.432 5.056" transform="translate(-0.67 0.91) rotate(-15)" fill="none" stroke="currentColor" strokeWidth="0.4" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M4.3 3.599L4.712 4.276" transform="translate(-0.67 0.91) rotate(-15)" fill="none" stroke="currentColor" strokeWidth="0.4" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

/**
 * Easing glyph — the ease-in curve with its two square handles (Paper "Frame 46",
 * the first 24px square in the transport row). Opens the Animation panel.
 */
export function EaseCurveGlyph({ size = 22, color = ICON }: { size?: number; color?: string }) {
  return (
    <svg width={size} height={size} viewBox="0 0 18 18" xmlns="http://www.w3.org/2000/svg">
      <g transform="translate(2 2)">
        <path d="M3 1H7V2H3V3H0V0H3V1Z" fill={color} />
        <path transform="translate(7 11)" d="M7 3H4V2H0V1H4V0H7V3Z" fill={color} />
        <path
          transform="translate(0 0.5)"
          d="M14 1C12.009 1 10.763 1.207 9.832 1.942C8.892 2.685 8.176 4.044 7.483 6.629C6.783 9.244 5.999 10.885 4.787 11.842C3.566 12.806 2.009 13 0 13V12C1.991 12 3.237 11.793 4.168 11.058C5.108 10.315 5.824 8.955 6.517 6.37C7.217 3.755 8.001 2.114 9.213 1.157C10.433 0.193 11.991 0 14 0V1Z"
          fill={color}
        />
      </g>
    </svg>
  );
}

/**
 * Onion-skin glyph — nested offset outlines knocked out of a filled blob, so the
 * ring stroke has to be painted in the button's own background colour.
 */
export function OnionRingsGlyph({
  stroke = PAPER.frameActive,
  color = ICON,
}: {
  stroke?: string;
  color?: string;
}) {
  return (
    <svg width={22} height={22} viewBox="122.201 122.201 18.007 18.007" xmlns="http://www.w3.org/2000/svg">
      <path fillRule="evenodd" d="M123.796 133.103C123.383 128.672 126.438 125.08 129.481 124.154C137.073 121.825 142.801 134.471 134.983 137.97C127.148 141.489 124.233 137.587 123.796 133.103Z" fill={color} />
      <path fillRule="evenodd" d="M126.748 132.686C126.498 129.473 128.342 126.869 130.177 126.198C134.759 124.508 138.216 133.682 133.499 136.216C128.771 138.767 127.01 135.936 126.748 132.686Z" fill="none" stroke={stroke} strokeWidth="0.8" />
      <path fillRule="evenodd" d="M124.778 133.45C124.419 129.442 127.071 126.194 129.713 125.356C136.303 123.25 141.279 134.692 134.49 137.853C127.689 141.035 125.155 137.503 124.778 133.45Z" fill="none" stroke={stroke} strokeWidth="0.8" />
      <path fillRule="evenodd" d="M128.797 132.515C128.663 130.34 129.663 128.58 130.662 128.126C133.154 126.982 135.035 133.186 132.469 134.902C129.897 136.626 128.939 134.712 128.797 132.515Z" fill="none" stroke={stroke} strokeWidth="0.8" />
      <path fillRule="evenodd" d="M130.309 131.201C130.257 130.041 130.638 129.1 131.02 128.858C131.969 128.247 132.686 131.561 131.708 132.476C130.728 133.397 130.363 132.376 130.309 131.201Z" fill="none" stroke={stroke} strokeWidth="0.8" />
    </svg>
  );
}

export function LayerCountGlyph({ size = 14 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 12 12" xmlns="http://www.w3.org/2000/svg">
      <g transform="translate(0 2)" fill="#D9D9D9">
        <path d="M5 0C4.448 0 4 0.448 4 1V3C4 3.552 4.448 4 5 4H11C11.552 4 12 3.552 12 3V1C12 0.448 11.552 0 11 0H5Z" />
        <path d="M1 4C0.448 4 0 4.448 0 5V7C0 7.552 0.448 8 1 8H5C5.552 8 6 7.552 6 7V5C6 4.448 5.552 4 5 4H1Z" />
      </g>
    </svg>
  );
}

/** Eye (layer visible) — Paper's exact glyph, 12px, used at 0.7 opacity. */
export function PaperEyeGlyph({ size = 14 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 4.5 4.5" xmlns="http://www.w3.org/2000/svg">
      <path
        fillRule="evenodd"
        clipRule="evenodd"
        d="M2.25 1.547C1.862 1.547 1.547 1.862 1.547 2.25 1.547 2.638 1.862 2.953 2.25 2.953 2.638 2.953 2.953 2.638 2.953 2.25 2.953 1.862 2.638 1.547 2.25 1.547ZM1.828 2.25C1.828 2.017 2.017 1.828 2.25 1.828 2.483 1.828 2.672 2.017 2.672 2.25 2.672 2.483 2.483 2.672 2.25 2.672 2.017 2.672 1.828 2.483 1.828 2.25Z"
        fill="#FFFFFF"
      />
      <path
        fillRule="evenodd"
        clipRule="evenodd"
        d="M2.25 0.609C1.404 0.609 0.833 1.116 0.503 1.546L0.497 1.554C0.422 1.651 0.353 1.741 0.306 1.847 0.256 1.96 0.234 2.083 0.234 2.25 0.234 2.417 0.256 2.54 0.306 2.653 0.353 2.759 0.422 2.849 0.497 2.946L0.503 2.954C0.833 3.384 1.404 3.891 2.25 3.891 3.096 3.891 3.667 3.384 3.997 2.954L4.003 2.946C4.078 2.849 4.147 2.759 4.194 2.653 4.244 2.54 4.266 2.417 4.266 2.25 4.266 2.083 4.244 1.96 4.194 1.847 4.147 1.741 4.078 1.651 4.003 1.554L3.997 1.546C3.667 1.116 3.096 0.609 2.25 0.609ZM0.725 1.718C1.031 1.321 1.528 0.891 2.25 0.891 2.972 0.891 3.469 1.321 3.775 1.718 3.857 1.825 3.905 1.888 3.937 1.96 3.966 2.027 3.984 2.109 3.984 2.25 3.984 2.391 3.966 2.473 3.937 2.54 3.905 2.612 3.857 2.675 3.775 2.782 3.469 3.179 2.972 3.609 2.25 3.609 1.528 3.609 1.031 3.179 0.725 2.782 0.643 2.675 0.595 2.612 0.563 2.54 0.534 2.473 0.516 2.391 0.516 2.25 0.516 2.109 0.534 2.027 0.563 1.96 0.595 1.888 0.643 1.825 0.725 1.718Z"
        fill="#FFFFFF"
      />
    </svg>
  );
}

/** Pen — "Draw" half of the stage segmented control. */
export function StagePenGlyph({ size = 14 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="9.75 9.75 4.5 4.5" xmlns="http://www.w3.org/2000/svg">
      <path
        d="M12.299 10.605L10.631 12.37C10.568 12.437 10.507 12.569 10.495 12.66L10.42 13.318C10.394 13.556 10.564 13.719 10.8 13.678L11.454 13.566C11.545 13.55 11.673 13.483 11.736 13.414L13.404 11.649C13.692 11.344 13.822 10.997 13.373 10.572 12.927 10.152 12.587 10.3 12.299 10.605Z"
        fill="none"
        stroke="#FFFFFF"
        strokeWidth="0.4"
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeMiterlimit="10"
      />
      <path
        d="M12.021 10.899C12.108 11.46 12.563 11.888 13.128 11.945"
        fill="none"
        stroke="#FFFFFF"
        strokeWidth="0.4"
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeMiterlimit="10"
      />
    </svg>
  );
}

/** Screen + play triangle — "Preview" half of the stage segmented control. */
export function StagePreviewGlyph({ size = 14 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 4.5 4.5" xmlns="http://www.w3.org/2000/svg">
      <path
        fillRule="evenodd"
        clipRule="evenodd"
        d="M2.239 0.234H2.261C2.694 0.234 3.033 0.234 3.297 0.27 3.568 0.306 3.782 0.382 3.95 0.55 4.118 0.718 4.194 0.932 4.23 1.203 4.266 1.467 4.266 1.806 4.266 2.239V2.261C4.266 2.694 4.266 3.033 4.23 3.297 4.194 3.568 4.118 3.782 3.95 3.95 3.782 4.118 3.568 4.194 3.297 4.23 3.033 4.266 2.694 4.266 2.261 4.266H2.239C1.806 4.266 1.467 4.266 1.203 4.23 0.932 4.194 0.718 4.118 0.55 3.95 0.382 3.782 0.306 3.568 0.27 3.297 0.234 3.033 0.234 2.694 0.234 2.261V2.239C0.234 1.806 0.234 1.467 0.27 1.203 0.306 0.932 0.382 0.718 0.55 0.55 0.718 0.382 0.932 0.306 1.203 0.27 1.467 0.234 1.806 0.234 2.239 0.234ZM1.24 0.549C1 0.581 0.856 0.642 0.749 0.749 0.642 0.856 0.581 1 0.549 1.24 0.544 1.278 0.539 1.318 0.536 1.359H1.235L1.771 0.518C1.559 0.521 1.386 0.529 1.24 0.549ZM2.101 0.516C2.098 0.526 2.093 0.535 2.087 0.544L1.569 1.359H2.454L2.985 0.525C2.785 0.516 2.545 0.516 2.25 0.516 2.199 0.516 2.149 0.516 2.101 0.516ZM3.3 0.554L2.787 1.359H3.964C3.961 1.318 3.956 1.278 3.951 1.24 3.919 1 3.858 0.856 3.751 0.749 3.65 0.648 3.516 0.588 3.3 0.554ZM3.979 1.641H2.533C2.532 1.641 2.53 1.641 2.529 1.641H1.315C1.313 1.641 1.312 1.641 1.31 1.641H0.521C0.516 1.814 0.516 2.014 0.516 2.25 0.516 2.696 0.516 3.016 0.549 3.26 0.581 3.5 0.642 3.644 0.749 3.751 0.856 3.858 1 3.919 1.24 3.951 1.484 3.984 1.804 3.984 2.25 3.984 2.696 3.984 3.016 3.984 3.26 3.951 3.5 3.919 3.644 3.858 3.751 3.751 3.858 3.644 3.919 3.5 3.951 3.26 3.984 3.016 3.984 2.696 3.984 2.25 3.984 2.014 3.984 1.814 3.979 1.641Z"
        fill={ICON}
      />
      <path
        fillRule="evenodd"
        d="M2.908 2.807C2.908 3.016 1.987 3.583 1.827 3.424C1.747 3.148 1.699 2.489 1.827 2.192C2.062 2.075 2.908 2.599 2.908 2.807Z"
        fill="#FFFFFF"
      />
    </svg>
  );
}

export function FrameCountGlyph({ size = 14 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0.603 0.75 4.507 4.5" xmlns="http://www.w3.org/2000/svg">
      <path d="M2.802 0.755C2.783 0.751 2.765 0.747 2.746 0.747H2.22C2.147 0.747 2.078 0.747 2.015 0.747L2.015 0.748V1.706L2.802 1.706 2.802 0.755Z" fill={ICON} />
      <path d="M3.139 1.876L3.139 1.874 3.139 1.874V1.197H3.719C3.795 1.197 3.861 1.197 3.928 1.197L3.928 1.199V2.157L3.139 2.157V1.876Z" fill={ICON} />
      <path d="M2.802 2.043L0.717 2.043 0.717 2.043 0.717 3.451C0.717 3.553 0.717 3.647 0.719 3.733L0.722 3.733H2.802V2.043Z" fill={ICON} />
      <path d="M3.139 3.902L3.139 3.901 3.139 3.901 3.139 2.493 5.222 2.493 5.222 2.493 5.222 3.901C5.222 4.004 5.222 4.097 5.222 4.184L5.219 4.184H3.139V3.902Z" fill={ICON} />
      <path d="M2.802 4.071L2.015 4.071 2.015 4.8 2.015 4.803C2.078 4.803 2.147 4.803 2.22 4.803H2.802L2.802 4.071Z" fill={ICON} />
      <path d="M3.139 5.246C3.158 5.251 3.175 5.253 3.196 5.253H3.719C3.795 5.253 3.861 5.253 3.928 5.253L3.928 5.251 3.928 4.522H3.139V5.246Z" fill={ICON} />
      <path d="M1.675 0.752C1.312 0.766 1.091 0.806 0.936 0.946 0.768 1.097 0.73 1.321 0.72 1.706L1.675 1.706V0.752Z" fill={ICON} />
      <path d="M4.266 2.157V1.203C4.629 1.216 4.848 1.256 5.003 1.396 5.172 1.549 5.211 1.771 5.22 2.157L4.266 2.157Z" fill={ICON} />
      <path d="M5.209 4.522H4.266V5.247C4.629 5.236 4.848 5.193 5.003 5.055 5.135 4.936 5.19 4.771 5.209 4.522Z" fill={ICON} />
      <path d="M1.675 4.071L1.675 4.797C1.312 4.786 1.091 4.743 0.936 4.605 0.805 4.486 0.753 4.321 0.731 4.071L1.675 4.071Z" fill={ICON} />
    </svg>
  );
}

function StepMinus({ dim }: { dim?: boolean }) {
  return (
    <svg width={14} height={14} viewBox="0 0 4.5 4.5" style={{ opacity: dim ? 0.1 : 0.6 }}>
      <path d="M3.891 2.25C3.891 2.328 3.828 2.391 3.75 2.391H0.75C0.672 2.391 0.609 2.328 0.609 2.25 0.609 2.172 0.672 2.109 0.75 2.109H3.75C3.828 2.109 3.891 2.172 3.891 2.25Z" fill="#FFFFFF" />
    </svg>
  );
}

function StepPlus({ dim }: { dim?: boolean }) {
  return (
    <svg width={14} height={14} viewBox="0 0 4.5 4.5" style={{ opacity: dim ? 0.1 : 0.6 }}>
      <path d="M2.109 3.75C2.109 3.828 2.172 3.891 2.25 3.891 2.328 3.891 2.391 3.828 2.391 3.75V2.391H3.75C3.828 2.391 3.891 2.328 3.891 2.25 3.891 2.172 3.828 2.109 3.75 2.109H2.391V0.75C2.391 0.672 2.328 0.609 2.25 0.609 2.172 0.609 2.109 0.672 2.109 0.75V2.109H0.75C0.672 2.109 0.609 2.172 0.609 2.25 0.609 2.328 0.672 2.391 0.75 2.391H2.109V3.75Z" fill="#FFFFFF" />
    </svg>
  );
}

/**
 * Click-to-edit number: renders as a plain button until clicked, then swaps
 * to a text input; Enter/blur commits (clamped to `min`/`max`), Escape cancels.
 */
export function EditableNumber({
  value,
  onCommit,
  min,
  max,
  className,
  style,
  "aria-label": ariaLabel,
}: {
  value: number;
  onCommit: (n: number) => void;
  min?: number;
  max?: number;
  className?: string;
  style?: React.CSSProperties;
  "aria-label"?: string;
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState("");

  function commit() {
    setEditing(false);
    const n = Math.round(Number(draft));
    if (!Number.isFinite(n)) return;
    const clamped = Math.min(max ?? Infinity, Math.max(min ?? -Infinity, n));
    if (clamped !== value) onCommit(clamped);
  }

  if (editing) {
    return (
      <input
        autoFocus
        type="text"
        inputMode="numeric"
        value={draft}
        onChange={(e) => setDraft(e.target.value.replace(/[^0-9]/g, ""))}
        onFocus={(e) => e.target.select()}
        onBlur={commit}
        onKeyDown={(e) => {
          if (e.key === "Enter") {
            e.preventDefault();
            commit();
          } else if (e.key === "Escape") {
            e.preventDefault();
            setEditing(false);
          }
          e.stopPropagation();
        }}
        aria-label={ariaLabel}
        className={cn(className, "bg-transparent outline-none")}
        style={style}
      />
    );
  }
  return (
    <button
      type="button"
      onClick={() => {
        setDraft(String(value));
        setEditing(true);
      }}
      aria-label={ariaLabel}
      className={cn(className, "cursor-text")}
      style={style}
    >
      {value}
    </button>
  );
}

/**
 * Paper stepper box (5S8-0): [leadingIcon] − value + [trailing label].
 * `#131313` bg, `#292A2A` 0.4px border, ~7px radius, 29px tall (Paper 6/24 + 20%).
 */
export function StepperBox({
  leading,
  value,
  onDec,
  onInc,
  onSetValue,
  trailing,
  decDisabled,
  incDisabled,
  decLabel,
  incLabel,
  min,
  max,
}: {
  leading?: ReactNode;
  value: number;
  onDec: () => void;
  onInc: () => void;
  /** value becomes click-to-edit when provided */
  onSetValue?: (n: number) => void;
  trailing?: ReactNode;
  decDisabled?: boolean;
  incDisabled?: boolean;
  decLabel?: string;
  incLabel?: string;
  min?: number;
  max?: number;
}) {
  return (
    <div
      className="flex h-[29px] items-center gap-[10px] overflow-clip rounded-[7px] px-2 py-1"
      style={{ backgroundColor: PAPER.surfaceAlt, border: `0.4px solid ${PAPER.borderHairline}` }}
    >
      {leading}
      <div className="flex w-[60px] shrink-0 items-start gap-[5px]">
        <button
          type="button"
          onClick={onDec}
          disabled={decDisabled}
          aria-label={decLabel ?? "Decrease"}
          className="grid place-items-center rounded-[4px] p-[2px] transition-colors hover:bg-[#313131] disabled:opacity-40 disabled:hover:bg-transparent"
        >
          <StepMinus dim={decDisabled} />
        </button>
        {onSetValue ? (
          <EditableNumber
            value={value}
            onCommit={onSetValue}
            min={min}
            max={max}
            aria-label="Edit value"
            className="w-[22px] shrink-0 rounded-[4px] text-center text-[12px] leading-[14px] text-white tabular-nums hover:bg-[#313131]"
            style={{ fontFamily: PAPER.fontMono }}
          />
        ) : (
          <span
            className="flex w-[22px] shrink-0 flex-wrap justify-center text-center text-[12px] leading-[14px] text-white tabular-nums"
            style={{ fontFamily: PAPER.fontMono }}
          >
            {value}
          </span>
        )}
        <button
          type="button"
          onClick={onInc}
          disabled={incDisabled}
          aria-label={incLabel ?? "Increase"}
          className="grid place-items-center rounded-[4px] p-[2px] transition-colors hover:bg-[#313131] disabled:opacity-40 disabled:hover:bg-transparent"
        >
          <StepPlus dim={incDisabled} />
        </button>
      </div>
      {trailing}
    </div>
  );
}

/** Vertical hairline separator used between transport clusters. */
export function DockSep() {
  return (
    <svg viewBox="116.5 116 2 18" width={2} height={22} xmlns="http://www.w3.org/2000/svg" style={{ overflow: "visible", opacity: 0.2 }} aria-hidden>
      <path fillRule="evenodd" d="M117.244 133.999L117.244 115.999" fill="none" stroke={ICON} paintOrder="stroke" />
    </svg>
  );
}

/**
 * Bare icon button in the transport row (play / prev / loop / …).
 *
 * The button IS the hit target — icon size plus a fixed pad on every side —
 * so hovering the padded area (not just the tiny glyph) triggers the chip.
 * Hover is plain CSS `:hover` (icon paints with `currentColor`, so
 * `hover:text-white` cascades into the SVG for free); nothing here depends on
 * a React event handler firing, so it cannot silently fail to trigger the way
 * the old cloneElement/useState version did.
 */
const DOCK_BTN_PAD = 6;

export function DockBtn({
  label,
  onClick,
  active,
  size = 17,
  children,
}: {
  label: string;
  onClick: () => void;
  active?: boolean;
  size?: number;
  children: ReactNode;
}) {
  return (
    <Tooltip content={label}>
      <button
        type="button"
        onClick={onClick}
        aria-label={label}
        aria-pressed={active}
        style={{ width: size + DOCK_BTN_PAD * 2, height: size + DOCK_BTN_PAD * 2, margin: -DOCK_BTN_PAD }}
        className={cn(
          "grid shrink-0 place-items-center rounded-[6px] transition-colors hover:bg-[#313131] hover:text-white",
          active ? "text-white opacity-100" : "text-[#DADADA] opacity-90 hover:opacity-100",
        )}
      >
        {children}
      </button>
    </Tooltip>
  );
}

/**
 * 29×29 square button (easing / onion / full-strokes) — Paper 5QE-0 scaled +20%.
 * Idle is transparent on the `#131212` timeline surface; hover `#313131`, active
 * `#40608E`. `children` is called with the resolved background (for knocked-out
 * glyphs like the onion rings) and the resolved icon color (`#DADADA` idle,
 * white on hover/active).
 */
export function SquareBtn({
  label,
  onClick,
  active,
  children,
}: {
  label: string;
  onClick?: () => void;
  active?: boolean;
  children: ReactNode | ((bg: string, color: string) => ReactNode);
}) {
  const [hover, setHover] = useState(false);
  const bg = active
    ? PAPER.frameActive
    : hover
      ? PAPER.squareHover
      : "transparent";
  const color = active || hover ? "#FFFFFF" : ICON;
  return (
    <Tooltip
      content={label}
      side="top"
      className="border-[#2D2E2E] bg-[#131212] text-[#DEDEDE] shadow-lg"
    >
      <button
        type="button"
        onClick={onClick}
        aria-label={label}
        aria-pressed={active}
        onPointerEnter={() => setHover(true)}
        onPointerLeave={() => setHover(false)}
        className="relative grid h-[29px] w-[29px] shrink-0 place-items-center overflow-clip rounded-[4px] transition-colors"
        style={{ backgroundColor: bg }}
      >
        {typeof children === "function" ? children(bg, color) : children}
      </button>
    </Tooltip>
  );
}
