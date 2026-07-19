import { ExpandableActionBar } from "@/components/motion/expandable-action-bar";
import MousePointer2Icon from "@/components/ui/mouse-pointer-2-icon";
import PenIcon from "@/components/ui/pen-icon";
import PaintIcon from "@/components/ui/paint-icon";
import LetterEIcon from "@/components/ui/letter-e-icon";
import { useTools, type ToolId } from "@/state/tools";

const TOOL_ITEMS = [
  { id: "select", label: "Select", icon: <MousePointer2Icon size={16} />, shortcut: "V" },
  { id: "ink", label: "Ink", icon: <PenIcon size={16} />, shortcut: "B" },
  { id: "marker", label: "Marker", icon: <PaintIcon size={16} />, shortcut: "M" },
  { id: "eraser", label: "Eraser", icon: <LetterEIcon size={16} />, shortcut: "E" },
];

export default function App() {
  const tool = useTools((s) => s.tool);
  const setTool = useTools((s) => s.setTool);

  return (
    <div className="relative h-dvh w-dvw overflow-hidden bg-background text-foreground">
      {/* stage placeholder — becomes the drawing canvas in M2 */}
      <div className="absolute inset-0 grid place-items-center">
        <div className="text-sm text-muted-foreground select-none">
          lao — draw &amp; animate (canvas coming next)
        </div>
      </div>

      {/* floating tool bar */}
      <div className="absolute left-1/2 top-4 -translate-x-1/2">
        <ExpandableActionBar
          items={TOOL_ITEMS}
          activeId={tool}
          onAction={(item) => setTool(item.id as ToolId)}
        />
      </div>
    </div>
  );
}
