import { useState, useRef, useEffect } from "react";
import { motion, useReducedMotion } from "motion/react";
import { usePlayback, type Workflow } from "@/state/playback";
import { useProject } from "@/state/project";
import { saveLaoFile } from "@/file/laoFile";
import { PAPER } from "@/components/chrome/paper-tokens";
import { SaveFirstDialog } from "@/components/panels/SaveFirstDialog";
import { EASE_OUT } from "@/lib/ease";
import { toastError, toastSaved } from "@/lib/laoToast";
import EllipsisIcon from "@/components/ui/ellipsis-icon";
import EllipsisCloseIcon from "@/components/ui/ellipsis-close-icon";

/**
 * Paper file + mode bar — collapsed `2F8-0`, expanded `106-0`, pill hover `103-0`.
 *
 * The file menu is **not** a dropdown: the bar itself grows sideways and the
 * actions appear inline as pills, ellipsis ↔ close (Paper 106-0).
 *
 * The growth animates `width: 0 ↔ "auto"` via motion, which measures the content
 * to resolve `auto`. The pure-CSS `grid-template-columns: 0fr → 1fr` trick does
 * NOT work here: that relies on `fr` distributing free space, and this bar is
 * shrink-to-fit inside a flex row, so `1fr` resolves to 0 and the bar never
 * grows (it works for auto-height rows, not shrink-to-fit columns).
 *
 * Paper puts a uniform 4px between every pill, so the collapsible group carries
 * its own trailing 4px (`pr-1`) instead of the row using `gap` — a row `gap`
 * would survive the collapse and leave a stray 4px when closed.
 */

/** bar grow/shrink, seconds (motion) */
const EXPAND_S = 0.26;

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
  const [pendingWorkflow, setPendingWorkflow] = useState<Workflow | null>(null);
  const barRef = useRef<HTMLDivElement>(null);
  const reduce = useReducedMotion() ?? false;

  // pointer-down outside the whole bar closes it (the actions live inline now,
  // so the old ellipsis-only ref would have closed on its own pills)
  useEffect(() => {
    if (!fileOpen) return;
    function onDown(e: MouseEvent) {
      if (!barRef.current?.contains(e.target as Node)) setFileOpen(false);
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") setFileOpen(false);
    }
    window.addEventListener("mousedown", onDown);
    window.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener("mousedown", onDown);
      window.removeEventListener("keydown", onKey);
    };
  }, [fileOpen]);

  function requestSwitch(next: Workflow) {
    if (next === workflow) return;
    setPendingWorkflow(next);
  }

  function applySwitch(next: Workflow) {
    setWorkflow(next);
    useProject.getState().setProjectSettings({ workflow: next });
  }

  function runAction(fn: () => void) {
    setFileOpen(false);
    fn();
  }

  return (
    <>
    <div
      ref={barRef}
      data-lao-workflow-bar=""
      className="pointer-events-auto relative flex h-9 items-center gap-3 overflow-clip rounded-full py-1 pl-3 pr-1.5 antialiased"
      style={{
        backgroundColor: PAPER.surface,
        outline: `1px solid ${PAPER.outline}`,
        fontFamily: PAPER.fontSans,
      }}
    >
      {/* ellipsis ↔ close — Paper 106-0 (25×24 box, #D9D9D9 dots) */}
      <button
        type="button"
        onClick={() => setFileOpen((o) => !o)}
        aria-label={fileOpen ? "Close file menu" : "File menu"}
        aria-expanded={fileOpen}
        className="grid h-6 w-[25px] shrink-0 cursor-pointer place-items-center rounded-full transition-colors duration-150"
        style={{ color: PAPER.ellipsisIcon }}
        onPointerEnter={(e) => {
          e.currentTarget.style.backgroundColor = PAPER.pillHover;
        }}
        onPointerLeave={(e) => {
          e.currentTarget.style.backgroundColor = "transparent";
        }}
      >
        {fileOpen ? <EllipsisCloseIcon size={20} /> : <EllipsisIcon size={20} />}
      </button>

      <div className="flex items-start">
        {/* collapsible file actions — width 0 ↔ auto grows the bar itself */}
        <motion.div
          className="overflow-hidden"
          initial={false}
          animate={{ width: fileOpen ? "auto" : 0 }}
          transition={reduce ? { duration: 0 } : { duration: EXPAND_S, ease: EASE_OUT }}
          aria-hidden={!fileOpen}
        >
          {/* w-max keeps the pills on one line while the parent width animates */}
          <div className="flex w-max items-start gap-1 pr-1">
            <FilePill label="Open" open={fileOpen} onClick={() => runAction(onOpen)} />
            {onNew && (
              <FilePill label="New" open={fileOpen} onClick={() => runAction(onNew)} />
            )}
            <FilePill label="Save" open={fileOpen} onClick={() => runAction(onSave)} />
            <FilePill label="Export" open={fileOpen} onClick={() => runAction(onExport)} />
          </div>
        </motion.div>

        <div className="flex items-start gap-1">
          <ModePill
            label="Animatron"
            active={workflow === "animatron"}
            onClick={() => requestSwitch("animatron")}
          />
          <ModePill
            label="Stop-motion"
            active={workflow === "stopmotion"}
            onClick={() => requestSwitch("stopmotion")}
          />
        </div>
      </div>
    </div>

    <SaveFirstDialog
      open={pendingWorkflow !== null}
      onOpenChange={(open) => {
        if (!open) setPendingWorkflow(null);
      }}
      alert="Alert: Switching modes without saving will delete the progress of your current session."
      skipLabel="No, Switch"
      confirmLabel="Yes, Save First"
      onSkip={() => {
        if (pendingWorkflow) applySwitch(pendingWorkflow);
        setPendingWorkflow(null);
      }}
      onConfirm={async () => {
        try {
          const project = useProject.getState().project;
          const ok = await saveLaoFile(project);
          if (!ok) return false;
          toastSaved(project.name || "untitled");
          if (pendingWorkflow) applySwitch(pendingWorkflow);
          setPendingWorkflow(null);
          return true;
        } catch (err) {
          toastError("Couldn’t save file", err);
          return false;
        }
      }}
    />
    </>
  );
}

