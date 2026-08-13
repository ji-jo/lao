# lao handoff — for Antigravity

**Date:** 2026-07-27
**Baseline commit:** `dfbd66c` — `Export modal: gradient-hover buttons, pulsating gradients, fluid Tabs`
**Branch:** `master`
**Working tree:** clean at time of writing (only scratch files untracked — see bottom)

This file is the **entry point**, not the full history. `docs/SESSION_HANDOFF.md` has the
detailed delta for the last two commits (`144282e`, `dfbd66c`) — read it if you need to know
*why* something is built the way it is before changing it. This file exists to point you at
**what to work on next**, which `SESSION_HANDOFF.md` doesn't cover.

Read in this order: `AGENTS.md` → `docs/ARCHITECTURE.md` → `docs/MVP1_REQUIREMENTS.md` (this
one **overrides** `AGENTS.md` on UI layout where they disagree — Paper wins) →
`docs/SESSION_HANDOFF.md` → this file.

---

## Environment — the things that will bite you first

- **Repo lives on X:** (`X:\Line Animations\lao`, NTFS). **Installs: `npm install`
  only** (lockfile is `package-lock.json`). Running/tests: `bun run dev`, `bun test`.
  Never switch the installer to bun; never commit a `bun.lock`.
- **No git remote.** `git pull`/`fetch` do nothing — there's nothing to pull from. If you're a
  separate agent/session from whoever wrote this file, you're working on the **same local
  tree** (or a copy of it), not syncing through a server. Check `git log -1` and `git status`
  yourself before trusting anything below — don't assume it's still accurate.
- **Multiple agents may edit this tree concurrently.** This session (Claude) and Cursor were
  both editing files earlier in the project's history. Run `git diff` on a file before
  assuming its content matches what a handoff doc describes.
