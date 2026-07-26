import { useState } from "react";
import { PAPER } from "@/components/chrome/paper-tokens";
import { HelpDialog } from "@/components/panels/HelpDialog";

/** Paper bottom-right feedback + help (2JH-0). */
export function FeedbackDock() {
  const [helpOpen, setHelpOpen] = useState(false);

  return (
    <div className="pointer-events-auto flex items-center gap-1">
      <button
        type="button"
        className="flex h-7 items-center gap-1 overflow-clip rounded-[7px] px-1 antialiased"
        style={{
          backgroundColor: PAPER.surfaceAlt,
          border: `0.4px solid ${PAPER.borderHairline}`,
          fontFamily: PAPER.fontSans,
        }}
        aria-label="Feedback"
        title="Feedback form — coming soon"
      >
        <svg width={16} height={16} viewBox="0 0 24 24" fill="none" stroke={PAPER.textMuted} strokeWidth="1.5">
          <path d="M21 11.5a8.38 8.38 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.38 8.38 0 0 1-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.38 8.38 0 0 1 3.8-.9h.5a8.48 8.48 0 0 1 8 8v.5z" />
        </svg>
        <span className="text-xs leading-3" style={{ color: PAPER.textMuted }}>
          feedback
        </span>
      </button>
      <button
        type="button"
        onClick={() => setHelpOpen(true)}
        className="grid h-7 w-7 place-items-center overflow-clip rounded-[7px]"
        style={{
          backgroundColor: PAPER.surfaceAlt,
          border: `0.4px solid ${PAPER.borderHairline}`,
        }}
        aria-label="Help"
      >
        <svg width={16} height={16} viewBox="0 0 24 24" fill="none" stroke={PAPER.textMuted} strokeWidth="1.5">
          <circle cx="12" cy="12" r="9" />
          <path d="M9.5 9a2.5 2.5 0 0 1 4.2 1.8c0 1.5-2.5 2-2.5 3.2" />
          <circle cx="12" cy="17" r="0.5" fill={PAPER.textMuted} />
        </svg>
      </button>
      <HelpDialog open={helpOpen} onOpenChange={setHelpOpen} />
    </div>
  );
}
