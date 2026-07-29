import { useState, type ReactNode } from "react";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { cn } from "@/lib/utils";
import * as DropdownMenuPrimitive from "@radix-ui/react-dropdown-menu";
import { EyeOff2, Trash } from "reicon-react";
import LayerGripIcon from "@/components/ui/layer-grip-icon";
import DotsHorizontalIcon from "@/components/ui/dots-horizontal-icon";
import { PaperEyeGlyph } from "@/components/timeline/TimelineDockParts";
import { PAPER } from "@/components/chrome/paper-tokens";
import { EASE_OUT_CSS, SPRING_SWAP } from "@/lib/ease";
import { resolveCelIndex, type Layer } from "@/model/types";

/**
 * One exposure-sheet row — Paper 2LM-0 `A2M-0`, with the hover treatment from
 * `61L-0` ("Selectable Layer, the more button becomes delete").
 *
 * Each layer is its own card (28px tall: 4px padding + a 20px band), cards
 * stack 4px apart. The label column is a fixed lane so grips, eyes and pills
 * Shared layer-row shell — Paper "layer" (2W5-0 stop-motion / 6JD-0 Animatron).
 * Label lane is sticky so it stays pinned while the track scrolls inside the
 * parent nano ScrollArea.
 * Timeline owns.
 *
 * Motion notes — everything animates `transform` / `opacity` / colour, never a
 * layout property, because the frame grid is 80+ cells × 7 rows:
 * - the tint and the pill cross-fade over `TINT_MS` so the row warms rather
 *   than snaps;
 * - `⋮` → trash is a scale cross-fade in a single stacked grid cell, not a
 *   hard element replace;
 * - reorder offsets ease over `LAYER_DROP_MS` for every row *except* the one
 *   under the pointer, which must track 1:1 (`animateOffset === false`).
 */

/** +20% over Paper's spec (28/4/20/4/104) — D's explicit timeline-scale override. */
export const LAYER_ROW_H = 34;
export const LAYER_ROW_GAP = 5;
/** row-to-row pitch, used by the reorder drag to pick a target index */
export const LAYER_ROW_PITCH = LAYER_ROW_H + LAYER_ROW_GAP;
export const CELL_H = 24;
export const CELL_GAP = 5;
/** grip 8 + 7 + eye 14 + 7 + pill 88 */
export const LABEL_COL_W = 125;
/**
 * Animatron adds a 14px Animate/Static toggle + 7px gap after the eye
 * (grip 8 + 7 + eye 14 + 7 + toggle 14 + 7 + pill 88 = 146).
 */
export const LABEL_COL_W_ANIMATRON = 146;
/** card padding (5+5) + the 10px gap after the label lane */
export const CELLS_INSET = LABEL_COL_W + 10 + 10;
export const CELLS_INSET_ANIMATRON = LABEL_COL_W_ANIMATRON + 10 + 10;
/** cells inset once the label lane is hidden (Paper 68F-0 "collapse layers") — just the card padding */
export const CELLS_INSET_COLLAPSED = 10;

/** rows making room, and the dropped row settling into its slot */
export const LAYER_DROP_MS = 190;
/** frame-cell state change (playhead, hover wash) */
const CELL_MS = 130;

/**
 * The row card + label lane, with the track content supplied as `children`.
 *
 * Stop-motion fills it with frame cells (`TimelineLayerRow` below); Animatron
 * fills it with clip bars (`ClipTimeline`). Both workflows therefore share one
 * row design — grip, eye, name pill, hover tint and `⋮`→trash all behave
 * identically, which is the whole point of the split.
 */