- **Dev server:** `bun run dev` → `http://localhost:5173` (canonical port; Vite picks another
  if 5173's busy — check what it actually printed).
- **Verify without a browser:** `window.__lao` (DEV only) = `{ project, playback, tools,
  selection, viewport }` zustand stores. Drive drawing via synthetic `PointerEvent`s on the
  canvas; headless/hidden tabs never fire `rAF` (stage loop falls back to `setTimeout`).
- **Hard rule learned the expensive way this session:** hover interactions in this codebase are
  **JS-state-driven** (`useState` + `onPointerEnter/Leave` → inline style), never CSS
  `:hover`/`group-hover:`. Two separate CSS-only hover implementations shipped silently broken
  this session (a `::before` class-specificity race in the timeline dock, and the fluid `Tabs`
  hover layer using an undefined `bg-hover` class) before that became the rule. If you add a new
  hover effect, copy `src/components/ui/gradient-hover-button.tsx`'s pattern.
- **Paper is the design source of truth**, read via the Paper MCP (`get_node_info`, `get_jsx`,
  `get_computed_styles`, `get_screenshot`) — never by screenshotting `app.paper.design` in a
  browser (it renders to canvas, there's no DOM). If `mcp__paper__*` tools are missing, the
  plugin likely connected mid-session; restart your agent with Paper Desktop open.

```bash
npx tsc -b     # must stay clean
bun test       # 28/28 as of this handoff
```

---

## What's already done (don't redo it)

- Stop-motion timeline: layer rows, timing bar (record dot / editable ms / collapse-layers),
  scrubbing, zoom, reorder — all Paper-matched and verified live.
- Animatron shares the **same row shell** as stop-motion (`TimelineRowShell` in
  `TimelineLayerRow.tsx`) — grip/eye/name-pill/hover-tint/trash are now identical between
  workflows. `ClipTimeline.tsx` fills that shell with clip bars instead of frame cells, and has
  the Paper `63D-0` playhead badge.
- WorkflowBar: real inline file-menu expansion (not a dropdown), Paper `106-0`.
- Export modal: full Paper `1CQ-0` redesign, live preview canvas, real fluid `Tabs` for
  Video Type/Quality, `GradientHoverButton` (pulsating bg/border-only hover) on all three
  buttons.
- Two real correctness bugs fixed (not just chrome): export cropped a non-1:1 canvas instead of
  scaling it, and Animatron paths vanished from playback/export after their clip finished
  (default fade-out easing was wrong).

---

## What D wants next (this file's actual purpose)

### 1. Onion skin — functionality gap, not just polish

**Current state** (`src/components/StageCanvas.tsx`, search `onion ghost`): draw-mode only,
shows **one ghost — the previous frame only** — on the **active layer only**, fixed opacity
0.28, fixed color `#e0504f`. No next-frame ghost, no multi-layer, no configurable range.

```ts
// StageCanvas.tsx, current onion logic (paraphrased):
if (pb.onionSkin && !pb.playing && activeLayer && !activeLayer.isStatic && ps.frameIndex > 0) {
  // only prevIdx (frameIndex - 1), only activeLayer, single ghost
}
```

The toggle itself works correctly (`Timeline.tsx`'s `SquareBtn`, `onionSkin` in
`playback.ts`, default `true`) — this is about the actual onion-skinning behavior once it's on.
Classic onion skinning is previous **and** next frame, usually in two different tints (this app
already reserves red-ish for "before" — check Paper for what "after" should look like, or ask D
if Paper doesn't spec it). Whether it should extend to all visible layers or stay active-layer-
only is also a real open question — check with D rather than guessing; the current
active-layer-only scoping might be deliberate (avoids visual noise), not an oversight.

### 2. General functionality — audit, not a specific bug

D asked for a broader functionality pass. There's no single bug filed for this — start from
`docs/ROADMAP.md`'s "Known quirks / debt" section (timeline virtualization for hundreds of
frames, resolution changes not rescaling existing strokes, eraser-on-held-cel editing earlier
frames implicitly) and `docs/ARCHITECTURE.md` for how the pieces fit together, then ask D what's
actually bothering them day-to-day rather than fixing roadmap items speculatively — the last few
sessions' pattern (see `SESSION_HANDOFF.md`) is that D's specific complaints are usually more
useful to chase than the roadmap's speculative list.

### 3. Animatron timeline restructure

**Concrete, verifiable gap:** `ClipTimeline.tsx` (Animatron) has **no equivalent of
`TimelineTimingBar.tsx`** (stop-motion's timing bar). Stop-motion has: a record-dot (auto-key
toggle), an editable ms/duration readout, cell-zoom slider, and a collapse-layers toggle, all in
a dedicated bar above the rows. Animatron's `ClipTimeline` has none of this — just a fixed
`PX_PER_MS = 0.08` constant (no zoom at all) and the bare clip-bar rows. Concretely missing,
in rough priority order:
- Any way to zoom the clip timeline in/out (stop-motion has a slider; Animatron has nothing)
- An editable duration/ms readout matching stop-motion's
- The auto-record toggle (`AMQ-0`/`6LS-0` — recall from `SESSION_HANDOFF.md` that this glyph
  appears in **both** the stop-motion and Animatron Paper mocks; only the stop-motion one got
  wired to the actual `TimingBar` component this session) surfaced somewhere in the Animatron
  view, not just stop-motion's
- Collapse-layers parity with stop-motion, if Paper specs it for Animatron too

Before building this, check Paper for whether Animatron's timing bar (under artboard `94K-0`,
per `get_basic_info`) is meant to be **the same component** as stop-motion's or a deliberately
different one — given the row-shell unification work this session, my read is "same component,
parameterized," but confirm against Paper rather than assuming.

---

## Known incomplete/deferred items (lower priority, carried from prior handoffs)

- `isLegacyVanishingEasing` (in `src/model/types.ts`) only catches the *exact* stamped default
  easing combo. If a user genuinely chose those exact numbers pre-fix, migration will
  incorrectly flip them. Small, real, unresolved false-positive surface.
- Boil scrubbers have no undo-on-pointer-up (`setBoilLive` only) — fine unless undo spam
  becomes a complaint.
- `motion/dynamic-island.tsx` and `motion/overflow-actions.tsx` are fully unused (zero
  importers, confirmed by grep) but left installed as allowed-source components. Ask D before
  deleting.
- Export modal's Quality→resolution table (`QUALITY_LONG_EDGE` in `ExportDialog.tsx`:
  720/1080/2160) is a fresh invention for the redesign, not derived from Paper — Paper `1CQ-0`
  has no visible resolution numbers. Confirm with D if specific targets matter.
- `!rounded-lg` on the Export modal's Tabs computed to **10px**, not Tailwind's usual 8px —
  untraced (customized `--radius-lg`? different Tailwind version default?). Harmless
  cosmetically, flagged in case exact-px Paper parity on that control matters later.

---

## Intentionally untracked (don't commit these)

`.tmp-*`, `tsc-out.txt` (scratch) · `.env.example`, `.claude/` (local tooling)
