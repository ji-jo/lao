import { useEffect, useRef, useState, type ReactNode } from "react";
import LayerGripIcon from "@/components/ui/layer-grip-icon";
import {
  PaperDockBar,
  PaperDockItem,
  PaperDockSep,
} from "@/components/chrome/PaperDockPrimitives";
import { PAPER } from "@/components/chrome/paper-tokens";
import { GooeyConjoined } from "@/components/motion/gooey-conjoined";
import { useTools, isShapeTool, type ToolId, type ShapeToolId } from "@/state/tools";
import { useReference } from "@/state/reference";
import { cn } from "@/lib/utils";
import {
  PointerToolIcon,
  PathToolIcon,
  BrushToolIcon,
  PenToolIcon,
  MarkerToolIcon,
  BucketToolIcon,
  TextToolIcon,
  EraseToolIcon,
  HandToolIcon,
  ShapesToolIcon,
  CameraToolIcon,
  ReferenceToolIcon,
  RectangleShapeIcon,
  DiamondShapeIcon,
  CircleShapeIcon,
  ArrowShapeIcon,
  LineShapeIcon,
} from "@/assets/icons/tools/tool-icons";

type DockTool = {
  id: ToolId;
  label: string;
  shortcut: string;
  icon: ReactNode;
};

/** Primary draw tools — Path (a) sits beside Pointer (v). */
const MAIN: DockTool[] = [
  { id: "select", label: "Pointer", shortcut: "v", icon: <PointerToolIcon /> },
  { id: "path", label: "Path", shortcut: "a", icon: <PathToolIcon /> },
  { id: "ink", label: "Brush", shortcut: "b", icon: <BrushToolIcon /> },
  { id: "pen", label: "Pen", shortcut: "p", icon: <PenToolIcon /> },
  { id: "marker", label: "Marker", shortcut: "m", icon: <MarkerToolIcon /> },
  { id: "fill", label: "Bucket", shortcut: "f", icon: <BucketToolIcon /> },
  { id: "text", label: "Text", shortcut: "t", icon: <TextToolIcon /> },
  { id: "eraser", label: "Erase", shortcut: "e", icon: <EraseToolIcon /> },
  { id: "hand", label: "Hand", shortcut: "h", icon: <HandToolIcon /> },
];

/** Paper 9IV-0 shapes pack. */
const SHAPES: {
  id: ShapeToolId;
  label: string;
  tip: string;
  icon: ReactNode;
}[] = [
  { id: "rect", label: "Rectangle", tip: "r", icon: <RectangleShapeIcon /> },
  { id: "diamond", label: "Diamond", tip: "⇧r", icon: <DiamondShapeIcon /> },
  { id: "circle", label: "Circle", tip: "o", icon: <CircleShapeIcon /> },
  { id: "arrow", label: "Arrow", tip: "⇧l", icon: <ArrowShapeIcon /> },
  { id: "line", label: "Line", tip: "l", icon: <LineShapeIcon /> },
];

/**
 * Paper tool dock (1FB-0) + shapes gooey pack (9IV-0).
 * Shapes toggles like More tools — gooey flyout melts out below the chip.
 * Left-edge ⋮⋮ grip drags the dock. Defaults to Paper top-right inset.
 */
