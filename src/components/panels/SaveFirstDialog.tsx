import { useState } from "react";
import { Dialog, DialogContent, DialogClose } from "@/components/ui/dialog";
import { GradientHoverButton } from "@/components/ui/gradient-hover-button";
import { ModalCloseChip } from "@/components/ui/modal-close-chip";
import { PAPER } from "@/components/chrome/paper-tokens";

/**
 * Paper save-first confirm — `8BI-0`.
 *
 * Used for New / Ctrl+N. Mode switch no longer opens this (each workflow
 * keeps its own document), but the design stays for a possible one-shot
 * confirm later.
 *
 * Three exits:
 * - Close chip / Esc → cancel (nothing happens)
 * - Secondary → proceed without saving
 * - Primary → save, then proceed; if save is cancelled/fails, stay open
 */
export function SaveFirstDialog({
  open,
  onOpenChange,
  title = "You want to save first?",
  alert,
  skipLabel,
  confirmLabel,
  onSkip,
  onConfirm,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title?: string;
  alert: string;
  skipLabel: string;
  confirmLabel: string;
  onSkip: () => void;
  /** Return true when save succeeded and the caller may proceed. */
  onConfirm: () => Promise<boolean>;
}) {
  const [busy, setBusy] = useState(false);

  async function handleConfirm() {
    if (busy) return;
    setBusy(true);
    try {
      const ok = await onConfirm();
      if (ok) onOpenChange(false);
    } finally {
      setBusy(false);
    }
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (busy && !next) return;
        onOpenChange(next);
      }}
    >
      <DialogContent
        hideClose
        className="flex w-[378px] max-w-[calc(100%-2rem)] flex-col items-end gap-6 overflow-clip rounded-2xl p-4"
        style={{ backgroundColor: PAPER.surface, fontFamily: PAPER.fontSans }}
      >
        <div className="flex items-start justify-between gap-8 self-stretch">
          <div
            className="min-w-0 flex-1 text-lg leading-[22px] tracking-[0.02em]"
            style={{ color: PAPER.text, fontFamily: PAPER.fontSerif }}
          >
            {title}
          </div>
          <DialogClose asChild>
            <ModalCloseChip />
          </DialogClose>
        </div>

        <div
          className="self-stretch text-sm font-light leading-[18px] tracking-[0.02em] opacity-75"
          style={{ color: PAPER.text, fontFamily: PAPER.fontSans }}
        >
          {alert}
        </div>

        <div className="flex items-start gap-4">
          <GradientHoverButton
            type="button"
            disabled={busy}
            onClick={() => {
              onSkip();
              onOpenChange(false);
            }}
            background={PAPER.pillHover}
            hoverBackground={PAPER.secondaryBtnHoverGradient}
            hoverBorderColor={PAPER.outline}
            className="flex h-9 min-w-[120px] shrink-0 cursor-pointer items-center justify-center rounded-full px-3 py-1.5"
          >
            {(hovered) => (
              <span
                className="text-sm leading-[18px] tracking-[0.02em] transition-colors"
                style={{
                  color: hovered ? "#FFFFFF" : PAPER.text,
                  fontFamily: PAPER.fontSans,
                }}
              >
                {skipLabel}
              </span>
            )}
          </GradientHoverButton>
          <GradientHoverButton
            type="button"
            disabled={busy}
            autoFocus
            onClick={() => void handleConfirm()}
            background={PAPER.primaryBtnGradient}
            hoverBackground={PAPER.primaryBtnHoverGradient}
            backgroundOrigin="border-box"
            borderColor={PAPER.frameActiveBorder}
            hoverBorderColor={PAPER.frameActive}
            className="flex h-9 min-w-[120px] shrink-0 cursor-pointer items-center justify-center rounded-full px-3 py-1.5"
          >
            {(hovered) => (
              <span
                className="content-center text-sm leading-[18px] tracking-[0.02em] transition-colors"
                style={{
                  color: hovered ? "#FFFFFF" : PAPER.text,
                  fontFamily: PAPER.fontSans,
                }}
              >
                {busy ? "Saving…" : confirmLabel}
              </span>
            )}
          </GradientHoverButton>
        </div>
      </DialogContent>
    </Dialog>
  );
}
