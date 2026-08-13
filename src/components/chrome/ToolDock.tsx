import {
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type ReactNode,
} from "react";
import LayerGripIcon from "@/components/ui/layer-grip-icon";
import {
  PaperDockBar,
  PaperDockItem,
  PaperDockSep,
} from "@/components/chrome/PaperDockPrimitives";
import { PAPER } from "@/components/chrome/paper-tokens";
import { GooeyConjoined } from "@/components/motion/gooey-conjoined";
import {
  GooeyBarMorph,
  type DockOrientation,
} from "@/components/motion/gooey-bar-morph";
import { useTools, isShapeTool, type ToolId, type ShapeToolId } from "@/state/tools";
import { useSelection } from "@/state/selection";
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
import { ReferencePanelBody } from "@/components/chrome/ReferencePanel";

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
 * Edge magnet (commit on release — no mid-drag H↔V flips):
 * - HIT: within 20px of L/R/top → blue 20% preview
 * - SIDE/TOP_INSET: on release, morph + stick (sides vertical @ 60px, top horizontal)
 * - Bottom: 40px above Zoom/Feedback
 * - Left column: hard floor 40px below live WorkflowBar bounds
 */
const HIT_PX = 20;
const SIDE_INSET = 60;
/** Match WorkflowBar — `PAPER.insetTop` (24). */
const TOP_INSET = PAPER.insetTop;
/** ZoomDock / FeedbackDock are `h-7` (28px) at `bottom: PAPER.insetBottom`. */
const BOTTOM_CHROME_H = 28;
const BOTTOM_PAD = 40;
const WORKFLOW_PAD = 40;
/** Paper navy — same family as fill hover preview. */
const PREVIEW_BLUE = "#40608E";

type DockEdge = "left" | "right" | "top";

type Rect = { left: number; top: number; right: number; bottom: number };

function workflowRect(): Rect {
  const el = document.querySelector<HTMLElement>("[data-lao-workflow-bar]");
  if (el) {
    const r = el.getBoundingClientRect();
    return { left: r.left, top: r.top, right: r.right, bottom: r.bottom };
  }
  // Fallback before mount / SSR — Paper defaults.
  return {
    left: PAPER.insetX,
    top: PAPER.insetTop,
    right: PAPER.insetX + 300,
    bottom: PAPER.insetTop + 36,
  };
}

function chromeTopY(): number {
  return window.innerHeight - PAPER.insetBottom - BOTTOM_CHROME_H;
}

function maxDockTop(h: number): number {
  return chromeTopY() - BOTTOM_PAD - h;
}

/**
 * Left-column exclusion: anything whose X range meets the WorkflowBar
 * (plus WORKFLOW_PAD) must sit at least WORKFLOW_PAD below it.
 */
function minTopBelowWorkflow(left: number, _w: number): number {
  const wf = workflowRect();
  const zoneRight = wf.right + WORKFLOW_PAD;
  // Whole left strip from viewport edge through workflow + pad.
  const inLeftColumn = left < zoneRight;
  if (!inLeftColumn) return 8;
  return wf.bottom + WORKFLOW_PAD;
}

function clampPos(
  left: number,
  top: number,
  w: number,
  h: number,
): { left: number; top: number } {
  const pad = 8;
  const vw = window.innerWidth;
  let nextLeft = Math.max(pad, Math.min(vw - w - pad, left));
  let nextTop = Math.max(pad, Math.min(maxDockTop(h), top));

  const floor = minTopBelowWorkflow(nextLeft, w);
  nextTop = Math.max(nextTop, floor);

  // If still AABB-overlapping the padded workflow box, shove below it.
  const wf = workflowRect();
  const zone: Rect = {
    left: 0,
    top: wf.top,
    right: wf.right + WORKFLOW_PAD,
    bottom: wf.bottom + WORKFLOW_PAD,
  };
  const dockRight = nextLeft + w;
  const dockBottom = nextTop + h;
  const overlaps =
    nextLeft < zone.right &&
    dockRight > zone.left &&
    nextTop < zone.bottom &&
    dockBottom > zone.top;
  if (overlaps) {
    nextTop = Math.min(maxDockTop(h), Math.max(nextTop, zone.bottom));
  }

  return { left: nextLeft, top: nextTop };
}