/** Shared pill label — Paper: 14px/18px, 0.02em, #DEDEDE. */
function PillLabel({ children }: { children: string }) {
  return (
    <span
      className="whitespace-nowrap text-sm leading-[18px] tracking-[0.02em]"
      style={{ color: PAPER.text, fontFamily: PAPER.fontSans }}
    >
      {children}
    </span>
  );
}

/** File action pill — Paper 106-0: 24px tall, 12px inline padding, hover #252525. */
function FilePill({
  label,
  open,
  onClick,
}: {
  label: string;
  open: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      // collapsed pills stay in the DOM for the width transition, so keep them
      // off the tab order and out of the a11y tree until the bar is open
      tabIndex={open ? 0 : -1}
      className="flex h-6 shrink-0 cursor-pointer items-center justify-center rounded-full px-3 transition-colors duration-150"
      onPointerEnter={(e) => {
        e.currentTarget.style.backgroundColor = PAPER.pillHover;
      }}
      onPointerLeave={(e) => {
        e.currentTarget.style.backgroundColor = "transparent";
      }}
    >
      <PillLabel>{label}</PillLabel>
    </button>
  );
}

/** Workflow pill — Paper 103-0: 120×24, hover #252525; active keeps its gradient. */
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
      aria-pressed={active}
      className="flex h-6 w-[120px] shrink-0 cursor-pointer items-center justify-center rounded-full transition-colors duration-150"
      style={
        active
          ? {
              backgroundImage: PAPER.modeActiveGradient,
              outline: `1px solid ${PAPER.modeActiveOutline}`,
            }
          : { backgroundColor: "transparent" }
      }
      // the active pill keeps its gradient — #252525 is the *inactive* hover
      onPointerEnter={(e) => {
        if (!active) e.currentTarget.style.backgroundColor = PAPER.pillHover;
      }}
      onPointerLeave={(e) => {
        if (!active) e.currentTarget.style.backgroundColor = "transparent";
      }}
    >
      <PillLabel>{label}</PillLabel>
    </button>
  );
}
