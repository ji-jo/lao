import { PAPER } from "@/components/chrome/paper-tokens";
import { useViewport } from "@/state/viewport";
import { useProject } from "@/state/project";

/** Paper bottom-left zoom + undo (2IX-0). */
export function ZoomDock() {
  const zoom = useViewport((s) => s.zoom);
  const { zoomIn, zoomOut } = useViewport();
  const undo = useProject((s) => s.undo);
  const redo = useProject((s) => s.redo);

  return (
    <div className="pointer-events-auto flex items-start gap-2">
      <div
        className="flex items-center gap-2 overflow-clip rounded-[7px] px-1 py-[3px] antialiased"
        style={{
          backgroundColor: PAPER.surfaceAlt,
          border: `0.4px solid ${PAPER.borderHairline}`,
        }}
      >
        <button
          type="button"
          onClick={zoomOut}
          className="px-0.5 text-sm opacity-60 hover:opacity-100"
          style={{ color: PAPER.text }}
          aria-label="Zoom out"
        >
          −
        </button>
        <span
          className="text-sm leading-[18px] text-white"
          style={{ fontFamily: PAPER.fontSans }}
        >
          {Math.round(zoom * 100)}%
        </span>
        <button
          type="button"
          onClick={zoomIn}
          className="px-0.5 text-sm opacity-60 hover:opacity-100"
          style={{ color: PAPER.text }}
          aria-label="Zoom in"
        >
          +
        </button>
        <span
          className="text-xs leading-3 opacity-60"
          style={{ color: PAPER.text, fontFamily: PAPER.fontSans }}
        >
          zoom
        </span>
      </div>
      <div
        className="flex items-start gap-2 overflow-clip rounded-[7px] px-1 py-[3px]"
        style={{
          backgroundColor: PAPER.surfaceAlt,
          border: `0.4px solid ${PAPER.borderHairline}`,
        }}
      >
        <button
          type="button"
          onClick={undo}
          className="grid size-4 place-items-center opacity-70 hover:opacity-100"
          aria-label="Undo"
        >
          <svg width={14} height={14} viewBox="0 0 24 24" fill="none" stroke={PAPER.textMuted} strokeWidth="1.5">
            <path d="M9 14 4 9l5-5" />
            <path d="M4 9h10.5a5.5 5.5 0 0 1 0 11H11" />
          </svg>
        </button>
        <button
          type="button"
          onClick={redo}
          className="grid size-4 place-items-center opacity-70 hover:opacity-100"
          aria-label="Redo"
        >
          <svg width={14} height={14} viewBox="0 0 24 24" fill="none" stroke={PAPER.textMuted} strokeWidth="1.5">
            <path d="m15 14 5-5-5-5" />
            <path d="M20 9H9.5a5.5 5.5 0 0 0 0 11H13" />
          </svg>
        </button>
      </div>
    </div>
  );
}
