import { useCallback, useEffect, useRef, useState } from "react";
import { StageCanvas } from "@/components/StageCanvas";
import { PreviewStage } from "@/components/PreviewStage";
import { ShaderSnapshotMount } from "@/components/ShaderBackground";
import { Timeline } from "@/components/timeline/Timeline";
import { ExportDialog } from "@/components/panels/ExportDialog";
import { WorkspaceTabs } from "@/components/chrome/WorkspaceTabs";
import { StatusIsland } from "@/components/chrome/StatusIsland";
import { ToolDock } from "@/components/chrome/ToolDock";
import { CommandBar } from "@/components/chrome/CommandBar";
import { Toasts } from "@/components/chrome/Toasts";
import { Tooltip } from "@/components/ui/tooltip";
import CameraIcon from "@/components/ui/camera-icon";
import { saveLaoFile, openLaoFile, parseLao } from "@/file/laoFile";
import { startAutosave, readAutosave, clearAutosave } from "@/file/autosave";
import { notify } from "@/state/toasts";
import { useTools, type ToolId } from "@/state/tools";
import { useProject } from "@/state/project";
import { usePlayback } from "@/state/playback";
import { useReference } from "@/state/reference";
import { useSelection } from "@/state/selection";
import { useViewport } from "@/state/viewport";
import { copyStrokes, readClipboard } from "@/state/clipboard";
import { resolveCel } from "@/model/types";

const SHORTCUTS: Record<string, ToolId> = {
  v: "select",
  b: "ink",
  p: "pencil",
  m: "marker",
  e: "eraser",
};

