import { ExpandableTabs } from "@/components/motion/expandable-tabs";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import KeyframesIcon from "@/components/ui/keyframes-icon";
import LibraryIcon from "@/components/ui/library-icon";
import SaveIcon from "@/components/ui/save-icon";
import UploadIcon from "@/components/ui/upload-icon";
import DownloadIcon from "@/components/ui/download-icon";
import PenIcon from "@/components/ui/pen-icon";
import PlayerIcon from "@/components/ui/player-icon";
import { usePlayback, type Workflow, type StageView } from "@/state/playback";
import { useProject } from "@/state/project";

function Row({
  active,
  title,
  hint,
  onClick,
  icon,
}: {
  active?: boolean;
  title: string;
  hint: string;
  onClick: () => void;
  icon?: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "flex w-full items-start gap-2.5 rounded-xl border border-transparent px-2.5 py-2 text-left transition-colors hover:bg-primary/5",
        active && "border-primary/40 bg-primary/10",
      )}
    >
      {icon && <span className="mt-0.5 text-muted-foreground">{icon}</span>}
      <span className="flex flex-col">
        <span className="text-[12px] font-medium text-foreground">{title}</span>
        <span className="text-[11px] leading-snug text-muted-foreground">{hint}</span>
      </span>
    </button>
  );
}

/**
 * Top-left workspace switcher (@beui/expandable-tabs):
 * Mode = workflow + stage, File = save / open / export.
 */
export function WorkspaceTabs({
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
  const stage = usePlayback((s) => s.stage);
  const setStage = usePlayback((s) => s.setStage);

  function switchWorkflow(next: Workflow) {
    setWorkflow(next);
    useProject.getState().setProjectSettings({ workflow: next });
  }

  const stages: { id: StageView; label: string; hint: string; icon: React.ReactNode }[] = [
    { id: "draw", label: "Draw", hint: "Edit canvas, fast draft rendering", icon: <PenIcon size={15} /> },
    { id: "preview", label: "Preview", hint: "Full quality playback with boil", icon: <PlayerIcon size={15} /> },
  ];

  return (
    <ExpandableTabs
      classNames={{
        bar: "h-[42px] min-h-[42px] border-border/70 bg-card/95 shadow-2xl backdrop-blur-xl",
        panel: "w-[268px] border-border/70 bg-card/95 shadow-2xl backdrop-blur-xl",
      }}
      items={[
        {
          id: "mode",
          label: workflow === "animatron" ? "Animatron" : "Stop Motion",
          icon: <KeyframesIcon size={16} />,
          content: (
            <div className="flex flex-col gap-3 p-2">
              <div className="flex flex-col gap-1">
                <span className="px-1 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                  Workflow
                </span>
                <Row
                  active={workflow === "stopmotion"}
                  title="Stop Motion"
                  hint="Frame-by-frame cels, onion skin, holds"
                  onClick={() => switchWorkflow("stopmotion")}
                />
                <Row
                  active={workflow === "animatron"}
                  title="Animatron"
                  hint="One frame, each path becomes a timed clip"
                  onClick={() => switchWorkflow("animatron")}
                />
              </div>
              <div className="flex flex-col gap-1 border-t border-border/60 pt-2">
                <span className="px-1 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                  Stage
                </span>
                {stages.map((s) => (
                  <Row
                    key={s.id}
                    active={stage === s.id}
                    title={s.label}
                    hint={s.hint}
                    icon={s.icon}
                    onClick={() => setStage(s.id)}
                  />
                ))}
              </div>
            </div>
          ),
        },
        {
          id: "file",
          label: "File",
          icon: <LibraryIcon size={16} />,
          content: (
            <div className="flex flex-col gap-1.5 p-2">
              <Button
                type="button"
                variant="secondary"
                size="sm"
                className="w-full justify-start"
                leadingIcon={SaveIcon}
                onClick={onSave}
              >
                Save .lao
              </Button>
              <Button
                type="button"
                variant="secondary"
                size="sm"
                className="w-full justify-start"
                leadingIcon={UploadIcon}
                onClick={onOpen}
              >
                Open…
              </Button>
              <Button
                type="button"
                variant="primary"
                size="sm"
                className="w-full justify-start"
                leadingIcon={DownloadIcon}
                onClick={onExport}
              >
                Export video
              </Button>
              <p className="px-1 pt-1 text-[10px] leading-snug text-muted-foreground">
                Ctrl+S save · Ctrl+O open · Ctrl+K commands
              </p>
            </div>
          ),
        },
      ]}
    />
  );
}
