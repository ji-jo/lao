import { useEffect, useRef, useState } from "react";
import { ExpandableActionBar } from "@/components/motion/expandable-action-bar";
import { WorkflowBar, FLOAT_BAR_H } from "@/components/chrome/WorkflowBar";
import MousePointer2Icon from "@/components/ui/mouse-pointer-2-icon";
import PenIcon from "@/components/ui/pen-icon";
import PaintIcon from "@/components/ui/paint-icon";
import LetterEIcon from "@/components/ui/letter-e-icon";
import LetterPIcon from "@/components/ui/letter-p-icon";
import ArrowBackUpIcon from "@/components/ui/arrow-back-up-icon";
import HistoryCircleIcon from "@/components/ui/history-circle-icon";
import CameraIcon from "@/components/ui/camera-icon";
import { ExportDialog } from "@/components/panels/ExportDialog";
import { saveLaoFile, openLaoFile, parseLao } from "@/file/laoFile";
import { startAutosave, readAutosave, clearAutosave } from "@/file/autosave";
import type { Project } from "@/model/types";
import { StageCanvas } from "@/components/StageCanvas";
import { PreviewStage } from "@/components/PreviewStage";
import { InspectPanel } from "@/components/panels/InspectPanel";
import { Timeline } from "@/components/timeline/Timeline";
import { useTools, type ToolId } from "@/state/tools";
import { useProject } from "@/state/project";
import { usePlayback } from "@/state/playback";
import { useReference } from "@/state/reference";
import { useSelection } from "@/state/selection";
import { useViewport } from "@/state/viewport";
import { copyStrokes, readClipboard } from "@/state/clipboard";
import { resolveCel } from "@/model/types";
import { ShaderSnapshotMount } from "@/components/ShaderBackground";

