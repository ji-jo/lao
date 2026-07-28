import { useEffect, useRef, useState } from "react";
import { ExpandableActionBar } from "@/components/motion/expandable-action-bar";
import { WorkflowBar } from "@/components/chrome/WorkflowBar";
import CameraIcon from "@/components/ui/camera-icon";
import { ExportDialog } from "@/components/panels/ExportDialog";
import { saveLaoFile, openLaoFile, parseLao } from "@/file/laoFile";
import { startAutosave, readAutosave, clearAutosave } from "@/file/autosave";
import { createEmptyProject, type Project } from "@/model/types";
import { StageCanvas } from "@/components/StageCanvas";
import { PreviewStage } from "@/components/PreviewStage";
import { ToolDock, ReferenceBox } from "@/components/chrome/ToolDock";
import { ZoomDock } from "@/components/chrome/ZoomDock";
import { FeedbackDock } from "@/components/chrome/FeedbackDock";
import { PAPER } from "@/components/chrome/paper-tokens";
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
import {
  ImageFilterSnapshotMount,
  getImageFilterSnapshotCanvas,
} from "@/components/ImageFilterBackground";
import { paintBackground } from "@/engine/background";
import { paintProjectFrame } from "@/engine/paintFrame";
import { copyArtboardToClipboard } from "@/export/clipboardShot";
import { getShaderSnapshotCanvas } from "@/components/ShaderBackground";
import { hasImageFilter } from "@/lib/image-filters";

const SHORTCUTS: Record<string, ToolId> = {
  v: "select",
  a: "path",
  b: "ink",
  p: "pen",
  f: "fill",
  e: "eraser",
  t: "text",
  h: "hand",
  s: "shapes",
  r: "rect",
  o: "circle",
  l: "line",
};

