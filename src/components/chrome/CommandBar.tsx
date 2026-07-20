import { useMemo } from "react";
import {
  CommandPalette,
  type CommandItem,
} from "@/components/motion/command-palette";
import { useTools, type ToolId } from "@/state/tools";
import { useProject } from "@/state/project";
import { usePlayback } from "@/state/playback";
import { useSelection } from "@/state/selection";
import { useViewport } from "@/state/viewport";
import { copyStrokes, readClipboard } from "@/state/clipboard";
import { resolveCel, type Background } from "@/model/types";

const TOOL_LIST: { id: ToolId; label: string; key: string }[] = [
  { id: "select", label: "Select", key: "V" },
  { id: "ink", label: "Ink brush", key: "B" },
  { id: "pencil", label: "Pencil", key: "P" },
  { id: "marker", label: "Marker", key: "M" },
  { id: "eraser", label: "Eraser", key: "E" },
];

const BACKGROUNDS: { label: string; bg: Background }[] = [
  { label: "None", bg: { kind: "none" } },
  { label: "Solid color", bg: { kind: "color", color: "#1b1b22" } },
  {
    label: "Gradient",
    bg: { kind: "gradient", shape: "linear", from: "#232355", to: "#0b0b0d", angle: 135 },
  },
  {
    label: "Shader — mesh",
    bg: { kind: "shader", preset: "mesh", colors: ["#5227ff", "#26ffe4", "#ff9f45"], speed: 0.6 },
  },
];

/** Ctrl+K command palette (@beui/command-palette) covering every action. */
export function CommandBar({
  onSave,
  onOpen,
  onExport,
}: {
  onSave: () => void;
  onOpen: () => void;
  onExport: () => void;
}) {
  const items = useMemo<CommandItem[]>(() => {
    const project = () => useProject.getState();
    const list: CommandItem[] = [];

    for (const t of TOOL_LIST) {
      list.push({
        id: `tool-${t.id}`,
        label: t.label,
        group: "Tools",
        hint: t.key,
        keywords: ["tool", "brush", t.id],
        onSelect: () => useTools.getState().setTool(t.id),
      });
    }

    list.push(
      {
        id: "frame-next",
        label: "Next frame",
        group: "Frames",
        hint: ".",
        onSelect: () => project().stepFrame(1),
      },
      {
        id: "frame-prev",
        label: "Previous frame",
        group: "Frames",
        hint: ",",
        onSelect: () => project().stepFrame(-1),
      },
      {
        id: "frame-dup",
        label: "Duplicate frame forward",
        group: "Frames",
        keywords: ["copy", "flip"],
        onSelect: () => project().duplicateFrameForward(),
      },
      {
        id: "frame-empty",
        label: "Insert empty cel",
        group: "Frames",
        keywords: ["blank", "keyframe"],
        onSelect: () => project().addKeyframe(),
      },
      {
        id: "frame-add-12",
        label: "Add 12 frames",
        group: "Frames",
        onSelect: () => project().extendTimeline(12),
      },
      {
        id: "layer-add",
        label: "Add layer",
        group: "Frames",
        onSelect: () => project().addLayer(),
      },
    );

    list.push(
      {
        id: "play",
        label: "Play / pause",
        group: "Playback",
        hint: "Enter",
        onSelect: () => usePlayback.getState().togglePlaying(),
      },
      {
        id: "onion",
        label: "Toggle onion skin",
        group: "Playback",
        onSelect: () => usePlayback.getState().toggleOnionSkin(),
      },
      {
        id: "stage-draw",
        label: "Go to Draw stage",
        group: "Playback",
        onSelect: () => usePlayback.getState().setStage("draw"),
      },
      {
        id: "stage-preview",
        label: "Go to Preview stage",
        group: "Playback",
        onSelect: () => usePlayback.getState().setStage("preview"),
      },
      {
        id: "workflow-stop",
        label: "Switch to Stop Motion",
        group: "Playback",
        onSelect: () => {
          usePlayback.getState().setWorkflow("stopmotion");
          project().setProjectSettings({ workflow: "stopmotion" });
        },
      },
      {
        id: "workflow-animatron",
        label: "Switch to Animatron",
        group: "Playback",
        onSelect: () => {
          usePlayback.getState().setWorkflow("animatron");
          project().setProjectSettings({ workflow: "animatron" });
        },
      },
    );

    list.push(
      {
        id: "select-all",
        label: "Select all strokes",
        group: "Edit",
        hint: "A",
        onSelect: () => {
          useSelection.getState().selectAll();
          useTools.getState().setTool("select");
        },
      },
      {
        id: "deselect",
        label: "Deselect",
        group: "Edit",
        hint: "D",
        onSelect: () => useSelection.getState().clear(),
      },
      {
        id: "delete-sel",
        label: "Delete selection",
        group: "Edit",
        hint: "Del",
        onSelect: () => {
          const ids = useSelection.getState().ids;
          if (!ids.length) return;
          project().deleteStrokes(ids);
          useSelection.getState().clear();
        },
      },
      {
        id: "copy",
        label: "Copy selection",
        group: "Edit",
        hint: "Ctrl+C",
        onSelect: () => {
          const ids = useSelection.getState().ids;
          const ps = project();
          const layer = ps.project.layers[ps.layerIndex];
          const cel = layer ? resolveCel(layer, ps.frameIndex) : null;
          if (cel) copyStrokes(cel.strokes.filter((s) => ids.includes(s.id)));
        },
      },
      {
        id: "paste",
        label: "Paste strokes",
        group: "Edit",
        hint: "Ctrl+V",
        onSelect: () => {
          const strokes = readClipboard();
          if (!strokes.length) return;
          const ids = project().pasteStrokes(strokes);
          if (ids.length) useSelection.getState().set(ids);
        },
      },
      {
        id: "undo",
        label: "Undo",
        group: "Edit",
        hint: "Ctrl+Z",
        onSelect: () => project().undo(),
      },
      {
        id: "redo",
        label: "Redo",
        group: "Edit",
        hint: "Ctrl+Shift+Z",
        onSelect: () => project().redo(),
      },
    );

    for (const b of BACKGROUNDS) {
      list.push({
        id: `bg-${b.label}`,
        label: `Background: ${b.label}`,
        group: "Canvas",
        keywords: ["background", "backdrop"],
        onSelect: () => project().setProjectSettings({ background: b.bg }),
      });
    }

    list.push(
      {
        id: "zoom-in",
        label: "Zoom in",
        group: "Canvas",
        hint: "Ctrl +",
        onSelect: () => useViewport.getState().zoomIn(),
      },
      {
        id: "zoom-out",
        label: "Zoom out",
        group: "Canvas",
        hint: "Ctrl -",
        onSelect: () => useViewport.getState().zoomOut(),
      },
      {
        id: "zoom-reset",
        label: "Reset zoom",
        group: "Canvas",
        hint: "Ctrl 0",
        onSelect: () => useViewport.getState().resetZoom(),
      },
    );

    list.push(
      { id: "save", label: "Save .lao", group: "File", hint: "Ctrl+S", onSelect: onSave },
      { id: "open", label: "Open .lao", group: "File", hint: "Ctrl+O", onSelect: onOpen },
      { id: "export", label: "Export video", group: "File", onSelect: onExport },
    );

    return list;
  }, [onSave, onOpen, onExport]);

  return (
    <CommandPalette
      items={items}
      shortcut="mod+k"
      placeholder="Search commands…"
      emptyMessage="No matching command"
    />
  );
}