const TOOL_ITEMS = [
  { id: "select", label: "Select", icon: <MousePointer2Icon size={14} />, shortcut: "V" },
  { id: "ink", label: "Ink", icon: <PenIcon size={14} />, shortcut: "B" },
  { id: "pencil", label: "Pencil", icon: <LetterPIcon size={14} />, shortcut: "P" },
  { id: "marker", label: "Marker", icon: <PaintIcon size={14} />, shortcut: "M" },
  { id: "eraser", label: "Eraser", icon: <LetterEIcon size={14} />, shortcut: "E" },
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
  const stage = usePlayback((s) => s.stage);
  const background = useProject((s) => s.project.background);
  const aspect = useProject((s) => s.project.width / s.project.height);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [exportOpen, setExportOpen] = useState(false);
  const [recovered, setRecovered] = useState<Project | null>(null);

  async function handleSave() {
    await saveLaoFile(useProject.getState().project);
  }
  async function handleOpen() {
    const project = await openLaoFile();
    if (project) useProject.getState().loadProject(project);
  }

  // autosave + crash recovery
  useEffect(() => {
    const stop = startAutosave();
    void readAutosave().then((saved) => {
      if (!saved?.project) return;
      const hasArt = saved.project.layers.some((l) =>
        l.frames.some((f) => f && f.strokes.length > 0),
      );
      const current = useProject.getState();
      const untouched = current.undoStack.length === 0 && current.redoStack.length === 0;
      if (hasArt && untouched) setRecovered(saved.project);
    });
    return stop;
  }, []);

  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      const target = e.target as HTMLElement;
      if (target.tagName === "INPUT" || target.tagName === "TEXTAREA" || target.isContentEditable)
        return;

      // zoom: Ctrl/Cmd + / - / = / 0
      if (e.ctrlKey || e.metaKey) {
        if (e.key === "+" || e.key === "=") {
          e.preventDefault();
          useViewport.getState().zoomIn();
          return;
        }
        if (e.key === "-" || e.key === "_") {
          e.preventDefault();
          useViewport.getState().zoomOut();
          return;
        }
        if (e.key === "0") {
          e.preventDefault();
          useViewport.getState().resetZoom();
          return;
        }
      }

      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "z") {
        e.preventDefault();
        if (e.shiftKey) redo();
        else undo();
        return;
      }
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "s") {
        e.preventDefault();
        void saveLaoFile(useProject.getState().project);
        return;
      }
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "o") {
        e.preventDefault();
        void openLaoFile().then((p) => p && useProject.getState().loadProject(p));
        return;
      }
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "a") {
        e.preventDefault();
        useSelection.getState().selectAll();
        useTools.getState().setTool("select");
        return;
      }
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "c") {
        const ids = useSelection.getState().ids;
        if (!ids.length) return;
        e.preventDefault();
        const ps = useProject.getState();
        const layer = ps.project.layers[ps.layerIndex];
        const cel = layer ? resolveCel(layer, ps.frameIndex) : null;
        if (cel) copyStrokes(cel.strokes.filter((s) => ids.includes(s.id)));
        return;
      }
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "v") {
        const strokes = readClipboard();
        if (!strokes.length) return;
        e.preventDefault();
        const newIds = useProject.getState().pasteStrokes(strokes);
        if (newIds.length) {
          useSelection.getState().set(newIds);
          useTools.getState().setTool("select");
        }
        return;
      }
      if (e.ctrlKey || e.metaKey || e.altKey) return;
      if (e.key === "Delete" || e.key === "Backspace") {
        const ids = useSelection.getState().ids;
        if (ids.length) {
          e.preventDefault();
          useProject.getState().deleteStrokes(ids);
          useSelection.getState().clear();
        }
        return;
      }
      const k = e.key.toLowerCase();
      if (k === "a") {
        useSelection.getState().selectAll();
        useTools.getState().setTool("select");
        return;
      }
      if (k === "d") {
        useSelection.getState().clear();
        return;
      }
      const t = SHORTCUTS[k];
      if (t) setTool(t);
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [setTool, undo, redo]);

  return (
    <div
      className="relative h-dvh w-dvw overflow-hidden bg-background text-foreground"
      onDragOver={(e) => e.preventDefault()}
      onDrop={(e) => {
        e.preventDefault();
        const file = e.dataTransfer.files?.[0];
        if (!file || !file.name.endsWith(".lao")) return;
        void file.text().then((text) => {
          useProject.getState().loadProject(parseLao(text));
        });
      }}
    >
      {stage === "draw" ? <StageCanvas /> : <PreviewStage />}

      {background?.kind === "shader" && (
        <ShaderSnapshotMount background={background} aspect={aspect} />
      )}

      {/* top-left: workflow / File */}
      <div className="absolute left-4 top-4 z-20">
        <WorkflowBar
          onSave={() => void handleSave()}
          onOpen={() => void handleOpen()}
          onExport={() => setExportOpen(true)}
        />
      </div>

      {/* top-center: tools */}
      {stage === "draw" && (
        <div
          className="absolute left-1/2 top-4 z-20 flex -translate-x-1/2 items-center"
          style={{ height: FLOAT_BAR_H }}
        >
          <ExpandableActionBar
            size="sm"
            items={TOOL_ITEMS}
            activeId={tool}
            onAction={(item) => setTool(item.id as ToolId)}
            className="!min-h-[42px] h-[42px]"
          />
        </div>
      )}

      {stage === "preview" && (
        <div className="absolute left-1/2 top-4 z-20 -translate-x-1/2">
          <ExpandableActionBar
            size="sm"
            items={[
              {
                id: "reference",
                label: "Reference",
                icon: <CameraIcon size={14} />,
                onClick: () => fileInputRef.current?.click(),
              },
            ]}
            className="!min-h-[42px] h-[42px]"
          />
        </div>
      )}
      <input
        ref={fileInputRef}
        type="file"
        accept="image/*,video/*"
        className="hidden"
        onChange={(e) => {
          const file = e.target.files?.[0];
          if (file) useReference.getState().setReference(file);
          e.target.value = "";
        }}
      />

      {stage === "draw" && (
        <div className="absolute right-4 top-4">
          <ExpandableActionBar
            size="sm"
            items={[
              {
                id: "undo",
                label: "Undo",
                icon: <ArrowBackUpIcon size={14} />,
                shortcut: "Ctrl+Z",
                onClick: undo,
              },
              {
                id: "redo",
                label: "Redo",
                icon: <HistoryCircleIcon size={14} />,
                shortcut: "Ctrl+Shift+Z",
                onClick: redo,
              },
            ]}
            className="!min-h-[42px] h-[42px]"
          />
        </div>
      )}

      {/* Settings: mid-center-right, expands left */}
      {stage === "draw" && (
        <div className="absolute right-4 top-1/2 z-20 -translate-y-1/2">
          <InspectPanel />
        </div>
      )}

      <div className="pointer-events-none absolute bottom-4 left-1/2 flex -translate-x-1/2 justify-center">
        <Timeline />
      </div>

      {recovered && (
        <div className="absolute left-1/2 top-16 z-30 flex -translate-x-1/2 items-center gap-3 rounded-2xl border border-border bg-card/95 px-4 py-2.5 text-sm shadow-2xl backdrop-blur-xl">
          <span className="text-muted-foreground">Recovered an unsaved session.</span>
          <button
            type="button"
            className="font-semibold text-foreground hover:underline"
            onClick={() => {
              useProject.getState().loadProject(recovered);
              setRecovered(null);
            }}
          >
            Restore
          </button>
          <button
            type="button"
            className="text-muted-foreground hover:text-foreground"
            onClick={() => {
              void clearAutosave();
              setRecovered(null);
            }}
          >
            Discard
          </button>
        </div>
      )}

      <ExportDialog open={exportOpen} onOpenChange={setExportOpen} />
    </div>
  );
}
