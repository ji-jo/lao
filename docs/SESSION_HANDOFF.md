# lao session handoff — Cursor UI Delegation

**Date:** 2026-07-28
**Commit:** `73acb83` (feat: core functionality audit, pen tool, boil undo, legacy easing fix)
**Branch:** `master`
**Dev:** `bun run dev` → http://localhost:5173 

Read `AGENTS.md`, `docs/ARCHITECTURE.md`, `docs/ROADMAP.md`, `docs/MVP1_REQUIREMENTS.md` first.

**⚠️ Multiple agents may edit this tree concurrently.** 
A parallel Claude session is currently active and implementing a new text animation engine feature ("Apple Hello Effect").
To avoid merge conflicts and logic breakages, **this Cursor session MUST strictly isolate itself to the UI surfaces defined below.** Do not touch core engine code, rendering logic, or global state definitions (`src/engine/`, `src/state/`) without extreme care, and prefer local component state for your UI work.

---

## What landed in the previous session (Commit `73acb83`)

1. **Pen Tool / Bezier Bounding Boxes:** Implemented perfect hit-testing and bounding boxes for Bezier curves using a dense point flattening approach (`bezier.ts`), vastly improving selection interactions for drawn shapes. Added custom svg cursor for the pen tool.
2. **Boil Scrubber Undo:** Wired up `onValueCommit` in the custom slider primitives so that dragging Boil settings (amplitude, speed, etc) properly records a single atomic change to the Undo history on drag-end.
3. **`isLegacyVanishingEasing` False-Positive Fix:** Added `_userSet` flag to `ClipEasing` so intentional user fade-outs are no longer deleted on load by legacy migration logic.
4. **Cleanup:** Deleted unused `dynamic-island.tsx` and `overflow-actions.tsx` since settings are now consolidated in the bottom dock.

---

## Cursor Session Scope

Your task is to implement the following UI-specific features. Please tackle them one by one and keep your changes constrained to the React component layer (`src/components/`):

### 1. Timeline Design for Animatron
Update the Animatron mode timeline design according to the user's latest specs (refer to MVP1_REQUIREMENTS or the user's explicit instructions in this session). Ensure you don't break the existing standard timeline state logic.

### 2. Modal Implementation
Flesh out the design and interactions for any requested modals (e.g., feedback, settings, or export refinements). Continue using the established Fluid/Beui patterns and `GradientHoverButton` where applicable.

### 3. Tool Dock UI Change
Implement the requested visual or layout changes to the bottom Tool Dock (`src/components/chrome/ToolDock.tsx`). 

### 4. Feedback UI
Implement a new feedback/bug-report UI surface as requested by the user.

---

## Rules of Engagement for this Parallel Session

- **Do NOT run `git commit` or `git pull/push`**. The parallel Claude session is managing source control.
- **Do NOT touch `src/engine/*` or `src/state/*`** unless explicitly necessary and verified to not conflict with the text animation work happening in parallel.
- Always check `git diff` before saving to ensure you aren't overwriting Claude's real-time changes if you happen to touch a shared file.

---

## Verify before completing your session

```bash
npx tsc -b     # must stay clean
bun test       # must stay green
```

---

## Cursor session notes (2026-07-28 evening)

### Standing rules (D — do not regress)

1. **Primary button pulse** — gradient/pulse hover only while the pointer is on that
   button (`GradientHoverButton` JS hover state). Never CSS `:hover` that keeps pulsing
   after leave.
2. **Ship end-to-end** — a control that only switches UI state is not done. Tool dock,
   timeline rows, shapes pack, etc. must wire **input → model → preview/export** (or
   explicitly park as stub in ROADMAP). Shapes pack was chrome-only until canvas
   drag-to-create landed; do not repeat that pattern.
3. **`TimelineRowShell` is shared** (`TimelineLayerRow.tsx`) — stop-motion frame cells and
   Animatron clip bars both fill this shell (grip / eye / name / hover tint / ⋮→trash /
   reorder). Changes to the shell must work **both workflows** end-to-end; do not fork
   row chrome per mode.

### Shipped this session
- **SaveFirstDialog** (Paper `8BI-0`) — replaces `window.confirm` for mode switch + Ctrl+N / New. Three exits: cancel (X/Esc), skip without save, save-then-proceed (aborts if save picker cancelled).
- **Animatron Animate/Static toggle** — per-line control after the eye. Static = `{ startMs: 0, durationMs: 0 }` + zeroed fades via existing `updateStrokeClip` (no engine change). Full-span dimmed lane; no drag/resize.
- **Tool dock icons** — assets from `src/assets/icons/tools/` (currentColor wrappers). Order: Pointer, Path (a beside v), Brush, Pen, Marker, Bucket, Text, Erase, Hand, Shapes, |, Camera, Reference. Shapes gooey pack below chip (`GooeyConjoined`, Paper `9IV-0`).
- **Shapes end-to-end** — `engine/shapeGeometry.ts` + `StageCanvas` drag rubber-band; Shift = aspect/45°; Alt = from center; Esc cancels; closed shapes use `fillColor` on `Stroke`. Flyout closes after pick (Figma-like).
- **Timeline scroll** — nano `ScrollArea` orientation both; wheel/trackpad remaps vertical→X when no Y overflow; Motion fade on thumbs; playhead stamp line is `pointer-events-none`.

### Engine handoff — known limitation
`applyClipEasing` in `src/state/project.ts` rewrites easing on **every** stroke that has a clip. After making a line Static, opening the Animation panel and applying a curve re-stamps `fadeInFrames: 4` and the "static" line starts fading in again. Fix: skip strokes whose `clip.durationMs === 0` inside that action. One-line change, but it lives in `src/state` — out of this session's scope.