export function ToolDock({
  onReference,
  onAddImage,
}: {
  onReference?: () => void;
  onAddImage?: () => void;
} = {}) {
  const tool = useTools((s) => s.tool);
  const lastShapeTool = useTools((s) => s.lastShapeTool);
  const setTool = useTools((s) => s.setTool);
  const shapesOpen = useTools((s) => s.shapesOpen);
  const setShapesOpen = useTools((s) => s.setShapesOpen);
  const shapesBtnRef = useRef<HTMLDivElement>(null);
  const rootRef = useRef<HTMLDivElement>(null);
  /** null = default Paper top-right; after a drag we pin left/top in viewport px */
  const [pos, setPos] = useState<{ left: number; top: number } | null>(null);
  const [dragging, setDragging] = useState(false);
  const dragRef = useRef<{
    pointerId: number;
    startX: number;
    startY: number;
    originLeft: number;
    originTop: number;
  } | null>(null);

  // close shapes pack on outside click
  useEffect(() => {
    if (!shapesOpen) return;
    function onDown(e: MouseEvent) {
      const t = e.target as Node;
      if (rootRef.current?.contains(t)) return;
      setShapesOpen(false);
    }
    window.addEventListener("mousedown", onDown);
    return () => window.removeEventListener("mousedown", onDown);
  }, [shapesOpen, setShapesOpen]);

  useEffect(() => {
    if (!dragging) return;
    function onMove(e: PointerEvent) {
      const d = dragRef.current;
      const el = rootRef.current;
      if (!d || !el || e.pointerId !== d.pointerId) return;
      const w = el.offsetWidth;
      const h = el.offsetHeight;
      const pad = 8;
      const nextLeft = Math.max(
        pad,
        Math.min(window.innerWidth - w - pad, d.originLeft + (e.clientX - d.startX)),
      );
      const nextTop = Math.max(
        pad,
        Math.min(window.innerHeight - h - pad, d.originTop + (e.clientY - d.startY)),
      );
      setPos({ left: nextLeft, top: nextTop });
    }
    function onUp(e: PointerEvent) {
      const d = dragRef.current;
      if (!d || e.pointerId !== d.pointerId) return;
      dragRef.current = null;
      setDragging(false);
    }
    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
    window.addEventListener("pointercancel", onUp);
    return () => {
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
      window.removeEventListener("pointercancel", onUp);
    };
  }, [dragging]);

  function onGripPointerDown(e: React.PointerEvent) {
    e.preventDefault();
    e.stopPropagation();
    const el = rootRef.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    dragRef.current = {
      pointerId: e.pointerId,
      startX: e.clientX,
      startY: e.clientY,
      originLeft: rect.left,
      originTop: rect.top,
    };
    setPos({ left: rect.left, top: rect.top });
    setDragging(true);
    try {
      (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    } catch {
      // synthetic events throw — harmless
    }
  }

  const shapesActive = tool === "shapes" || isShapeTool(tool);

  const shapesPanel = (
    <div
      className="pointer-events-auto relative z-50 flex items-center gap-3 overflow-clip rounded-full px-3 py-2 antialiased"
      style={{ backgroundColor: PAPER.surface, fontFamily: PAPER.fontSans }}
      onPointerDown={(e) => e.stopPropagation()}
    >
      {SHAPES.map((s) => {
        const active =
          tool === s.id || (tool === "shapes" && s.id === lastShapeTool);
        return (
          <PaperDockItem
            key={s.id}
            label={s.label}
            shortcut={s.tip}
            active={active}
            onClick={() => setTool(s.id)}
          >
            {s.icon}
          </PaperDockItem>
        );
      })}
    </div>
  );

  return (
    <div
      ref={rootRef}
      className={cn(
        "pointer-events-auto absolute z-20",
        dragging && "cursor-grabbing",
      )}
      style={
        pos
          ? { left: pos.left, top: pos.top }
          : { right: PAPER.insetX, top: PAPER.insetTop }
      }
    >
      <GooeyConjoined
        open={shapesOpen}
        panelKey="shapes"
        panel={shapesPanel}
        anchorRef={shapesBtnRef}
        side="bottom"
        gap={8}
        surface={PAPER.surface}
        panelClassName="overflow-visible"
      >
        <PaperDockBar variant="pill">
          <button
            type="button"
            onPointerDown={onGripPointerDown}
            aria-label="Move tool dock"
            title="Drag to move"
            className={cn(
              "relative grid h-[14px] w-[8px] shrink-0 cursor-grab touch-none place-items-center transition-[opacity,scale] duration-150 ease-out before:absolute before:-inset-[7px] before:content-[''] active:cursor-grabbing",
              dragging ? "opacity-100 scale-90" : "opacity-60 hover:opacity-100 active:scale-90",
            )}
          >
            <LayerGripIcon size={14} />
          </button>

          {MAIN.map((t) => (
            <PaperDockItem
              key={t.id}
              label={t.label}
              shortcut={t.shortcut}
              active={tool === t.id}
              onClick={() => {
                setShapesOpen(false);
                setTool(t.id);
              }}
            >
              {t.icon}
            </PaperDockItem>
          ))}

          <div ref={shapesBtnRef}>
            <PaperDockItem
              label="Shapes"
              shortcut="s"
              active={shapesActive || shapesOpen}
              onClick={() => {
                if (shapesOpen) {
                  setShapesOpen(false);
                } else {
                  setShapesOpen(true);
                  if (!isShapeTool(tool)) setTool("shapes");
                }
              }}
            >
              <ShapesToolIcon />
            </PaperDockItem>
          </div>

          <PaperDockSep width={8} />

          <PaperDockItem
            label="Camera"
            shortcut="2"
            onClick={() => {
              setShapesOpen(false);
              onAddImage?.();
            }}
          >
            <CameraToolIcon />
          </PaperDockItem>
          <PaperDockItem
            label="Reference"
            shortcut="1"
            onClick={() => {
              setShapesOpen(false);
              onReference?.();
            }}
          >
            <ReferenceToolIcon />
          </PaperDockItem>
        </PaperDockBar>
      </GooeyConjoined>
    </div>
  );
}

/** Floating reference box (Paper 245-0) */
export function ReferenceBox({
  open,
  onClose,
}: {
  open: boolean;
  onClose: () => void;
}) {
  const reference = useReference();
  const [opacity, setOpacity] = useState(20);
  const fileRef = useRef<HTMLInputElement>(null);

  if (!open) return null;

  return (
    <div className="pointer-events-auto absolute right-4 top-16 z-30 w-[221px] overflow-hidden rounded-xl border border-border bg-[#131212] shadow-2xl">
      <div className="flex items-center justify-between px-3 py-2">
        <span className="text-[13px] text-foreground">Reference</span>
        <button
          type="button"
          onClick={onClose}
          className="grid h-5 w-5 place-items-center text-muted-foreground hover:text-foreground"
          aria-label="Close reference"
        >
          ×
        </button>
      </div>
      <button
        type="button"
        className={cn(
          "mx-3 mb-2 flex h-[147px] w-[calc(100%-1.5rem)] items-center justify-center overflow-hidden rounded-lg border border-border/50 bg-black/40",
        )}
        onClick={() => fileRef.current?.click()}
      >
        {reference.url ? (
          reference.kind === "image" ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={reference.url}
              alt="Reference"
              className="max-h-full max-w-full object-contain"
              style={{ opacity: opacity / 100 }}
            />
          ) : (
            <video
              src={reference.url}
              className="max-h-full max-w-full object-contain"
              style={{ opacity: opacity / 100 }}
              muted
              playsInline
            />
          )
        ) : (
          <span className="text-[11px] text-muted-foreground">Click to open image</span>
        )}
      </button>
      <div className="flex items-center gap-2 border-t border-border/40 px-3 py-2">
        <span className="text-[11px] text-muted-foreground">Opacity</span>
        <input
          type="range"
          min={0}
          max={100}
          value={opacity}
          onChange={(e) => setOpacity(Number(e.target.value))}
          className="min-w-0 flex-1"
        />
        <span className="w-6 text-right font-mono text-[11px] text-foreground">{opacity}</span>
      </div>
      <input
        ref={fileRef}
        type="file"
        accept="image/*,video/*"
        className="hidden"
        onChange={(e) => {
          const file = e.target.files?.[0];
          if (file) useReference.getState().setReference(file);
          e.target.value = "";
        }}
      />
    </div>
  );
}
