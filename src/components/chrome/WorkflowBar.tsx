import { useState, useRef, useEffect } from "react";
import { usePlayback, type Workflow } from "@/state/playback";
import { useProject } from "@/state/project";
import { saveLaoFile } from "@/file/laoFile";
import { PAPER } from "@/components/chrome/paper-tokens";
import { cn } from "@/lib/utils";

/**
 * Paper file + mode bar (2F8-0 / 1EO-0) — three-dot file menu, Animatron / Stop-motion pills.
 */
export function WorkflowBar({
  onSave,
  onOpen,
  onExport,
  onNew,
}: {
  onSave: () => void;
  onOpen: () => void;
  onExport: () => void;
  onNew?: () => void;
}) {
  const workflow = usePlayback((s) => s.workflow);
  const setWorkflow = usePlayback((s) => s.setWorkflow);
  const [fileOpen, setFileOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!fileOpen) return;
    function onDown(e: MouseEvent) {
      if (!menuRef.current?.contains(e.target as Node)) setFileOpen(false);
    }
    window.addEventListener("mousedown", onDown);
    return () => window.removeEventListener("mousedown", onDown);
  }, [fileOpen]);

  async function switchWorkflow(next: Workflow) {
    if (next === workflow) return;
    const ok = window.confirm(
      `Switch to ${next === "animatron" ? "Animatron" : "Stop-motion"}?\n\nSave this session first? (OK = Save & switch, Cancel = stay)`,
    );
    if (!ok) return;
    try {
      await saveLaoFile(useProject.getState().project);
    } catch {
      /* user may cancel save picker */
    }
    setWorkflow(next);
    useProject.getState().setProjectSettings({ workflow: next });
  }

  return (
    <div
      className="pointer-events-auto relative flex h-9 items-center gap-3 overflow-clip rounded-full py-1 pl-3 pr-1.5 antialiased"
      style={{
        backgroundColor: PAPER.surface,
        outline: `1px solid ${PAPER.outline}`,
        fontFamily: PAPER.fontSans,
      }}
    >
      <div ref={menuRef} className="relative flex w-[25px] shrink-0 flex-col items-center justify-center px-[3px] py-2.5">
        <button
          type="button"
          onClick={() => setFileOpen((o) => !o)}
          className="flex items-start gap-0.5 p-1"
          aria-label="File menu"
          aria-expanded={fileOpen}
        >
          <span className="size-1 rounded-full bg-[#DDDDDD]" />
          <span className="size-1 rounded-full bg-[#DDDDDD]" />
          <span className="size-1 rounded-full bg-[#DDDDDD]" />
        </button>
        {fileOpen && (
          <div
            className="absolute left-0 top-full z-50 mt-2 min-w-[140px] overflow-clip rounded-xl py-1 antialiased"
            style={{ backgroundColor: PAPER.surface, outline: `0.4px solid ${PAPER.outlineSubtle}` }}
          >
            {onNew && (
              <button
                type="button"
                className="block w-full px-3 py-1.5 text-left text-sm hover:bg-white/5"
                style={{ color: PAPER.text }}
                onClick={() => {
                  setFileOpen(false);
                  onNew();
                }}
              >
                New
              </button>
            )}
            <button
              type="button"
              className="block w-full px-3 py-1.5 text-left text-sm hover:bg-white/5"
              style={{ color: PAPER.text }}
              onClick={() => {
                setFileOpen(false);
                onSave();
              }}
            >
              Save
            </button>
            <button
              type="button"
              className="block w-full px-3 py-1.5 text-left text-sm hover:bg-white/5"
              style={{ color: PAPER.text }}
              onClick={() => {
                setFileOpen(false);
                onOpen();
              }}
            >
              Open
            </button>
            <button
              type="button"
              className="block w-full px-3 py-1.5 text-left text-sm hover:bg-white/5"
              style={{ color: PAPER.text }}
              onClick={() => {
                setFileOpen(false);
                onExport();
              }}
            >
              Export
            </button>
          </div>
        )}
      </div>

      <div className="flex items-start gap-1">
        <ModePill
          label="Animatron"
          active={workflow === "animatron"}
          onClick={() => void switchWorkflow("animatron")}
        />
        <ModePill
          label="Stop-motion"
          active={workflow === "stopmotion"}
          onClick={() => void switchWorkflow("stopmotion")}
        />
      </div>
    </div>
  );
}

function ModePill({
  label,
  active,
  onClick,
}: {
  label: string;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "flex h-6 w-[120px] shrink-0 items-center justify-center rounded-full",
        !active && "bg-transparent",
      )}
      style={
        active
          ? {
              backgroundImage: PAPER.modeActiveGradient,
              outline: `1px solid ${PAPER.modeActiveOutline}`,
            }
          : undefined
      }
    >
      <span
        className="text-sm leading-[18px] tracking-[0.02em]"
        style={{ color: PAPER.text, fontFamily: PAPER.fontSans }}
      >
        {label}
      </span>
    </button>
  );
}