export function TimelineRowShell({
  layer,
  active,
  canDelete,
  menuOpen,
  dragging,
  dragOffset,
  animateOffset,
  showLabels = true,
  labelColW = LABEL_COL_W,
  afterEye,
  onMenuOpenChange,
  onSelectLayer,
  onToggleVisible,
  onGripPointerDown,
  onDelete,
  children,
  className,
}: {
  layer: Layer;
  active: boolean;
  canDelete: boolean;
  menuOpen: boolean;
  dragging: boolean;
  dragOffset: number;
  /** ease the offset (rows making room / the drop settling) vs. track the pointer */
  animateOffset: boolean;
  /** false hides the grip/eye/name-pill lane — "collapse layers" (Paper 68F-0) */
  showLabels?: boolean;
  /** label lane width — Animatron uses `LABEL_COL_W_ANIMATRON` for the toggle */
  labelColW?: number;
  /** optional control after the eye (Animatron Animate/Static toggle) */
  afterEye?: ReactNode;
  onMenuOpenChange: (open: boolean) => void;
  onSelectLayer: () => void;
  onToggleVisible: () => void;
  onGripPointerDown: (e: React.PointerEvent) => void;
  onDelete: () => void;
  /** track lane content — frame cells or clip bars */
  children: ReactNode;
  className?: string;
}) {
  const [hovered, setHovered] = useState(false);
  const reduce = useReducedMotion() ?? false;
  /**
   * Hover treatment is hover-only — the selected layer must NOT sit permanently
   * lit (Paper draws every pill identically in the stop-motion player). The two
   * exceptions are deliberate: a row keeps its delete affordance while the
   * confirm flyout is open, and a lifted row stays lit if the pointer slips off.
   */
  const lit = hovered || menuOpen || dragging;

  const swapTransition = reduce
    ? { duration: 0 }
    : { ...SPRING_SWAP, opacity: { duration: 0.11 } };

  const rowTransition = [
    `box-shadow ${LAYER_DROP_MS}ms ${EASE_OUT_CSS}`,
    // only the rows making room (and the settling drop) ease their offset —
    // the row under the pointer must not lag behind the cursor
    animateOffset && !reduce ? `transform ${LAYER_DROP_MS}ms ${EASE_OUT_CSS}` : null,
  ]
    .filter(Boolean)
    .join(", ");

  return (
    <div
      className={cn(
        "flex w-full min-w-max shrink-0 cursor-pointer items-start gap-[10px] rounded-[14px] p-[5px]",
        dragging && "relative z-10 cursor-grabbing",
        className,
      )}
      style={{
        height: LAYER_ROW_H,
        backgroundColor: lit ? PAPER.rowActiveBg : PAPER.trackBg,
        // transform-only lift: the 28px card never re-lays-out
        transform: dragOffset
          ? `translateY(${dragOffset}px)${dragging && !reduce ? " scale(1.015)" : ""}`
          : undefined,
        boxShadow: dragging ? "0 6px 16px rgba(0,0,0,0.5)" : undefined,
        transition: rowTransition,
      }}
      onPointerEnter={() => setHovered(true)}
      onPointerLeave={() => setHovered(false)}
      onClick={onSelectLayer}
      aria-current={active ? "true" : undefined}
    >
      {/* label lane — sticky so it stays pinned while the track scrolls */}
      {showLabels && (
      <div
        className="sticky left-0 z-[2] flex shrink-0 items-center gap-[7px]"
        style={{
          width: labelColW,
          height: CELL_H,
          backgroundColor: lit ? PAPER.rowActiveBg : PAPER.trackBg,
        }}
      >
        <button
          type="button"
          onPointerDown={onGripPointerDown}
          onClick={(e) => e.stopPropagation()}
          aria-label={`Reorder ${layer.name}`}
          title="Drag to reorder"
          className={cn(
            "relative grid h-[14px] w-[8px] shrink-0 cursor-grab touch-none place-items-center transition-[opacity,scale] duration-150 ease-out before:absolute before:-inset-[7px] before:content-[''] active:cursor-grabbing",
            lit ? "opacity-100" : "opacity-60 hover:opacity-100",
            !reduce && "active:scale-90",
          )}
        >
          <LayerGripIcon size={14} />
        </button>
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            onToggleVisible();
          }}
          aria-label={layer.visible ? `Hide ${layer.name}` : `Show ${layer.name}`}
          aria-pressed={!layer.visible}
          className={cn(
            "relative grid h-[14px] w-[14px] shrink-0 cursor-pointer place-items-center transition-[opacity,scale] duration-150 ease-out before:absolute before:-inset-[7px] before:content-['']",
            layer.visible ? "opacity-70 hover:opacity-100" : "opacity-40 hover:opacity-70",
            !reduce && "active:scale-90",
          )}
        >
          {layer.visible ? <PaperEyeGlyph size={14} /> : <EyeOff2 size={14} weight="Filled" />}
        </button>

        {afterEye}

        {/* name pill — 88px; `⋮` becomes delete once the row is lit (Paper 61L-0) */}
        <div
          className="flex shrink-0 items-center justify-between gap-[8px] overflow-clip rounded-[8px] px-[5px] py-1"
          style={{
            width: 88,
            backgroundColor: lit ? PAPER.pillActiveBg : PAPER.layerPill,
            border: `0.4px solid ${lit ? PAPER.pillActiveBorder : PAPER.borderHairline}`,
          }}
        >
          <span
            className="min-w-0 flex-1 truncate text-left text-[12px] leading-[14px] text-white"
            style={{ fontFamily: PAPER.fontMono }}
            title={layer.name}
          >
            {layer.name}
            {layer.isStatic && <span className="ml-1 opacity-50">∞</span>}
          </span>
          <DropdownMenuPrimitive.Root
            open={menuOpen}
            onOpenChange={(open) => {
              // last layer: hover shows disabled delete — don't open the flyout
              if (open && lit && !canDelete) return;
              onMenuOpenChange(open);
            }}
          >
            <DropdownMenuPrimitive.Trigger asChild>
              <button
                type="button"
                onClick={(e) => e.stopPropagation()}
                aria-label={
                  lit
                    ? canDelete
                      ? `Delete ${layer.name}`
                      : `Can't delete the only layer`
                    : `${layer.name} menu`
                }
                aria-disabled={lit && !canDelete ? true : undefined}
                className={cn(
                  "relative grid h-[14px] w-[14px] shrink-0 place-items-center transition-[opacity,scale] duration-150 ease-out before:absolute before:-inset-[5px] before:content-['']",
                  lit && !canDelete
                    ? "cursor-not-allowed opacity-35"
                    : "cursor-pointer opacity-80 hover:opacity-100",
                  !reduce && !(lit && !canDelete) && "active:scale-90",
                )}
              >
                {/* both glyphs share one grid cell so the swap cross-fades in place */}
                <AnimatePresence initial={false}>
                  {lit ? (
                    <motion.span
                      key="trash"
                      className="grid place-items-center [grid-area:1/1]"
                      initial={{ opacity: 0, scale: 0.55 }}
                      animate={{ opacity: 1, scale: 1 }}
                      exit={{ opacity: 0, scale: 0.55 }}
                      transition={swapTransition}
                    >
                      <Trash
                        size={14}
                        color={canDelete ? PAPER.deleteIcon : PAPER.textMuted}
                      />
                    </motion.span>
                  ) : (
                    <motion.span
                      key="dots"
                      className="grid place-items-center [grid-area:1/1]"
                      initial={{ opacity: 0, scale: 0.55 }}
                      animate={{ opacity: 1, scale: 1 }}
                      exit={{ opacity: 0, scale: 0.55 }}
                      transition={swapTransition}
                    >
                      <DotsHorizontalIcon size={14} />
                    </motion.span>
                  )}
                </AnimatePresence>
              </button>
            </DropdownMenuPrimitive.Trigger>
            <DropdownMenuPrimitive.Portal>
              <DropdownMenuPrimitive.Content
                side="bottom"
                align="center"
                sideOffset={6}
                className="z-50 outline-none"
              >
                <DropdownMenuPrimitive.Item asChild disabled={!canDelete}>
                  <motion.button
                    type="button"
                    onClick={onDelete}
                    disabled={!canDelete}
                    initial={reduce ? false : { opacity: 0, scale: 0.92, y: -4 }}
                    animate={{ opacity: 1, scale: 1, y: 0 }}
                    transition={reduce ? { duration: 0 } : SPRING_SWAP}
                    className="flex cursor-pointer items-center justify-between gap-[8px] overflow-clip rounded-[8px] px-[10px] py-[7px] text-[12px] leading-[14px] outline-none disabled:cursor-not-allowed disabled:opacity-40"
                    style={{
                      backgroundColor: PAPER.deleteBg,
                      border: `1px solid ${PAPER.deleteBorder}`,
                      boxShadow: "0 2px 4px #00000033",
                      color: PAPER.deleteText,
                      fontFamily: PAPER.fontSans,
                      letterSpacing: "0.04em",
                    }}
                  >
                    <Trash size={14} color={PAPER.deleteIcon} />
                    <span className="whitespace-nowrap">Delete {layer.name}</span>
                  </motion.button>
                </DropdownMenuPrimitive.Item>
              </DropdownMenuPrimitive.Content>
            </DropdownMenuPrimitive.Portal>
          </DropdownMenuPrimitive.Root>
        </div>
      </div>
      )}

      {children}
    </div>
  );
}

