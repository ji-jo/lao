import { useState } from "react";
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
 * line up across rows; only the cells scroll, at the shared `scrollLeft` the
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

export const LAYER_ROW_H = 28;
export const LAYER_ROW_GAP = 4;
/** row-to-row pitch, used by the reorder drag to pick a target index */
export const LAYER_ROW_PITCH = LAYER_ROW_H + LAYER_ROW_GAP;
export const CELL_H = 20;
export const CELL_GAP = 4;
/** grip 7 + 6 + eye 12 + 6 + pill 73 */
export const LABEL_COL_W = 104;
/** card padding (4+4) + the 8px gap after the label lane */
export const CELLS_INSET = LABEL_COL_W + 8 + 8;

/** row tint + pill cross-fade */
const TINT_MS = 140;
/** rows making room, and the dropped row settling into its slot */
export const LAYER_DROP_MS = 190;
/** frame-cell state change (playhead, hover wash) */
const CELL_MS = 130;

export function TimelineLayerRow({
  layer,
  active,
  frameCount,
  frameIndex,
  cellWidth,
  scrollLeft,
  canDelete,
  menuOpen,
  dragging,
  dragOffset,
  animateOffset,
  onMenuOpenChange,
  onSelectLayer,
  onToggleVisible,
  onSelectCell,
  onGripPointerDown,
  onDelete,
}: {
  layer: Layer;
  active: boolean;
  frameCount: number;
  frameIndex: number;
  cellWidth: number;
  scrollLeft: number;
  canDelete: boolean;
  menuOpen: boolean;
  dragging: boolean;
  dragOffset: number;
  /** ease the offset (rows making room / the drop settling) vs. track the pointer */
  animateOffset: boolean;
  onMenuOpenChange: (open: boolean) => void;
  onSelectLayer: () => void;
  onToggleVisible: () => void;
  onSelectCell: (frame: number) => void;
  onGripPointerDown: (e: React.PointerEvent) => void;
  onDelete: () => void;
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
    `background-color ${TINT_MS}ms ${EASE_OUT_CSS}`,
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
        "flex shrink-0 cursor-pointer items-start gap-2 overflow-clip rounded-[12px] p-1",
        dragging && "relative z-10 cursor-grabbing",
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
      {/* label lane — fixed width so every row aligns */}
      <div
        className="flex shrink-0 items-center gap-1.5"
        style={{ width: LABEL_COL_W, height: CELL_H }}
      >
        <button
          type="button"
          onPointerDown={onGripPointerDown}
          onClick={(e) => e.stopPropagation()}
          aria-label={`Reorder ${layer.name}`}
          title="Drag to reorder"
          className={cn(
            "relative grid h-3 w-[7px] shrink-0 cursor-grab touch-none place-items-center transition-[opacity,scale] duration-150 ease-out before:absolute before:-inset-1.5 before:content-[''] active:cursor-grabbing",
            lit ? "opacity-100" : "opacity-60 hover:opacity-100",
            !reduce && "active:scale-90",
          )}
        >
          <LayerGripIcon size={12} />
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
            "relative grid h-3 w-3 shrink-0 cursor-pointer place-items-center transition-[opacity,scale] duration-150 ease-out before:absolute before:-inset-1.5 before:content-['']",
            layer.visible ? "opacity-70 hover:opacity-100" : "opacity-40 hover:opacity-70",
            !reduce && "active:scale-90",
          )}
        >
          {layer.visible ? <PaperEyeGlyph size={12} /> : <EyeOff2 size={12} weight="Filled" />}
        </button>

        {/* name pill — 73px; `⋮` becomes delete once the row is lit (Paper 61L-0) */}
        <div
          className="flex shrink-0 items-center justify-between gap-[7px] overflow-clip rounded-[7px] px-1 py-[3px]"
          style={{
            width: 73,
            backgroundColor: lit ? PAPER.pillActiveBg : PAPER.layerPill,
            border: `0.4px solid ${lit ? PAPER.pillActiveBorder : PAPER.borderHairline}`,
            transition: `background-color ${TINT_MS}ms ${EASE_OUT_CSS}, border-color ${TINT_MS}ms ${EASE_OUT_CSS}`,
          }}
        >
          <span
            className="min-w-0 flex-1 truncate text-left text-[10px] leading-3 text-white"
            style={{ fontFamily: PAPER.fontMono }}
            title={layer.name}
          >
            {layer.name}
            {layer.isStatic && <span className="ml-1 opacity-50">∞</span>}
          </span>
          <DropdownMenuPrimitive.Root open={menuOpen} onOpenChange={onMenuOpenChange}>
            <DropdownMenuPrimitive.Trigger asChild>
              <button
                type="button"
                onClick={(e) => e.stopPropagation()}
                aria-label={lit ? `Delete ${layer.name}` : `${layer.name} menu`}
                className={cn(
                  "relative grid h-3 w-3 shrink-0 cursor-pointer place-items-center opacity-80 transition-[opacity,scale] duration-150 ease-out before:absolute before:-inset-1 before:content-[''] hover:opacity-100",
                  !reduce && "active:scale-90",
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
                      <Trash size={12} color={PAPER.deleteIcon} />
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
                      <DotsHorizontalIcon size={12} />
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
                    className="flex cursor-pointer items-center justify-between gap-[7px] overflow-clip rounded-[7px] px-2 py-1.5 text-[10px] leading-3 outline-none disabled:cursor-not-allowed disabled:opacity-40"
                    style={{
                      backgroundColor: PAPER.deleteBg,
                      border: `1px solid ${PAPER.deleteBorder}`,
                      boxShadow: "0 2px 3px #00000033",
                      color: PAPER.deleteText,
                      fontFamily: PAPER.fontSans,
                      letterSpacing: "0.04em",
                    }}
                  >
                    <Trash size={12} color={PAPER.deleteIcon} />
                    <span className="whitespace-nowrap">Delete {layer.name}</span>
                  </motion.button>
                </DropdownMenuPrimitive.Item>
              </DropdownMenuPrimitive.Content>
            </DropdownMenuPrimitive.Portal>
          </DropdownMenuPrimitive.Root>
        </div>
      </div>

      {/* frame cells — shared horizontal offset, native bar suppressed */}
      <div className="min-w-0 flex-1 overflow-hidden" style={{ height: CELL_H }}>
        <div
          className="flex w-max"
          style={{ gap: CELL_GAP, transform: `translateX(${-scrollLeft}px)` }}
        >
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
                  "flex shrink-0 cursor-pointer justify-center rounded-[7px] px-0.5 py-1.5 hover:brightness-150",
                  isHold ? "items-center" : "items-start",
                  // a cell is exactly CELL_H tall inside an overflow-hidden lane,
                  // so it may only ever scale *down* — a hover lift would clip.
                  // Never width/height: that is layout thrash on 80+ × 7 cells.
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
                    className="h-1.5 w-1.5 shrink-0 rounded-full bg-white"
                    style={{
                      scale: isPlayhead && !reduce ? "1.3" : "1",
                      transition: `scale ${CELL_MS}ms ${EASE_OUT_CSS}`,
                    }}
                  />
                ) : isHold ? (
                  <span
                    className="h-0.5 w-1.5 shrink-0 rounded-full bg-white"
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
    </div>
  );
}
