import { useEffect, useRef, useState } from "react";
import { ExpandableActionBar } from "@/components/motion/expandable-action-bar";
import { WorkflowBar } from "@/components/chrome/WorkflowBar";
import CameraIcon from "@/components/ui/camera-icon";
import { ExportDialog } from "@/components/panels/ExportDialog";
import { SaveFirstDialog } from "@/components/panels/SaveFirstDialog";
import { saveLaoFile, openLaoFile, parseLaoDocument } from "@/file/laoFile";
import { startAutosave, readAutosave, clearAutosave, type AutosaveRecord } from "@/file/autosave";
import { createEmptyProject, projectHasArt } from "@/model/types";
import { createImageElementFromFile } from "@/engine/canvasImage";
import { StageCanvas } from "@/components/StageCanvas";
import { PreviewStage } from "@/components/PreviewStage";
import { ToolDock } from "@/components/chrome/ToolDock";
import { ReferencePanel } from "@/components/chrome/ReferencePanel";
import { ZoomDock } from "@/components/chrome/ZoomDock";
import { ZoomHud } from "@/components/chrome/ZoomHud";
import { FeedbackDock } from "@/components/chrome/FeedbackDock";
import { PAPER } from "@/components/chrome/paper-tokens";
import { Timeline } from "@/components/timeline/Timeline";
import { useTools, type ToolId } from "@/state/tools";
import { useProject } from "@/state/project";
import { usePlayback } from "@/state/playback";
import { useReference } from "@/state/reference";
import { useSelection } from "@/state/selection";
import { useViewport } from "@/state/viewport";
import { useWorkflowMemory } from "@/state/workflowMemory";
import {
  clipboardIsEmpty,
  copySelection,
  readClipboard,
  textElementFromPlain,
  normalizePastedPlainText,
} from "@/state/clipboard";
import { isTypingTarget } from "@/lib/typingTarget";
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
import { LaoToaster } from "@/components/chrome/LaoToaster";
import {
  toastCopied,
  toastError,
  toastOpened,
  toastSaved,
  toastSuccess,
} from "@/lib/laoToast";

const SHORTCUTS: Record<string, ToolId> = {
  v: "select",
  a: "path",
  b: "ink",
  p: "pen",
  m: "marker",
  f: "fill",
  e: "eraser",
  t: "text",
  h: "hand",
  r: "rect",
  o: "circle",
  l: "line",
};

function hasArtSelectionOnMoveTool(): boolean {
  const tool = useTools.getState().tool;
  if (tool !== "select" && tool !== "path") return false;
  return useSelection.getState().ids.length > 0;
}

function sendActiveLayerTo(edge: "back" | "front"): void {
  const { layerIndex, project, reorderLayer } = useProject.getState();
  const last = project.layers.length - 1;
  if (project.layers.length <= 1) return;
  if (edge === "back" && layerIndex > 0) reorderLayer(layerIndex, 0);
  else if (edge === "front" && layerIndex < last) reorderLayer(layerIndex, last);
}

