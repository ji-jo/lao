import { useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogClose,
} from "@/components/ui/dialog";
import { PAPER } from "@/components/chrome/paper-tokens";
import { cn } from "@/lib/utils";

const SHORTCUTS: { label: string; keys: string }[] = [
  { label: "Select", keys: "v" },
  { label: "Ink", keys: "b" },
  { label: "Pencil", keys: "p" },
  { label: "Fill / bucket", keys: "f" },
  { label: "Eraser", keys: "e" },
  { label: "Text", keys: "t" },
  { label: "Hand", keys: "h" },
  { label: "Shapes flyout", keys: "s" },
  { label: "Rectangle", keys: "r" },
  { label: "Diamond", keys: "⇧ + r" },
  { label: "Circle", keys: "o" },
  { label: "Line", keys: "l" },
  { label: "Arrow line", keys: "⇧ + l" },
  { label: "Reference / camera", keys: "1" },
  { label: "Insert image", keys: "2" },
  { label: "Select all", keys: "ctrl + a" },
  { label: "Select all layers", keys: "ctrl + ⇧ + a" },
  { label: "Deselect", keys: "d" },
  { label: "Delete selection", keys: "del" },
  { label: "Copy", keys: "ctrl + c" },
  { label: "Paste", keys: "ctrl + v" },
  { label: "Undo", keys: "ctrl + z" },
  { label: "Redo", keys: "ctrl + ⇧ + z" },
  { label: "Save", keys: "ctrl + s" },
  { label: "Open", keys: "ctrl + o" },
  { label: "New file", keys: "ctrl + n" },
  { label: "Screenshot to clipboard", keys: "ctrl + ⇧ + c" },
  { label: "Straight line", keys: "⇧ + drag" },
  { label: "Step frame", keys: "← / →" },
  { label: "Play / pause", keys: "enter" },
  { label: "Toggle preview", keys: "f" },
  { label: "Exit preview", keys: "esc" },
  { label: "Pan canvas", keys: "middle mouse" },
  { label: "Zoom", keys: "scroll / pinch" },
];

const LEGENDS: string[] = [
  "First Frame",
  "Loop",
  "Clear Frame",
  "Animation Control",
  "Onion Layer",
  "Layer",
  "Frame",
  "Edit Mode",
  "Preview",
  "Hide",
  "More",
  "Auto record",
  "Auto Layer",
  "Collapse Layer",
  "Brush Size",
  "Canvas Setting",
];

function pairs<T>(items: T[]): [T, T | undefined][] {
  const out: [T, T | undefined][] = [];
  for (let i = 0; i < items.length; i += 2) out.push([items[i], items[i + 1]]);
  return out;
}

function Row({ label, value }: { label: string; value?: string }) {
  if (!value) return <div className="flex-1" aria-hidden />;
  return (
    <div
      className="flex flex-1 items-center justify-between gap-2 rounded-xl px-3 py-2"
      style={{ backgroundColor: PAPER.surface, border: "1px solid #FFFFFF1A" }}
    >
      <div className="text-xs opacity-80" style={{ color: PAPER.text, fontFamily: PAPER.fontSans }}>
        {label}
      </div>
      <div
        className="text-center text-xs opacity-60"
        style={{ color: PAPER.text, fontFamily: PAPER.fontMono }}
      >
        {value}
      </div>
    </div>
  );
}

