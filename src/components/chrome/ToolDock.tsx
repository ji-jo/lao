import { Dock, DockItem, DockSeparator } from "@/components/motion/dock";
import { Tooltip } from "@/components/ui/tooltip";
import MousePointer2Icon from "@/components/ui/mouse-pointer-2-icon";
import { PenNib } from "reicon-react";
import LetterPIcon from "@/components/ui/letter-p-icon";
import PaintIcon from "@/components/ui/paint-icon";
import LetterEIcon from "@/components/ui/letter-e-icon";
import ArrowBackUpIcon from "@/components/ui/arrow-back-up-icon";
import HistoryCircleIcon from "@/components/ui/history-circle-icon";
import CopyIcon from "@/components/ui/copy-icon";
import KeyframesIcon from "@/components/ui/keyframes-icon";
import Stack3Icon from "@/components/ui/stack-3-icon";
import { useTools, type ToolId } from "@/state/tools";
import { useProject } from "@/state/project";
import { usePlayback } from "@/state/playback";

const TOOLS: { id: ToolId; label: string; key: string; icon: React.ReactNode }[] = [
  { id: "select", label: "Select", key: "V", icon: <MousePointer2Icon size={19} /> },
  { id: "ink", label: "Ink", key: "B", icon: <PenNib size={19} /> },
  { id: "pencil", label: "Pencil", key: "P", icon: <LetterPIcon size={19} /> },
  { id: "marker", label: "Marker", key: "M", icon: <PaintIcon size={19} /> },
  { id: "eraser", label: "Eraser", key: "E", icon: <LetterEIcon size={19} /> },
];

/**
 * Primary tool rail (@beui/dock) — sits above the timeline.
 * Frame actions live here too so the timeline stays about time, not tools.
 */
export function ToolDock() {
  const tool = useTools((s) => s.tool);
  const setTool = useTools((s) => s.setTool);
  const undo = useProject((s) => s.undo);
  const redo = useProject((s) => s.redo);
  const duplicateFrameForward = useProject((s) => s.duplicateFrameForward);
  const addKeyframe = useProject((s) => s.addKeyframe);
  const onionSkin = usePlayback((s) => s.onionSkin);
  const toggleOnionSkin = usePlayback((s) => s.toggleOnionSkin);
  const workflow = usePlayback((s) => s.workflow);
  const isAnimatron = workflow === "animatron";

  return (
    <Dock size={40} className="pointer-events-auto rounded-[22px] bg-card/95">
      {TOOLS.map((t) => (
        <Tooltip key={t.id} content={`${t.label} · ${t.key}`} side="top">
          <DockItem
            active={tool === t.id}
            onClick={() => setTool(t.id)}
            aria-label={t.label}
            className={tool === t.id ? "text-foreground" : "text-muted-foreground"}
          >
            {t.icon}
          </DockItem>
        </Tooltip>
      ))}

      {!isAnimatron && (
        <>
          <DockSeparator />
          <Tooltip content="Duplicate frame → next" side="top">
            <DockItem
              onClick={duplicateFrameForward}
              aria-label="Duplicate frame forward"
              className="text-muted-foreground"
            >
              <CopyIcon size={18} />
            </DockItem>
          </Tooltip>
          <Tooltip content="Empty cel — stop the held drawing here" side="top">
            <DockItem
              onClick={addKeyframe}
              aria-label="Empty cel"
              className="text-muted-foreground"
            >
              <KeyframesIcon size={18} />
            </DockItem>
          </Tooltip>
          <Tooltip content="Onion skin" side="top">
            <DockItem
              active={onionSkin}
              onClick={toggleOnionSkin}
              aria-label="Toggle onion skin"
              className={onionSkin ? "text-foreground" : "text-muted-foreground"}
            >
              <Stack3Icon size={18} />
            </DockItem>
          </Tooltip>
        </>
      )}

      <DockSeparator />
      <Tooltip content="Undo · Ctrl+Z" side="top">
        <DockItem onClick={undo} aria-label="Undo" className="text-muted-foreground">
          <ArrowBackUpIcon size={18} />
        </DockItem>
      </Tooltip>
      <Tooltip content="Redo · Ctrl+Shift+Z" side="top">
        <DockItem onClick={redo} aria-label="Redo" className="text-muted-foreground">
          <HistoryCircleIcon size={18} />
        </DockItem>
      </Tooltip>
    </Dock>
  );
}