function pastePlainTextAsElement(raw: string): string | null {
  const text = normalizePastedPlainText(raw);
  if (!text.trim()) return null;
  const tools = useTools.getState();
  const project = useProject.getState().project;
  const size = tools.textSize;
  const el = textElementFromPlain(text, {
    x: Math.round(project.width / 2 - Math.max(120, size * 3)),
    y: Math.round(project.height / 2 - size),
    fontFamily: tools.fontFamily,
    size,
    color: tools.color,
    bold: tools.textBold,
    italic: tools.textItalic,
    align: tools.textAlign,
    letterSpacing: tools.letterSpacing,
    underline: tools.textUnderline,
    strikethrough: tools.textStrikethrough,
    textCase: tools.textCase,
    opacity: tools.textOpacity,
    backgroundColor: tools.textBackgroundColor,
    shadow: tools.textShadow,
    blendMode: tools.textBlendMode,
    path: tools.textPath.shape === "none" ? null : { ...tools.textPath },
    boxWidth: Math.max(120, Math.min(project.width * 0.6, size * 8)),
    typewriterSpeed: tools.textTypewriter ? tools.textTypewriterSpeed : 0,
  });
  useProject.getState().addTextElement(el);
  return el.id;
}

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
  const [recovered, setRecovered] = useState<AutosaveRecord | null>(null);
  const [referenceOpen, setReferenceOpen] = useState(false);
  const [newFilePromptOpen, setNewFilePromptOpen] = useState(false);

  async function handleSave() {
    try {
      const project = useProject.getState().project;
      const workflow = project.workflow ?? "animatron";
      const ok = await saveLaoFile(
        project,
        useWorkflowMemory.getState().projectsForSave(workflow),
      );
      if (ok) toastSaved(project.name || "untitled");
      return ok;
    } catch (err) {
      toastError("Couldn’t save file", err);
      return false;
    }
  }
  async function handleOpen() {
    try {
      const opened = await openLaoFile();
      if (!opened) return;
      useProject.getState().loadProject(opened.project);
      useWorkflowMemory.getState().hydrate(opened.workflowMemory);
      toastOpened(opened.project.name || "untitled.lao");
    } catch (err) {
      toastError("Couldn’t open file", err);
    }
  }
  function handleNew() {
    if (projectHasArt(useProject.getState().project)) {
      setNewFilePromptOpen(true);
      return;
    }
    useProject.getState().loadProject(createEmptyProject());
    toastSuccess("New file created");
  }

  function startNewFile() {
    useProject.getState().loadProject(createEmptyProject());
    toastSuccess("New file created");
  }

  useEffect(() => {
    const stop = startAutosave();
    void readAutosave().then((saved) => {
      if (!saved?.project) return;
      const current = useProject.getState();
      const untouched = current.undoStack.length === 0 && current.redoStack.length === 0;
      if (projectHasArt(saved.project) && untouched) setRecovered(saved);
    });
    return stop;
  }, []);

  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      const target = e.target as HTMLElement;
      const tag = target.tagName;
      if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT") return;

      const typing = isTypingTarget(target);
      const artClipboardKey =
        (e.ctrlKey || e.metaKey) &&
        !e.altKey &&
        ["c", "x", "v"].includes(e.key.toLowerCase());
      // While the text editor is open: Ctrl+V stays native (insert characters).
      // Ctrl+C / Ctrl+X still copy/cut the text element.
      if (typing && artClipboardKey && e.key.toLowerCase() === "v") return;
      if (typing && !artClipboardKey) return;

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
        const bracketLeft = e.key === "[" || e.code === "BracketLeft";
        const bracketRight = e.key === "]" || e.code === "BracketRight";
        if (e.altKey && (bracketLeft || bracketRight)) {
          e.preventDefault();
          if (hasArtSelectionOnMoveTool()) {
            useProject.getState().reorderArt(
              useSelection.getState().ids,
              bracketLeft ? "back" : "front",
            );
          } else {
            sendActiveLayerTo(bracketLeft ? "back" : "front");
          }
          return;
        }
        if (bracketLeft) {
          // Send active layer to bottom (back)
          e.preventDefault();
          sendActiveLayerTo("back");
          return;
        }
        if (bracketRight) {
          // Bring active layer to top (front)
          e.preventDefault();
          sendActiveLayerTo("front");
          return;
        }
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
          void handleSave();
          return;
        }
        if (e.key.toLowerCase() === "o") {
          e.preventDefault();
          void handleOpen();
          return;
        }
        if (e.key.toLowerCase() === "n") {
          e.preventDefault();
          handleNew();
          return;
        }
        if (e.shiftKey && e.key.toLowerCase() === "a") {
          e.preventDefault();
          useSelection.getState().selectAllLayers();
          return;
        }
        if (e.key.toLowerCase() === "a") {
          e.preventDefault();
          useSelection.getState().selectAll();
          return;
        }
        if (e.key.toLowerCase() === "g") {
          e.preventDefault();
          const ids = useSelection.getState().ids;
          if (e.shiftKey) useProject.getState().ungroupSelection(ids);
          else useProject.getState().groupSelection(ids);
          return;
        }
        if (e.key.toLowerCase() === "c" && !e.shiftKey) {
          const ids = useSelection.getState().ids;
          if (!ids.length) return;
          e.preventDefault();
          e.stopPropagation();
          const ps = useProject.getState();
          copySelection(ps.project, ps.frameIndex, ids);
          return;
        }
        if (e.key.toLowerCase() === "x") {
          const ids = useSelection.getState().ids;
          if (!ids.length) return;
          e.preventDefault();
          e.stopPropagation();
          const ps = useProject.getState();
          if (!copySelection(ps.project, ps.frameIndex, ids)) return;
          useProject.getState().deleteStrokes(ids);
          useSelection.getState().clear();
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
          })
            .then(() => toastCopied("Artboard copied"))
            .catch((err) => toastError("Couldn’t copy artboard", err));
          return;
        }
        if (e.key.toLowerCase() === "v") {
          const art = readClipboard();
          if (
            !art.strokes.length &&
            !art.texts.length &&
            !art.images.length
          ) {
            return;
          }
          e.preventDefault();
          e.stopPropagation();
          const newIds = useProject.getState().pasteArt(art);
          if (newIds.length) {
            useSelection.getState().set(newIds);
            useTools.getState().setTool("select");
          }
          return;
        }
      }

      if (e.ctrlKey || e.metaKey || e.altKey) return;

      if (
        (e.key === "ArrowLeft" ||
          e.key === "ArrowRight" ||
          e.key === "ArrowUp" ||
          e.key === "ArrowDown") &&
        hasArtSelectionOnMoveTool()
      ) {
        e.preventDefault();
        e.stopPropagation();
        const step = e.shiftKey ? 10 : 1;
        let dx = 0;
        let dy = 0;
        if (e.key === "ArrowLeft") dx = -step;
        else if (e.key === "ArrowRight") dx = step;
        else if (e.key === "ArrowUp") dy = -step;
        else dy = step;
        useProject.getState().translateStrokes(useSelection.getState().ids, dx, dy);
        return;
      }

      if (e.key === "[" || e.code === "BracketLeft") {
        e.preventDefault();
        if (hasArtSelectionOnMoveTool()) {
          useProject.getState().reorderArt(useSelection.getState().ids, "backward");
        } else {
          const { layerIndex, reorderLayer } = useProject.getState();
          if (layerIndex > 0) reorderLayer(layerIndex, layerIndex - 1);
        }
        return;
      }
      if (e.key === "]" || e.code === "BracketRight") {
        e.preventDefault();
        if (hasArtSelectionOnMoveTool()) {
          useProject.getState().reorderArt(useSelection.getState().ids, "forward");
        } else {
          const { layerIndex, project, reorderLayer } = useProject.getState();
          if (layerIndex < project.layers.length - 1) {
            reorderLayer(layerIndex, layerIndex + 1);
          }
        }
        return;
      }

      if (e.key === "Delete" || e.key === "Backspace") {
        const layerIndices = useSelection.getState().layerIndices;
        const ids = useSelection.getState().ids;
        const nodeIds = useSelection.getState().nodeIds;
        if (layerIndices.length > 0) {
          e.preventDefault();
          useProject.getState().deleteLayers(layerIndices);
          useSelection.getState().clearLayers();
        } else if (nodeIds.length > 0) {
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
        // Picture / Reference — place image on canvas
        imageInputRef.current?.click();
        return;
      }
      if (e.key === "2") {
        // Camera — reference overlay panel
        setReferenceOpen(true);
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
        useSelection.getState().clearLayers();
        return;
      }
      if (k === "v" || k === "a") {
        const layerIndices = useSelection.getState().layerIndices;
        if (layerIndices.length > 0) {
          useSelection.getState().selectAllInLayers(layerIndices);
        }
        setTool(SHORTCUTS[k]);
        return;
      }
      const t = SHORTCUTS[k];
      if (t) setTool(t);
    }
    window.addEventListener("keydown", onKeyDown, true);
    return () => window.removeEventListener("keydown", onKeyDown, true);
  }, [setTool, undo, redo, setStage]);

  useEffect(() => {
    function onPaste(e: ClipboardEvent) {
      if (isTypingTarget(e.target)) return;
      if (e.defaultPrevented) return;
      if (!clipboardIsEmpty(readClipboard())) return;
      const plain = e.clipboardData?.getData("text/plain") ?? "";
      const id = pastePlainTextAsElement(plain);
      if (!id) return;
      e.preventDefault();
      useSelection.getState().set([id]);
      useTools.getState().setTool("select");
    }
    window.addEventListener("paste", onPaste);
    return () => window.removeEventListener("paste", onPaste);
  }, []);

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

  /**
   * Drawing near the timeline / settings dock can drag-select chrome labels
   * ("background", "Path 1", fps…). Block native selection everywhere except
   * real text fields and dialogs (Help / Export copy).
   */
  useEffect(() => {
    function allowNativeSelect(t: EventTarget | null) {
      if (!(t instanceof Element)) return false;
      return !!t.closest(
        'input, textarea, select, [contenteditable="true"], [contenteditable=""], [role="dialog"]',
      );
    }
    function onSelectStart(e: Event) {
      if (allowNativeSelect(e.target)) return;
      e.preventDefault();
    }
    document.addEventListener("selectstart", onSelectStart);
    return () => document.removeEventListener("selectstart", onSelectStart);
  }, []);

  return (
    <div
      className="lao-app relative h-dvh w-dvw overflow-hidden text-foreground antialiased select-none"
      style={{ backgroundColor: PAPER.bg }}
      onDragOver={(e) => e.preventDefault()}
      onDrop={(e) => {
        e.preventDefault();
        const file = e.dataTransfer.files?.[0];
        if (!file || !file.name.endsWith(".lao")) return;
        void file
          .text()
          .then((text) => {
            const opened = parseLaoDocument(text);
            useProject.getState().loadProject(opened.project);
            useWorkflowMemory.getState().hydrate(opened.workflowMemory);
            toastOpened(file.name);
          })
          .catch((err) => toastError("Couldn’t open file", err));
      }}
    >
      <LaoToaster />
      <ZoomHud />
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

      {stage === "preview" && (
        <ReferencePanel open={referenceOpen} onClose={() => setReferenceOpen(false)} />
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
      <input
        ref={imageInputRef}
        type="file"
        accept="image/*"
        className="hidden"
        onChange={(e) => {
          const file = e.target.files?.[0];
          if (!file) {
            e.target.value = "";
            return;
          }
          void (async () => {
            try {
              const ps = useProject.getState();
              const image = await createImageElementFromFile(
                file,
                ps.project.width,
                ps.project.height,
              );
              ps.addImageElement(image);
              useSelection.getState().set([image.id]);
              useTools.getState().setTool("select");
            } catch (err) {
              console.error("Failed to add canvas image", err);
            }
          })();
          e.target.value = "";
        }}
      />

      {stage === "draw" && (
        <ToolDock
          onReference={() => imageInputRef.current?.click()}
          referenceOpen={referenceOpen}
          onReferenceOpenChange={setReferenceOpen}
        />
      )}

      <div
        className="pointer-events-none absolute inset-x-0 z-30 flex flex-col items-center overflow-visible"
        style={{
          bottom: PAPER.insetBottom,
          // Keep settings+timeline stacked in the bottom band — never grow so
          // tall that the timeline climbs over the setting dock on short viewports.
          maxHeight: `calc(100dvh - ${PAPER.insetBottom}px - ${PAPER.insetTop}px)`,
        }}
      >
        <div
          className="pointer-events-auto flex min-h-0 w-full flex-col overflow-visible"
          style={{
            width: PAPER.timelineWidth,
            maxWidth: "calc(100vw - 124px)",
          }}
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
              useProject.getState().loadProject(recovered.project);
              useWorkflowMemory.getState().hydrate(recovered.workflowMemory);
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
      <SaveFirstDialog
        open={newFilePromptOpen}
        onOpenChange={setNewFilePromptOpen}
        alert="Alert: Creating new file without saving will delete the progress of your current sessions."
        skipLabel="No, Start New"
        confirmLabel="Yes, New File"
        onSkip={startNewFile}
        onConfirm={async () => {
          const ok = await handleSave();
          if (!ok) return false;
          startNewFile();
          return true;
        }}
      />
    </div>
  );
}
