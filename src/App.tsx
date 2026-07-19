import { useEffect } from "react";
import { ExpandableActionBar } from "@/components/motion/expandable-action-bar";
import MousePointer2Icon from "@/components/ui/mouse-pointer-2-icon";
import PenIcon from "@/components/ui/pen-icon";
import PaintIcon from "@/components/ui/paint-icon";
import LetterEIcon from "@/components/ui/letter-e-icon";
import LetterPIcon from "@/components/ui/letter-p-icon";
import ArrowBackUpIcon from "@/components/ui/arrow-back-up-icon";
import HistoryCircleIcon from "@/components/ui/history-circle-icon";
import { StageCanvas } from "@/components/StageCanvas";
import { InspectPanel } from "@/components/panels/InspectPanel";
import { useTools, type ToolId } from "@/state/tools";
import { useProject } from "@/state/project";

const TOOL_ITEMS = [
  { id: "select", label: "Select", icon: <MousePointer2Icon size={16} />, shortcut: "V" },
  { id: "ink", label: "Ink", icon: <PenIcon size={16} />, shortcut: "B" },
  { id: "pencil", label: "Pencil", icon: <LetterPIcon size={16} />, shortcut: "P" },
  { id: "marker", label: "Marker", icon: <PaintIcon size={16} />, shortcut: "M" },
  { id: "eraser", label: "Eraser", icon: <LetterEIcon size={16} />, shortcut: "E" },
];

const SHORTCUTS: Record<string, ToolId> = {
  v: "select",
  b: "ink",
  p: "pencil",
  m: "marker",
  e: "eraser",
};

export default function App() {
  const tool = useTools((s) => s.tool);
  const setTool = useTools((s) => s.setTool);
  const undo = useProject((s) => s.undo);
  const redo = useProject((s) => s.redo);

  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      const target = e.target as HTMLElement;
      if (target.tagName === "INPUT" || target.tagName === "TEXTAREA" || target.isContentEditable)
        return;
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "z") {
        e.preventDefault();
        if (e.shiftKey) redo();
        else undo();
        return;
      }
      const t = SHORTCUTS[e.key.toLowerCase()];
      if (t && !e.ctrlKey && !e.metaKey && !e.altKey) setTool(t);
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [setTool, undo, redo]);

  return (
    <div className="relative h-dvh w-dvw overflow-hidden bg-background text-foreground">
      <StageCanvas />

      {/* floating tool bar */}
      <div className="absolute left-1/2 top-4 -translate-x-1/2">
        <ExpandableActionBar
          items={TOOL_ITEMS}
          activeId={tool}
          onAction={(item) => setTool(item.id as ToolId)}
        />
      </div>

      {/* floating history bar */}
      <div className="absolute right-4 top-4">
        <ExpandableActionBar
          size="sm"
          items={[
            { id: "undo", label: "Undo", icon: <ArrowBackUpIcon size={14} />, shortcut: "Ctrl+Z", onClick: undo },
            { id: "redo", label: "Redo", icon: <HistoryCircleIcon size={14} />, shortcut: "Ctrl+Shift+Z", onClick: redo },
          ]}
        />
      </div>

      {/* floating inspect panel */}
      <div className="absolute right-4 top-1/2 -translate-y-1/2">
        <InspectPanel />
      </div>
    </div>
  );
}
