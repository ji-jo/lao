# lao session handoff — timeline chrome, WorkflowBar, Export modal, Animatron fade bug

**Date:** 2026-07-27
**Commit:** working tree on top of `b71951c` (not yet committed — see below)
**Branch:** `master`
**Dev:** `bun run dev` → http://localhost:5173 (Vite may pick another port if busy; `$PORT` honored). Installs: `npm install` only (exFAT — never `bun install`).

Read `AGENTS.md`, `docs/ARCHITECTURE.md`, `docs/ROADMAP.md`, `docs/MVP1_REQUIREMENTS.md` first
(MVP1 overrides AGENTS.md on UI layout where they disagree). This file is the **delta** since
`b71951c` so Claude/Cursor can continue without re-deriving context.

**⚠️ This repo has no git remote.** `git pull`/`fetch` will not work — there is nothing to
pull from. Coordinate directly (Cursor/Claude in the same working tree) rather than assuming
a shared remote exists.

---

## What landed this session (by area)

### 1. StatusIsland removed

`src/components/chrome/StatusIsland.tsx` deleted. It was already unmounted (zero importers)
and `docs/MVP1_REQUIREMENTS.md` mandates its removal ("Do not leave two settings surfaces").
Settings live only in the conjoined docks (`SettingsDocks.tsx`). `AGENTS.md`'s UI-layout
section was rewritten to describe this — it previously called StatusIsland "THE settings
panel", which was stale and is why this got re-litigated. `motion/dynamic-island.tsx` is now
unused but left installed (allowed-source component; delete only if you want it fully gone).

### 2. WorkflowBar — real inline expand, not a dropdown

**File:** `src/components/chrome/WorkflowBar.tsx`

Paper `106-0` shows the file menu as the **bar itself growing sideways** with Open/New/Save/
Export appearing as inline pills, ellipsis morphing into an X (`ellipsis-icon.tsx` /
`ellipsis-close-icon.tsx`, both pre-existing, previously unused). The old implementation was a
vertical `absolute` dropdown — replaced entirely.

- Expansion is `motion.div` animating `width: 0 ↔ "auto"` (from `motion/react`), **not** a pure
  CSS `grid-template-columns: 0fr → 1fr` trick — that trick relies on `fr` distributing free
  space and this bar is shrink-to-fit inside a flex row, so `1fr` silently resolves to `0` and
  the bar never grows. Verified live: collapsed 299px ↔ expanded 553px, both matching Paper's
  math exactly.
- Hover fill `#252525` (Paper `103-0`) on file pills, the inactive mode pill, and the ellipsis
  toggle — via `onPointerEnter/Leave` setting `style.backgroundColor` directly (not a CSS class)
  after finding a real bug in the timeline dock the same session (see §5) where two competing
  Tailwind `before:bg-*` classes raced on specificity and silently lost.
- New paper-tokens: `pillHover` (`#252525`), `ellipsisIcon` (`#D9D9D9`), `fontSerif`
  (`'Redaction 35'`, used later by the Export modal title).
- Collapsed pills stay in the DOM (`tabIndex={-1}`, `aria-hidden`) during animation so the
  width transition has real content to measure, then re-enter the tab order on open.

### 3. Animatron shares stop-motion's row design

**Files:** `src/components/timeline/TimelineLayerRow.tsx`, `ClipTimeline.tsx`

Extracted `TimelineRowShell` — the card, label lane (grip/eye/name-pill), hover tint,
`⋮`→trash cross-fade, and pointer-drag reorder — out of `TimelineLayerRow`, which now wraps it
with frame cells as `children`. `ClipTimeline` (Animatron) was rewritten from a completely
separate, plain implementation to use the **same shell** with clip bars as `children`. Both
workflows' layer rows are now pixel-identical apart from the track content.

Also added the Animatron clip playhead per Paper `63D-0`: a 14px column with a rounded
`#6E231B` time badge (`"1.5s"` style label) over a `#66261D` 1px line spanning the full row
stack (`ClipPlayhead` in `ClipTimeline.tsx`). New tokens: `clipPlayheadBadge`,
`clipPlayheadLine`.

Verified live: switched to Animatron, added layers, confirmed shared shell (88px name pill,
`Reorder`/`Hide`/menu buttons identical to stop-motion) and the playhead badge reading exactly
`(frame/fps)` — e.g. frame 18 @ 12fps → `"1.5s"`.

### 4. Timeline timing bar — fixes from a prior round in this same session

**File:** `src/components/timeline/TimelineTimingBar.tsx`, `TimelineDockParts.tsx`