/** Stop-motion exposure row — the shared shell filled with frame cells. */
export function TimelineLayerRow({
  frameCount,
  frameIndex,
  cellWidth,
  onSelectCell,
  ...shell
}: Omit<Parameters<typeof TimelineRowShell>[0], "children"> & {
  frameCount: number;
  frameIndex: number;
  cellWidth: number;
  onSelectCell: (frame: number) => void;
}) {
  const { layer } = shell;
  const reduce = useReducedMotion() ?? false;

  return (
    <TimelineRowShell {...shell}>
      {/* frame cells — grow with the row; nano ScrollArea owns the X scroll */}
      <div className="min-w-0 flex-1" style={{ height: CELL_H }}>
        <div className="flex w-max" style={{ gap: CELL_GAP }}>
          {Array.from({ length: frameCount }, (_, fi) => {
            const isKey = layer.isStatic ? fi === 0 : !!layer.frames[fi];
            const isHold = !isKey && !layer.isStatic && resolveCelIndex(layer, fi) !== null;
            const isPlayhead = fi === frameIndex;
            return (
              <button
                key={fi}
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  onSelectCell(fi);
                }}
                title={`${layer.name} · frame ${fi + 1}`}
                aria-current={isPlayhead ? "true" : undefined}
                className={cn(
                  "flex shrink-0 cursor-pointer justify-center rounded-[8px] px-[2px] py-[7px] hover:brightness-150",
                  isHold ? "items-center" : "items-start",
                  !reduce && "active:scale-90",
                )}
                style={{
                  width: cellWidth,
                  height: CELL_H,
                  backgroundColor: isPlayhead ? PAPER.frameActive : PAPER.cellBg,
                  border: `0.4px solid ${
                    isPlayhead ? PAPER.frameActiveBorder : PAPER.borderHairline
                  }`,
                  transition: `background-color ${CELL_MS}ms ${EASE_OUT_CSS}, border-color ${CELL_MS}ms ${EASE_OUT_CSS}, filter ${CELL_MS}ms ${EASE_OUT_CSS}, scale ${CELL_MS}ms ${EASE_OUT_CSS}`,
                }}
              >
                {isKey ? (
                  <span
                    className="h-[7px] w-[7px] shrink-0 rounded-full bg-white"
                    style={{
                      scale: isPlayhead && !reduce ? "1.3" : "1",
                      transition: `scale ${CELL_MS}ms ${EASE_OUT_CSS}`,
                    }}
                  />
                ) : isHold ? (
                  <span
                    className="h-[2px] w-[7px] shrink-0 rounded-full bg-white"
                    style={{
                      opacity: isPlayhead ? 0.55 : 0.3,
                      transition: `opacity ${CELL_MS}ms ${EASE_OUT_CSS}`,
                    }}
                  />
                ) : null}
              </button>
            );
          })}
        </div>
      </div>
    </TimelineRowShell>
  );
}
