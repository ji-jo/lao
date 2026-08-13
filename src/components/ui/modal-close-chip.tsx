import { GradientHoverButton } from "@/components/ui/gradient-hover-button";
import { PAPER } from "@/components/chrome/paper-tokens";

/**
 * Paper modal close chip — 24px circle, mode-active gradient + 0.5px rim
 * (8BI-0 / Help 2CD-0 / Export). Hover washes via `GradientHoverButton`.
 */
export function ModalCloseChip({
  onClick,
  "aria-label": ariaLabel = "Close",
}: {
  onClick?: () => void;
  "aria-label"?: string;
}) {
  return (
    <GradientHoverButton
      type="button"
      aria-label={ariaLabel}
      onClick={onClick}
      background={PAPER.modeActiveGradient}
      hoverBackground={PAPER.closeChipHoverWash}
      backgroundOrigin="border-box"
      borderColor={PAPER.closeChipBorder}
      borderWidth={0.5}
      className="grid size-6 shrink-0 cursor-pointer place-items-center rounded-full"
    >
      <svg
        xmlns="http://www.w3.org/2000/svg"
        width={16}
        height={16}
        viewBox="0.375 0.375 6 6"
        style={{ opacity: 0.8, flexShrink: 0 }}
        aria-hidden
      >
        <path
          d="M4.993 5.258C5.066 5.331 5.184 5.331 5.258 5.258 5.331 5.184 5.331 5.066 5.258 4.993L3.64 3.375 5.258 1.757C5.331 1.684 5.331 1.566 5.258 1.492 5.184 1.419 5.066 1.419 4.993 1.492L3.375 3.11 1.757 1.492C1.684 1.419 1.566 1.419 1.492 1.492 1.42 1.566 1.42 1.684 1.492 1.757L3.11 3.375 1.492 4.993C1.42 5.066 1.42 5.184 1.492 5.258 1.566 5.331 1.684 5.331 1.757 5.258L3.375 3.64 4.993 5.258Z"
          fill="#FFFFFF"
        />
      </svg>
    </GradientHoverButton>
  );
}