Cleanup after D flagged duplicated/wrong controls:
- **Auto-key**: was duplicated (StatusIsland's old switch + the timing-bar record dot bound to
  the same `tools.jitterByDefault`/`autoKey` flag). Now only the timing-bar record dot exists
  (Paper `AMQ-0`/`AMR-0`, same glyph as Animatron's `6LS-0`).
- **Collapse**: was duplicated (a fabricated "Collapse timeline" button + the real "Collapse
  layers" button, `AMM-0`/`68F-0` — confirmed via Paper `get_jsx` to be byte-identical icons).
  The fabricated one is gone; the whole-player collapse affordance is the drag handle above the
  dock, not a second button in the bar.
- **`AMY-0` mislabel**: a glyph I'd used for "fit to width" turned out (per Paper `get_jsx`) to
  be a different node entirely — D corrected it, then asked to remove the "Bring to layer 1"
  feature outright. Both the "First frame" duplicate (from Animatron's `6M0-0`, wrongly placed
  in the stop-motion-only bar) and the fit/bring-to-layer1 button are now removed. Left cluster
  is exactly Paper's `AKB-0`: record dot → ms readout → nothing else.
- **Real hover bug found and fixed**: `DockBtn` (transport row icons) used a `::before`
  pseudo-element with both `before:bg-transparent` (unconditional) and `before:bg-[#313131]`
  (conditional) — two Tailwind classes targeting the same property with equal specificity,
  where whichever landed later in the compiled stylesheet always won, so hover never visibly
  applied regardless of class order in JSX. Rewrote the whole hover system to use `currentColor`
  SVG fills + plain `text-[#DADADA] hover:text-white` / `hover:bg-[#313131]` on the button
  itself — pure CSS `:hover`, no JS state, cannot silently fail to fire the way a React handler
  wired through a Tooltip wrapper theoretically could. Icon size vs button-box mismatches
  (`LoopIcon`/`ClearFrameIcon` defaulting bigger than their `DockBtn` box) fixed alongside.
- Hover radius standardized to **4px** everywhere in this bar (was a mix of 0/5/6/7/9px).
- `window.__lao` dev handle gained a `viewport` store (was missing `useViewport` entirely,
  which blocked headless verification of canvas zoom). `AGENTS.md` updated to match.

### 5. Export modal — full Paper redesign (`1CQ-0`)

**File:** `src/components/panels/ExportDialog.tsx`

Rebuilt from the old generic-shadcn-tabs layout to match Paper exactly: Redaction-35 serif
title, gradient close chip, segmented Video Type (MP4/WebM/GIF) + Quality (Low/Mid/High), a
**live preview canvas** painting the current frame through the actual export pipeline
(`paintProjectFrame`/`paintBackground`), an fps scrubber, an output-estimate readout, Close/Save
pills with Paper's exact gradients.

Per D: **only Video Type, Quality, and fps are configurable now** — Aspect ratio, Resolution,
the Transparent-background switch, and the APNG format were all removed (none are in Paper's
`1CQ-0`; Quality alone now derives output size via a long-edge-per-quality table crossed with
the canvas aspect ratio, dimensions forced even for H.264). fps scrubber reuses the exact same
`SliderComfortable variant="scrubber"` component `BgLabeledScrubber` uses in the background
panel (elastic drag, `#40608E` fill, `#252525` track) and **seeds from the canvas fps**.

**Real bug found and fixed while building this**: the preview canvas stayed stuck at the
browser default 300×150 — `DialogContent` defers mounting internally, so a plain `useRef` was
still `null` the one time an `[open, …]` effect would have run. Switched to a callback ref
(`useState<HTMLCanvasElement|null>` set via `ref={setPreviewEl}`) so the paint effect re-runs
the instant the canvas node actually attaches.

### 6. Export crop bug (D-reported, "4:3 canvas gets cropped")

**File:** `src/export/exportProject.ts`, `ExportDialog.tsx`

`run()` was resizing `project.width/height` directly to the Quality-derived output box before
encoding. Strokes are stored in **canvas coordinates** and painted 1:1, so shrinking the project
dims just clipped everything outside the new smaller box instead of scaling the drawing down —
D's 4:3 cat lost its feet/tail on export.

Fix: `ExportOptions` gained `width`/`height`. `exportProject` now sizes the encode canvas to
those (defaulting to the project size), applies **one** `ctx.scale(outW/width, outH/height)`,
and paints in project space as before — GIF's `getImageData`/`writeFrame` read the real output
dims since canvas transforms don't apply to pixel reads. `ExportDialog.run()` now only overrides
`fps` on the temp project, never `width`/`height` — those go through the new `ExportOptions`
instead. Loud comments on both sides warning against regressing this.

Verified via a real GIF encode + `ImageDecoder` pixel read: a 1600×1200 canvas with border
strokes hugging all four edges, exported to a 1080×810 box (deliberately smaller — the exact
crop scenario), produced 1080×810 output with all four edges still painted at the true corners.

### 7. Animatron paths vanishing from playback/export ("previous layers not showing")

**Files:** `src/model/types.ts`, `src/state/project.ts`, `src/engine/strokeProgress.test.ts`

Root cause: `DEFAULT_CLIP_EASING.fadeOutFrames` was `4`. `clipFadeOpacity` treats *any*
fade-out as "the stroke leaves the scene at clip end" — opacity ramps to 0 over the last 4
frames and **stays 0 forever after**, contradicting `strokeAtTime`'s own contract ("after
start+duration → full stroke, **held**"). Every finished Animatron path (= every layer except
the one currently drawing) disappeared from playback and export, though the live draw canvas
never applies this fade so editing looked fine.

Fix, three parts:
1. `DEFAULT_CLIP_EASING.fadeOutFrames` → **0**. New paths hold after drawing on. Fade-out is
   still available as a deliberate per-clip choice in the Animation panel.
2. **Migration in `loadProject`** (`migrateLegacyVanishingClips` in `project.ts`, using the new
   `isLegacyVanishingEasing` predicate in `types.ts`): rewrites exactly the old stamped
   combination (`smooth` / fadeIn 4 / fadeOut 4) to `fadeOut: 0` on load — covers both `.lao`
   open and autosave recovery. Anything a user set deliberately (different preset, or the same
   numbers reached via genuine intent) is **not** touched by the predicate as currently written,
   which is a known limitation — see Sensible next tasks.
3. Two regression tests in `strokeProgress.test.ts` pinning both directions: default holds
   forever, explicit fade-out still exits.

Verified end-to-end: three staggered Animatron paths, encoded to a real GIF, decoded frame 22
(long after every clip ended) — all three still visible, background otherwise clean.

---

## Key files touched this session

| Area | Path |
|------|------|
| Workflow/file bar | `src/components/chrome/WorkflowBar.tsx` |
| Deleted (StatusIsland) | ~~`src/components/chrome/StatusIsland.tsx`~~ |
| Shared row shell + stop-motion rows | `src/components/timeline/TimelineLayerRow.tsx` |
| Animatron clip rows + playhead | `src/components/timeline/ClipTimeline.tsx` |
| Timing bar (record/ms/collapse) | `src/components/timeline/TimelineTimingBar.tsx` |
| Dock icon primitives (`DockBtn` hover fix) | `src/components/timeline/TimelineDockParts.tsx` |
| Export modal | `src/components/panels/ExportDialog.tsx` |
| Export encode pipeline (crop fix) | `src/export/exportProject.ts` |
| Clip easing defaults + legacy predicate | `src/model/types.ts` |
| Clip easing migration on load | `src/state/project.ts` |
| Paper tokens (new: pillHover, ellipsisIcon, fontSerif, clipPlayhead*) | `src/components/chrome/paper-tokens.ts` |
| Dev handle (`viewport` added) | `src/main.tsx` |
| Regression tests | `src/engine/strokeProgress.test.ts` |

---

## Verify before continuing

```bash
npx tsc -b     # must stay clean
bun test       # 28/28 as of this handoff
```

Then in the running app: open the File menu (bar should grow, not drop down), switch to
Animatron and confirm layer rows look identical to stop-motion, open Export and confirm only
Video Type/Quality/fps show, export something and check the whole timeline range still has
content in the last frames (not just the most-recently-drawn path).

---

## Intentionally not committed

- `.tmp-*`, `tsc-out.txt` — scratch
- `.env.example`, `.claude/` — local/tooling

---

## Sensible next tasks

- [ ] `isLegacyVanishingEasing` only catches the *exact* stamped default (`smooth`/4/4). If a
      user genuinely chose those exact numbers on purpose pre-fix, migration will incorrectly
      flip them to hold. No way to distinguish intent from the stamped default after the fact —
      flag to D if it comes up, since it's a real (small) false-positive surface.
- [ ] Commit boil scrubbers with undo-on-pointer-up if undo spam becomes an issue (`setBoilLive`
      only today) — carried over from last handoff, still open.
- [ ] Re-verify Image Type/Zoom against Paper if D wants exact px again (`IMAGE_CONTROL_TRACK`
      nudge is intentional) — carried over, still open.
- [ ] `motion/dynamic-island.tsx` and `motion/overflow-actions.tsx` are both fully unused
      (zero importers, confirmed by grep) but left installed since they're allowed-source
      components, not obviously wrong the way StatusIsland was. Ask D before deleting.
- [ ] Export dialog's Quality→size table (720/1080/2160 long edge) is a fresh invention for
      this redesign, not derived from Paper (Paper's `1CQ-0` has no resolution numbers visible).
      If D wants specific target resolutions per quality tier, this is a two-constant edit in
      `ExportDialog.tsx` (`QUALITY_LONG_EDGE`).

---

## Quick mental model (unchanged from last handoff, still accurate)

```
[ Filter Properties side ] ← gooey neck → [ Canvas Background ]
                                              ↕ gooey neck
                                         [ setting dock bar ]
                                              ↑
                         panels also re-anchor to color / brush / aspect / background chips
```

Brush panel: color + size + Boil On/Off + (if on) Amplitude / Jitter / Intensity / Speed /
Variety → `project.boil` → `boilDisplacement(..., project.boil)`.

Timeline: `TimelineRowShell` (grip/eye/pill/hover/trash) is now shared — stop-motion fills it
with frame cells, Animatron fills it with clip bars. Don't reintroduce a second row
implementation for either workflow.