export default function App() {
  const setTool = useTools((s) => s.setTool);
  const undo = useProject((s) => s.undo);
  const redo = useProject((s) => s.redo);
  const stage = usePlayback((s) => s.stage);
  const background = useProject((s) => s.project.background);
  const aspect = useProject((s) => s.project.width / s.project.height);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [exportOpen, setExportOpen] = useState(false);

  const handleSave = useCallback(async () => {
    try {
      const saved = await saveLaoFile(useProject.getState().project);
      if (saved) notify.success("Project saved", "Written as a .lao file");
    } catch (err) {
      notify.error("Save failed", err instanceof Error ? err.message : String(err));
    }
  }, []);

  const handleOpen = useCallback(async () => {
    try {
      const project = await openLaoFile();
      if (project) {
        useProject.getState().loadProject(project);
        notify.success("Project opened", project.name || "untitled");
      }
    } catch (err) {
      notify.error("Could not open file", err instanceof Error ? err.message : String(err));
    }
  }, []);

  const handleExport = useCallback(() => setExportOpen(true), []);

  // autosave + crash recovery (recovery offered as a toast action)
  useEffect(() => {
    const stop = startAutosave();
    void readAutosave().then((saved) => {
      if (!saved?.project) return;
      const hasArt = saved.project.layers.some((l) =>
        l.frames.some((f) => f && f.strokes.length > 0),
      );
      const current = useProject.getState();
      const untouched = current.undoStack.length === 0 && current.redoStack.length === 0;
      if (!hasArt || !untouched) return;
      notify.info("Recovered an unsaved session");
      // separate toast carries the action so it stays until answered
      import("@/state/toasts").then(({ toast }) =>
        toast({
          title: "Restore previous work?",
          description: saved.project.name || "untitled",
          status: "info",
          duration: 20000,
          action: {
            label: "Restore",
            onClick: () => useProject.getState().loadProject(saved.project),
          },
        }),
      );
      void clearAutosave;
    });
    return stop;
  }, []);

  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      const target = e.target as HTMLElement;
      if (target.tagName === "INPUT" || target.tagName === "TEXTAREA" || target.isContentEditable)
        return;

      if (e.ctrlKey || e.metaKey) {
        const k = e.key.toLowerCase();
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
        if (k === "z") {
          e.preventDefault();
          if (e.shiftKey) redo();
          else undo();
          return;
        }
        if (k === "s") {
          e.preventDefault();
          void handleSave();
          return;
        }
        if (k === "o") {
          e.preventDefault();
          void handleOpen();
          return;
        }
        if (k === "a") {
          e.preventDefault();
          useSelection.getState().selectAll();
          useTools.getState().setTool("select");
          return;
        }
        if (k === "c") {
          const ids = useSelection.getState().ids;
          if (!ids.length) return;
          e.preventDefault();
          const ps = useProject.getState();
          const layer = ps.project.layers[ps.layerIndex];
          const cel = layer ? resolveCel(layer, ps.frameIndex) : null;
          if (cel) copyStrokes(cel.strokes.filter((s) => ids.includes(s.id)));
          return;
        }
        if (k === "v") {
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
        return;
      }

      if (e.altKey) return;
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
  }, [setTool, undo, redo, handleSave, handleOpen]);

  return (
    <div
      className="relative h-dvh w-dvw overflow-hidden bg-background text-foreground"
      onDragOver={(e) => e.preventDefault()}
      onDrop={(e) => {
        e.preventDefault();
        const file = e.dataTransfer.files?.[0];
        if (!file || !file.name.endsWith(".lao")) return;
        void file.text().then((text) => {
          try {
            useProject.getState().loadProject(parseLao(text));
            notify.success("Project opened", file.name);
          } catch (err) {
            notify.error("Not a valid .lao file", err instanceof Error ? err.message : undefined);
          }
        });
      }}
    >
      {stage === "draw" ? <StageCanvas /> : <PreviewStage />}

      {background?.kind === "shader" && (
        <ShaderSnapshotMount background={background} aspect={aspect} />
      )}

      {/* top-left: workspace + file */}
      <div className="absolute left-4 top-4 z-30">
        <WorkspaceTabs onSave={handleSave} onOpen={handleOpen} onExport={handleExport} />
      </div>

      {/* top-center: status island (settings live inside) */}
      <div className="pointer-events-none absolute inset-x-0 top-4 z-20 flex justify-center">
        <div className="pointer-events-auto">
          <StatusIsland />
        </div>
      </div>

      {/* top-right: reference (preview) + command hint */}
      <div className="absolute right-4 top-4 z-20 flex items-center gap-2">
        {stage === "preview" && (
          <Tooltip content="Attach reference image or video" side="bottom">
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              aria-label="Attach reference"
              className="grid h-[42px] w-[42px] place-items-center rounded-full border border-border/70 bg-card/95 text-muted-foreground shadow-2xl backdrop-blur-xl transition-colors hover:text-foreground"
            >
              <CameraIcon size={17} />
            </button>
          </Tooltip>
        )}
        <Tooltip content="Command palette" side="bottom">
          <button
            type="button"
            onClick={() =>
              window.dispatchEvent(
                new KeyboardEvent("keydown", { key: "k", ctrlKey: true, bubbles: true }),
              )
            }
            className="flex h-[42px] items-center gap-1.5 rounded-full border border-border/70 bg-card/95 px-3.5 font-mono text-[11px] text-muted-foreground shadow-2xl backdrop-blur-xl transition-colors hover:text-foreground"
          >
            <span className="text-[13px]">⌘</span>K
          </button>
        </Tooltip>
      </div>

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

      {/* bottom stack: tool dock above the timeline */}
      <div className="pointer-events-none absolute inset-x-0 bottom-4 z-20 flex flex-col items-center gap-3">
        {stage === "draw" && <ToolDock />}
        <div className="pointer-events-auto max-w-[calc(100vw-2rem)]">
          <Timeline />
        </div>
      </div>

      <CommandBar onSave={handleSave} onOpen={handleOpen} onExport={handleExport} />
      <ExportDialog open={exportOpen} onOpenChange={setExportOpen} />
      <Toasts />
    </div>
  );
}
