import { useEffect, useRef, useState } from "react";
import { PenNib } from "reicon-react";
import MousePointer2Icon from "@/components/ui/mouse-pointer-2-icon";
import LetterPIcon from "@/components/ui/letter-p-icon";
import LetterEIcon from "@/components/ui/letter-e-icon";
import PaintIcon from "@/components/ui/paint-icon";
import CameraIcon from "@/components/ui/camera-icon";
import UploadIcon from "@/components/ui/upload-icon";
import {
  PaperDockBar,
  PaperDockItem,
  PaperDockSep,
  ConjoinedDock,
} from "@/components/chrome/PaperDockPrimitives";
import { useTools, isShapeTool, type ToolId, type ShapeToolId } from "@/state/tools";
import { useReference } from "@/state/reference";
import { cn } from "@/lib/utils";

const MAIN: {
  id: ToolId;
  label: string;
  shortcut: string;
  icon: (size: number) => React.ReactNode;
}[] = [
  {
    id: "select",
    label: "Select",
    shortcut: "v",
    icon: (s) => <MousePointer2Icon size={s} />,
  },
  {
    id: "path",
    label: "Path",
    shortcut: "a",
    icon: (s) => (
      <svg width={s} height={s} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6">
        <path d="M11 21 8 13 2 10l19-7-10 18z" />
      </svg>
    ),
  },
  {
    id: "ink",
    label: "Ink",
    shortcut: "b",
    icon: (s) => <PenNib size={s} />,
  },
  {
    id: "pen",
    label: "Pen",
    shortcut: "p",
    icon: (s) => <LetterPIcon size={s} />,
  },
  {
    id: "fill",
    label: "Fill",
    shortcut: "f",
    icon: (s) => <PaintIcon size={s} />,
  },
  {
    id: "eraser",
    label: "Eraser",
    shortcut: "e",
    icon: (s) => <LetterEIcon size={s} />,
  },
  {
    id: "text",
    label: "Text",
    shortcut: "t",
    icon: (s) => (
      <span className="font-serif text-[15px] font-semibold leading-none" style={{ fontSize: s * 0.85 }}>
        T
      </span>
    ),
  },
  {
    id: "hand",
    label: "Hand",
    shortcut: "h",
    icon: (s) => (
      <svg width={s} height={s} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6">
        <path d="M8 13V6a1.5 1.5 0 0 1 3 0v5M11 12V4.5a1.5 1.5 0 0 1 3 0V12M14 12V6.5a1.5 1.5 0 0 1 3 0V16a5 5 0 0 1-5 5h-1a5 5 0 0 1-5-5v-3.5a1.5 1.5 0 0 1 3 0V13" />
      </svg>
    ),
  },
];

const SHAPES: { id: ShapeToolId; label: string; shortcut: string; tip: string }[] = [
  { id: "rect", label: "Rectangle", shortcut: "r", tip: "r" },
  { id: "diamond", label: "Diamond", shortcut: "⇧r", tip: "⇧r" },
  { id: "circle", label: "Circle", shortcut: "o", tip: "o" },
  { id: "arrow", label: "Arrow Line", shortcut: "⇧l", tip: "⇧ + l" },
  { id: "line", label: "Line", shortcut: "l", tip: "l" },
];

function ShapeGlyph({ id, size }: { id: ShapeToolId; size: number }) {
  const s = size;
  if (id === "rect") {
    return (
      <svg width={s} height={s} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7">
        <rect x="5" y="6" width="14" height="12" rx="1.5" />
      </svg>
    );
  }
  if (id === "diamond") {
    return (
      <svg width={s} height={s} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7">
        <path d="M12 3.5 20.5 12 12 20.5 3.5 12z" />
      </svg>
    );
  }
  if (id === "circle") {
    return (
      <svg width={s} height={s} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7">
        <circle cx="12" cy="12" r="7" />
      </svg>
    );
  }
  if (id === "arrow") {
    return (
      <svg width={s} height={s} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7">
        <path d="M4 12h14M14 7l5 5-5 5" />
      </svg>
    );
  }
  return (
    <svg width={s} height={s} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7">
      <path d="M5 19 19 5" />
    </svg>
  );
}

/**
 * Paper tool dock (1FB-0) — hover 18→24, shortcut badges, tooltips,
 * conjoined shapes flyout (9IB-0). Camera/image triggers live in App via callbacks.
 */
export function ToolDock({
  onReference,
  onAddImage,
}: {
  onReference?: () => void;
  onAddImage?: () => void;
} = {}) {
  const tool = useTools((s) => s.tool);
  const setTool = useTools((s) => s.setTool);
  const shapesOpen = useTools((s) => s.shapesOpen);
  const setShapesOpen = useTools((s) => s.setShapesOpen);
  const shapesBtnRef = useRef<HTMLDivElement>(null);
  const rootRef = useRef<HTMLDivElement>(null);
  const [iconTick, setIconTick] = useState(18);

  // close shapes flyout on outside click
  useEffect(() => {
    if (!shapesOpen) return;
    function onDown(e: MouseEvent) {
      const t = e.target as Node;
      if (rootRef.current?.contains(t)) return;
      if (shapesBtnRef.current?.contains(t)) return;
      setShapesOpen(false);
    }
    window.addEventListener("mousedown", onDown);
    return () => window.removeEventListener("mousedown", onDown);
  }, [shapesOpen, setShapesOpen]);

  const shapesActive = tool === "shapes" || isShapeTool(tool);

  return (
    <div ref={rootRef} className="pointer-events-auto relative">
      <ConjoinedDock open={shapesOpen} side="bottom" anchorRef={shapesBtnRef}>
        {SHAPES.map((s) => (
          <PaperDockItem
            key={s.id}
            label={s.label}
            shortcut={s.tip}
            active={tool === s.id}
            onClick={() => setTool(s.id)}
          >
            <ShapeGlyph id={s.id} size={iconTick} />
          </PaperDockItem>
        ))}
      </ConjoinedDock>

      <PaperDockBar variant="pill">
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
            {t.icon(18)}
          </PaperDockItem>
        ))}

        <PaperDockSep width={8} />

        <div ref={shapesBtnRef}>
          <PaperDockItem
            label="Shapes"
            shortcut="s"
            active={shapesActive}
            onClick={() => {
              if (shapesOpen) {
                setShapesOpen(false);
              } else {
                setShapesOpen(true);
                if (!isShapeTool(tool)) setTool("shapes");
              }
            }}
          >
            <svg width={18} height={18} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6">
              <path d="M5 16.5 11 5.5 17 16.5z" fill="currentColor" stroke="none" />
              <circle cx="16" cy="15" r="5" />
            </svg>
          </PaperDockItem>
        </div>

        <PaperDockSep width={8} />

        <PaperDockItem
          label="Reference"
          shortcut="1"
          onClick={() => onReference?.()}
        >
          <CameraIcon size={18} />
        </PaperDockItem>
        <PaperDockItem label="Image" shortcut="2" onClick={() => onAddImage?.()}>
          <UploadIcon size={18} />
        </PaperDockItem>
      </PaperDockBar>

      {/* keep hover size in sync for shape glyphs via CSS class on parent — simplified */}
      <span className="sr-only" aria-hidden onFocus={() => setIconTick(18)} />
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