function stuckLeft(edge: "left" | "right", w: number): number {
  return edge === "left" ? SIDE_INSET : window.innerWidth - SIDE_INSET - w;
}

function orientationFor(edge: DockEdge | null): DockOrientation {
  return edge === "left" || edge === "right" ? "vertical" : "horizontal";
}

/** Edge band from dock rect and/or pointer. Sides win over top. */
function hitEdge(
  left: number,
  top: number,
  w: number,
  _h: number,
  clientX?: number,
  clientY?: number,
): DockEdge | null {
  const vw = window.innerWidth;
  const leftHit =
    left <= HIT_PX || (clientX != null && clientX <= HIT_PX);
  const rightHit =
    left + w >= vw - HIT_PX ||
    (clientX != null && clientX >= vw - HIT_PX);
  // Prefer L/R rails — top magnet is the TOP_INSET line (not the workflow floor).
  if (leftHit) return "left";
  if (rightHit) return "right";
  const topHit =
    top <= TOP_INSET + HIT_PX ||
    (clientY != null && clientY <= TOP_INSET + HIT_PX);
  if (topHit) return "top";
  return null;
}

/** Preview silhouette for target edge (swap axes when orientation must flip). */
function previewSize(
  current: DockOrientation,
  target: DockEdge,
  w: number,
  h: number,
): { w: number; h: number } {
  const want = orientationFor(target);
  if (want === current) return { w, h };
  return { w: h, h: w };
}

function pinToEdge(
  edge: DockEdge,
  w: number,
  h: number,
  freeLeft: number,
  freeTop: number,
): { left: number; top: number } {
  if (edge === "top") {
    const floor = minTopBelowWorkflow(freeLeft, w);
    return clampPos(freeLeft, Math.max(TOP_INSET, floor), w, h);
  }
  if (edge === "left") {
    // Vertical left rail always starts below WorkflowBar + 40px.
    const floor = minTopBelowWorkflow(SIDE_INSET, w);
    return clampPos(stuckLeft("left", w), Math.max(freeTop, floor), w, h);
  }
  return clampPos(stuckLeft(edge, w), freeTop, w, h);
}

/**
 * Paper tool dock (1FB-0) + shapes gooey pack (9IV-0).
 * Drag near L/R/top → blue 20% preview; release → gooey morph + stick.
 * Keeps 40px clear above Zoom/Feedback.
 */