/** Paper Help modal (2CD-0) — Shortcuts + Icon Legends tabs. */
export function HelpDialog({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const [tab, setTab] = useState<"shortcuts" | "legends">("shortcuts");

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        hideClose
        className="flex max-h-[min(86vh,660px)] w-[380px] max-w-[calc(100%-2rem)] flex-col gap-0 overflow-hidden rounded-2xl p-4"
        style={{ backgroundColor: PAPER.surface, fontFamily: PAPER.fontSans }}
      >
        <div className="flex min-h-0 flex-1 flex-col gap-6">
          <div className="flex items-start justify-between gap-8">
            <div className="flex flex-col items-start gap-1">
              <div
                className="text-lg tracking-[0.02em]"
                style={{ color: PAPER.text, fontFamily: "'Redaction 35', serif" }}
              >
                Help
              </div>
              <div className="text-[10px] font-light leading-3 opacity-75" style={{ color: PAPER.text }}>
                Find keyboard shortcuts, legends or ask for help whenever
                <br />
                you need it.
              </div>
            </div>
            <DialogClose asChild>
              <button
                type="button"
                aria-label="Close"
                className="grid size-6 shrink-0 place-items-center rounded-full"
                style={{
                  backgroundImage: PAPER.modeActiveGradient,
                  border: "0.5px solid #C9C9C933",
                }}
              >
                <svg width={12} height={12} viewBox="0 0 8 8" fill="none" style={{ opacity: 0.8 }}>
                  <path
                    d="M1 1l6 6M7 1L1 7"
                    stroke="#FFFFFF"
                    strokeWidth="0.7"
                    strokeLinecap="round"
                  />
                </svg>
              </button>
            </DialogClose>
          </div>

          <div
            className="flex items-center justify-center gap-3 self-stretch rounded-lg p-2"
            style={{
              backgroundImage:
                "linear-gradient(in oklab 180deg, oklab(100% 0 0 / 0%) -14.5%, oklab(50.1% 0 0) 152.5%)",
            }}
          >
            <a
              href="mailto:jijo@duck.com"
              className="flex items-center gap-2.5 justify-center rounded-full px-4 py-1.5 h-6"
              style={{
                backgroundImage: PAPER.modeActiveGradient,
                border: "1px solid #FFFFFF1A",
              }}
            >
              <span className="text-xs opacity-60" style={{ color: "white", fontFamily: PAPER.fontMono }}>
                Need Support?
              </span>
              <span className="text-xs tracking-[0.02em]" style={{ color: PAPER.text, fontFamily: PAPER.fontSans }}>
                Email
              </span>
            </a>
          </div>

          <div className="h-px w-full bg-white/10" aria-hidden />

          <div
            className="flex items-center gap-1 self-start rounded-lg p-0.5"
            style={{ backgroundColor: "#121212", outline: "1px solid #292A2A" }}
          >
            {(["shortcuts", "legends"] as const).map((id) => (
              <button
                key={id}
                type="button"
                onClick={() => setTab(id)}
                className={cn(
                  "rounded-[7px] px-2 py-1 text-xs opacity-80",
                  tab === id && "opacity-100",
                )}
                style={{
                  backgroundColor: tab === id ? "#313131" : "transparent",
                  color: "white",
                  fontFamily: PAPER.fontMono,
                }}
              >
                {id === "shortcuts" ? "Shortcuts" : "Icon Legends"}
              </button>
            ))}
          </div>

          <div className="min-h-0 flex-1 overflow-y-auto pr-1">
            {tab === "shortcuts" ? (
              <div className="flex flex-col gap-3">
                {pairs(SHORTCUTS).map(([a, b], i) => (
                  <div key={i} className="flex items-start justify-end gap-3 self-stretch">
                    <Row label={a.label} value={a.keys} />
                    <Row label={b?.label ?? ""} value={b?.keys} />
                  </div>
                ))}
              </div>
            ) : (
              <div className="flex flex-col gap-3">
                {pairs(LEGENDS).map(([a, b], i) => (
                  <div key={i} className="flex items-start justify-end gap-3 self-stretch">
                    <div
                      className="flex flex-1 items-center gap-2 rounded-xl px-3 py-2"
                      style={{ backgroundColor: PAPER.surface }}
                    >
                      <span className="text-xs opacity-70" style={{ color: PAPER.text }}>
                        ○
                      </span>
                      <span className="text-xs" style={{ color: PAPER.text, fontFamily: PAPER.fontSans }}>
                        {a}
                      </span>
                    </div>
                    {b ? (
                      <div
                        className="flex flex-1 items-center gap-2 rounded-xl px-3 py-2"
                        style={{ backgroundColor: PAPER.surface }}
                      >
                        <span className="text-xs opacity-70" style={{ color: PAPER.text }}>
                          ○
                        </span>
                        <span className="text-xs" style={{ color: PAPER.text, fontFamily: PAPER.fontSans }}>
                          {b}
                        </span>
                      </div>
                    ) : (
                      <div className="flex-1" />
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>

          <div className="flex items-end justify-end gap-1">
            <DialogClose asChild>
              <button
                type="button"
                className="flex h-9 w-30 items-center justify-center rounded-full"
                style={{ backgroundColor: "#252525" }}
              >
                <span className="text-sm tracking-[0.02em]" style={{ color: PAPER.text, fontFamily: PAPER.fontSans }}>
                  Close
                </span>
              </button>
            </DialogClose>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
