import { OverflowActions } from "@/components/motion/overflow-actions";
import { usePlayback, type Workflow } from "@/state/playback";
import { useProject } from "@/state/project";

export const FLOAT_BAR_H = 42;

/**
 * Top-left workflow chrome: Stop-motion / Animatron + File overflow
 * (Save / Load / Export) via @beui/overflow-actions.
 */
export function WorkflowBar({
  onSave,
  onOpen,
  onExport,
}: {
  onSave: () => void;
  onOpen: () => void;
  onExport: () => void;
}) {
  const workflow = usePlayback((s) => s.workflow);
  const setWorkflow = usePlayback((s) => s.setWorkflow);

  function switchWorkflow(next: Workflow) {
    setWorkflow(next);
    useProject.getState().setProjectSettings({ workflow: next });
  }

  return (
    <OverflowActions
      size="sm"
      className="h-[42px] min-h-[42px]"
      classNames={{
        track: "h-[42px] min-h-[42px] border-border/80 bg-card/95 shadow-2xl backdrop-blur-xl",
        toggle: "bg-primary text-primary-foreground",
      }}
      openLabel="File"
      closeLabel="Close file menu"
      collapseOnAction
      primaryActions={[
        {
          id: "stopmotion",
          label: "Stop-motion",
          active: workflow === "stopmotion",
          onClick: () => switchWorkflow("stopmotion"),
        },
        {
          id: "animatron",
          label: "Animatron",
          active: workflow === "animatron",
          onClick: () => switchWorkflow("animatron"),
        },
      ]}
      overflowActions={[
        { id: "save", label: "Save", onClick: onSave },
        { id: "load", label: "Load", onClick: onOpen },
        { id: "export", label: "Export", onClick: onExport },
      ]}
    />
  );
}
