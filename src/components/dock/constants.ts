// Dock height. Capsule, cap SVG, and marker clip-frame all scale off this; don't let them drift apart.
export const DOCK_H = 90;

// Fixed capsule width. Upstream sized the tray to its content (`max-content`);
// with the nav and links removed we pin it so the pill keeps a deliberate shape.
export const DOCK_W = 529;

// Preserve the sliders' comfortable 284px run while giving the picker a clear
// 16px inset on every edge.
export const COLOR_PICKER_W = 284 + 16 * 2;

// MarkerRow's natural box (3 pens x 71px - one gap, full DOCK_H tall). The side layout rotates the row
// 90deg, so its wrapper reserves the rotated bounding box (width/height swapped).
export const ROW_W = 187;
export const ROW_H = DOCK_H;

// Opaque ink crossfade (pen tips dissolve old->new), shared so row + popovers stay in lockstep.
// Translucent marks morph in OKLCH instead (useAnimatedColor): crossfading translucent ink double-darkens.
export const INK_FADE_MS = 180;

// Desktop dock shrink tiers (viewport width, px). The full tray is ~730px wide; as the window
// narrows we shed sections so it never crowds the edges: drop the colour palette first, then the
// pens (leaving just nav + links, like the touch dock). Tune these if the spacing feels off.
export const DOCK_COLORS_MIN = 800; // at or above: show the colour palette
export const DOCK_PENS_MIN = 600; // at or above: show the pens (below: nav + links only)

// Inset from the viewport edge for the resting bottom tray and side-docked pill.
export const EDGE_INSET = 24;

// Side-dock shrink tiers (viewport height, px). Same shed order as width: colours first, then pens.
// Vertical layout stacks nav → pens → colours → links (~729px content); thresholds include 2×
// EDGE_INSET so the centred pill fits between the viewport edges.
export const DOCK_SIDE_COLORS_MIN = 729 + EDGE_INSET * 2; // ~777: show the colour palette
export const DOCK_SIDE_PENS_MIN = 532 + EDGE_INSET * 2; // ~580: show the pens (below: nav + links)

// Side-docked grabber: invisible full-height strip along the inner edge so pen hits never steal the handle.
export const GRABBER_SAFETY_STRIP = 5;