export function ToolDock({
  onReference,
  referenceOpen = false,
  onReferenceOpenChange,
  defaultPlacement = "top-right",
  locked = false,
}: {
  /** Picture / Reference (1) — place canvas image via file picker. */
  onReference?: () => void;
  /** Camera (2) — session reference overlay gooey panel. */
  referenceOpen?: boolean;
  onReferenceOpenChange?: (open: boolean) => void;
  /** Initial Paper placement. Website demo keeps the Paper top-right rail. */
  defaultPlacement?: "top-right" | "bottom-center";
  /** When true, stay pinned at defaultPlacement — no drag / edge docking. */
  locked?: boolean;
} = {}) {
  const tool = useTools((s) => s.tool);
  const lastShapeTool = useTools((s) => s.lastShapeTool);
  const setTool = useTools((s) => s.setTool);
  const shapesOpen = useTools((s) => s.shapesOpen);
  const setShapesOpen = useTools((s) => s.setShapesOpen);
  const fillPulse = useTools((s) => s.fillPulse);

  function pickTool(next: ToolId) {
    if (next === "select" || next === "path") {
      const layerIndices = useSelection.getState().layerIndices;
      if (layerIndices.length > 0) {
        useSelection.getState().selectAllInLayers(layerIndices);
      }
    }
    setTool(next);
  }
  const shapesBtnRef = useRef<HTMLDivElement>(null);
  const cameraBtnRef = useRef<HTMLDivElement>(null);
  const rootRef = useRef<HTMLDivElement>(null);
  const shapesCloseTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const supportOpen = shapesOpen || referenceOpen;
  const supportKey = shapesOpen ? "shapes" : referenceOpen ? "reference" : "none";

  function clearShapesCloseTimer() {
    if (shapesCloseTimer.current) {
      clearTimeout(shapesCloseTimer.current);
      shapesCloseTimer.current = null;
    }
  }

  function openShapesPack() {
    clearShapesCloseTimer();
    onReferenceOpenChange?.(false);
    setShapesOpen(true);
    // Do NOT setTool("shapes") — that used to arm create on the whole stage and
    // blocked select/move. Concrete flyout items call setTool(line/rect/…).
  }

  function scheduleCloseShapesPack() {
    clearShapesCloseTimer();
    shapesCloseTimer.current = setTimeout(() => {
      shapesCloseTimer.current = null;
      setShapesOpen(false);
    }, 180);
  }

  useEffect(() => () => clearShapesCloseTimer(), []);
  /** Free-drag offset for the Reference gooey panel (session). */
  const [refPanelOffset, setRefPanelOffset] = useState({ x: 0, y: 0 });
  /** null = default Paper top-right; after a drag we pin left/top in viewport px */
  const [pos, setPos] = useState<{ left: number; top: number } | null>(null);
  const [dragging, setDragging] = useState(false);
  /** Committed edge — orientation only changes here (on release). */
  const [edge, setEdge] = useState<DockEdge | null>(null);
  const edgeRef = useRef<DockEdge | null>(null);
  edgeRef.current = edge;
  /** Live magnet preview while dragging (does not flip the real bar). */
  const [previewEdge, setPreviewEdge] = useState<DockEdge | null>(null);
  const [previewPos, setPreviewPos] = useState({ left: 0, top: 0 });
  const orientation: DockOrientation = orientationFor(edge);
  const dragRef = useRef<{
    pointerId: number;
    startX: number;
    startY: number;
    originLeft: number;
    originTop: number;
  } | null>(null);

  // Close shapes / reference pack on outside click — defer so the opening
  // click (and tooltip portal) cannot immediately dismiss the flyout.
  useEffect(() => {
    if (!supportOpen) return;
    let remove: (() => void) | undefined;
    const attachId = window.setTimeout(() => {
      function onDown(e: MouseEvent) {
        const t = e.target as Node;
        if (rootRef.current?.contains(t)) return;
        setShapesOpen(false);
        onReferenceOpenChange?.(false);
      }
      window.addEventListener("pointerdown", onDown);
      remove = () => window.removeEventListener("pointerdown", onDown);
    }, 0);
    return () => {
      window.clearTimeout(attachId);
      remove?.();
    };
  }, [supportOpen, setShapesOpen, onReferenceOpenChange]);

  // After commit morph, re-pin to the edge inset with measured size.
  useLayoutEffect(() => {
    const el = rootRef.current;
    if (!el) return;
    const w = el.offsetWidth;
    const h = el.offsetHeight;
    const stuck = edgeRef.current;
    setPos((prev) => {
      if (!prev && !stuck) return prev;
      const freeLeft = prev?.left ?? SIDE_INSET;
      const freeTop = prev?.top ?? PAPER.insetTop;
      if (stuck) return pinToEdge(stuck, w, h, freeLeft, freeTop);
      if (!prev) return prev;
      return clampPos(prev.left, prev.top, w, h);
    });
  }, [edge]);

  useEffect(() => {
    if (!dragging) return;
    function onMove(e: PointerEvent) {
      const d = dragRef.current;
      const el = rootRef.current;
      if (!d || !el || e.pointerId !== d.pointerId) return;

      const w = el.offsetWidth;
      const h = el.offsetHeight;
      const free = clampPos(
        d.originLeft + (e.clientX - d.startX),
        d.originTop + (e.clientY - d.startY),
        w,
        h,
      );
      setPos(free);

      const hit = hitEdge(free.left, free.top, w, h, e.clientX, e.clientY);
      setPreviewEdge(hit);
      if (hit) {
        const pv = previewSize(orientation, hit, w, h);
        setPreviewPos(pinToEdge(hit, pv.w, pv.h, free.left, free.top));
      }
    }
    function onUp(e: PointerEvent) {
      const d = dragRef.current;
      if (!d || e.pointerId !== d.pointerId) return;
      dragRef.current = null;
      setDragging(false);
      setPreviewEdge(null);

      const el = rootRef.current;
      if (!el) return;
      const w = el.offsetWidth;
      const h = el.offsetHeight;
      const free = clampPos(
        d.originLeft + (e.clientX - d.startX),
        d.originTop + (e.clientY - d.startY),
        w,
        h,
      );
      setPos(free);

      const hit = hitEdge(free.left, free.top, w, h, e.clientX, e.clientY);
      if (hit) {
        if (edgeRef.current !== hit) {
          setShapesOpen(false);
          onReferenceOpenChange?.(false);
          edgeRef.current = hit;
          setEdge(hit);
        } else {
          setPos(pinToEdge(hit, w, h, free.left, free.top));
        }
      } else if (edgeRef.current) {
        // Released off a rail → free float (horizontal).
        setShapesOpen(false);
        onReferenceOpenChange?.(false);
        edgeRef.current = null;
        setEdge(null);
      }
    }
    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
    window.addEventListener("pointercancel", onUp);
    return () => {
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
      window.removeEventListener("pointercancel", onUp);
    };
  }, [dragging, orientation, setShapesOpen]);

  function onGripPointerDown(e: React.PointerEvent) {
    if (locked) return;
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
    setPreviewEdge(null);
    try {
      (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    } catch {
      // synthetic events throw — harmless
    }
  }

  const shapesActive = tool === "shapes" || isShapeTool(tool);
  const vertical = orientation === "vertical";
  const tooltipSide =
    edge === "left" ? "right" : edge === "right" ? "left" : "bottom";

  const barW = rootRef.current?.offsetWidth ?? (vertical ? 48 : 636);
  const barH = rootRef.current?.offsetHeight ?? (vertical ? 636 : 48);
  const pv =
    previewEdge != null
      ? previewSize(orientation, previewEdge, barW, barH)
      : { w: barW, h: barH };
  const showEdgePreview = dragging && previewEdge != null;

  const shapesPanel = (
    <div
      data-shapes-pack=""
      className="pointer-events-auto relative z-50 flex items-center gap-3 overflow-clip rounded-full px-3 py-2 antialiased"
      style={{ backgroundColor: PAPER.surface, fontFamily: PAPER.fontSans }}
      onPointerDown={(e) => e.stopPropagation()}
      onMouseEnter={openShapesPack}
      onMouseLeave={scheduleCloseShapesPack}
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
            tooltipSide={tooltipSide}
            onClick={() => pickTool(s.id)}
          >
            {s.icon}
          </PaperDockItem>
        );
      })}
    </div>
  );

  const referencePanel = (
    <ReferencePanelBody
      onClose={() => onReferenceOpenChange?.(false)}
      initialOffset={refPanelOffset}
      onPanelOffsetChange={setRefPanelOffset}
    />
  );

  const supportPanel = shapesOpen ? shapesPanel : referencePanel;
  const supportAnchorRef = shapesOpen ? shapesBtnRef : cameraBtnRef;

  return (
    <>
      {!locked && showEdgePreview && previewEdge ? (
        <div
          aria-hidden
          className="pointer-events-none fixed z-[19] rounded-full"
          style={{
            left: previewPos.left,
            top: previewPos.top,
            width: pv.w,
            height: pv.h,
            backgroundColor: PREVIEW_BLUE,
            opacity: 0.2,
          }}
        />
      ) : null}

      <div
        ref={rootRef}
        className={cn(
          "pointer-events-auto absolute z-20",
          dragging && "cursor-grabbing",
        )}
        style={
          locked || !pos
            ? defaultPlacement === "bottom-center" && !locked
              ? {
                  left: "50%",
                  bottom: 326,
                  transform: "translateX(-50%)",
                }
              : { right: PAPER.insetX, top: PAPER.insetTop }
            : { left: pos.left, top: pos.top }
        }
      >
      <GooeyConjoined
        open={supportOpen}
        panelKey={supportKey}
        panel={supportPanel}
        anchorRef={supportAnchorRef}
        side="bottom"
        gap={8}
        surface={PAPER.surface}
        panelOffset={shapesOpen ? undefined : refPanelOffset}
        panelClassName={cn(
          "overflow-visible",
          shapesOpen ? "!bg-transparent" : "rounded-xl",
        )}
      >
        <GooeyBarMorph orientation={orientation} surface={PAPER.surface}>
          <PaperDockBar variant="pill" orientation={locked ? "horizontal" : orientation}>
            {!locked && (
              <button
                type="button"
                onPointerDown={onGripPointerDown}
                aria-label="Move tool dock"
                title="Drag near left / right / top — release to dock"
                className={cn(
                  "relative grid shrink-0 cursor-grab touch-none place-items-center self-center transition-[opacity,scale] duration-150 ease-out before:absolute before:-inset-[6px] before:content-[''] active:cursor-grabbing",
                  vertical ? "h-[7px] w-[12px]" : "h-[12px] w-[7px]",
                  dragging
                    ? "opacity-100 scale-90"
                    : "opacity-60 hover:opacity-100 active:scale-90",
                )}
              >
                <LayerGripIcon size={12} />
              </button>
            )}

            {MAIN.map((t) => (
              <PaperDockItem
                key={t.id}
                label={t.label}
                shortcut={t.shortcut}
                active={tool === t.id}
                tooltipSide={tooltipSide}
                onClick={() => {
                  setShapesOpen(false);
                  onReferenceOpenChange?.(false);
                  setTool(t.id);
                }}
              >
                {t.id === "fill" ? (
                  <BucketToolIcon
                    key={fillPulse}
                    active={tool === "fill"}
                    filling={tool === "fill" && fillPulse > 0}
                  />
                ) : (
                  t.icon
                )}
              </PaperDockItem>
            ))}

            <div
              ref={shapesBtnRef}
              className="relative shrink-0"
              onMouseEnter={openShapesPack}
              onMouseLeave={scheduleCloseShapesPack}
            >
              <PaperDockItem
                label="Shapes"
                active={shapesActive || shapesOpen}
                tooltip={false}
                onClick={() => {
                  // Pack is hover/click-driven; don't arm a create tool here.
                  onReferenceOpenChange?.(false);
                  setShapesOpen(true);
                }}
              >
                <ShapesToolIcon />
              </PaperDockItem>
            </div>

            <PaperDockSep width={8} orientation={orientation} />

            <div ref={cameraBtnRef}>
              <PaperDockItem
                label="Camera"
                shortcut="2"
                active={referenceOpen}
                tooltipSide={tooltipSide}
                onClick={() => {
                  setShapesOpen(false);
                  onReferenceOpenChange?.(!referenceOpen);
                }}
              >
                <CameraToolIcon />
              </PaperDockItem>
            </div>
            <PaperDockItem
              label="Reference"
              shortcut="1"
              tooltipSide={tooltipSide}
              onClick={() => {
                setShapesOpen(false);
                onReferenceOpenChange?.(false);
                onReference?.();
              }}
            >
              <ReferenceToolIcon />
            </PaperDockItem>
          </PaperDockBar>
        </GooeyBarMorph>
      </GooeyConjoined>
      </div>
    </>
  );
}

/** @deprecated use ReferencePanel — kept as alias for callers */
export { ReferencePanel as ReferenceBox } from "@/components/chrome/ReferencePanel";