export default function App() {
  const setTool = useTools((s) => s.setTool);
  const undo = useProject((s) => s.undo);
  const redo = useProject((s) => s.redo);
  const stage = usePlayback((s) => s.stage);
  const setStage = usePlayback((s) => s.setStage);
  const background = useProject((s) => s.project.background);
  const aspect = useProject((s) => s.project.width / s.project.height);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const imageInputRef = useRef<HTMLInputElement>(null);
  const [exportOpen, setExportOpen] = useState(false);
  const [recovered, setRecovered] = useState<Project | null>(null);
  const [referenceOpen, setReferenceOpen] = useState(false);

  async function handleSave() {
    await saveLaoFile(useProject.getState().project);
  }
  async function handleOpen() {
    const project = await openLaoFile();
    if (project) useProject.getState().loadProject(project);
  }
  function handleNew() {
    const hasArt = useProject.getState().project.layers.some((l) =>
      l.frames.some((f) => f && f.strokes.length > 0),
    );
    if (hasArt) {
      const ok = window.confirm("Start a new file? Save current session first?");
      if (ok) void handleSave().finally(() => useProject.getState().loadProject(createEmptyProject()));
      else return;
    } else {
      useProject.getState().loadProject(createEmptyProject());
    }
  }

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

      if (e.key === "Escape") {
        if (usePlayback.getState().stage === "preview") {
          e.preventDefault();
          setStage("draw");
          return;
        }
        useTools.getState().setShapesOpen(false);
        usePlayback.getState().setAnimationPanelOpen(false);
        return;
      }

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
          useViewport.getState().resetView();
          return;
        }
        if (e.key.toLowerCase() === "z") {
          e.preventDefault();
          if (e.shiftKey) redo();
          else undo();
          return;
        }
        if (e.key.toLowerCase() === "s") {
          e.preventDefault();
          void saveLaoFile(useProject.getState().project);
          return;
        }
        if (e.key.toLowerCase() === "o") {
          e.preventDefault();
          void openLaoFile().then((p) => p && useProject.getState().loadProject(p));
          return;
        }
        if (e.key.toLowerCase() === "n") {
          e.preventDefault();
          handleNew();
          return;
        }
        if (e.key.toLowerCase() === "a") {
          e.preventDefault();
          useSelection.getState().selectAll();
          return;
        }
        if (e.key.toLowerCase() === "c" && !e.shiftKey) {
          const ids = useSelection.getState().ids;
          if (!ids.length) return;
          e.preventDefault();
          const ps = useProject.getState();
          const layer = ps.project.layers[ps.layerIndex];
          const cel = layer ? resolveCel(layer, ps.frameIndex) : null;
          if (cel) copyStrokes(cel.strokes.filter((s) => ids.includes(s.id)));
          return;
        }
        if (e.shiftKey && e.key.toLowerCase() === "c") {
          e.preventDefault();
          const ps = useProject.getState().project;
          void copyArtboardToClipboard(ps.width, ps.height, (ctx) => {
            const shaderCanvas =
              ps.background?.kind === "shader" ? getShaderSnapshotCanvas() : null;
            const imageFilterCanvas = hasImageFilter(ps.background)
              ? getImageFilterSnapshotCanvas()
              : null;
            const hasBg = paintBackground(ctx, ps, {
              shaderCanvas,
              imageFilterCanvas,
            });
            if (!hasBg) {
              ctx.fillStyle = "#141416";
              ctx.fillRect(0, 0, ps.width, ps.height);
            }
            paintProjectFrame(ctx, ps, useProject.getState().frameIndex, { clear: false });
          }).catch(() => undefined);
          return;
        }
        if (e.key.toLowerCase() === "v") {
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
      }

      if (e.ctrlKey || e.metaKey || e.altKey) return;

      if (e.key === "Delete" || e.key === "Backspace") {
        const ids = useSelection.getState().ids;
        const nodeIds = useSelection.getState().nodeIds;
        if (nodeIds.length > 0) {
          e.preventDefault();
          useProject.getState().deleteNodes(nodeIds);
          useSelection.getState().clearNodes();
        } else if (ids.length > 0) {
          e.preventDefault();
          useProject.getState().deleteStrokes(ids);
          useSelection.getState().clear();
        }
        return;
      }

      if (e.key === "1") {
        setReferenceOpen(true);
        return;
      }
      if (e.key === "2") {
        imageInputRef.current?.click();
        return;
      }

      // shape shortcuts with shift
      if (e.key.toLowerCase() === "r") {
        setTool(e.shiftKey ? "diamond" : "rect");
        return;
      }
      if (e.key.toLowerCase() === "l") {
        setTool(e.shiftKey ? "arrow" : "line");
        return;
      }

      const k = e.key.toLowerCase();
      if (k === "d") {
        useSelection.getState().clear();
        return;
      }
      const t = SHORTCUTS[k];
      if (t) setTool(t);
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [setTool, undo, redo, setStage]);

  /**
   * Ctrl/trackpad-pinch wheel events over the canvas already drive
   * `viewport.zoom` (StageCanvas's own listener). But Chrome sometimes marks
   * a trackpad-pinch wheel event non-cancelable, so a canvas-scoped
   * `preventDefault()` silently no-ops and the browser's native page-zoom
   * fires alongside our zoom — looks like "zoom is broken" even though the
   * app's zoom state is updating underneath it. Block native page-zoom
   * app-wide as a belt-and-suspenders fix, same as Figma/Excalidraw do.
   */
  useEffect(() => {
    function onWheel(e: WheelEvent) {
      if (e.ctrlKey) e.preventDefault();
    }
    document.addEventListener("wheel", onWheel, { passive: false });
    return () => document.removeEventListener("wheel", onWheel);
  }, []);

  return (
    <div
      className="relative h-dvh w-dvw overflow-hidden text-foreground antialiased"
      style={{ backgroundColor: PAPER.bg }}
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
      {hasImageFilter(background) && background?.kind === "image" && (
        <ImageFilterSnapshotMount background={background} aspect={aspect} />
      )}

      <div
        className="absolute z-20"
        style={{ left: PAPER.insetX, top: PAPER.insetTop }}
      >
        <WorkflowBar
          onSave={() => void handleSave()}
          onOpen={() => void handleOpen()}
          onExport={() => setExportOpen(true)}
          onNew={handleNew}
        />
      </div>

      {stage === "preview" && (
        <div className="absolute left-1/2 top-4 z-20 -translate-x-1/2">
          <ExpandableActionBar
            size="sm"
            items={[
              {
                id: "reference",
                label: "Reference",
                icon: <CameraIcon size={14} />,
                onClick: () => setReferenceOpen(true),
              },
            ]}
            className="!min-h-[42px] h-[42px]"
          />
        </div>
      )}

      <ReferenceBox open={referenceOpen} onClose={() => setReferenceOpen(false)} />

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
      <input
        ref={imageInputRef}
        type="file"
        accept="image/*"
        className="hidden"
        onChange={(e) => {
          // MVP: open as reference for now; canvas image layers land next
          const file = e.target.files?.[0];
          if (file) {
            useReference.getState().setReference(file);
            setReferenceOpen(true);
          }
          e.target.value = "";
        }}
      />

      {stage === "draw" && (
        <div
          className="absolute z-20"
          style={{ right: PAPER.insetX, top: PAPER.insetTop }}
        >
          <ToolDock
            onReference={() => setReferenceOpen(true)}
            onAddImage={() => imageInputRef.current?.click()}
          />
        </div>
      )}

      <div
        className="pointer-events-none absolute inset-x-0 z-20 flex flex-col items-center"
        style={{ bottom: PAPER.insetBottom }}
      >
        <div
          className="pointer-events-auto"
          style={{ width: PAPER.timelineWidth, maxWidth: "calc(100vw - 124px)" }}
        >
          <Timeline />
        </div>
      </div>

      {stage === "draw" && (
        <div
          className="absolute z-20"
          style={{ left: PAPER.insetX, bottom: PAPER.insetBottom }}
        >
          <ZoomDock />
        </div>
      )}

      {stage === "draw" && (
        <div
          className="absolute z-20"
          style={{ right: PAPER.insetX, bottom: PAPER.insetBottom }}
        >
          <FeedbackDock />
        </div>
      )}

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
